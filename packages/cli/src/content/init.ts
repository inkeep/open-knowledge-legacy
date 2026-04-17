import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { AGENTS_FILENAME, CACHE_DIR, CONFIG_FILENAME, OK_DIR } from '../constants.ts';

export const OK_MARKER_BEGIN = '<!-- open-knowledge:begin -->';
export const OK_MARKER_END = '<!-- open-knowledge:end -->';
const OK_MARKER_RE = /<!-- open-knowledge:begin -->[\s\S]*?<!-- open-knowledge:end -->/;

export const AGENTS_MD_CONTENT = `# ${OK_DIR}/ — Open Knowledge config

This directory holds Open Knowledge's configuration for this project. It's **not** where content lives — content lives wherever \`content.dir\` + \`content.include\` in \`config.yml\` point. The default is the repo root with \`**/*.md\`, so any markdown file in the project is fair game. Inspect \`config.yml\` for the actual setting.

## What's in here

- \`config.yml\` — workspace config (content dir, include/exclude globs, MCP tool settings)
- \`AGENTS.md\` — this file
- \`cache/\` — derived data (gitignored)

No scaffolded content directories. Organize knowledge wherever makes sense for the project — existing docs trees, topic-grouped subfolders, whatever. \`exec("ls <dir>")\` + per-file enrichment gives you a live overview of any directory on demand; there's no INDEX.md catalog to maintain.

## Navigation — prefer \`exec\` for all reads

\`exec\` is the primary MCP read surface. It runs a read-only bash command (cat, ls, grep, find, head, tail, wc, sort, uniq, cut — pipes OK) and returns raw stdout plus enriched metadata per file: title, description, tags, backlink count, recent shadow-repo activity with agent-vs-human attribution, and project git history.

Examples (adapt paths to this project's layout):

- Read a file: \`exec("cat <path>.md")\` — contents + full rich enrichment
- List a directory: \`exec("ls <dir>")\` — names + slim per-file enrichment
- Search: \`exec("grep -rn <term> <dir> | head -5")\` — matches + enrichment on matched files

Typed tools (\`read_document\`, \`search\`, \`list_documents\`, etc.) remain available as "Typed call sites (advanced)" — use them when you need the typed \`structuredContent\` shape for programmatic parsing.

## Suggested lifecycle (optional pattern)

Projects that want an explicit knowledge-maturation flow can organize as three tiers **relative to the content directory** — create the subfolders only when you need them:

1. **External sources** (e.g., \`external-sources/\` under \`content.dir\`) — raw content fetched from URLs, PDFs. No analysis, just preservation. Use the \`ingest\` MCP tool.
2. **Research** (e.g., \`research/\` under \`content.dir\`) — analysis and synthesis. Provisional findings, trade-offs, open questions. Use the \`research\` MCP tool.
3. **Articles** (e.g., \`articles/\` under \`content.dir\`) — canonical knowledge. Use the \`consolidate\` MCP tool to promote research → articles once decisions are made.

This is a pattern, not a requirement. Projects with existing layouts (\`specs/\`, \`reports/\`, \`docs/\`, etc.) should use those; the lifecycle exists as mental scaffolding, not as enforced filesystem structure.

## Linking — use \`[[wiki-links]]\` aggressively

**When writing or editing any document, link liberally to every other document it relates to.** Open Knowledge's value compounds with link density: backlinks surface cross-document context in every read, graph queries (\`get_hubs\` / \`get_orphans\`) reveal structure, and agents navigate the knowledge base by following links. A document with no outbound links is an island.

**Defaults when writing:**

- Every noun-phrase that names another document is a link. Write \`[[Page Title]]\` instead of plain prose when mentioning concepts, projects, decisions, or entities that have (or should have) their own page. Redlinks are fine — they signal "this should exist."
- Cross-link siblings: when creating a document in a folder, link to the 2–3 most related neighbors.
- Link back to sources instead of re-summarizing — the reader can follow.
- Prefer \`[[Page]]\` over Markdown \`[text](./page.md)\`. Wiki-links resolve by docName and participate in the backlinks index; Markdown links to other wiki files don't.

**Rule of thumb:** if a human reader would want to click a term to learn more, make it a link. Err on the side of too many links.

## Frontmatter Conventions

Open Knowledge has two metadata surfaces that merge at read time:

**Per-file frontmatter.** Every \`.md\` file that's part of the knowledge base should have YAML frontmatter:

\`\`\`yaml
---
title: Article Title (required)
description: Brief summary (required)
tags:
  - relevant
  - tags
---
\`\`\`

**Folder-level defaults via \`config.yml\` \`folders:\`.** Declare per-folder title/description/tags keyed by glob \`match:\` — see \`config.yml\` for the commented example. Rules apply in declaration order (later matches override earlier scalars), tags concat + dedup across all matching rules, and the file's own frontmatter always wins per-scalar. Folder defaults fill in blanks.

Folder metadata lives in \`config.yml\`, **not** in content files — this is intentionally different from the rejected \`INDEX.md\`-inside-content pattern. The merge is computed on every \`exec("ls <dir>")\` / \`read_document\` / \`search\` call and is never written back to disk.

## Scaffolding (first-time setup)

This directory was scaffolded by running \`open-knowledge init\` (or \`npx @inkeep/open-knowledge init\`) in the project root. That command:

1. Creates \`${OK_DIR}/\` (config-only — no content subdirs)
2. Writes \`AGENTS.md\`, \`.gitignore\`, and \`config.yml\`
3. Registers the Open Knowledge MCP server in \`.mcp.json\` at the repo root

If you're onboarding a new project and \`${OK_DIR}/\` doesn't exist yet, run \`open-knowledge init\` from a terminal.

## Tools

- **\`exec\`** — primary read surface (cat / ls / grep / find / pipes) with enriched output
- **\`init-content\`** — bootstrap this knowledge base from the codebase
- **\`ingest\`** — capture an external source as raw reference material
- **\`research\`** — gather sources + write provisional findings
- **\`consolidate\`** — promote research into canonical articles
- **Writes** via \`write_document\` / \`edit_document\` — route through the server so shadow-repo attribution (agent vs human) is captured
- **Graph queries** via \`get_backlinks\`, \`get_forward_links\`, \`get_orphans\`, \`get_hubs\`

These tools are discovered via the standard MCP \`tools/list\` handshake and work in any MCP client (Claude Code, Cursor, Windsurf, Codex, etc.).
`;

