/**
 * Env Command Handler
 *
 * Export environment variables for third-party tool integration.
 * Outputs shell-evaluable exports for OpenCode, Cursor, Continue, etc.
 */

import { initUI, header, dim, color, subheader, fail, warn } from '../utils/ui';
import { CLIProxyProvider } from '../cliproxy/types';
import { CLIPROXY_PROFILES, loadSettingsFromFile } from '../auth/profile-detector';
import { getEffectiveEnvVars } from '../cliproxy/config/env-builder';
import { CLIPROXY_DEFAULT_PORT } from '../cliproxy/config/port-manager';
import { isUnifiedMode, loadUnifiedConfig } from '../config/unified-config-loader';
import { expandPath } from '../utils/helpers';
import { getCcsDir } from '../utils/config-manager';
import { ProfileRegistry } from '../auth/profile-registry';
import { getProfileLookupCandidates } from '../utils/profile-compat';

type ShellType = 'bash' | 'fish' | 'powershell';
type OutputFormat = 'openai' | 'anthropic' | 'raw';

const VALID_FORMATS: OutputFormat[] = ['openai', 'anthropic', 'raw'];
const VALID_SHELLS: ShellType[] = ['bash', 'fish', 'powershell'];
const VALID_SHELL_INPUTS = ['auto', 'bash', 'zsh', 'fish', 'powershell'] as const;
const VALID_ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Auto-detect shell from environment */
export function detectShell(flag?: string): ShellType {
  if (flag && flag !== 'auto' && VALID_SHELLS.includes(flag as ShellType)) {
    return flag as ShellType;
  }
  const shell = process.env['SHELL'] || '';
  if (shell.includes('fish')) return 'fish';
  if (shell.includes('pwsh') || process.platform === 'win32') return 'powershell';
  return 'bash';
}

/** Format a single env var export for the target shell (single-quoted to prevent injection) */
export function formatExportLine(shell: ShellType, key: string, value: string): string {
  switch (shell) {
    case 'fish':
      // Fish: single quotes prevent expansion; escape embedded single quotes with '\''
      return `set -gx ${key} '${value.replace(/'/g, "'\\''")}'`;
    case 'powershell':
      // PowerShell: single quotes prevent expansion; escape embedded single quotes with ''
      return `$env:${key} = '${value.replace(/'/g, "''")}'`;
    default:
      // Bash/zsh: single quotes prevent all expansion; handle embedded single quotes
      return `export ${key}='${value.replace(/'/g, "'\\''")}'`;
  }
}

/** Map Anthropic env vars to OpenAI-compatible format.
 * OPENAI_MODEL is included so tools that need it (e.g. OpenCode local provider)
 * can discover the model without additional configuration. */
export function transformToOpenAI(envVars: Record<string, string>): Record<string, string> {
  const baseUrl = envVars['ANTHROPIC_BASE_URL'] || '';
  const apiKey = envVars['ANTHROPIC_AUTH_TOKEN'] || envVars['ANTHROPIC_API_KEY'] || '';
  const model = envVars['ANTHROPIC_MODEL'] || '';
  const result: Record<string, string> = {};
  if (apiKey) result['OPENAI_API_KEY'] = apiKey;
  if (baseUrl) {
    result['OPENAI_BASE_URL'] = baseUrl;
    result['LOCAL_ENDPOINT'] = baseUrl;
  }
  if (model) result['OPENAI_MODEL'] = model;
  return result;
}

/** Parse --key=value or --key value style args */
export function parseFlag(args: string[], flag: string): string | undefined {
  // --flag=value style
  const eqMatch = args.find((a) => a.startsWith(`--${flag}=`));
  if (eqMatch) return eqMatch.split('=').slice(1).join('=');
  // --flag value style
  const idx = args.indexOf(`--${flag}`);
  if (idx >= 0 && idx + 1 < args.length && !args[idx + 1].startsWith('-')) {
    return args[idx + 1];
  }
  return undefined;
}

/** Find the first positional argument, skipping flags and their values */
export function findProfile(args: string[], flagsWithValues: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('-')) {
      // Skip flag values: --flag=value (single token) or --flag value (two tokens)
      const flagName = arg.replace(/^--/, '').split('=')[0];
      if (!arg.includes('=') && flagsWithValues.includes(flagName) && i + 1 < args.length) {
        i++; // skip next arg (the value)
      }
      continue;
    }
    return arg;
  }
  return undefined;
}

/** Check if a profile is a CLIProxy profile */
function isCLIProxyProfile(name: string): boolean {
  return (CLIPROXY_PROFILES as readonly string[]).includes(name);
}

/** Resolve env vars for settings-based profiles (glm, km, custom API profiles) */
function resolveSettingsProfile(profileName: string): Record<string, string> | null {
  if (!isUnifiedMode()) return null;

  const config = loadUnifiedConfig();
  if (!config) return null;

  // Check unified config profiles section (supports compatibility aliases, e.g. km -> kimi)
  let profileConfig: { type?: string; settings?: string } | undefined;
  for (const candidate of getProfileLookupCandidates(profileName)) {
    const candidateConfig = config.profiles?.[candidate];
    if (candidateConfig) {
      profileConfig = candidateConfig;
      break;
    }
  }
  if (!profileConfig) return null;

  if (profileConfig.type !== 'api') {
    console.error(
      fail(
        `Profile '${profileName}' is type '${profileConfig.type}', not a settings-based API profile.`
      )
    );
    process.exit(1);
  }

  if (profileConfig.settings) {
    const settingsPath = expandPath(profileConfig.settings);
    return loadSettingsFromFile(settingsPath);
  }

  return {};
}

