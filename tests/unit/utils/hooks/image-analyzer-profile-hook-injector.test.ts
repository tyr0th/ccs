import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  ensureProfileHooks,
  getImageAnalysisProfileSettingsPath,
  hasImageAnalysisProfileHook,
} from '../../../../src/utils/hooks/image-analyzer-profile-hook-injector';

function writeJson(filePath: string, value: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

describe('image-analyzer-profile-hook-injector', () => {
  let tempHome = '';
  let originalCcsHome: string | undefined;

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-image-analyzer-profile-hook-'));
    originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tempHome;
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }

    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  it('persists dotted settings profile hooks into the resolved custom settings path', () => {
    const customSettingsPath = path.join(tempHome, 'profiles', 'foo.bar.settings.json');
    writeJson(customSettingsPath, {
      env: {
        ANTHROPIC_BASE_URL: 'https://api.z.ai/v1',
        ANTHROPIC_API_KEY: 'glm-test-key',
      },
    });

    const ensured = ensureProfileHooks({
      profileName: 'foo.bar',
      profileType: 'settings',
      settingsPath: customSettingsPath,
      settings: {
        env: {
          ANTHROPIC_BASE_URL: 'https://api.z.ai/v1',
          ANTHROPIC_API_KEY: 'glm-test-key',
        },
      },
    });

    const defaultSettingsPath = path.join(tempHome, '.ccs', 'foo.bar.settings.json');
    const persisted = JSON.parse(fs.readFileSync(customSettingsPath, 'utf8')) as {
      hooks?: { PreToolUse?: Array<{ matcher?: string }> };
    };

    expect(ensured).toBe(true);
    expect(getImageAnalysisProfileSettingsPath('foo.bar', customSettingsPath)).toBe(
      customSettingsPath
    );
    expect(hasImageAnalysisProfileHook('foo.bar', customSettingsPath)).toBe(true);
    expect(fs.existsSync(defaultSettingsPath)).toBe(false);
    expect(persisted.hooks?.PreToolUse?.some((hook) => hook.matcher === 'Read')).toBe(true);
  });
});