export const CONFIG_YML_CONTENT = `# Open Knowledge — workspace configuration
#
# This file overrides built-in defaults for this workspace. Every key below
# is commented out and shows its current default value. Uncomment any key
# to override it.
#
# Precedence (lowest -> highest):
#   Built-in defaults
#     -> ~/${OK_DIR}/config.yml         (user defaults)
#     -> ./${OK_DIR}/config.yml         (this file)
#
# Schema reference: packages/cli/src/config/schema.ts


# --- Content ---------------------------------------------------------------
# dir: where the CRDT editor reads/writes documents. Relative to the project
# root (the directory containing ${OK_DIR}/), NOT to this file.
#
# include/exclude: glob patterns for tracked content files. Relative to the
# content directory (content.dir).
#
# content:
#   dir: .
#   include:
#     - "**/*.md"
#   exclude: []


# --- Server ----------------------------------------------------------------
# HTTP/WebSocket listener for the Hocuspocus server + static React app.
#
# openOnAgentEdit: when true, the browser opens automatically the first time
# an agent writes to the knowledge base in this server session. Debounced to
# one open per boot. Useful for pairing with Claude Code — you see the edit
# land live. Leave false for headless/CI.
#
# server:
#   port: 3000
#   host: localhost
#   openOnAgentEdit: false


# --- Persistence -----------------------------------------------------------
# How aggressively CRDT updates are flushed to disk.
# persistence:
#   debounceMs: 2000
#   maxDebounceMs: 10000


# --- Folders: per-folder frontmatter defaults -------------------------------
#
# TL;DR glob gotcha: \`**\` is ONLY a multi-segment wildcard when it is a
# standalone path segment. \`foo-**\` behaves like \`foo-*\` (single segment, NOT
# descendants). Use \`foo/**\` or \`foo-*/**\` to match descendants.
#
# Declare title/description/tags defaults keyed by glob \`match:\`. Rules merge
# with a file's own frontmatter at read time:
#   - Per scalar (title, description): the FILE wins when declared; folder
#     rule fills in blanks.
#   - Tags: concatenated across ALL matching rules (in declaration order) with
#     file tags last; first-occurrence preserved on dedup.
#   - Evaluation is positional — LATER rules in this array override earlier
#     rules for scalars. Put general rules first, specific rules last.
#
# Picomatch glob cheatsheet:
#   \`match: 'foo'\`         — matches ONLY the folder \`foo\` itself
#   \`match: 'foo/**'\`      — matches \`foo\` AND all descendants (files + dirs)
#   \`match: 'foo-*'\`       — matches \`foo-1\`, \`foo-bar\` (single segment)
#   \`match: 'foo-**'\`      — behaves like \`foo-*\` (NOT multi-segment); see
#                              TL;DR above. Use \`foo-*/**\` if you want
#                              \`foo-X\` plus its descendants.
#
# Example:
# folders:
#   - match: 'specs/**'
#     frontmatter:
#       title: Specifications
#       description: Feature specifications and design documents
#       tags: [spec]
#   - match: 'specs/2026-*/**'
#     frontmatter:
#       title: 2026 Specifications
#       tags: [2026]
`;

