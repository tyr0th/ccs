import { describe, expect, it } from 'vitest';
import {
  getPresetById,
  getPresetsByCategory,
  resolvePresetApiKeyValue,
} from '@/lib/provider-presets';

describe('resolvePresetApiKeyValue', () => {
  it('keeps an explicit API key when one is provided', () => {
    const preset = getPresetById('llamacpp');
    expect(resolvePresetApiKeyValue(preset, 'custom-token')).toBe('custom-token');
  });

  it('uses the local-provider sentinel for Ollama when no API key is provided', () => {
    const preset = getPresetById('ollama');
    expect(resolvePresetApiKeyValue(preset, '')).toBe('ollama');
  });

  it('uses the local-provider sentinel for llama.cpp when no API key is provided', () => {
    const preset = getPresetById('llamacpp');
    expect(resolvePresetApiKeyValue(preset, '')).toBe('llamacpp');
  });

  it('returns an empty string for API-key providers when input is empty', () => {
    const preset = getPresetById('openrouter');
    expect(resolvePresetApiKeyValue(preset, '')).toBe('');
  });
});

describe('provider preset metadata', () => {
  it('maps legacy glmt preset requests to glm', () => {
    expect(getPresetById('glmt')?.id).toBe('glm');
  });

  it('uses the llama.cpp provider logo asset for the local llama.cpp preset', () => {
    expect(getPresetById('llamacpp')?.icon).toBe('/assets/providers/llama-cpp.svg');
  });

  it('keeps Anthropic direct last in the recommended order', () => {
    const recommendedPresetIds = getPresetsByCategory('recommended').map((preset) => preset.id);
    expect(recommendedPresetIds.at(-1)).toBe('anthropic');
  });

  it('reuses the Claude provider logo asset for Anthropic direct', () => {
    expect(getPresetById('anthropic')?.icon).toBe('/assets/providers/claude.svg');
  });
});
