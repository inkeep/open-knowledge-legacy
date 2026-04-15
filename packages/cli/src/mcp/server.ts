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
import { readServerLock } from '@inkeep/open-knowledge-server';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { RootsListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { resolveContentDir, resolveLockDir } from '../config/paths.ts';
import type { Config } from '../config/schema.ts';
import { MCP_SERVER_NAME, PACKAGE_VERSION } from '../constants.ts';
import { PREVIEW_GUIDANCE } from '../content/init.ts';
import { dim } from '../ui/colors.ts';
import type { AgentIdentity } from './agent-identity.ts';
import { registerAllTools, TOOL_DESCRIPTIONS } from './tools/index.ts';

export interface McpServerOptions {
  projectDir: string;
  serverUrl?: string;
  config: Config;
}

/** MCP diagnostic log — must use stderr to avoid corrupting the MCP JSON-RPC protocol on stdout */
function log(msg: string): void {
  process.stderr.write(`${dim('[mcp]')} ${msg}\n`);
}

export function buildInstructions(config: Config): string {
  const { dir, include, exclude } = config.content;
  const excludeLine = exclude.length > 0 ? exclude.map((p) => `\`${p}\``).join(', ') : '(none)';

  return `# MCP Instructions v2 — exec-primary (2026-04-13)

## This project's content layout (live config)

- **Content directory:** \`${dir}\`
- **Include globs:** ${include.map((p) => `\`${p}\``).join(', ')}
- **Exclude globs:** ${excludeLine}

