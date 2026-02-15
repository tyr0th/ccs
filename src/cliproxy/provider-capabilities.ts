import {
  PROVIDER_CATALOG,
  type ProviderCatalogEntry,
  type ProviderOAuthFlowType,
} from './provider-catalog';
import type { CLIProxyProvider } from './types';

export type OAuthFlowType = ProviderOAuthFlowType;

export interface ProviderFeatureFlags {
  supportsQuota: boolean;
  requiresNickname: boolean;
  supportsImageAnalysis: boolean;
}

export interface ProviderDefaults {
  imageAnalysisModel: string | null;
}

export interface ProviderCapabilities {
  displayName: string;
  oauthFlow: OAuthFlowType;
  callbackPort: number | null;
  aliases: readonly string[];
  logoAssetPath: string | null;
  features: ProviderFeatureFlags;
  defaults: ProviderDefaults;
}

function buildCapabilitiesMap(
  catalogEntries: readonly ProviderCatalogEntry[]
): Record<CLIProxyProvider, ProviderCapabilities> {
  const capabilities = {} as Record<CLIProxyProvider, ProviderCapabilities>;
  for (const entry of catalogEntries) {
    capabilities[entry.id] = {
      displayName: entry.displayName,
      oauthFlow: entry.oauthFlow,
      callbackPort: entry.callbackPort,
      aliases: entry.aliases,
      logoAssetPath: entry.logoAssetPath,
      features: {
        supportsQuota: entry.features.supportsQuota,
        requiresNickname: entry.features.requiresNickname,
        supportsImageAnalysis: entry.features.supportsImageAnalysis,
      },
      defaults: {
        imageAnalysisModel: entry.defaults.imageAnalysisModel,
      },
    };
  }
  return capabilities;
}

function normalizeProviderKey(providerName: string): string {
  return providerName.trim().toLowerCase();
}

export function buildProviderAliasMap(
  catalogEntries: readonly Pick<ProviderCatalogEntry, 'id' | 'aliases'>[]
): ReadonlyMap<string, CLIProxyProvider> {
  const aliasMap = new Map<string, CLIProxyProvider>();

  for (const entry of catalogEntries) {
    const names = [entry.id, ...entry.aliases];
    for (const name of names) {
      const normalized = normalizeProviderKey(name);
      if (!normalized) {
        continue;
      }

      const existing = aliasMap.get(normalized);
      if (existing && existing !== entry.id) {
        throw new Error(
          `Provider alias collision for '${normalized}' between '${existing}' and '${entry.id}'`
        );
      }
      aliasMap.set(normalized, entry.id);
    }
  }

  return aliasMap;
}

export const PROVIDER_CAPABILITIES: Record<CLIProxyProvider, ProviderCapabilities> =
  buildCapabilitiesMap(PROVIDER_CATALOG);

export const CLIPROXY_PROVIDER_IDS = Object.freeze(
  PROVIDER_CATALOG.map((entry) => entry.id) as CLIProxyProvider[]
);

const PROVIDER_ID_SET = new Set(CLIPROXY_PROVIDER_IDS);
const PROVIDER_ALIAS_MAP = buildProviderAliasMap(PROVIDER_CATALOG);

export function isCLIProxyProvider(provider: string): provider is CLIProxyProvider {
  return PROVIDER_ID_SET.has(provider as CLIProxyProvider);
}

export function getProviderCapabilities(provider: CLIProxyProvider): ProviderCapabilities {
  return PROVIDER_CAPABILITIES[provider];
}

export function getProviderDisplayName(provider: CLIProxyProvider): string {
  return PROVIDER_CAPABILITIES[provider].displayName;
}

export function getProviderAliases(provider: CLIProxyProvider): readonly string[] {
  return PROVIDER_CAPABILITIES[provider].aliases;
}

export function getProviderDefaultImageAnalysisModel(provider: CLIProxyProvider): string | null {
  return PROVIDER_CAPABILITIES[provider].defaults.imageAnalysisModel;
}

export function getProviderLogoAssetPath(provider: CLIProxyProvider): string | null {
  return PROVIDER_CAPABILITIES[provider].logoAssetPath;
}

export function providerRequiresNickname(provider: CLIProxyProvider): boolean {
  return PROVIDER_CAPABILITIES[provider].features.requiresNickname;
}

export function supportsProviderQuota(provider: CLIProxyProvider): boolean {
  return PROVIDER_CAPABILITIES[provider].features.supportsQuota;
}

export function supportsProviderImageAnalysis(provider: CLIProxyProvider): boolean {
  return PROVIDER_CAPABILITIES[provider].features.supportsImageAnalysis;
}

export function getProvidersByOAuthFlow(flowType: OAuthFlowType): CLIProxyProvider[] {
  return CLIPROXY_PROVIDER_IDS.filter(
    (provider) => PROVIDER_CAPABILITIES[provider].oauthFlow === flowType
  );
}

export const DEVICE_CODE_PROVIDER_IDS = Object.freeze(getProvidersByOAuthFlow('device_code'));

export const NICKNAME_REQUIRED_PROVIDER_IDS = Object.freeze(
  CLIPROXY_PROVIDER_IDS.filter(providerRequiresNickname)
);

export const IMAGE_ANALYSIS_PROVIDER_IDS = Object.freeze(
  CLIPROXY_PROVIDER_IDS.filter(supportsProviderImageAnalysis)
);

export function getProvidersSupportingImageAnalysis(): CLIProxyProvider[] {
  return [...IMAGE_ANALYSIS_PROVIDER_IDS];
}

export function getOAuthFlowType(provider: CLIProxyProvider): OAuthFlowType {
  return PROVIDER_CAPABILITIES[provider].oauthFlow;
}

export function getOAuthCallbackPort(provider: CLIProxyProvider): number | null {
  return PROVIDER_CAPABILITIES[provider].callbackPort;
}

export function mapExternalProviderName(providerName: string): CLIProxyProvider | null {
  const normalized = normalizeProviderKey(providerName);
  if (!normalized) {
    return null;
  }
  return PROVIDER_ALIAS_MAP.get(normalized) ?? null;
}
