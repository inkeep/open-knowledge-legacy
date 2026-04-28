---
title: Current System Surfaces For Static Publishing
description: Code findings about CLI, content scope, server APIs, core markdown rendering, and app/docs surfaces relevant to static-site publishing.
created: 2026-04-28
last-updated: 2026-04-28
---

# Current System Surfaces For Static Publishing

## Findings

### CLI command surface

Confidence: CONFIRMED

`packages/cli/package.json` publishes the package as `@inkeep/open-knowledge`, exposes the `open-knowledge` and `ok` bins, and builds the CLI plus bundled app/skill/notices assets.

`packages/cli/src/cli.ts` uses Commander and currently registers command groups including `start`, `mcp`, `init`, `seed`, `install-skill`, `preview`, `ui`, `stop`, `clean`, `status`, `auth`, `clone`, `sync`, `push`, and `pull`.

Implication: a `publish` command group fits the existing public CLI surface and can share config resolution through the same preAction hook.

### Content scope configuration

Confidence: CONFIRMED

`packages/cli/src/config/schema.ts` defines `content.dir`, `content.include`, and `content.exclude`. Defaults are `dir: "."`, `include: ["**/*.md", "**/*.mdx"]`, and `exclude: []`.

`packages/server/src/content-filter.ts` combines include/exclude config, `.gitignore`, built-in skipped directories, and sibling asset admission for directories that contain included markdown.

Implication: publishing should reuse the content filter semantics or explain any intentional divergence.

### Server document and graph APIs

Confidence: CONFIRMED

`packages/server/src/api-extension.ts` exposes handlers for document reads, document lists, backlinks, backlink counts, forward links, link graph, orphans, hubs, dead links, headings, create-page, rename, history, diff, rollback, server-info, seed, and local operations.

The document list handler reads from the watcher's in-memory file index rather than scanning the filesystem on request. It also includes alias entries for symlinked files.

Implication: a UI-triggered publish flow can reuse existing server state, while a CLI-only build may need a shared direct reader to avoid requiring a running server.

### Markdown to HTML support

Confidence: CONFIRMED

`packages/core/src/index.ts` exports `MarkdownManager`, `markdownToHtml`, and `mdastToHtml`.

`packages/core/src/markdown/mdast-to-html.ts` parses markdown with remark-parse, remark-frontmatter, an MDX-agnostic plugin, GFM, and wiki-link micromark, then renders via remark-rehype and rehype-stringify. It strips unsafe URL schemes from URL attributes.

Important caveat: the file describes this as shared mdast-to-HTML conversion for the canonical clipboard pipeline, not as a full-page static-site renderer.

Implication: it is likely reusable for page body rendering but needs a publishing-specific review for heading IDs, table/code styling hooks, raw HTML policy, wiki-link URL rewriting, and asset path rewriting.

### Existing docs app precedent

Confidence: CONFIRMED

`docs/package.json` defines a private Next/Fumadocs docs site with `next`, `fumadocs-core`, `fumadocs-mdx`, `fumadocs-ui`, React 19, Mermaid, and related docs dependencies.

`docs/source.config.ts` defines Fumadocs docs content from the `content` directory and extends frontmatter with optional `sidebarTitle` and `keywords`.

Implication: the repo has working docs-site product prior art, but it is a private docs application with its own content schema and should not be assumed to accept arbitrary Open Knowledge workspaces unchanged.