**Path contract (\`config.yml\`):** \`.open-knowledge/config.yml\` (plus optional \`~/.open-knowledge/config.yml\`, with CLI/env overrides) owns the \`content\` keys. The table above is **this MCP session's resolved view** of that contract — same rules, no guessing from folder names. A file is an Open Knowledge document iff it lives under **Content directory**, matches at least one **Include glob**, and is not removed by **Exclude globs** or \`.gitignore\`.

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

Every in-scope \`.md\` / \`.mdx\` file (per the include globs above) should have YAML frontmatter: \`title\` (required), \`description\` (required), \`tags\` (recommended). Folder-level frontmatter was deprecated — per-file frontmatter is the only authored metadata surface.

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

async function detectHocuspocus(serverUrl: string): Promise<boolean> {
  try {
    const httpUrl = serverUrl.replace('ws://', 'http://').replace('wss://', 'https://');
    const res = await fetch(`${httpUrl}/api/agent-undo-status`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch (err) {
    log(`Hocuspocus check failed: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

// ── Server entrypoint ──────────────────────────────────────────────────

export async function startMcpServer(options: McpServerOptions): Promise<void> {
  const { projectDir: startupCwd, serverUrl, config } = options;

  // Detect Hocuspocus (non-blocking, informational). An explicit `serverUrl`
  // is probed immediately; when discovery is lazy the log is deferred until
  // after the client advertises its roots (see below).
  if (serverUrl) {
    const hocuspocusAvailable = await detectHocuspocus(serverUrl);
    log(
      hocuspocusAvailable
        ? `Hocuspocus detected at ${serverUrl}`
        : `Hocuspocus not available at ${serverUrl} — using disk-only mode`,
    );
  } else {
    log('No explicit server URL — will discover lazily from server.lock per call');
  }

  const server = new McpServer(
    {
      name: MCP_SERVER_NAME,
      version: PACKAGE_VERSION,
    },
    {
      instructions: buildInstructions(config),
    },
  );

  // ── Cwd resolution via MCP roots ────────────────────────────────────
  //
  // The client advertises one or more roots (file:// URIs of directories
  // it's working in). We fetch those roots and use the first one as the
  // default cwd for every tool call; agents can override per-call via an
  // explicit `cwd` arg. Falls back to startup cwd if the client doesn't
  // advertise roots (non-MCP-roots clients, or clients that leave it empty).
  //
  // This replaces the previous spawn-time singleton (`setProjectDir`),
  // which broke whenever the spawner didn't set cwd the way the server
  // expected (e.g., Claude Desktop not honoring the `cwd` field in
  // `claude_desktop_config.json`).
  let cachedRoots: string[] = [];
  let rootsLoaded = false;

  async function refreshRoots(): Promise<void> {
    try {
      const result = await server.server.listRoots();
      cachedRoots = result.roots
        .map((r) => r.uri)
        .filter((u) => u.startsWith('file://'))
        .map((u) => fileURLToPath(u));
      log(
        cachedRoots.length > 0
          ? `roots: ${cachedRoots.join(', ')}`
          : 'client advertised no roots — falling back to startup cwd',
      );
    } catch (err) {
      log(
        `listRoots unsupported by client (using startup cwd): ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      rootsLoaded = true;
    }
  }

  let warnedNoRoots = false;
  async function resolveCwd(explicit?: string): Promise<string> {
    if (explicit) return explicit;
    if (!rootsLoaded) await refreshRoots();
    if (cachedRoots.length === 0) {
      // Observability: the client didn't advertise any file:// roots. Falling
      // back to the spawn cwd — which is `/` for Claude Desktop and rarely
      // what the user wants. Log once so operators debugging "wrong project"
      // issues can see this.
      if (!warnedNoRoots) {
        log(`no client roots — falling back to startup cwd: ${startupCwd}`);
        warnedNoRoots = true;
      }
      return startupCwd;
    }
    if (warnedNoRoots) {
      log(`client roots now available — using ${cachedRoots[0]}`);
      warnedNoRoots = false;
    }
    return cachedRoots[0];
  }

  server.server.setNotificationHandler(RootsListChangedNotificationSchema, async () => {
    rootsLoaded = false;
    await refreshRoots();
  });

  // MCP tools — workflow + document + enriched + exec (V0-24)
  //
  // Hocuspocus URL resolution is **lazy** when no explicit override is given.
  // Discovery reads `<contentDir>/.open-knowledge/server.lock` relative to the
  // client-advertised root, re-resolved on every tool invocation. This is the
  // difference between "MCP started before `open-knowledge start`" returning
  // stale `undefined` forever vs. picking the server up as soon as it appears.
  // An explicit `serverUrl` (e.g. from `--port`) short-circuits discovery.
  const explicitHttpUrl = serverUrl
    ? serverUrl.replace('ws://', 'http://').replace('wss://', 'https://')
    : undefined;
  // 1-second TTL cache on the lock-file read: agent burst writes (e.g. 5 files
  // in 600ms) otherwise re-stat the same lock file N times with no new info.
  // Lock contents change once per `open-knowledge start` lifetime, so this
  // window is generously short. Keyed by cwd since different projects have
  // different locks.
  const SERVER_URL_CACHE_MS = 1000;
  const serverUrlCache = new Map<string, { url: string | undefined; expiresAt: number }>();
  const resolveServerUrlForTools = async (): Promise<string | undefined> => {
    if (explicitHttpUrl) return explicitHttpUrl;
    const cwd = await resolveCwd();
    const now = Date.now();
    const cached = serverUrlCache.get(cwd);
    if (cached && cached.expiresAt > now) return cached.url;
    const lock = readServerLock(resolveLockDir(resolveContentDir(config, cwd)));
    const url = lock && lock.port > 0 ? `http://localhost:${lock.port}` : undefined;
    serverUrlCache.set(cwd, { url, expiresAt: now + SERVER_URL_CACHE_MS });
    return url;
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
    log(`Agent identity: ${identityRef.current.displayName} (${connectionId.slice(0, 8)})`);
  };

  registerAllTools(server, {
    serverUrl: resolveServerUrlForTools,
    resolveCwd,
    startupCwd,
    config,
    identityRef,
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log('MCP server running (stdio)');

  // Fetch roots opportunistically after the client finishes handshake.
  // If it fires before the client is ready, `resolveCwd` will retry on
  // first use (rootsLoaded is reset on failure paths via fallback).
  refreshRoots().catch(() => {
    /* logged inside refreshRoots */
  });

  // Cleanup on exit
  const shutdown = (): void => {
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
