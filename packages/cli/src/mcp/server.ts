/**
 * MCP stdio server — content server with instructions + tool registration.
 *
 * What this server provides:
 *   - Instructions on connect (the INSTRUCTIONS constant below)
 *   - All MCP tools registered from packages/cli/src/mcp/tools/
 *
 * Catalog auto-generation was removed per V0-24.2 — `exec("ls …")` +
 * per-file enrichment renders the same view on demand without the
 * persisted INDEX.md artifacts.
 *
 * Scaffolding (`.ok/` directory creation plus editor MCP config wiring) is a
 * terminal-side operation handled by the CLI `init` subcommand.
 *
 * Does NOT require Hocuspocus running. All diagnostic logging goes to stderr
 * (stdout is the MCP wire).
 */
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { RootsListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import type { Config } from '../config/schema.ts';
import { MCP_SERVER_NAME, PACKAGE_VERSION } from '../constants.ts';
import { normalizeCwd } from '../utils/normalize-cwd.ts';
import type { AgentIdentity } from './agent-identity.ts';
import { createMcpLogger, type McpLogger } from './logger.ts';
import { registerAllTools } from './tools/index.ts';
import type { ConfigOrResolver, ServerUrlOrResolver } from './tools/shared.ts';

interface McpServerOptions {
  projectDir: string;
  serverUrl?: ServerUrlOrResolver;
  config: ConfigOrResolver;
  startupConfig: Config;
  bypassProjectSelection?: boolean;
}

export const NO_CLIENT_ROOTS_ERROR = 'No client roots available; pass cwd explicitly.';
export const MULTIPLE_ROOTS_ERROR = 'Multiple roots available; pass cwd explicitly.';
export const ROOTS_UNAVAILABLE_ERROR = 'Client roots unavailable; pass cwd explicitly.';

function classifyRootsLoadError(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err && typeof err.code === 'string') {
    return err.code;
  }
  if (err instanceof Error && err.name) return err.name;
  return typeof err;
}

class ProjectRoutingError extends Error {}

interface RootsListResult {
  roots: Array<{ uri: string }>;
}

interface ProjectRoutingResolver {
  resolveCwd: (explicit?: string) => Promise<string>;
  invalidateRoots: () => void;
}

interface KeepaliveProjectState {
  resolveCwdForTools: (explicit?: string) => Promise<string>;
  getKeepaliveCwd: () => Promise<string | undefined>;
}

interface CreateProjectRoutingResolverOptions {
  startupCwd: string;
  listRoots: () => Promise<RootsListResult>;
  bypassProjectSelection?: boolean;
  logger?: McpLogger;
}

export function createProjectRoutingResolver(
  opts: CreateProjectRoutingResolverOptions,
): ProjectRoutingResolver {
  const startupCwdPromise = normalizeCwd(opts.startupCwd);
  let cachedRoots: string[] | null = null;
  let pendingRootsLoad: Promise<string[]> | null = null;

  const loadRoots = async (): Promise<string[]> => {
    if (cachedRoots !== null) return cachedRoots;
    if (!pendingRootsLoad) {
      pendingRootsLoad = (async () => {
        const result = await opts.listRoots();
        const normalizedRoots = await Promise.all(
          result.roots.map(async (root) => {
            if (!root.uri.startsWith('file://')) return null;
            return await normalizeCwd(fileURLToPath(root.uri));
          }),
        );
        const roots = [...new Set(normalizedRoots.filter((root): root is string => root !== null))];
        cachedRoots = roots;
        opts.logger?.info('roots resolved', { roots, count: roots.length });
        return roots;
      })().finally(() => {
        pendingRootsLoad = null;
      });
    }
    return await pendingRootsLoad;
  };

  return {
    async resolveCwd(explicit?: string): Promise<string> {
      if (explicit) {
        const cwd = await normalizeCwd(explicit);
        opts.logger?.debug('cwd resolved', { cwd, routing: 'explicit' });
        return cwd;
      }
      if (opts.bypassProjectSelection) {
        const cwd = await startupCwdPromise;
        opts.logger?.debug('cwd resolved', { cwd, routing: 'bypass' });
        return cwd;
      }

      let roots: string[];
      try {
        roots = await loadRoots();
      } catch (err) {
        opts.logger?.warn('roots/list unavailable', {
          error: err instanceof Error ? err.message : String(err),
          errorType: classifyRootsLoadError(err),
        });
        throw new ProjectRoutingError(ROOTS_UNAVAILABLE_ERROR);
      }

      if (roots.length === 0) {
        throw new ProjectRoutingError(NO_CLIENT_ROOTS_ERROR);
      }
      if (roots.length > 1) {
        throw new ProjectRoutingError(MULTIPLE_ROOTS_ERROR);
      }
      opts.logger?.debug('cwd resolved', { cwd: roots[0], routing: 'single-root' });
      return roots[0];
    },
    invalidateRoots(): void {
      cachedRoots = null;
      pendingRootsLoad = null;
      opts.logger?.info('roots cache invalidated');
    },
  };
}

