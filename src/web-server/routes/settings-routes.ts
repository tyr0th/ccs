/**
 * Settings Routes - Settings and preset management
 */

import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getCcsDir, loadSettings } from '../../utils/config-manager';
import { isSensitiveKey, maskSensitiveValue } from '../../utils/sensitive-keys';
import { listVariants } from '../../cliproxy/services/variant-service';
import {
  generateSecureToken,
  maskToken,
  getAuthSummary,
  setGlobalApiKey,
  setGlobalManagementSecret,
  resetAuthToDefaults,
} from '../../cliproxy';
import { regenerateConfig } from '../../cliproxy/config-generator';
import { deduplicateCcsHooks } from '../../utils/websearch/hook-utils';
import {
  getDashboardAuthConfig,
  loadOrCreateUnifiedConfig,
  mutateUnifiedConfig,
} from '../../config/unified-config-loader';
import type { Settings } from '../../types/config';
import type { CLIProxyProvider } from '../../cliproxy/types';
import { mapExternalProviderName } from '../../cliproxy/provider-capabilities';
import { canonicalizeModelIdForProvider } from '../../cliproxy/model-id-normalizer';

const router = Router();
const MODEL_ENV_KEYS = [
  'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
] as const;
const PRESET_MODEL_KEYS = ['default', 'opus', 'sonnet', 'haiku'] as const;

function logRouteError(context: string, error: unknown): void {
  if (error instanceof Error) {
    console.error(`[settings-routes] ${context}: ${error.message}`);
    return;
  }
  console.error(`[settings-routes] ${context}: unknown error`);
}

function respondInternalError(
  res: Response,
  error: unknown,
  fallbackMessage: string,
  statusCode = 500
): void {
  logRouteError(fallbackMessage, error);
  res.status(statusCode).json({ error: fallbackMessage });
}

function isLoopbackAddress(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().replace(/^\[|\]$/g, '');
  return (
    normalized === '::1' ||
    normalized === '127.0.0.1' ||
    normalized.startsWith('127.') ||
    normalized === '::ffff:127.0.0.1' ||
    normalized.startsWith('::ffff:127.')
  );
}

function requireSensitiveLocalAccess(req: Request, res: Response): boolean {
  const dashboardAuth = getDashboardAuthConfig();
  if (dashboardAuth.enabled) {
    return true;
  }

  const forwarded = req.headers['x-forwarded-for'];
  const firstForwarded =
    typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : undefined;
  const candidateAddress = firstForwarded || req.socket.remoteAddress || req.ip;

  if (isLoopbackAddress(candidateAddress)) {
    return true;
  }

  res.status(403).json({
    error: 'Sensitive settings endpoints require localhost access when dashboard auth is disabled.',
  });
  return false;
}

function classifyConfigSaveFailure(error: unknown): { statusCode: number; message: string } {
  const message = error instanceof Error ? error.message.toLowerCase() : '';

  if (message.includes('failed to acquire config lock')) {
    return { statusCode: 409, message: 'Configuration is busy. Retry in a moment.' };
  }
  if (message.includes('eacces') || message.includes('eperm') || message.includes('permission')) {
    return { statusCode: 403, message: 'Insufficient permission to update configuration.' };
  }
  if (message.includes('enospc') || message.includes('no space left')) {
    return { statusCode: 507, message: 'Insufficient disk space to update configuration.' };
  }

  return { statusCode: 500, message: 'Failed to update Antigravity power user mode.' };
}

/**
 * Helper: Resolve settings path for profile or variant
 * Variants have settings paths in config, regular profiles use {name}.settings.json
 */
function resolveSettingsPath(profileOrVariant: string): string {
  const ccsDir = getCcsDir();

  // Check if this is a variant
  const variants = listVariants();
  const variant = variants[profileOrVariant];
  if (variant?.settings) {
    // Variant settings path (e.g., ~/.ccs/agy-g3.settings.json)
    return variant.settings.replace(/^~/, os.homedir());
  }

  // Regular profile settings
  return path.join(ccsDir, `${profileOrVariant}.settings.json`);
}

