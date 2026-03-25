import { describe, expect, it } from 'bun:test';
import { CLIPROXY_DEFAULT_PORT } from '../../../src/cliproxy/config/port-manager';
import { resolveLifecyclePort } from '../../../src/commands/cliproxy/resolve-lifecycle-port';

describe('resolveLifecyclePort', () => {
  it('uses configured cliproxy_server.local.port', () => {
    expect(
      resolveLifecyclePort({
        cliproxy_server: {
          local: {
            port: 9456,
          },
        },
      })
    ).toBe(9456);
  });

  it('falls back to default port when configured local port is invalid', () => {
    expect(
      resolveLifecyclePort({
        cliproxy_server: {
          local: {
            port: 70000,
          },
        },
      })
    ).toBe(CLIPROXY_DEFAULT_PORT);
  });

  it('falls back to default port when config file is missing', () => {
    expect(resolveLifecyclePort({})).toBe(CLIPROXY_DEFAULT_PORT);
  });
});
