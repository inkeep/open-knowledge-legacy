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
 * Scaffolding (`.open-knowledge/` directory creation plus `.mcp.json` wiring) is a
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
import { PREVIEW_GUIDANCE } from '../content/init.ts';
import { normalizeCwd } from '../utils/normalize-cwd.ts';
import type { AgentIdentity } from './agent-identity.ts';
import { createMcpLogger, type McpLogger } from './logger.ts';
import { registerAllTools, TOOL_DESCRIPTIONS } from './tools/index.ts';
import type { ConfigOrResolver, ServerUrlOrResolver } from './tools/shared.ts';

export interface McpServerOptions {
  projectDir: string;
  serverUrl?: ServerUrlOrResolver;
  config: ConfigOrResolver;
  startupConfig: Config;
  bypassProjectSelection?: boolean;
}

export const NO_CLIENT_ROOTS_ERROR = 'No client roots available; pass cwd explicitly.';
export const MULTIPLE_ROOTS_ERROR = 'Multiple roots available; pass cwd explicitly.';
export const ROOTS_UNAVAILABLE_ERROR = 'Client roots unavailable; pass cwd explicitly.';

export class ProjectRoutingError extends Error {}

interface RootsListResult {
  roots: Array<{ uri: string }>;
}

export interface ProjectRoutingResolver {
  resolveCwd: (explicit?: string) => Promise<string>;
  invalidateRoots: () => void;
}

export interface KeepaliveProjectState {
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

export function buildInstructions(config: Config, opts?: { dynamicConfig?: boolean }): string {
  const { dir, include, exclude } = config.content;
  const excludeLine = exclude.length > 0 ? exclude.map((p) => `\`${p}\``).join(', ') : '(none)';
  const configScopeHeading = opts?.dynamicConfig
    ? '## Startup Project Content Layout (Informational)'
    : "## This project's content layout (live config)";
  const configScopeNote = opts?.dynamicConfig
    ? `**Multi-project note:** tool calls resolve \`.open-knowledge/config.yml\` from the **effective cwd** for that invocation (explicit tool \`cwd\` → exactly one client root → error). The values below describe the MCP process startup project only; they are not a routing fallback.`
    : `**Path contract (\`config.yml\`):** \`.open-knowledge/config.yml\` (plus optional \`~/.open-knowledge/config.yml\`, with CLI/env overrides) owns the \`content\` keys. The table above is **this MCP session's resolved view** of that contract — same rules, no guessing from folder names. A file is an Open Knowledge document iff it lives under **Content directory**, matches at least one **Include glob**, and is not removed by **Exclude globs** or \`.gitignore\`.`;

  return `# MCP Instructions v2 — exec-primary (2026-04-13)

${configScopeHeading}

- **Content directory:** \`${dir}\`
- **Include globs:** ${include.map((p) => `\`${p}\``).join(', ')}
- **Exclude globs:** ${excludeLine}

${configScopeNote}

