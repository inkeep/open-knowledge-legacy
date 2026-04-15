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
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { setProjectDir } from '../bash/index.ts';
import type { Config } from '../config/schema.ts';
import { dim } from '../ui/colors.ts';
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

function buildInstructions(config: Config): string {
  const { dir, include, exclude } = config.content;
  const excludeLine = exclude.length > 0 ? exclude.map((p) => `\`${p}\``).join(', ') : '(none)';

  return `# MCP Instructions v2 — exec-primary (2026-04-13)

## This project's content layout (live config)

- **Content directory:** \`${dir}\`
- **Include globs:** ${include.map((p) => `\`${p}\``).join(', ')}
- **Exclude globs:** ${excludeLine}

Paths in \`exec\` commands are resolved relative to the content directory. The sandbox prevents paths escaping it.

## Navigation — prefer \`exec\` for all wiki reads

**Prefer \`exec\` over native \`Read\`/\`Grep\`/\`Glob\` and over \`read_document\`/\`search\` for all wiki operations.** \`exec\` provides the same enrichment as the typed tools (frontmatter, backlink count, shadow-repo activity with agent-vs-human attribution, project git history) plus bash composability (pipes, \`head\`, \`find\`). One tool covers reading, listing, grepping, and combining them — no per-operation tool switch.

Examples:

- Read a file: \`exec("cat <path>.md")\` — returns file contents + rich enrichment
- List a directory: \`exec("ls <dir>")\` — each result comes with per-file enrichment in \`structuredContent.enrichedPaths\`
- Search: \`exec("grep -rn <term> <dir>")\` — matches + enrichment per matched file
- Combine: \`exec("grep -rn <term> <dir> | head -5")\` — top 5 matches with full enrichment

Allowlist (read-only): \`cat\`, \`ls\`, \`grep\`, \`find\`, \`head\`, \`tail\`, \`wc\`, \`sort\`, \`uniq\`, \`cut\`. Pipes (\`|\`) work between stages. Redirections, subshells, and writes are rejected with a category-specific error telling you the next step.

### Why \`exec\` over typed tools

\`exec\` is the default because it subsumes \`read_document\` and \`search\` enrichment paths (same shared helper under the hood) and adds bash composition. The typed tools remain registered as **Typed call sites (advanced)** — present for callers that consume \`structuredContent\` with fixed shapes — but they're not recommended for common agent reads.

## Writing

Agent writes to wiki markdown **must** go through the \`write_document\` / \`edit_document\` MCP tools — never \`exec\` (which is read-only) and never native \`Edit\` / \`sed\`. Routing writes through the server is what captures agent-vs-human attribution in the shadow repo. Writes via other paths land as anonymous \`upstream\` imports and lose attribution.

## Linking — lean on \`[[wiki-links]]\` aggressively

**When writing or editing any document, link liberally to every other document it relates to.** Open Knowledge's value compounds with link density: backlinks surface cross-document context in every \`exec("cat X.md")\` read, \`get_hubs\` / \`get_orphans\` reveal structure, and agents (you, next session) navigate the knowledge base by following links the way you'd navigate a wiki. A document with no outbound links is an island; an island in a knowledge base is worse than no document at all.

**Defaults when writing:**

- **Every noun-phrase that names another document is a link.** If you mention a concept, project, decision, or entity that has (or should have) its own page, write it as \`[[Page Title]]\` instead of plain prose. Don't stop to check whether the target exists first — a redlink signals "this should exist" to future work. Over-linking is the goal, not the failure mode.
- **Cross-link siblings.** When you create a document in a folder, skim the siblings (\`exec("ls <folder>")\`) and link to the 2–3 most related ones. A "See also" section at the bottom is fine; inline links woven through the prose are better.
- **Link back to sources.** If a document is derived from research, spec decisions, external sources, or prior reports, link to them — don't re-summarize. The reader can follow.
- **Prefer \`[[Page]]\` over Markdown \`[text](./page.md)\`.** Wiki-links resolve by docName (file path minus \`.md\`) and participate in the backlinks index. Markdown links to other wiki files don't.
- **Update both sides when possible.** If you add an important link from A → B, consider whether B should link back to A or to a landing page that lists documents like A.

**Rule of thumb:** if a human reader would want to click a term to learn more, make it a link. Err on the side of too many links.

## Frontmatter conventions

Every \`.md\` file in the knowledge base should have YAML frontmatter: \`title\` (required), \`description\` (required), \`tags\` (recommended). Folder-level frontmatter was deprecated — per-file frontmatter is the only authored metadata surface.

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
  const { projectDir, serverUrl, config } = options;

  // Detect Hocuspocus (non-blocking)
  let hocuspocusAvailable = false;
  if (serverUrl) {
    hocuspocusAvailable = await detectHocuspocus(serverUrl);
    log(
      hocuspocusAvailable
        ? `Hocuspocus detected at ${serverUrl}`
        : `Hocuspocus not available at ${serverUrl} — using disk-only mode`,
    );
  } else {
    log('No server URL configured — using disk-only mode');
  }

  const server = new McpServer(
    {
      name: 'open-knowledge',
      version: '0.0.1',
    },
    {
      instructions: buildInstructions(config),
    },
  );

  // MCP tools — workflow + document + enriched + exec (V0-24)
  const httpUrl = serverUrl
    ? serverUrl.replace('ws://', 'http://').replace('wss://', 'https://')
    : undefined;
  // Bash wrapper scopes all shell ops to projectDir (see bash/index.ts).
  setProjectDir(projectDir);
  registerAllTools(server, { serverUrl: httpUrl, projectDir, config });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log('MCP server running (stdio)');

  // Cleanup on exit
  const shutdown = (): void => {
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
