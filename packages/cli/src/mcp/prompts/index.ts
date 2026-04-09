/**
 * MCP prompt registry.
 *
 * Aggregates the three workflow prompts (init-wiki, ingest, research) into a
 * single `registerAllPrompts` function that `server.ts` calls during startup.
 * Each individual prompt file owns its own name, description, argument schema,
 * and handler body — this module just wires them into the McpServer instance.
 *
 * To add a new prompt: create `packages/cli/src/mcp/prompts/<name>.ts` with a
 * `register(prompt)` export, then import and call it from here.
 */
import { register as registerIngest } from './ingest.ts';
import { register as registerInitWiki } from './init-wiki.ts';
import { register as registerResearch } from './research.ts';
import type { PromptRegister } from './shared.ts';

export type { PromptRegister } from './shared.ts';
export { userMessage } from './shared.ts';

export function registerAllPrompts(prompt: PromptRegister): void {
  registerInitWiki(prompt);
  registerIngest(prompt);
  registerResearch(prompt);
}
