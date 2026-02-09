/**
 * Model Tier Transformer Proxy Tests
 *
 * Tests for the local HTTP proxy that injects tier-gated models
 * and rewrites model names for Pro-tier accounts.
 */

import { describe, it, expect, afterEach } from 'bun:test';
import * as http from 'http';
import { ModelTierTransformerProxy } from '../../../src/cliproxy/model-tier-transformer-proxy';

const DEFAULT_FALLBACK = { 'claude-opus-4-6-thinking': 'claude-opus-4-5-thinking' };

/** Make an HTTP request to the transformer proxy */
function proxyRequest(
  port: number,
  path: string,
  body: string,
  method = 'POST'
): Promise<{ statusCode: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path, method, headers: { 'content-type': 'application/json' } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () =>
          resolve({
            statusCode: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf-8'),
            headers: res.headers,
          })
        );
        res.on('error', reject);
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/** Create an HTTP upstream mock server */
function createUpstreamMock(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void
): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ server, port });
    });
  });
}

describe('ModelTierTransformerProxy', () => {
  let proxy: ModelTierTransformerProxy | null = null;
  let upstream: { server: http.Server; port: number } | null = null;

  afterEach(() => {
    proxy?.stop();
    proxy = null;
    upstream?.server.close();
    upstream = null;
  });

  describe('lifecycle', () => {
    it('should start and bind to a random localhost port', async () => {
      proxy = new ModelTierTransformerProxy({
        fallbackMap: DEFAULT_FALLBACK,
        upstreamBaseUrl: 'https://127.0.0.1:1',
      });
      const port = await proxy.start();
      expect(port).toBeGreaterThan(0);
      expect(proxy.getPort()).toBe(port);
    });

    it('should return same port on repeated start calls', async () => {
      proxy = new ModelTierTransformerProxy({
        fallbackMap: DEFAULT_FALLBACK,
        upstreamBaseUrl: 'https://127.0.0.1:1',
      });
      const port1 = await proxy.start();
      const port2 = await proxy.start();
      expect(port1).toBe(port2);
    });

    it('should return null port before start', () => {
      proxy = new ModelTierTransformerProxy({
        fallbackMap: DEFAULT_FALLBACK,
        upstreamBaseUrl: 'https://127.0.0.1:1',
      });
      expect(proxy.getPort()).toBeNull();
    });

    it('should stop cleanly', async () => {
      proxy = new ModelTierTransformerProxy({
        fallbackMap: DEFAULT_FALLBACK,
        upstreamBaseUrl: 'https://127.0.0.1:1',
      });
      await proxy.start();
      proxy.stop();
      expect(proxy.getPort()).toBeNull();
    });

    it('should handle double stop without error', async () => {
      proxy = new ModelTierTransformerProxy({
        fallbackMap: DEFAULT_FALLBACK,
        upstreamBaseUrl: 'https://127.0.0.1:1',
      });
      await proxy.start();
      proxy.stop();
      expect(() => proxy?.stop()).not.toThrow();
    });
  });

  describe('status endpoint', () => {
    it('should respond with fallbackMap and stats on GET /__ccs/transformer', async () => {
      proxy = new ModelTierTransformerProxy({
        fallbackMap: DEFAULT_FALLBACK,
        upstreamBaseUrl: 'https://127.0.0.1:1',
      });
      const port = await proxy.start();
      const res = await proxyRequest(port, '/__ccs/transformer', '', 'GET');
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.fallbackMap).toEqual(DEFAULT_FALLBACK);
      expect(data.stats.modelListInjections).toBe(0);
      expect(data.stats.modelRewrites).toBe(0);
      expect(data.stats.passThrough).toBe(0);
    });
  });

  describe('handleModelListRequest — Record format', () => {
    it('should inject missing tier-gated models into Record<string, object>', async () => {
      upstream = await createUpstreamMock((_req, res) => {
        const body = JSON.stringify({
          models: {
            'claude-opus-4-5-thinking': { displayName: 'Claude Opus 4.5 Thinking' },
            'claude-sonnet-4-5': { displayName: 'Claude Sonnet 4.5' },
          },
        });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(body);
      });

      proxy = new ModelTierTransformerProxy({
        fallbackMap: DEFAULT_FALLBACK,
        upstreamBaseUrl: `http://127.0.0.1:${upstream.port}`,
      });
      const port = await proxy.start();

      const res = await proxyRequest(port, '/v1/fetchAvailableModels', '{}');
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);

      // Should have injected claude-opus-4-6-thinking
      expect(data.models['claude-opus-4-6-thinking']).toBeDefined();
      expect(data.models['claude-opus-4-6-thinking'].displayName).toBe('claude-opus-4-6-thinking');
      // Original models preserved
      expect(data.models['claude-opus-4-5-thinking']).toBeDefined();
      expect(data.models['claude-sonnet-4-5']).toBeDefined();
    });

    it('should not inject if model already exists in Record', async () => {
      upstream = await createUpstreamMock((_req, res) => {
        const body = JSON.stringify({
          models: {
            'claude-opus-4-6-thinking': { displayName: 'Already Present' },
          },
        });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(body);
      });

      proxy = new ModelTierTransformerProxy({
        fallbackMap: DEFAULT_FALLBACK,
        upstreamBaseUrl: `http://127.0.0.1:${upstream.port}`,
      });
      const port = await proxy.start();
      const res = await proxyRequest(port, '/v1/fetchAvailableModels', '{}');
      const data = JSON.parse(res.body);

      // Should NOT overwrite existing
      expect(data.models['claude-opus-4-6-thinking'].displayName).toBe('Already Present');
    });
  });

  describe('handleModelListRequest — Array format', () => {
    it('should inject missing tier-gated models into Array format', async () => {
      upstream = await createUpstreamMock((_req, res) => {
        const body = JSON.stringify({
          models: [{ id: 'claude-opus-4-5-thinking' }, { id: 'claude-sonnet-4-5' }],
        });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(body);
      });

      proxy = new ModelTierTransformerProxy({
        fallbackMap: DEFAULT_FALLBACK,
        upstreamBaseUrl: `http://127.0.0.1:${upstream.port}`,
      });
      const port = await proxy.start();
      const res = await proxyRequest(port, '/v1/fetchAvailableModels', '{}');
      const data = JSON.parse(res.body);

      // Should have injected the model name as a string
      expect(data.models).toContain('claude-opus-4-6-thinking');
    });

    it('should not inject if model already in Array', async () => {
      upstream = await createUpstreamMock((_req, res) => {
        const body = JSON.stringify({
          models: [{ id: 'claude-opus-4-6-thinking' }],
        });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(body);
      });

      proxy = new ModelTierTransformerProxy({
        fallbackMap: DEFAULT_FALLBACK,
        upstreamBaseUrl: `http://127.0.0.1:${upstream.port}`,
      });
      const port = await proxy.start();
      const res = await proxyRequest(port, '/v1/fetchAvailableModels', '{}');
      const data = JSON.parse(res.body);
      expect(data.models.length).toBe(1);
    });
  });

  describe('handleModelListRequest — edge cases', () => {
    it('should forward non-JSON response unchanged', async () => {
      upstream = await createUpstreamMock((_req, res) => {
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('not json');
      });

      proxy = new ModelTierTransformerProxy({
        fallbackMap: DEFAULT_FALLBACK,
        upstreamBaseUrl: `http://127.0.0.1:${upstream.port}`,
      });
      const port = await proxy.start();
      const res = await proxyRequest(port, '/v1/fetchAvailableModels', '{}');
      expect(res.body).toBe('not json');
    });

    it('should forward error response unchanged', async () => {
      upstream = await createUpstreamMock((_req, res) => {
        const body = JSON.stringify({ error: 'unauthorized' });
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(body);
      });

      proxy = new ModelTierTransformerProxy({
        fallbackMap: DEFAULT_FALLBACK,
        upstreamBaseUrl: `http://127.0.0.1:${upstream.port}`,
      });
      const port = await proxy.start();
      const res = await proxyRequest(port, '/v1/fetchAvailableModels', '{}');
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body)).toEqual({ error: 'unauthorized' });
    });
  });

  describe('handleApiRequest — model rewriting', () => {
    it('should rewrite tier-gated model to fallback', async () => {
      let receivedBody = '';

      upstream = await createUpstreamMock((req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          receivedBody = Buffer.concat(chunks).toString();
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ model: 'claude-opus-4-5-thinking', content: 'hello' }));
        });
      });

      proxy = new ModelTierTransformerProxy({
        fallbackMap: DEFAULT_FALLBACK,
        upstreamBaseUrl: `http://127.0.0.1:${upstream.port}`,
      });
      const port = await proxy.start();

      const response = await proxyRequest(
        port,
        '/v1/messages',
        JSON.stringify({ model: 'claude-opus-4-6-thinking' })
      );
      const parsed = JSON.parse(receivedBody);
      expect(parsed.model).toBe('claude-opus-4-5-thinking');

      // Response model should be rewritten back to opus-4-6
      const resBody = JSON.parse(response.body);
      expect(resBody.model).toBe('claude-opus-4-6-thinking');
    });

    it('should pass through non-matching model unchanged', async () => {
      let receivedBody = '';

      upstream = await createUpstreamMock((req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          receivedBody = Buffer.concat(chunks).toString();
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end('{"ok":true}');
        });
      });

      proxy = new ModelTierTransformerProxy({
        fallbackMap: DEFAULT_FALLBACK,
        upstreamBaseUrl: `http://127.0.0.1:${upstream.port}`,
      });
      const port = await proxy.start();

      await proxyRequest(port, '/v1/messages', JSON.stringify({ model: 'claude-sonnet-4-5' }));
      const parsed = JSON.parse(receivedBody);
      expect(parsed.model).toBe('claude-sonnet-4-5');
    });

    it('should handle malformed JSON body gracefully', async () => {
      let receivedBody = '';

      upstream = await createUpstreamMock((req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          receivedBody = Buffer.concat(chunks).toString();
          res.writeHead(200, { 'content-type': 'text/plain' });
          res.end('ok');
        });
      });

      proxy = new ModelTierTransformerProxy({
        fallbackMap: DEFAULT_FALLBACK,
        upstreamBaseUrl: `http://127.0.0.1:${upstream.port}`,
      });
      const port = await proxy.start();

      await proxyRequest(port, '/v1/messages', 'not-json-at-all');
      // Body should be forwarded unchanged
      expect(receivedBody).toBe('not-json-at-all');
    });

    it('should handle empty body gracefully', async () => {
      let receivedBody = '';

      upstream = await createUpstreamMock((req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          receivedBody = Buffer.concat(chunks).toString();
          res.writeHead(200);
          res.end();
        });
      });

      proxy = new ModelTierTransformerProxy({
        fallbackMap: DEFAULT_FALLBACK,
        upstreamBaseUrl: `http://127.0.0.1:${upstream.port}`,
      });
      const port = await proxy.start();

      await proxyRequest(port, '/v1/messages', '');
      expect(receivedBody).toBe('');
    });
  });

  describe('handleApiRequest — SSE response model rewriting', () => {
    it('should rewrite model name in SSE message_start event', async () => {
      upstream = await createUpstreamMock((_req, res) => {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        // message_start with fallback model name
        res.write(
          'event: message_start\n' +
            'data: ' +
            JSON.stringify({
              type: 'message_start',
              message: {
                id: 'msg_123',
                type: 'message',
                role: 'assistant',
                model: 'claude-opus-4-5-thinking',
                content: [],
              },
            }) +
            '\n\n'
        );
        // content delta — no model field
        res.write(
          'event: content_block_delta\n' +
            'data: ' +
            JSON.stringify({
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'text_delta', text: 'Hello' },
            }) +
            '\n\n'
        );
        res.write('data: [DONE]\n\n');
        res.end();
      });

      proxy = new ModelTierTransformerProxy({
        fallbackMap: DEFAULT_FALLBACK,
        upstreamBaseUrl: `http://127.0.0.1:${upstream.port}`,
      });
      const port = await proxy.start();

      const response = await proxyRequest(
        port,
        '/v1/messages',
        JSON.stringify({ model: 'claude-opus-4-6-thinking', stream: true })
      );

      // Parse SSE events from response
      const events = response.body
        .split('\n\n')
        .filter((e) => e.trim())
        .map((e) => {
          const dataLine = e.split('\n').find((l) => l.startsWith('data: '));
          if (!dataLine) return null;
          const json = dataLine.slice(6);
          if (json === '[DONE]') return { type: 'done' };
          try {
            return JSON.parse(json);
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      // message_start model should be rewritten to opus-4-6
      const msgStart = events.find((e: Record<string, unknown>) => e.type === 'message_start');
      expect(msgStart).toBeDefined();
      expect((msgStart as Record<string, Record<string, string>>).message.model).toBe(
        'claude-opus-4-6-thinking'
      );

      // content_block_delta should pass through unchanged
      const delta = events.find((e: Record<string, unknown>) => e.type === 'content_block_delta');
      expect(delta).toBeDefined();
    });

    it('should not rewrite SSE events when model was not rewritten in request', async () => {
      upstream = await createUpstreamMock((_req, res) => {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write(
          'event: message_start\n' +
            'data: ' +
            JSON.stringify({
              type: 'message_start',
              message: { id: 'msg_456', model: 'claude-sonnet-4-5', content: [] },
            }) +
            '\n\n'
        );
        res.write('data: [DONE]\n\n');
        res.end();
      });

      proxy = new ModelTierTransformerProxy({
        fallbackMap: DEFAULT_FALLBACK,
        upstreamBaseUrl: `http://127.0.0.1:${upstream.port}`,
      });
      const port = await proxy.start();

      const response = await proxyRequest(
        port,
        '/v1/messages',
        JSON.stringify({ model: 'claude-sonnet-4-5', stream: true })
      );

      // Should pipe through untouched (forwardAndPipe, not forwardAndRewriteModel)
      expect(response.body).toContain('claude-sonnet-4-5');
    });

    it('should rewrite model in non-streaming JSON response when model was rewritten', async () => {
      upstream = await createUpstreamMock((_req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            id: 'msg_789',
            model: 'claude-opus-4-5-thinking',
            content: [{ type: 'text', text: 'Hi' }],
          })
        );
      });

      proxy = new ModelTierTransformerProxy({
        fallbackMap: DEFAULT_FALLBACK,
        upstreamBaseUrl: `http://127.0.0.1:${upstream.port}`,
      });
      const port = await proxy.start();

      const response = await proxyRequest(
        port,
        '/v1/messages',
        JSON.stringify({ model: 'claude-opus-4-6-thinking' })
      );
      const body = JSON.parse(response.body);
      expect(body.model).toBe('claude-opus-4-6-thinking');
      expect(body.content[0].text).toBe('Hi');
    });

    it('should rewrite versioned model name in response (date suffix)', async () => {
      upstream = await createUpstreamMock((_req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        // Antigravity may return versioned model names with date suffixes
        res.end(
          JSON.stringify({
            id: 'msg_ver',
            model: 'claude-opus-4-5-20251101-thinking',
            content: [{ type: 'text', text: 'Hi' }],
          })
        );
      });

      proxy = new ModelTierTransformerProxy({
        fallbackMap: DEFAULT_FALLBACK,
        upstreamBaseUrl: `http://127.0.0.1:${upstream.port}`,
      });
      const port = await proxy.start();

      const response = await proxyRequest(
        port,
        '/v1/messages',
        JSON.stringify({ model: 'claude-opus-4-6-thinking' })
      );
      const body = JSON.parse(response.body);
      // Fuzzy match should catch the versioned name and rewrite to target
      expect(body.model).toBe('claude-opus-4-6-thinking');
    });

    it('should rewrite versioned model in SSE message_start event', async () => {
      upstream = await createUpstreamMock((_req, res) => {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write(
          'event: message_start\n' +
            'data: ' +
            JSON.stringify({
              type: 'message_start',
              message: {
                id: 'msg_ver2',
                model: 'claude-opus-4-5-20251101-thinking',
                content: [],
              },
            }) +
            '\n\n'
        );
        res.write('data: [DONE]\n\n');
        res.end();
      });

      proxy = new ModelTierTransformerProxy({
        fallbackMap: DEFAULT_FALLBACK,
        upstreamBaseUrl: `http://127.0.0.1:${upstream.port}`,
      });
      const port = await proxy.start();

      const response = await proxyRequest(
        port,
        '/v1/messages',
        JSON.stringify({ model: 'claude-opus-4-6-thinking', stream: true })
      );

      const events = response.body
        .split('\n\n')
        .filter((e) => e.trim())
        .map((e) => {
          const dataLine = e.split('\n').find((l) => l.startsWith('data: '));
          if (!dataLine) return null;
          const json = dataLine.slice(6);
          if (json === '[DONE]') return { type: 'done' };
          try {
            return JSON.parse(json);
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      const msgStart = events.find((e: Record<string, unknown>) => e.type === 'message_start');
      expect(msgStart).toBeDefined();
      expect((msgStart as Record<string, Record<string, string>>).message.model).toBe(
        'claude-opus-4-6-thinking'
      );
    });

    it('should rewrite response.modelVersion in Antigravity SSE format', async () => {
      upstream = await createUpstreamMock((_req, res) => {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        // Antigravity native format nests under "response": { "modelVersion": "..." }
        // CLIProxy translator reads gjson path "response.modelVersion"
        res.write(
          'data: ' +
            JSON.stringify({
              response: {
                candidates: [{ content: { parts: [{ text: 'Hello' }] } }],
                modelVersion: 'claude-opus-4-5-thinking',
                usageMetadata: { promptTokenCount: 10 },
              },
            }) +
            '\n\n'
        );
        res.write('data: [DONE]\n\n');
        res.end();
      });

      proxy = new ModelTierTransformerProxy({
        fallbackMap: DEFAULT_FALLBACK,
        upstreamBaseUrl: `http://127.0.0.1:${upstream.port}`,
      });
      const port = await proxy.start();

      const response = await proxyRequest(
        port,
        '/v1/messages',
        JSON.stringify({ model: 'claude-opus-4-6-thinking', stream: true })
      );

      // Parse SSE events
      const events = response.body
        .split('\n\n')
        .filter((e) => e.trim())
        .map((e) => {
          const dataLine = e.split('\n').find((l) => l.startsWith('data: '));
          if (!dataLine) return null;
          const json = dataLine.slice(6);
          if (json === '[DONE]') return { type: 'done' };
          try {
            return JSON.parse(json);
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      // response.modelVersion should be rewritten to opus-4-6
      const antigravityEvent = events.find(
        (e: Record<string, unknown>) =>
          e.response && typeof (e.response as Record<string, unknown>).modelVersion === 'string'
      );
      expect(antigravityEvent).toBeDefined();
      expect(
        ((antigravityEvent as Record<string, unknown>).response as Record<string, string>)
          .modelVersion
      ).toBe('claude-opus-4-6-thinking');
    });

    it('should rewrite response.modelVersion in Antigravity non-streaming JSON', async () => {
      upstream = await createUpstreamMock((_req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        // Antigravity non-streaming: nests under "response"
        res.end(
          JSON.stringify({
            response: {
              candidates: [{ content: { parts: [{ text: 'Hi' }] }, finishReason: 'STOP' }],
              modelVersion: 'claude-opus-4-5-20251101-thinking',
              usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 10 },
            },
          })
        );
      });

      proxy = new ModelTierTransformerProxy({
        fallbackMap: DEFAULT_FALLBACK,
        upstreamBaseUrl: `http://127.0.0.1:${upstream.port}`,
      });
      const port = await proxy.start();

      const response = await proxyRequest(
        port,
        '/v1/messages',
        JSON.stringify({ model: 'claude-opus-4-6-thinking' })
      );
      const body = JSON.parse(response.body);
      // response.modelVersion should be rewritten (fuzzy match catches date suffix)
      expect(body.response.modelVersion).toBe('claude-opus-4-6-thinking');
      // candidates should be preserved
      expect(body.response.candidates[0].content.parts[0].text).toBe('Hi');
    });

    it('should track responseRewrites in stats', async () => {
      upstream = await createUpstreamMock((req, res) => {
        const url = req.url ?? '';
        if (url.endsWith('/fetchAvailableModels')) {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ models: {} }));
        } else {
          const chunks: Buffer[] = [];
          req.on('data', (c: Buffer) => chunks.push(c));
          req.on('end', () => {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ model: 'claude-opus-4-5-thinking', ok: true }));
          });
        }
      });

      proxy = new ModelTierTransformerProxy({
        fallbackMap: DEFAULT_FALLBACK,
        upstreamBaseUrl: `http://127.0.0.1:${upstream.port}`,
      });
      const port = await proxy.start();

      // Trigger response rewrite
      await proxyRequest(
        port,
        '/v1/messages',
        JSON.stringify({ model: 'claude-opus-4-6-thinking' })
      );

      const statsRes = await proxyRequest(port, '/__ccs/transformer', '', 'GET');
      const stats = JSON.parse(statsRes.body).stats;
      expect(stats.responseRewrites).toBe(1);
    });
  });

  describe('URL path matching', () => {
    it('should match fetchAvailableModels at end of path (slash separator)', async () => {
      upstream = await createUpstreamMock((_req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ models: {} }));
      });

      proxy = new ModelTierTransformerProxy({
        fallbackMap: DEFAULT_FALLBACK,
        upstreamBaseUrl: `http://127.0.0.1:${upstream.port}`,
      });
      const port = await proxy.start();
      const res = await proxyRequest(port, '/v1beta/fetchAvailableModels', '{}');
      expect(res.statusCode).toBe(200);
    });

    it('should match fetchAvailableModels with colon separator (CLIProxy format)', async () => {
      upstream = await createUpstreamMock((_req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ models: {} }));
      });

      proxy = new ModelTierTransformerProxy({
        fallbackMap: DEFAULT_FALLBACK,
        upstreamBaseUrl: `http://127.0.0.1:${upstream.port}`,
      });
      const port = await proxy.start();

      // CLIProxy sends /v1internal:fetchAvailableModels (colon, not slash)
      const res = await proxyRequest(port, '/v1internal:fetchAvailableModels', '{}');
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      // Should inject the ultra model into the empty model list
      expect(data.models['claude-opus-4-6-thinking']).toBeDefined();
    });

    it('should NOT match fetchAvailableModels as substring in path', async () => {
      let requestedPath = '';

      upstream = await createUpstreamMock((req, res) => {
        requestedPath = req.url ?? '';
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end('{"ok":true}');
        });
      });

      proxy = new ModelTierTransformerProxy({
        fallbackMap: DEFAULT_FALLBACK,
        upstreamBaseUrl: `http://127.0.0.1:${upstream.port}`,
      });
      const port = await proxy.start();
      // Path that contains fetchAvailableModels but doesn't end with it
      await proxyRequest(
        port,
        '/v1/fetchAvailableModels/extra',
        JSON.stringify({ model: 'claude-opus-4-6-thinking' })
      );
      // Should be handled as API request (model rewrite path), not model list
      expect(requestedPath).toBe('/v1/fetchAvailableModels/extra');
    });
  });

  describe('stats tracking', () => {
    it('should track injection, rewrite, responseRewrite, and passthrough stats', async () => {
      upstream = await createUpstreamMock((req, res) => {
        const url = req.url ?? '';
        if (url.endsWith('/fetchAvailableModels')) {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ models: {} }));
        } else {
          const chunks: Buffer[] = [];
          req.on('data', (c: Buffer) => chunks.push(c));
          req.on('end', () => {
            const body = JSON.parse(Buffer.concat(chunks).toString());
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ model: body.model, ok: true }));
          });
        }
      });

      proxy = new ModelTierTransformerProxy({
        fallbackMap: DEFAULT_FALLBACK,
        upstreamBaseUrl: `http://127.0.0.1:${upstream.port}`,
      });
      const port = await proxy.start();

      // Trigger model list injection
      await proxyRequest(port, '/v1/fetchAvailableModels', '{}');
      // Trigger model rewrite + response rewrite
      await proxyRequest(port, '/v1/messages', JSON.stringify({ model: 'claude-opus-4-6-thinking' }));
      // Trigger passthrough
      await proxyRequest(port, '/v1/messages', JSON.stringify({ model: 'claude-sonnet-4-5' }));

      const statsRes = await proxyRequest(port, '/__ccs/transformer', '', 'GET');
      const stats = JSON.parse(statsRes.body).stats;
      expect(stats.modelListInjections).toBe(1);
      expect(stats.modelRewrites).toBe(1);
      expect(stats.responseRewrites).toBe(1);
      expect(stats.passThrough).toBe(1);
    });
  });
});
