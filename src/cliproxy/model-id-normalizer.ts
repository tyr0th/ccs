/**
 * Model ID normalization helpers.
 *
 * Handles provider-aware compatibility between dotted and hyphenated Claude
 * model version formats (e.g., 4.6 vs 4-6).
 */

import { CLIProxyProvider } from './types';

/** Env vars that carry model identifiers. */
export const MODEL_ENV_VAR_KEYS = [
  'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
] as const;

type ProviderLike = CLIProxyProvider | string | null | undefined;

const CLAUDE_DOTTED_VERSION_REGEX = /claude-(sonnet|opus|haiku)-(\d+)\.(\d+)(?=(?:$|-|\[|\(|\/))/gi;
const CLAUDE_DOTTED_THINKING_REGEX =
  /claude-(sonnet|opus|haiku)-(\d+)\.(\d+)-thinking(?=(?:$|-|\[|\(|\/))/gi;
const DEPRECATED_ANTIGRAVITY_SONNET_46_THINKING_REGEX =
  /claude-sonnet-4(?:[.-])6-thinking(?=(?:$|-|\[|\(|\/))/gi;
const CANONICAL_ANTIGRAVITY_SONNET_46_MODEL = 'claude-sonnet-4-6';
const CODEX_EFFORT_SUFFIX_REGEX = /-(xhigh|high|medium)$/i;

function trimModelId(model: string): string {
  return model.trim();
}

/**
 * Extract provider segment from `/api/provider/{provider}` request paths.
 *
 * @example
 * extractProviderFromPathname('/api/provider/agy/v1/messages')
 * // => 'agy'
 */
export function extractProviderFromPathname(pathname: string): string | null {
  const match = pathname.match(/\/api\/provider\/([^/]+)/i);
  if (!match?.[1]) return null;
  return match[1].toLowerCase();
}

/** Whether the provider uses Antigravity model routing conventions. */
export function isAntigravityProvider(provider: ProviderLike): boolean {
  if (typeof provider !== 'string') return false;
  const normalized = provider.trim().toLowerCase();
  return normalized === 'agy' || normalized === 'antigravity';
}

/** Whether provider maps to Codex model canonicalization rules. */
export function isCodexProvider(provider: ProviderLike): boolean {
  if (typeof provider !== 'string') return false;
  return provider.trim().toLowerCase() === 'codex';
}

/** Normalize Codex effort-suffixed IDs to canonical IDs. */
export function stripCodexEffortSuffix(model: string): string {
  return model.replace(CODEX_EFFORT_SUFFIX_REGEX, '');
}

/** Normalize Claude dotted major.minor IDs to hyphenated format. */
export function normalizeClaudeDottedMajorMinor(model: string): string {
  return model.replace(
    CLAUDE_DOTTED_VERSION_REGEX,
    (_match: string, family: string, major: string, minor: string) =>
      `claude-${family.toLowerCase()}-${major}-${minor}`
  );
}

/**
 * Normalize only dotted Claude thinking IDs to hyphenated format.
 * Keeps non-thinking dotted IDs unchanged.
 */
export function normalizeClaudeDottedThinkingMajorMinor(model: string): string {
  return model.replace(
    CLAUDE_DOTTED_THINKING_REGEX,
    (_match: string, family: string, major: string, minor: string) =>
      `claude-${family.toLowerCase()}-${major}-${minor}-thinking`
  );
}

/**
 * Antigravity no longer exposes `claude-sonnet-4-6-thinking`.
 * Canonicalize legacy aliases to `claude-sonnet-4-6` while preserving suffixes.
 */
export function normalizeDeprecatedAntigravityModelAliases(model: string): string {
  return model.replace(
    DEPRECATED_ANTIGRAVITY_SONNET_46_THINKING_REGEX,
    CANONICAL_ANTIGRAVITY_SONNET_46_MODEL
  );
}

/**
 * Normalize model ID for a specific provider.
 * Antigravity requires hyphenated Claude major.minor model IDs.
 *
 * @example
 * normalizeModelIdForProvider('claude-opus-4.6-thinking', 'agy')
 * // => 'claude-opus-4-6-thinking'
 *
 * @example
 * normalizeModelIdForProvider('claude-opus-4.6-thinking', 'gemini')
 * // => 'claude-opus-4.6-thinking'
 */
export function normalizeModelIdForProvider(model: string, provider: ProviderLike): string {
  const trimmedModel = trimModelId(model);
  if (!isAntigravityProvider(provider)) return trimmedModel;
  const normalizedDottedVersion = normalizeClaudeDottedMajorMinor(trimmedModel);
  return normalizeDeprecatedAntigravityModelAliases(normalizedDottedVersion);
}

/**
 * Canonicalize model ID for provider-specific compatibility.
 * - Codex: strip effort suffixes.
 * - Antigravity: normalize dotted/historical aliases.
 */
export function canonicalizeModelIdForProvider(model: string, provider: ProviderLike): string {
  const trimmedModel = trimModelId(model);
  const withoutCodexSuffix = isCodexProvider(provider)
    ? stripCodexEffortSuffix(trimmedModel)
    : trimmedModel;
  return normalizeModelIdForProvider(withoutCodexSuffix, provider);
}

/**
 * Normalize model ID for request routing.
 * - Antigravity routes: normalize all dotted Claude major.minor forms.
 * - Root/composite routes: normalize only thinking forms to avoid mutating
 *   valid non-thinking dotted IDs used by other providers.
 *
 * @example
 * normalizeModelIdForRouting('claude-sonnet-4.6-thinking', null)
 * // => 'claude-sonnet-4-6'
 *
 * @example
 * normalizeModelIdForRouting('claude-sonnet-4.6', null)
 * // => 'claude-sonnet-4.6'
 */
export function normalizeModelIdForRouting(model: string, provider: ProviderLike): string {
  const trimmedModel = trimModelId(model);
  if (isAntigravityProvider(provider)) {
    return normalizeModelIdForProvider(trimmedModel, provider);
  }
  // Explicit non-AGY provider routes should pass through unchanged.
  if (typeof provider === 'string' && provider.trim().length > 0) {
    return trimmedModel;
  }
  const normalizedThinking = normalizeClaudeDottedThinkingMajorMinor(trimmedModel);
  return normalizeDeprecatedAntigravityModelAliases(normalizedThinking);
}

/**
 * Normalize model-related env vars for a provider.
 * Returns original object when no changes are required.
 *
 * @example
 * normalizeModelEnvVarsForProvider(
 *   { ANTHROPIC_MODEL: 'claude-sonnet-4.6-thinking' },
 *   'agy'
 * )
 * // => { ANTHROPIC_MODEL: 'claude-sonnet-4-6' }
 */
export function normalizeModelEnvVarsForProvider(
  envVars: NodeJS.ProcessEnv,
  provider: ProviderLike,
  keys: readonly string[] = MODEL_ENV_VAR_KEYS
): NodeJS.ProcessEnv {
  let nextEnv: NodeJS.ProcessEnv | null = null;

  for (const key of keys) {
    const value = envVars[key];
    if (typeof value !== 'string' || value.trim().length === 0) continue;

    const normalizedValue = normalizeModelIdForProvider(value, provider);
    if (normalizedValue === value) continue;

    if (!nextEnv) nextEnv = { ...envVars };
    nextEnv[key] = normalizedValue;
  }

  return nextEnv ?? envVars;
}
