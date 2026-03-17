import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

const startServerCalls: Array<Record<string, unknown>> = [];
const resolveDashboardUrlsCalls: Array<[string | undefined, number]> = [];
let logLines: string[] = [];
let errorLines: string[] = [];
let dashboardAuthEnabled = false;
let startServerError: Error | null = null;
let mockServerBindHost = '::';
let originalConsoleLog: typeof console.log;
let originalConsoleError: typeof console.error;
let originalProcessExit: typeof process.exit;

beforeEach(() => {
  startServerCalls.length = 0;
  resolveDashboardUrlsCalls.length = 0;
  logLines = [];
  errorLines = [];
  dashboardAuthEnabled = false;
  startServerError = null;
  mockServerBindHost = '::';

  originalConsoleLog = console.log;
  originalConsoleError = console.error;
  originalProcessExit = process.exit;

  console.log = (...args: unknown[]) => {
    logLines.push(args.map(String).join(' '));
  };
  console.error = (...args: unknown[]) => {
    errorLines.push(args.map(String).join(' '));
  };

  mock.module('get-port', () => ({
    default: async () => 3000,
  }));

  mock.module('open', () => ({
    default: async () => undefined,
  }));

  mock.module('../../../src/web-server', () => ({
    startServer: async (options: Record<string, unknown>) => {
      startServerCalls.push({ ...options });
      if (startServerError) {
        throw startServerError;
      }
      return {
        server: {
          address: () => ({ address: mockServerBindHost }),
        } as never,
        wss: {} as never,
        cleanup: () => {},
      };
    },
  }));

  mock.module('../../../src/web-server/shutdown', () => ({
    setupGracefulShutdown: () => {},
  }));

  mock.module('../../../src/cliproxy/service-manager', () => ({
    ensureCliproxyService: async () => ({
      started: true,
      alreadyRunning: true,
      port: 8317,
      configRegenerated: false,
    }),
  }));

  mock.module('../../../src/cliproxy/config-generator', () => ({
    CLIPROXY_DEFAULT_PORT: 8317,
  }));

  mock.module('../../../src/config/unified-config-loader', () => ({
    getDashboardAuthConfig: () => ({
      enabled: dashboardAuthEnabled,
    }),
  }));

  mock.module('../../../src/utils/ui', () => ({
    initUI: async () => {},
    header: (message: string) => message,
    ok: (message: string) => message,
    info: (message: string) => message,
    warn: (message: string) => message,
    fail: (message: string) => message,
  }));

  mock.module('../../../src/commands/config-dashboard-host', () => ({
    normalizeDashboardHost: (host: string | undefined) => {
      if (!host) {
        return undefined;
      }

      if (host.startsWith('[') && host.endsWith(']') && host.includes(':')) {
        return host.slice(1, -1);
      }

      return host;
    },
    isLoopbackHost: (host: string) =>
      ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host.trim().toLowerCase()),
    isWildcardHost: (host: string) => ['0.0.0.0', '::', '[::]'].includes(host.trim().toLowerCase()),
    resolveDashboardUrls: (host: string | undefined, port: number) => {
      resolveDashboardUrlsCalls.push([host, port]);
      if (!host) {
        return { browserUrl: `http://localhost:${port}` };
      }

      if (host === '0.0.0.0' || host === '::') {
        return {
          bindHost: host,
          browserUrl: `http://localhost:${port}`,
          networkUrls: [`http://192.168.1.25:${port}`, `http://100.64.0.12:${port}`],
        };
      }

      return {
        bindHost: host,
        browserUrl: `http://${host}:${port}`,
      };
    },
  }));
});

afterEach(() => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  process.exit = originalProcessExit;
  mock.restore();
});

async function loadHandleConfigCommand() {
  const mod = await import(`../../../src/commands/config-command?test=${Date.now()}-${Math.random()}`);
  return mod.handleConfigCommand;
}

describe('config command dashboard startup', () => {
  it('keeps the default startup path free of an explicit host override', async () => {
    const handleConfigCommand = await loadHandleConfigCommand();

    await handleConfigCommand([]);

    expect(startServerCalls).toHaveLength(1);
    expect(startServerCalls[0]).toEqual({ port: 3000, dev: false });
    expect(resolveDashboardUrlsCalls).toEqual([['::', 3000]]);

    const rendered = logLines.join('\n');
    expect(rendered).toContain('Dashboard: http://localhost:3000');
    expect(rendered).toContain('Bind host: ::');
    expect(rendered).toContain('Network URLs:');
    expect(rendered).toContain('Protect it before sharing: ccs config auth setup');
    expect(errorLines).toHaveLength(0);
  });

  it('passes explicit wildcard hosts through and prints exposure guidance', async () => {
    const handleConfigCommand = await loadHandleConfigCommand();
    mockServerBindHost = '0.0.0.0';

    await handleConfigCommand(['--host', '0.0.0.0', '--port', '4100']);

    expect(startServerCalls).toHaveLength(1);
    expect(startServerCalls[0]).toEqual({ port: 4100, dev: false, host: '0.0.0.0' });
    expect(resolveDashboardUrlsCalls).toEqual([['0.0.0.0', 4100]]);

    const rendered = logLines.join('\n');
    expect(rendered).toContain('Bind host: 0.0.0.0');
    expect(rendered).toContain('Network URLs:');
    expect(rendered).toContain('http://192.168.1.25:4100');
    expect(rendered).toContain('http://100.64.0.12:4100');
    expect(rendered).toContain(
      'Dashboard may be reachable from other devices that can connect to this machine.'
    );
    expect(rendered).toContain('Protect it before sharing: ccs config auth setup');
    expect(errorLines).toHaveLength(0);
  });

  it('fails cleanly when the server cannot bind the requested host', async () => {
    const handleConfigCommand = await loadHandleConfigCommand();
    startServerError = new Error(
      'Unable to bind 192.0.2.123:4100; the address may be unavailable or the port may already be in use'
    );
    process.exit = ((code?: number) => {
      throw new Error(`process.exit(${code ?? 0})`);
    }) as typeof process.exit;

    await expect(handleConfigCommand(['--host', '192.0.2.123', '--port', '4100'])).rejects.toThrow(
      'process.exit(1)'
    );

    expect(errorLines.join('\n')).toContain(
      'Failed to start server: Unable to bind 192.0.2.123:4100; the address may be unavailable or the port may already be in use'
    );
  });
});
