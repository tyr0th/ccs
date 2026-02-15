import { describe, expect, test } from 'bun:test';
import {
  CLIPROXY_PROVIDER_IDS,
  getProviderCapabilities,
} from '../../../src/cliproxy/provider-capabilities';
import {
  CLIPROXY_PROVIDERS,
  getProviderMetadata,
} from '../../../ui/src/lib/provider-config';

describe('Provider Sync', () => {
  test('backend provider IDs match UI provider IDs', () => {
    const backend = [...CLIPROXY_PROVIDER_IDS].sort();
    const ui = [...CLIPROXY_PROVIDERS].sort();
    expect(backend).toEqual(ui);
  });

  test('UI metadata display names match backend capabilities', () => {
    for (const provider of CLIPROXY_PROVIDER_IDS) {
      const uiMetadata = getProviderMetadata(provider);
      const backend = getProviderCapabilities(provider);
      expect(uiMetadata?.displayName).toBe(backend.displayName);
      expect(uiMetadata?.oauthFlow).toBe(backend.oauthFlow);
      expect(uiMetadata?.assetPath).toBe(backend.logoAssetPath);
    }
  });
});
