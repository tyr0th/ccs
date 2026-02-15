/**
 * CLIProxyAPI Stats Fetcher
 *
 * Fetches usage statistics from CLIProxyAPI's management API.
 * Requires usage-statistics-enabled: true in config.yaml.
 */

import { getEffectiveApiKey, getEffectiveManagementSecret } from './auth-token-manager';
import { getAllAccountsSummary } from './account-manager';
import { createSourceResolver, type SourceMatchStep } from './source-resolver';
import { AttributionHistoryStore } from './attribution-history';
import {
  getProxyTarget,
  buildProxyUrl,
  buildProxyHeaders,
  buildManagementHeaders,
} from './proxy-target-resolver';
import { getAttributionConfig } from '../config/unified-config-loader';
import type { AttributionResolverVersion } from '../config/unified-config-types';
import type { CLIProxyProvider } from './types';

/** Per-account usage statistics */
export interface AccountUsageStats {
  /** Account email or identifier */
  source: string;
  /** Canonical provider that source resolves to */
  provider?: CLIProxyProvider;
  /** Account ID used for mapping */
  accountId?: string;
  /** Resolver match stage used for attribution */
  matchStep?: SourceMatchStep;
  /** Resolver version used to map this source */
  resolverVersion?: AttributionResolverVersion;
  /** Number of successful requests */
  successCount: number;
  /** Number of failed requests */
  failureCount: number;
  /** Total tokens used */
  totalTokens: number;
  /** Last request timestamp */
  lastUsedAt?: string;
}

export interface UnmappedUsageStats {
  totalRequests: number;
  successCount: number;
  failureCount: number;
  totalTokens: number;
  sources: Record<string, number>;
}

/** Usage statistics from CLIProxyAPI */
export interface CliproxyStats {
  /** Total number of requests processed */
  totalRequests: number;
  /** Total successful requests */
  successCount: number;
  /** Total failed requests */
  failureCount: number;
  /** Token counts */
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  /** Requests grouped by model */
  requestsByModel: Record<string, number>;
  /** Requests grouped by provider */
  requestsByProvider: Record<string, number>;
  /** Per-account usage breakdown */
  accountStats: Record<string, AccountUsageStats>;
  /** Unmapped usage bucket for unresolved sources */
  unmapped: UnmappedUsageStats;
  /** Resolver version used for this aggregation */
  resolverVersion: AttributionResolverVersion;
  /** Number of quota exceeded (429) events */
  quotaExceededCount: number;
  /** Number of request retries */
  retryCount: number;
  /** Timestamp of stats collection */
  collectedAt: string;
}

/** Request detail from CLIProxyAPI */
interface RequestDetail {
  timestamp: string;
  source: string;
  auth_index: number;
  tokens: {
    input_tokens: number;
    output_tokens: number;
    reasoning_tokens: number;
    cached_tokens: number;
    total_tokens: number;
  };
  failed: boolean;
}

/** Usage API response from CLIProxyAPI /v0/management/usage endpoint */
interface UsageApiResponse {
  failed_requests?: number;
  usage?: {
    total_requests?: number;
    success_count?: number;
    failure_count?: number;
    total_tokens?: number;
    apis?: Record<
      string,
      {
        total_requests?: number;
        total_tokens?: number;
        models?: Record<
          string,
          {
            total_requests?: number;
            total_tokens?: number;
            details?: RequestDetail[];
          }
        >;
      }
    >;
  };
}

/**
 * Fetch usage statistics from CLIProxyAPI management API
 * @param port CLIProxyAPI port (default: 8317)
 * @returns Stats object or null if unavailable
 */
