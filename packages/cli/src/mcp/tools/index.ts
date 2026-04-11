/**
 * MCP workflow tool registry.
 *
 * Aggregates the three workflow tools (init-wiki, ingest, research) into a
 * single `registerAllTools` function that `server.ts` calls during startup.
 * Each individual tool file owns its own name, description, argument schema,
 * and handler body — this module just wires them into the McpServer instance.
 *
 * To add a new tool: create `packages/cli/src/mcp/tools/<name>.ts` with a
 * `register(server)` export, then import and call it from here.
 */
import { DESCRIPTION as INGEST_DESCRIPTION, register as registerIngest } from './ingest.ts';
import { DESCRIPTION as INIT_WIKI_DESCRIPTION, register as registerInitWiki } from './init-wiki.ts';
import { DESCRIPTION as RESEARCH_DESCRIPTION, register as registerResearch } from './research.ts';
import type { ServerInstance } from './shared.ts';

export type { ServerInstance } from './shared.ts';
export { textResult } from './shared.ts';

/** Tool descriptions keyed by name — used by INSTRUCTIONS in server.ts to avoid duplication. */
export const TOOL_DESCRIPTIONS = {
  'init-wiki': INIT_WIKI_DESCRIPTION,
  ingest: INGEST_DESCRIPTION,
  research: RESEARCH_DESCRIPTION,
} as const;

export function registerAllTools(server: ServerInstance): void {
  registerInitWiki(server);
  registerIngest(server);
  registerResearch(server);
}
