/**
 * Cursor CLI Command
 *
 * Handles `ccs cursor <subcommand>` commands.
 */

import { maybeShowLegacyToolAliasWarning } from '../tools/legacy-alias-warning';
import { CURSOR_SUBCOMMANDS, runCursorToolSubcommand } from '../tools/adapters/cursor-tool-runtime';

export { CURSOR_SUBCOMMANDS };

/**
 * Handle cursor subcommand.
 */
export async function handleCursorCommand(args: string[]): Promise<number> {
  maybeShowLegacyToolAliasWarning('cursor');
  const { dispatchToolAdapter } = await import('../tools');
  return dispatchToolAdapter('cursor', args);
}

/**
 * Legacy cursor command implementation used by the tool adapter.
 */
export async function handleCursorCommandLegacy(args: string[]): Promise<number> {
  return runCursorToolSubcommand(args);
}
