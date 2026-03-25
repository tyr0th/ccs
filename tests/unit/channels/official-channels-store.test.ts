import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  clearConfiguredOfficialChannelToken,
  clearConfiguredOfficialChannelTokensEverywhere,
  getOfficialChannelTokenStatus,
  getOfficialChannelEnvPath,
  hasConfiguredOfficialChannelToken,
  readConfiguredOfficialChannelToken,
  readOfficialChannelTokenFromProcessEnv,
  readOfficialChannelTokenFromEnvContent,
  setConfiguredOfficialChannelToken,
} from '../../../src/channels/official-channels-store';

describe('official channels token store', () => {
  let tempHome = '';
  let originalHome: string | undefined;
  let originalCcsHome: string | undefined;

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-discord-channels-'));
    originalHome = process.env.HOME;
    originalCcsHome = process.env.CCS_HOME;
    process.env.HOME = tempHome;
    process.env.CCS_HOME = tempHome;
  });

  afterEach(() => {
    if (originalHome !== undefined) process.env.HOME = originalHome;
    else delete process.env.HOME;

    if (originalCcsHome !== undefined) process.env.CCS_HOME = originalCcsHome;
    else delete process.env.CCS_HOME;

    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  it('writes and reads DISCORD_BOT_TOKEN from the canonical Discord env file', () => {
    const envPath = setConfiguredOfficialChannelToken('discord', 'discord-secret');

    expect(envPath).toBe(path.join(tempHome, '.claude', 'channels', 'discord', '.env'));
    expect(hasConfiguredOfficialChannelToken('discord')).toBe(true);
    expect(readConfiguredOfficialChannelToken('discord')).toBe('discord-secret');
    expect(readOfficialChannelTokenFromEnvContent('discord', fs.readFileSync(envPath, 'utf8'))).toBe(
      'discord-secret'
    );
  });

  it('writes and reads TELEGRAM_BOT_TOKEN from the canonical Telegram env file', () => {
    const envPath = setConfiguredOfficialChannelToken('telegram', 'telegram-secret');

    expect(envPath).toBe(path.join(tempHome, '.claude', 'channels', 'telegram', '.env'));
    expect(hasConfiguredOfficialChannelToken('telegram')).toBe(true);
    expect(readConfiguredOfficialChannelToken('telegram')).toBe('telegram-secret');
  });

  it('uses the official state-dir override when one is configured', () => {
    const originalDiscordStateDir = process.env.DISCORD_STATE_DIR;
    process.env.DISCORD_STATE_DIR = path.join(tempHome, 'discord-state');

    try {
      const envPath = setConfiguredOfficialChannelToken('discord', 'discord-secret');

      expect(envPath).toBe(path.join(tempHome, 'discord-state', '.env'));
      expect(getOfficialChannelEnvPath('discord')).toBe(path.join(tempHome, 'discord-state', '.env'));
      expect(readConfiguredOfficialChannelToken('discord')).toBe('discord-secret');
    } finally {
      if (originalDiscordStateDir !== undefined) {
        process.env.DISCORD_STATE_DIR = originalDiscordStateDir;
      } else {
        delete process.env.DISCORD_STATE_DIR;
      }
    }
  });

  it('treats a current-process env token as available readiness without marking it as saved', () => {
    const originalDiscordToken = process.env.DISCORD_BOT_TOKEN;
    process.env.DISCORD_BOT_TOKEN = 'discord-from-env';

    try {
      expect(readOfficialChannelTokenFromProcessEnv('discord')).toBe('discord-from-env');
      expect(hasConfiguredOfficialChannelToken('discord')).toBe(false);
      expect(getOfficialChannelTokenStatus('discord')).toEqual({
        available: true,
        source: 'process_env',
        envKey: 'DISCORD_BOT_TOKEN',
        savedInClaudeState: false,
        processEnvAvailable: true,
      });
    } finally {
      if (originalDiscordToken !== undefined) {
        process.env.DISCORD_BOT_TOKEN = originalDiscordToken;
      } else {
        delete process.env.DISCORD_BOT_TOKEN;
      }
    }
  });

  it('prefers current-process env tokens over saved Claude state for readiness source', () => {
    const originalTelegramToken = process.env.TELEGRAM_BOT_TOKEN;
    setConfiguredOfficialChannelToken('telegram', 'telegram-saved');
    process.env.TELEGRAM_BOT_TOKEN = 'telegram-from-env';

    try {
      expect(getOfficialChannelTokenStatus('telegram')).toEqual({
        available: true,
        source: 'saved_env',
        envKey: 'TELEGRAM_BOT_TOKEN',
        tokenPath: path.join(tempHome, '.claude', 'channels', 'telegram', '.env'),
        savedInClaudeState: true,
        processEnvAvailable: true,
      });
    } finally {
      if (originalTelegramToken !== undefined) {
        process.env.TELEGRAM_BOT_TOKEN = originalTelegramToken;
      } else {
        delete process.env.TELEGRAM_BOT_TOKEN;
      }
    }
  });

  it('removes only the channel token entry and deletes the file when nothing remains', () => {
    const envPath = getOfficialChannelEnvPath('discord');
    fs.mkdirSync(path.dirname(envPath), { recursive: true });
    fs.writeFileSync(envPath, '# comment\nDISCORD_BOT_TOKEN=secret\nOTHER_KEY=value\n', 'utf8');

    clearConfiguredOfficialChannelToken('discord');
    expect(fs.readFileSync(envPath, 'utf8')).toBe('# comment\nOTHER_KEY=value\n');

    clearConfiguredOfficialChannelToken('discord');
    fs.writeFileSync(envPath, 'DISCORD_BOT_TOKEN=secret\n', 'utf8');
    clearConfiguredOfficialChannelToken('discord');
    expect(fs.existsSync(envPath)).toBe(false);
  });

  it('clears previously synced copies across managed Claude config dirs', () => {
    const originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;
    setConfiguredOfficialChannelToken('discord', 'discord-secret');
    setConfiguredOfficialChannelToken('telegram', 'telegram-secret');

    const instanceConfigDir = path.join(tempHome, '.ccs', 'instances', 'work');
    const processConfigDir = path.join(tempHome, '.claude-account-session');
    const staleDiscordInstancePath = getOfficialChannelEnvPath('discord', instanceConfigDir);
    const staleTelegramInstancePath = getOfficialChannelEnvPath('telegram', instanceConfigDir);
    const staleDiscordProcessPath = getOfficialChannelEnvPath('discord', processConfigDir);

    process.env.CLAUDE_CONFIG_DIR = processConfigDir;

    try {
      fs.mkdirSync(path.dirname(staleDiscordInstancePath), { recursive: true });
      fs.writeFileSync(staleDiscordInstancePath, 'DISCORD_BOT_TOKEN=discord-secret\n', 'utf8');

      fs.mkdirSync(path.dirname(staleTelegramInstancePath), { recursive: true });
      fs.writeFileSync(staleTelegramInstancePath, 'TELEGRAM_BOT_TOKEN=telegram-secret\n', 'utf8');

      fs.mkdirSync(path.dirname(staleDiscordProcessPath), { recursive: true });
      fs.writeFileSync(staleDiscordProcessPath, 'DISCORD_BOT_TOKEN=discord-secret\n', 'utf8');

      expect(fs.existsSync(staleDiscordInstancePath)).toBe(true);
      expect(fs.existsSync(staleTelegramInstancePath)).toBe(true);
      expect(fs.existsSync(staleDiscordProcessPath)).toBe(true);

      const clearedPaths = clearConfiguredOfficialChannelTokensEverywhere();

      expect(clearedPaths).toContain(getOfficialChannelEnvPath('discord'));
      expect(clearedPaths).toContain(getOfficialChannelEnvPath('telegram'));
      expect(clearedPaths).toContain(staleDiscordInstancePath);
      expect(clearedPaths).toContain(staleTelegramInstancePath);
      expect(clearedPaths).toContain(staleDiscordProcessPath);
      expect(fs.existsSync(getOfficialChannelEnvPath('discord'))).toBe(false);
      expect(fs.existsSync(getOfficialChannelEnvPath('telegram'))).toBe(false);
      expect(fs.existsSync(staleDiscordInstancePath)).toBe(false);
      expect(fs.existsSync(staleTelegramInstancePath)).toBe(false);
      expect(fs.existsSync(staleDiscordProcessPath)).toBe(false);
    } finally {
      if (originalClaudeConfigDir !== undefined) {
        process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir;
      } else {
        delete process.env.CLAUDE_CONFIG_DIR;
      }
    }
  });
});
