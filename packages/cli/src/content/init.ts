import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { AGENTS_FILENAME, CACHE_DIR, CONFIG_FILENAME, OK_DIR } from '../constants.ts';

export const AGENTS_MD_CONTENT = `# .open-knowledge/ — Project Knowledge Base

This directory contains a living knowledge base for this project, maintained by both agents and humans.

## Structure

- \`articles/\` — Canonical knowledge articles grouped by topic
- \`external-sources/\` — Ingested external content (raw reference material)
- \`research/\` — Exploratory research and provisional findings
- \`catalogs/\` — Auto-generated INDEX.md catalogs mirroring the repo structure
- \`cache/\` — Derived data (gitignored)

## Navigation

1. **Start with catalogs** — Read \`.open-knowledge/catalogs/INDEX.md\` for a top-level overview of all tracked content. Follow links to subdirectory catalogs for deeper navigation.
2. **Search with grep** — Use grep/ripgrep to find specific topics across all content
3. **Read specific files** — Once you find the right article, read it for full context

Catalogs are auto-generated inside \`.open-knowledge/catalogs/\` and mirror the project's directory structure. They are never written into the source tree.

## Content Lifecycle

1. **External sources** (\`external-sources/\`) — Raw content fetched from URLs, PDFs, or other documents. No analysis, just preservation.
2. **Research** (\`research/\`) — Analysis and synthesis of sources. Provisional findings, trade-offs, open questions.
3. **Articles** (\`articles/\`) — Canonical knowledge. Architecture decisions, processes, how things work. The source of truth.

Knowledge matures through stages: external sources → research → articles.

## Frontmatter Conventions

Every \`.md\` file should have YAML frontmatter:

\`\`\`yaml
---
title: Article Title (required)
description: Brief summary for catalog listings (required)
tags:
  - relevant
  - tags
---
\`\`\`

- \`title\` and \`description\` are required — they appear in catalog listings
- \`tags\` are recommended for discoverability

## Folder Descriptions

To improve catalog navigation, you can set a \`title\` and \`description\` for any directory by editing its mirrored catalog at \`.open-knowledge/catalogs/<dir>/INDEX.md\`. These two frontmatter fields are **sticky** — preserved across catalog rebuilds.

For example, to describe the \`articles/auth/\` folder, edit \`.open-knowledge/catalogs/articles/auth/INDEX.md\`:

\`\`\`yaml
---
title: Authentication
description: How auth works in this codebase — SSO, sessions, tokens.
---
\`\`\`

The rebuild preserves your \`title\` and \`description\` while regenerating the article/subfolder listings.

## Scaffolding (first-time setup)

This directory was scaffolded by running \`open-knowledge init\` (or \`npx @inkeep/open-knowledge init\`) in the project root. That command:

1. Creates the directory layout you're reading this from
2. Writes \`AGENTS.md\`, \`.gitignore\`, and \`config.yml\`
3. Registers the Open Knowledge MCP server in \`.mcp.json\` at the repo root

If you're onboarding a new project and \`.open-knowledge/\` doesn't exist yet, run \`open-knowledge init\` from a terminal.

## MCP Server config

Your \`.mcp.json\` at the repo root should look like this after running \`init\`:

\`\`\`json
{
  "mcpServers": {
    "open-knowledge": {
      "command": "npx",
      "args": ["@inkeep/open-knowledge", "mcp"]
    }
  }
}
\`\`\`

## Workflow Tools (MCP)

The MCP server exposes three tools that codify the main workflows. Each tool returns instructional text that guides the agent through the workflow — all real work (reads, edits, fetches) happens via the agent's native tools. The tools are:

- **\`init-content\`** — Bootstrap this knowledge base by reading the codebase and writing initial knowledge articles grouped by topic. Use when setting up for the first time or onboarding to a new codebase.
- **\`ingest\`** — Capture an external source (URL or local file) as raw reference material in \`external-sources/\`. Use when the user shares a URL or document to preserve. Raw preservation only; no analysis.
- **\`research\`** — Gather sources via \`ingest\` and write provisional findings to \`research/\`. Use when researching a topic, comparing alternatives, or exploring a decision space. Non-canonical until promoted to \`articles/\`.

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
# project root.
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

export const CLAUDE_MD_SECTION = `## .open-knowledge/ — Project Knowledge Base

This repo has a living knowledge base in \`.open-knowledge/\`.

- Read \`.open-knowledge/catalogs/INDEX.md\` for a navigable overview of all tracked content
- After doing significant work, update or create relevant knowledge articles
- Knowledge articles live in \`.open-knowledge/articles/\` grouped by topic
- External sources live in \`.open-knowledge/external-sources/\`
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

/** Default content directories scaffolded inside .open-knowledge/. */
const SCAFFOLD_DIRS = ['articles', 'external-sources', 'research'];

export function initContent(projectDir: string): { created: string[]; skipped: string[] } {
  const okDir = resolve(projectDir, OK_DIR);
  const created: string[] = [];
  const skipped: string[] = [];

  // Create directories: open-knowledge root, cache, and default content dirs
  mkdirSync(okDir, { recursive: true });
  mkdirSync(join(okDir, CACHE_DIR), { recursive: true });
  for (const dir of SCAFFOLD_DIRS) {
    mkdirSync(join(okDir, dir), { recursive: true });
  }

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
