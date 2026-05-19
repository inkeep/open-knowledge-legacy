import { OK_DIR } from '@inkeep/open-knowledge-core';
import { z } from 'zod';
import type { ServerInstance, WorkflowToolDeps } from './shared.ts';
import { buildWorkflowHandler, ROUTED_CWD_DESCRIPTION } from './shared.ts';

function buildBody(source: string, contentDir: string): string {
  return `Capture this external source into the project knowledge base as raw reference material. The KB is **closed-loop**: external sources are pulled INTO the knowledge base here so downstream docs cite local paths, never bare web URLs. This applies whether a user shared the source OR you fetched it yourself to ground a knowledge-base claim — agent-initiated fetches are not exempt. **Raw preservation only** — no summary, no analysis, no interpretation. Summarizing is the job of the \`research\` tool later.

Source: ${source}

The content directory for this project is **\`${contentDir}\`** (from \`${OK_DIR}/config.yml\`).

## Step 0: Is this source worth preserving?

Before fetching anything, sanity-check:

- **Is it in scope?** If the source is unrelated to what this knowledge base is accumulating, ingest is pollution. Check the existing layout: \`exec("ls ${contentDir}")\` to see what topics are already covered.
- **Is it already ingested?** \`exec("grep -rln <source-url-or-title-slug> ${contentDir}")\` — if the same source is already present with current content, stop and reuse. Re-ingest is appropriate when the source has changed materially (new version, significant edits) — note the reason in frontmatter's \`description\`.
- **Is the user's intent actually \`ingest\` (preserve) or \`research\` (analyze)?** If they want findings synthesized rather than raw bytes archived, redirect: "\`research\` on this topic will pull sources via \`ingest\` as needed. Use \`research\` instead." Don't pre-ingest speculatively when the user wants analysis.

If all three checks pass, proceed.

## Step 1: Fetch the content

- **URL** → use your available web fetch tool.
- **Local file or attachment** → use your native file read tool.

If the fetch fails (login wall, 401/402/403/429, anti-scraping block), **stop and ask the user to paste the content directly**. Do not save a stub, an error page, or a login wall as "raw content" — that poisons the knowledge base.

If the fetcher returns an obvious *summary* of the page instead of the raw content (some LLM-backed fetch tools do this), note it and try a raw alternative (e.g., \`curl -sL <url>\` for text-heavy sources, or ask the user to paste). The goal is verbatim bytes.

## Step 2: Save as raw reference material

Write the content as a markdown file inside the content directory (\`${contentDir}\`). The convention if this project adopts the three-tier lifecycle is to group raw sources together — e.g., an \`external-sources/\` subfolder under the content dir — but it's just a convention. Use whatever the project's existing docs layout calls for. If unsure, ask the user or default to a sensible top-level subfolder name.

Name the file with a kebab-case slug from the source's own title (e.g., \`karpathy-llm-wiki.md\`, \`anthropic-prompt-caching.md\`). Don't put dates in the filename — dates go in frontmatter.

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

- File exists at the chosen location under the content directory
- Valid frontmatter (at minimum \`title\`, \`description\`, and either \`source_url\` or \`source_path\`)
- \`exec("ls <dir>")\` should list the file with enrichment

## Step 5: Discuss takeaways with the user (no file write)

After preservation, briefly surface back to the user what the source actually contains — in **chat**, not in the raw file. This is Karpathy's "discussing takeaways" step: the raw file stays verbatim, but the human collaborator gets a quick orientation.

- 3–5 bullet points capturing the source's main claims, with no editorializing.
- Note any **tensions** with existing knowledge-base docs you already surfaced in Step 0 — agents that ingest in isolation miss the "wait, this contradicts \`[prior article](./path/to/prior.md)\`" signal.
- Offer next steps: "Shall I \`research\` this topic now, or is preservation enough?" Don't silently chain into \`research\` — the user may have just wanted the archive.

## Step 6 (optional): Update neighbor docs to link the new source

If the source is directly relevant to an existing article or research doc, update that doc to link the new raw source. A preserved source that no doc points at is an island. Limit this to 1–3 high-signal neighbors — don't touch everything tangentially related.

- Follow the \`write_document\` / \`edit_document\` contract from the skill (preview-before-edit).
- Use a markdown link: \`[Source title](./${contentDir ? 'relative/path/to/source.md' : 'raw/source.md'})\`.
- Do NOT mass-update every neighbor. Karpathy's pattern rewards focused cross-linking; noisy neighbor-pings degrade the signal.

## Non-goals

- **No analysis** — don't interpret, compare, or critique the source
- **No promotion to a canonical article** — that's the \`consolidate\` tool's job, later
- **No silent chaining into research** — ingest completes on its own; the user explicitly opts into \`research\`
- **No synthesis inside the raw file** — the takeaways live in chat or a separate summary doc, never mixed into the preserved source
`;
}

export const DESCRIPTION = [
  "Returns a multi-step plan for ingesting an external source (URL or local file). Does NOT fetch, write, or execute — you execute the plan. The body details Karpathy's three-layer pattern + the closed-loop ingest contract.",
  'Raw preservation only — no analysis or interpretation.',
  'The knowledge base is closed-loop: web sources cited by KB docs MUST resolve to a local doc captured here, not bare URLs.',
  '',
  '**Use when:**',
  '- Capturing reference material for the project knowledge base',
  '- Saving a URL or document for later research',
  '- Archiving an external source alongside the codebase',
  '- The user shares a URL or document they want preserved',
  '- **You yourself fetched a URL (`WebFetch` / `WebSearch` / equivalent) to ground a claim that is about to land in a knowledge-base doc** — agent-initiated fetches are not exempt from the closed-loop rule',
  '',
  '**Triggers on:**',
  '- "ingest", "save this source", "capture this URL", "add to external sources"',
  '- User shares a URL, article, or document to preserve in the knowledge base',
  '- Agent fetches a URL via WebFetch/WebSearch to support a knowledge-base claim — preserve the source before citing it',
  '- Research workflow needs raw sources before analysis',
].join('\n');

export function register(server: ServerInstance, deps: WorkflowToolDeps): void {
  server.registerTool(
    'ingest',
    {
      description: DESCRIPTION,
      inputSchema: {
        source: z.string().describe('URL, file path, or identifier of the source to ingest'),
        cwd: z.string().optional().describe(ROUTED_CWD_DESCRIPTION),
      },
    },
    buildWorkflowHandler('ingest', deps, 'source', buildBody),
  );
}