function resolveProviderForProfile(profileOrVariant: string): CLIProxyProvider | null {
  const directProvider = mapExternalProviderName(profileOrVariant);
  if (directProvider) {
    return directProvider;
  }

  const variants = listVariants();
  const variantProvider = variants[profileOrVariant]?.provider;
  if (typeof variantProvider === 'string') {
    return mapExternalProviderName(variantProvider);
  }

  return null;
}

function canonicalizeProfileModelId(profileOrVariant: string, modelId: string): string {
  const provider = resolveProviderForProfile(profileOrVariant);
  if (!provider) return modelId;
  return canonicalizeModelIdForProvider(modelId, provider);
}

function canonicalizeProfileSettings(profileOrVariant: string, settings: Settings): Settings {
  const provider = resolveProviderForProfile(profileOrVariant);
  if (!provider) return settings;

  let changed = false;
  const next: Settings = { ...settings };

  if (settings.env && typeof settings.env === 'object') {
    const env = { ...settings.env };
    for (const key of MODEL_ENV_KEYS) {
      const value = env[key];
      if (typeof value !== 'string') continue;
      const canonical = canonicalizeModelIdForProvider(value, provider);
      if (canonical !== value) {
        env[key] = canonical;
        changed = true;
      }
    }
    next.env = env;
  }

  if (Array.isArray(settings.presets)) {
    const normalizedPresets = settings.presets.map((preset) => {
      const normalizedPreset = { ...preset };
      let presetChanged = false;

      for (const key of PRESET_MODEL_KEYS) {
        const value = normalizedPreset[key];
        if (typeof value !== 'string') continue;
        const canonical = canonicalizeModelIdForProvider(value, provider);
        if (canonical !== value) {
          normalizedPreset[key] = canonical;
          presetChanged = true;
        }
      }

      if (presetChanged) changed = true;
      return normalizedPreset;
    });
    next.presets = normalizedPresets;
  }

  return changed ? next : settings;
}

function writeSettingsAtomically(settingsPath: string, settings: Settings): void {
  const tempPath = settingsPath + '.tmp';
  fs.writeFileSync(tempPath, JSON.stringify(settings, null, 2) + '\n');
  fs.renameSync(tempPath, settingsPath);
}

function loadCanonicalProfileSettings(
  profileOrVariant: string,
  settingsPath: string,
  persist = false,
  strictPersist = false
): Settings {
  const loaded = loadSettings(settingsPath);
  const canonicalized = canonicalizeProfileSettings(profileOrVariant, loaded);

  if (persist && canonicalized !== loaded) {
    try {
      writeSettingsAtomically(settingsPath, canonicalized);
    } catch (error) {
      if (strictPersist) {
        throw error;
      }
      logRouteError(`Failed to persist canonicalized settings for ${profileOrVariant}`, error);
    }
  }

  return canonicalized;
}

/**
 * Helper: Mask API keys in settings
 */
function maskApiKeys(settings: Settings): Settings {
  if (!settings.env) return settings;

  const masked = { ...settings, env: { ...settings.env } };

  for (const key of Object.keys(masked.env)) {
    if (isSensitiveKey(key)) {
      masked.env[key] = maskSensitiveValue(masked.env[key]);
    }
  }

  return masked;
}

/**
 * GET /api/settings/:profile - Get settings with masked API keys
 */
router.get('/:profile', (req: Request, res: Response): void => {
  try {
    const { profile } = req.params;
    const settingsPath = resolveSettingsPath(profile);

    if (!fs.existsSync(settingsPath)) {
      res.status(404).json({ error: 'Settings not found' });
      return;
    }

    const settings = loadCanonicalProfileSettings(profile, settingsPath, true);
    const stat = fs.statSync(settingsPath);
    const masked = maskApiKeys(settings);

    res.json({
      profile,
      settings: masked,
      mtime: stat.mtime.getTime(),
      path: settingsPath,
    });
  } catch (error) {
    respondInternalError(res, error, 'Internal server error.');
  }
});

/**
 * GET /api/settings/:profile/raw - Get full settings (for editing)
 */
