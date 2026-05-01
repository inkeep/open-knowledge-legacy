import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Config } from '../../config/schema.ts';

export type ServerInstance = McpServer;
export type ConfigOrResolver = Config | ((cwd?: string) => Promise<Config>);
export const ROUTED_CWD_DESCRIPTION =
  'Absolute host path to resolve the request against. Defaults only when the MCP client advertises exactly one root; otherwise pass `cwd` explicitly.';

const SUMMARY_TRANSPORT_CAP = 200;

export const summaryArgSchema = z
  .string()
  .max(SUMMARY_TRANSPORT_CAP)
  .optional()
  .describe(
    'Optional one-line user-outcome description (≤80 chars). Appears as a bullet in the timeline.',
  );

export function textResult(text: string, isError?: boolean) {
  return {
    content: [{ type: 'text' as const, text }],
    ...(isError ? { isError: true as const } : {}),
  };
}

export function textPlusStructured<T>(text: string, structured: T, isError?: boolean) {
  return {
    content: [{ type: 'text' as const, text }],
    structuredContent: structured as unknown as Record<string, unknown>,
    ...(isError ? { isError: true as const } : {}),
  };
}

export const HOCUSPOCUS_NOT_RUNNING_ERROR =
  'Error: Hocuspocus server is not running. Start it with `open-knowledge start`, then retry.\nFor disk-only writes without real-time sync, use your native Edit tool directly.';

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

export type ServerUrlOrResolver =
  | string
  | undefined
  | ((cwd?: string) => Promise<string | undefined>);

async function resolveServerUrl(x: ServerUrlOrResolver, cwd?: string): Promise<string | undefined> {
  return typeof x === 'function' ? await x(cwd) : x;
}

export async function resolveConfig(x: ConfigOrResolver, cwd?: string): Promise<Config> {
  return typeof x === 'function' ? await x(cwd) : x;
}

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
