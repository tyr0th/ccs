import { describe, expect, it } from 'bun:test';
import { buildWebSearchReadiness } from '../../../../src/utils/websearch/status';
import type { WebSearchCliInfo } from '../../../../src/utils/websearch/types';

function provider(overrides: Partial<WebSearchCliInfo> & Pick<WebSearchCliInfo, 'id' | 'name'>): WebSearchCliInfo {
  return {
    id: overrides.id,
    kind: overrides.kind ?? 'backend',
    name: overrides.name,
    enabled: overrides.enabled ?? false,
    available: overrides.available ?? false,
    version: overrides.version ?? null,
    requiresApiKey: overrides.requiresApiKey ?? false,
    description: overrides.description ?? '',
    detail: overrides.detail ?? '',
    ...overrides,
  };
}

describe('websearch readiness', () => {
  it('is ready by default because DuckDuckGo is enabled', () => {
    const readiness = buildWebSearchReadiness(true, [
      provider({
        id: 'duckduckgo',
        name: 'DuckDuckGo',
        enabled: true,
        available: true,
        detail: 'Built-in (5 results)',
      }),
    ]);

    expect(readiness.readiness).toBe('ready');
    expect(readiness.message).toContain('DuckDuckGo');
  });

  it('reports setup required when only Tavily is enabled without an API key', () => {
    const readiness = buildWebSearchReadiness(true, [
      provider({
        id: 'tavily',
        name: 'Tavily',
        enabled: true,
        available: false,
        requiresApiKey: true,
        apiKeyEnvVar: 'TAVILY_API_KEY',
        detail: 'Set TAVILY_API_KEY',
      }),
      provider({
        id: 'duckduckgo',
        name: 'DuckDuckGo',
        enabled: false,
        available: false,
        detail: 'Built-in (5 results)',
      }),
    ]);

    expect(readiness.readiness).toBe('needs_setup');
    expect(readiness.message).toContain('Tavily');
    expect(readiness.message).toContain('TAVILY_API_KEY');
  });

  it('prefers API-backed readiness when Exa is enabled and configured', () => {
    const readiness = buildWebSearchReadiness(true, [
      provider({
        id: 'exa',
        name: 'Exa',
        enabled: true,
        available: true,
        requiresApiKey: true,
        apiKeyEnvVar: 'EXA_API_KEY',
        detail: 'API key detected (5 results)',
      }),
      provider({
        id: 'duckduckgo',
        name: 'DuckDuckGo',
        enabled: false,
        available: false,
        detail: 'Built-in (5 results)',
      }),
    ]);

    expect(readiness.readiness).toBe('ready');
    expect(readiness.message).toContain('Exa');
  });
});
