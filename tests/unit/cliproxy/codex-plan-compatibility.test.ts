import { describe, expect, it } from 'bun:test';
import { getProviderCatalog, getModelMaxLevel } from '../../../src/cliproxy/model-catalog';
import {
  getDefaultCodexModel,
  getFreePlanFallbackCodexModel,
  parseCodexUnsupportedModelError,
  resolveRuntimeCodexFallbackModel,
} from '../../../src/cliproxy/codex-plan-compatibility';

describe('codex plan compatibility', () => {
  it('uses a cross-plan safe Codex default', () => {
    expect(getDefaultCodexModel()).toBe('gpt-5-codex');
    expect(getProviderCatalog('codex')?.defaultModel).toBe('gpt-5-codex');
  });

  it('maps paid-only free-plan models to safe fallbacks', () => {
    expect(getFreePlanFallbackCodexModel('gpt-5.3-codex')).toBe('gpt-5-codex');
    expect(getFreePlanFallbackCodexModel('gpt-5.3-codex-xhigh')).toBe('gpt-5-codex');
    expect(getFreePlanFallbackCodexModel('gpt-5.3-codex(high)')).toBe('gpt-5-codex');
    expect(getFreePlanFallbackCodexModel('gpt-5.4')).toBe('gpt-5-codex');
    expect(getFreePlanFallbackCodexModel('gpt-5.3-codex-spark')).toBe('gpt-5-codex-mini');
  });

  it('does not rewrite cross-plan or already-safe Codex models', () => {
    expect(getFreePlanFallbackCodexModel('gpt-5-codex')).toBeNull();
    expect(getFreePlanFallbackCodexModel('gpt-5.2-codex')).toBeNull();
    expect(getFreePlanFallbackCodexModel('gpt-5.1-codex-mini')).toBeNull();
  });

  it('detects upstream Codex model_not_supported responses', () => {
    expect(
      parseCodexUnsupportedModelError(
        400,
        JSON.stringify({
          error: {
            message: 'The requested model is not supported.',
            code: 'model_not_supported',
            param: 'model',
            type: 'invalid_request_error',
          },
        })
      )
    ).toEqual({
      message: 'The requested model is not supported.',
      code: 'model_not_supported',
      param: 'model',
      type: 'invalid_request_error',
    });
    expect(
      parseCodexUnsupportedModelError(500, '{"error":{"code":"model_not_supported"}}')
    ).toBeNull();
  });

  it('resolves runtime fallbacks without retrying the rejected model again', () => {
    expect(
      resolveRuntimeCodexFallbackModel({
        requestedModel: 'gpt-5.4',
        modelMap: { defaultModel: 'gpt-5-codex' },
      })
    ).toBe('gpt-5-codex');

    expect(
      resolveRuntimeCodexFallbackModel({
        requestedModel: 'gpt-5.4',
        modelMap: {
          defaultModel: 'gpt-5.4',
          haikuModel: 'gpt-5-codex-mini',
        },
        excludeModels: ['gpt-5-codex'],
      })
    ).toBe('gpt-5-codex-mini');
  });

  it('tracks Codex thinking caps for current safe defaults and paid models', () => {
    expect(getModelMaxLevel('codex', 'gpt-5-codex')).toBe('high');
    expect(getModelMaxLevel('codex', 'gpt-5-codex-mini')).toBe('high');
    expect(getModelMaxLevel('codex', 'gpt-5.2-codex')).toBe('xhigh');
    expect(getModelMaxLevel('codex', 'gpt-5.3-codex')).toBe('xhigh');
  });
});
