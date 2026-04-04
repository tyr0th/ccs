import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, userEvent } from '@tests/setup/test-utils';
import { AccountCard } from '@/components/account/flow-viz/account-card';
import type { AccountData } from '@/components/account/flow-viz/types';
import type { CodexQuotaResult } from '@/lib/api-client';
import { useAccountQuota, useAccountQuotas } from '@/hooks/use-cliproxy-stats';

vi.mock('@/hooks/use-cliproxy-stats', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/use-cliproxy-stats')>(
    '@/hooks/use-cliproxy-stats'
  );

  return {
    ...actual,
    useAccountQuota: vi.fn(),
    useAccountQuotas: vi.fn(),
  };
});

const mockedUseAccountQuota = vi.mocked(useAccountQuota);
const mockedUseAccountQuotas = vi.mocked(useAccountQuotas);

function makeCodexQuota(planType: 'plus' | 'team', fiveHour: number, weekly: number) {
  return {
    success: true,
    planType,
    lastUpdated: Date.now(),
    windows: [
      {
        label: 'Primary',
        usedPercent: 100 - fiveHour,
        remainingPercent: fiveHour,
        resetAfterSeconds: 60 * 60,
        resetAt: '2026-04-04T08:44:00Z',
      },
      {
        label: 'Secondary',
        usedPercent: 100 - weekly,
        remainingPercent: weekly,
        resetAfterSeconds: 7 * 24 * 60 * 60,
        resetAt: '2026-04-08T10:20:00Z',
      },
    ],
    coreUsage: {
      fiveHour: {
        label: 'Primary',
        remainingPercent: fiveHour,
        resetAfterSeconds: 60 * 60,
        resetAt: '2026-04-04T08:44:00Z',
      },
      weekly: {
        label: 'Secondary',
        remainingPercent: weekly,
        resetAfterSeconds: 7 * 24 * 60 * 60,
        resetAt: '2026-04-08T10:20:00Z',
      },
    },
  } satisfies CodexQuotaResult;
}

const groupedAccount: AccountData = {
  id: 'codex:user@example.com',
  email: 'user@example.com',
  tokenFile: 'codex-user.json',
  provider: 'codex',
  successCount: 9,
  failureCount: 1,
  color: '#1e6091',
  variants: [
    {
      id: 'business@example.com',
      email: 'user@example.com',
      tokenFile: 'codex-business.json',
      isDefault: false,
      successCount: 5,
      failureCount: 0,
      audience: 'business',
      audienceLabel: 'Business',
      detailLabel: null,
    },
    {
      id: 'personal@example.com',
      email: 'user@example.com',
      tokenFile: 'codex-personal.json',
      isDefault: true,
      successCount: 4,
      failureCount: 1,
      audience: 'personal',
      audienceLabel: 'Personal',
      detailLabel: null,
    },
  ],
};

describe('AccountCard grouped quota tooltip', () => {
  beforeEach(() => {
    mockedUseAccountQuota.mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useAccountQuota>);

    mockedUseAccountQuotas.mockReturnValue([
      {
        data: makeCodexQuota('team', 95, 81),
        isLoading: false,
      },
      {
        data: makeCodexQuota('plus', 64, 42),
        isLoading: false,
      },
    ] as ReturnType<typeof useAccountQuotas>);
  });

  it('shows provider quota tooltip content for each grouped personal/business row on hover', async () => {
    render(
      <AccountCard
        account={groupedAccount}
        zone="left"
        originalIndex={0}
        isHovered={false}
        isDragging={false}
        offset={{ x: 0, y: 0 }}
        showDetails={false}
        privacyMode={false}
        onMouseEnter={() => undefined}
        onMouseLeave={() => undefined}
        onPointerDown={() => undefined}
        onPointerMove={() => undefined}
        onPointerUp={() => undefined}
      />
    );

    await userEvent.hover(screen.getByText('Business'));
    expect((await screen.findAllByText('Plan: team')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('5h usage limit').length).toBeGreaterThan(0);

    await userEvent.hover(screen.getByText('Personal'));
    expect((await screen.findAllByText('Plan: plus')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Weekly usage limit').length).toBeGreaterThan(0);
  });
});
