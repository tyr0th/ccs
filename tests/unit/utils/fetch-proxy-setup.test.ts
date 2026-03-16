import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as http from 'node:http';
import { fetch, getGlobalDispatcher, setGlobalDispatcher } from 'undici';
import { applyGlobalFetchProxy } from '../../../src/utils/fetch-proxy-setup';

const PROXY_ENV_KEYS = [
  'http_proxy',
  'HTTP_PROXY',
  'https_proxy',
  'HTTPS_PROXY',
  'all_proxy',
  'ALL_PROXY',
  'no_proxy',
  'NO_PROXY',
] as const;

describe('global fetch proxy setup', () => {
  const originalEnv = new Map<string, string | undefined>();
  const originalDispatcher = getGlobalDispatcher();

  beforeEach(() => {
    for (const key of PROXY_ENV_KEYS) {
      originalEnv.set(key, process.env[key]);
      delete process.env[key];
    }
    setGlobalDispatcher(originalDispatcher);
  });

  afterEach(() => {
    setGlobalDispatcher(originalDispatcher);
    for (const key of PROXY_ENV_KEYS) {
      const value = originalEnv.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('does not fail when proxy configuration is invalid', () => {
    process.env.HTTP_PROXY = 'not-a-valid-url';

    expect(applyGlobalFetchProxy()).toEqual({
      enabled: false,
      error: 'Invalid URL',
    });
  });

  it('bypasses loopback fetches even when HTTP_PROXY is set', async () => {
    process.env.HTTP_PROXY = 'http://127.0.0.1:9';

    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to bind test server');
    }

    try {
      expect(applyGlobalFetchProxy()).toEqual({ enabled: true });

      const response = await fetch(`http://127.0.0.1:${address.port}/health`);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('ok');
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it('supports ALL_PROXY as a fetch proxy fallback', () => {
    process.env.ALL_PROXY = 'http://127.0.0.1:8080';

    expect(applyGlobalFetchProxy()).toEqual({ enabled: true });
  });

  it('falls back to ALL_PROXY when HTTP_PROXY is invalid', () => {
    process.env.HTTP_PROXY = 'not-a-valid-url';
    process.env.ALL_PROXY = 'http://127.0.0.1:8080';

    expect(applyGlobalFetchProxy()).toEqual({ enabled: true });
  });
});
