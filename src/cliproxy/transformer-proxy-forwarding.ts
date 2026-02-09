/**
 * Transformer Proxy Forwarding Utilities
 *
 * HTTP forwarding helpers for the model tier transformer proxy.
 * Extracted to keep the main proxy file focused on routing logic.
 */

import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

/** Hop-by-hop headers that should not be forwarded */
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
]);

/** Maximum request body size (50MB) — defensive limit for localhost proxy */
const MAX_BODY_SIZE = 50 * 1024 * 1024;

/** Maximum response body size (10MB) — model list responses are typically <50KB */
const MAX_RESPONSE_SIZE = 10 * 1024 * 1024;

/**
 * Read full request body as a string.
 * Rejects with 413 if body exceeds MAX_BODY_SIZE.
 */
export function readRequestBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;
    let destroyed = false;
    req.on('data', (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > MAX_BODY_SIZE) {
        destroyed = true;
        req.destroy(new Error('Request body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!destroyed) resolve(Buffer.concat(chunks).toString('utf-8'));
    });
    req.on('error', reject);
  });
}

/**
 * Build headers to forward to upstream.
 * Strips hop-by-hop headers, recalculates content-length.
 * @param options.stripAcceptEncoding Strip accept-encoding header (default: true).
 *   Set to false for streaming paths where compressed bytes are piped directly.
 */
export function buildForwardHeaders(
  originalHeaders: http.IncomingHttpHeaders,
  body: string,
  options?: { stripAcceptEncoding?: boolean }
): Record<string, string> {
  const stripEncoding = options?.stripAcceptEncoding ?? true;
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(originalHeaders)) {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) continue;
    if (key.toLowerCase() === 'host') continue;
    if (key.toLowerCase() === 'content-length') continue;
    // Strip accept-encoding to prevent gzip responses in buffered path
    // (forwardAndBuffer parses response as UTF-8 string, gzip bytes would corrupt JSON)
    if (stripEncoding && key.toLowerCase() === 'accept-encoding') continue;
    if (value !== undefined) {
      headers[key] = Array.isArray(value) ? value.join(', ') : value;
    }
  }
  headers['content-length'] = String(Buffer.byteLength(body));
  return headers;
}

/** Buffered upstream response */
export interface BufferedResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

/**
 * Forward request to upstream and buffer the entire response.
 * Used for model list responses that need modification.
 */
export function forwardAndBuffer(
  upstreamUrl: URL,
  method: string,
  headers: Record<string, string>,
  body: string,
  timeoutMs: number
): Promise<BufferedResponse> {
  return new Promise((resolve, reject) => {
    const isHttp = upstreamUrl.protocol === 'http:';
    const transport = isHttp ? http : https;
    const upstreamReq = transport.request(
      {
        hostname: upstreamUrl.hostname,
        port: upstreamUrl.port || (isHttp ? 80 : 443),
        path: upstreamUrl.pathname + upstreamUrl.search,
        method,
        headers,
        timeout: timeoutMs,
      },
      (upstreamRes) => {
        const chunks: Buffer[] = [];
        let totalSize = 0;
        let destroyed = false;
        upstreamRes.on('data', (chunk: Buffer) => {
          totalSize += chunk.length;
          if (totalSize > MAX_RESPONSE_SIZE) {
            destroyed = true;
            upstreamRes.destroy(new Error('Response body too large'));
            return;
          }
          chunks.push(chunk);
        });
        upstreamRes.on('end', () => {
          if (destroyed) return;
          const responseHeaders: Record<string, string> = {};
          for (const [key, value] of Object.entries(upstreamRes.headers)) {
            if (value !== undefined) {
              responseHeaders[key] = Array.isArray(value) ? value.join(', ') : value;
            }
          }
          resolve({
            statusCode: upstreamRes.statusCode ?? 502,
            headers: responseHeaders,
            body: Buffer.concat(chunks).toString('utf-8'),
          });
        });
        upstreamRes.on('error', reject);
      }
    );

    upstreamReq.on('timeout', () => upstreamReq.destroy(new Error('Upstream timeout')));
    upstreamReq.on('error', reject);
    upstreamReq.write(body);
    upstreamReq.end();
  });
}

/**
 * Forward request to upstream and pipe the response directly to client.
 * SSE streaming safe — no buffering, uses pipe().
 */
