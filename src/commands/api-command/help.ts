import {
  PROVIDER_PRESETS,
  listCliproxyBridgeProviders,
  getPresetAliases,
  getPresetIds,
  type ProviderPreset,
} from '../../api/services';
import { color, dim, fail, header, initUI, subheader } from '../../utils/ui';
import { sanitizeHelpText } from './shared';

function renderPresetHelpLine(preset: ProviderPreset, idWidth: number): string {
  const presetId = sanitizeHelpText(preset.id) || 'unknown';
  const paddedId = presetId.padEnd(idWidth);
  const presetName = sanitizeHelpText(preset.name) || 'Unknown preset';
  const presetDescription = sanitizeHelpText(preset.description) || 'No description';
  return `  ${color(paddedId, 'command')} ${presetName} - ${presetDescription}`;
}

export async function showApiCommandHelp(): Promise<void> {
  await initUI();
  const presetIds = getPresetIds()
    .map((id) => sanitizeHelpText(id))
    .filter(Boolean);
  const cliproxyProviderIds = listCliproxyBridgeProviders().map((provider) => provider.provider);
  const presetAliases = getPresetAliases();
  const presetIdWidth = Math.max(0, ...presetIds.map((id) => id.length)) + 2;

  console.log(header('CCS API Management'));
  console.log('');
  console.log(subheader('Usage'));
  console.log(`  ${color('ccs api', 'command')} <command> [options]`);
  console.log('');
  console.log(subheader('Commands'));
  console.log(`  ${color('create [name]', 'command')}    Create new API profile (interactive)`);
  console.log(`  ${color('list', 'command')}             List all API profiles`);
  console.log(
    `  ${color('discover', 'command')}         Discover orphan *.settings.json and register`
  );
  console.log(`  ${color('copy <src> <dest>', 'command')} Duplicate API profile settings + config`);
  console.log(
    `  ${color('export <name>', 'command')}    Export profile bundle for cross-device transfer`
  );
  console.log(
    `  ${color('import <file>', 'command')}    Import profile bundle and register profile`
  );
  console.log(`  ${color('remove <name>', 'command')}    Remove an API profile`);
  console.log('');
  console.log(subheader('Options'));
  console.log(
    `  ${color('--preset <id>', 'command')}        Use provider preset (${presetIds.join(', ')})`
  );
  console.log(
    `  ${color('--cliproxy-provider <id>', 'command')} Use routed CLIProxy provider (${cliproxyProviderIds.join(', ')})`
  );
  console.log(`  ${color('--base-url <url>', 'command')}     API base URL (create)`);
  console.log(`  ${color('--api-key <key>', 'command')}      API key (create)`);
  console.log(`  ${color('--model <model>', 'command')}      Default model (create)`);
  console.log(
    `  ${color('--1m / --no-1m', 'command')}         Write or clear [1m] on compatible Claude mappings`
  );
  console.log(
    `  ${color('--target <cli>', 'command')}       Default target: claude or droid (create)`
  );
  console.log(`  ${color('--register', 'command')}           Register discovered orphan settings`);
  console.log(`  ${color('--json', 'command')}               JSON output for discover command`);
  console.log(`  ${color('--out <file>', 'command')}         Export bundle output path`);
  console.log(`  ${color('--include-secrets', 'command')}    Include token in export bundle`);
  console.log(`  ${color('--name <name>', 'command')}        Override profile name during import`);
  console.log(
    `  ${color('--force', 'command')}              Overwrite existing or bypass validation (create/discover/copy/import)`
  );
  console.log(`  ${color('--yes, -y', 'command')}            Skip confirmation prompts`);
  console.log('');
  console.log(subheader('Provider Presets'));
  PROVIDER_PRESETS.forEach((preset) => console.log(renderPresetHelpLine(preset, presetIdWidth)));
  Object.entries(presetAliases).forEach(([alias, canonical]) => {
    const safeAlias = sanitizeHelpText(alias);
    const safeCanonical = sanitizeHelpText(canonical);
    console.log(
      `  ${dim(`Legacy alias: --preset ${safeAlias} (auto-mapped to ${safeCanonical})`)}`
    );
  });
  console.log('');
  console.log(subheader('Examples'));
  console.log(`  ${dim('# Interactive wizard')}`);
  console.log(`  ${color('ccs api create', 'command')}`);
  console.log('');
  console.log(`  ${dim('# Quick setup with preset')}`);
  console.log(`  ${color('ccs api create --preset anthropic', 'command')}`);
  console.log(
    `  ${color('ccs api create --preset anthropic --1m', 'command')} ${dim('# explicit Claude [1m] opt-in')}`
  );
  console.log(`  ${color('ccs api create --preset openrouter', 'command')}`);
  console.log(`  ${color('ccs api create --preset alibaba-coding-plan', 'command')}`);
  console.log(`  ${color('ccs api create --preset alibaba', 'command')} ${dim('# alias')}`);
  console.log(`  ${color('ccs api create --preset glm', 'command')}`);
  console.log('');
  console.log(subheader('Claude Long Context'));
  console.log(`  ${dim('Plain Claude model IDs stay on standard context by default.')}`);
  console.log(
    `  ${dim('Use --1m during create to append [1m] to compatible Claude mappings, or --no-1m to force plain IDs.')}`
  );
  console.log(
    `  ${dim('CCS controls only the saved [1m] suffix. Provider pricing/entitlement stay upstream, and some accounts can still return 429 for long-context requests.')}`
  );
  console.log('');
  console.log(`  ${dim('# Create routed profile from existing CLIProxy provider config')}`);
  console.log(`  ${color('ccs api create --cliproxy-provider gemini', 'command')}`);
  console.log(
    `  ${color('ccs api create gemini-droid --cliproxy-provider gemini --target droid', 'command')}`
  );
  console.log('');
  console.log(`  ${dim('# Create with name')}`);
  console.log(`  ${color('ccs api create myapi', 'command')}`);
  console.log(`  ${color('ccs api create mydroid --preset glm --target droid', 'command')}`);
  console.log('');
  console.log(`  ${dim('# Remove API profile')}`);
  console.log(`  ${color('ccs api remove myapi', 'command')}`);
  console.log('');
  console.log(`  ${dim('# Discover and register orphan settings files')}`);
  console.log(`  ${color('ccs api discover', 'command')}`);
  console.log(`  ${color('ccs api discover --register', 'command')}`);
  console.log('');
  console.log(`  ${dim('# Duplicate an existing API profile')}`);
  console.log(`  ${color('ccs api copy glm glm-backup', 'command')}`);
  console.log('');
  console.log(`  ${dim('# Export and import across devices')}`);
  console.log(`  ${color('ccs api export glm --out ./glm.ccs-profile.json', 'command')}`);
  console.log(`  ${color('ccs api import ./glm.ccs-profile.json', 'command')}`);
  console.log('');
  console.log(`  ${dim('# Show all API profiles')}`);
  console.log(`  ${color('ccs api list', 'command')}`);
  console.log('');
}

export async function showUnknownApiCommand(command: string): Promise<void> {
  await initUI();
  console.log(fail(`Unknown command: ${command}`));
  console.log('');
  console.log('Run for help:');
  console.log(`  ${color('ccs api --help', 'command')}`);
  process.exit(1);
}
