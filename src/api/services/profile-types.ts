/**
 * API Profile Types
 *
 * Shared type definitions for API profile services.
 */

import type { TargetType } from '../../targets/target-adapter';
import type { CLIProxyProvider } from '../../cliproxy/types';

/** Model mapping for API profiles */
export interface ModelMapping {
  default: string;
  opus: string;
  sonnet: string;
  haiku: string;
}

/** API profile info for listing */
export interface ApiProfileInfo {
  name: string;
  settingsPath: string;
  isConfigured: boolean;
  configSource: 'unified' | 'legacy';
  target: TargetType;
  cliproxyBridge?: CliproxyBridgeMetadata | null;
}

/** CLIProxy variant info */
export interface CliproxyVariantInfo {
  name: string;
  provider: string;
  settings: string;
  target: TargetType;
}

/** Result from list operation */
export interface ApiListResult {
  profiles: ApiProfileInfo[];
  variants: CliproxyVariantInfo[];
}

/** Result from create operation */
export interface CreateApiProfileResult {
  success: boolean;
  settingsFile: string;
  error?: string;
}

export interface CliproxyBridgeProviderInfo {
  provider: CLIProxyProvider;
  displayName: string;
  description: string;
  defaultProfileName: string;
  routePath: string;
}

export interface CliproxyBridgeMetadata {
  provider: CLIProxyProvider;
  providerDisplayName: string;
  routePath: string;
  currentBaseUrl: string;
  source: 'local' | 'remote';
  usesCurrentTarget: boolean;
  usesCurrentAuthToken: boolean;
}

export interface ImageAnalysisProfileStatus {
  enabled: boolean;
  supported: boolean;
  status: 'active' | 'mapped' | 'attention' | 'disabled' | 'skipped' | 'hook-missing';
  backendId: string | null;
  backendDisplayName: string | null;
  model: string | null;
  resolutionSource:
    | 'cliproxy-provider'
    | 'cliproxy-variant'
    | 'cliproxy-composite'
    | 'copilot-alias'
    | 'cliproxy-bridge'
    | 'profile-backend'
    | 'fallback-backend'
    | 'disabled'
    | 'unsupported-profile'
    | 'unresolved'
    | 'missing-model';
  reason: string | null;
  shouldPersistHook: boolean;
  persistencePath: string | null;
  runtimePath: string | null;
  usesCurrentTarget: boolean | null;
  usesCurrentAuthToken: boolean | null;
  hookInstalled: boolean | null;
  sharedHookInstalled: boolean | null;
}

export interface ResolvedCliproxyBridgeProfile {
  name: string;
  provider: CLIProxyProvider;
  providerDisplayName: string;
  baseUrl: string;
  apiKey: string;
  models: ModelMapping;
  target: TargetType;
  routePath: string;
  source: 'local' | 'remote';
}

export interface CreateCliproxyBridgeProfileResult extends CreateApiProfileResult {
  name?: string;
  provider?: CLIProxyProvider;
  target?: TargetType;
  cliproxyBridge?: CliproxyBridgeMetadata | null;
}

/** Result from remove operation */
export interface RemoveApiProfileResult {
  success: boolean;
  error?: string;
}

/** Result from updating API profile target */
export interface UpdateApiProfileTargetResult {
  success: boolean;
  target?: TargetType;
  error?: string;
}

/** Validation severity for profile lifecycle checks */
export type ProfileValidationLevel = 'error' | 'warning';

/** Field-level validation issue emitted by lifecycle operations */
export interface ProfileValidationIssue {
  level: ProfileValidationLevel;
  code: string;
  message: string;
  field?: string;
  hint?: string;
}

/** Validation summary for settings payload */
export interface ProfileValidationSummary {
  valid: boolean;
  issues: ProfileValidationIssue[];
}

/** Orphan settings file candidate discovered on disk */
export interface ApiProfileOrphanCandidate {
  name: string;
  settingsPath: string;
  validation: ProfileValidationSummary;
}

/** Discovery result for orphan settings files */
export interface DiscoverApiProfileOrphansResult {
  orphans: ApiProfileOrphanCandidate[];
}

/** Registration result for orphan settings files */
export interface RegisterApiProfileOrphansResult {
  registered: string[];
  skipped: Array<{ name: string; reason: string }>;
}

/** Copy result for API profile duplication */
export interface CopyApiProfileResult {
  success: boolean;
  name?: string;
  settingsPath?: string;
  warnings?: string[];
  error?: string;
}

/** Portable export bundle schema */
export interface ApiProfileExportBundle {
  schemaVersion: 1;
  exportedAt: string;
  profile: {
    name: string;
    target: TargetType;
  };
  settings: Record<string, unknown>;
}

/** Export operation result */
export interface ExportApiProfileResult {
  success: boolean;
  bundle?: ApiProfileExportBundle;
  redacted?: boolean;
  error?: string;
}

/** Import operation result */
export interface ImportApiProfileResult {
  success: boolean;
  name?: string;
  warnings?: string[];
  validation?: ProfileValidationSummary;
  error?: string;
}