export function forwardAndPipe(
  upstreamUrl: URL,
  method: string,
  headers: Record<string, string>,
  body: string,
  clientRes: http.ServerResponse,
  timeoutMs: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const isHttp = upstreamUrl.protocol === 'http:';
    const transport = isHttp ? http : https;
    const upstreamReq = transport.request(
      {
        hostname: upstreamUrl.hostname,
        port: upstreamUrl.port || (isHttp ? 80 : 443),
        path: upstreamUrl.pathname + upstreamUrl.search,
        method,
        headers,
        timeout: timeoutMs,
      },
      (upstreamRes) => {
        clientRes.writeHead(upstreamRes.statusCode ?? 200, upstreamRes.headers);
        upstreamRes.pipe(clientRes);
        upstreamRes.on('end', resolve);
        upstreamRes.on('error', reject);
        // Clean up upstream connection if client disconnects mid-stream
        clientRes.on('close', () => {
          if (!upstreamRes.complete) {
            upstreamRes.destroy();
          }
        });
      }
    );

    upstreamReq.on('timeout', () => upstreamReq.destroy(new Error('Upstream timeout')));
    upstreamReq.on('error', (err) => {
      if (!clientRes.headersSent) {
        clientRes.writeHead(502, { 'Content-Type': 'text/plain' });
        clientRes.end('Upstream error');
      }
      reject(err);
    });
    upstreamReq.write(body);
    upstreamReq.end();
  });
}

/** Model rewrite mapping for response transformation */
export interface ModelRewrite {
  /** Model name to find in response (the fallback model sent upstream) */
  from: string;
  /** Model name to replace with (the original model the client requested) */
  to: string;
}

/**
 * Check if a response model name matches the "from" model for rewriting.
 * Uses fuzzy matching: matches exact name OR versioned variants (e.g.,
 * "claude-opus-4-5-20251101-thinking" matches "claude-opus-4-5-thinking").
 *
 * The Antigravity API may return versioned model names (with date suffixes)
 * that don't exactly match the short model name we sent in the request.
 */
function modelMatchesFrom(responseModel: string, from: string): boolean {
  if (responseModel === from) return true;

  // Strip -thinking suffix for base comparison, then check if response base
  // starts with the from base (handles date-versioned variants)
  const thinkingSuffix = '-thinking';
  const fromHasThinking = from.endsWith(thinkingSuffix);
  const respHasThinking = responseModel.endsWith(thinkingSuffix);

  // Both must agree on thinking suffix
  if (fromHasThinking !== respHasThinking) return false;

  const fromBase = fromHasThinking ? from.slice(0, -thinkingSuffix.length) : from;
  const respBase = respHasThinking ? responseModel.slice(0, -thinkingSuffix.length) : responseModel;

  // Response base starts with from base (covers date-versioned variants)
  return respBase.startsWith(fromBase);
}

/**
 * Rewrite a single SSE event's data line, replacing the model name.
 * Handles BOTH formats since the transformer sits between CLIProxy and Antigravity:
 * - Antigravity native format: `{ response: { modelVersion: "claude-opus-4-5-..." } }`
 * - Antigravity flat format (fallback): `{ modelVersion: "claude-opus-4-5-..." }`
 * - Anthropic format (fallback): `{ type: "message_start", message: { model: "..." } }`
 * Non-data lines and other events pass through unchanged.
 */
function rewriteSSEEvent(event: string, rewrite: ModelRewrite): string {
  const lines = event.split('\n');
  const processed: string[] = [];

  for (const line of lines) {
    if (!line.startsWith('data: ')) {
      processed.push(line);
      continue;
    }

    const jsonStr = line.slice(6);
    if (jsonStr.trim() === '[DONE]') {
      processed.push(line);
      continue;
    }

    try {
      const data = JSON.parse(jsonStr);
      if (!data || typeof data !== 'object') {
        processed.push(line);
        continue;
      }

      let rewritten = false;
      const resp = data.response;

      // Antigravity nested format: { response: { modelVersion: "..." } }
      // CLIProxy translator reads gjson path "response.modelVersion" to set message.model
      if (
        resp &&
        typeof resp === 'object' &&
        typeof resp.modelVersion === 'string' &&
        modelMatchesFrom(resp.modelVersion, rewrite.from)
      ) {
        resp.modelVersion = rewrite.to;
        rewritten = true;
      }

      // Antigravity flat format (fallback): top-level modelVersion
      if (
        !rewritten &&
        typeof data.modelVersion === 'string' &&
        modelMatchesFrom(data.modelVersion, rewrite.from)
      ) {
        data.modelVersion = rewrite.to;
        rewritten = true;
      }

      // Anthropic format: message_start event with message.model
      if (
        data.type === 'message_start' &&
        data.message &&
        typeof data.message.model === 'string' &&
        modelMatchesFrom(data.message.model, rewrite.from)
      ) {
        data.message.model = rewrite.to;
        rewritten = true;
      }

      // Anthropic format: top-level model field (message_delta, etc.)
      if (typeof data.model === 'string' && modelMatchesFrom(data.model, rewrite.from)) {
        data.model = rewrite.to;
        rewritten = true;
      }

      if (rewritten) {
        processed.push('data: ' + JSON.stringify(data));
      } else {
        processed.push(line);
      }
    } catch {
      // Not valid JSON — pass through
      processed.push(line);
    }
  }

  return processed.join('\n');
}

/**
 * Forward request to upstream with SSE-aware response model rewriting.
 *
 * Follows the tool-sanitization-proxy SSE pattern: split on '\n\n' boundaries,
 * parse data lines, rewrite the model name in message_start events, forward
 * everything else unchanged. Handles both SSE and non-streaming JSON responses.
 */