router.get('/:profile/raw', (req: Request, res: Response): void => {
  try {
    const { profile } = req.params;
    const settingsPath = resolveSettingsPath(profile);

    if (!fs.existsSync(settingsPath)) {
      res.status(404).json({ error: 'Settings not found' });
      return;
    }

    const settings = loadCanonicalProfileSettings(profile, settingsPath, true);
    const stat = fs.statSync(settingsPath);

    res.json({
      profile,
      settings,
      mtime: stat.mtime.getTime(),
      path: settingsPath,
    });
  } catch (error) {
    respondInternalError(res, error, 'Internal server error.');
  }
});

/** Required env vars for CLIProxy providers to function */
const REQUIRED_ENV_KEYS = ['ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN'] as const;

/** Check if settings have required fields (returns missing list for warnings) */
function checkRequiredEnvVars(settings: Settings): string[] {
  const env = settings?.env || {};
  return REQUIRED_ENV_KEYS.filter((key) => !env[key]?.trim());
}

/**
 * PUT /api/settings/:profile - Update settings with conflict detection and backup
 */
router.put('/:profile', (req: Request, res: Response): void => {
  try {
    const { profile } = req.params;
    const { settings, expectedMtime } = req.body;

    // Validate settings object exists
    if (!settings || typeof settings !== 'object') {
      res.status(400).json({ error: 'settings object is required in request body' });
      return;
    }

    const normalizedSettings = canonicalizeProfileSettings(profile, settings as Settings);

    // Deduplicate CCS hooks to prevent accumulation (fixes #450)
    // This handles cases where duplicate hooks were added by previous versions
    deduplicateCcsHooks(normalizedSettings as Record<string, unknown>);

    const ccsDir = getCcsDir();

    // Check for missing required fields (warning, not blocking - runtime fills defaults)
    const missingFields = checkRequiredEnvVars(normalizedSettings);
    const settingsPath = resolveSettingsPath(profile);

    const fileExists = fs.existsSync(settingsPath);

    // Only check conflict if file exists and expectedMtime was provided
    if (fileExists && expectedMtime) {
      const stat = fs.statSync(settingsPath);
      if (stat.mtime.getTime() !== expectedMtime) {
        res.status(409).json({
          error: 'File modified externally',
          currentMtime: stat.mtime.getTime(),
        });
        return;
      }
    }

    // Create backup only if file exists AND content actually changed
    let backupPath: string | undefined;
    const newContent = JSON.stringify(normalizedSettings, null, 2) + '\n';
    if (fileExists) {
      const existingContent = fs.readFileSync(settingsPath, 'utf8');
      // Only create backup if content differs
      if (existingContent !== newContent) {
        const backupDir = path.join(ccsDir, 'backups');
        if (!fs.existsSync(backupDir)) {
          fs.mkdirSync(backupDir, { recursive: true });
        }
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        backupPath = path.join(backupDir, `${profile}.${timestamp}.settings.json`);
        fs.copyFileSync(settingsPath, backupPath);
      }
    }

    // Ensure directory exists for new files
    if (!fileExists) {
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    }

    // Write new settings atomically
    const tempPath = settingsPath + '.tmp';
    fs.writeFileSync(tempPath, newContent);
    fs.renameSync(tempPath, settingsPath);

    const newStat = fs.statSync(settingsPath);
    res.json({
      profile,
      mtime: newStat.mtime.getTime(),
      backupPath,
      created: !fileExists,
      // Include warning if fields missing (runtime will use defaults)
      ...(missingFields.length > 0 && {
        warning: `Missing fields will use defaults: ${missingFields.join(', ')}`,
        missingFields,
      }),
    });
  } catch (error) {
    respondInternalError(res, error, 'Internal server error.');
  }
});

// ==================== Presets ====================

/**
 * GET /api/settings/:profile/presets - Get saved presets for a provider
 */
router.get('/:profile/presets', (req: Request, res: Response): void => {
  try {
    const { profile } = req.params;
    const settingsPath = resolveSettingsPath(profile);

    if (!fs.existsSync(settingsPath)) {
      res.json({ presets: [] });
      return;
    }

    const settings = loadCanonicalProfileSettings(profile, settingsPath, true);
    res.json({ presets: settings.presets || [] });
  } catch (error) {
    respondInternalError(res, error, 'Internal server error.');
  }
});

/**
 * POST /api/settings/:profile/presets - Create a new preset
 */
