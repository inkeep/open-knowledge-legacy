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
 * Pass `isError: true` to signal a tool-level error to the caller.
 */
export function textResult(text: string, isError?: boolean) {
  return {
    content: [{ type: 'text' as const, text }],
    ...(isError ? { isError: true as const } : {}),
  };
}

/**
 * Dual-channel result (text `content` + machine-readable `structuredContent`)
 * per D10/FR6. Used by `exec` to return enriched metadata in structured form
 * alongside the raw-stdout + markdown-block content.
 */
export function textPlusStructured<T>(text: string, structured: T, isError?: boolean) {
  return {
    content: [{ type: 'text' as const, text }],
    structuredContent: structured as unknown as Record<string, unknown>,
    ...(isError ? { isError: true as const } : {}),
  };
}

/** Error message for tools that require Hocuspocus to be running. */
export const HOCUSPOCUS_NOT_RUNNING_ERROR =
  'Error: Hocuspocus server is not running. Start it with `open-knowledge start`, then retry.\nFor disk-only writes without real-time sync, use your native Edit tool directly.';

/**
 * Normalize a user-supplied `docName`. The server keys documents by the
 * extension-less docName, so a caller that passes `"notes/meeting.md"` would
 * otherwise produce `meeting.md.md`. The server auto-detects the extension
 * (`.md` vs `.mdx`) from what it finds on disk.
 *
 * Policy:
 * - Trailing `.md` / `.mdx` is stripped silently (case-insensitive).
 * - Trailing `.markdown` returns an error — unsupported extension.
 * - Any other trailing `.x` is left alone; a dotted docName is valid
 *   (e.g. `releases/v1.0`).
 *
 * Note: when creating a new document, the server defaults to `.md` regardless
 * of the suffix passed by the caller. To create a `.mdx` file, create it on
 * disk first — the watcher will register the extension and subsequent writes
 * will route to `.mdx` automatically.
 */
export function normalizeDocName(
  raw: string,
): { ok: true; docName: string } | { ok: false; error: string } {
  const lower = raw.toLowerCase();
  if (lower.endsWith('.md')) {
    return { ok: true, docName: raw.slice(0, -3) };
  }
  if (lower.endsWith('.mdx')) {
    return { ok: true, docName: raw.slice(0, -4) };
  }
  if (lower.endsWith('.markdown')) {
    return {
      ok: false,
      error: `Error: docName "${raw}" ends in ".markdown", which is not a supported extension. Use ".md" or ".mdx", or strip the extension to let the server auto-detect.`,
    };
  }
  return { ok: true, docName: raw };
}

/**
 * HTTP GET helper for Hocuspocus API calls.
 * Returns `{ ok: false, error }` on network failure or non-JSON response.
 */
export async function httpGet(
  baseUrl: string,
  path: string,
): Promise<{ ok: boolean; [key: string]: unknown }> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(30_000) });
  } catch (err) {
    return { ok: false, error: `Server unreachable: ${err instanceof Error ? err.message : err}` };
  }
  try {
    return (await res.json()) as { ok: boolean; [key: string]: unknown };
  } catch {
    return { ok: false, error: `Server returned HTTP ${res.status} with non-JSON body` };
  }
}

/**
 * HTTP POST helper for Hocuspocus API calls.
 * Returns `{ ok: false, error }` on network failure or non-JSON response.
 */
export async function httpPost(
  baseUrl: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<{ ok: boolean; [key: string]: unknown }> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    return { ok: false, error: `Server unreachable: ${err instanceof Error ? err.message : err}` };
  }
  try {
    return (await res.json()) as { ok: boolean; [key: string]: unknown };
  } catch {
    return { ok: false, error: `Server returned HTTP ${res.status} with non-JSON body` };
  }
}
