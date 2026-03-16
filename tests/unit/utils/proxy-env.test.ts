import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { getProxyResolution, shouldBypassProxy } from '../../../src/utils/proxy-env';

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

describe('proxy env helpers', () => {
  const originalEnv = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const key of PROXY_ENV_KEYS) {
      originalEnv.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of PROXY_ENV_KEYS) {
      const value = originalEnv.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  describe('getProxyResolution', () => {
    it('falls back from invalid HTTPS_PROXY to valid HTTP_PROXY for HTTPS requests', () => {
      process.env.HTTPS_PROXY = 'not-a-valid-url';
      process.env.HTTP_PROXY = 'http://http-proxy:8080';

      expect(getProxyResolution(true, process.env, { allowedProtocols: ['http:', 'https:'] })).toEqual(
        {
          url: 'http://http-proxy:8080',
        }
      );
    });

    it('preserves socks proxy URLs when no protocol restriction is requested', () => {
      process.env.https_proxy = 'socks5://proxy:1080';

      expect(getProxyResolution(true)).toEqual({ url: 'socks5://proxy:1080' });
    });

    it('falls back from unsupported HTTPS_PROXY to valid ALL_PROXY when protocols are restricted', () => {
      process.env.https_proxy = 'socks5://proxy:1080';
      process.env.ALL_PROXY = 'http://all-proxy:8080';

      expect(getProxyResolution(true, process.env, { allowedProtocols: ['http:', 'https:'] })).toEqual(
        {
          url: 'http://all-proxy:8080',
        }
      );
    });

    it('returns an error when only invalid proxy env values are configured for restricted protocols', () => {
      process.env.https_proxy = 'socks5://proxy:1080';
      process.env.HTTP_PROXY = 'not-a-valid-url';

      expect(getProxyResolution(true, process.env, { allowedProtocols: ['http:', 'https:'] })).toEqual(
        {
          error: 'Unsupported proxy protocol: socks5:',
        }
      );
    });
  });

  describe('shouldBypassProxy', () => {
    it('automatically bypasses loopback hosts without NO_PROXY', () => {
      expect(shouldBypassProxy('localhost')).toBe(true);
      expect(shouldBypassProxy('api.localhost')).toBe(true);
      expect(shouldBypassProxy('0.0.0.0')).toBe(true);
      expect(shouldBypassProxy('127.0.0.2')).toBe(true);
      expect(shouldBypassProxy('::1')).toBe(true);
      expect(shouldBypassProxy('::ffff:127.0.0.1')).toBe(true);
      expect(shouldBypassProxy('::ffff:7f00:1')).toBe(true);
    });

    it('supports wildcard NO_PROXY domain suffix patterns', () => {
      process.env.NO_PROXY = '*.example.com';

      expect(shouldBypassProxy('example.com')).toBe(true);
      expect(shouldBypassProxy('api.example.com')).toBe(true);
      expect(shouldBypassProxy('other.test')).toBe(false);
    });
  });
});
