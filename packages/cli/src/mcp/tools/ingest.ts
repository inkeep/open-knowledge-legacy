/**
 * `ingest` MCP workflow tool — capture an external source as raw reference material
 * in .open-knowledge/external-sources/.
 *
 * Principle: raw preservation only. No summary, no analysis, no interpretation.
 * That's `research`'s job.
 */
import { z } from 'zod';
import type { ServerInstance } from './shared.ts';
import { textResult } from './shared.ts';

function buildBody(source: string): string {
  return `Capture this external source into the project knowledge base as raw reference material. **Raw preservation only** — no summary, no analysis, no interpretation. Summarizing is the job of the \`research\` tool later.

Source: ${source}

## Step 1: Fetch the content

- **URL** → use your available web fetch tool.
- **Local file or attachment** → use your native file read tool.

If the fetch fails (login wall, 401/402/403/429, anti-scraping block), **stop and ask the user to paste the content directly**. Do not save a stub, an error page, or a login wall as "raw content" — that poisons the knowledge base.

If the fetcher returns an obvious *summary* of the page instead of the raw content (some LLM-backed fetch tools do this), note it and try a raw alternative (e.g., \`curl -sL <url>\` for text-heavy sources, or ask the user to paste). The goal is verbatim bytes.

## Step 2: Save to external-sources

Write the content to \`.open-knowledge/external-sources/<kebab-case-slug>.md\`. Pick the slug from the source's own title (e.g., \`karpathy-llm-wiki.md\`, \`anthropic-prompt-caching.md\`). Don't put dates in the filename — dates go in frontmatter.

Prepend this frontmatter:

\`\`\`yaml
---
title: Original title of the source
description: One-line summary from the source (their words, not yours)
source_url: https://example.com/article     # for URLs
source_path: ./relative/path/to/file.pdf    # for local files
date_fetched: YYYY-MM-DD
author: Original author if known
tags:
  - relevant-topic
---
\`\`\`

## Step 3: Preserve the content faithfully

- **Keep** headings, lists, quotes, code blocks, images, citations, references
- **Strip** obvious boilerplate: nav menus, cookie banners, ads, footer links, "related articles" widgets
- **Do NOT** summarize, critique, paraphrase, or interpret. That's \`research\`'s job.
- **For very long sources**, consider splitting by major section with cross-references in frontmatter

## Step 4: Verify

- File exists at \`.open-knowledge/external-sources/<slug>.md\`
- Valid frontmatter (at minimum \`title\`, \`description\`, and either \`source_url\` or \`source_path\`)
- \`.open-knowledge/catalogs/\` picks it up automatically via the MCP server's file watcher

## Non-goals

- **No analysis** — don't interpret, compare, or critique the source
- **No promotion to articles/** — that's \`/consolidate\`'s job, later
- **No deduplication** — if the same source is ingested twice, let it happen; cleanup is a separate concern

Full convention: read \`.open-knowledge/AGENTS.md\`.`;
}

export const DESCRIPTION = [
  'Fetch an external source (URL or local file) and save raw content to .open-knowledge/external-sources/.',
  'Raw preservation only — no analysis or interpretation.',
  '',
  '**Use when:**',
  '- Capturing reference material for the project knowledge base',
  '- Saving a URL or document for later research',
  '- Archiving an external source alongside the codebase',
  '- The user shares a URL or document they want preserved',
  '',
  '**Triggers on:**',
  '- "ingest", "save this source", "capture this URL", "add to external sources"',
  '- User shares a URL, article, or document to preserve in the knowledge base',
  '- Research workflow needs raw sources before analysis',
].join('\n');

export function register(server: ServerInstance): void {
  server.tool(
    'ingest',
    DESCRIPTION,
    { source: z.string().describe('URL, file path, or identifier of the source to ingest') },
    (args: { source: string }) => textResult(buildBody(args.source)),
  );
}
