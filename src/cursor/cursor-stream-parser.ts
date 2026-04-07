/**
 * Cursor Streaming Frame Parser
 * Incrementally parses ConnectRPC frames from arbitrary chunk boundaries
 */

import * as zlib from 'zlib';
import { COMPRESS_FLAG } from './cursor-protobuf-schema.js';
import { extractTextFromResponse } from './cursor-protobuf-decoder.js';

/** Frame parsing result types */
export type FrameResult =
  | { type: 'error'; message: string; status: number; errorType: string }
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | {
      type: 'toolCall';
      toolCall: {
        id: string;
        type: string;
        function: { name: string; arguments: string };
        isLast: boolean;
      };
    };

/**
 * Decompress payload if gzip-compressed.
 * Skips decompression for JSON error payloads.
 * NOTE: Uses synchronous gzip for single-request CLI tool. Async not warranted for small payloads.
 */
export function decompressPayload(payload: Buffer, flags: number): Buffer {
  if (payload.length > 10 && payload[0] === 0x7b && payload[1] === 0x22) {
    try {
      const text = payload.toString('utf-8');
      if (text.startsWith('{"error"')) return payload;
    } catch {
      // Not JSON, continue
    }
  }

  if (
    flags === COMPRESS_FLAG.GZIP ||
    flags === COMPRESS_FLAG.GZIP_ALT ||
    flags === COMPRESS_FLAG.GZIP_BOTH
  ) {
    try {
      return zlib.gunzipSync(payload);
    } catch (err) {
      if (process.env.CCS_DEBUG) {
        console.error('[cursor] gzip decompression failed:', err);
      }
      return Buffer.alloc(0);
    }
  }
  return payload;
}

/**
 * Incrementally parses ConnectRPC frames from arbitrary chunk boundaries.
 *
 * Usage:
 *   const parser = new StreamingFrameParser();
 *   req.on('data', (chunk) => {
 *     for (const frame of parser.push(chunk)) { handle(frame); }
 *   });
 */
export class StreamingFrameParser {
  private buffer: Buffer = Buffer.alloc(0);

  /** Feed a new chunk. Returns zero or more parsed frames. */
  push(chunk: Buffer): FrameResult[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const results: FrameResult[] = [];

    while (this.buffer.length >= 5) {
      const length = this.buffer.readUInt32BE(1);
      const frameSize = 5 + length;
      if (this.buffer.length < frameSize) break;

      const flags = this.buffer[0];
      const rawPayload = this.buffer.subarray(5, frameSize);
      this.buffer = this.buffer.subarray(frameSize);

      const payload = decompressPayload(rawPayload, flags);

      // Check for JSON error
      try {
        const text = payload.toString('utf-8');
        if (text.startsWith('{') && text.includes('"error"')) {
          const json = JSON.parse(text);
          const msg =
            json?.error?.details?.[0]?.debug?.details?.title ||
            json?.error?.details?.[0]?.debug?.details?.detail ||
            json?.error?.message ||
            'API Error';
          const isRateLimit = json?.error?.code === 'resource_exhausted';
          results.push({
            type: 'error',
            message: msg,
            status: isRateLimit ? 429 : 400,
            errorType: isRateLimit ? 'rate_limit_error' : 'api_error',
          });
          return results;
        }
      } catch {
        // Not JSON, continue to protobuf parsing
      }

      const result = extractTextFromResponse(new Uint8Array(payload));

      if (result.error) {
        const errorLower = result.error.toLowerCase();
        const isRateLimit =
          errorLower.includes('rate limit') ||
          errorLower.includes('resource_exhausted') ||
          errorLower.includes('too many requests');
        results.push({
          type: 'error',
          message: result.error,
          status: isRateLimit ? 429 : 400,
          errorType: isRateLimit ? 'rate_limit_error' : 'server_error',
        });
        return results;
      }

      if (result.toolCall) results.push({ type: 'toolCall', toolCall: result.toolCall });
      if (result.text) results.push({ type: 'text', text: result.text });
      if (result.thinking) results.push({ type: 'thinking', text: result.thinking });
    }

    return results;
  }

  hasPartial(): boolean {
    return this.buffer.length > 0;
  }
}
