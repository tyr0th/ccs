import { CLIPROXY_DEFAULT_PORT, validatePort } from '../../cliproxy/config/port-manager';
import { loadOrCreateUnifiedConfig } from '../../config/unified-config-loader';
import type { UnifiedConfig } from '../../config/unified-config-types';

type LifecyclePortConfig = Pick<UnifiedConfig, 'cliproxy_server'>;

/**
 * Resolve the local CLIProxy lifecycle port from unified config.
 * Falls back to default port when unset/invalid.
 */
export function resolveLifecyclePort(
  config: LifecyclePortConfig = loadOrCreateUnifiedConfig()
): number {
  return validatePort(config.cliproxy_server?.local?.port ?? CLIPROXY_DEFAULT_PORT);
}
