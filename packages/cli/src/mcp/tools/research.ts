/**
 * `research` MCP workflow tool — analyze a topic by gathering external sources,
 * reading them alongside existing content, and writing provisional findings
 * to the project's content directory.
 *
 * Principle: provisional, not canonical. Research articles capture findings,
 * trade-offs, and open questions at a point in time. Promoted to canonical
 * articles via the `consolidate` tool only when decisions solidify.
 */
import { z } from 'zod';
import { OK_DIR } from '../../constants.ts';
import type { ServerInstance } from './shared.ts';
import {
  type ConfigOrResolver,
  resolveProjectConfigContext,
  textPlusStructured,
  textResult,
} from './shared.ts';

function buildBody(topic: string, contentDir: string): string {
  return `Research this topic and write provisional findings inside the project content directory. Research is **provisional, not canonical** — it captures findings, trade-offs, and open questions at a point in time. Promoting to canonical articles is a deliberate later step (via the \`consolidate\` tool).

Topic: ${topic}

The content directory for this project is **\`${contentDir}\`** (from \`${OK_DIR}/config.yml\`).

## When to use this workflow

- A developer asks you to research a topic (e.g., "research CRDT alternatives for our editor")
- You're exploring a decision space before committing to an approach
- Spec conversations and exploratory work that isn't ready to be canonical yet
- You need to synthesize multiple sources into a structured analysis

## Principle: provisional, not canonical

Research articles are **provisional**. They capture what you found at a point in time. They are not the source of truth. When decisions solidify, research gets promoted to canonical articles via the \`consolidate\` tool (or manually). Until then, research is a place where uncertainty lives.

## Steps

### 1. Scope the research

Understand what the developer is actually asking:

- **What specific question needs answering?** If the prompt was vague, narrow it before gathering sources.
- **What's the decision this research will inform?** Research without a decision context tends to meander.
- **What's already known?** Use \`exec("grep -rn <topic-keyword> <content-dir>")\` to find prior work — grep results come with per-file enrichment (title, description, tags) so you can judge relevance without opening each. If prior work exists, use \`exec("cat <path>")\` to load it with full rich context (frontmatter + shadow-repo activity + project git history + backlinks) — you may be iterating on an existing research doc rather than creating a new one.

If the topic is itself a URL, treat that URL as the anchor source and widen from there. If it's a question, figure out 3–8 sources that could plausibly inform it.

### 2. Gather sources via \`ingest\`

Invoke the \`ingest\` tool for each relevant URL, paper, or document. **Typical research pulls 3–8 sources.** Too few and the synthesis is thin; too many and you'll be reading for the rest of the session.

**Don't skip \`ingest\`.** Raw sources must be preserved before analysis — it separates capture from interpretation and makes the research reproducible. A research article without preserved sources is just opinion; a research article with preserved sources is a trail someone else can follow.

If a fetch fails for a source you specifically need, stop and ask the user to paste it — don't silently drop it.

### 3. Read and analyze

Read each ingested source carefully. Also read:

- **Existing canonical articles** on the topic — use \`exec("cat <path>")\` (rich enrichment: frontmatter + shadow-repo activity + project git history + backlinks in one call)
- **Prior research** on adjacent topics — same: \`exec("cat <path>")\` for Open Knowledge markdown
- **Relevant source code** for projects where research is grounded in the codebase (read entry points, core modules, and any specs that touch the topic) — native \`Read\` is fine for \`.ts\` / \`.js\` / etc.; use \`exec\` for \`.md\` / \`.mdx\` under \`content.include\`
- **Project context** — project-root docs, \`specs/\`, \`reports/\`, or wherever the project organizes design material

Take notes on:

- **Key claims** and their evidence
- **Trade-offs** between options
- **Contradictions** between sources
- **Unknowns** and open questions
- **Relevance** to the specific decision at hand

### 4. Write the research article

Save the file as a markdown document inside the content directory. The path convention depends on the project:

- If the project has adopted the three-tier lifecycle (external-sources → research → articles), save under a \`research/\` folder relative to the content dir (\`<content-dir>/research/<slug>.md\`)
- If the project has an existing docs/reports/specs layout, save alongside that layout in a location that matches the project's conventions
- When a research topic is large enough to warrant a subfolder, create one (\`research/<topic>/<subtopic>.md\`)

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
  - <path-to-ingested-source-1>.md
  - <path-to-ingested-source-2>.md
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

[What you still don't know — candidates for further research, prototyping, or decisions that need human judgment.]

## Tentative recommendation

[Your best guess, clearly marked as tentative. Explain the reasoning so a future reader can re-evaluate when new information arrives.]
\`\`\`

### 5. Link aggressively

Research articles are discovery surfaces — they should link out to **every** related document (sources, sibling research, prior canonical articles, adjacent topics). Under-linked research becomes an island that nobody finds.

- Every noun-phrase that names another document should be a \`[[Page Name]]\` link, not plain prose. Prefer \`[[Page]]\` over Markdown \`[text](./page.md)\` — only wiki-links participate in the backlinks index.
- Link sources inline where you cite them, not just in the \`sources:\` frontmatter list. "According to \`[[llm-agents-dust-tt]]\`..." is stronger than a bare path.
- Cross-link sibling research: if an adjacent topic has its own research doc, link it in "Open questions" or inline. Readers following one thread should find the others.
- **Redlinks are fine.** If the research surfaces a concept that needs its own page later, \`[[name it now]]\` — the redlink is a breadcrumb for future work.
- Update 1–2 closely-related existing pages to link back to this research (usually under "Further reading" or "See also").

### 6. Mark it provisional

- Set \`status: provisional\` in frontmatter
- Use language like "tentative", "initial findings", "based on current understanding"
- Do NOT write research articles as if they were canonical — that's misleading to future readers
- If you're uncertain, say so explicitly. Research is the layer where uncertainty is allowed to live.

### 7. Verify

- File exists at the chosen path under the content directory
- Has frontmatter with \`title\`, \`description\`, \`status: provisional\`, \`date\`, and a \`sources\` list
- \`exec("ls <dir>")\` should list the file with enrichment
- Linked source files from step 2 exist — broken source links mean something went wrong in \`ingest\`

## Non-goals

- **Don't promote to a canonical article** — that's the \`consolidate\` tool's job after the team actually decides
- **Don't hide uncertainty** — research is where uncertainty lives; be explicit about what you don't know
- **Don't skip \`ingest\`** — always capture raw sources first, then analyze
- **Don't overwrite existing research** — if the topic was researched before, either iterate on the existing file or create a clearly-named successor (e.g., \`crdt-alternatives-2.md\`) and mark the old one as superseded

Full convention: read \`${OK_DIR}/AGENTS.md\`.`;
}

export const DESCRIPTION = [
  'Analyze a topic by gathering sources via ingest and writing provisional findings into the project content directory.',
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

export interface ResearchDeps {
  config: ConfigOrResolver;
  resolveCwd: (explicit?: string) => Promise<string>;
}

export function register(server: ServerInstance, deps: ResearchDeps): void {
  // previewUrl is null per FR-2.1: research is a workflow primer keyed on a
  // `topic` — the target research doc's path is chosen by the agent during the
  // prompt's Step 4. There is no single canonical document to preview at call
  // time. Uniform with ingest / consolidate / save_version.
  server.tool(
    'research',
    DESCRIPTION,
    { topic: z.string().describe('The topic, question, or anchor URL to research') },
    async (args: { topic: string }) => {
      const context = await resolveProjectConfigContext(deps.resolveCwd, deps.config);
      if (!context.ok) return textResult(`Error: ${context.error}`, true);
      return textPlusStructured(buildBody(args.topic, context.config.content.dir), {
        previewUrl: null,
      });
    },
  );
}
