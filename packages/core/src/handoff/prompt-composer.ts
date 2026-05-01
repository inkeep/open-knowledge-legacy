import type { DocContext } from './types.ts';

export function composePrompt(ctx: DocContext): string {
  return `Open Knowledge doc: ${ctx.relativePath}. Use the open-knowledge MCP tool for backlinks and related context.`;
}