/** Show help for env command */
function showHelp(): void {
  console.log('');
  console.log(header('ccs env'));
  console.log('');
  console.log('  Export environment variables for third-party tool integration.');
  console.log('');

  console.log(subheader('Usage:'));
  console.log(`  ${color('ccs env', 'command')} <profile> [options]`);
  console.log('');

  console.log(subheader('Options:'));
  console.log(
    `  ${color('--format', 'command')} <fmt>    Output format: openai, anthropic, raw ${dim('(default: anthropic)')}`
  );
  console.log(
    `  ${color('--shell', 'command')} <sh>      Shell syntax: auto, bash/zsh, fish, powershell ${dim('(default: auto)')}`
  );
  console.log(`  ${color('--help, -h', 'command')}        Show this help message`);
  console.log('');

  console.log(subheader('Formats:'));
  console.log(
    `  ${color('openai', 'command')}      OPENAI_API_KEY, OPENAI_BASE_URL, LOCAL_ENDPOINT`
  );
  console.log(
    `  ${color('anthropic', 'command')}   ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN, ANTHROPIC_MODEL`
  );
  console.log(`  ${color('raw', 'command')}         All effective env vars as-is`);
  console.log('');

  console.log(subheader('Examples:'));
  console.log(
    `  $ ${color('eval $(ccs env gemini --format openai)', 'command')}     ${dim('# For OpenCode/Cursor')}`
  );
  console.log(
    `  $ ${color('ccs env codex --format anthropic', 'command')}          ${dim('# Anthropic vars')}`
  );
  console.log(
    `  $ ${color('ccs env glm --format raw', 'command')}                  ${dim('# All vars from settings')}`
  );
  console.log(
    `  $ ${color('ccs env agy --format openai --shell fish', 'command')}  ${dim('# Fish shell syntax')}`
  );
  console.log('');
}

/**
 * Handle env command
 * @param args - Command line arguments (after 'env')
 */
export async function handleEnvCommand(args: string[]): Promise<void> {
  await initUI();

  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }

  // Parse profile (first positional argument, skipping flag values)
  const flagsWithValues = ['format', 'shell'];
  const profile = findProfile(args, flagsWithValues);
  if (!profile) {
    console.error(fail('Usage: ccs env <profile> [--format openai|anthropic|raw]'));
    process.exit(1);
  }

  // Parse flags
  const formatStr = parseFlag(args, 'format') || 'anthropic';
  if (!VALID_FORMATS.includes(formatStr as OutputFormat)) {
    console.error(fail(`Invalid format: ${formatStr}. Use: ${VALID_FORMATS.join(', ')}`));
    process.exit(1);
  }
  const format = formatStr as OutputFormat;

  const shellStr = parseFlag(args, 'shell') || 'auto';
  if (!VALID_SHELL_INPUTS.includes(shellStr as (typeof VALID_SHELL_INPUTS)[number])) {
    console.error(fail(`Invalid shell: ${shellStr}. Use: ${VALID_SHELL_INPUTS.join(', ')}`));
    process.exit(1);
  }
  // zsh uses the same syntax as bash
  const shell = detectShell(shellStr === 'zsh' ? 'bash' : shellStr);

  // Resolve env vars based on profile type
  let envVars: Record<string, string> = {};

  if (isCLIProxyProfile(profile)) {
    // CLIProxy profile (gemini, codex, agy, etc.)
    const provider = profile as CLIProxyProvider;
    const resolved = getEffectiveEnvVars(provider, CLIPROXY_DEFAULT_PORT);
    // Convert NodeJS.ProcessEnv to Record<string, string>
    for (const [k, v] of Object.entries(resolved)) {
      if (v !== undefined) envVars[k] = v;
    }
  } else {
    // Settings-based profile (glm, km, custom API)
    const resolved = resolveSettingsProfile(profile);
    if (!resolved) {
      // Check if it's an account-based profile
      const registry = new ProfileRegistry();
      const allProfiles = registry.getAllProfiles();
      if (allProfiles[profile]) {
        console.error(
          fail(
            `'${profile}' is an account-based profile. ` +
              '`ccs env` only supports CLIProxy and settings profiles.'
          )
        );
        process.exit(1);
      }

      console.error(fail(`Profile '${profile}' not found.`));
      console.error(dim('  Available CLIProxy profiles: ' + CLIPROXY_PROFILES.join(', ')));
      if (!isUnifiedMode()) {
        console.error(
          dim('  Settings profiles require unified config. Run `ccs migrate` to upgrade.')
        );
      } else {
        console.error(dim(`  Check ${getCcsDir()}/config.yaml for custom profiles.`));
      }
      process.exit(1);
    }
    envVars = resolved;
  }

  if (Object.keys(envVars).length === 0) {
    console.error(warn(`No env vars resolved for profile '${profile}'.`));
    process.exit(1);
  }

  // Transform to requested format
  let output: Record<string, string>;
  switch (format) {
    case 'openai':
      output = transformToOpenAI(envVars);
      break;
    case 'anthropic': {
      // Filter to only Anthropic-relevant vars
      output = {};
      for (const [k, v] of Object.entries(envVars)) {
        if (k.startsWith('ANTHROPIC_')) {
          output[k] = v;
        }
      }
      break;
    }
    case 'raw':
      output = envVars;
      break;
  }

  // Guard: format transformation may filter out all vars
  if (Object.keys(output).filter((k) => output[k]).length === 0) {
    console.error(
      warn(`No ${format}-format vars found for profile '${profile}'. Try --format raw`)
    );
    process.exit(1);
  }

  // Output shell-formatted exports to stdout
  for (const [key, value] of Object.entries(output)) {
    if (!VALID_ENV_KEY.test(key)) {
      console.error(dim(`  Skipping invalid key: ${key}`));
      continue;
    }
    if (value) {
      console.log(formatExportLine(shell, key, value));
    }
  }
}
