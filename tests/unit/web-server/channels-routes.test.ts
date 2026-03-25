import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import express from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Server } from 'http';
import channelsRoutes from '../../../src/web-server/routes/channels-routes';
import { getOfficialChannelsConfig } from '../../../src/config/unified-config-loader';

async function putJson(baseUrl: string, routePath: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}${routePath}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('web-server channels-routes', () => {
  let server: Server;
  let baseUrl = '';
  let tempHome = '';
  let originalCcsHome: string | undefined;
  let originalCcsUnified: string | undefined;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/channels', channelsRoutes);

    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, '127.0.0.1');
      const handleError = (error: Error) => reject(error);
      server.once('error', handleError);
      server.once('listening', () => {
        server.off('error', handleError);
        resolve();
      });
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Unable to resolve test server port');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-channels-routes-'));
    originalCcsHome = process.env.CCS_HOME;
    originalCcsUnified = process.env.CCS_UNIFIED_CONFIG;

    process.env.CCS_HOME = tempHome;
    process.env.CCS_UNIFIED_CONFIG = '1';
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) process.env.CCS_HOME = originalCcsHome;
    else delete process.env.CCS_HOME;

    if (originalCcsUnified !== undefined) process.env.CCS_UNIFIED_CONFIG = originalCcsUnified;
    else delete process.env.CCS_UNIFIED_CONFIG;

    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it('persists an empty selected array when clearing all official channels', async () => {
    let response = await putJson(baseUrl, '/api/channels', {
      selected: ['discord', 'telegram'],
      unattended: true,
    });
    expect(response.status).toBe(200);

    response = await putJson(baseUrl, '/api/channels', {
      selected: [],
    });
    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      config?: {
        selected?: string[];
        unattended?: boolean;
      };
    };

    expect(payload.config?.selected).toEqual([]);
    expect(payload.config?.unattended).toBe(true);
    expect(getOfficialChannelsConfig()).toEqual({
      selected: [],
      unattended: true,
    });
  });

  it('reports current-process env tokens as available readiness in GET status', async () => {
    const originalDiscordToken = process.env.DISCORD_BOT_TOKEN;
    process.env.DISCORD_BOT_TOKEN = 'discord-from-env';

    try {
      await putJson(baseUrl, '/api/channels', {
        selected: ['discord'],
      });

      const response = await fetch(`${baseUrl}/api/channels`);
      expect(response.status).toBe(200);

      const payload = (await response.json()) as {
        status?: {
          summary?: {
            title?: string;
          };
          launchPreview?: {
            state?: string;
            title?: string;
            appendedArgs?: string[];
          };
          supportMessage?: string;
          accountStatusCaveat?: string;
          channels?: Array<{
            id?: string;
            tokenConfigured?: boolean;
            tokenAvailable?: boolean;
            tokenSource?: string;
            setup?: {
              label?: string;
            };
          }>;
        };
      };

      expect(payload.status?.summary?.title).toBe('Ready for the next native Claude run');
      expect(payload.status?.launchPreview).toEqual(
        expect.objectContaining({
          state: 'ready',
          title: 'CCS will auto-add Discord',
          appendedArgs: ['--channels', 'plugin:discord@claude-plugins-official'],
        })
      );
      expect(payload.status?.supportMessage).toContain('ccs glm');
      expect(payload.status?.accountStatusCaveat).toContain('current CCS process');
      expect(payload.status?.channels).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'discord',
            tokenConfigured: false,
            tokenAvailable: true,
            tokenSource: 'process_env',
            setup: expect.objectContaining({
              label: 'Ready from current CCS process env',
            }),
          }),
        ])
      );
    } finally {
      if (originalDiscordToken !== undefined) process.env.DISCORD_BOT_TOKEN = originalDiscordToken;
      else delete process.env.DISCORD_BOT_TOKEN;
    }
  });
});
