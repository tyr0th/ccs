import { useState } from 'react';
import { CircleAlert, Loader2, SlidersHorizontal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CodexTopLevelSettingsPatch } from '@/hooks/use-codex-types';
import type { CodexTopLevelSettingsView } from '@/lib/codex-config';
import { CodexConfigCardShell } from './codex-config-card-shell';

const UNSET = '__unset__';
const GPT_54_MAX_CONTEXT_WINDOW = 1_050_000;
const GPT_54_STANDARD_CONTEXT_WINDOW = 272_000;
const CCS_GPT_54_STARTER_CONTEXT_WINDOW = 800_000;
const CCS_GPT_54_STARTER_AUTO_COMPACT_TOKEN_LIMIT = 700_000;
const INTEGER_FORMATTER = new Intl.NumberFormat('en-US');

interface CodexTopLevelControlsCardProps {
  values: CodexTopLevelSettingsView;
  providerNames: string[];
  disabled?: boolean;
  disabledReason?: string | null;
  saving?: boolean;
  onSave: (values: CodexTopLevelSettingsPatch) => Promise<void> | void;
}

function toSelectValue(value: string | null | undefined) {
  return value ?? UNSET;
}

function withCurrentValue(options: string[], current: string | null | undefined) {
  return current && !options.includes(current) ? [current, ...options] : options;
}

function formatInteger(value: number) {
  return INTEGER_FORMATTER.format(value);
}

function isGpt54ModelId(value: string | null | undefined) {
  return value?.trim().toLowerCase().startsWith('gpt-5.4') ?? false;
}

function buildTopLevelPatch(
  initialValues: CodexTopLevelSettingsView,
  draft: CodexTopLevelSettingsView
): CodexTopLevelSettingsPatch {
  const patch: CodexTopLevelSettingsPatch = {};

  if (draft.model !== initialValues.model) patch.model = draft.model;
  if (draft.modelReasoningEffort !== initialValues.modelReasoningEffort) {
    patch.modelReasoningEffort = draft.modelReasoningEffort;
  }
  if (draft.modelContextWindow !== initialValues.modelContextWindow) {
    patch.modelContextWindow = draft.modelContextWindow;
  }
  if (draft.modelAutoCompactTokenLimit !== initialValues.modelAutoCompactTokenLimit) {
    patch.modelAutoCompactTokenLimit = draft.modelAutoCompactTokenLimit;
  }
  if (draft.modelProvider !== initialValues.modelProvider) {
    patch.modelProvider = draft.modelProvider;
  }
  if (draft.approvalPolicy !== initialValues.approvalPolicy) {
    patch.approvalPolicy = draft.approvalPolicy;
  }
  if (draft.sandboxMode !== initialValues.sandboxMode) patch.sandboxMode = draft.sandboxMode;
  if (draft.webSearch !== initialValues.webSearch) patch.webSearch = draft.webSearch;
  if (draft.toolOutputTokenLimit !== initialValues.toolOutputTokenLimit) {
    patch.toolOutputTokenLimit = draft.toolOutputTokenLimit;
  }
  if (draft.personality !== initialValues.personality) patch.personality = draft.personality;

  return patch;
}

interface TopLevelControlsFormProps {
  initialValues: CodexTopLevelSettingsView;
  providerNames: string[];
  disabled: boolean;
  saving: boolean;
  onSave: (values: CodexTopLevelSettingsPatch) => Promise<void> | void;
}

