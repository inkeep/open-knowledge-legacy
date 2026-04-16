# .open-knowledge/ — Open Knowledge config

This directory holds Open Knowledge's configuration. **Which paths are Open Knowledge documents** is defined **only** by `content` in YAML: `content.dir` (root for all relative paths), `content.include` (globs that **add** files), and `content.exclude` (globs that **remove** files). Read `config.yml` here plus optional `~/.open-knowledge/config.yml` — CLI/env can override per the normal loader. `.gitignore` still hides paths.

**Defaults:** `content.dir` is usually `.` and `content.include` is `**/*.md` + `**/*.mdx` — so unless the project narrowed those globs, essentially **every** `.md` / `.mdx` under the content directory counts (including `specs/`, `reports/`, `docs/`, …). When MCP is connected, the server's instructions echo the **resolved** `dir` / `include` / `exclude` — use that table and this YAML as two views of the same path contract.

## What's in here

- `config.yml` — workspace config (content dir, include/exclude globs, MCP tool settings)
- `AGENTS.md` — this file
- `cache/` — derived data (gitignored)

No scaffolded content directories. Organize knowledge wherever makes sense for the project. `exec("ls <dir>")` + per-file enrichment gives you a live overview; there's no INDEX.md catalog to maintain.

## Navigation — Open Knowledge reads are **mandatory** for `.md` / `.mdx` (when MCP is wired)

**STOP:** If Open Knowledge MCP is configured for this repo (e.g. root `.mcp.json`), you **must not** use host `Read` / `Grep` / `Glob` on **`.md` or `.mdx` files** under `content.dir` that match `content.include` (under defaults, essentially **all** such files). Same rule class as writes: native tools skip enrichment and shadow attribution.

**MCP in your client:** Different products expose MCP differently — first-class tools, nested under a server name from `tools/list`, or a generic "invoke MCP tool" flow. **If Open Knowledge is configured**, call this server's `exec` / `search` / `read_document` using **your host's documented MCP invocation** — not native `Grep` on those markdown files. Indirect wiring still counts. **Do not** skip MCP for `specs/`, `reports/`, etc. For **source code** (`.ts`, `package.json`, …), use native `Read` / `Grep` / `Glob`.

**Escape hatch:** Native reads on `.md` / `.mdx` **only** when no Open Knowledge MCP server is registered, or after an MCP **attempt** failed — say `Open Knowledge MCP unavailable:`. Not when you have not tried MCP.

Examples (adapt paths to this project's layout):

- Read a file: `exec("cat <path>.md")` — contents + full rich enrichment
- List a directory: `exec("ls <dir>")` — names + slim per-file enrichment
- Search: `exec("grep -rn <term> <dir> | head -5")` — matches + enrichment on matched files

Typed tools (`read_document`, `search`, `list_documents`, etc.) remain available as "Typed call sites (advanced)" — use them when you need the typed `structuredContent` shape for programmatic parsing.

## Suggested lifecycle (optional pattern)

Projects that want an explicit knowledge-maturation flow can organize as three tiers **relative to the content directory** — create the subfolders only when you need them:

1. **External sources** (e.g., `external-sources/` under `content.dir`) — raw content fetched from URLs, PDFs. No analysis, just preservation. Use the `ingest` MCP tool.
2. **Research** (e.g., `research/` under `content.dir`) — analysis and synthesis. Provisional findings, trade-offs, open questions. Use the `research` MCP tool.
3. **Articles** (e.g., `articles/` under `content.dir`) — canonical knowledge. Use the `consolidate` MCP tool to promote research → articles once decisions are made.

This is a pattern, not a requirement. Projects with existing layouts (`specs/`, `reports/`, `docs/`, etc.) use the same rule: under default globs, their `.md` / `.mdx` files are Open Knowledge documents.

## Linking — use `[[wiki-links]]` aggressively

**When writing or editing any document, link liberally to every other document it relates to.** Open Knowledge's value compounds with link density: backlinks surface cross-document context in every read, graph queries (`get_hubs` / `get_orphans`) reveal structure, and agents navigate by following links.

- Every noun-phrase that names another document is a link. Redlinks are fine — they signal "this should exist."
- Prefer `[[Page]]` over Markdown `[text](./page.md)` for other Open Knowledge docs.

## Frontmatter Conventions

Every Open Knowledge `.md` / `.mdx` file should have YAML frontmatter:

```yaml
---
title: Article Title (required)
description: Brief summary (required)
tags:
  - relevant
  - tags
---
```

Per-file frontmatter is the **only** authored metadata surface. Folder-level frontmatter (the old `INDEX.md` catalog files) was removed — folder overviews are generated on demand from per-file frontmatter via `exec("ls <dir>")`.

## Scaffolding (first-time setup)

This directory was scaffolded by running `open-knowledge init` (or `npx @inkeep/open-knowledge init`) in the project root. That command:

1. Creates `.open-knowledge/` (config-only — no content subdirs)
2. Writes `AGENTS.md`, `.gitignore`, and `config.yml`
3. Registers the Open Knowledge MCP server in `.mcp.json` at the repo root

If you're onboarding a new project and `.open-knowledge/` doesn't exist yet, run `open-knowledge init` from a terminal.

## Tools

- **`exec`** — primary read surface (cat / ls / grep / find / pipes) with enriched output
- **`init-content`** — bootstrap this knowledge base from the codebase
- **`ingest`** — capture an external source as raw reference material
- **`research`** — gather sources + write provisional findings
- **`consolidate`** — promote research into canonical articles
- **Writes** via `write_document` / `edit_document` — route through the server so shadow-repo attribution (agent vs human) is captured
- **Graph queries** via `get_backlinks`, `get_forward_links`, `get_orphans`, `get_hubs`

These tools are discovered via the standard MCP `tools/list` handshake. Each agent product wires MCP differently — see the root **Open Knowledge** section in `AGENTS.md`.
