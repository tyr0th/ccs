/**
 * Hooks Utilities Index
 *
 * Centralized exports for all hook-related utilities.
 *
 * @module utils/hooks
 */

export { getImageAnalysisHookEnv } from './get-image-analysis-hook-env';
export {
  canonicalizeImageAnalysisConfig,
  resolveImageAnalysisStatus,
  normalizeImageAnalysisBackendId,
  type ImageAnalysisResolutionContext,
  type ImageAnalysisStatus,
} from './image-analysis-backend-resolver';
export {
  hydrateImageAnalysisRuntimeStatus,
  resolveImageAnalysisRuntimeStatus,
} from './image-analysis-runtime-status';
export {
  getImageAnalyzerHookPath,
  getImageAnalyzerHookConfig,
  hasImageAnalyzerHook,
  installImageAnalyzerHook,
  uninstallImageAnalyzerHook,
} from './image-analyzer-hook-installer';
export { ensureProfileHooks as ensureImageAnalyzerProfileHooks } from './image-analyzer-profile-hook-injector';
