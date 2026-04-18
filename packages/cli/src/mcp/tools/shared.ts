/**
 * Shared helpers for MCP workflow tool registration.
 *
 * Each workflow file in this directory exports a `register(server)` function
 * that calls `server.tool(...)` with its name, description, optional arg
 * schema, and handler. `index.ts` aggregates all three into a single
 * `registerAllTools` function that `server.ts` calls during startup.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from '../../config/schema.ts';

export type ServerInstance = McpServer;
export type ConfigOrResolver = Config | ((cwd?: string) => Promise<Config>);

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
 * Either an eagerly-known server URL, an absent URL, or a lazy resolver that
 * computes the URL per-call. The lazy resolver receives the effective cwd of
 * the current tool invocation when available so one MCP process can route
 * different tool calls to different Open Knowledge project servers.
 *
 * See `packages/cli/src/mcp/server.ts` for the resolver wired in at startup.
 */
export type ServerUrlOrResolver =
  | string
  | undefined
  | ((cwd?: string) => Promise<string | undefined>);

/**
 * Normalize a `ServerUrlOrResolver` to a concrete URL (or `undefined` when the
 * server is not reachable). Call this at the top of every tool handler that
 * hits the Hocuspocus HTTP API.
 */
export async function resolveServerUrl(
  x: ServerUrlOrResolver,
  cwd?: string,
): Promise<string | undefined> {
  return typeof x === 'function' ? await x(cwd) : x;
}

/** Normalize a `ConfigOrResolver` to a concrete config for the current cwd. */
export async function resolveConfig(x: ConfigOrResolver, cwd?: string): Promise<Config> {
  return typeof x === 'function' ? await x(cwd) : x;
}

/** Resolve the effective project cwd plus the matching config for this call. */
export async function resolveProjectConfigContext(
  resolveCwd: (explicit?: string) => Promise<string>,
  config: ConfigOrResolver,
  explicitCwd?: string,
): Promise<{ ok: true; cwd: string; config: Config } | { ok: false; error: string }> {
  let cwd: string;
  try {
    cwd = await resolveCwd(explicitCwd);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  try {
    const resolvedConfig = await resolveConfig(config, cwd);
    return { ok: true, cwd, config: resolvedConfig };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Resolve the effective project cwd/config for this tool call, then resolve
 * the matching project server URL. Returns a structured error instead of
 * throwing so tool handlers can surface config-load or auto-start failures as
 * normal tool errors.
 */
export async function resolveProjectServerContext(
  resolveCwd: (explicit?: string) => Promise<string>,
  config: ConfigOrResolver,
  serverUrl: ServerUrlOrResolver,
  explicitCwd?: string,
): Promise<
  { ok: true; cwd: string; config: Config; url: string | undefined } | { ok: false; error: string }
> {
  const configContext = await resolveProjectConfigContext(resolveCwd, config, explicitCwd);
  if (!configContext.ok) {
    return configContext;
  }
  const { cwd, config: resolvedConfig } = configContext;
  try {
    const url = await resolveServerUrl(serverUrl, cwd);
    return { ok: true, cwd, config: resolvedConfig, url };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

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
