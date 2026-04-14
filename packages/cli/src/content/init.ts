import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { AGENTS_FILENAME, CACHE_DIR, CONFIG_FILENAME, OK_DIR } from '../constants.ts';

export const OK_MARKER_BEGIN = '<!-- open-knowledge:begin -->';
export const OK_MARKER_END = '<!-- open-knowledge:end -->';
const OK_MARKER_RE = /<!-- open-knowledge:begin -->[\s\S]*?<!-- open-knowledge:end -->/;

export const AGENTS_MD_CONTENT = `# .open-knowledge/ — Open Knowledge config

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

Every \`.md\` file that's part of the knowledge base should have YAML frontmatter:

\`\`\`yaml
---
title: Article Title (required)
description: Brief summary (required)
tags:
  - relevant
  - tags
---
\`\`\`

Per-file frontmatter is the **only** authored metadata surface. Folder-level frontmatter (the old \`INDEX.md\` catalog files) was removed — folder overviews are generated on demand from per-file frontmatter via \`exec("ls <dir>")\`.

## Scaffolding (first-time setup)

This directory was scaffolded by running \`open-knowledge init\` (or \`npx @inkeep/open-knowledge init\`) in the project root. That command:

1. Creates \`.open-knowledge/\` (config-only — no content subdirs)
2. Writes \`AGENTS.md\`, \`.gitignore\`, and \`config.yml\`
3. Registers the Open Knowledge MCP server in \`.mcp.json\` at the repo root

If you're onboarding a new project and \`.open-knowledge/\` doesn't exist yet, run \`open-knowledge init\` from a terminal.

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
#     -> ~/.open-knowledge/config.yml         (user defaults)
#     -> ./.open-knowledge/config.yml         (this file)
#
# Schema reference: packages/cli/src/config/schema.ts


# --- Content ---------------------------------------------------------------
# dir: where the CRDT editor reads/writes documents. Relative to the project
# root (the directory containing .open-knowledge/), NOT to this file.
#
# include/exclude: glob patterns for tracked content files. Relative to the
# content directory (content.dir).
#
# content:
#   dir: .
#   include:
#     - "**/*.md"
#   exclude: []


# --- Persistence -----------------------------------------------------------
# How aggressively CRDT updates are flushed to disk.
# persistence:
#   debounceMs: 2000
#   maxDebounceMs: 10000
`;

export const CLAUDE_MD_SECTION = `${OK_MARKER_BEGIN}
## Open Knowledge

This repo uses Open Knowledge — agent-collaborative wiki tooling exposed via MCP. The scope of tracked content is \`.open-knowledge/config.yml\` (default: every \`**/*.md\` under the repo root).

**Reading (wiki markdown).** Prefer the \`exec\` MCP tool over native \`Read\` / \`Grep\` / \`Glob\`. \`exec\` runs \`cat\` / \`ls\` / \`grep\` / \`find\` / \`head\` / \`tail\` / \`wc\` / \`sort\` / \`uniq\` / \`cut\` with pipes, and every returned path is enriched with frontmatter (title, description, tags), backlink count, and recent shadow-repo activity with agent-vs-human attribution. One tool covers read/list/search with attribution that native tools don't see. Examples: \`exec("cat docs/auth.md")\`, \`exec("ls articles/")\`, \`exec("grep -rn oauth . | head -5")\`.

**Writing (wiki markdown).** Route all edits through \`write_document\` / \`edit_document\`. Native \`Edit\` / \`sed\` land as anonymous \`upstream\` imports — you lose agent attribution in the shadow-repo log.

**Linking.** When authoring, link liberally with \`[[Page Title]]\` wiki-links. Redlinks are fine — they signal "this should exist." Every noun-phrase naming another document should be a link. Backlink density is how this knowledge base stays navigable for the next agent.

**Non-wiki code (\`.ts\`, \`.py\`, configs, etc.).** Keep using native \`Read\` / \`Edit\` / \`Grep\` / \`Bash\`. The MCP tools are for markdown in \`content.include\`.
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
 * Append (or replace, with --force) the Open Knowledge section in the agent
 * instruction files at the project root. Handles CLAUDE.md + AGENTS.md,
 * deduping by realpath so a symlink (e.g. CLAUDE.md -> AGENTS.md) isn't
 * written twice.
 *
 * Behavior per file:
 *   - file missing            -> create it containing just the section
 *   - file exists, no marker  -> append the section
 *   - file exists, has marker -> skip unless `force`, else replace between markers
 */
export function upsertRootInstructions(
  projectDir: string,
  force: boolean,
): RootInstructionResult[] {
  const files = ['CLAUDE.md', AGENTS_FILENAME];
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
  { name: '.gitignore', content: `${CACHE_DIR}/\n` },
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
