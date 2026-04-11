# .open-knowledge/ — Project Knowledge Base

This directory contains a living knowledge base for this project, maintained by both agents and humans.

## Structure

- `articles/` — Canonical knowledge articles grouped by topic
- `external-sources/` — Ingested external content (raw reference material)
- `research/` — Exploratory research and provisional findings
- `cache/` — Derived data (gitignored)

## Navigation

1. **Start with INDEX.md** — Every directory has an auto-generated `INDEX.md` catalog listing all articles and subfolders
2. **Search with grep** — Use grep/ripgrep to find specific topics across all content
3. **Read specific files** — Once you find the right article, read it for full context

## Content Lifecycle

1. **External sources** (`external-sources/`) — Raw content fetched from URLs, PDFs, or other documents. No analysis, just preservation.
2. **Research** (`research/`) — Analysis and synthesis of sources. Provisional findings, trade-offs, open questions.
3. **Articles** (`articles/`) — Canonical knowledge. Architecture decisions, processes, how things work. The source of truth.

Knowledge matures through stages: external sources → research → articles.

## Frontmatter Conventions

Every `.md` file should have YAML frontmatter:

```yaml
---
title: Article Title (required)
description: Brief summary for catalog listings (required)
tags:
  - relevant
  - tags
---
```

- `title` and `description` are required — they appear in INDEX.md catalogs
- `tags` are recommended for discoverability

## Folder Descriptions

Every subfolder should have a `title` and `description` in its `INDEX.md` frontmatter. These appear in the parent folder's catalog so readers can see what's inside a folder without opening it.

**When to set them:** at the same time you create the first article in a new subfolder. If you're creating `articles/auth/sso-migration.md`, also create (or edit) `articles/auth/INDEX.md` with:

```yaml
---
title: Authentication
description: How auth works in this codebase — SSO, sessions, tokens.
---
```

**When to re-check them:** every time you *create or edit* an article, glance at the containing folder's `INDEX.md` and decide whether the folder's `title` or `description` needs to be updated. If the new article expands the folder's scope (e.g., you added an RBAC article to a folder currently described as "SSO and sessions"), update the description to match. A stale folder description is worse than no description — it gives future agents a misleading map. The check is cheap: one read, usually no edit.

**What's editable in `INDEX.md`:** only the `title` and `description` frontmatter fields. These are **sticky** — preserved verbatim across every catalog regeneration. Everything else in an `INDEX.md` file is auto-generated and will be overwritten on the next rebuild:

| Field / Section | Editable? |
|---|---|
| `title` (frontmatter) | ✅ sticky |
| `description` (frontmatter) | ✅ sticky |
| `generated: true` | ❌ auto |
| `schema_version: 1` | ❌ auto |
| `## Articles` body | ❌ auto |
| `## Subfolders` body | ❌ auto |

**When to update them:** if a folder's purpose changes, edit its `INDEX.md` frontmatter. The change propagates to the parent catalog on the next rebuild (which fires automatically because the watcher picks up `INDEX.md` edits too).

**Do not put free-form prose in an `INDEX.md` body** — it will be clobbered. If a folder needs a longer overview than the `description` field supports, write a regular article (e.g., `articles/auth/overview.md`) and reference it from the folder description.

## Scaffolding (first-time setup)

This directory was almost certainly scaffolded by running `open-knowledge init` (or `npx @inkeep/open-knowledge init`) in the project root. That same command:

1. Creates the directory layout you're reading this from
2. Writes `AGENTS.md`, `.gitignore`, and starter `INDEX.md` catalogs
3. Registers the Open Knowledge MCP server in `.mcp.json` at the repo root so your MCP client (Claude Code, Cursor, Windsurf, Codex) can pick it up

If you're onboarding a new project and `.open-knowledge/` doesn't exist yet, run `open-knowledge init` from a terminal. The CLI init is the *only* supported way to scaffold — the MCP server deliberately exposes no `init` tool because scaffolding has to happen before any MCP server is wired up.

## MCP Server config

Your `.mcp.json` at the repo root should look like this after running `init`:

```json
{
  "mcpServers": {
    "open-knowledge": {
      "command": "npx",
      "args": ["@inkeep/open-knowledge", "mcp"]
    }
  }
}
```

## Workflow Tools (MCP)

The MCP server exposes three tools that codify the main workflows. Each tool returns instructional text that guides the agent through the workflow — all real work (reads, edits, fetches) happens via the agent's native tools. The tools are:

- **`init-content`** — Bootstrap this knowledge base by reading the codebase and writing initial knowledge articles grouped by topic. Use when setting up for the first time or onboarding to a new codebase.
- **`ingest`** — Capture an external source (URL or local file) as raw reference material in `external-sources/`. Use when the user shares a URL or document to preserve. Raw preservation only; no analysis.
- **`research`** — Gather sources via `ingest` and write provisional findings to `research/`. Use when researching a topic, comparing alternatives, or exploring a decision space. Non-canonical until promoted to `articles/`.

These tools are discovered via the standard MCP `tools/list` handshake and work in any MCP client (Claude Code, Cursor, Windsurf, Codex, etc.).