interface CreateKeepaliveProjectStateOptions {
  startupCwd: string;
  resolveCwd: (explicit?: string) => Promise<string>;
  bypassProjectSelection?: boolean;
}

export function createKeepaliveProjectState(
  opts: CreateKeepaliveProjectStateOptions,
): KeepaliveProjectState {
  const normalizedStartupCwdPromise = normalizeCwd(opts.startupCwd);
  let activeProjectCwd: string | undefined;

  return {
    async resolveCwdForTools(explicit?: string): Promise<string> {
      const cwd = await opts.resolveCwd(explicit);
      activeProjectCwd = cwd;
      return cwd;
    },
    async getKeepaliveCwd(): Promise<string | undefined> {
      if (opts.bypassProjectSelection) {
        return await normalizedStartupCwdPromise;
      }
      return activeProjectCwd;
    },
  };
}

/** Module-level logger; initialized in `startMcpServer`. */
let logger: McpLogger | undefined;

/**
 * MCP `instructions` handshake string — emitted on `initialize`.
 *
 * Compressed to ≤ 1,500 bytes per SPEC 2026-04-22 (FR3 / §9) so it fits
 * under Claude Code's 2 KB per-server cap without truncation. Front-loads
 * the STOP rules on native `Read`/`Grep`/`Glob`/`Edit` + preview-before-edit
 * contract; full behavioral guidance lives in the user-global Agent Skill
 * (bundled at `packages/server/assets/skills/open-knowledge/SKILL.md` and
 * installed via `installUserSkill` from `@inkeep/open-knowledge-server`).
 *
 * Per-tool descriptions reach clients via `tools/list` — we do NOT inline
 * them here (SPEC D13).
 */
export function buildInstructions(config: Config, _opts?: { dynamicConfig?: boolean }): string {
  const { dir } = config.content;

  return `# Open Knowledge (OK) — collaborative markdown via MCP

**STOP** *(when \`.ok/\` exists)* — do NOT use native \`Read\`, \`Grep\`, \`Glob\`, \`Edit\`, \`Write\` on in-scope \`.md\` / \`.mdx\`. Reads: \`exec\` / \`read_document\` / \`search\`. Writes: \`write_document\` / \`edit_document\` ONLY.

**Preview:** open the browser at session start if not already open. On \`attach-preview-once\` in a write response, open \`previewUrl\` one-shot.

Content dir: ${dir}. Path rules: see \`.okignore\` at the project root (gitignore syntax).

## Reads

\`exec("cat <path>.md")\` / \`exec("ls <dir>")\` / \`exec("grep -rn <term> <dir>")\` — primary; returns contents + enrichment. Typed \`read_document\` / \`search\` when you need \`structuredContent\`.

## Preview — open at session start

Claude Code Desktop: \`preview_start("open-knowledge-ui")\`. Other hosts: open-URL tool or \`open <url>\`. If a write response lacks the \`attach-preview-once\` warning, a browser is attached — do nothing. Server not running: \`open-knowledge ui\`.

## Full guidance

Detailed conventions (wiki-link authoring, frontmatter, anti-patterns) live in the installed \`open-knowledge\` Agent Skill. If missing, run \`npx @inkeep/open-knowledge init\`.

**Escape hatch.** Native \`Read\`/\`Grep\`/\`Glob\` on \`.md\` is allowed when the project has no \`.ok/\`, when no OK MCP is registered, or right after a failed OK MCP call (then prefix with \`Open Knowledge MCP unavailable:\`). Non-markdown: native tools always.
`;
}

