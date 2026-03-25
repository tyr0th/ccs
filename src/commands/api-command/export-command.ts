import * as fs from 'fs';
import * as path from 'path';
import { exportApiProfile } from '../../api/services';
import { fail, initUI, ok, warn } from '../../utils/ui';
import { extractOption, hasAnyFlag } from '../arg-extractor';
import { collectUnexpectedApiArgs } from './shared';

interface ApiExportCommandDependencies {
  exportApiProfile: typeof exportApiProfile;
  initUI: typeof initUI;
  ok: typeof ok;
  warn: typeof warn;
  fail: typeof fail;
  getCwd: () => string;
}

const defaultApiExportCommandDependencies: ApiExportCommandDependencies = {
  exportApiProfile,
  initUI,
  ok,
  warn,
  fail,
  getCwd: () => process.cwd(),
};

export async function handleApiExportCommand(
  args: string[],
  deps: ApiExportCommandDependencies = defaultApiExportCommandDependencies
): Promise<void> {
  await deps.initUI();
  const includeSecrets = hasAnyFlag(args, ['--include-secrets']);

  const outExtracted = extractOption(args, ['--out'], {
    allowDashValue: true,
    allowLongDashValue: true,
    knownFlags: ['--out', '--include-secrets'],
  });
  if (outExtracted.found && (outExtracted.missingValue || !outExtracted.value)) {
    console.log(deps.fail('Missing value for --out'));
    process.exit(1);
  }

  const syntax = collectUnexpectedApiArgs(outExtracted.remainingArgs, {
    knownFlags: ['--include-secrets'],
    maxPositionals: 1,
  });
  if (syntax.errors.length > 0) {
    syntax.errors.forEach((errorMessage) => console.log(deps.fail(errorMessage)));
    process.exit(1);
  }

  const name = syntax.positionals[0];
  if (!name) {
    console.log(deps.fail('Profile name is required. Usage: ccs api export <name> [--out <file>]'));
    process.exit(1);
  }

  const result = deps.exportApiProfile(name, includeSecrets);
  if (!result.success || !result.bundle) {
    console.log(deps.fail(result.error || 'Failed to export profile'));
    process.exit(1);
  }

  const outputPath = path.resolve(deps.getCwd(), outExtracted.value || `${name}.ccs-profile.json`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(result.bundle, null, 2) + '\n', 'utf8');

  console.log(deps.ok(`Profile exported to: ${outputPath}`));
  if (result.redacted) {
    console.log(deps.warn('Token was redacted in export. Use --include-secrets to include it.'));
  }
  console.log('');
}
