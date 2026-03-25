import { describe, expect, it } from 'bun:test';

describe('installCliproxyVersion', () => {
  it('attempts to stop the proxy even when there is no tracked running session', async () => {
    const calls = {
      stopProxy: 0,
      waitForPortFree: 0,
      deleteBinary: 0,
      ensureBinary: 0,
    };

    const binaryManager = await import(
      `../../../src/cliproxy/binary-manager?binary-manager-install=${Date.now()}`
    );

    await binaryManager.installCliproxyVersion('6.7.1', false, 'plus', {
      createManager: () => ({
        isBinaryInstalled: () => false,
        deleteBinary: () => {
          calls.deleteBinary += 1;
        },
        ensureBinary: async () => {
          calls.ensureBinary += 1;
          return '/tmp/ccs-bin/plus/cliproxy';
        },
      }),
      stopProxyFn: async () => {
        calls.stopProxy += 1;
        return { stopped: false, error: 'No active CLIProxy session found' };
      },
      waitForPortFreeFn: async () => {
        calls.waitForPortFree += 1;
        return true;
      },
      formatInfo: (message: string) => message,
      formatWarn: (message: string) => message,
      getInstalledVersion: () => '6.6.80',
    });

    expect(calls.stopProxy).toBe(1);
    expect(calls.waitForPortFree).toBe(0);
    expect(calls.deleteBinary).toBe(0);
    expect(calls.ensureBinary).toBe(1);
  });
});
