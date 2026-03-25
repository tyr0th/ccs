import { describe, expect, it } from 'bun:test';
import {
  MINIMUM_OFFICIAL_CHANNELS_CLAUDE_VERSION,
  OFFICIAL_CHANNELS,
  buildOfficialChannelsLaunchPreview,
  buildOfficialChannelsReadinessSummary,
  buildOfficialChannelSetupSummary,
  buildOfficialChannelsArgs,
  expandOfficialChannelSelection,
  hasExplicitChannelsFlag,
  hasExplicitPermissionOverride,
  isDiscordChannelsSessionSupported,
  resolveOfficialChannelsAuthSummary,
  resolveOfficialChannelsLaunchPlan,
  resolveOfficialChannelsVersionSummary,
  type OfficialChannelsAuthSummary,
  type OfficialChannelsEnvironmentStatus,
  type OfficialChannelsVersionSummary,
} from '../../../src/channels/official-channels-runtime';

function buildSupportedVersionSummary(
  overrides: Partial<OfficialChannelsVersionSummary> = {}
): OfficialChannelsVersionSummary {
  return {
    current: '2.1.81',
    minimum: MINIMUM_OFFICIAL_CHANNELS_CLAUDE_VERSION,
    state: 'supported',
    message: 'Claude Code v2.1.81',
    ...overrides,
  };
}

function buildEligibleAuthSummary(
  overrides: Partial<OfficialChannelsAuthSummary> = {}
): OfficialChannelsAuthSummary {
  return {
    checked: true,
    loggedIn: true,
    authMethod: 'claude.ai',
    subscriptionType: 'pro',
    state: 'eligible',
    eligible: true,
    message: 'Authenticated with claude.ai.',
    ...overrides,
  };
}

function buildEnvironment(
  overrides: Partial<OfficialChannelsEnvironmentStatus> = {}
): OfficialChannelsEnvironmentStatus {
  return {
    bunInstalled: true,
    supportedProfiles: ['default', 'account'],
    stateScopeMessage: 'state scope',
    claudeVersion: buildSupportedVersionSummary(overrides.claudeVersion),
    auth: buildEligibleAuthSummary(overrides.auth),
    ...overrides,
  };
}

