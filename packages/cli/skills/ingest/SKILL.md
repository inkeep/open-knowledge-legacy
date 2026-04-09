---
name: ingest
description: Fetch an external source (URL, PDF, or other document) and save the raw content to .openknowledge/external-sources/ with frontmatter. Raw preservation only — no analysis.
---

# /ingest — Capture External Source

Fetch an external source and save it as raw reference material in `.openknowledge/external-sources/`.

## When to use

- Developer wants to capture an article, paper, PDF, or blog post into the wiki for later reference
- As the first step of `/research` (which captures multiple sources before analyzing them)
- When preserving a URL that might disappear or change

## Principle: raw preservation only

`/ingest` is **capture**, not analysis. Do not summarize, synthesize, or interpret the source. That's what `/research` is for. The goal is a faithful snapshot.

## Steps

### 1. Fetch the source

- **URL:** Use a web fetch tool to retrieve the page content. Prefer the rendered markdown/text over HTML when available.
- **PDF:** Read the PDF content via whatever PDF reader is available.
- **Local file:** Read it directly.

### 2. Determine the destination path

Save to `.openknowledge/external-sources/` with a descriptive, kebab-case filename:

- Prefer the article title slug: `example-com-crdt-comparison.md`
- Or a domain + topic format: `anthropic-prompt-caching.md`
- Avoid dates in filenames (date goes in frontmatter)

If the external-sources path is configured differently in `.openknowledge/config.yaml`, use that path instead.

### 3. Write with frontmatter

Every ingested source needs frontmatter:

```yaml
---
title: Original title of the source
description: One-line summary from the source (their words, not yours)
source_url: https://example.com/article        # for URLs
source_path: ./relative/path/to/file.pdf       # for local files
date_fetched: 2026-04-09
author: Original author if known
tags:
  - topic-tag
---

[Raw content of the source below]
```

### 4. Keep the content faithful

- **Preserve the original** — headings, lists, quotes, code blocks
- **Strip obvious junk** — navigation menus, cookie banners, ads, footer links
- **Keep citations and references** — they matter for follow-up research
- **Do not add your own commentary** — this is raw material for `/research` to analyze later
- **For very long sources** — consider splitting by major section with cross-references in frontmatter

### 5. Verify

- The file exists in `.openknowledge/external-sources/`
- It has valid frontmatter with at minimum `title`, `description`, and a source pointer (`source_url` or `source_path`)
- The `external-sources/INDEX.md` catalog picks up the new entry automatically

## Non-goals

- **No analysis** — don't interpret, compare, or critique the source
- **No promotion to articles/** — that's `/consolidate`'s job, later
- **No deduplication** — if the same source is ingested twice, let it happen; cleanup is a separate concern
