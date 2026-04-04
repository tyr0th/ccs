import { FileCode2, History, PenLine, Settings2 } from 'lucide-react';
import { CodexFeaturesCard } from '@/components/compatible-cli/codex-features-card';
import { CodexMcpServersCard } from '@/components/compatible-cli/codex-mcp-servers-card';
import { CodexModelProvidersCard } from '@/components/compatible-cli/codex-model-providers-card';
import { CodexProfilesCard } from '@/components/compatible-cli/codex-profiles-card';
import { CodexProjectTrustCard } from '@/components/compatible-cli/codex-project-trust-card';
import { CodexTopLevelControlsCard } from '@/components/compatible-cli/codex-top-level-controls-card';
import { ScrollArea } from '@/components/ui/scroll-area';
import type {
  CodexConfigPatchInput,
  CodexProfilePatchValues,
  CodexTopLevelSettingsPatch,
} from '@/hooks/use-codex-types';
import type {
  CodexFeatureCatalogEntry,
  CodexMcpServerEntry,
  CodexModelProviderEntry,
  CodexProfileEntry,
  CodexProjectTrustEntry,
  CodexTopLevelSettingsView,
} from '@/lib/codex-config';

interface CodexControlCenterTabProps {
  workspacePath: string;
  activeProfile: string | null;
  topLevelSettings: CodexTopLevelSettingsView;
  projectTrustEntries: CodexProjectTrustEntry[];
  profileEntries: CodexProfileEntry[];
  modelProviderEntries: CodexModelProviderEntry[];
  mcpServerEntries: CodexMcpServerEntry[];
  featureCatalog: CodexFeatureCatalogEntry[];
  featureState: Record<string, boolean | null>;
  disabled: boolean;
  disabledReason: string | null;
  saving: boolean;
  onPatch: (patch: CodexConfigPatchInput, successMessage: string) => Promise<void>;
}

export function CodexControlCenterTab({
  workspacePath,
  activeProfile,
  topLevelSettings,
  projectTrustEntries,
  profileEntries,
  modelProviderEntries,
  mcpServerEntries,
  featureCatalog,
  featureState,
  disabled,
  disabledReason,
  saving,
  onPatch,
}: CodexControlCenterTabProps) {
  return (
    <ScrollArea className="h-full">
      <div className="space-y-6 pr-1 pb-6">
        <div className="group relative overflow-hidden rounded-xl border border-border/80 bg-background/50 p-5 shadow-sm transition-all hover:bg-background hover:shadow-md dark:border-border/60">
          <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-foreground/15 to-transparent transition-opacity group-hover:via-foreground/30"></div>

          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex-1 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary transition-colors group-hover:border-primary/30">
                  <Settings2 className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-base font-semibold tracking-tight text-foreground">
                    Structured controls boundary
                  </h2>
                </div>
              </div>

              <ul className="grid gap-3 sm:grid-cols-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2.5">
                  <PenLine className="h-4 w-4 shrink-0 text-muted-foreground/60 mt-0.5" />
                  <span className="leading-relaxed">
                    Writes exclusively to user-layer{' '}
                    <code className="text-[11px] bg-muted/70 px-1.5 py-0.5 rounded border border-border/50">
                      config.toml
                    </code>
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <History className="h-4 w-4 shrink-0 text-muted-foreground/60 mt-0.5" />
                  <span className="leading-relaxed">
                    Does not reflect repo trust layers or CLI overrides
                  </span>
                </li>
              </ul>
            </div>

            <div className="shrink-0 lg:w-[280px]">
              <div className="relative overflow-hidden rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 transition-colors group-hover:border-amber-500/30 group-hover:bg-amber-500/10 dark:border-amber-400/10 dark:bg-amber-400/5">
                <div className="flex items-start gap-3">
                  <FileCode2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div className="space-y-1">
                    <p className="text-[11px] font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wider">
                      Formatting Note
                    </p>
                    <p className="text-[13px] leading-relaxed text-amber-800/80 dark:text-amber-200/70">
                      Saves normalize TOML formatting and strip comments. Switch to the raw editor
                      if exact layout matters.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <CodexTopLevelControlsCard
          values={topLevelSettings}
          providerNames={modelProviderEntries.map((entry) => entry.name)}
          disabled={disabled}
          disabledReason={disabledReason}
          saving={saving}
          onSave={(values: CodexTopLevelSettingsPatch) =>
            onPatch({ kind: 'top-level', values }, 'Saved top-level Codex settings.')
          }
        />

        <CodexProjectTrustCard
          workspacePath={workspacePath}
          entries={projectTrustEntries}
          disabled={disabled}
          disabledReason={disabledReason}
          saving={saving}
          onSave={(projectPath, trustLevel) =>
            onPatch(
              { kind: 'project-trust', path: projectPath, trustLevel },
              trustLevel ? 'Saved project trust entry.' : 'Removed project trust entry.'
            )
          }
        />

        <CodexProfilesCard
          activeProfile={activeProfile}
          entries={profileEntries}
          providerNames={modelProviderEntries.map((entry) => entry.name)}
          disabled={disabled}
          disabledReason={disabledReason}
          saving={saving}
          onSave={(name, values: CodexProfilePatchValues, setAsActive) =>
            onPatch(
              { kind: 'profile', action: 'upsert', name, values, setAsActive },
              'Saved profile.'
            )
          }
          onDelete={(name) =>
            onPatch({ kind: 'profile', action: 'delete', name }, 'Deleted profile.')
          }
          onSetActive={(name) =>
            onPatch({ kind: 'profile', action: 'set-active', name }, 'Set active profile.')
          }
        />

        <CodexModelProvidersCard
          entries={modelProviderEntries}
          disabled={disabled}
          disabledReason={disabledReason}
          saving={saving}
          onSave={(name, values) =>
            onPatch(
              { kind: 'model-provider', action: 'upsert', name, values },
              'Saved model provider.'
            )
          }
          onDelete={(name) =>
            onPatch({ kind: 'model-provider', action: 'delete', name }, 'Deleted model provider.')
          }
        />

        <CodexMcpServersCard
          entries={mcpServerEntries}
          disabled={disabled}
          disabledReason={disabledReason}
          saving={saving}
          onSave={(name, values) =>
            onPatch({ kind: 'mcp-server', action: 'upsert', name, values }, 'Saved MCP server.')
          }
          onDelete={(name) =>
            onPatch({ kind: 'mcp-server', action: 'delete', name }, 'Deleted MCP server.')
          }
        />

        <CodexFeaturesCard
          catalog={featureCatalog}
          state={featureState}
          disabled={disabled}
          disabledReason={disabledReason}
          onToggle={(feature, enabled) =>
            onPatch({ kind: 'feature', feature, enabled }, 'Saved feature toggle.')
          }
        />
      </div>
    </ScrollArea>
  );
}