export async function fetchCliproxyStats(port?: number): Promise<CliproxyStats | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout

    // Dynamic target resolution
    const target = getProxyTarget();
    // Allow port override for local testing only
    if (port !== undefined && !target.isRemote) {
      target.port = port;
    }
    const url = buildProxyUrl(target, '/v0/management/usage');

    // For management endpoints, use management key for remote, local management secret for local
    const headers = target.isRemote
      ? buildManagementHeaders(target)
      : { Accept: 'application/json', Authorization: `Bearer ${getEffectiveManagementSecret()}` };

    const response = await fetch(url, {
      signal: controller.signal,
      headers,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as UsageApiResponse;
    const usage = data.usage;

    const attributionConfig = getAttributionConfig();
    const resolverVersion = attributionConfig.resolverVersion;
    const accountsByProvider = getAllAccountsSummary();
    const sourceResolver = createSourceResolver(accountsByProvider, resolverVersion);
    const attributionHistory = await AttributionHistoryStore.load();

    // Extract models, providers, and per-account stats from the nested API structure
    const requestsByModel: Record<string, number> = {};
    const requestsByProvider: Record<string, number> = {};
    const accountStats: Record<string, AccountUsageStats> = {};
    const unmapped: UnmappedUsageStats = {
      totalRequests: 0,
      successCount: 0,
      failureCount: 0,
      totalTokens: 0,
      sources: {},
    };
    let totalSuccessCount = 0;
    let totalFailureCount = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    if (usage?.apis) {
      for (const [provider, providerData] of Object.entries(usage.apis)) {
        requestsByProvider[provider] = providerData.total_requests ?? 0;
        if (providerData.models) {
          for (const [model, modelData] of Object.entries(providerData.models)) {
            requestsByModel[model] = modelData.total_requests ?? 0;

            // Aggregate per-account stats from request details
            if (modelData.details) {
              for (const detail of modelData.details) {
                const source = typeof detail.source === 'string' ? detail.source : '';
                const historicalResolution = attributionHistory.resolve(source, provider);
                const resolved = historicalResolution ?? sourceResolver.resolve(source, provider);
                if (!historicalResolution) {
                  attributionHistory.remember(source, provider, resolved);
                }
                const tokenCount = detail.tokens?.total_tokens ?? 0;

                if (detail.failed) {
                  totalFailureCount++;
                } else {
                  totalSuccessCount++;
                }

                if (resolved.matched && resolved.accountKey) {
                  const accountKey = resolved.accountKey;
                  if (!accountStats[accountKey]) {
                    accountStats[accountKey] = {
                      source: resolved.accountId ?? accountKey,
                      provider: resolved.provider ?? undefined,
                      accountId: resolved.accountId ?? undefined,
                      matchStep: resolved.matchStep,
                      resolverVersion: resolved.resolverVersion,
                      successCount: 0,
                      failureCount: 0,
                      totalTokens: 0,
                    };
                  }

                  if (detail.failed) {
                    accountStats[accountKey].failureCount++;
                  } else {
                    accountStats[accountKey].successCount++;
                  }
                  accountStats[accountKey].totalTokens += tokenCount;
                  accountStats[accountKey].lastUsedAt = detail.timestamp;
                } else {
                  const normalizedSource = resolved.normalizedSource || 'unknown';
                  unmapped.totalRequests++;
                  if (detail.failed) {
                    unmapped.failureCount++;
                  } else {
                    unmapped.successCount++;
                  }
                  unmapped.totalTokens += tokenCount;
                  unmapped.sources[normalizedSource] =
                    (unmapped.sources[normalizedSource] ?? 0) + 1;
                }

                // Aggregate token breakdowns
                totalInputTokens += detail.tokens?.input_tokens ?? 0;
                totalOutputTokens += detail.tokens?.output_tokens ?? 0;
              }
            }
          }
        }
      }
    }
    await attributionHistory.persist();

    // Normalize the response to our interface
    return {
      totalRequests: usage?.total_requests ?? 0,
      successCount: totalSuccessCount,
      failureCount: totalFailureCount,
      tokens: {
        input: totalInputTokens,
        output: totalOutputTokens,
        total: usage?.total_tokens ?? 0,
      },
      requestsByModel,
      requestsByProvider,
      accountStats,
      unmapped,
      resolverVersion,
      quotaExceededCount: usage?.failure_count ?? data.failed_requests ?? 0,
      retryCount: 0, // API doesn't track retries separately
      collectedAt: new Date().toISOString(),
    };
  } catch {
    // CLIProxyAPI not running or stats endpoint not available
    return null;
  }
}

/** OpenAI-compatible model object from /v1/models endpoint */
export interface CliproxyModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

/** Response from /v1/models endpoint */
interface ModelsApiResponse {
  data: CliproxyModel[];
  object: string;
}

/** Categorized models response for UI */
export interface CliproxyModelsResponse {
  models: CliproxyModel[];
  byCategory: Record<string, CliproxyModel[]>;
  totalCount: number;
}

/**
 * Fetch available models from CLIProxyAPI /v1/models endpoint
 * @param port CLIProxyAPI port (default: 8317)
 * @returns Categorized models or null if unavailable
 */
