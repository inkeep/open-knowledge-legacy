/**
 * `init-content` MCP workflow tool — bootstrap a project knowledge base by reading the codebase
 * and writing initial knowledge articles grouped by topic.
 *
 * Non-content rendering: the tool emits instructional text with step-by-step
 * instructions; all real work (reading, writing articles) happens via the
 * agent's native tools, not through the MCP server. The server only provides
 * the instructions.
 */
import { resolveContentDir, resolveLockDir } from '../../config/paths.ts';
import { OK_DIR } from '../../constants.ts';
import { type PreviewUrlDeps, resolveUiInfo } from './preview-url.ts';
import type { ServerInstance } from './shared.ts';
import { textPlusStructured } from './shared.ts';

function buildBody(contentDir: string): string {
  return `Initialize a project knowledge base at \`${contentDir}\` for this repository.

The content directory for this project is **\`${contentDir}\`** (from \`${OK_DIR}/config.yml\`).

## When to use

- First time setting up a knowledge base in a repo where \`${OK_DIR}/\` does not exist, or where the content directory has no articles yet
- When onboarding to a new codebase and you want to capture initial understanding for future agent sessions

## Steps

### 1. Verify the structure exists

If \`${OK_DIR}/\` does not already exist, scaffold it from a terminal (not from within this MCP session — scaffolding is a CLI operation, not a tool call):

\`\`\`bash
open-knowledge init
# or:  npx @inkeep/open-knowledge init
\`\`\`

That creates \`${OK_DIR}/\` with \`config.yml\`, \`AGENTS.md\`, \`.gitignore\`, and wires this MCP server into \`.mcp.json\`. It does **not** scaffold content subdirectories — knowledge lives wherever \`content.dir\` points (currently \`${contentDir}\`). After scaffolding, reconnect the MCP client so the server picks up the new config.

If you have \`Bash\` tool access, you can shell out: \`bash\` → \`npx @inkeep/open-knowledge init\`, then prompt the user to reconnect.

### 2. Read the codebase systematically

Explore the project to build understanding before writing anything:

1. **Start broad** — Read \`README.md\`, \`CLAUDE.md\` or \`AGENTS.md\`, \`package.json\` (or equivalent manifest), and any existing prose documentation
2. **Map the structure** — Use \`exec("ls <dir>")\` for directories under \`content.dir\` that match \`content.include\` (returns folder metadata — file counts, subdirs, most-recent md) and native \`Glob\`/\`ls\` for source code
3. **Read key files** — Entry points, config files, core modules, type definitions, schema files
4. **Check existing docs** — \`specs/\`, \`docs/\`, \`ARCHITECTURE.md\`, or any prose dirs: use \`exec\` for every \`.md\` / \`.mdx\` that matches \`content.include\` (under shipped defaults, that is essentially **all** markdown in the repo). Use native \`Read\`/\`Glob\` only for source code / non-markdown, or when MCP is unavailable
5. **Review recent history** — \`git log --oneline -30\` for recent decisions and direction

Don't rush this phase. The quality of articles depends on the quality of understanding.

### 3. Synthesize knowledge articles

Write articles inside the content directory (\`${contentDir}\`). Organization is up to the project — no enforced structure:

- If the project already has a docs layout (\`docs/\`, \`guides/\`, topic-grouped subfolders), follow it
- If starting fresh, group by topic (e.g., \`architecture/\`, \`auth/\`, \`data-model/\`) — create subfolders as needed; no scaffolded directories exist by default
- **One topic per article** — keep articles focused (e.g., "Auth Architecture", not "Everything About The Backend")
- **Add proper frontmatter**:

\`\`\`yaml
---
title: Article Title
description: One-line summary
tags:
  - relevant
  - tags
---
\`\`\`

- **Write for future agents** — Explain the *why* and *how things connect*, not just *what exists*. Source code already says what exists.
- **Keep articles concise** — 100-300 lines is a good target. Split larger topics into multiple articles.
- **Link to source code** by file path when helpful, but don't duplicate code into articles.

### 4. Link aggressively

This is the single highest-leverage step for a new knowledge base. Articles that don't link each other are isolated documents; articles that cross-link form a navigable graph.

- **Every noun-phrase that names another article is a \`[[Page Name]]\` link.** Write links inline as you draft — don't save linking for a second pass. Prefer \`[[Page]]\` over Markdown \`[text](./page.md)\` since only wiki-links participate in the backlinks index.
- **Redlinks are fine — write them eagerly.** If you're drafting "Auth Architecture" and mention "session tokens", write \`[[Session Tokens]]\` even if that page doesn't exist yet. The redlink is a to-do list for the next pass.
- **Build hub articles.** Pick 2–3 broad topics (e.g., "Architecture Overview", "Data Model") and have them link out to the specific articles below them. Hubs are what agents discover first — their outbound links are how everything else becomes findable.
- **Cross-link siblings.** In each subfolder, 2–3 closely-related articles should link each other under a "See also" section or inline.
- **After writing a batch of articles, verify link density:** \`exec("cat <article>.md")\` on a sample and confirm the rendered output shows a healthy backlinks list. An article with zero backlinks is an island — link back to it from somewhere.

### 5. Suggested starting topics

Depending on the project, consider articles covering:

- **Architecture overview** — High-level system design, key components, how they connect
- **Data model** — Core entities, relationships, database schema
- **API surface** — Endpoints, protocols, authentication model
- **Deploy & infrastructure** — How to deploy, CI/CD, environments
- **Development workflow** — How to run locally, test conventions, contribution flow
- **Key decisions** — Architecture decisions and their rationale (the "why")
- **Domain concepts** — Business domain terms and their meaning in code

### 6. Verify

- \`exec("ls ${contentDir}")\` shows the articles you wrote, each with title/description/tags enrichment
- \`exec("grep -rn <common-codebase-term> ${contentDir}")\` finds the expected articles
- \`exec("cat <article>.md")\` on a sample shows the article plus its backlinks section — if the backlinks list is empty, go back to step 4 and link from somewhere
- Every article has frontmatter with at minimum \`title\` and \`description\`

## Non-goals

- **Don't produce a file-by-file code index** — the agent reads source code directly when needed
- **Don't copy source code into articles** — link by path
- **Don't write articles for things that change often** (dependency versions, file counts); focus on stable understanding
- **Don't create scaffolded subfolders you won't fill** — empty \`articles/\`/\`research/\`/\`external-sources/\` folders are clutter; organize as you actually need

Full convention: read \`${OK_DIR}/AGENTS.md\`.`;
}

export const DESCRIPTION = [
  'Bootstrap the project knowledge base by reading the codebase and writing initial knowledge articles grouped by topic.',
  '',
  '**Use when:**',
  '- Setting up a knowledge base for the first time in a repo',
  '- Onboarding to a new codebase and capturing initial understanding',
  '- The content directory is empty or sparse',
  '',
  '**Triggers on:**',
  '- "init content", "bootstrap knowledge base", "populate articles", "set up project knowledge"',
  '- User asks to document or catalog the codebase',
].join('\n');

interface InitContentDeps extends PreviewUrlDeps {}

/**
 * Register the init-content tool. Emits structuredContent with a top-level
 * `ui: {baseUrl, port}` block per FR-2.6. init-content is instructional
 * (no docName list) so it has no per-row previewUrl — only the ui block.
 */
export function register(server: ServerInstance, deps: InitContentDeps): void {
  server.tool('init-content', DESCRIPTION, async () => {
    const body = buildBody(deps.config.content.dir);
    const cwd = await deps.resolveCwd();
    const lockDir = resolveLockDir(resolveContentDir(deps.config, cwd));
    const ui = resolveUiInfo({ config: deps.config, lockDir });
    return textPlusStructured(body, { ui });
  });
}