/**
 * Shared pre-edit-navigation guidance consumed by both CLAUDE_MD_SECTION
 * (this file) and `buildInstructions` in packages/cli/src/mcp/server.ts.
 *
 * Single source of truth — editing this string updates both consumer
 * surfaces simultaneously, avoiding drift between the CLAUDE.md / AGENTS.md
 * injection and the MCP server's live `instructions` string.
 */
export const PREVIEW_GUIDANCE = `**Preview before edit (REQUIRED).** You MUST follow this sequence every time you call \`write_document\` or \`edit_document\`:
1. Call \`get_preview_url\` to obtain the browser URL for the target doc.
   - If it returns \`null\`, the server is not running. Start it with \`open-knowledge start\` (or \`preview_start\`), then call \`get_preview_url\` again — the server writes a lock file that this tool reads.
   - NEVER guess or manually construct the preview URL — always use the URL returned by \`get_preview_url\`.
2. Open that URL in your preview browser so the user can see the document.
3. Only then call \`write_document\` / \`edit_document\` — the CRDT edit will stream live into the already-open editor.

NEVER call \`write_document\` or \`edit_document\` without first navigating the preview browser to the doc. The user expects to watch every edit land in real time. Write-tool responses include \`previewUrl\` (when resolvable) and a \`warning\` when no client is currently attached to the doc.`;

