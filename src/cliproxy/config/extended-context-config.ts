/**
 * Extended Context Configuration
 *
 * Handles the [1m] suffix for models supporting 1M token context window.
 * Claude Code recognizes this suffix to enable extended context.
 *
 * Behavior:
 * - Gemini family (gemini-*): Auto-enabled by default
 * - Claude (Anthropic): Opt-in via --1m flag
 */

import type { CLIProxyProvider } from '../types';
import { supportsExtendedContext } from '../model-catalog';
import { warn } from '../../utils/ui';
import {
  applyExtendedContextPreferenceToAnthropicModels,
  applyExtendedContextSuffix as applyExtendedContextSuffixShared,
  isNativeGeminiModel,
  stripModelConfigurationSuffixes,
} from '../../shared/extended-context-utils';

// Backward-compatible export retained for tests/importers that reference this module.
export function applyExtendedContextSuffix(modelId: string): string {
  return applyExtendedContextSuffixShared(modelId);
}

/**
 * Determine if extended context should be applied to a model.
 *
 * @param provider - CLIProxy provider
 * @param modelId - Base model ID (without suffixes)
 * @param extendedContextOverride - CLI override (true = force on, false = force off, undefined = auto)
 * @returns Whether to apply extended context suffix
 */
export function shouldApplyExtendedContext(
  provider: CLIProxyProvider,
  modelId: string,
  extendedContextOverride?: boolean
): boolean {
  // Explicit override takes priority
  if (extendedContextOverride === true) {
    // User explicitly requested --1m
    const supported = supportsExtendedContext(provider, modelId);
    if (!supported) {
      console.error(warn(`Model "${modelId}" does not support 1M extended context. Flag ignored.`));
    }
    return supported;
  }
  if (extendedContextOverride === false) {
    // User explicitly disabled with --no-1m
    return false;
  }

  // Auto behavior: enable for native Gemini models only
  if (isNativeGeminiModel(modelId)) {
    return supportsExtendedContext(provider, modelId);
  }

  // For other models (Claude, etc.), default to off - require explicit --1m
  return false;
}

/**
 * Apply extended context configuration to env vars.
 * Modifies ANTHROPIC_MODEL and tier models with [1m] suffix.
 *
 * @param envVars - Environment variables to modify (mutated in place)
 * @param provider - CLIProxy provider
 * @param extendedContextOverride - CLI override (true = force on, false = force off, undefined = auto)
 */
export function applyExtendedContextConfig(
  envVars: NodeJS.ProcessEnv,
  provider: CLIProxyProvider,
  extendedContextOverride?: boolean
): void {
  if (extendedContextOverride === false) {
    Object.assign(envVars, applyExtendedContextPreferenceToAnthropicModels(envVars, false));
    return;
  }

  Object.assign(
    envVars,
    applyExtendedContextPreferenceToAnthropicModels(envVars, true, {
      supportsExtendedContext: (modelId) =>
        shouldApplyExtendedContext(
          provider,
          stripModelConfigurationSuffixes(modelId),
          extendedContextOverride
        ),
    })
  );
}