async function detectHocuspocus(serverUrl: string, log: McpLogger): Promise<boolean> {
  try {
    const httpUrl = serverUrl.replace('ws://', 'http://').replace('wss://', 'https://');
    const res = await fetch(`${httpUrl}/api/document`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch (err) {
    log.warn('Hocuspocus probe failed', {
      serverUrl,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

// ── Server entrypoint ──────────────────────────────────────────────────

export async function startMcpServer(options: McpServerOptions): Promise<void> {
  const {
    projectDir: startupCwd,
    serverUrl,
    config,
    startupConfig,
    bypassProjectSelection = false,
  } = options;

  logger = createMcpLogger();
  logger.info('MCP server starting', {
    startupCwd,
    bypassProjectSelection,
    serverUrlType: typeof serverUrl === 'string' ? 'explicit' : 'lazy',
  });

  if (typeof serverUrl === 'string') {
    const hocuspocusAvailable = await detectHocuspocus(serverUrl, logger);
    logger.info('Hocuspocus detection complete', {
      serverUrl,
      available: hocuspocusAvailable,
    });
  } else {
    logger.info('server discovery is lazy per effective cwd');
  }

  const server = new McpServer(
    {
      name: MCP_SERVER_NAME,
      version: PACKAGE_VERSION,
    },
    {
      instructions: buildInstructions(startupConfig, {
        dynamicConfig: typeof config === 'function' && !bypassProjectSelection,
      }),
    },
  );

  // ── Cwd resolution via MCP roots ────────────────────────────────────
  //
  // Strict routing contract:
  //   1. explicit tool `cwd`
  //   2. exactly one advertised client root (fetched via `roots/list` on first use)
  //   3. otherwise error
  //
  // `--port` is the only bypass path: it intentionally pins the session to the
  // startup project for single-target debugging.
  const routing = createProjectRoutingResolver({
    startupCwd,
    bypassProjectSelection,
    listRoots: () => server.server.listRoots(),
    logger,
  });
  const keepaliveProjectState = createKeepaliveProjectState({
    startupCwd,
    resolveCwd: routing.resolveCwd,
    bypassProjectSelection,
  });
  const resolveCwdForTools = keepaliveProjectState.resolveCwdForTools;

  server.server.setNotificationHandler(RootsListChangedNotificationSchema, async () => {
    routing.invalidateRoots();
  });

  // MCP tools — workflow + document + enriched + exec (V0-24)
  //
  // Hocuspocus URL resolution is lazy unless the caller passed a concrete
  // `--port` override string. The lazy resolver is already project-aware; it
  // accepts the effective cwd of the current tool call and can auto-start the
  // matching project server on demand.
  const resolveServerUrlForTools = async (cwd?: string): Promise<string | undefined> => {
    if (typeof serverUrl === 'string') {
      return serverUrl.replace('ws://', 'http://').replace('wss://', 'https://');
    }
    const effectiveCwd = cwd ?? (await resolveCwdForTools());
    const wsUrl = typeof serverUrl === 'function' ? await serverUrl(effectiveCwd) : serverUrl;
    return wsUrl?.replace('ws://', 'http://').replace('wss://', 'https://');
  };

  // --- Agent identity (Ref pattern — tool handlers read .current at call time).
  // From attribution PR #134: every MCP connection gets a stable connectionId
  // used as the agentId; displayName/colorSeed fall back to label env → client
  // name → connectionId suffix.
  const connectionId = randomUUID();
  const label = process.env.AGENT_LABEL || undefined;

  const identityRef: { current: AgentIdentity } = {
    current: {
      connectionId,
      label,
      displayName: label ?? 'Agent',
      colorSeed: label ?? connectionId,
    },
  };

  server.server.oninitialized = () => {
    const clientInfo = server.server.getClientVersion();
    identityRef.current = {
      connectionId,
      clientInfo: clientInfo ? { name: clientInfo.name, version: clientInfo.version } : undefined,
      label,
      displayName: label ?? clientInfo?.name ?? 'Agent',
      colorSeed: label ?? clientInfo?.name ?? connectionId,
    };
    logger?.info('agent identity established', {
      displayName: identityRef.current.displayName,
      connectionId: connectionId.slice(0, 8),
      clientName: clientInfo?.name,
    });
  };

  registerAllTools(server, {
    serverUrl: resolveServerUrlForTools,
    resolveCwd: resolveCwdForTools,
    config,
    identityRef,
    logger,
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('MCP server running on stdio');

  // D-034 — keep-alive WebSocket to `/collab/keepalive`.
  //
  // Holds a single WS open for the lifetime of this MCP stdio process. Server-
  // side idle-shutdown counts `/collab*` upgrades, so this channel (which
  // carries no traffic) is exactly what keeps the collab server alive while
  // a user has an MCP client connected but no browser tab open. Reconnects
  // with exponential backoff so a server restart on a different port is
  // picked up transparently.
  const { startKeepalive } = await import('./keepalive.ts');
  const keepaliveHandle = startKeepalive({
    resolveWsUrl: async () => {
      const cwd = await keepaliveProjectState.getKeepaliveCwd();
      if (!cwd) return undefined;
      const httpUrl = await resolveServerUrlForTools(cwd);
      if (!httpUrl) return undefined;
      return httpUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
    },
    // Identity spec D27 + multi-agent-presence SPEC §6.4 FR-4 / D13:
    // stable per-MCP-process connectionId threaded through the keepalive WS
    // URL so the server can (a) correlate this WS with agent sessions and
    // (b) deterministically clear this agent's __system__ presence entry on
    // WS close.
    connectionId: `agent-${connectionId}`,
    logger: logger.child('keepalive'),
  });

  // Cleanup on exit
  const shutdown = (signal: string): void => {
    logger?.info('MCP server shutting down', { signal });
    try {
      keepaliveHandle.close();
    } catch {
      // best-effort
    }
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
