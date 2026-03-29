/**
 * Auth Check Route — Remote Access Detection Tests
 *
 * Verifies that /api/auth/check returns effectiveAuthRequired=true
 * for remote clients when auth is disabled, preventing a silently
 * broken dashboard.
 */

import { describe, it, expect } from 'bun:test';
import { isLoopbackRemoteAddress } from '../../../src/web-server/middleware/auth-middleware';

describe('isLoopbackRemoteAddress', () => {
  it('returns true for IPv4 localhost', () => {
    expect(isLoopbackRemoteAddress('127.0.0.1')).toBe(true);
  });

  it('returns true for IPv6 localhost', () => {
    expect(isLoopbackRemoteAddress('::1')).toBe(true);
  });

  it('returns true for IPv4-mapped IPv6 localhost', () => {
    expect(isLoopbackRemoteAddress('::ffff:127.0.0.1')).toBe(true);
  });

  it('returns true for other loopback addresses', () => {
    expect(isLoopbackRemoteAddress('127.0.0.2')).toBe(true);
    expect(isLoopbackRemoteAddress('::ffff:127.0.0.2')).toBe(true);
  });

  it('returns false for LAN addresses', () => {
    expect(isLoopbackRemoteAddress('192.168.1.100')).toBe(false);
    expect(isLoopbackRemoteAddress('10.0.0.1')).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isLoopbackRemoteAddress(undefined)).toBe(false);
  });
});

describe('effectiveAuthRequired logic', () => {
  // Mirrors the logic in auth-routes.ts GET /api/auth/check:
  // effectiveAuthRequired = authConfig.enabled || !isLocal
  function computeEffectiveAuthRequired(authEnabled: boolean, remoteAddress: string | undefined) {
    const isLocal = isLoopbackRemoteAddress(remoteAddress);
    return authEnabled || !isLocal;
  }

  it('localhost + auth disabled -> authRequired=false', () => {
    expect(computeEffectiveAuthRequired(false, '127.0.0.1')).toBe(false);
  });

  it('remote + auth disabled -> authRequired=true', () => {
    expect(computeEffectiveAuthRequired(false, '192.168.2.100')).toBe(true);
  });

  it('remote + auth enabled -> authRequired=true', () => {
    expect(computeEffectiveAuthRequired(true, '192.168.2.100')).toBe(true);
  });

  it('localhost + auth enabled -> authRequired=true', () => {
    expect(computeEffectiveAuthRequired(true, '127.0.0.1')).toBe(true);
  });
});
