import { info } from '../utils/ui';

const LEGACY_WARNING_START_ISO = '2026-05-14T00:00:00.000Z';
const shownWarnings = new Set<string>();

function shouldShowWarning(): boolean {
  if (process.env.CCS_LEGACY_TOOL_ALIAS_WARN === '1') {
    return true;
  }
  if (process.env.CCS_LEGACY_TOOL_ALIAS_WARN === '0') {
    return false;
  }
  return Date.now() >= Date.parse(LEGACY_WARNING_START_ISO);
}

export function maybeShowLegacyToolAliasWarning(alias: 'cursor' | 'copilot'): void {
  if (!shouldShowWarning()) {
    return;
  }
  if (shownWarnings.has(alias)) {
    return;
  }
  shownWarnings.add(alias);
  console.error(
    info(
      `Use 'ccs tool ${alias} ...' instead. Legacy alias 'ccs ${alias} ...' will be removed in a future major release.`
    )
  );
}

export function resetLegacyToolAliasWarningCacheForTests(): void {
  shownWarnings.clear();
}
