---
name: init-wiki
description: Bootstrap a .openknowledge/ project wiki by reading the codebase and writing knowledge articles grouped by topic. Use when setting up a wiki for the first time or when .openknowledge/ exists but is empty.
---

# /init-wiki — Bootstrap Project Wiki

Bootstrap a `.openknowledge/` project wiki by reading the codebase and writing initial knowledge articles.

## When to use

- First time setting up a project wiki in a repo
- When `.openknowledge/` doesn't exist or is empty
- When onboarding to a new codebase and want to capture initial understanding for future agent sessions

## Steps

### 1. Scaffold the wiki structure

If `.openknowledge/` doesn't exist, call the `init` MCP tool (from the `openknowledge` MCP server) to create it. This produces:

- `.openknowledge/articles/` — canonical knowledge articles
- `.openknowledge/external-sources/` — raw ingested content
- `.openknowledge/research/` — provisional findings
- `.openknowledge/cache/` — derived data (gitignored)
- `.openknowledge/config.yaml` — wiki configuration
- `.openknowledge/AGENTS.md` — conventions for any agent
- Starter `INDEX.md` catalogs at each level

If the MCP server isn't available, create the structure manually following the layout in `.openknowledge/AGENTS.md`.

### 2. Read the codebase systematically

Explore the project to build understanding before writing anything:

1. **Start broad** — Read `README.md`, `CLAUDE.md`, `package.json`, and any existing documentation directories
2. **Map the structure** — Use `ls`/`find`/`glob` to understand directory layout and naming conventions
3. **Read key files** — Entry points, config files, core modules, type definitions, schema files
4. **Check existing docs** — `specs/`, `docs/`, `ARCHITECTURE.md`, or any prose documentation
5. **Review recent history** — `git log --oneline -30` for recent decisions and direction

Don't rush this phase. The quality of articles depends on the quality of understanding.

### 3. Synthesize knowledge articles

Write articles grouped by topic in `.openknowledge/articles/`. For each article:

- **One topic per article** — Keep articles focused (e.g., "Auth Architecture", not "Everything About The Backend")
- **Use subdirectories** for related topics: `articles/infrastructure/`, `articles/auth/`, `articles/data-model/`
- **Add proper frontmatter**:

```yaml
---
title: Article Title
description: One-line summary that will appear in INDEX.md catalogs
tags:
  - relevant
  - tags
---
```

- **Write for future agents** — Explain the *why* and *how things connect*, not just *what exists*. Source code already says what exists.
- **Keep articles concise** — 100-300 lines is a good target. Split larger topics into multiple articles.
- **Link to source code** by file path when helpful, but don't duplicate code into articles.

### 4. Suggested starting topics

Depending on the project, consider articles covering:

- **Architecture overview** — High-level system design, key components, how they connect
- **Data model** — Core entities, relationships, database schema
- **API surface** — Endpoints, protocols, authentication model
- **Deploy & infrastructure** — How to deploy, CI/CD, environments
- **Development workflow** — How to run locally, test conventions, contribution flow
- **Key decisions** — Architecture decisions and their rationale (the "why")
- **Domain concepts** — Business domain terms and their meaning in code

### 5. Verify

- Catalogs (`INDEX.md` files) auto-regenerate as you write articles — the file watcher picks up changes
- Read `.openknowledge/INDEX.md` to verify the wiki is navigable
- Ensure every article has frontmatter with at minimum `title` and `description`
- Commit the generated wiki files to git alongside your work

## Non-goals

- Don't produce a file-by-file code index — the agent reads source code directly when needed
- Don't copy source code into articles — link by path
- Don't write articles for things that change often (dependency versions, file counts); focus on stable understanding
