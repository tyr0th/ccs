/**
 * API Profile Writer Service - Create/remove operations for API profiles.
 * Supports both unified YAML config and legacy JSON config.
 */
import * as fs from 'fs';
import * as path from 'path';
import { getCcsDir, getConfigPath, loadConfigSafe } from '../../utils/config-manager';
import { expandPath } from '../../utils/helpers';
import {
  loadOrCreateUnifiedConfig,
  saveUnifiedConfig,
  isUnifiedMode,
} from '../../config/unified-config-loader';
import { ensureProfileHooks } from '../../utils/websearch/profile-hook-injector';
import type { TargetType } from '../../targets/target-adapter';
import { resolveDroidProvider } from '../../targets/droid-provider';
import { mapExternalProviderName } from '../../cliproxy/provider-capabilities';
import {
  extractProviderFromPathname,
  getDeniedModelIdReasonForProvider,
} from '../../cliproxy/model-id-normalizer';
import type { CLIProxyProvider } from '../../cliproxy/types';
import type {
  ModelMapping,
  CreateApiProfileResult,
  RemoveApiProfileResult,
  UpdateApiProfileTargetResult,
} from './profile-types';

/** Check if URL is an OpenRouter endpoint */
function isOpenRouterUrl(baseUrl: string): boolean {
  return baseUrl.toLowerCase().includes('openrouter.ai');
}

/** Detect Anthropic direct API profile (native auth, no proxy) */
function isAnthropicDirect(baseUrl: string, apiKey: string): boolean {
  return apiKey.startsWith('sk-ant-') || baseUrl.includes('api.anthropic.com');
}

function resolveProviderFromBaseUrl(baseUrl: string): CLIProxyProvider | null {
  if (baseUrl.trim().length === 0) {
    return null;
  }

  try {
    const parsed = new URL(baseUrl);
    const extracted = extractProviderFromPathname(parsed.pathname);
    return extracted ? mapExternalProviderName(extracted) : null;
  } catch {
    const extracted = extractProviderFromPathname(baseUrl);
    return extracted ? mapExternalProviderName(extracted) : null;
  }
}

function getDeniedModelReason(baseUrl: string, models: ModelMapping): string | null {
  const provider = resolveProviderFromBaseUrl(baseUrl);
  if (!provider) return null;

  for (const modelId of [models.default, models.opus, models.sonnet, models.haiku]) {
    if (modelId.trim().length === 0) continue;
    const deniedReason = getDeniedModelIdReasonForProvider(modelId, provider);
    if (deniedReason) return deniedReason;
  }

  return null;
}

