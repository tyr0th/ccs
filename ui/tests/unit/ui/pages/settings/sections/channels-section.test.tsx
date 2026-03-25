import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, userEvent, waitFor } from '@tests/setup/test-utils';
import ChannelsSection from '@/pages/settings/sections/channels';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

function textResponse(payload: string, status = 200): Response {
  return new Response(payload, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

describe('ChannelsSection', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    fetchMock.mockReset();
  });

  it('keeps the token draft when saving fails and shows the backend error', async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = requestUrl(input);

      if (url.endsWith('/api/channels') && (!init || init.method === undefined)) {
        return jsonResponse({
          config: { selected: ['discord'], unattended: false },
          status: {
            bunInstalled: true,
            supportedProfiles: ['default', 'account'],
            supportMessage: 'Native Claude only. Not for ccs glm.',
            accountStatusCaveat: 'Dashboard status reflects the current CCS process.',
            stateScopeMessage: 'Machine-level Claude state',
            claudeVersion: {
              current: '2.1.81',
              minimum: '2.1.80',
              state: 'supported',
              message: 'Claude Code v2.1.81',
            },
            auth: {
              checked: true,
              loggedIn: true,
              authMethod: 'claude.ai',
              subscriptionType: 'pro',
              state: 'eligible',
              eligible: true,
              message: 'Authenticated with claude.ai.',
            },
            summary: {
              state: 'needs_setup',
              title: 'Needs setup before CCS can auto-add these channels',
              message: 'Missing bot token for Discord.',
              nextStep: 'Save DISCORD_BOT_TOKEN below.',
              blockers: ['Missing bot token for Discord.'],
            },
            launchPreview: {
              state: 'blocked',
              title: 'Running `ccs` now will not auto-add channels',
              detail: 'Discord still needs a saved token before CCS can add it.',
              command: 'ccs',
              appendedArgs: [],
              appliedChannels: [],
              permissionBypassIncluded: false,
              skippedMessages: ['Discord still needs a saved token before CCS can add it.'],
            },
            channels: [
              {
                id: 'discord',
                selected: true,
                displayName: 'Discord',
                pluginSpec: 'plugin:discord@claude-plugins-official',
                summary: 'Bot token required.',
                requiresToken: true,
                envKey: 'DISCORD_BOT_TOKEN',
                tokenConfigured: false,
                tokenAvailable: false,
                tokenSource: 'missing',
                tokenPath: '/tmp/.claude/channels/discord/.env',
                savedInClaudeState: false,
                processEnvAvailable: false,
                setup: {
                  state: 'needs_token',
                  label: 'Needs token',
                  detail: 'DISCORD_BOT_TOKEN is missing.',
                  nextStep: 'Save DISCORD_BOT_TOKEN below.',
                },
                manualSetupCommands: ['/discord:configure <token>'],
              },
            ],
          },
        });
      }

      if (url.endsWith('/api/config/raw')) {
        return textResponse('channels:\n  selected:\n    - discord\n');
      }

      if (url.endsWith('/api/channels/discord/token') && init?.method === 'PUT') {
        return jsonResponse({ error: 'Discord rejected token' }, 500);
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<ChannelsSection />, { withSettingsProvider: true });

    const tokenInput = await screen.findByPlaceholderText('Paste DISCORD_BOT_TOKEN');
    await userEvent.type(tokenInput, 'discord-secret');
    await userEvent.click(screen.getByRole('button', { name: 'Save Token' }));

    expect(await screen.findByText('Discord rejected token')).toBeInTheDocument();
    expect(tokenInput).toHaveValue('discord-secret');
  });

  it('keeps the token draft when refresh fails after a successful token save', async () => {
    let channelsRequestCount = 0;

    fetchMock.mockImplementation(async (input, init) => {
      const url = requestUrl(input);

      if (url.endsWith('/api/channels') && (!init || init.method === undefined)) {
        channelsRequestCount += 1;

        if (channelsRequestCount === 1) {
          return jsonResponse({
            config: { selected: ['discord'], unattended: false },
            status: {
              bunInstalled: true,
              supportedProfiles: ['default', 'account'],
              supportMessage: 'Native Claude only. Not for ccs glm.',
              accountStatusCaveat: 'Dashboard status reflects the current CCS process.',
              stateScopeMessage: 'Machine-level Claude state',
              claudeVersion: {
                current: '2.1.81',
                minimum: '2.1.80',
                state: 'supported',
                message: 'Claude Code v2.1.81',
              },
              auth: {
                checked: true,
                loggedIn: true,
                authMethod: 'claude.ai',
                subscriptionType: 'pro',
                state: 'eligible',
                eligible: true,
                message: 'Authenticated with claude.ai.',
              },
              summary: {
                state: 'needs_setup',
                title: 'Needs setup before CCS can auto-add these channels',
                message: 'Missing bot token for Discord.',
                nextStep: 'Save DISCORD_BOT_TOKEN below.',
                blockers: ['Missing bot token for Discord.'],
              },
              launchPreview: {
                state: 'blocked',
                title: 'Running `ccs` now will not auto-add channels',
                detail: 'Discord still needs a saved token before CCS can add it.',
                command: 'ccs',
                appendedArgs: [],
                appliedChannels: [],
                permissionBypassIncluded: false,
                skippedMessages: ['Discord still needs a saved token before CCS can add it.'],
              },
              channels: [
                {
                  id: 'discord',
                  selected: true,
                  displayName: 'Discord',
                  pluginSpec: 'plugin:discord@claude-plugins-official',
                  summary: 'Bot token required.',
                  requiresToken: true,
                  envKey: 'DISCORD_BOT_TOKEN',
                  tokenConfigured: false,
                  tokenAvailable: false,
                  tokenSource: 'missing',
                  tokenPath: '/tmp/.claude/channels/discord/.env',
                  savedInClaudeState: false,
                  processEnvAvailable: false,
                  setup: {
                    state: 'needs_token',
                    label: 'Needs token',
                    detail: 'DISCORD_BOT_TOKEN is missing.',
                    nextStep: 'Save DISCORD_BOT_TOKEN below.',
                  },
                  manualSetupCommands: ['/discord:configure <token>'],
                },
              ],
            },
          });
        }

        return jsonResponse({ error: 'Failed to load Official Channels settings' }, 500);
      }

      if (url.endsWith('/api/config/raw')) {
        return textResponse('channels:\n  selected:\n    - discord\n');
      }

      if (url.endsWith('/api/channels/discord/token') && init?.method === 'PUT') {
        return jsonResponse({ success: true, tokenConfigured: true, tokenPath: '/tmp/.env' });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<ChannelsSection />, { withSettingsProvider: true });

    const tokenInput = await screen.findByPlaceholderText('Paste DISCORD_BOT_TOKEN');
    await userEvent.type(tokenInput, 'discord-secret');
    await userEvent.click(screen.getByRole('button', { name: 'Save Token' }));

    expect(
      await screen.findByText('Failed to load Official Channels settings')
    ).toBeInTheDocument();
    expect(tokenInput).toHaveValue('discord-secret');
    expect(screen.queryByText('discord token saved')).not.toBeInTheDocument();
  });

  it('lets users turn off an unsupported selected channel', async () => {
    let channelsRequestCount = 0;

    fetchMock.mockImplementation(async (input, init) => {
      const url = requestUrl(input);

      if (url.endsWith('/api/channels') && (!init || init.method === undefined)) {
        channelsRequestCount += 1;

        return jsonResponse(
          channelsRequestCount === 1
            ? {
                config: { selected: ['imessage'], unattended: false },
                status: {
                  bunInstalled: true,
                  supportedProfiles: ['default', 'account'],
                  supportMessage: 'Native Claude only. Not for ccs glm.',
                  accountStatusCaveat: 'Dashboard status reflects the current CCS process.',
                  stateScopeMessage: 'Machine-level Claude state',
                  claudeVersion: {
                    current: '2.1.81',
                    minimum: '2.1.80',
                    state: 'supported',
                    message: 'Claude Code v2.1.81',
                  },
                  auth: {
                    checked: true,
                    loggedIn: true,
                    authMethod: 'claude.ai',
                    subscriptionType: 'pro',
                    state: 'eligible',
                    eligible: true,
                    message: 'Authenticated with claude.ai.',
                  },
                  summary: {
                    state: 'limited',
                    title: 'Selected, but some channels still need manual setup',
                    message: 'iMessage still needs Claude-side install.',
                    nextStep: 'Review the channel cards below.',
                    blockers: ['iMessage still needs Claude-side install.'],
                  },
                  launchPreview: {
                    state: 'blocked',
                    title: 'Running `ccs` now will not auto-add channels',
                    detail: 'iMessage requires macOS on this machine.',
                    command: 'ccs',
                    appendedArgs: [],
                    appliedChannels: [],
                    permissionBypassIncluded: false,
                    skippedMessages: ['iMessage requires macOS on this machine.'],
                  },
                  channels: [
                    {
                      id: 'imessage',
                      selected: true,
                      displayName: 'iMessage',
                      pluginSpec: 'plugin:imessage@claude-plugins-official',
                      summary: 'macOS only.',
                      requiresToken: false,
                      tokenConfigured: false,
                      tokenAvailable: true,
                      savedInClaudeState: false,
                      processEnvAvailable: false,
                      unavailableReason: 'Requires macOS.',
                      setup: {
                        state: 'unavailable',
                        label: 'Requires macOS.',
                        detail: 'iMessage is selected, but this machine cannot use it right now.',
                        nextStep: 'Turn it off here, or switch to a supported machine.',
                      },
                      manualSetupCommands: ['/imessage:access allow +15551234567'],
                    },
                  ],
                },
              }
            : {
                config: { selected: [], unattended: false },
                status: {
                  bunInstalled: true,
                  supportedProfiles: ['default', 'account'],
                  supportMessage: 'Native Claude only. Not for ccs glm.',
                  accountStatusCaveat: 'Dashboard status reflects the current CCS process.',
                  stateScopeMessage: 'Machine-level Claude state',
                  claudeVersion: {
                    current: '2.1.81',
                    minimum: '2.1.80',
                    state: 'supported',
                    message: 'Claude Code v2.1.81',
                  },
                  auth: {
                    checked: true,
                    loggedIn: true,
                    authMethod: 'claude.ai',
                    subscriptionType: 'pro',
                    state: 'eligible',
                    eligible: true,
                    message: 'Authenticated with claude.ai.',
                  },
                  summary: {
                    state: 'needs_setup',
                    title: 'No channels selected yet',
                    message: 'Choose at least one official channel before CCS can auto-add it.',
                    nextStep: 'Turn on Telegram, Discord, and/or iMessage below.',
                    blockers: ['Select at least one channel for auto-enable.'],
                  },
                  launchPreview: {
                    state: 'disabled',
                    title: 'Nothing will be auto-added yet',
                    detail:
                      'Turn on at least one channel below before `ccs` can add official channel flags.',
                    command: 'ccs',
                    appendedArgs: [],
                    appliedChannels: [],
                    permissionBypassIncluded: false,
                    skippedMessages: [],
                  },
                  channels: [
                    {
                      id: 'imessage',
                      selected: false,
                      displayName: 'iMessage',
                      pluginSpec: 'plugin:imessage@claude-plugins-official',
                      summary: 'macOS only.',
                      requiresToken: false,
                      tokenConfigured: false,
                      tokenAvailable: true,
                      savedInClaudeState: false,
                      processEnvAvailable: false,
                      unavailableReason: 'Requires macOS.',
                      setup: {
                        state: 'not_selected',
                        label: 'Not selected',
                        detail: 'CCS will not auto-add this channel until you turn it on here.',
                        nextStep:
                          'Turn this channel on if you want CCS to add it on supported native Claude runs.',
                      },
                      manualSetupCommands: ['/imessage:access allow +15551234567'],
                    },
                  ],
                },
              }
        );
      }

      if (url.endsWith('/api/config/raw')) {
        return textResponse('channels:\n  selected:\n    - imessage\n');
      }

      if (url.endsWith('/api/channels') && init?.method === 'PUT') {
        return jsonResponse({
          config: { selected: [], unattended: false },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<ChannelsSection />, { withSettingsProvider: true });

    const switches = await screen.findAllByRole('switch');
    const imessageSwitch = switches[0];

    expect(imessageSwitch).not.toBeDisabled();

    await userEvent.click(imessageSwitch);

    await waitFor(() => {
      const updateCall = fetchMock.mock.calls.find(
        ([input, init]) => requestUrl(input).endsWith('/api/channels') && init?.method === 'PUT'
      );

      expect(updateCall).toBeDefined();
      expect(JSON.parse(String(updateCall?.[1]?.body))).toEqual({ selected: [] });
    });
  });

  it('surfaces process-env readiness and the native-only limitation clearly', async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = requestUrl(input);

      if (url.endsWith('/api/channels') && (!init || init.method === undefined)) {
        return jsonResponse({
          config: { selected: ['discord'], unattended: false },
          status: {
            bunInstalled: true,
            supportedProfiles: ['default', 'account'],
            supportMessage:
              'Works only for native Claude default/account sessions. Not for ccs glm.',
            accountStatusCaveat: 'Dashboard status reflects the current CCS process.',
            stateScopeMessage: 'Machine-level Claude state',
            claudeVersion: {
              current: '2.1.81',
              minimum: '2.1.80',
              state: 'supported',
              message: 'Claude Code v2.1.81',
            },
            auth: {
              checked: true,
              loggedIn: true,
              authMethod: 'claude.ai',
              subscriptionType: 'pro',
              state: 'eligible',
              eligible: true,
              message: 'Authenticated with claude.ai.',
            },
            summary: {
              state: 'ready',
              title: 'Ready for the next native Claude run',
              message: 'CCS can auto-add Discord the next time you run ccs.',
              nextStep: 'Run ccs from a supported native Claude session.',
              blockers: [],
            },
            launchPreview: {
              state: 'ready',
              title: 'CCS will auto-add Discord',
              detail:
                'Running `ccs` will add the selected official channels automatically on this machine.',
              command: 'ccs',
              appendedArgs: ['--channels', 'plugin:discord@claude-plugins-official'],
              appliedChannels: ['discord'],
              permissionBypassIncluded: false,
              skippedMessages: [],
            },
            channels: [
              {
                id: 'discord',
                selected: true,
                displayName: 'Discord',
                pluginSpec: 'plugin:discord@claude-plugins-official',
                summary: 'Bot token required.',
                requiresToken: true,
                envKey: 'DISCORD_BOT_TOKEN',
                tokenConfigured: false,
                tokenAvailable: true,
                tokenSource: 'process_env',
                savedInClaudeState: false,
                processEnvAvailable: true,
                setup: {
                  state: 'ready',
                  label: 'Ready from current CCS process env',
                  detail: 'DISCORD_BOT_TOKEN is available from the current CCS process env.',
                  nextStep: 'Run CCS from this same env.',
                },
                manualSetupCommands: ['/discord:configure <token>'],
              },
            ],
          },
        });
      }

      if (url.endsWith('/api/config/raw')) {
        return textResponse('channels:\n  selected:\n    - discord\n');
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<ChannelsSection />, { withSettingsProvider: true });

    expect(await screen.findByText('Ready for the next native Claude run')).toBeInTheDocument();
    expect(screen.getByText('Fastest path')).toBeInTheDocument();
    expect(screen.getByText(/If you run/i)).toBeInTheDocument();
    expect(screen.getByText('CCS will auto-add Discord')).toBeInTheDocument();
    expect(screen.getByText(/CCS adds:/i)).toBeInTheDocument();
    expect(screen.getByText(/Not for ccs glm/i)).toBeInTheDocument();
    expect(screen.getByText('Ready from current CCS process env')).toBeInTheDocument();
    expect(screen.getByText('Skip permission prompts on launch')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(
        'Using current CCS process env. Enter a new DISCORD_BOT_TOKEN to save it for Claude.'
      )
    ).toBeInTheDocument();
  });
});