Paths in \`exec\` commands are resolved relative to the content directory. The sandbox prevents paths escaping it.

**Default rule:** with the usual \`**/*.md\` + \`**/*.mdx\` globs from repo root, **every** such file under the content directory is an Open Knowledge document unless \`.gitignore\` or \`content.exclude\` drops it. Folder names (\`specs/\`, \`reports/\`, …) do not matter. If \`content.include\` was narrowed, only matching paths use \`exec\`.

## Navigation — \`exec\` is **mandatory** for Open Knowledge \`.md\` / \`.mdx\` (this server is registered)

**STOP:** Do not use the host IDE's \`Read\`, \`Grep\`, or \`Glob\` on in-scope \`.md\` / \`.mdx\` — use \`exec\` (or typed \`read_document\` / \`search\` when you need fixed \`structuredContent\`). Native file tools skip frontmatter, backlinks, shadow-repo activity, and project git history; reserve them for **source code and non-markdown** paths.

**MCP clients differ:** Your agent host may expose these tools directly or only through its MCP integration (server name from \`tools/list\`, user-chosen label). **That still counts as this server being available.** Invoke \`exec\` / \`search\` / \`read_document\` the way **your product's docs** describe — not native \`Grep\` on in-scope markdown. Missing a top-level symbol named \`exec\` is not an excuse.

\`exec\` provides the same enrichment as the typed tools plus bash composability (pipes, \`head\`, \`find\`). One tool covers reading, listing, grepping, and combining them. **Escape hatch:** only if this MCP server is **not** registered for the workspace, or after an MCP **call** failed — say \`Open Knowledge MCP unavailable:\`. Never use the hatch to skip trying MCP first.

For paths **outside** the include globs above, use native tools.

Examples:

- Read a file: \`exec("cat <path>.md")\` — returns file contents + rich enrichment
- List a directory: \`exec("ls <dir>")\` — each result comes with per-file enrichment in \`structuredContent.enrichedPaths\`
- Search: \`exec("grep -rn <term> <dir>")\` — matches + enrichment per matched file
- Combine: \`exec("grep -rn <term> <dir> | head -5")\` — top 5 matches with full enrichment

Allowlist (read-only): \`cat\`, \`ls\`, \`grep\`, \`find\`, \`head\`, \`tail\`, \`wc\`, \`sort\`, \`uniq\`, \`cut\`. Pipes (\`|\`) work between stages. Redirections, subshells, and writes are rejected with a category-specific error telling you the next step.

### Scope searches — \`grep\` and \`find\` can be slow if unscoped

Recursive \`grep -r\` / \`find\` walk every file under the path, which on a real repo includes source code, build output, and dependencies. For reads inside the content tree, scope deliberately:

- **Filter to markdown:** \`grep -rn TERM --include="*.md" <dir>\` — skips every non-md file.
- **Scope to a known knowledge dir:** \`grep -rn TERM reports/ specs/\` (or whatever folders the project uses) beats \`grep -rn TERM .\`.
- **Bail early:** pipe through \`| head -20\` for bounded output. The server waits for the pipeline to finish before returning, so unscoped commands block on the slowest stage.
- **Existence vs. enumeration:** "does X exist in any tracked doc?" is \`grep -rl PATTERN <dir>\` (list matching files, unbounded) — NOT \`grep -rn PATTERN <dir> | head -N\`. When \`head\` truncates, alphabetically-earlier files dominate the output and later files silently go missing. The server surfaces a banner when \`head\` / \`tail\` hits its cap, but the fix is to pick the right command up front.
- **Auto-prune (built in):** the server transparently adds \`--exclude-dir=\` for \`node_modules\`, \`.git\`, \`dist\`, \`build\`, \`.next\`, \`.turbo\`, \`coverage\`, \`.claude\`, etc. on recursive \`grep\`, and \`-not -path\` equivalents on \`find\`. This saves you from remembering them — but explicit scoping via \`--include\` or a narrower path is still dramatically faster on monorepos.

### Why \`exec\` over typed tools

\`exec\` is the default because it subsumes \`read_document\` and \`search\` enrichment paths (same shared helper under the hood) and adds bash composition. The typed tools remain registered as **Typed call sites (advanced)** — present for callers that consume \`structuredContent\` with fixed shapes — but they're not recommended for common agent reads.

## Writing

Agent writes to in-scope \`.md\` / \`.mdx\` (paths under \`content.include\`) **must** go through the \`write_document\` / \`edit_document\` MCP tools — never \`exec\` (which is read-only) and never native \`Edit\` / \`sed\`. Routing writes through the server is what captures agent-vs-human attribution in the shadow repo. Writes via other paths land as anonymous \`upstream\` imports and lose attribution.

${PREVIEW_GUIDANCE}

## Linking — lean on \`[[wiki-links]]\` aggressively

**When writing or editing any document, link liberally to every other document it relates to.** Open Knowledge's value compounds with link density: backlinks surface cross-document context in every \`exec("cat X.md")\` read, \`get_hubs\` / \`get_orphans\` reveal structure, and agents (you, next session) navigate the knowledge base by following links the way you'd navigate a wiki. A document with no outbound links is an island; an island in a knowledge base is worse than no document at all.

**Defaults when writing:**

- **Every noun-phrase that names another document is a link.** If you mention a concept, project, decision, or entity that has (or should have) its own page, write it as \`[[Page Title]]\` instead of plain prose. Don't stop to check whether the target exists first — a redlink signals "this should exist" to future work. Over-linking is the goal, not the failure mode.
- **Cross-link siblings.** When you create a document in a folder, skim the siblings (\`exec("ls <folder>")\`) and link to the 2–3 most related ones. A "See also" section at the bottom is fine; inline links woven through the prose are better.
- **Link back to sources.** If a document is derived from research, spec decisions, external sources, or prior reports, link to them — don't re-summarize. The reader can follow.
- **Prefer \`[[Page]]\` over Markdown \`[text](./page.md)\`.** Wiki-links resolve by docName (file path minus \`.md\`) and participate in the backlinks index. Markdown links to other wiki files don't.
- **Update both sides when possible.** If you add an important link from A → B, consider whether B should link back to A or to a landing page that lists documents like A.

**Rule of thumb:** if a human reader would want to click a term to learn more, make it a link. Err on the side of too many links.

## Cadence — maintain hubs as you create children

When you create or meaningfully edit a doc inside a folder that has a hub doc (\`INDEX.md\`, \`README.md\`, \`REPORT.md\`, \`SPEC.md\`, or a file whose name matches the folder name — e.g. \`reports/r1/r1.md\`), update the hub to reflect the change before moving to the next child. Write one child → update hub → write next child. Don't batch five children and then the hub.

**Why:** the browser follows your focus in real time via push-nav on every write. Hub-as-you-go makes your work legible to the human watching — each pulse is a complete thought (child → hub → child → hub), and the hub doc itself functions as the live progress bar. Batched writes make the nav flicker, flatten the narrative, and hide the structure you're building.

When \`write_document\` creates a doc with zero incoming backlinks and a hub candidate exists in the folder tree, the response includes a \`hints: [{type: 'orphan', parentCandidates: [...], message: ...}]\` entry — that's the soft nudge to interleave the hub update next. Pair with the link-as-you-write discipline above.

## Frontmatter conventions

Open Knowledge has two metadata surfaces that merge at read time:

1. **Per-file frontmatter** — YAML at the top of each \`.md\` / \`.mdx\`: \`title\` (required), \`description\` (required), \`tags\` (recommended). This is where a file's own identity lives.
2. **Folder-level defaults via \`.open-knowledge/config.yml\` \`folders:\`** — declare \`title\` / \`description\` / \`tags\` defaults keyed by glob \`match:\`. Rules apply in declaration order; later matches override earlier scalars. Tags concatenate across ALL matching rules (in declaration order), with file tags appended last, and first-occurrence preserved on dedup. The file's own frontmatter wins per-scalar; folder defaults fill in blanks.

Folder metadata lives in \`config.yml\`, **not** in content files — this is intentionally different from the rejected \`INDEX.md\`-inside-content pattern. The merge happens on every \`exec\` / \`read_document\` / \`search\` call and is never written back to disk.

## Tools

**Primary:**
- \`exec\` — read-only bash with enriched output (see above).

**Workflow (instructional tools):**
- \`init-content\`, \`ingest\`, \`research\`, \`consolidate\` — each returns structured instructions you follow. Output text includes the live \`content.dir\` value (${dir}) so you don't need to re-read the config.

**Writes:**
- \`write_document\`, \`edit_document\`, \`rename_document\`, \`undo_agent_edit\`, \`redo_agent_edit\` — mutate the CRDT through the server; attribution captured.

**Typed call sites (advanced) — prefer \`exec\` for common reads:**
- \`read_document\`, \`search\`, \`list_documents\`, \`get_backlinks\`, \`get_forward_links\`, \`get_orphans\`, \`get_hubs\`.

${Object.entries(TOOL_DESCRIPTIONS)
  .map(([name, desc]) => `### \`${name}\`\n${desc}`)
  .join('\n\n')}
`;
}

async function detectHocuspocus(serverUrl: string, log: McpLogger): Promise<boolean> {
  try {
    const httpUrl = serverUrl.replace('ws://', 'http://').replace('wss://', 'https://');
    const res = await fetch(`${httpUrl}/api/agent-undo-status`, {
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
