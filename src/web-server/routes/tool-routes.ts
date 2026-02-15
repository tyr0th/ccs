import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { getDashboardAuthConfig } from '../../config/unified-config-loader';
import {
  getToolAdapter,
  listToolAdapters,
  listToolRouteBindings,
  type ToolRouteAuthMode,
} from '../../tools';

export function createToolRouteAuthMiddleware(authMode: ToolRouteAuthMode) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (authMode === 'optional') {
      next();
      return;
    }

    const authConfig = getDashboardAuthConfig();
    if (!authConfig.enabled || req.session?.authenticated) {
      next();
      return;
    }

    res.status(401).json({ error: 'Authentication required' });
  };
}

export function normalizeToolRouteMountPath(toolId: string, routePath: `/${string}`): string {
  if (routePath === '/') {
    return `/${toolId}`;
  }
  return `/${toolId}${routePath}`;
}

const router = Router();
const toolBindings = listToolRouteBindings();
const toolsWithRoutes = new Set<string>();

for (const binding of toolBindings) {
  const mountPath = normalizeToolRouteMountPath(binding.toolId, binding.path);
  router.use(mountPath, createToolRouteAuthMiddleware(binding.auth), binding.router);
  toolsWithRoutes.add(binding.toolId);
}

router.get('/', (_req: Request, res: Response): void => {
  const tools = listToolAdapters().map((adapter) => ({
    id: adapter.id,
    summary: adapter.summary,
    subcommands: adapter.subcommands,
    hasApiRoutes: (adapter.routes?.length ?? 0) > 0,
  }));
  res.json({ tools });
});

router.use('/:toolId', (req: Request, res: Response): void => {
  const toolId = req.params.toolId?.toLowerCase() ?? '';
  const adapter = getToolAdapter(toolId);

  if (!adapter) {
    res.status(404).json({ error: `Unknown tool: ${req.params.toolId}` });
    return;
  }

  if (!toolsWithRoutes.has(toolId)) {
    res.status(404).json({ error: `Tool '${toolId}' does not expose API routes` });
    return;
  }

  res.status(404).json({ error: `Unknown route for tool '${toolId}'` });
});

export default router;
