/**
 * `research` MCP workflow tool — analyze a topic by gathering external sources,
 * reading them alongside existing content, and writing provisional
 * findings to .open-knowledge/research/.
 *
 * Principle: provisional, not canonical. Research articles capture findings,
 * trade-offs, and open questions at a point in time. Promoted to articles/
 * only when decisions solidify.
 *
 * This tool body is modeled after the /research skill definition that was
 * previously shipped as .claude/skills/research/SKILL.md — restored and
 * adapted from git history (commit 803fda5).
 */
import { z } from 'zod';
import type { ServerInstance } from './shared.ts';
import { textResult } from './shared.ts';

function buildBody(topic: string): string {
  return `Research this topic and write provisional findings to \`.open-knowledge/research/\`. Research is **provisional, not canonical** — it captures findings, trade-offs, and open questions at a point in time. Promoting to \`articles/\` is a deliberate later step.

Topic: ${topic}

## When to use this workflow

- A developer asks you to research a topic (e.g., "research CRDT alternatives for our editor")
- You're exploring a decision space before committing to an approach
- Spec conversations and exploratory work that isn't ready to be canonical yet
- You need to synthesize multiple sources into a structured analysis

## Principle: provisional, not canonical

Research articles are **provisional**. They capture what you found at a point in time. They are not the source of truth — that's what \`articles/\` is for. When decisions solidify, research gets promoted to \`articles/\` via the \`consolidate\` tool (or manually). Until then, research is a place where uncertainty lives.

## Steps

### 1. Scope the research

Understand what the developer is actually asking:

- **What specific question needs answering?** If the prompt was vague, narrow it before gathering sources.
- **What's the decision this research will inform?** A research article without a decision context tends to meander.
- **What's already known?** Check \`.open-knowledge/articles/\` and \`.open-knowledge/research/\` first. Use \`search\` to find existing work on the topic (matches come with article metadata attached, so you can judge relevance without opening each). If prior work exists, use \`read_document\` to load it with full context (metadata + history + backlinks) — you may be iterating on an existing research doc rather than creating a new one.

If the topic is itself a URL, treat that URL as the anchor source and widen from there. If it's a question, figure out 3–8 sources that could plausibly inform it.

### 2. Gather sources via \`ingest\`

Invoke the \`ingest\` tool (or follow its workflow manually — fetch the source and save it to \`.open-knowledge/external-sources/\`) for each relevant URL, paper, or document. **Typical research pulls 3–8 sources.** Too few and the synthesis is thin; too many and you'll be reading for the rest of the session.

**Don't skip \`ingest\`.** Raw sources must be preserved before analysis — it separates capture from interpretation and makes the research reproducible. A research article without preserved sources is just opinion; a research article with preserved sources is a trail someone else can follow.

If a fetch fails for a source you specifically need, stop and ask the user to paste it — don't silently drop it.

### 3. Read and analyze

Read each ingested source carefully. Also read:

- **Existing articles** on the topic (\`articles/\`) — use \`read_document\` for wiki files to pick up metadata + git history + backlinks in one call
- **Prior research** on adjacent topics (\`research/\`) — same: prefer \`read_document\` over native \`Read\` for wiki content
- **Relevant source code** for projects where research is grounded in the codebase (read entry points, core modules, and any specs that touch the topic) — use native \`Read\` for code files
- **Project context** — \`PROJECT.md\`, \`STORIES.md\`, \`specs/\`, \`reports/\` if they exist

Take notes on:

- **Key claims** and their evidence (what does each source actually argue, and how strong is the evidence?)
- **Trade-offs** between options (what do you gain vs. lose with each approach?)
- **Contradictions** between sources (where do sources disagree, and which is more credible?)
- **Unknowns** and open questions (what you explicitly don't know — these are candidates for further research or prototyping)
- **Relevance** to the specific decision at hand (discard findings that don't actually inform the question)

### 4. Write the research article

Save to \`.open-knowledge/research/<kebab-case-topic>.md\` — or, if the topic is big enough to warrant its own subfolder, \`.open-knowledge/research/<topic>/<subtopic>.md\` (and write the subfolder's \`INDEX.md\` with sticky \`title\` and \`description\` per the folder-description convention).

Use descriptive kebab-case filenames: \`crdt-alternatives-for-editor.md\`, \`llm-maintained-wikis-pattern.md\`.

Frontmatter:

\`\`\`yaml
---
title: Descriptive title
description: One-line summary of the research question
status: provisional
date: YYYY-MM-DD
tags:
  - research
  - topic-tag
sources:
  - external-sources/source-1.md
  - external-sources/source-2.md
---
\`\`\`

Structure:

\`\`\`markdown
## Question

[What specific question is this research answering? Be precise.]

## Context

[Why does this matter? What decision does it inform? Who is the reader?]

## Findings

[Main findings organized by theme, option, or criterion. Cite sources by path.]

### Option A / Theme 1

- Pros
- Cons
- Evidence (with source links)

### Option B / Theme 2

...

## Trade-offs

[What you gain vs. lose with each option. A comparison table often helps.]

## Open questions

[What you still don't know — these are candidates for further research, prototyping, or decisions that need human judgment.]

## Tentative recommendation

[Your best guess, clearly marked as tentative. Explain the reasoning so a future reader can re-evaluate when new information arrives.]
\`\`\`

### 5. Mark it provisional

- Set \`status: provisional\` in frontmatter
- Use language like "tentative", "initial findings", "based on current understanding"
- Do NOT write research articles as if they were canonical — that's misleading to future readers who may trust the content more than it deserves
- If you're uncertain, say so explicitly. Research is the layer where uncertainty is allowed to live.

### 6. Verify

- File exists in \`.open-knowledge/research/\` (or a subfolder you created)
- Has frontmatter with \`title\`, \`description\`, \`status: provisional\`, \`date\`, and a \`sources\` list
- \`.open-knowledge/catalogs/\` picks up the new entry automatically via the file watcher
- Linked external sources exist in \`.open-knowledge/external-sources/\` — broken source links mean something went wrong in step 2

## Non-goals

- **Don't promote to \`articles/\`** — that's the \`consolidate\` tool's job after the team actually decides
- **Don't hide uncertainty** — research is where uncertainty lives; be explicit about what you don't know
- **Don't skip \`ingest\`** — always capture raw sources first, then analyze
- **Don't overwrite existing research** — if the topic was researched before, either iterate on the existing file or create a clearly-named successor (e.g., \`crdt-alternatives-2.md\`) and mark the old one as superseded

Full convention: read \`.open-knowledge/AGENTS.md\`.`;
}

export const DESCRIPTION = [
  'Analyze a topic by gathering sources via ingest and writing provisional findings to .open-knowledge/research/.',
  'Provisional, not canonical — findings live here until decisions solidify.',
  '',
  '**Use when:**',
  '- Researching a topic before committing to an approach',
  '- Exploring a decision space or comparing alternatives',
  '- Synthesizing multiple sources into structured analysis',
  '- Spec conversations and exploratory work that is not yet canonical',
  '',
  '**Triggers on:**',
  '- "research", "investigate", "compare options for", "analyze alternatives"',
  '- User asks to explore trade-offs, gather evidence, or evaluate approaches',
  '- A decision needs structured analysis grounded in external sources',
].join('\n');

export function register(server: ServerInstance): void {
  server.tool(
    'research',
    DESCRIPTION,
    { topic: z.string().describe('The topic, question, or anchor URL to research') },
    (args: { topic: string }) => textResult(buildBody(args.topic)),
  );
}
