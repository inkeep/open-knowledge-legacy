import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { generateCatalog, generateRootCatalog } from './catalog.ts';

export const AGENTS_MD_CONTENT = `# .open-knowledge/ — Project Wiki

This directory contains a living knowledge base for this project, maintained by both agents and humans.

## Structure

- \`articles/\` — Canonical knowledge articles grouped by topic
- \`external-sources/\` — Ingested external content (raw reference material)
- \`research/\` — Exploratory research and provisional findings
- \`cache/\` — Derived data (gitignored)

## Navigation

1. **Start with INDEX.md** — Every directory has an auto-generated \`INDEX.md\` catalog listing all articles and subfolders
2. **Search with grep** — Use grep/ripgrep to find specific topics across all wiki content
3. **Read specific files** — Once you find the right article, read it for full context

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

- \`title\` and \`description\` are required — they appear in INDEX.md catalogs
- \`tags\` are recommended for discoverability

## Folder Descriptions

Every subfolder in the wiki should have a \`title\` and \`description\` in its \`INDEX.md\` frontmatter. These appear in the parent folder's catalog so readers can see what's inside a folder without opening it.

**When to set them:** at the same time you create the first article in a new subfolder. If you're creating \`articles/auth/sso-migration.md\`, also create (or edit) \`articles/auth/INDEX.md\` with:

\`\`\`yaml
---
title: Authentication
description: How auth works in this codebase — SSO, sessions, tokens.
---
\`\`\`

**When to re-check them:** every time you *create or edit* an article, glance at the containing folder's \`INDEX.md\` and decide whether the folder's \`title\` or \`description\` needs to be updated. If the new article expands the folder's scope (e.g., you added an RBAC article to a folder currently described as "SSO and sessions"), update the description to match. A stale folder description is worse than no description — it gives future agents a misleading map of the wiki. The check is cheap: one read, usually no edit.

**What's editable in \`INDEX.md\`:** only the \`title\` and \`description\` frontmatter fields. These are **sticky** — preserved verbatim across every catalog regeneration. Everything else in an \`INDEX.md\` file is auto-generated and will be overwritten on the next rebuild:

| Field / Section | Editable? |
|---|---|
| \`title\` (frontmatter) | ✅ sticky |
| \`description\` (frontmatter) | ✅ sticky |
| \`generated: true\` | ❌ auto |
| \`schema_version: 1\` | ❌ auto |
| \`## Articles\` body | ❌ auto |
| \`## Subfolders\` body | ❌ auto |

**When to update them:** if a folder's purpose changes, edit its \`INDEX.md\` frontmatter. The change propagates to the parent catalog on the next rebuild (which fires automatically because the watcher picks up \`INDEX.md\` edits too).

**Do not put free-form prose in an \`INDEX.md\` body** — it will be clobbered. If a folder needs a longer overview than the \`description\` field supports, write a regular article (e.g., \`articles/auth/overview.md\`) and reference it from the folder description.

## Scaffolding this wiki (first-time setup)

This wiki directory was almost certainly scaffolded by running \`open-knowledge init\` (or \`npx @inkeep/open-knowledge init\`) in the project root. That same command:

1. Creates the directory layout you're reading this from
2. Writes \`AGENTS.md\`, \`.gitignore\`, and starter \`INDEX.md\` catalogs
3. Registers the Open Knowledge MCP server in \`.mcp.json\` at the repo root so your MCP client (Claude Code, Cursor, Windsurf, Codex) can pick it up

If you're onboarding a new project and \`.open-knowledge/\` doesn't exist yet, run \`open-knowledge init\` from a terminal. The CLI init is the *only* supported way to scaffold — the MCP server deliberately exposes no \`init\` tool because scaffolding has to happen before any MCP server is wired up.

## MCP Server config

Your \`.mcp.json\` at the repo root should look like this after running \`init\`:

\`\`\`json
{
  "mcpServers": {
    "openknowledge": {
      "command": "npx",
      "args": ["@inkeep/open-knowledge", "mcp"]
    }
  }
}
\`\`\`

## Workflow Prompts (MCP)

The MCP server exposes three prompts that codify the main workflows. Each MCP client surfaces them with its own UX (Claude Code shows them in the slash menu as \`mcp__openknowledge__<name>\`; Cursor, Windsurf, and other MCP clients use their equivalents), but the canonical names are:

- **\`mcp__openknowledge__init-wiki\`** — Bootstrap this wiki by reading the codebase and writing initial knowledge articles grouped by topic. Run this once when setting up a new project.
- **\`mcp__openknowledge__ingest\`** — Capture an external source (URL or local file) as raw reference material in \`external-sources/\`. Raw preservation only; no analysis.
- **\`mcp__openknowledge__research\`** — Gather sources via \`ingest\` and write provisional findings to \`research/\`. Non-canonical until promoted to \`articles/\`.

These prompts are discovered via the standard MCP \`prompts/list\` handshake — no client-specific installation step is needed. When referring to them in docs or conversation, use the canonical \`mcp__openknowledge__<name>\` form so they're unambiguous across clients.
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
#     -> ENV vars
#     -> CLI flags
#
# Schema reference: packages/cli/src/config/schema.ts


# --- Content ---------------------------------------------------------------
# Where editable markdown content lives. Path is relative to the workspace
# root (the directory containing .open-knowledge/), NOT to this file.
# content:
#   dir: ./content
#   exclude: []


# --- Server ----------------------------------------------------------------
# Hocuspocus collaboration server + static React app.
# server:
#   port: 3000
#   host: localhost


# --- Git -------------------------------------------------------------------
# Auto-commit edits to a working ref so every save is reversible.
# git:
#   enabled: true
#   autosave: true
#   commitDebounceMs: 30000
#   wipRef: refs/wip/main


# --- Persistence -----------------------------------------------------------
# How aggressively CRDT updates are flushed to disk.
# persistence:
#   debounceMs: 2000
#   maxDebounceMs: 10000


# --- Editor ----------------------------------------------------------------
# Default mode for the React editor app.
# editor:
#   defaultMode: wysiwyg   # one of: wysiwyg, source


# --- Wiki ------------------------------------------------------------------
# Subdirectory layout inside .open-knowledge/. Paths are relative to this
# directory. Usually leave these alone — the init command and the MCP server
# both assume the defaults.
# wiki:
#   articles_path: ./articles
#   external_sources_path: ./external-sources
#   research_path: ./research
`;

