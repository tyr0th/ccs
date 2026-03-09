import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import express from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Server } from 'http';
import profileRoutes from '../../../src/web-server/routes/profile-routes';

describe('profile-routes Anthropic direct', () => {
  let server: Server;
  let baseUrl = '';
  let tempHome = '';
  let originalCcsHome: string | undefined;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/profiles', profileRoutes);

    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, '127.0.0.1');
      const onError = (error: Error) => reject(error);
      server.once('error', onError);
      server.once('listening', () => {
        server.off('error', onError);
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
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-profile-routes-'));
    originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tempHome;
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }

    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it('creates direct Anthropic profiles without baseUrl', async () => {
    const response = await fetch(`${baseUrl}/api/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'anthropic-direct',
        baseUrl: '',
        apiKey: 'sk-ant-api03-create',
        model: 'claude-sonnet-4-5-20250929',
      }),
    });

    expect(response.status).toBe(201);

    const settingsPath = path.join(tempHome, '.ccs', 'anthropic-direct.settings.json');
    const persisted = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
      env: Record<string, string>;
    };

    expect(persisted.env.ANTHROPIC_API_KEY).toBe('sk-ant-api03-create');
    expect(persisted.env.ANTHROPIC_BASE_URL).toBeUndefined();
    expect(persisted.env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
  });

  it('updates proxy profiles into direct Anthropic mode', async () => {
    const createResponse = await fetch(`${baseUrl}/api/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'anthropic-switch',
        baseUrl: 'https://api.z.ai/api/anthropic',
        apiKey: 'proxy-token',
        model: 'glm-5',
      }),
    });
    expect(createResponse.status).toBe(201);

    const updateResponse = await fetch(`${baseUrl}/api/profiles/anthropic-switch`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl: '',
        apiKey: 'sk-ant-api03-update',
      }),
    });
    expect(updateResponse.status).toBe(200);

    const settingsPath = path.join(tempHome, '.ccs', 'anthropic-switch.settings.json');
    const persisted = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
      env: Record<string, string>;
    };

    expect(persisted.env.ANTHROPIC_API_KEY).toBe('sk-ant-api03-update');
    expect(persisted.env.ANTHROPIC_BASE_URL).toBeUndefined();
    expect(persisted.env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
  });
});
