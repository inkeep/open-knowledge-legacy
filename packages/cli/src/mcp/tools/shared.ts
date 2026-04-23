/**
 * Shared helpers for MCP workflow tool registration.
 *
 * Each workflow file in this directory exports a `register(server)` function
 * that calls `server.tool(...)` with its name, description, optional arg
 * schema, and handler. `index.ts` aggregates all three into a single
 * `registerAllTools` function that `server.ts` calls during startup.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Config } from '../../config/schema.ts';

export type ServerInstance = McpServer;
export type ConfigOrResolver = Config | ((cwd?: string) => Promise<Config>);
export const ROUTED_CWD_DESCRIPTION =
  'Absolute host path to resolve the request against. Defaults only when the MCP client advertises exactly one root; otherwise pass `cwd` explicitly.';

// ─── Agent-write summary schema (shared across the four MCP write tools) ─────
//
// The 200-char Zod cap (D21 — transport-safety bound) and the "≤80 chars"
// render-cap description (D24 — render bound, enforced server-side by
// `MAX_SUMMARY_LENGTH` in packages/server/src/agent-write-summary.ts) were
// previously duplicated across write-document, edit-document, rename-document,
// and rollback-to-version. Centralizing them here keeps the two bounds in
// sync and localizes future re-tuning to one place.

/**
 * Transport-safety upper bound for `summary` at the MCP layer.
 * Rejects payloads > 200 chars BEFORE they hit the HTTP boundary. Separate
 * from the server-side render cap (80) — see `MAX_SUMMARY_LENGTH`.
 */
export const SUMMARY_TRANSPORT_CAP = 200;

/**
 * Shared Zod schema for the `summary` param on write_document, edit_document,
 * rename_document, and rollback_to_version. Includes the description that
 * surfaces in tool introspection for agents — keep the "(≤80 chars)" phrasing
 * here as the single source of truth (matches the API-side `MAX_SUMMARY_LENGTH`
 * constant).
 */
export const summaryArgSchema = z
  .string()
  .max(SUMMARY_TRANSPORT_CAP)
  .optional()
  .describe(
    'Optional one-line user-outcome description (≤80 chars). Appears as a bullet in the timeline.',
  );

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

// ─── Karpathy three-layer wiki frame (shared by the four workflow tools) ─────
//
// The four workflow tools — `ingest`, `research`, `consolidate`, `init-content`
// — accrete a persistent knowledge base over time, following the pattern
// described in Karpathy's "LLM Wiki: Personal Knowledge Bases" gist:
//
//   https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
//
// Each tool body prepends a common "Where this fits" section so the agent
// orients on the layer + sibling tools + typical flow before diving into
// step-by-step instructions. One definition, four consumers.

export type WorkflowRole = 'ingest' | 'research' | 'consolidate' | 'init-content';

const ROLE_LABEL: Record<WorkflowRole, string> = {
  ingest: 'raw-sources layer (preserve external material, no analysis)',
  research: 'wiki layer, provisional (synthesize findings that can still change)',
  consolidate: 'wiki layer, canonical (promote stabilized research to source-of-truth)',
  'init-content': 'schema + bootstrap (populate the wiki on day 1)',
};

const ROLE_BEFORE: Record<WorkflowRole, string> = {
  ingest: 'user shares a URL or file they want preserved, or `research` needs raw sources',
  research: '`ingest` has captured the relevant sources (or the user points at one)',
  consolidate:
    '`research` has produced a provisional article AND a decision has actually been made',
  'init-content':
    'a fresh or under-populated knowledge base; a new codebase you want agents to understand',
};

const ROLE_AFTER: Record<WorkflowRole, string> = {
  ingest:
    'often `research` on the same topic — or just stop; raw preservation is frequently enough on its own',
  research:
    'usually stop (research lives as provisional indefinitely) or `consolidate` once a decision lands',
  consolidate:
    'update 2–3 neighbor docs to link the new canonical article; research articles it supersedes gain a `superseded_by` pointer',
  'init-content':
    'ongoing `ingest` / `research` / `consolidate` as the project grows; the initial population is just day 1',
};

/**
 * Prepend a "Where this fits" orientation block to a workflow tool body.
 * Names Karpathy's three-layer pattern, the tool's role, and the typical
 * Before/After flow. Keep this short — the bulk of instructional depth lives
 * in each tool's own step-by-step body that follows.
 */
export function buildWorkflowFrame(role: WorkflowRole): string {
  return `## Where this fits

Open Knowledge accretes a persistent wiki through four workflow tools, mapped to [Karpathy's three-layer knowledge-base pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f):

- **Raw sources** (immutable) — \`ingest\`
- **Wiki, provisional** — \`research\`
- **Wiki, canonical** — \`consolidate\`
- **Schema + bootstrap** — \`init-content\` + \`.open-knowledge/config.yml\`

**This tool operates in the ${ROLE_LABEL[role]}.**

- **Before this:** ${ROLE_BEFORE[role]}
- **After this:** ${ROLE_AFTER[role]}

Karpathy's insight: "The tedious part of maintaining a knowledge base is not the reading or the thinking — it's the bookkeeping." Humans abandon wikis because maintenance costs exceed perceived value. These tools exist so an agent can do the bookkeeping (fetching, summarizing, cross-linking, superseding) without fatigue. Follow the steps below faithfully — skipping the cross-linking, supersedes chains, or raw-source preservation is what turns a useful wiki back into an abandoned one.

`;
}

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
async function resolveServerUrl(x: ServerUrlOrResolver, cwd?: string): Promise<string | undefined> {
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
