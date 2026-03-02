import { describe, it, expect } from 'bun:test';
import {
  canonicalizeModelIdForProvider,
  extractProviderFromPathname,
  isAntigravityProvider,
  normalizeClaudeDottedMajorMinor,
  normalizeClaudeDottedThinkingMajorMinor,
  normalizeModelIdForProvider,
  normalizeModelIdForRouting,
  normalizeModelEnvVarsForProvider,
} from '../../../src/cliproxy/model-id-normalizer';

describe('model-id-normalizer', () => {
  describe('provider parsing', () => {
    it('extracts provider from provider route path', () => {
      expect(extractProviderFromPathname('/api/provider/agy/v1/messages')).toBe('agy');
      expect(extractProviderFromPathname('/api/provider/antigravity')).toBe('antigravity');
      expect(extractProviderFromPathname('/v1/messages')).toBeNull();
    });

    it('detects antigravity provider aliases', () => {
      expect(isAntigravityProvider('agy')).toBe(true);
      expect(isAntigravityProvider('antigravity')).toBe(true);
      expect(isAntigravityProvider('gemini')).toBe(false);
      expect(isAntigravityProvider(undefined)).toBe(false);
    });
  });

  describe('model normalization', () => {
    it('normalizes dotted Claude major.minor to hyphen format', () => {
      expect(normalizeClaudeDottedMajorMinor('claude-sonnet-4.6-thinking')).toBe(
        'claude-sonnet-4-6-thinking'
      );
      expect(normalizeClaudeDottedMajorMinor('claude-opus-4.6')).toBe('claude-opus-4-6');
    });

    it('normalizes only dotted thinking variants for root/composite routing', () => {
      expect(normalizeClaudeDottedThinkingMajorMinor('claude-sonnet-4.6-thinking')).toBe(
        'claude-sonnet-4-6-thinking'
      );
      expect(normalizeClaudeDottedThinkingMajorMinor('claude-sonnet-4.6')).toBe(
        'claude-sonnet-4.6'
      );
    });

    it('applies provider-aware routing normalization', () => {
      expect(normalizeModelIdForRouting('claude-sonnet-4.6-thinking', null)).toBe(
        'claude-sonnet-4-6'
      );
      expect(normalizeModelIdForRouting('claude-sonnet-4.6', null)).toBe('claude-sonnet-4.6');
      expect(normalizeModelIdForRouting('claude-sonnet-4.6', 'agy')).toBe('claude-sonnet-4-6');
      expect(normalizeModelIdForRouting('claude-sonnet-4-6-thinking', 'claude')).toBe(
        'claude-sonnet-4-6-thinking'
      );
      expect(normalizeModelIdForRouting('claude-sonnet-4.6-thinking', 'claude')).toBe(
        'claude-sonnet-4.6-thinking'
      );
    });

    it('applies provider-only normalization for antigravity', () => {
      expect(normalizeModelIdForProvider('claude-sonnet-4.6-thinking', 'agy')).toBe(
        'claude-sonnet-4-6'
      );
      expect(normalizeModelIdForProvider('claude-opus-4.6-thinking', 'agy')).toBe(
        'claude-opus-4-6-thinking'
      );
      expect(normalizeModelIdForProvider('claude-opus-4.6-thinking', 'gemini')).toBe(
        'claude-opus-4.6-thinking'
      );
    });

    it('applies provider canonicalization for codex and antigravity', () => {
      expect(canonicalizeModelIdForProvider('gpt-5.3-codex-xhigh', 'codex')).toBe('gpt-5.3-codex');
      expect(canonicalizeModelIdForProvider('claude-sonnet-4.6-thinking', 'agy')).toBe(
        'claude-sonnet-4-6'
      );
      expect(canonicalizeModelIdForProvider('claude-sonnet-4-6-thinking', 'claude')).toBe(
        'claude-sonnet-4-6-thinking'
      );
    });

    it('trims and canonicalizes provider model IDs with surrounding whitespace', () => {
      expect(canonicalizeModelIdForProvider('  gpt-5.3-codex-high  ', 'codex')).toBe(
        'gpt-5.3-codex'
      );
      expect(canonicalizeModelIdForProvider('  claude-sonnet-4.6-thinking  ', 'agy')).toBe(
        'claude-sonnet-4-6'
      );
      expect(canonicalizeModelIdForProvider('  claude-sonnet-4-6-thinking  ', 'claude')).toBe(
        'claude-sonnet-4-6-thinking'
      );
      expect(normalizeModelIdForRouting('  claude-sonnet-4.6-thinking  ', null)).toBe(
        'claude-sonnet-4-6'
      );
    });
  });

  describe('env normalization', () => {
    it('normalizes model env vars for antigravity only', () => {
      const input: NodeJS.ProcessEnv = {
        ANTHROPIC_MODEL: 'claude-sonnet-4.6-thinking',
        ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4.6-thinking',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4.6',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4.5',
        UNRELATED: 'keep-me',
      };

      const normalized = normalizeModelEnvVarsForProvider(input, 'agy');
      expect(normalized.ANTHROPIC_MODEL).toBe('claude-sonnet-4-6');
      expect(normalized.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('claude-opus-4-6-thinking');
      expect(normalized.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('claude-sonnet-4-6');
      expect(normalized.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('claude-haiku-4-5');
      expect(normalized.UNRELATED).toBe('keep-me');

      const unchanged = normalizeModelEnvVarsForProvider(input, 'gemini');
      expect(unchanged.ANTHROPIC_MODEL).toBe('claude-sonnet-4.6-thinking');
      expect(unchanged.UNRELATED).toBe('keep-me');
    });
  });
});
