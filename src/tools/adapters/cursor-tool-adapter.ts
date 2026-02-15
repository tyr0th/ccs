import cursorRoutes from '../../web-server/routes/cursor-routes';
import type { ToolAdapter } from '../types';
import { CURSOR_SUBCOMMANDS, runCursorToolSubcommand } from './cursor-tool-runtime';

export const cursorToolAdapter: ToolAdapter = {
  id: 'cursor',
  summary: 'Cursor IDE integration commands',
  subcommands: CURSOR_SUBCOMMANDS,
  routes: [
    {
      path: '/',
      auth: 'required',
      router: cursorRoutes,
    },
  ],
  run: runCursorToolSubcommand,
};
