import type { DocContext } from './types.ts';

/**
 * Emit the minimal OK-composed prompt for a handoff. Deterministic string
 * interpolation — same input yields identical output (AC10 trivially
 * satisfied). The phrase "open-knowledge MCP tool" works whether or not
 * MCP is registered on the target agent: if present, the agent picks up
 * backlinks and related docs; if not, it falls back to the native
 * `file=`/`path=`/`workspace=` attachment and reads the doc directly.
 *
 * Governing spec: `specs/2026-04-21-open-in-agent-desktop/SPEC.md` §6.3.
 */
export function composePrompt(ctx: DocContext): string {
  return `Open Knowledge doc: ${ctx.relativePath}. Use the open-knowledge MCP tool for backlinks and related context.`;
}