export const CLAUDE_MD_SECTION = `${OK_MARKER_BEGIN}
## Open Knowledge

This repo uses Open Knowledge — collaborative markdown via MCP. **\`${OK_DIR}/config.yml\`** (with optional \`~/${OK_DIR}/config.yml\`; CLI/env may override) is the **path contract**: \`content.dir\` is the root for relative paths; \`content.include\` lists globs that **add** markdown; \`content.exclude\` lists globs that **remove** paths. Nothing else defines scope — not folder names, not "docs vs code." \`.gitignore\` still applies. When MCP is connected, the server's instructions echo the **resolved** \`dir\` / \`include\` / \`exclude\` for this session — treat that table and the YAML as two views of the same rules.

**Default mental model (no jargon):** unless this project narrowed \`content.include\`, **every \`.md\` and \`.mdx\` under \`content.dir\`** is an Open Knowledge document — including under \`specs/\`, \`reports/\`, \`docs/\`, etc. If \`content.include\` is non-default, read \`config.yml\` once per turn so you do not mis-classify paths.

**STOP — your host's built-in file tools on in-scope \`.md\` / \`.mdx\`.** When this workspace has Open Knowledge MCP configured (for example via root \`.mcp.json\`), you **must not** reach for native tools on in-scope markdown. Same failure mode as native \`Edit\` on them: no frontmatter, no backlinks, no shadow-repo activity, no recent-edit signal. The ban is broader than just \`Read\` / \`Grep\` / \`Glob\` — it names every common rationalization:

- **Native \`Read\` / \`Grep\` / \`Glob\` on in-scope \`.md\` / \`.mdx\`** — the original case.
- **\`Bash ls\` / \`Bash find\` / \`Bash cat\` on dirs containing in-scope markdown** — use \`exec("ls …")\` / \`exec("find … -name '*.md'")\` / \`exec("cat …")\` instead. Native returns bare names; \`exec\` returns frontmatter, backlink counts, and recent-activity per child.
- **Glob patterns that target markdown** (\`**/*.md\`, \`**/SPEC.md\`, or any dir known to be markdown-heavy like \`specs/**\`, \`reports/**\`, \`stories/**\`, \`projects/**\`, \`docs/**\`) — use \`exec\` with \`find\`, or \`list_documents({ dir })\`.
- **Dispatching the Explore / general-purpose subagent for markdown-heavy exploration** — subagents use native \`Read\` / \`Grep\` / \`Glob\` internally and bypass Open Knowledge entirely. Do markdown exploration yourself via \`exec\` / \`search\`. Subagents remain appropriate for **source-code** exploration (\`.ts\`, \`.py\`, configs, etc.).

**MCP wiring varies by client:** Claude Code, Codex, Cursor, Windsurf, VS Code–class clients, and others surface MCP differently — server labels are user-defined; tools may not appear as a top-level symbol named \`exec\`. **If Open Knowledge is registered**, route markdown reads through its \`exec\` / \`search\` / \`read_document\` tools using **your client's documented MCP invocation** (including any generic "call MCP tool" flow). **That counts as available.** Not seeing \`exec\` in a flat tool list is **not** the escape hatch.

**Escape hatch (narrow).** Native \`Read\` / \`Grep\` / \`Glob\` on \`.md\` / \`.mdx\` is allowed **only** when no Open Knowledge MCP server is registered for this project, **or** immediately after you **tried** an MCP call and it failed — then start a user-visible sentence with \`Open Knowledge MCP unavailable:\`. Never use the hatch because you skipped your client's MCP path.

**Reads and searches on markdown:** Open Knowledge \`exec\` (or \`read_document\` / \`search\`) — same payloads whether your client invokes them directly or through MCP. Examples: \`exec("cat docs/auth.md")\`, \`exec("ls reports/")\`, \`exec("grep -rn karpathy specs/ | head -10")\`.

**Listings too.** \`exec("ls <dir>/")\` is how you list a directory — it returns per-child frontmatter, recursive markdown counts, and the most-recently-updated doc per subdir. Plain \`Bash ls\` returns just names.

**Anti-patterns at a glance:**

| Task                             | Don't                        | Do                                              |
| -------------------------------- | ---------------------------- | ----------------------------------------------- |
| List a markdown-heavy dir        | \`Bash: ls specs/\`            | \`exec("ls specs/")\`                             |
| Find all SPEC.md files           | \`Glob: **/SPEC.md\`           | \`exec("find specs -name SPEC.md")\`              |
| Summarize specs across the repo  | \`Agent(Explore): "…"\`        | \`exec("head -25 specs/*/SPEC.md")\` + \`search\`   |
| Search a phrase across markdown  | \`Grep: "pattern" *.md\`       | \`search({ query: "pattern" })\`                  |
| Read an individual spec          | \`Read: specs/foo/SPEC.md\`    | \`read_document({ path: "specs/foo/SPEC.md" })\`  |

**Source code and everything else** (\`.ts\`, \`.py\`, \`package.json\`, …): native \`Read\` / \`Grep\` / \`Glob\`.

**Writing.** Edits to in-scope \`.md\` / \`.mdx\` go through \`write_document\` / \`edit_document\` only. Native \`Edit\` / \`sed\` land as anonymous \`upstream\` imports — you lose agent attribution in the shadow repo.

${PREVIEW_GUIDANCE}

**No screenshots after edits.** Do NOT take \`preview_screenshot\` after every \`edit_document\` / \`write_document\`. Trust the CRDT tool response as confirmation the edit landed. Only screenshot when debugging a visual issue or when explicitly asked.

**Linking.** When authoring, link liberally with \`[[Page Title]]\` wiki-links. Redlinks are fine — they signal "this should exist." Every noun-phrase naming another document should be a link. Backlink density is how this knowledge base stays navigable for the next agent.

**Cadence — maintain hubs as you go.** When you create or edit a child doc in a folder that has a hub doc (\`INDEX.md\`, \`README.md\`, \`REPORT.md\`, \`SPEC.md\`, or a file whose name matches the folder name — e.g. \`reports/r1/r1.md\`), update the hub to reflect the change before the next child. Interleaved child → hub → child → hub makes the hub the live progress bar and the browser-based editor follows your focus cleanly. Orphan writes get a soft hint in the \`write_document\` response pointing to the likely hub.

**Server must be running.** If \`write_document\` or \`edit_document\` returns a "Hocuspocus server is not running" error, start it with \`open-knowledge start\` (via Bash) and retry. NEVER fall back to native \`Edit\` / \`Write\` for in-scope markdown — always use the MCP write tools so edits go through the CRDT layer with proper attribution.

**Non-markdown files.** Use native \`Read\` / \`Edit\` / \`Grep\` / \`Bash\` for source code, configs, and anything outside the path contract in \`config.yml\`: under \`content.dir\`, matching \`content.include\`, not removed by \`content.exclude\` or \`.gitignore\`.
${OK_MARKER_END}`;

