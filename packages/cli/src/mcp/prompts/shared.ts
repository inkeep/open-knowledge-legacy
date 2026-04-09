/**
 * Shared helpers for MCP prompt registration.
 *
 * Each prompt file in this directory exports a `register(prompt)` function
 * that calls the bound `server.prompt(...)` with its name, description,
 * argument schema, and handler. `index.ts` aggregates all three into a single
 * `registerAllPrompts` function that `server.ts` calls during startup.
 *
 * This keeps `server.ts` focused on lifecycle (connect, watcher) and lets
 * each prompt's full workflow content live in its own file.
 */

// biome-ignore lint/suspicious/noExplicitAny: MCP SDK TS2589 workaround — deeply recursive generics
export type PromptRegister = (
  name: string,
  description: string,
  // biome-ignore lint/suspicious/noExplicitAny: prompt arg schemas are client-facing, no tight type
  argsSchema: Record<string, any>,
  // biome-ignore lint/suspicious/noExplicitAny: handler return type is MCP-SDK-internal
  handler: (...args: any[]) => any,
) => void;

/**
 * Wrap a single string into the message-sequence shape MCP prompts require.
 * All three current prompts emit exactly one user message; the handler closes
 * over whatever template logic it needs and returns this structure.
 */
export function userMessage(text: string) {
  return {
    messages: [
      {
        role: 'user' as const,
        content: { type: 'text' as const, text },
      },
    ],
  };
}