router.post('/:profile/presets', (req: Request, res: Response): void => {
  try {
    const { profile } = req.params;
    const { name, default: defaultModel, opus, sonnet, haiku } = req.body;

    if (!name || !defaultModel) {
      res.status(400).json({ error: 'Missing required fields: name, default' });
      return;
    }

    const settingsPath = resolveSettingsPath(profile);

    // Create settings file if it doesn't exist
    if (!fs.existsSync(settingsPath)) {
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      fs.writeFileSync(settingsPath, JSON.stringify({ env: {}, presets: [] }, null, 2) + '\n');
    }

    const settings = loadCanonicalProfileSettings(profile, settingsPath, false);
    settings.presets = settings.presets || [];

    // Check for duplicate name
    if (settings.presets.some((p) => p.name === name)) {
      res.status(409).json({ error: 'Preset with this name already exists' });
      return;
    }

    const normalizePresetModel = (modelId: string): string =>
      canonicalizeProfileModelId(profile, modelId);

    const normalizedDefaultModel = normalizePresetModel(defaultModel);
    const normalizedOpusModel = normalizePresetModel(opus || defaultModel);
    const normalizedSonnetModel = normalizePresetModel(sonnet || defaultModel);
    const normalizedHaikuModel = normalizePresetModel(haiku || defaultModel);

    const preset = {
      name,
      default: normalizedDefaultModel,
      opus: normalizedOpusModel,
      sonnet: normalizedSonnetModel,
      haiku: normalizedHaikuModel,
    };

    settings.presets.push(preset);
    const canonicalizedSettings = canonicalizeProfileSettings(profile, settings);
    writeSettingsAtomically(settingsPath, canonicalizedSettings);

    const persistedPreset =
      canonicalizedSettings.presets?.find((entry) => entry.name === name) || preset;
    res.status(201).json({ preset: persistedPreset });
  } catch (error) {
    respondInternalError(res, error, 'Internal server error.');
  }
});

/**
 * DELETE /api/settings/:profile/presets/:name - Delete a preset
 */
router.delete('/:profile/presets/:name', (req: Request, res: Response): void => {
  try {
    const { profile, name } = req.params;
    const settingsPath = resolveSettingsPath(profile);

    if (!fs.existsSync(settingsPath)) {
      res.status(404).json({ error: 'Settings not found' });
      return;
    }

    const settings = loadCanonicalProfileSettings(profile, settingsPath, false);
    if (!settings.presets || !settings.presets.some((p) => p.name === name)) {
      res.status(404).json({ error: 'Preset not found' });
      return;
    }

    settings.presets = settings.presets.filter((p) => p.name !== name);
    const canonicalizedSettings = canonicalizeProfileSettings(profile, settings);
    writeSettingsAtomically(settingsPath, canonicalizedSettings);

    res.json({ success: true });
  } catch (error) {
    respondInternalError(res, error, 'Internal server error.');
  }
});

// ==================== Auth Tokens ====================

/**
 * GET /api/settings/auth/antigravity-risk - Get AGY responsibility bypass setting
 */
router.get('/auth/antigravity-risk', (req: Request, res: Response): void => {
  if (!requireSensitiveLocalAccess(req, res)) return;

  try {
    const config = loadOrCreateUnifiedConfig();
    res.json({
      antigravityAckBypass: config.cliproxy?.safety?.antigravity_ack_bypass === true,
    });
  } catch (error) {
    respondInternalError(res, error, 'Failed to load Antigravity power user mode.');
  }
});

/**
 * PUT /api/settings/auth/antigravity-risk - Update AGY responsibility bypass setting
 */
router.put('/auth/antigravity-risk', (req: Request, res: Response): void => {
  if (!requireSensitiveLocalAccess(req, res)) return;

  try {
    const body = req.body as { antigravityAckBypass?: unknown } | null | undefined;
    const antigravityAckBypass =
      body && typeof body === 'object' ? body.antigravityAckBypass : undefined;

    if (typeof antigravityAckBypass !== 'boolean') {
      res.status(400).json({ error: 'antigravityAckBypass must be a boolean' });
      return;
    }

    const updatedConfig = mutateUnifiedConfig((config) => {
      config.cliproxy.safety = {
        ...(config.cliproxy.safety ?? {}),
        antigravity_ack_bypass: antigravityAckBypass,
      };
    });

    res.json({
      success: true,
      antigravityAckBypass: updatedConfig.cliproxy?.safety?.antigravity_ack_bypass === true,
    });
  } catch (error) {
    const classified = classifyConfigSaveFailure(error);
    respondInternalError(res, error, classified.message, classified.statusCode);
  }
});

