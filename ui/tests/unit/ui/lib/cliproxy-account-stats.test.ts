import { describe, expect, it } from 'vitest';
import { getAccountStats } from '../../../../src/lib/cliproxy-account-stats';
import type { CliproxyStats } from '../../../../src/hooks/use-cliproxy-stats';
import type { OAuthAccount } from '../../../../src/lib/api-client';

describe('getAccountStats', () => {
  const baseAccount = {
    id: 'shared@example.com',
    email: 'shared@example.com',
    isDefault: true,
    tokenFile: 'shared.json',
    createdAt: '2026-03-26T00:00:00.000Z',
  } as const;

  it('prefers provider-qualified stats when the same email exists across providers', () => {
    const stats = {
      accountStats: {
        'codex:shared@example.com': {
          accountKey: 'codex:shared@example.com',
          provider: 'codex',
          source: 'shared@example.com',
          successCount: 11,
          failureCount: 1,
          totalTokens: 0,
          lastUsedAt: '2026-03-26T10:00:00.000Z',
        },
        'gemini:shared@example.com': {
          accountKey: 'gemini:shared@example.com',
          provider: 'gemini',
          source: 'shared@example.com',
          successCount: 3,
          failureCount: 2,
          totalTokens: 0,
          lastUsedAt: '2026-03-26T11:00:00.000Z',
        },
      },
    } as Pick<CliproxyStats, 'accountStats'>;

    const codexAccount: OAuthAccount = { ...baseAccount, provider: 'codex' };
    const geminiAccount: OAuthAccount = { ...baseAccount, provider: 'gemini' };

    expect(getAccountStats(stats, codexAccount)).toMatchObject({
      successCount: 11,
      failureCount: 1,
      provider: 'codex',
    });
    expect(getAccountStats(stats, geminiAccount)).toMatchObject({
      successCount: 3,
      failureCount: 2,
      provider: 'gemini',
    });
  });

  it('falls back to legacy raw-source keys for older stats payloads', () => {
    const stats = {
      accountStats: {
        'shared@example.com': {
          source: 'shared@example.com',
          successCount: 7,
          failureCount: 0,
          totalTokens: 0,
          lastUsedAt: '2026-03-26T12:00:00.000Z',
        },
      },
    } as Pick<CliproxyStats, 'accountStats'>;

    const account: OAuthAccount = { ...baseAccount, provider: 'codex' };

    expect(getAccountStats(stats, account)).toMatchObject({
      source: 'shared@example.com',
      successCount: 7,
      failureCount: 0,
    });
  });
});
