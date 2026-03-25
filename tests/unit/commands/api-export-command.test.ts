import { describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { extractOption } from '../../../src/commands/arg-extractor';

describe('api export command', () => {
  it('accepts dash-prefixed output paths via extractOption', () => {
    const result = extractOption(['profile-a', '--out', '--snapshot.json'], ['--out'], {
      allowDashValue: true,
      allowLongDashValue: true,
      knownFlags: ['--out', '--include-secrets'],
    });

    expect(result.found).toBe(true);
    expect(result.missingValue).toBe(false);
    expect(result.value).toBe('--snapshot.json');
    expect(result.remainingArgs).toEqual(['profile-a']);
  });

  it('writes dash-prefixed filenames to disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ccs-api-export-test-'));
    try {
      const outputPath = resolve(dir, '--snapshot.json');
      const bundle = { profile: { name: 'profile-a' } };
      writeFileSync(outputPath, JSON.stringify(bundle, null, 2) + '\n', 'utf8');

      expect(existsSync(outputPath)).toBe(true);
      expect(readFileSync(outputPath, 'utf8')).toContain('"name": "profile-a"');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
