import { getAuthStatus, initializeAccounts, type AuthStatus } from '../../cliproxy/auth-handler';
import { fetchRemoteAuthStatus, type RemoteAuthStatus } from '../../cliproxy/remote-auth-fetcher';
import { getProxyTarget, type ProxyTarget } from '../../cliproxy/proxy-target-resolver';
import { getProviderDisplayName, isCLIProxyProvider } from '../../cliproxy/provider-capabilities';
import { isCliproxyRunning } from '../../cliproxy/stats-fetcher';
import type { CLIProxyProvider } from '../../cliproxy/types';
import {
  DEFAULT_IMAGE_ANALYSIS_CONFIG,
  type ImageAnalysisConfig,
} from '../../config/unified-config-types';
import {
  resolveImageAnalysisStatus,
  type ImageAnalysisResolutionContext,
  type ImageAnalysisStatus,
} from './image-analysis-backend-resolver';

interface ImageAnalysisRuntimeStatusDeps {
  fetchRemoteAuthStatus: (target: ProxyTarget) => Promise<RemoteAuthStatus[]>;
  getAuthStatus: (provider: CLIProxyProvider) => AuthStatus;
  getProxyTarget: () => ProxyTarget;
  initializeAccounts: () => void;
  isCliproxyRunning: () => Promise<boolean>;
}

const defaultDeps: ImageAnalysisRuntimeStatusDeps = {
  fetchRemoteAuthStatus,
  getAuthStatus,
  getProxyTarget,
  initializeAccounts,
  isCliproxyRunning: () => isCliproxyRunning(),
};

async function resolveAuthReadiness(
  status: ImageAnalysisStatus,
  deps: ImageAnalysisRuntimeStatusDeps
): Promise<
  Pick<ImageAnalysisStatus, 'authReadiness' | 'authProvider' | 'authDisplayName' | 'authReason'>
> {
  if (!status.backendId || !status.model || !isCLIProxyProvider(status.backendId)) {
    return {
      authReadiness: 'not-needed',
      authProvider: null,
      authDisplayName: null,
      authReason: null,
    };
  }

  const authProvider = status.backendId;
  const authDisplayName = getProviderDisplayName(authProvider);

  try {
    let authenticated = false;
    const target = deps.getProxyTarget();
    if (target.isRemote) {
      const remoteStatuses = await deps.fetchRemoteAuthStatus(target);
      authenticated = remoteStatuses.some(
        (entry) => entry.provider === authProvider && entry.authenticated
      );
    } else {
      deps.initializeAccounts();
      authenticated = deps.getAuthStatus(authProvider).authenticated;
    }

    return {
      authReadiness: authenticated ? 'ready' : 'missing',
      authProvider,
      authDisplayName,
      authReason: authenticated
        ? null
        : `${authDisplayName} auth is missing. Run "ccs ${authProvider} --auth" to enable image analysis.`,
    };
  } catch (error) {
    return {
      authReadiness: 'unknown',
      authProvider,
      authDisplayName,
      authReason: `CCS could not verify ${authDisplayName} auth readiness: ${(error as Error).message}`,
    };
  }
}

async function resolveProxyReadiness(
  status: ImageAnalysisStatus,
  deps: ImageAnalysisRuntimeStatusDeps
): Promise<Pick<ImageAnalysisStatus, 'proxyReadiness' | 'proxyReason'>> {
  if (!status.backendId || !status.model) {
    return {
      proxyReadiness: 'not-needed',
      proxyReason: null,
    };
  }

  const target = deps.getProxyTarget();
  const reachable = await deps.isCliproxyRunning();
  if (target.isRemote) {
    return {
      proxyReadiness: reachable ? 'remote' : 'unavailable',
      proxyReason: reachable
        ? `Remote CLIProxy target ${target.host}:${target.port} is reachable.`
        : `Remote CLIProxy target ${target.host}:${target.port} is unreachable.`,
    };
  }

  return {
    proxyReadiness: reachable ? 'ready' : 'stopped',
    proxyReason: reachable
      ? 'Local CLIProxy service is reachable.'
      : 'Local CLIProxy service is idle. CCS will start it automatically when image analysis is needed.',
  };
}

function resolveEffectiveRuntime(
  status: ImageAnalysisStatus
): Pick<ImageAnalysisStatus, 'effectiveRuntimeMode' | 'effectiveRuntimeReason'> {
  if (!status.enabled || !status.backendId || !status.model) {
    return {
      effectiveRuntimeMode: 'native-read',
      effectiveRuntimeReason: status.reason,
    };
  }

  if (status.status === 'hook-missing') {
    return {
      effectiveRuntimeMode: 'native-read',
      effectiveRuntimeReason: status.reason,
    };
  }

  if (status.authReadiness === 'missing' || status.authReadiness === 'unknown') {
    return {
      effectiveRuntimeMode: 'native-read',
      effectiveRuntimeReason: status.authReason,
    };
  }

  if (status.proxyReadiness === 'unavailable' || status.proxyReadiness === 'unknown') {
    return {
      effectiveRuntimeMode: 'native-read',
      effectiveRuntimeReason: status.proxyReason,
    };
  }

  return {
    effectiveRuntimeMode: 'cliproxy-image-analysis',
    effectiveRuntimeReason: status.status === 'attention' ? status.reason : null,
  };
}

export async function hydrateImageAnalysisRuntimeStatus(
  baseStatus: ImageAnalysisStatus,
  deps: Partial<ImageAnalysisRuntimeStatusDeps> = {}
): Promise<ImageAnalysisStatus> {
  const resolvedDeps = { ...defaultDeps, ...deps };
  const authStatus = await resolveAuthReadiness(baseStatus, resolvedDeps);
  const proxyStatus = await resolveProxyReadiness(baseStatus, resolvedDeps);
  const mergedStatus = {
    ...baseStatus,
    ...authStatus,
    ...proxyStatus,
  };

  return {
    ...mergedStatus,
    ...resolveEffectiveRuntime(mergedStatus),
  };
}

export async function resolveImageAnalysisRuntimeStatus(
  context: ImageAnalysisResolutionContext,
  config: ImageAnalysisConfig = DEFAULT_IMAGE_ANALYSIS_CONFIG,
  deps: Partial<ImageAnalysisRuntimeStatusDeps> = {}
): Promise<ImageAnalysisStatus> {
  const baseStatus = resolveImageAnalysisStatus(context, config);
  return hydrateImageAnalysisRuntimeStatus(baseStatus, deps);
}
