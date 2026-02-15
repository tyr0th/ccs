/**
 * Copilot CLI Command
 *
 * Handles `ccs copilot <subcommand>` commands.
 */

import { maybeShowLegacyToolAliasWarning } from '../tools/legacy-alias-warning';
import {
  COPILOT_SUBCOMMANDS,
  isCopilotSubcommand,
  runCopilotToolSubcommand,
} from '../tools/adapters/copilot-tool-runtime';

export { COPILOT_SUBCOMMANDS, isCopilotSubcommand };

/**
 * Handle copilot subcommand.
 */
export async function handleCopilotCommand(args: string[]): Promise<number> {
  maybeShowLegacyToolAliasWarning('copilot');
  const { dispatchToolAdapter } = await import('../tools');
  return dispatchToolAdapter('copilot', args);
}

/**
 * Legacy copilot command implementation used by the tool adapter.
 */
export async function handleCopilotCommandLegacy(args: string[]): Promise<number> {
  return runCopilotToolSubcommand(args);
}