export function forwardAndRewriteModel(
  upstreamUrl: URL,
  method: string,
  headers: Record<string, string>,
  body: string,
  clientRes: http.ServerResponse,
  timeoutMs: number,
  rewrite: ModelRewrite,
  log?: (msg: string) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const isHttp = upstreamUrl.protocol === 'http:';
    const transport = isHttp ? http : https;
    const upstreamReq = transport.request(
      {
        hostname: upstreamUrl.hostname,
        port: upstreamUrl.port || (isHttp ? 80 : 443),
        path: upstreamUrl.pathname + upstreamUrl.search,
        method,
        headers,
        timeout: timeoutMs,
      },
      (upstreamRes) => {
        const contentType = upstreamRes.headers['content-type'] || '';
        const isSSE = contentType.includes('text/event-stream');

        if (!isSSE) {
          // Non-streaming JSON response — buffer, rewrite model, forward
          const chunks: Buffer[] = [];
          upstreamRes.on('data', (chunk: Buffer) => chunks.push(chunk));
          upstreamRes.on('end', () => {
            try {
              const raw = Buffer.concat(chunks).toString('utf-8');
              const data = JSON.parse(raw);
              if (data && typeof data === 'object') {
                const resp = data.response;
                // Antigravity nested format: { response: { modelVersion: "..." } }
                if (
                  resp &&
                  typeof resp === 'object' &&
                  typeof resp.modelVersion === 'string' &&
                  modelMatchesFrom(resp.modelVersion, rewrite.from)
                ) {
                  resp.modelVersion = rewrite.to;
                  log?.(
                    `Response model rewritten (JSON response.modelVersion): ${rewrite.from} -> ${rewrite.to}`
                  );
                }
                // Antigravity flat format (fallback): top-level modelVersion
                if (
                  typeof data.modelVersion === 'string' &&
                  modelMatchesFrom(data.modelVersion, rewrite.from)
                ) {
                  data.modelVersion = rewrite.to;
                  log?.(
                    `Response model rewritten (JSON modelVersion): ${rewrite.from} -> ${rewrite.to}`
                  );
                }
                // Anthropic format: model field
                if (typeof data.model === 'string' && modelMatchesFrom(data.model, rewrite.from)) {
                  data.model = rewrite.to;
                  log?.(`Response model rewritten (JSON model): ${rewrite.from} -> ${rewrite.to}`);
                }
              }
              const modified = JSON.stringify(data);
              const {
                'content-encoding': _ce,
                'content-length': _cl,
                ...cleanHeaders
              } = upstreamRes.headers as Record<string, string>;
              clientRes.writeHead(upstreamRes.statusCode ?? 200, {
                ...cleanHeaders,
                'content-length': String(Buffer.byteLength(modified)),
              });
              clientRes.end(modified);
            } catch {
              // Parse failed — forward raw
              clientRes.writeHead(upstreamRes.statusCode ?? 200, upstreamRes.headers);
              clientRes.end(Buffer.concat(chunks));
            }
            resolve();
          });
          upstreamRes.on('error', reject);
          return;
        }

        // SSE streaming — rewrite model in events, forward immediately
        clientRes.writeHead(upstreamRes.statusCode ?? 200, upstreamRes.headers);

        let buffer = '';
        let rewritten = false;

        upstreamRes.on('data', (chunk: Buffer) => {
          buffer += chunk.toString('utf8');

          // Split on SSE event boundaries
          const events = buffer.split('\n\n');
          buffer = events.pop() || ''; // Keep incomplete event

          for (const event of events) {
            if (!event.trim()) continue;

            const processed = rewriteSSEEvent(event, rewrite);
            if (!rewritten && processed !== event) {
              rewritten = true;
              log?.(`Response model rewritten (SSE): ${rewrite.from} -> ${rewrite.to}`);
            }
            clientRes.write(processed + '\n\n');
          }
        });

        upstreamRes.on('end', () => {
          try {
            if (buffer.trim()) {
              const processed = rewriteSSEEvent(buffer, rewrite);
              clientRes.write(processed + '\n\n');
            }
            clientRes.end();
          } catch {
            // Client may have disconnected
          }
          resolve();
        });

        upstreamRes.on('error', reject);

        // Clean up upstream if client disconnects mid-stream
        clientRes.on('close', () => {
          if (!upstreamRes.complete) {
            upstreamRes.destroy();
          }
        });
      }
    );

    upstreamReq.on('timeout', () => upstreamReq.destroy(new Error('Upstream timeout')));
    upstreamReq.on('error', (err) => {
      if (!clientRes.headersSent) {
        clientRes.writeHead(502, { 'Content-Type': 'text/plain' });
        clientRes.end('Upstream error');
      }
      reject(err);
    });
    upstreamReq.write(body);
    upstreamReq.end();
  });
}
