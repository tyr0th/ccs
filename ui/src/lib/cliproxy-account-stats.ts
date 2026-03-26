import type { OAuthAccount } from '@/lib/api-client';
import type { AccountUsageStats, CliproxyStats } from '@/hooks/use-cliproxy-stats';

export function buildQualifiedAccountStatsKey(provider: string, source: string): string {
  return `${provider.trim().toLowerCase()}:${source.trim()}`;
}

export function getAccountStats(
  stats: Pick<CliproxyStats, 'accountStats'> | null | undefined,
  account: Pick<OAuthAccount, 'provider' | 'email' | 'id'>
): AccountUsageStats | undefined {
  const source = account.email || account.id;
  const qualifiedKey = buildQualifiedAccountStatsKey(account.provider, source);

  return stats?.accountStats?.[qualifiedKey] ?? stats?.accountStats?.[source];
}
