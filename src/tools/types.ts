import type { Router } from 'express';

export type ToolRouteAuthMode = 'required' | 'optional';

export interface ToolRouteBinding {
  /** Path mounted under `/api/tools/<id>` */
  path: `/${string}`;
  /** Dashboard auth requirement for this route binding */
  auth: ToolRouteAuthMode;
  /** Express router handling the sub-routes */
  router: Router;
}

export interface ToolAdapter {
  id: string;
  summary: string;
  subcommands: readonly string[];
  routes?: readonly ToolRouteBinding[];
  run(args: string[]): number | Promise<number>;
}