export type RootInstructionAction =
  | 'created'
  | 'appended'
  | 'replaced'
  | 'skipped-existing'
  | 'skipped-symlink';

export interface RootInstructionResult {
  file: string;
  path: string;
  action: RootInstructionAction;
}

/**
 * Append (or replace, with --force) the Open Knowledge section in the
 * root AGENTS.md — the tool-agnostic agent instruction file.
 *
 * Behavior per file:
 *   - file missing            -> create it containing just the section
 *   - file exists, no marker  -> append the section
 *   - file exists, has marker -> skip unless `force`, else replace between markers
 */
export function upsertRootInstructions(
  projectDir: string,
  force: boolean,
  extraFiles?: string[],
): RootInstructionResult[] {
  const files = [AGENTS_FILENAME, ...(extraFiles ?? [])];
  const seenCanonical = new Set<string>();
  const results: RootInstructionResult[] = [];

  for (const name of files) {
    const path = join(projectDir, name);
    const exists = existsSync(path);
    const canonical = exists ? realpathSync(path) : path;

    if (seenCanonical.has(canonical)) {
      results.push({ file: name, path, action: 'skipped-symlink' });
      continue;
    }
    seenCanonical.add(canonical);

    if (!exists) {
      writeFileSync(path, `${CLAUDE_MD_SECTION}\n`, 'utf-8');
      results.push({ file: name, path, action: 'created' });
      continue;
    }

    const existing = readFileSync(path, 'utf-8');
    const hasMarker = OK_MARKER_RE.test(existing);

    if (hasMarker && !force) {
      results.push({ file: name, path, action: 'skipped-existing' });
      continue;
    }

    if (hasMarker) {
      const replaced = existing.replace(OK_MARKER_RE, CLAUDE_MD_SECTION);
      writeFileSync(path, replaced, 'utf-8');
      results.push({ file: name, path, action: 'replaced' });
      continue;
    }

    // Normalize trailing newlines so the inserted section always has one
    // blank line between it and prior content, regardless of how the host
    // file was terminated on disk.
    const trimmed = existing.replace(/\n*$/, '');
    writeFileSync(path, `${trimmed}\n\n${CLAUDE_MD_SECTION}\n`, 'utf-8');
    results.push({ file: name, path, action: 'appended' });
  }

  return results;
}

function writeIfMissing(filePath: string, content: string): boolean {
  if (existsSync(filePath)) return false;
  writeFileSync(filePath, content, 'utf-8');
  return true;
}

/** Static files scaffolded into the open-knowledge directory. */
const SCAFFOLD_FILES: Array<{ name: string; content: string }> = [
  { name: AGENTS_FILENAME, content: AGENTS_MD_CONTENT },
  { name: '.gitignore', content: `${CACHE_DIR}/\nserver.lock\nui.lock\n` },
  { name: CONFIG_FILENAME, content: CONFIG_YML_CONTENT },
];

export function initContent(projectDir: string): { created: string[]; skipped: string[] } {
  const okDir = resolve(projectDir, OK_DIR);
  const created: string[] = [];
  const skipped: string[] = [];

  // Create .open-knowledge/ itself + the cache/ subdir. No scaffold content dirs —
  // content lives wherever config.content.dir points (project root by default).
  mkdirSync(okDir, { recursive: true });
  mkdirSync(join(okDir, CACHE_DIR), { recursive: true });

  // Write scaffold files (skip if already exist)
  for (const file of SCAFFOLD_FILES) {
    if (writeIfMissing(join(okDir, file.name), file.content)) {
      created.push(file.name);
    } else {
      skipped.push(file.name);
    }
  }

  return { created, skipped };
}