export const CLAUDE_MD_SECTION = `## .open-knowledge/ — Project Wiki

This repo has a living knowledge base in \`.open-knowledge/\`.

- Read \`INDEX.md\` at any level for navigation
- After doing significant work, update or create relevant wiki articles
- Knowledge articles live in \`.open-knowledge/articles/\` grouped by topic
- External sources live in \`.open-knowledge/external-sources/\`
`;

function writeIfMissing(filePath: string, content: string): boolean {
  if (existsSync(filePath)) return false;
  writeFileSync(filePath, content, 'utf-8');
  return true;
}

export function initWiki(projectDir: string): { created: string[]; skipped: string[] } {
  const okDir = resolve(projectDir, '.open-knowledge');
  const created: string[] = [];
  const skipped: string[] = [];

  const dirs = [
    okDir,
    join(okDir, 'articles'),
    join(okDir, 'external-sources'),
    join(okDir, 'research'),
    join(okDir, 'cache'),
  ];

  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
  }

  // AGENTS.md
  const agentsPath = join(okDir, 'AGENTS.md');
  if (writeIfMissing(agentsPath, AGENTS_MD_CONTENT)) {
    created.push('AGENTS.md');
  } else {
    skipped.push('AGENTS.md');
  }

  // .gitignore for cache/
  const gitignorePath = join(okDir, '.gitignore');
  if (writeIfMissing(gitignorePath, 'cache/\n')) {
    created.push('.gitignore');
  } else {
    skipped.push('.gitignore');
  }

  // config.yml — fully-commented starter so every key is discoverable.
  // The loader treats an empty/all-comments YAML as no-op, so this file is
  // safe to ship as-is — uncommenting a key is the only way it changes
  // runtime behavior.
  const configPath = join(okDir, 'config.yml');
  if (writeIfMissing(configPath, CONFIG_YML_CONTENT)) {
    created.push('config.yml');
  } else {
    skipped.push('config.yml');
  }

  // Section catalogs
  const sectionDirs = [
    {
      path: join(okDir, 'articles'),
      title: 'Knowledge Articles',
      description: 'Architecture, processes, and decisions',
    },
    {
      path: join(okDir, 'external-sources'),
      title: 'External Sources',
      description: 'Ingested external content',
    },
    {
      path: join(okDir, 'research'),
      title: 'Research',
      description: 'Exploratory research and findings',
    },
  ];

  for (const section of sectionDirs) {
    const indexPath = join(section.path, 'INDEX.md');
    const content = generateCatalog(section.path, {
      title: section.title,
      description: section.description,
    });
    if (writeIfMissing(indexPath, content)) {
      created.push(`${section.title}/INDEX.md`);
    } else {
      skipped.push(`${section.title}/INDEX.md`);
    }
  }

  // Root INDEX.md
  const rootIndexPath = join(okDir, 'INDEX.md');
  const rootContent = generateRootCatalog(okDir, {
    sections: [
      { label: 'Knowledge Articles', relativePath: 'articles/INDEX.md' },
      { label: 'External Sources', relativePath: 'external-sources/INDEX.md' },
      { label: 'Research', relativePath: 'research/INDEX.md' },
    ],
  });
  if (writeIfMissing(rootIndexPath, rootContent)) {
    created.push('INDEX.md');
  } else {
    skipped.push('INDEX.md');
  }

  return { created, skipped };
}
