/**
 * Image Analyzer Profile Hook Injector
 *
 * Injects image analyzer hooks into per-profile settings files.
 * This replaces the global ~/.claude/settings.json approach.
 *
 * Injects for profiles that resolve to a supported image-analysis backend.
 *
 * @module utils/hooks/image-analyzer-profile-injector
 */

import * as fs from 'fs';
import * as path from 'path';
import { info, warn } from '../ui';
import {
  getImageAnalyzerHookConfig,
  getImageAnalyzerHookPath,
} from './image-analyzer-hook-configuration';
import { getImageAnalysisConfig } from '../../config/unified-config-loader';
import { getCcsDir } from '../config-manager';
import {
  resolveImageAnalysisStatus,
  type ImageAnalysisResolutionContext,
} from './image-analysis-backend-resolver';

// Valid profile name pattern (alphanumeric, dot, dash, underscore only)
const VALID_PROFILE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

/**
 * Get migration marker path (respects CCS_HOME for test isolation)
 */
function getMigrationMarkerPath(): string {
  return path.join(getCcsDir(), '.image-analyzer-hook-migrated');
}

/**
 * Check if CCS image analyzer hook exists in settings
 */
function hasCcsHook(settings: Record<string, unknown>): boolean {
  const hooks = settings.hooks as Record<string, unknown[]> | undefined;
  if (!hooks?.PreToolUse) return false;

  return hooks.PreToolUse.some((h: unknown) => {
    const hook = h as Record<string, unknown>;
    if (hook.matcher !== 'Read') return false;

    const hookArray = hook.hooks as Array<Record<string, unknown>> | undefined;
    const command = hookArray?.[0]?.command;
    if (typeof command !== 'string') return false;

    const normalized = command
      .replace(/\\/g, '/') // Windows backslashes
      .replace(/\/+/g, '/'); // Collapse multiple slashes
    return normalized.includes('.ccs/hooks/image-analyzer-transformer');
  });
}

export function getImageAnalysisProfileSettingsPath(
  profileName: string,
  settingsPath?: string | null
): string {
  if (typeof settingsPath === 'string' && settingsPath.trim().length > 0) {
    return settingsPath;
  }

  return path.join(getCcsDir(), `${profileName}.settings.json`);
}

export function hasImageAnalysisProfileHook(
  profileName: string,
  settingsPath?: string | null
): boolean {
  if (!VALID_PROFILE_NAME.test(profileName)) {
    return false;
  }

  const resolvedSettingsPath = getImageAnalysisProfileSettingsPath(profileName, settingsPath);
  if (!fs.existsSync(resolvedSettingsPath)) {
    return false;
  }

  try {
    const content = fs.readFileSync(resolvedSettingsPath, 'utf8');
    const settings = JSON.parse(content) as Record<string, unknown>;
    return hasCcsHook(settings);
  } catch {
    return false;
  }
}

/**
 * One-time migration marker management
 */
