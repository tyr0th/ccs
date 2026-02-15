import type { CLIProxyProvider } from './types';

export type ProviderOAuthFlowType = 'authorization_code' | 'device_code';

export interface ProviderCatalogFeatureFlags {
  supportsQuota: boolean;
  requiresNickname: boolean;
  supportsImageAnalysis: boolean;
}

export interface ProviderCatalogDefaults {
  imageAnalysisModel: string | null;
}

export interface ProviderCatalogEntry {
  id: CLIProxyProvider;
  displayName: string;
  oauthFlow: ProviderOAuthFlowType;
  callbackPort: number | null;
  aliases: readonly string[];
  logoAssetPath: string | null;
  features: ProviderCatalogFeatureFlags;
  defaults: ProviderCatalogDefaults;
}

const DEFAULT_FEATURE_FLAGS: ProviderCatalogFeatureFlags = {
  supportsQuota: false,
  requiresNickname: false,
  supportsImageAnalysis: true,
};

function defineCatalogEntry(
  input: Omit<ProviderCatalogEntry, 'features'> & {
    features?: Partial<ProviderCatalogFeatureFlags>;
  }
): ProviderCatalogEntry {
  return {
    ...input,
    features: {
      ...DEFAULT_FEATURE_FLAGS,
      ...input.features,
    },
  };
}

export const PROVIDER_CATALOG: readonly ProviderCatalogEntry[] = Object.freeze([
  defineCatalogEntry({
    id: 'gemini',
    displayName: 'Google Gemini',
    oauthFlow: 'authorization_code',
    callbackPort: 8085,
    aliases: ['gemini-cli'],
    logoAssetPath: '/assets/providers/gemini-color.svg',
    defaults: { imageAnalysisModel: 'gemini-2.5-flash' },
  }),
  defineCatalogEntry({
    id: 'codex',
    displayName: 'Codex',
    oauthFlow: 'authorization_code',
    callbackPort: 1455,
    aliases: [],
    logoAssetPath: '/assets/providers/openai.svg',
    defaults: { imageAnalysisModel: 'gpt-5.1-codex-mini' },
  }),
  defineCatalogEntry({
    id: 'agy',
    displayName: 'AntiGravity',
    oauthFlow: 'authorization_code',
    callbackPort: 51121,
    aliases: ['antigravity'],
    logoAssetPath: '/assets/providers/agy.png',
    features: { supportsQuota: true },
    defaults: { imageAnalysisModel: 'gemini-2.5-flash' },
  }),
  defineCatalogEntry({
    id: 'qwen',
    displayName: 'Qwen',
    oauthFlow: 'device_code',
    callbackPort: null,
    aliases: [],
    logoAssetPath: '/assets/providers/qwen-color.svg',
    defaults: { imageAnalysisModel: 'vision-model' },
  }),
  defineCatalogEntry({
    id: 'iflow',
    displayName: 'iFlow',
    oauthFlow: 'authorization_code',
    callbackPort: 11451,
    aliases: [],
    logoAssetPath: '/assets/providers/iflow.png',
    defaults: { imageAnalysisModel: 'qwen3-vl-plus' },
  }),
  defineCatalogEntry({
    id: 'kiro',
    displayName: 'Kiro (AWS)',
    oauthFlow: 'device_code',
    callbackPort: null,
    aliases: ['codewhisperer'],
    logoAssetPath: '/assets/providers/kiro.png',
    features: { requiresNickname: true },
    defaults: { imageAnalysisModel: 'kiro-claude-haiku-4-5' },
  }),
  defineCatalogEntry({
    id: 'ghcp',
    displayName: 'GitHub Copilot (OAuth)',
    oauthFlow: 'device_code',
    callbackPort: null,
    aliases: ['github-copilot', 'copilot'],
    logoAssetPath: '/assets/providers/copilot.svg',
    features: { requiresNickname: true },
    defaults: { imageAnalysisModel: 'claude-haiku-4.5' },
  }),
  defineCatalogEntry({
    id: 'claude',
    displayName: 'Claude',
    oauthFlow: 'authorization_code',
    callbackPort: 54545,
    aliases: ['anthropic'],
    logoAssetPath: '/assets/providers/claude.svg',
    defaults: { imageAnalysisModel: 'claude-haiku-4-5-20251001' },
  }),
]);
