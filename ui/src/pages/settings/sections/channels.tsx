import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import {
  AlertCircle,
  CheckCircle2,
  MessageSquare,
  RefreshCw,
  Save,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { useOfficialChannelsConfig } from '../hooks/use-official-channels-config';
import { useRawConfig } from '../hooks';
import type { OfficialChannelId } from '../types';

type TokenDrafts = Record<OfficialChannelId, string>;

const EMPTY_DRAFTS: TokenDrafts = {
  telegram: '',
  discord: '',
  imessage: '',
};

function getSummaryClasses(state: 'ready' | 'needs_setup' | 'limited'): string {
  if (state === 'ready') {
    return 'border-green-200 bg-green-50 text-green-900 dark:border-green-900/60 dark:bg-green-950/40 dark:text-green-100';
  }
  if (state === 'limited') {
    return 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100';
  }

  return 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-100';
}

function getSetupBadgeVariant(state: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (state === 'ready') {
    return 'default';
  }
  if (state === 'not_selected') {
    return 'secondary';
  }
  if (state === 'unavailable') {
    return 'destructive';
  }

  return 'outline';
}

function getLaunchPreviewBadgeVariant(
  state: 'disabled' | 'blocked' | 'partial' | 'ready'
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (state === 'ready') {
    return 'default';
  }
  if (state === 'partial') {
    return 'outline';
  }
  if (state === 'blocked') {
    return 'destructive';
  }

  return 'secondary';
}

function getSelectedChannelLabel(
  selected: OfficialChannelId[],
  channels: Array<{ id: OfficialChannelId; displayName: string }> | undefined
): string {
  if (selected.length === 0) {
    return 'None selected';
  }

  return selected
    .map(
      (channelId) => channels?.find((channel) => channel.id === channelId)?.displayName ?? channelId
    )
    .join(', ');
}

export default function ChannelsSection() {
  const {
    config,
    status,
    loading,
    saving,
    error,
    success,
    fetchConfig,
    updateConfig,
    saveToken,
    clearToken,
  } = useOfficialChannelsConfig();
  const { fetchRawConfig } = useRawConfig();
  const [tokenDrafts, setTokenDrafts] = useState<TokenDrafts>(EMPTY_DRAFTS);
  const selectedChannelLabel = getSelectedChannelLabel(config.selected, status?.channels);

  useEffect(() => {
    void fetchConfig();
    void fetchRawConfig();
  }, [fetchConfig, fetchRawConfig]);

  const refreshAll = async () => {
    await Promise.all([fetchConfig(), fetchRawConfig()]);
  };

  const toggleChannel = async (channelId: OfficialChannelId, checked: boolean): Promise<void> => {
    const nextSelected = checked
      ? [...new Set([...config.selected, channelId])]
      : config.selected.filter((value) => value !== channelId);

    const updated = await updateConfig(
      { selected: nextSelected },
      checked ? `${channelId} selected for auto-enable` : `${channelId} removed from auto-enable`
    );
    if (updated) {
      await Promise.all([fetchConfig(), fetchRawConfig()]);
    }
  };

  const updateTokenDraft = (channelId: OfficialChannelId, value: string) => {
    setTokenDrafts((current) => ({ ...current, [channelId]: value }));
  };

  const handleSaveToken = async (channelId: OfficialChannelId): Promise<void> => {
    const saved = await saveToken(channelId, tokenDrafts[channelId]);
    if (saved) {
      setTokenDrafts((current) => ({ ...current, [channelId]: '' }));
      await fetchRawConfig();
    }
  };

  const handleClearToken = async (channelId: OfficialChannelId): Promise<void> => {
    const cleared = await clearToken(channelId);
    if (cleared) {
      setTokenDrafts((current) => ({ ...current, [channelId]: '' }));
      await fetchRawConfig();
    }
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span>Loading</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className={`absolute left-5 right-5 top-20 z-10 transition-all duration-200 ease-out ${
          error || success
            ? 'translate-y-0 opacity-100'
            : 'pointer-events-none -translate-y-2 opacity-0'
        }`}
      >
        {error && (
          <Alert variant="destructive" className="py-2 shadow-lg">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {success && (
          <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-green-700 shadow-lg dark:border-green-900/50 dark:bg-green-900/90 dark:text-green-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span className="text-sm font-medium">{success}</span>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-6 p-5">
          <div className="flex items-start gap-3">
            <MessageSquare className="h-5 w-5 text-primary" />
            <div className="space-y-1">
              <p className="font-medium">Official Channels</p>
              <p className="text-sm text-muted-foreground">
                Configure official Claude channels here, then run <code>ccs</code> normally on a
                supported native Claude session.
              </p>
              <p className="text-sm text-muted-foreground">
                CCS stores only channel selection in <code>config.yaml</code>. Claude keeps the
                machine-level channel state under <code>~/.claude/channels/</code>.
              </p>
            </div>
          </div>

          {status && (
            <div className={`rounded-xl border p-4 ${getSummaryClasses(status.summary.state)}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={status.summary.state === 'ready' ? 'default' : 'outline'}>
                      {status.summary.title}
                    </Badge>
                    <span className="text-sm font-medium">{selectedChannelLabel}</span>
                  </div>
                  <p className="text-sm">{status.summary.message}</p>
                  <p className="text-sm opacity-90">{status.summary.nextStep}</p>
                </div>
                <div className="min-w-[220px] rounded-lg border border-current/10 bg-background/60 p-3 text-sm text-foreground">
                  <p className="font-medium">Machine checks</p>
                  <div className="mt-2 space-y-1 text-muted-foreground">
                    <div className="flex items-center justify-between gap-4">
                      <span>Bun</span>
                      <span>{status.bunInstalled ? 'Installed' : 'Missing'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span>Claude Code</span>
                      <span>
                        {status.claudeVersion.current
                          ? `v${status.claudeVersion.current}`
                          : 'Unknown'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span>Claude auth</span>
                      <span>{status.auth.authMethod ?? 'Unknown'}</span>
                    </div>
                  </div>
                </div>
              </div>
              {status.summary.blockers.length > 0 && (
                <div className="mt-3 space-y-1 text-sm">
                  {status.summary.blockers.map((blocker) => (
                    <p key={blocker}>{blocker}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {status && (
            <div className="rounded-lg border bg-muted/20 p-4">
              <p className="font-medium">Fastest path</p>
              <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                <p>1. Turn on the channels you want below.</p>
                <p>2. Save Telegram or Discord bot tokens here if that channel needs one.</p>
                <p>
                  3. Run <code>ccs</code> or a native Claude account profile. CCS adds{' '}
                  <code>--channels</code> for you on supported runs.
                </p>
                <p>{status.supportMessage}</p>
              </div>
              <details className="mt-3 rounded-lg border bg-background p-4">
                <summary className="cursor-pointer text-sm font-medium">
                  Advanced notes and scope
                </summary>
                <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <p>{status.accountStatusCaveat}</p>
                  <p>{status.stateScopeMessage}</p>
                </div>
              </details>
            </div>
          )}

          {status && (
            <div className="rounded-lg border bg-background p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-medium">
                    If you run <code>ccs</code> now
                  </p>
                  <p className="text-sm text-muted-foreground">{status.launchPreview.detail}</p>
                </div>
                <Badge variant={getLaunchPreviewBadgeVariant(status.launchPreview.state)}>
                  {status.launchPreview.title}
                </Badge>
              </div>
              <div className="mt-3 space-y-2">
                <div className="rounded-md bg-muted px-3 py-2 font-mono text-sm">
                  <span className="text-muted-foreground">You type:</span>{' '}
                  {status.launchPreview.command}
                </div>
                <div className="rounded-md bg-muted px-3 py-2 font-mono text-sm break-all">
                  <span className="text-muted-foreground">CCS adds:</span>{' '}
                  {status.launchPreview.appendedArgs.length > 0
                    ? status.launchPreview.appendedArgs.join(' ')
                    : '(nothing yet)'}
                </div>
              </div>
              {status.launchPreview.skippedMessages.length > 0 && (
                <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                  {status.launchPreview.skippedMessages.map((message) => (
                    <p key={message}>{message}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {status?.claudeVersion.message && status.claudeVersion.state !== 'supported' && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{status.claudeVersion.message}</AlertDescription>
            </Alert>
          )}

          {status?.auth.message && status.auth.state !== 'eligible' && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{status.auth.message}</AlertDescription>
            </Alert>
          )}

          {status?.auth.orgRequirementMessage && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{status.auth.orgRequirementMessage}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            {status?.channels.map((channel) => {
              const enabled = config.selected.includes(channel.id);
              const tokenDraft = tokenDrafts[channel.id];

              return (
                <div key={channel.id} className="rounded-lg border p-4 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <Label className="text-base font-medium">{channel.displayName}</Label>
                      <p className="mt-1 text-sm text-muted-foreground">{channel.summary}</p>
                      <p className="mt-2 font-mono text-xs text-muted-foreground">
                        {channel.pluginSpec}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={getSetupBadgeVariant(channel.setup.state)}>
                        {channel.setup.label}
                      </Badge>
                      <Switch
                        checked={enabled}
                        disabled={saving || (Boolean(channel.unavailableReason) && !enabled)}
                        onCheckedChange={(checked) => void toggleChannel(channel.id, checked)}
                      />
                    </div>
                  </div>

                  <div className="rounded-lg bg-muted/30 p-4 text-sm text-muted-foreground space-y-2">
                    <p>{channel.setup.detail}</p>
                    <p>{channel.setup.nextStep}</p>
                  </div>

                  {channel.requiresToken && (
                    <div className="space-y-3 rounded-lg bg-muted/30 p-4">
                      <p className="text-sm text-muted-foreground">
                        {!channel.tokenConfigured && channel.tokenSource === 'process_env'
                          ? `The current CCS process already has ${channel.envKey}. Save it here only if you want persistent Claude channel state.`
                          : channel.tokenConfigured && channel.processEnvAvailable
                            ? `${channel.envKey} is saved in Claude channel state, and the current CCS process env also provides it.`
                            : `Save ${channel.envKey} in Claude's official channel env file. The dashboard never reads the token value back after save.`}
                      </p>
                      {channel.tokenConfigured && (
                        <p className="text-sm text-muted-foreground">
                          Saving here writes the same <code>.env</code> file as{' '}
                          <code>/{channel.id}:configure</code>, so you do not need to run the
                          configure command again after a successful save.
                        </p>
                      )}
                      <Input
                        type="password"
                        value={tokenDraft}
                        onChange={(event) => updateTokenDraft(channel.id, event.target.value)}
                        placeholder={
                          channel.tokenConfigured
                            ? `Configured. Enter a new ${channel.envKey} to replace it.`
                            : !channel.tokenConfigured && channel.tokenSource === 'process_env'
                              ? `Using current CCS process env. Enter a new ${channel.envKey} to save it for Claude.`
                              : `Paste ${channel.envKey}`
                        }
                        disabled={saving}
                      />
                      {channel.tokenPath && channel.tokenSource !== 'process_env' && (
                        <div className="text-xs text-muted-foreground break-all">
                          {channel.tokenPath}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          onClick={() => void handleSaveToken(channel.id)}
                          disabled={saving || !tokenDraft.trim()}
                        >
                          <Save className="mr-2 h-4 w-4" />
                          Save Token
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => void handleClearToken(channel.id)}
                          disabled={saving || !channel.tokenConfigured}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Clear Saved Token
                        </Button>
                      </div>
                    </div>
                  )}

                  <details className="rounded-lg border bg-background p-4">
                    <summary className="cursor-pointer text-sm font-medium">
                      Claude-side setup commands
                    </summary>
                    <div className="mt-3 space-y-2">
                      {(channel.manualSetupCommands ?? []).map((command) => (
                        <div
                          key={command}
                          className="rounded-md bg-muted px-3 py-2 font-mono text-sm break-all"
                        >
                          {command}
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              );
            })}
          </div>

          <Alert>
            <AlertDescription>
              CCS injects <code>--channels</code> only for the current Claude session. Telegram,
              Discord, and iMessage stop receiving messages when that Claude session exits.
            </AlertDescription>
          </Alert>

          <div className="rounded-lg border p-4">
            <div className="flex items-start justify-between gap-4 rounded-lg bg-muted/30 p-4">
              <div className="flex gap-3">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div>
                  <Label className="text-sm font-medium">Skip permission prompts on launch</Label>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Optional advanced behavior. CCS adds <code>--dangerously-skip-permissions</code>{' '}
                    only when at least one selected channel is being auto-enabled and you did not
                    already pass a permission flag yourself.
                  </p>
                </div>
              </div>
              <Switch
                checked={config.unattended}
                disabled={saving}
                onCheckedChange={(checked) =>
                  void (async () => {
                    const updated = await updateConfig(
                      { unattended: checked },
                      checked ? 'Unattended mode enabled' : 'Unattended mode disabled'
                    );
                    if (updated) {
                      await fetchRawConfig();
                    }
                  })()
                }
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" onClick={() => void refreshAll()} disabled={saving}>
              <RefreshCw className={`mr-2 h-4 w-4 ${saving ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </ScrollArea>
    </>
  );
}
