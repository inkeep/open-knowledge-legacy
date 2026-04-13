import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { AGENTS_FILENAME, CACHE_DIR, CONFIG_FILENAME, OK_DIR } from '../constants.ts';

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

export const CLAUDE_MD_SECTION = `## Open Knowledge

This repo is wired up with Open Knowledge — agent-collaborative wiki tooling.

- Use the \`exec\` MCP tool for reading / listing / grepping any markdown in the project. Output includes per-file metadata (title, description, tags) plus recent shadow-repo activity with agent-vs-human attribution and project git history. Example: \`exec("grep -rn oauth .")\`, \`exec("cat <path>.md")\`.
- Wiki content location is configured in \`.open-knowledge/config.yml\` (defaults to the project root with \`**/*.md\`). Read the config to see what's tracked.
- When writing to markdown files that are part of the knowledge base, use the \`write_document\` / \`edit_document\` MCP tools so the edit is attributed to your agent identity in the shadow-repo log. Native \`Edit\` / \`sed\` writes land as anonymous \`upstream\` imports.
`;

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