function migrateGlobalHook(): void {
  const markerPath = getMigrationMarkerPath();
  if (fs.existsSync(markerPath)) {
    return; // Already migrated
  }

  try {
    // No global hook to migrate (image analyzer is profile-only from the start)
    // Just create marker to prevent future migration attempts
    const ccsDir = getCcsDir();
    if (!fs.existsSync(ccsDir)) {
      fs.mkdirSync(ccsDir, { recursive: true, mode: 0o700 });
    }
    // Create marker file atomically (wx = fail if exists, prevents race condition)
    fs.writeFileSync(markerPath, new Date().toISOString(), { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if (process.env.CCS_DEBUG) {
      console.error(warn(`Migration failed: ${(error as Error).message}`));
    }
  }
}

/**
 * Ensure image analyzer hook is configured in profile's settings file
 *
 * @param input - Profile name or pre-resolved runtime context
 * @returns true if hook is configured (existing or newly added)
 */
export function ensureProfileHooks(input: string | ImageAnalysisResolutionContext): boolean {
  try {
    const context = typeof input === 'string' ? { profileName: input } : input;
    const profileName = context.profileName;

    // Validate profile name to prevent path traversal
    if (!VALID_PROFILE_NAME.test(profileName)) {
      if (process.env.CCS_DEBUG) {
        console.error(warn(`Invalid profile name: ${profileName}`));
      }
      return false;
    }

    const imageConfig = getImageAnalysisConfig();
    const status = resolveImageAnalysisStatus(context, imageConfig);
    if (!status.supported || !status.shouldPersistHook) {
      return false;
    }

    // One-time migration marker
    migrateGlobalHook();

    // Get CCS directory (respects CCS_HOME for test isolation)
    const ccsDir = getCcsDir();

    // Ensure CCS dir exists
    if (!fs.existsSync(ccsDir)) {
      fs.mkdirSync(ccsDir, { recursive: true, mode: 0o700 });
    }

    const settingsPath = getImageAnalysisProfileSettingsPath(profileName, context.settingsPath);

    // Read existing settings or create empty
    let settings: Record<string, unknown> = {};
    if (fs.existsSync(settingsPath)) {
      try {
        const content = fs.readFileSync(settingsPath, 'utf8');
        settings = JSON.parse(content);
      } catch (parseError) {
        if (process.env.CCS_DEBUG) {
          console.error(
            warn(`Malformed ${profileName}.settings.json: ${(parseError as Error).message}`)
          );
        }
        // Never overwrite malformed settings files; avoid destructive data loss.
        return false;
      }
    }

    // Check if CCS hook already present
    if (hasCcsHook(settings)) {
      // Update timeout if needed
      return updateHookTimeoutIfNeeded(settings, settingsPath);
    }

    // Get hook config
    const hookConfig = getImageAnalyzerHookConfig();

    // Ensure hooks structure exists
    if (!settings.hooks) {
      settings.hooks = {};
    }

    const settingsHooks = settings.hooks as Record<string, unknown[]>;
    if (!settingsHooks.PreToolUse) {
      settingsHooks.PreToolUse = [];
    }

    // Add CCS hook
    const preToolUseHooks = hookConfig.PreToolUse as unknown[];
    settingsHooks.PreToolUse.push(...preToolUseHooks);

    // Write updated settings
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');

    if (process.env.CCS_DEBUG) {
      console.error(info(`Added image analyzer hook to ${profileName}.settings.json`));
    }

    return true;
  } catch (error) {
    if (process.env.CCS_DEBUG) {
      console.error(warn(`Failed to inject hook: ${(error as Error).message}`));
    }
    return false;
  }
}

/**
 * Update hook timeout if it differs from current config
 */
function updateHookTimeoutIfNeeded(
  settings: Record<string, unknown>,
  settingsPath: string
): boolean {
  try {
    const hooks = settings.hooks as Record<string, unknown[]>;
    const hookConfig = getImageAnalyzerHookConfig();
    const expectedHookPath = getImageAnalyzerHookPath();
    const expectedCommand = `node "${expectedHookPath}"`;
    const expectedHooks = (hookConfig.PreToolUse as Array<Record<string, unknown>>)[0]
      .hooks as Array<Record<string, unknown>>;
    const expectedTimeout = expectedHooks[0].timeout as number;

    let needsUpdate = false;

    for (const h of hooks.PreToolUse) {
      const hook = h as Record<string, unknown>;
      if (hook.matcher !== 'Read') continue;

      const hookArray = hook.hooks as Array<Record<string, unknown>>;
      if (!hookArray?.[0]?.command) continue;

      const command = hookArray[0].command;
      if (typeof command !== 'string') continue;
      // Normalize path separators for cross-platform matching (Windows uses backslashes)
      const normalizedCommand = command
        .replace(/\\/g, '/') // Windows backslashes
        .replace(/\/+/g, '/'); // Collapse multiple slashes
      if (!normalizedCommand.includes('.ccs/hooks/image-analyzer-transformer')) continue;

      // Found CCS hook - check if needs update
      if (hookArray[0].command !== expectedCommand) {
        hookArray[0].command = expectedCommand;
        needsUpdate = true;
      }

      if (hookArray[0].timeout !== expectedTimeout) {
        hookArray[0].timeout = expectedTimeout;
        needsUpdate = true;
      }
    }

    if (needsUpdate) {
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
      if (process.env.CCS_DEBUG) {
        console.error(info('Updated image analyzer hook timeout in profile settings'));
      }
    }

    return true;
  } catch (error) {
    if (process.env.CCS_DEBUG) {
      console.error(warn(`updateHookTimeoutIfNeeded failed: ${(error as Error).message}`));
    }
    return false;
  }
}

/**
 * Remove migration marker (called during uninstall)
 */
export function removeMigrationMarker(): void {
  try {
    const markerPath = getMigrationMarkerPath();
    if (fs.existsSync(markerPath)) {
      fs.unlinkSync(markerPath);
    }
  } catch (error) {
    if (process.env.CCS_DEBUG) {
      console.error(warn(`removeMigrationMarker failed: ${(error as Error).message}`));
    }
  }
}