/**
 * GET /api/settings/auth/tokens - Get current auth token status (masked)
 */
router.get('/auth/tokens', (_req: Request, res: Response): void => {
  try {
    const summary = getAuthSummary();

    res.json({
      apiKey: {
        value: maskToken(summary.apiKey.value),
        isCustom: summary.apiKey.isCustom,
      },
      managementSecret: {
        value: maskToken(summary.managementSecret.value),
        isCustom: summary.managementSecret.isCustom,
      },
    });
  } catch (error) {
    respondInternalError(res, error, 'Internal server error.');
  }
});

/**
 * GET /api/settings/auth/tokens/raw - Get current auth tokens unmasked
 * NOTE: Sensitive endpoint - no caching, localhost only
 */
router.get('/auth/tokens/raw', (req: Request, res: Response): void => {
  if (!requireSensitiveLocalAccess(req, res)) return;

  try {
    // Prevent caching of sensitive data
    res.setHeader('Cache-Control', 'no-store');

    const summary = getAuthSummary();

    res.json({
      apiKey: {
        value: summary.apiKey.value,
        isCustom: summary.apiKey.isCustom,
      },
      managementSecret: {
        value: summary.managementSecret.value,
        isCustom: summary.managementSecret.isCustom,
      },
    });
  } catch (error) {
    respondInternalError(res, error, 'Failed to load raw auth tokens.');
  }
});

/**
 * PUT /api/settings/auth/tokens - Update auth tokens
 */
router.put('/auth/tokens', (req: Request, res: Response): void => {
  try {
    const { apiKey, managementSecret } = req.body;

    if (apiKey !== undefined) {
      setGlobalApiKey(apiKey || undefined);
    }

    if (managementSecret !== undefined) {
      setGlobalManagementSecret(managementSecret || undefined);
    }

    // Regenerate CLIProxy config to apply changes
    regenerateConfig();

    const summary = getAuthSummary();
    res.json({
      success: true,
      apiKey: {
        value: maskToken(summary.apiKey.value),
        isCustom: summary.apiKey.isCustom,
      },
      managementSecret: {
        value: maskToken(summary.managementSecret.value),
        isCustom: summary.managementSecret.isCustom,
      },
      message: 'Restart CLIProxy to apply changes',
    });
  } catch (error) {
    respondInternalError(res, error, 'Internal server error.');
  }
});

/**
 * POST /api/settings/auth/tokens/regenerate-secret - Generate new management secret
 */
router.post('/auth/tokens/regenerate-secret', (_req: Request, res: Response): void => {
  try {
    const newSecret = generateSecureToken(32);
    setGlobalManagementSecret(newSecret);

    // Regenerate CLIProxy config to apply changes
    regenerateConfig();

    res.json({
      success: true,
      managementSecret: {
        value: maskToken(newSecret),
        isCustom: true,
      },
      message: 'Restart CLIProxy to apply changes',
    });
  } catch (error) {
    respondInternalError(res, error, 'Internal server error.');
  }
});

/**
 * POST /api/settings/auth/tokens/reset - Reset auth tokens to defaults
 */
router.post('/auth/tokens/reset', (_req: Request, res: Response): void => {
  try {
    resetAuthToDefaults();

    // Regenerate CLIProxy config to apply changes
    regenerateConfig();

    const summary = getAuthSummary();
    res.json({
      success: true,
      apiKey: {
        value: maskToken(summary.apiKey.value),
        isCustom: summary.apiKey.isCustom,
      },
      managementSecret: {
        value: maskToken(summary.managementSecret.value),
        isCustom: summary.managementSecret.isCustom,
      },
      message: 'Tokens reset to defaults. Restart CLIProxy to apply.',
    });
  } catch (error) {
    respondInternalError(res, error, 'Internal server error.');
  }
});

export default router;
