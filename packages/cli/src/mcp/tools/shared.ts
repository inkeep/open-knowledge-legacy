/**
 * Shared helpers for MCP workflow tool registration.
 *
 * Each workflow file in this directory exports a `register(server)` function
 * that calls `server.tool(...)` with its name, description, optional arg
 * schema, and handler. `index.ts` aggregates all three into a single
 * `registerAllTools` function that `server.ts` calls during startup.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export type ServerInstance = McpServer;

/**
 * Wrap a single string into the content shape MCP tools require for text results.
 */
export function textResult(text: string) {
  return {
    content: [{ type: 'text' as const, text }],
  };
}