export async function fetchCliproxyModels(port?: number): Promise<CliproxyModelsResponse | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    // Dynamic target resolution
    const target = getProxyTarget();
    // Allow port override for local testing only
    if (port !== undefined && !target.isRemote) {
      target.port = port;
    }
    const url = buildProxyUrl(target, '/v1/models');

    // For /v1 endpoints: use remote auth token for remote, effective API key for local
    const headers = target.isRemote
      ? buildProxyHeaders(target)
      : { Accept: 'application/json', Authorization: `Bearer ${getEffectiveApiKey()}` };

    const response = await fetch(url, {
      signal: controller.signal,
      headers,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as ModelsApiResponse;

    // Group models by owned_by field
    const byCategory: Record<string, CliproxyModel[]> = {};
    for (const model of data.data) {
      const category = model.owned_by || 'other';
      if (!byCategory[category]) {
        byCategory[category] = [];
      }
      byCategory[category].push(model);
    }

    // Sort models within each category alphabetically
    for (const category of Object.keys(byCategory)) {
      byCategory[category].sort((a, b) => a.id.localeCompare(b.id));
    }

    return {
      models: data.data,
      byCategory,
      totalCount: data.data.length,
    };
  } catch {
    return null;
  }
}

/** Error log file metadata from CLIProxyAPI */
export interface CliproxyErrorLog {
  /** Filename (e.g., "error-v1-chat-completions-2025-01-15T10-30-00.log") */
  name: string;
  /** File size in bytes */
  size: number;
  /** Last modified timestamp (Unix seconds) */
  modified: number;
  /** Absolute path to the log file (injected by backend) */
  absolutePath?: string;
  /** HTTP status code extracted from log (injected by backend) */
  statusCode?: number;
  /** Model name extracted from request body (injected by backend) */
  model?: string;
}

/** Response from /v0/management/request-error-logs endpoint */
interface ErrorLogsApiResponse {
  files: CliproxyErrorLog[];
}

/**
 * Fetch error log file list from CLIProxyAPI management API
 * @param port CLIProxyAPI port (default: 8317)
 * @returns Array of error log metadata or null if unavailable
 */
export async function fetchCliproxyErrorLogs(port?: number): Promise<CliproxyErrorLog[] | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    // Dynamic target resolution
    const target = getProxyTarget();
    // Allow port override for local testing only
    if (port !== undefined && !target.isRemote) {
      target.port = port;
    }
    const url = buildProxyUrl(target, '/v0/management/request-error-logs');

    // For management endpoints, use management key for remote, local management secret for local
    const headers = target.isRemote
      ? buildManagementHeaders(target)
      : { Accept: 'application/json', Authorization: `Bearer ${getEffectiveManagementSecret()}` };

    const response = await fetch(url, {
      signal: controller.signal,
      headers,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as ErrorLogsApiResponse;
    return data.files ?? [];
  } catch {
    return null;
  }
}

/**
 * Fetch error log file content from CLIProxyAPI management API
 * @param name Error log filename
 * @param port CLIProxyAPI port (default: 8317)
 * @returns Log file content as string or null if unavailable
 */
export async function fetchCliproxyErrorLogContent(
  name: string,
  port?: number
): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    // Dynamic target resolution
    const target = getProxyTarget();
    // Allow port override for local testing only
    if (port !== undefined && !target.isRemote) {
      target.port = port;
    }
    const url = buildProxyUrl(
      target,
      `/v0/management/request-error-logs/${encodeURIComponent(name)}`
    );

    // For management endpoints, use management key for remote, local management secret for local
    const headers = target.isRemote
      ? buildManagementHeaders(target)
      : { Authorization: `Bearer ${getEffectiveManagementSecret()}` };

    const response = await fetch(url, {
      signal: controller.signal,
      headers,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    return await response.text();
  } catch {
    return null;
  }
}

/**
 * Check if CLIProxyAPI is running and responsive
 * @param port CLIProxyAPI port (default: 8317)
 * @returns true if proxy is running
 */
export async function isCliproxyRunning(port?: number): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000); // 1s timeout

    // Dynamic target resolution
    const target = getProxyTarget();
    // Allow port override for local testing only
    if (port !== undefined && !target.isRemote) {
      target.port = port;
    }
    const url = buildProxyUrl(target, '/');

    // Health check - no auth needed for root endpoint
    const response = await fetch(url, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}