describe('official channels runtime planning', () => {
  it('supports only native Claude default/account sessions', () => {
    expect(isDiscordChannelsSessionSupported('claude', 'default')).toBe(true);
    expect(isDiscordChannelsSessionSupported('claude', 'account')).toBe(true);
    expect(isDiscordChannelsSessionSupported('claude', 'settings')).toBe(false);
    expect(isDiscordChannelsSessionSupported('droid', 'default')).toBe(false);
  });

  it('detects explicit channel and permission overrides', () => {
    expect(hasExplicitChannelsFlag(['--channels', 'plugin:other'])).toBe(true);
    expect(
      hasExplicitChannelsFlag([`--channels=${OFFICIAL_CHANNELS.discord.pluginSpec}`])
    ).toBe(true);
    expect(hasExplicitChannelsFlag(['--permission-mode', 'acceptEdits'])).toBe(false);

    expect(hasExplicitPermissionOverride(['--dangerously-skip-permissions'])).toBe(true);
    expect(hasExplicitPermissionOverride(['--allow-dangerously-skip-permissions'])).toBe(true);
    expect(hasExplicitPermissionOverride(['--permission-mode', 'acceptEdits'])).toBe(true);
    expect(hasExplicitPermissionOverride(['--permission-mode=acceptEdits'])).toBe(true);
  });

  it('expands channel selection and builds runtime argv in stable order', () => {
    expect(expandOfficialChannelSelection('all')).toEqual(['telegram', 'discord', 'imessage']);
    expect(expandOfficialChannelSelection('discord,telegram')).toEqual(['telegram', 'discord']);
    expect(buildOfficialChannelsArgs(['--verbose'], ['telegram', 'discord'], true)).toEqual([
      '--verbose',
      '--channels',
      OFFICIAL_CHANNELS.telegram.pluginSpec,
      OFFICIAL_CHANNELS.discord.pluginSpec,
      '--dangerously-skip-permissions',
    ]);
  });

  it('adds all ready selected channels and optional permission bypass when eligible', () => {
    const plan = resolveOfficialChannelsLaunchPlan({
      args: ['--verbose'],
      config: { selected: ['telegram', 'discord'], unattended: true },
      target: 'claude',
      profileType: 'default',
      environment: buildEnvironment(),
      channelReadiness: {
        telegram: true,
        discord: true,
        imessage: true,
      },
    });

    expect(plan.applied).toBe(true);
    expect(plan.appliedChannels).toEqual(['telegram', 'discord']);
    expect(plan.wantsPermissionBypass).toBe(true);
  });

  it('keeps explicit permission choice and still returns ready channels', () => {
    const plan = resolveOfficialChannelsLaunchPlan({
      args: ['--allow-dangerously-skip-permissions'],
      config: { selected: ['discord'], unattended: true },
      target: 'claude',
      profileType: 'account',
      environment: buildEnvironment(),
      channelReadiness: {
        telegram: false,
        discord: true,
        imessage: true,
      },
    });

    expect(plan.applied).toBe(true);
    expect(plan.appliedChannels).toEqual(['discord']);
    expect(plan.wantsPermissionBypass).toBe(false);
  });

  it('skips incompatible sessions and reports per-channel readiness problems', () => {
    const incompatible = resolveOfficialChannelsLaunchPlan({
      args: [],
      config: { selected: ['discord'], unattended: false },
      target: 'claude',
      profileType: 'settings',
      environment: buildEnvironment(),
      channelReadiness: {
        telegram: true,
        discord: true,
        imessage: true,
      },
    });
    const missingBun = resolveOfficialChannelsLaunchPlan({
      args: [],
      config: { selected: ['discord'], unattended: false },
      target: 'claude',
      profileType: 'default',
      environment: buildEnvironment({ bunInstalled: false }),
      channelReadiness: {
        telegram: true,
        discord: true,
        imessage: true,
      },
    });
    const missingToken = resolveOfficialChannelsLaunchPlan({
      args: [],
      config: { selected: ['telegram', 'discord'], unattended: false },
      target: 'claude',
      profileType: 'default',
      environment: buildEnvironment(),
      channelReadiness: {
        telegram: false,
        discord: true,
        imessage: true,
      },
    });

    expect(incompatible.applied).toBe(false);
    expect(incompatible.skippedMessages.join(' ')).toContain('native Claude default/account sessions');
    expect(missingBun.applied).toBe(false);
    expect(missingBun.skippedMessages.join(' ')).toContain('Bun is not installed');
    expect(missingToken.applied).toBe(true);
    expect(missingToken.appliedChannels).toEqual(['discord']);
    expect(missingToken.skippedMessages.join(' ')).toContain('TELEGRAM_BOT_TOKEN is not configured');
  });

  it('skips launch when Claude Code version is unsupported or auth is ineligible', () => {
    const unsupportedVersion = resolveOfficialChannelsLaunchPlan({
      args: [],
      config: { selected: ['discord'], unattended: true },
      target: 'claude',
      profileType: 'default',
      environment: buildEnvironment({
        claudeVersion: buildSupportedVersionSummary({
          current: '2.1.79',
          state: 'unsupported',
          message:
            'Official Channels require Claude Code v2.1.80+ (found v2.1.79).',
        }),
      }),
      channelReadiness: {
        telegram: true,
        discord: true,
        imessage: true,
      },
    });
    const ineligibleAuth = resolveOfficialChannelsLaunchPlan({
      args: [],
      config: { selected: ['discord'], unattended: true },
      target: 'claude',
      profileType: 'default',
      environment: buildEnvironment({
        auth: buildEligibleAuthSummary({
          authMethod: 'console-key',
          state: 'ineligible',
          eligible: false,
          message: 'Official Channels require claude.ai login. Current auth method: console-key.',
        }),
      }),
      channelReadiness: {
        telegram: true,
        discord: true,
        imessage: true,
      },
    });
    const unknownVersion = resolveOfficialChannelsLaunchPlan({
      args: [],
      config: { selected: ['discord'], unattended: true },
      target: 'claude',
      profileType: 'default',
      environment: buildEnvironment({
        claudeVersion: buildSupportedVersionSummary({
          current: null,
          state: 'unknown',
          message: 'Unable to detect Claude Code version. Official Channels require v2.1.80+.',
        }),
      }),
      channelReadiness: {
        telegram: true,
        discord: true,
        imessage: true,
      },
    });
    const unknownAuth = resolveOfficialChannelsLaunchPlan({
      args: [],
      config: { selected: ['discord'], unattended: true },
      target: 'claude',
      profileType: 'default',
      environment: buildEnvironment({
        auth: buildEligibleAuthSummary({
          checked: false,
          loggedIn: false,
          authMethod: null,
          subscriptionType: null,
          state: 'unknown',
          eligible: false,
          message:
            'Unable to verify Claude auth status. Official Channels require claude.ai login.',
        }),
      }),
      channelReadiness: {
        telegram: true,
        discord: true,
        imessage: true,
      },
    });

    expect(unsupportedVersion.applied).toBe(false);
    expect(unsupportedVersion.skippedMessages).toEqual([
      'Official Channels require Claude Code v2.1.80+ (found v2.1.79).',
    ]);

    expect(ineligibleAuth.applied).toBe(false);
    expect(ineligibleAuth.skippedMessages).toEqual([
      'Official Channels require claude.ai login. Current auth method: console-key.',
    ]);

    expect(unknownVersion.applied).toBe(false);
    expect(unknownVersion.skippedMessages).toEqual([
      'Unable to detect Claude Code version. Official Channels require v2.1.80+.',
    ]);

    expect(unknownAuth.applied).toBe(false);
    expect(unknownAuth.skippedMessages).toEqual([
      'Unable to verify Claude auth status. Official Channels require claude.ai login.',
    ]);
  });

  it('leaves explicit channel arguments untouched', () => {
    const plan = resolveOfficialChannelsLaunchPlan({
      args: ['--channels', 'plugin:custom'],
      config: { selected: ['discord'], unattended: true },
      target: 'claude',
      profileType: 'default',
      environment: buildEnvironment(),
      channelReadiness: {
        telegram: true,
        discord: true,
        imessage: true,
      },
    });

    expect(plan.applied).toBe(false);
    expect(plan.appliedChannels).toEqual([]);
    expect(plan.skippedMessages).toEqual([]);
  });

  it('summarizes version compatibility states', () => {
    const unknown = resolveOfficialChannelsVersionSummary(null);
    const supported = resolveOfficialChannelsVersionSummary(MINIMUM_OFFICIAL_CHANNELS_CLAUDE_VERSION);
    const unsupported = resolveOfficialChannelsVersionSummary('2.1.79');

    expect(unknown.state).toBe('unknown');
    expect(unknown.message).toContain(`v${MINIMUM_OFFICIAL_CHANNELS_CLAUDE_VERSION}+`);

    expect(supported.state).toBe('supported');
    expect(supported.message).toBe(`Claude Code v${MINIMUM_OFFICIAL_CHANNELS_CLAUDE_VERSION}`);

    expect(unsupported.state).toBe('unsupported');
    expect(unsupported.message).toContain(`found v2.1.79`);
  });

  it('summarizes auth eligibility states and org requirements', () => {
    const unknown = resolveOfficialChannelsAuthSummary(null);
    const loggedOut = resolveOfficialChannelsAuthSummary({
      loggedIn: false,
      authMethod: null,
      subscriptionType: null,
    });
    const wrongAuth = resolveOfficialChannelsAuthSummary({
      loggedIn: true,
      authMethod: 'api-key',
      subscriptionType: 'pro',
    });
    const team = resolveOfficialChannelsAuthSummary({
      loggedIn: true,
      authMethod: 'claude.ai',
      subscriptionType: 'team',
    });

    expect(unknown.state).toBe('unknown');
    expect(loggedOut.state).toBe('ineligible');
    expect(loggedOut.message).toContain('claude auth login');

    expect(wrongAuth.state).toBe('ineligible');
    expect(wrongAuth.message).toContain('Current auth method: api-key');

    expect(team.state).toBe('eligible');
    expect(team.orgRequirementMessage).toContain('enabled by an admin');
  });

  it('builds source-aware setup summaries for token and iMessage channels', () => {
    expect(
      buildOfficialChannelSetupSummary({
        id: 'discord',
        displayName: 'Discord',
        selected: true,
        requiresToken: true,
        tokenAvailable: true,
        tokenSource: 'process_env',
        savedInClaudeState: false,
        processEnvAvailable: true,
      })
    ).toMatchObject({
      state: 'ready',
      label: 'Ready from current CCS process env',
    });

    expect(
      buildOfficialChannelSetupSummary({
        id: 'telegram',
        displayName: 'Telegram',
        selected: true,
        requiresToken: true,
        tokenAvailable: false,
        tokenSource: 'missing',
        savedInClaudeState: false,
        processEnvAvailable: false,
      })
    ).toMatchObject({
      state: 'needs_token',
      label: 'Needs token',
    });

    expect(
      buildOfficialChannelSetupSummary({
        id: 'imessage',
        displayName: 'iMessage',
        selected: true,
        requiresToken: false,
        tokenAvailable: true,
      })
    ).toMatchObject({
      state: 'needs_claude_setup',
      label: 'Claude-side setup remaining',
    });
  });

  it('builds an overall readiness summary that stays explicit about blockers and partial readiness', () => {
    const needsSetup = buildOfficialChannelsReadinessSummary({
      config: { selected: ['discord'], unattended: false },
      environment: buildEnvironment({ bunInstalled: false }),
      channels: [
        {
          id: 'discord',
          displayName: 'Discord',
        selected: true,
        requiresToken: true,
        tokenAvailable: false,
        tokenSource: 'missing',
        savedInClaudeState: false,
        processEnvAvailable: false,
      },
      ],
    });
    const limited = buildOfficialChannelsReadinessSummary({
      config: { selected: ['imessage'], unattended: false },
      environment: buildEnvironment(),
      channels: [
        {
          id: 'imessage',
          displayName: 'iMessage',
          selected: true,
          requiresToken: false,
          tokenAvailable: true,
          savedInClaudeState: false,
          processEnvAvailable: false,
        },
      ],
    });
    const ready = buildOfficialChannelsReadinessSummary({
      config: { selected: ['telegram', 'discord'], unattended: false },
      environment: buildEnvironment(),
      channels: [
        {
          id: 'telegram',
          displayName: 'Telegram',
          selected: true,
          requiresToken: true,
          tokenAvailable: true,
          tokenSource: 'saved_env',
          savedInClaudeState: true,
          processEnvAvailable: false,
        },
        {
          id: 'discord',
          displayName: 'Discord',
          selected: true,
          requiresToken: true,
          tokenAvailable: true,
          tokenSource: 'process_env',
          savedInClaudeState: false,
          processEnvAvailable: true,
        },
      ],
    });

    expect(needsSetup).toMatchObject({
      state: 'needs_setup',
      title: 'Needs setup before CCS can auto-add these channels',
    });
    expect(needsSetup.blockers.join(' ')).toContain('Install Bun');
    expect(needsSetup.blockers.join(' ')).toContain('Missing bot token');

    expect(limited).toMatchObject({
      state: 'limited',
      title: 'Selected, but some channels still need manual setup',
    });
    expect(limited.blockers.join(' ')).toContain('iMessage still needs Claude-side install');

    expect(ready).toMatchObject({
      state: 'ready',
      title: 'Ready for the next native Claude run',
    });
    expect(ready.message).toContain('Discord currently depends on this same CCS process env');
  });

  it('builds a launch preview for the default `ccs` path', () => {
    const preview = buildOfficialChannelsLaunchPreview({
      config: { selected: ['telegram', 'discord'], unattended: true },
      environment: buildEnvironment(),
      channels: [
        {
          id: 'telegram',
          displayName: 'Telegram',
          selected: true,
          requiresToken: true,
          tokenAvailable: true,
          tokenSource: 'saved_env',
          savedInClaudeState: true,
          processEnvAvailable: false,
        },
        {
          id: 'discord',
          displayName: 'Discord',
          selected: true,
          requiresToken: true,
          tokenAvailable: true,
          tokenSource: 'process_env',
          savedInClaudeState: false,
          processEnvAvailable: true,
        },
      ],
    });

    expect(preview).toMatchObject({
      state: 'ready',
      title: 'CCS will auto-add Telegram, Discord',
      command: 'ccs',
      permissionBypassIncluded: true,
      appendedArgs: [
        '--channels',
        OFFICIAL_CHANNELS.telegram.pluginSpec,
        OFFICIAL_CHANNELS.discord.pluginSpec,
        '--dangerously-skip-permissions',
      ],
    });
  });

  it('keeps launch preview explicit when only part of the selection can be applied', () => {
    const preview = buildOfficialChannelsLaunchPreview({
      config: { selected: ['telegram', 'discord'], unattended: false },
      environment: buildEnvironment(),
      channels: [
        {
          id: 'telegram',
          displayName: 'Telegram',
          selected: true,
          requiresToken: true,
          tokenAvailable: false,
          tokenSource: 'missing',
          savedInClaudeState: false,
          processEnvAvailable: false,
        },
        {
          id: 'discord',
          displayName: 'Discord',
          selected: true,
          requiresToken: true,
          tokenAvailable: true,
          tokenSource: 'saved_env',
          savedInClaudeState: true,
          processEnvAvailable: false,
        },
      ],
    });

    expect(preview).toMatchObject({
      state: 'partial',
      title: 'CCS will auto-add Discord',
      command: 'ccs',
      appendedArgs: ['--channels', OFFICIAL_CHANNELS.discord.pluginSpec],
      skippedMessages: ['Telegram auto-enable skipped because TELEGRAM_BOT_TOKEN is not configured.'],
    });
  });
});
