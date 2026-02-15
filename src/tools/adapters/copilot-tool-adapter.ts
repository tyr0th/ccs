import copilotRoutes from '../../web-server/routes/copilot-routes';
import type { ToolAdapter } from '../types';
import { COPILOT_SUBCOMMANDS, runCopilotToolSubcommand } from './copilot-tool-runtime';

export const copilotToolAdapter: ToolAdapter = {
  id: 'copilot',
  summary: 'GitHub Copilot integration commands',
  subcommands: COPILOT_SUBCOMMANDS,
  routes: [
    {
      path: '/',
      auth: 'required',
      router: copilotRoutes,
    },
  ],
  run: runCopilotToolSubcommand,
};
