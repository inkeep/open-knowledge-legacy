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
const SUMMARY_TRANSPORT_CAP = 200;

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

// ─── Karpathy three-layer wiki frame (shared by the three workflow tools) ───
//
// The three workflow tools — `ingest`, `research`, `consolidate` — accrete a
// persistent knowledge base over time, following the pattern described in
// Karpathy's "LLM Wiki: Personal Knowledge Bases" gist:
//
//   https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
//
// Project-level scaffolding (schema + starter folders) lives OUTSIDE this
// MCP surface — users run `ok seed` once from a terminal to populate the
// `external-sources/`, `research/`, `articles/` layout plus matching
// `config.yml` `folders:` entries.
//
// Each tool body prepends a common "Where this fits" section so the agent
// orients on the layer + sibling tools + typical flow before diving into
// step-by-step instructions. One definition, three consumers.

type WorkflowRole = 'ingest' | 'research' | 'consolidate';

const ROLE_LABEL: Record<WorkflowRole, string> = {
  ingest: 'raw-sources layer (preserve external material, no analysis)',
  research: 'wiki layer, provisional (synthesize findings that can still change)',
  consolidate: 'wiki layer, canonical (promote stabilized research to source-of-truth)',
};

const ROLE_BEFORE: Record<WorkflowRole, string> = {
  ingest: 'user shares a URL or file they want preserved, or `research` needs raw sources',
  research: '`ingest` has captured the relevant sources (or the user points at one)',
  consolidate:
    '`research` has produced a provisional article AND a decision has actually been made',
};

const ROLE_AFTER: Record<WorkflowRole, string> = {
  ingest:
    'often `research` on the same topic — or just stop; raw preservation is frequently enough on its own',
  research:
    'usually stop (research lives as provisional indefinitely) or `consolidate` once a decision lands',
  consolidate:
    'update 2–3 neighbor docs to link the new canonical article; research articles it supersedes gain a `superseded_by` pointer',
};

/**
 * Prepend a "Where this fits" orientation block to a workflow tool body.
 * Names Karpathy's three-layer pattern, the tool's role, and the typical
 * Before/After flow. Keep this short — the bulk of instructional depth lives
 * in each tool's own step-by-step body that follows.
 */
export function buildWorkflowFrame(role: WorkflowRole): string {
  return `## Where this fits

Open Knowledge accretes a persistent wiki through three workflow tools, mapped to [Karpathy's three-layer knowledge-base pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f):

- **Raw sources** (immutable) — \`ingest\`
- **Wiki, provisional** — \`research\`
- **Wiki, canonical** — \`consolidate\`

(Project-level folder structure + \`config.yml\` scaffolding is handled by the \`ok seed\` CLI, not by an MCP tool.)

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
 *
 * Post-D22 RFC 9457: success responses emit flat `{...data}` shapes (no
 * `ok: true` wrapper). The server signals success/error via HTTP status —
 * 2xx is success, 4xx/5xx is RFC 9457 Problem Details. This helper
 * normalizes both to the legacy `{ok, error?, ...data}` shape MCP tool
 * consumers read so cluster migrations land transparently.
 *
 * Returns `{ ok: true, ...data }` on HTTP 2xx; `{ ok: false, error }` on
 * non-2xx (with `error` derived from `ProblemDetails.title` when the body
 * is RFC 9457-shaped, or a generic HTTP-status string otherwise);
 * `{ ok: false, error }` on network failure or non-JSON response.
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
  return parseHttpResponse(res);
}

/**
 * HTTP POST helper for Hocuspocus API calls.
 *
 * See `httpGet` for RFC 9457 normalization semantics.
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
  return parseHttpResponse(res);
}

/**
 * Normalize a Hocuspocus API response into the legacy `{ok, error?, ...}`
 * shape. Success path emits `{ok: true, ...flatBody}`; error path emits
 * `{ok: false, error: <title|status>}` with the original problem details
 * accessible under `problem` for callers that want the typed `type` token.
 *
 * This is a transitional shim: it preserves the MCP tool surface contract
 * while letting the wire shape advance to RFC 9457. When MCP tools
 * eventually read `type`/`status` directly, this can collapse to a plain
 * `await res.json()`.
 */
async function parseHttpResponse(res: Response): Promise<{ ok: boolean; [key: string]: unknown }> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, error: `Server returned HTTP ${res.status} with non-JSON body` };
  }
  if (!res.ok) {
    // Prefer RFC 9457 `title` (post-D22 server emits problem+json on every
    // error path; FR17 fail-on-any-occurrence enforces this for our handlers).
    // The `error`/`message` fallback arms remain as defensive coverage for
    // (a) test mocks that emit legacy shapes, (b) non-server intermediaries
    // (reverse proxies, load balancers, gateways) that synthesize their own
    // error bodies. Then `type`/`HTTP NNN` as last resorts.
    const errBody = body as Partial<{
      title: string;
      type: string;
      detail: string;
      error: string;
      message: string;
    }> | null;
    const errorMsg =
      (typeof errBody?.title === 'string' && errBody.title.length > 0 && errBody.title) ||
      (typeof errBody?.error === 'string' && errBody.error.length > 0 && errBody.error) ||
      (typeof errBody?.message === 'string' && errBody.message.length > 0 && errBody.message) ||
      (typeof errBody?.type === 'string' && errBody.type.length > 0 && errBody.type) ||
      `HTTP ${res.status}`;
    // Lift extension members from the body so callers reading
    // `result.<extensionField>` work on both legacy `{ok:false, ...extras}`
    // and RFC 9457 `application/problem+json` shapes (the schema is
    // `.loose()`, so extensions like `colliding` ride on the body).
    const extensions =
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};
    return { ...extensions, ok: false, error: errorMsg, problem: body, status: res.status };
  }
  // Success: server emits flat `{...data}` post-D22. Wrap with `{ok: true}`
  // so MCP tools can keep their `if (!result.ok) return error` short-circuit.
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    return { ok: true, ...(body as Record<string, unknown>) };
  }
  // Array-shaped success body (e.g., /api/rescue list response). Surface
  // through the `data` key so consumers can opt into reading it.
  return { ok: true, data: body };
}

/**
 * Structured collision pair returned by `POST /api/rename-path` when two
 * affected docs would resolve to the same destination. Both rename tools
 * surface this in their error response so callers can render the offending
 * pairs without re-parsing the human-readable error message.
 */
export interface RenameCollisionPair {
  existing: string;
  incoming: string;
  to: string;
}

export function parseRenameCollidingPairs(value: unknown): RenameCollisionPair[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const { existing, incoming, to } = entry as Record<string, unknown>;
    return typeof existing === 'string' && typeof incoming === 'string' && typeof to === 'string'
      ? [{ existing, incoming, to }]
      : [];
  });
}
