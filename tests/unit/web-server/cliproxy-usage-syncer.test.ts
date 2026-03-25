import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { CliproxyUsageApiResponse } from '../../../src/cliproxy/stats-fetcher';
import { runWithScopedConfigDir } from '../../../src/utils/config-manager';
import {
  loadCachedCliproxyData,
  startCliproxySync,
  stopCliproxySync,
  syncCliproxyUsage,
} from '../../../src/web-server/usage/cliproxy-usage-syncer';

let ccsDir = '';
let rawResponse: CliproxyUsageApiResponse | null = null;
let fetchCalls = 0;

function fetchRawResponse(): Promise<CliproxyUsageApiResponse | null> {
  fetchCalls++;
  return Promise.resolve(rawResponse);
}

beforeEach(() => {
  ccsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-cliproxy-syncer-'));
  fetchCalls = 0;
  rawResponse = {
    usage: {
      apis: {
        gemini: {
          models: {
            'gemini-2.5-pro': {
              details: [
                {
                  timestamp: '2026-03-02T12:00:00.000Z',
                  source: 'account-a',
                  auth_index: 0,
                  tokens: {
                    input_tokens: 100,
                    output_tokens: 20,
                    reasoning_tokens: 0,
                    cached_tokens: 10,
                    total_tokens: 130,
                  },
                  failed: false,
                },
              ],
            },
          },
        },
      },
    },
  };
  stopCliproxySync();
});

afterEach(() => {
  stopCliproxySync();
  fs.rmSync(ccsDir, { recursive: true, force: true });
});

describe('cliproxy usage syncer', () => {
  it('writes and loads snapshot data', async () => {
    await runWithScopedConfigDir(ccsDir, async () => {
      await syncCliproxyUsage(fetchRawResponse);
    });

    const snapshotPath = path.join(ccsDir, 'cache', 'cliproxy-usage', 'latest.json');
    expect(fs.existsSync(snapshotPath)).toBe(true);

    const cached = await runWithScopedConfigDir(ccsDir, async () => {
      return await loadCachedCliproxyData();
    });
    expect(cached.daily).toHaveLength(1);
    expect(cached.daily[0].source).toBe('cliproxy');
    expect(cached.daily[0].inputTokens).toBe(100);
    expect(cached.hourly).toHaveLength(1);
    expect(cached.monthly).toHaveLength(1);
  });

  it('startCliproxySync is idempotent and starts only one interval', async () => {
    const intervalSpy = spyOn(globalThis, 'setInterval');

    await runWithScopedConfigDir(ccsDir, async () => {
      const syncNow = () => syncCliproxyUsage(fetchRawResponse);
      startCliproxySync(syncNow);
      startCliproxySync(syncNow);
    });

    expect(intervalSpy).toHaveBeenCalledTimes(1);
    expect(fetchCalls).toBeGreaterThan(0);

    stopCliproxySync();
    intervalSpy.mockRestore();
  });
});
