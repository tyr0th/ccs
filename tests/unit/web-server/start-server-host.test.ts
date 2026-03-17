import { afterEach, describe, expect, it } from 'bun:test';
import type { AddressInfo } from 'net';

import { startServer } from '../../../src/web-server';

const instances: Array<Awaited<ReturnType<typeof startServer>>> = [];

afterEach(async () => {
  while (instances.length > 0) {
    const instance = instances.pop();
    if (!instance) {
      continue;
    }

    instance.cleanup();
    await new Promise<void>((resolve) => instance.server.close(() => resolve()));
  }
});

describe('startServer host binding', () => {
  it('binds with system-default host when no host is provided', async () => {
    const instance = await startServer({ port: 0 });
    instances.push(instance);

    const address = instance.server.address() as AddressInfo;
    expect(address.port).toBeGreaterThan(0);
  });

  it('binds to an explicit loopback host', async () => {
    const instance = await startServer({ port: 0, host: '127.0.0.1' });
    instances.push(instance);

    const address = instance.server.address() as AddressInfo;
    expect(address.address).toBe('127.0.0.1');
  });

  it('binds to wildcard host when requested', async () => {
    const instance = await startServer({ port: 0, host: '0.0.0.0' });
    instances.push(instance);

    const address = instance.server.address() as AddressInfo;
    expect(['0.0.0.0', '::']).toContain(address.address);
  });
});
