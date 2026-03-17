import { extractOption, hasAnyFlag } from './arg-extractor';

const CONFIG_COMMAND_FLAGS = ['--help', '-h', '--port', '-p', '--host', '-H', '--dev'] as const;

export interface ConfigCommandOptions {
  port?: number;
  host?: string;
  hostProvided: boolean;
  dev: boolean;
}

export interface ConfigCommandParseResult {
  help: boolean;
  error?: string;
  options: ConfigCommandOptions;
}

export function parseConfigCommandArgs(args: string[]): ConfigCommandParseResult {
  const options: ConfigCommandOptions = {
    hostProvided: false,
    dev: false,
  };

  if (hasAnyFlag(args, ['--help', '-h'])) {
    return { help: true, options };
  }

  const portOption = extractOption(args, ['--port', '-p'], {
    knownFlags: CONFIG_COMMAND_FLAGS,
  });
  if (portOption.found) {
    if (portOption.missingValue || !portOption.value) {
      return { help: false, error: 'Invalid port number', options };
    }

    const port = parseInt(portOption.value, 10);
    if (Number.isNaN(port) || port <= 0 || port >= 65536) {
      return { help: false, error: 'Invalid port number', options };
    }

    options.port = port;
  }

  const hostOption = extractOption(portOption.remainingArgs, ['--host', '-H'], {
    knownFlags: CONFIG_COMMAND_FLAGS,
  });
  if (hostOption.found) {
    const host = hostOption.value?.trim();
    if (hostOption.missingValue || !host) {
      return { help: false, error: 'Invalid host value', options };
    }

    options.host = host;
    options.hostProvided = true;
  }

  options.dev = hasAnyFlag(hostOption.remainingArgs, ['--dev']);

  return { help: false, options };
}

export function showConfigCommandHelp(): void {
  console.log('');
  console.log('Usage: ccs config [command] [options]');
  console.log('');
  console.log('Open web-based configuration dashboard');
  console.log('Includes a dedicated Claude IDE Extension page for VS Code-compatible hosts.');
  console.log('');
  console.log('Commands:');
  console.log('  auth               Manage dashboard authentication');
  console.log('    auth setup       Configure username and password');
  console.log('    auth show        Display current auth status');
  console.log('    auth disable     Disable authentication');
  console.log('');
  console.log('  image-analysis     Manage image analysis settings');
  console.log('    --enable         Enable image analysis via CLIProxy');
  console.log('    --disable        Disable image analysis');
  console.log('    --timeout <s>    Set analysis timeout (seconds)');
  console.log('    --set-model <p> <m>  Set model for provider');
  console.log('');
  console.log('  Claude IDE Extension');
  console.log('    Dashboard page   Generate copy-ready setup for VS Code, Cursor, Windsurf');
  console.log('    Shared settings  Shows preferred ~/.claude/settings.json setup');
  console.log('    IDE-local JSON   Shows extension-specific environmentVariables snippets');
  console.log('');
  console.log('  thinking           Manage thinking/reasoning settings');
  console.log('    --mode <mode>    Set mode (auto, off, manual)');
  console.log('    --override <l>   Set persistent override level');
  console.log('    --clear-override Remove persistent override');
  console.log('    --tier <t> <l>   Set tier default level');
  console.log('    --provider-override <p> <t> <l> Set provider tier override');
  console.log('    --clear-provider-override <p> [t] Remove provider override');
  console.log('');
  console.log('Options:');
  console.log('  --port, -p PORT    Specify server port (default: auto-detect)');
  console.log('  --host, -H HOST    Bind dashboard server host (default: system default)');
  console.log('  --dev              Development mode with Vite HMR');
  console.log('  --help, -h         Show this help message');
  console.log('');
  console.log('Examples:');
  console.log('  ccs config                       Auto-detect available port');
  console.log('  ccs config --port 3000           Use specific port');
  console.log('  ccs config --host 0.0.0.0        Force all-interface binding for remote devices');
  console.log('  ccs config --host 127.0.0.1      Restrict dashboard to this machine');
  console.log('  ccs config --dev                 Development mode with hot reload');
  console.log('  ccs config auth setup            Configure dashboard login');
  console.log('  ccs config image-analysis        Show image settings');
  console.log('  ccs config image-analysis --enable Enable feature');
  console.log('  ccs config thinking              Show thinking settings');
  console.log('  ccs config thinking --mode auto  Set auto mode');
  console.log('');
}