function TopLevelControlsForm({
  initialValues,
  providerNames,
  disabled,
  saving,
  onSave,
}: TopLevelControlsFormProps) {
  const [draft, setDraft] = useState<CodexTopLevelSettingsView>(initialValues);
  const reasoningOptions = withCurrentValue(
    ['minimal', 'low', 'medium', 'high', 'xhigh'],
    draft.modelReasoningEffort
  );
  const providerOptions = withCurrentValue(providerNames, draft.modelProvider);
  const approvalOptions = withCurrentValue(
    ['on-request', 'never', 'untrusted'],
    draft.approvalPolicy
  );
  const sandboxOptions = withCurrentValue(
    ['read-only', 'workspace-write', 'danger-full-access'],
    draft.sandboxMode
  );
  const webSearchOptions = withCurrentValue(['cached', 'live', 'disabled'], draft.webSearch);
  const personalityOptions = withCurrentValue(['none', 'friendly', 'pragmatic'], draft.personality);
  const patch = buildTopLevelPatch(initialValues, draft);
  const hasChanges = Object.keys(patch).length > 0;
  const isGpt54Selected = isGpt54ModelId(draft.model);
  const parseOptionalInteger = (value: string) => {
    const trimmed = value.trim();
    return trimmed.length > 0 ? Number(trimmed) : null;
  };

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <p className="text-xs font-medium">Model</p>
          <Input
            value={draft.model ?? ''}
            onChange={(event) =>
              setDraft((current) => ({ ...current, model: event.target.value || null }))
            }
            placeholder="gpt-5.4"
            disabled={disabled}
          />
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium">Reasoning effort</p>
          <Select
            value={toSelectValue(draft.modelReasoningEffort)}
            onValueChange={(next) =>
              setDraft((current) => ({
                ...current,
                modelReasoningEffort: next === UNSET ? null : next,
              }))
            }
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder="Use default" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSET}>Use default</SelectItem>
              {reasoningOptions.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium">Default provider</p>
          <Select
            value={toSelectValue(draft.modelProvider)}
            onValueChange={(next) =>
              setDraft((current) => ({ ...current, modelProvider: next === UNSET ? null : next }))
            }
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder="Use Codex default" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSET}>Use Codex default</SelectItem>
              {providerOptions.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium">Approval policy</p>
          <Select
            value={toSelectValue(draft.approvalPolicy)}
            onValueChange={(next) =>
              setDraft((current) => ({ ...current, approvalPolicy: next === UNSET ? null : next }))
            }
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder="Use default" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSET}>Use default</SelectItem>
              {approvalOptions.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium">Sandbox mode</p>
          <Select
            value={toSelectValue(draft.sandboxMode)}
            onValueChange={(next) =>
              setDraft((current) => ({ ...current, sandboxMode: next === UNSET ? null : next }))
            }
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder="Use default" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSET}>Use default</SelectItem>
              {sandboxOptions.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium">Web search</p>
          <Select
            value={toSelectValue(draft.webSearch)}
            onValueChange={(next) =>
              setDraft((current) => ({ ...current, webSearch: next === UNSET ? null : next }))
            }
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder="Use default" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSET}>Use default</SelectItem>
              {webSearchOptions.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium">Tool output token limit</p>
          <Input
            type="number"
            min={1}
            value={draft.toolOutputTokenLimit ?? ''}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                toolOutputTokenLimit: event.target.value ? Number(event.target.value) : null,
              }))
            }
            placeholder="25000"
            disabled={disabled}
          />
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium">Personality</p>
          <Select
            value={toSelectValue(draft.personality)}
            onValueChange={(next) =>
              setDraft((current) => ({ ...current, personality: next === UNSET ? null : next }))
            }
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder="Use default" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSET}>Use default</SelectItem>
              {personalityOptions.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 shadow-sm dark:bg-amber-400/5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <CircleAlert className="h-4 w-4 text-amber-600 dark:text-amber-300" />
              <p className="text-sm font-semibold">Long context override</p>
              <Badge
                variant="outline"
                className="border-amber-500/40 bg-background/80 text-[10px] uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300"
              >
                Manual opt-in only
              </Badge>
              <Badge
                variant="secondary"
                className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
              >
                {isGpt54Selected ? 'GPT-5.4 selected' : 'GPT-5.4 reference'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Draft values only. Nothing applies until Save.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  modelContextWindow: CCS_GPT_54_STARTER_CONTEXT_WINDOW,
                  modelAutoCompactTokenLimit: CCS_GPT_54_STARTER_AUTO_COMPACT_TOKEN_LIMIT,
                }))
              }
            >
              Fill cautious pair
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  modelContextWindow: GPT_54_MAX_CONTEXT_WINDOW,
                }))
              }
            >
              Set official max window
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  modelContextWindow: null,
                  modelAutoCompactTokenLimit: null,
                }))
              }
            >
              Clear
            </Button>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border bg-background/85 px-3 py-3 shadow-sm shadow-black/5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Official max
            </p>
            <p className="mt-1 font-mono text-base font-semibold text-foreground">1.05M / 1M</p>
            <p className="mt-1 text-[11px] text-muted-foreground">GPT-5.4 context cap</p>
          </div>
          <div className="rounded-lg border bg-background/85 px-3 py-3 shadow-sm shadow-black/5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Standard window
            </p>
            <p className="mt-1 font-mono text-base font-semibold text-foreground">
              {formatInteger(GPT_54_STANDARD_CONTEXT_WINDOW)}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">Normal usage window</p>
          </div>
          <div className="rounded-lg border bg-background/85 px-3 py-3 shadow-sm shadow-black/5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Above 272K
            </p>
            <p className="mt-1 font-mono text-base font-semibold text-foreground">Counts 2x</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Usage-limit cost above 272K</p>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border bg-background/75 px-3 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                One cautious pair
              </p>
              <div className="rounded-full border bg-background px-2.5 py-1 font-mono text-[11px] font-medium">
                Context {formatInteger(CCS_GPT_54_STARTER_CONTEXT_WINDOW)}
              </div>
              <div className="rounded-full border bg-background px-2.5 py-1 font-mono text-[11px] font-medium">
                Auto-compact {formatInteger(CCS_GPT_54_STARTER_AUTO_COMPACT_TOKEN_LIMIT)}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge
                variant="outline"
                className="border-border/70 bg-background/80 text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
              >
                Not official
              </Badge>
              <Badge
                variant="outline"
                className="border-border/70 bg-background/80 text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
              >
                Draft only
              </Badge>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span>Quick-fill only. Review before saving.</span>
            {!isGpt54Selected && draft.model ? (
              <span>
                <code>{draft.model}</code> should be checked separately.
              </span>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <p className="text-xs font-medium">Model context window</p>
            <Input
              aria-label="Model context window"
              type="number"
              min={1}
              value={draft.modelContextWindow ?? ''}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  modelContextWindow: parseOptionalInteger(event.target.value),
                }))
              }
              placeholder="Unset"
              disabled={disabled}
            />
            <p className="text-xs text-muted-foreground">
              Writes <code>model_context_window</code>. Leave unset to keep Codex defaults.
            </p>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium">Auto-compact token limit</p>
            <Input
              aria-label="Auto-compact token limit"
              type="number"
              min={1}
              value={draft.modelAutoCompactTokenLimit ?? ''}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  modelAutoCompactTokenLimit: parseOptionalInteger(event.target.value),
                }))
              }
              placeholder="Unset"
              disabled={disabled}
            />
            <p className="text-xs text-muted-foreground">
              Writes <code>model_auto_compact_token_limit</code>. Leave unset to keep model
              defaults.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span className="text-[10px] uppercase tracking-[0.14em]">Docs</span>
          <a
            href="https://developers.openai.com/api/docs/models/gpt-5.4"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            GPT-5.4 model page
          </a>
          <a
            href="https://openai.com/index/introducing-gpt-5-4/"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Release notes
          </a>
          <a
            href="https://developers.openai.com/codex/config-reference"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Config reference
          </a>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => onSave(patch)} disabled={disabled || saving || !hasChanges}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save top-level settings
        </Button>
      </div>
    </>
  );
}

export function CodexTopLevelControlsCard({
  values,
  providerNames,
  disabled = false,
  disabledReason,
  saving = false,
  onSave,
}: CodexTopLevelControlsCardProps) {
  return (
    <CodexConfigCardShell
      title="Top-level controls"
      badge="config.toml"
      icon={<SlidersHorizontal className="h-4 w-4" />}
      description="Structured controls for the stable top-level Codex settings users touch most often. Unsupported upstream shapes stay untouched and should be edited in raw TOML."
      disabledReason={disabledReason}
    >
      <TopLevelControlsForm
        key={JSON.stringify(values)}
        initialValues={values}
        providerNames={providerNames}
        disabled={disabled}
        saving={saving}
        onSave={onSave}
      />
    </CodexConfigCardShell>
  );
}
