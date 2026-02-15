import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  maybeShowLegacyToolAliasWarning,
  resetLegacyToolAliasWarningCacheForTests,
} from '../../../src/tools/legacy-alias-warning';

describe('legacy tool alias warnings', () => {
  let originalFlag: string | undefined;
  let originalDateNow: typeof Date.now;
  let originalError: typeof console.error;
  let errorLines: string[] = [];

  beforeEach(() => {
    originalFlag = process.env.CCS_LEGACY_TOOL_ALIAS_WARN;
    originalDateNow = Date.now;
    originalError = console.error;
    errorLines = [];
    console.error = (...args: unknown[]) => {
      errorLines.push(args.map(String).join(' '));
    };
    resetLegacyToolAliasWarningCacheForTests();
  });

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.CCS_LEGACY_TOOL_ALIAS_WARN;
    } else {
      process.env.CCS_LEGACY_TOOL_ALIAS_WARN = originalFlag;
    }
    Date.now = originalDateNow;
    console.error = originalError;
    resetLegacyToolAliasWarningCacheForTests();
  });

  it('shows warning once per alias when forced via env flag', () => {
    process.env.CCS_LEGACY_TOOL_ALIAS_WARN = '1';

    maybeShowLegacyToolAliasWarning('cursor');
    maybeShowLegacyToolAliasWarning('cursor');
    maybeShowLegacyToolAliasWarning('copilot');

    expect(errorLines.length).toBe(2);
    expect(errorLines[0]).toContain("Use 'ccs tool cursor ...' instead.");
    expect(errorLines[1]).toContain("Use 'ccs tool copilot ...' instead.");
  });

  it('suppresses warnings when explicitly disabled via env flag', () => {
    process.env.CCS_LEGACY_TOOL_ALIAS_WARN = '0';

    maybeShowLegacyToolAliasWarning('cursor');
    maybeShowLegacyToolAliasWarning('copilot');

    expect(errorLines).toHaveLength(0);
  });

  it('respects rollout date when env flag is unset', () => {
    delete process.env.CCS_LEGACY_TOOL_ALIAS_WARN;
    Date.now = () => Date.parse('2026-01-01T00:00:00.000Z');

    maybeShowLegacyToolAliasWarning('cursor');
    expect(errorLines).toHaveLength(0);
  });
});