/** Create settings.json file for API profile (legacy format) */
function createSettingsFile(
  name: string,
  baseUrl: string,
  apiKey: string,
  models: ModelMapping,
  provider?: string
): string {
  const ccsDir = getCcsDir();
  const settingsPath = path.join(ccsDir, `${name}.settings.json`);
  const droidProvider = resolveDroidProvider({
    provider,
    baseUrl,
    model: models.default,
  });

  const isNative = isAnthropicDirect(baseUrl, apiKey);
  const settings = {
    env: {
      // Native mode: ANTHROPIC_API_KEY only, no BASE_URL/AUTH_TOKEN
      // Proxy mode: ANTHROPIC_BASE_URL + AUTH_TOKEN (existing behavior)
      ...(isNative
        ? { ANTHROPIC_API_KEY: apiKey }
        : {
            ANTHROPIC_BASE_URL: baseUrl,
            ANTHROPIC_AUTH_TOKEN: apiKey,
            ...(isOpenRouterUrl(baseUrl) && { ANTHROPIC_API_KEY: '' }),
          }),
      ANTHROPIC_MODEL: models.default,
      ANTHROPIC_DEFAULT_OPUS_MODEL: models.opus,
      ANTHROPIC_DEFAULT_SONNET_MODEL: models.sonnet,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: models.haiku,
      CCS_DROID_PROVIDER: droidProvider,
    },
  };

  fs.mkdirSync(ccsDir, { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');

  // Inject WebSearch hooks into profile settings
  ensureProfileHooks(name);

  return settingsPath;
}

/** Update config.json with new API profile (legacy format) */
function updateLegacyConfig(name: string, target: TargetType = 'claude'): void {
  const configPath = getConfigPath();
  const ccsDir = getCcsDir();

  let config: {
    profiles: Record<string, string>;
    cliproxy?: Record<string, unknown>;
    profile_targets?: Record<string, TargetType>;
  };
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    config = { profiles: {} };
  }

  const relativePath = `~/.ccs/${name}.settings.json`;
  config.profiles[name] = relativePath;
  config.profile_targets = config.profile_targets || {};
  if (target === 'claude') {
    delete config.profile_targets[name];
  } else {
    config.profile_targets[name] = target;
  }

  if (!fs.existsSync(ccsDir)) {
    fs.mkdirSync(ccsDir, { recursive: true });
  }

  // Write config atomically
  const tempPath = configPath + '.tmp';
  fs.writeFileSync(tempPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  fs.renameSync(tempPath, configPath);
}

/** Create API profile in unified config */
function createApiProfileUnified(
  name: string,
  baseUrl: string,
  apiKey: string,
  models: ModelMapping,
  target: TargetType = 'claude',
  provider?: string
): void {
  const ccsDir = getCcsDir();
  const settingsFile = `${name}.settings.json`;
  const settingsPath = path.join(ccsDir, settingsFile);
  const droidProvider = resolveDroidProvider({
    provider,
    baseUrl,
    model: models.default,
  });

  const isNative = isAnthropicDirect(baseUrl, apiKey);
  const settings = {
    env: {
      ...(isNative
        ? { ANTHROPIC_API_KEY: apiKey }
        : {
            ANTHROPIC_BASE_URL: baseUrl,
            ANTHROPIC_AUTH_TOKEN: apiKey,
            ...(isOpenRouterUrl(baseUrl) && { ANTHROPIC_API_KEY: '' }),
          }),
      ANTHROPIC_MODEL: models.default,
      ANTHROPIC_DEFAULT_OPUS_MODEL: models.opus,
      ANTHROPIC_DEFAULT_SONNET_MODEL: models.sonnet,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: models.haiku,
      CCS_DROID_PROVIDER: droidProvider,
    },
  };

  if (!fs.existsSync(ccsDir)) {
    fs.mkdirSync(ccsDir, { recursive: true });
  }

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');

  // Inject WebSearch hooks into profile settings
  ensureProfileHooks(name);

  const config = loadOrCreateUnifiedConfig();
  config.profiles[name] = {
    type: 'api',
    settings: `~/.ccs/${settingsFile}`,
    ...(target !== 'claude' && { target }),
  };
  saveUnifiedConfig(config);
}

/** Create a new API profile */
export function createApiProfile(
  name: string,
  baseUrl: string,
  apiKey: string,
  models: ModelMapping,
  target: TargetType = 'claude',
  provider?: string
): CreateApiProfileResult {
  try {
    const deniedReason = getDeniedModelReason(baseUrl, models);
    if (deniedReason) {
      return { success: false, settingsFile: '', error: deniedReason };
    }

    const settingsFile = `~/.ccs/${name}.settings.json`;

    if (isUnifiedMode()) {
      createApiProfileUnified(name, baseUrl, apiKey, models, target, provider);
    } else {
      createSettingsFile(name, baseUrl, apiKey, models, provider);
      updateLegacyConfig(name, target);
    }

    return { success: true, settingsFile };
  } catch (error) {
    return {
      success: false,
      settingsFile: '',
      error: (error as Error).message,
    };
  }
}

/**
 * Update API profile target (claude/droid).
 * Persists to config.yaml in unified mode and config.json profile_targets in legacy mode.
 */
export function updateApiProfileTarget(
  name: string,
  target: TargetType
): UpdateApiProfileTargetResult {
  try {
    if (isUnifiedMode()) {
      const config = loadOrCreateUnifiedConfig();
      if (!config.profiles[name]) {
        return { success: false, error: `API profile not found: ${name}` };
      }

      if (target === 'claude') {
        delete config.profiles[name].target;
      } else {
        config.profiles[name].target = target;
      }
      saveUnifiedConfig(config);
      return { success: true, target };
    }

    const configPath = getConfigPath();
    let config: {
      profiles: Record<string, string>;
      cliproxy?: Record<string, unknown>;
      profile_targets?: Record<string, TargetType>;
    };
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch {
      config = { profiles: {} };
    }

    if (!config.profiles[name]) {
      return { success: false, error: `API profile not found: ${name}` };
    }

    config.profile_targets = config.profile_targets || {};
    if (target === 'claude') {
      delete config.profile_targets[name];
    } else {
      config.profile_targets[name] = target;
    }

    const tempPath = configPath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
    fs.renameSync(tempPath, configPath);

    return { success: true, target };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/** Remove API profile from unified config */
function removeApiProfileUnified(name: string): void {
  const config = loadOrCreateUnifiedConfig();
  const profile = config.profiles[name];

  if (!profile) {
    throw new Error(`API profile not found: ${name}`);
  }

  // Delete the settings file if it exists.
  // Uses expandPath() for cross-platform path handling.
  if (profile.settings) {
    const settingsPath = expandPath(profile.settings);
    if (fs.existsSync(settingsPath)) {
      fs.unlinkSync(settingsPath);
    }
  }

  delete config.profiles[name];

  // Clear default if it was the deleted profile
  if (config.default === name) {
    config.default = undefined;
  }

  saveUnifiedConfig(config);
}

/** Remove API profile from legacy config */
function removeApiProfileLegacy(name: string): void {
  const config = loadConfigSafe();
  delete config.profiles[name];
  if (config.profile_targets) {
    delete config.profile_targets[name];
    if (Object.keys(config.profile_targets).length === 0) {
      delete config.profile_targets;
    }
  }

  const configPath = getConfigPath();
  const tempPath = configPath + '.tmp';
  fs.writeFileSync(tempPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  fs.renameSync(tempPath, configPath);

  // Remove settings file if it exists
  const expandedPath = path.join(getCcsDir(), `${name}.settings.json`);
  if (fs.existsSync(expandedPath)) {
    fs.unlinkSync(expandedPath);
  }
}

/** Remove an API profile */
export function removeApiProfile(name: string): RemoveApiProfileResult {
  try {
    if (isUnifiedMode()) {
      removeApiProfileUnified(name);
    } else {
      removeApiProfileLegacy(name);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}
