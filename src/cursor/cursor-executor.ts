/**
 * Cursor Executor
 * Handles HTTP/2 requests to Cursor API with protobuf encoding/decoding
 */

import type { IncomingHttpHeaders } from 'http';
import { generateCursorBody, extractTextFromResponse } from './cursor-protobuf.js';
import { buildCursorRequest } from './cursor-translator.js';
import type { CursorTool, CursorApiCredentials } from './cursor-protobuf-schema.js';
import { buildCursorConnectHeaders, generateCursorChecksum } from './cursor-client-policy.js';

import { StreamingFrameParser, decompressPayload } from './cursor-stream-parser.js';

/** Executor parameters */
interface ExecutorParams {
  model: string;
  body: {
    messages: Array<{
      role: string;
      content: string | Array<{ type: string; text?: string }>;
      name?: string;
      tool_call_id?: string;
      tool_calls?: Array<{
        id: string;
        type: string;
        function: { name: string; arguments: string };
      }>;
    }>;
    tools?: CursorTool[];
    reasoning_effort?: string;
  };
  stream: boolean;
  credentials: CursorApiCredentials;
  signal?: AbortSignal;
}

/** HTTP/2 response structure */
interface Http2Response {
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

/** Lazy import http2 */
let http2Module: typeof import('http2') | null = null;
async function getHttp2() {
  if (http2Module) return http2Module;
  try {
    http2Module = await import('http2');
    return http2Module;
  } catch (err) {
    if (process.env.CCS_DEBUG) {
      console.error('[cursor] http2 module not available, falling back to fetch:', err);
    }
    return null;
  }
}

/**
 * Create error response from JSON error
 */
function createErrorResponse(jsonError: {
  error?: {
    code?: string;
    message?: string;
    details?: Array<{ debug?: { details?: { title?: string; detail?: string }; error?: string } }>;
  };
}): Response {
  const errorMsg =
    jsonError?.error?.details?.[0]?.debug?.details?.title ||
    jsonError?.error?.details?.[0]?.debug?.details?.detail ||
    jsonError?.error?.message ||
    'API Error';

  const isRateLimit = jsonError?.error?.code === 'resource_exhausted';

  return new Response(
    JSON.stringify({
      error: {
        message: errorMsg,
        type: isRateLimit ? 'rate_limit_error' : 'api_error',
        code: jsonError?.error?.details?.[0]?.debug?.error || 'unknown',
      },
    }),
    {
      status: isRateLimit ? 429 : 400,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

export class CursorExecutor {
  private readonly baseUrl = 'https://api2.cursor.sh';
  private readonly chatPath = '/aiserver.v1.AiService/StreamChat';

  buildUrl(): string {
    return `${this.baseUrl}${this.chatPath}`;
  }

  /**
   * Generate checksum using Jyh cipher (time-based XOR with rolling key seed=165)
   */
  generateChecksum(machineId: string): string {
    return generateCursorChecksum(machineId);
  }

  buildHeaders(credentials: CursorApiCredentials): Record<string, string> {
    return buildCursorConnectHeaders(credentials);
  }

  transformRequest(
    model: string,
    body: ExecutorParams['body'],
    stream: boolean,
    credentials: CursorApiCredentials
  ): Uint8Array {
    const translatedBody = buildCursorRequest(model, body, stream, credentials);
    const messages = translatedBody.messages || [];
    const tools = (translatedBody.tools || body.tools || []) as CursorTool[];
    const reasoningEffort = body.reasoning_effort || null;
    return generateCursorBody(messages, model, tools, reasoningEffort);
  }

  async makeFetchRequest(
    url: string,
    headers: Record<string, string>,
    body: Uint8Array,
    signal?: AbortSignal
  ): Promise<Http2Response> {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal,
    });

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return {
      status: response.status,
      headers: responseHeaders,
      body: Buffer.from(await response.arrayBuffer()),
    };
  }

  async makeHttp2Request(
    url: string,
    headers: Record<string, string>,
    body: Uint8Array,
    signal?: AbortSignal
  ): Promise<Http2Response> {
    const http2 = await getHttp2();
    if (!http2) {
      throw new Error('http2 module not available');
    }

    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const client = http2.connect(`https://${urlObj.host}`);
      const chunks: Buffer[] = [];
      let responseHeaders: IncomingHttpHeaders = {};

      client.on('error', (err) => {
        client.close();
        reject(err);
      });

      const req = client.request({
        ':method': 'POST',
        ':path': urlObj.pathname,
        ':authority': urlObj.host,
        ':scheme': 'https',
        ...headers,
      });

      req.on('response', (hdrs) => {
        responseHeaders = hdrs;
      });
      req.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });
      req.on('end', () => {
        client.close();
        resolve({
          status: Number(responseHeaders[':status']) || 500,
          headers: responseHeaders,
          body: Buffer.concat(chunks),
        });
      });
      req.on('error', (err) => {
        client.close();
        reject(err);
      });

      if (signal) {
        const onAbort = () => {
          req.close();
          client.close();
          reject(new Error('Request aborted'));
        };
        signal.addEventListener('abort', onAbort, { once: true });

        const cleanup = () => {
          signal.removeEventListener('abort', onAbort);
        };
        req.on('end', cleanup);
        req.on('error', cleanup);
      }

      req.write(body);
      req.end();
    });
  }

  async execute(params: ExecutorParams): Promise<{
    response: Response;
    url: string;
    headers: Record<string, string>;
    transformedBody: ExecutorParams['body'];
  }> {
    const { model, body, stream, credentials, signal } = params;
    const url = this.buildUrl();
    const headers = this.buildHeaders(credentials);
    const transformedBody = this.transformRequest(model, body, stream, credentials);

    try {
      // Streaming requests use incremental HTTP/2 → SSE pipeline
      if (stream) {
        const response = await this.executeStreaming(
          url,
          headers,
          transformedBody,
          model,
          body,
          signal
        );
        return { response, url, headers, transformedBody: body };
      }

      // Non-streaming: buffer entire response then transform to JSON
      const http2 = await getHttp2();
      const response = http2
        ? await this.makeHttp2Request(url, headers, transformedBody, signal)
        : await this.makeFetchRequest(url, headers, transformedBody, signal);

      if (response.status !== 200) {
        const errorText = response.body?.toString() || 'Unknown error';
        const errorResponse = new Response(
          JSON.stringify({
            error: {
              message: `[${response.status}]: ${errorText}`,
              type: 'invalid_request_error',
              code: '',
            },
          }),
          {
            status: response.status,
            headers: { 'Content-Type': 'application/json' },
          }
        );
        return { response: errorResponse, url, headers, transformedBody: body };
      }

      const transformedResponse = this.transformProtobufToJSON(response.body, model, body);
      return { response: transformedResponse, url, headers, transformedBody: body };
    } catch (error) {
      const errorResponse = new Response(
        JSON.stringify({
          error: {
            message: (error as Error).message,
            type: 'connection_error',
            code: '',
          },
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
      return { response: errorResponse, url, headers, transformedBody: body };
    }
  }

  /**
   * Execute a streaming request, piping HTTP/2 data events through
   * StreamingFrameParser for incremental SSE output.
   * Falls back to buffered transformProtobufToSSE when http2 is unavailable.
   */
  private async executeStreaming(
    url: string,
    headers: Record<string, string>,
    body: Uint8Array,
    model: string,
    requestBody: ExecutorParams['body'],
    signal?: AbortSignal
  ): Promise<Response> {
    const http2 = await getHttp2();
    if (!http2) {
      const response = await this.makeFetchRequest(url, headers, body, signal);
      if (response.status !== 200) {
        const errorText = response.body?.toString() || 'Unknown error';
        return new Response(
          JSON.stringify({
            error: {
              message: `[${response.status}]: ${errorText}`,
              type: response.status === 429 ? 'rate_limit_error' : 'invalid_request_error',
              code: '',
            },
          }),
          { status: response.status, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return this.transformProtobufToSSE(response.body, model, requestBody);
    }

    const responseId = `chatcmpl-cursor-${Date.now()}`;
    const created = Math.floor(Date.now() / 1000);

    return new Promise((resolve, reject) => {
      let settled = false;
      const resolveOnce = (response: Response) => {
        if (settled) return;
        settled = true;
        resolve(response);
      };
      const rejectOnce = (error: Error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };

      const urlObj = new URL(url);
      const client = http2.connect(`https://${urlObj.host}`);

      client.on('error', (err) => {
        client.close();
        rejectOnce(err instanceof Error ? err : new Error(String(err)));
      });

      const req = client.request({
        ':method': 'POST',
        ':path': urlObj.pathname,
        ':authority': urlObj.host,
        ':scheme': 'https',
        ...headers,
      });

      // Register abort before response headers arrive so cancellation works at all stages
      let streamClosed = false;
      let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
      if (signal) {
        const onAbort = () => {
          streamClosed = true;

          // If stream already started, close readable to unblock consumers.
          if (streamController) {
            try {
              streamController.close();
            } catch {
              /* already closed */
            }
          }

          req.close();
          client.close();
          rejectOnce(new Error('Request aborted'));
        };

        signal.addEventListener('abort', onAbort, { once: true });
        const cleanup = () => signal.removeEventListener('abort', onAbort);
        req.on('end', cleanup);
        req.on('error', cleanup);
      }

      req.on('response', (hdrs) => {
        const status = Number(hdrs[':status']) || 500;

        if (status !== 200) {
          const errorChunks: Buffer[] = [];
          req.on('data', (c: Buffer) => errorChunks.push(c));
          req.on('end', () => {
            client.close();
            const errorText = Buffer.concat(errorChunks).toString();
            resolveOnce(
              new Response(
                JSON.stringify({
                  error: {
                    message: `[${status}]: ${errorText}`,
                    type: status === 429 ? 'rate_limit_error' : 'invalid_request_error',
                    code: '',
                  },
                }),
                { status, headers: { 'Content-Type': 'application/json' } }
              )
            );
          });
          return;
        }

        // Status 200: set up incremental streaming pipeline
        const parser = new StreamingFrameParser();
        const enc = new TextEncoder();
        const toolCallsMap = new Map<
          string,
          {
            id: string;
            type: string;
            function: { name: string; arguments: string };
            isLast: boolean;
            index: number;
          }
        >();
        let chunkCount = 0;
        let toolCallCount = 0;

        const readable = new ReadableStream<Uint8Array>({
          start(controller) {
            streamController = controller;

            const emitSSE = (data: string) => {
              if (streamClosed) return;
              controller.enqueue(enc.encode(`data: ${data}\n\n`));
            };

            const closeStream = () => {
              if (streamClosed) return;
              streamClosed = true;
              try {
                controller.close();
              } catch {
                /* already closed */
              }
              client.close();
            };

            const buildChunk = (delta: Record<string, unknown>, finishReason: string | null) =>
              JSON.stringify({
                id: responseId,
                object: 'chat.completion.chunk',
                created,
                model,
                choices: [{ index: 0, delta, finish_reason: finishReason }],
              });

            req.on('data', (chunk: Buffer) => {
              if (streamClosed) return;
              for (const frame of parser.push(chunk)) {
                if (frame.type === 'error') {
                  emitSSE(
                    JSON.stringify({
                      error: { message: frame.message, type: frame.errorType, code: '' },
                    })
                  );
                  emitSSE('[DONE]');
                  closeStream();
                  return;
                }

                if (frame.type === 'toolCall') {
                  const tc = frame.toolCall;

                  // Emit role chunk on first content
                  if (chunkCount === 0) {
                    emitSSE(buildChunk({ role: 'assistant', content: '' }, null));
                    chunkCount++;
                  }

                  if (toolCallsMap.has(tc.id)) {
                    const existing = toolCallsMap.get(tc.id);
                    if (!existing) continue;
                    existing.function.arguments += tc.function.arguments;
                    existing.isLast = tc.isLast;
                    if (tc.function.arguments) {
                      emitSSE(
                        buildChunk(
                          {
                            tool_calls: [
                              {
                                index: existing.index,
                                id: tc.id,
                                type: 'function',
                                function: {
                                  name: tc.function.name,
                                  arguments: tc.function.arguments,
                                },
                              },
                            ],
                          },
                          null
                        )
                      );
                      chunkCount++;
                    }
                  } else {
                    const idx = toolCallCount++;
                    toolCallsMap.set(tc.id, { ...tc, index: idx });
                    emitSSE(
                      buildChunk(
                        {
                          tool_calls: [
                            {
                              index: idx,
                              id: tc.id,
                              type: 'function',
                              function: {
                                name: tc.function.name,
                                arguments: tc.function.arguments,
                              },
                            },
                          ],
                        },
                        null
                      )
                    );
                    chunkCount++;
                  }
                }

                if (frame.type === 'text') {
                  const delta =
                    chunkCount === 0 && toolCallCount === 0
                      ? { role: 'assistant', content: frame.text }
                      : { content: frame.text };
                  emitSSE(buildChunk(delta, null));
                  chunkCount++;
                }

                if (frame.type === 'thinking') {
                  const delta =
                    chunkCount === 0 && toolCallCount === 0
                      ? { role: 'assistant', reasoning_content: frame.text }
                      : { reasoning_content: frame.text };
                  emitSSE(buildChunk(delta, null));
                  chunkCount++;
                }
              }
            });

            req.on('end', () => {
              if (streamClosed) return;
              if (chunkCount === 0 && toolCallCount === 0) {
                emitSSE(buildChunk({ role: 'assistant', content: '' }, null));
              }
              emitSSE(
                JSON.stringify({
                  id: responseId,
                  object: 'chat.completion.chunk',
                  created,
                  model,
                  choices: [
                    {
                      index: 0,
                      delta: {},
                      finish_reason: toolCallCount > 0 ? 'tool_calls' : 'stop',
                    },
                  ],
                  usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
                })
              );
              emitSSE('[DONE]');
              closeStream();
            });

            req.on('error', (err) => {
              if (!streamClosed) {
                try {
                  controller.error(err);
                } catch {
                  /* already closed */
                }
              }
              client.close();
            });
          },
        });

        resolveOnce(
          new Response(readable, {
            status: 200,
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
            },
          })
        );
      });

      req.on('error', (err) => {
        client.close();
        rejectOnce(err instanceof Error ? err : new Error(String(err)));
      });

      req.write(body);
      req.end();
    });
  }

  /**
   * Parse protobuf buffer into frames and extract text/toolcalls.
   * Shared logic between JSON and SSE transformers.
   */
  private *parseProtobufFrames(buffer: Buffer): Generator<
    | { type: 'error'; response: Response }
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
      }
  > {
    let offset = 0;

    while (offset < buffer.length) {
      if (offset + 5 > buffer.length) break;

      const flags = buffer[offset];
      const length = buffer.readUInt32BE(offset + 1);

      if (offset + 5 + length > buffer.length) break;

      const rawPayload = buffer.subarray(offset + 5, offset + 5 + length);
      offset += 5 + length;

      const payload = decompressPayload(rawPayload, flags);

      // Check for JSON error format
      try {
        const text = payload.toString('utf-8');
        if (text.startsWith('{') && text.includes('"error"')) {
          yield { type: 'error', response: createErrorResponse(JSON.parse(text)) };
          return;
        }
      } catch (err) {
        if (process.env.CCS_DEBUG) {
          console.error('[cursor] parseProtobufFrames error parsing failed:', err);
        }
      }

      const result = extractTextFromResponse(new Uint8Array(payload));

      // Check for protobuf-decoded error
      if (result.error) {
        const errorLower = result.error.toLowerCase();
        const isRateLimit =
          errorLower.includes('rate limit') ||
          errorLower.includes('resource_exhausted') ||
          errorLower.includes('too many requests');
        yield {
          type: 'error',
          response: new Response(
            JSON.stringify({
              error: {
                message: result.error,
                type: isRateLimit ? 'rate_limit_error' : 'server_error',
                code: isRateLimit ? 'rate_limited' : 'cursor_error',
              },
            }),
            {
              status: isRateLimit ? 429 : 400,
              headers: { 'Content-Type': 'application/json' },
            }
          ),
        };
        return;
      }

      if (result.toolCall) {
        yield { type: 'toolCall', toolCall: result.toolCall };
      }

      if (result.text) {
        yield { type: 'text', text: result.text };
      }

      if (result.thinking) {
        yield { type: 'thinking', text: result.thinking };
      }
    }
  }

  transformProtobufToJSON(buffer: Buffer, model: string, _body: ExecutorParams['body']): Response {
    const responseId = `chatcmpl-cursor-${Date.now()}`;
    const created = Math.floor(Date.now() / 1000);

    let totalContent = '';
    let totalReasoning = '';
    const toolCalls: Array<{
      id: string;
      type: string;
      function: { name: string; arguments: string };
    }> = [];
    const toolCallsMap = new Map<
      string,
      {
        id: string;
        type: string;
        function: { name: string; arguments: string };
        isLast: boolean;
        index: number;
      }
    >();

    for (const frame of this.parseProtobufFrames(buffer)) {
      if (frame.type === 'error') {
        return frame.response;
      }

      if (frame.type === 'toolCall') {
        const tc = frame.toolCall;

        if (toolCallsMap.has(tc.id)) {
          const existing = toolCallsMap.get(tc.id);
          if (!existing) continue;
          existing.function.arguments += tc.function.arguments;
          existing.isLast = tc.isLast;
        } else {
          toolCallsMap.set(tc.id, {
            ...tc,
            index: toolCallsMap.size,
          });
        }

        if (tc.isLast) {
          const finalToolCall = toolCallsMap.get(tc.id);
          if (!finalToolCall) continue;
          toolCalls.push({
            id: finalToolCall.id,
            type: finalToolCall.type,
            function: {
              name: finalToolCall.function.name,
              arguments: finalToolCall.function.arguments,
            },
          });
        }
      }

      if (frame.type === 'text') {
        totalContent += frame.text;
      }

      if (frame.type === 'thinking') {
        totalReasoning += frame.text;
      }
    }

    // Finalize remaining tool calls
    for (const id of Array.from(toolCallsMap.keys())) {
      const tc = toolCallsMap.get(id);
      if (!tc) continue;
      if (!toolCalls.find((t) => t.id === id)) {
        toolCalls.push({
          id: tc.id,
          type: tc.type,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        });
      }
    }

    const message: {
      role: string;
      content: string | null;
      reasoning_content?: string | null;
      tool_calls?: Array<{
        id: string;
        type: string;
        function: { name: string; arguments: string };
      }>;
    } = {
      role: 'assistant',
      content: totalContent || null,
    };

    if (toolCalls.length > 0) {
      message.tool_calls = toolCalls;
    }

    if (totalReasoning) {
      message.reasoning_content = totalReasoning;
    }

    const completion = {
      id: responseId,
      object: 'chat.completion',
      created,
      model,
      choices: [
        {
          index: 0,
          message,
          finish_reason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
        },
      ],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
    };

    return new Response(JSON.stringify(completion), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /** @deprecated Use executeStreaming() for real-time SSE. Retained for fetch fallback. */
  transformProtobufToSSE(buffer: Buffer, model: string, _body: ExecutorParams['body']): Response {
    const responseId = `chatcmpl-cursor-${Date.now()}`;
    const created = Math.floor(Date.now() / 1000);

    const chunks: string[] = [];
    const toolCalls: Array<{
      id: string;
      type: string;
      function: { name: string; arguments: string };
      index: number;
    }> = [];
    const toolCallsMap = new Map<
      string,
      {
        id: string;
        type: string;
        function: { name: string; arguments: string };
        isLast: boolean;
        index: number;
      }
    >();

    for (const frame of this.parseProtobufFrames(buffer)) {
      if (frame.type === 'error') {
        return frame.response;
      }

      if (frame.type === 'toolCall') {
        const tc = frame.toolCall;

        if (chunks.length === 0) {
          chunks.push(
            `data: ${JSON.stringify({
              id: responseId,
              object: 'chat.completion.chunk',
              created,
              model,
              choices: [
                {
                  index: 0,
                  delta: { role: 'assistant', content: '' },
                  finish_reason: null,
                },
              ],
            })}\n\n`
          );
        }

        if (toolCallsMap.has(tc.id)) {
          const existing = toolCallsMap.get(tc.id);
          if (!existing) continue;
          existing.function.arguments += tc.function.arguments;
          existing.isLast = tc.isLast;

          if (tc.function.arguments) {
            chunks.push(
              `data: ${JSON.stringify({
                id: responseId,
                object: 'chat.completion.chunk',
                created,
                model,
                choices: [
                  {
                    index: 0,
                    delta: {
                      tool_calls: [
                        {
                          index: existing.index,
                          id: tc.id,
                          type: 'function',
                          function: {
                            name: tc.function.name,
                            arguments: tc.function.arguments,
                          },
                        },
                      ],
                    },
                    finish_reason: null,
                  },
                ],
              })}\n\n`
            );
          }
        } else {
          const toolCallIndex = toolCalls.length;
          toolCalls.push({ ...tc, index: toolCallIndex });
          toolCallsMap.set(tc.id, { ...tc, index: toolCallIndex });

          chunks.push(
            `data: ${JSON.stringify({
              id: responseId,
              object: 'chat.completion.chunk',
              created,
              model,
              choices: [
                {
                  index: 0,
                  delta: {
                    tool_calls: [
                      {
                        index: toolCallIndex,
                        id: tc.id,
                        type: 'function',
                        function: {
                          name: tc.function.name,
                          arguments: tc.function.arguments,
                        },
                      },
                    ],
                  },
                  finish_reason: null,
                },
              ],
            })}\n\n`
          );
        }
      }

      if (frame.type === 'text') {
        chunks.push(
          `data: ${JSON.stringify({
            id: responseId,
            object: 'chat.completion.chunk',
            created,
            model,
            choices: [
              {
                index: 0,
                delta:
                  chunks.length === 0 && toolCalls.length === 0
                    ? { role: 'assistant', content: frame.text }
                    : { content: frame.text },
                finish_reason: null,
              },
            ],
          })}\n\n`
        );
      }

      if (frame.type === 'thinking') {
        chunks.push(
          `data: ${JSON.stringify({
            id: responseId,
            object: 'chat.completion.chunk',
            created,
            model,
            choices: [
              {
                index: 0,
                delta:
                  chunks.length === 0 && toolCalls.length === 0
                    ? { role: 'assistant', reasoning_content: frame.text }
                    : { reasoning_content: frame.text },
                finish_reason: null,
              },
            ],
          })}\n\n`
        );
      }
    }

    if (chunks.length === 0 && toolCalls.length === 0) {
      chunks.push(
        `data: ${JSON.stringify({
          id: responseId,
          object: 'chat.completion.chunk',
          created,
          model,
          choices: [
            {
              index: 0,
              delta: { role: 'assistant', content: '' },
              finish_reason: null,
            },
          ],
        })}\n\n`
      );
    }

    chunks.push(
      `data: ${JSON.stringify({
        id: responseId,
        object: 'chat.completion.chunk',
        created,
        model,
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
          },
        ],
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        },
      })}\n\n`
    );
    chunks.push('data: [DONE]\n\n');

    return new Response(chunks.join(''), {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  }
}

export default CursorExecutor;
