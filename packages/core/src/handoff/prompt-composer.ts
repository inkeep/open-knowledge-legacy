import type { DocContext } from './types.ts';

/**
 * Minimal OK-composed prompt for a handoff. The "open-knowledge MCP tool"
 * phrase is a graceful no-op when MCP isn't registered — the agent falls
 * back to the native `file=`/`path=`/`workspace=` attachment.
 */
export function composePrompt(ctx: DocContext): string {
  return `Open Knowledge doc: ${ctx.relativePath}. Use the open-knowledge MCP tool for backlinks and related context.`;
}
