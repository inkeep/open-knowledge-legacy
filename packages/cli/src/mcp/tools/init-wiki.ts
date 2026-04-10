/**
 * `init-wiki` MCP workflow tool — bootstrap a project wiki by reading the codebase
 * and writing initial knowledge articles grouped by topic.
 *
 * Non-content rendering: the tool emits instructional text with step-by-step
 * instructions; all real work (reading, writing articles, editing INDEX.md
 * frontmatter) happens via the agent's native tools, not through the MCP
 * server. The server only provides the instructions.
 */
import type { ServerInstance } from './shared.ts';
import { textResult } from './shared.ts';

const BODY = `Initialize a project wiki at .open-knowledge/ for this repository.

## When to use

- First time setting up a wiki in a repo where \`.open-knowledge/\` does not exist or is empty
- When onboarding to a new codebase and you want to capture initial understanding for future agent sessions

## Steps

### 1. Verify the wiki structure exists

If \`.open-knowledge/\` does not already exist, scaffold it from a terminal (not from within this MCP session — scaffolding is a CLI operation, not a tool call):

\`\`\`bash
open-knowledge init
# or:  npx @inkeep/open-knowledge init
\`\`\`

That creates the directory layout (\`articles/\`, \`external-sources/\`, \`research/\`, \`cache/\`), \`AGENTS.md\`, \`.gitignore\`, starter INDEX.md catalogs, and wires this MCP server into \`.mcp.json\`. After scaffolding, reconnect the MCP client (\`/mcp\` in Claude Code) so the server picks up the new directory and starts its catalog file watcher.

If you have \`Bash\` tool access, you can shell out: \`bash\` → \`npx @inkeep/open-knowledge init\`, then prompt the user to reconnect.

### 2. Read the codebase systematically

Explore the project to build understanding before writing anything:

1. **Start broad** — Read \`README.md\`, \`CLAUDE.md\` or \`AGENTS.md\`, \`package.json\` (or equivalent manifest), and any existing prose documentation
2. **Map the structure** — Use \`ls\`/\`glob\` to understand directory layout and naming conventions
3. **Read key files** — Entry points, config files, core modules, type definitions, schema files
4. **Check existing docs** — \`specs/\`, \`docs/\`, \`ARCHITECTURE.md\`, or any prose documentation directories
5. **Review recent history** — \`git log --oneline -30\` for recent decisions and direction

Don't rush this phase. The quality of articles depends on the quality of understanding.

### 3. Synthesize knowledge articles

Write articles grouped by topic in \`.open-knowledge/articles/\`. For each article:

- **One topic per article** — Keep articles focused (e.g., "Auth Architecture", not "Everything About The Backend")
- **Use subdirectories** for related topics: \`articles/infrastructure/\`, \`articles/auth/\`, \`articles/data-model/\`
- **Add proper frontmatter**:

\`\`\`yaml
---
title: Article Title
description: One-line summary that will appear in INDEX.md catalogs
tags:
  - relevant
  - tags
---
\`\`\`

- **Write for future agents** — Explain the *why* and *how things connect*, not just *what exists*. Source code already says what exists.
- **Keep articles concise** — 100-300 lines is a good target. Split larger topics into multiple articles.
- **Link to source code** by file path when helpful, but don't duplicate code into articles.

### 4. Set folder-level title and description for every subfolder you create

This is the highest-leverage place to establish the habit. For every subfolder under \`articles/\` (or \`research/\` / \`external-sources/\`), set \`title\` and \`description\` in that subfolder's \`INDEX.md\` frontmatter. These two fields are **sticky** across catalog regenerations and surface in the parent catalog's Subfolders list — so readers know what's in each folder without opening it.

Do this alongside creating the first article in the folder. In parallel tool calls, write:

1. \`articles/auth/INDEX.md\`:
   \`\`\`yaml
   ---
   title: Authentication
   description: How auth works in this codebase — SSO, sessions, tokens.
   ---
   \`\`\`
2. \`articles/auth/sso-migration.md\` (the first article)

The watcher rebuild preserves the \`title\`/\`description\` you wrote in \`INDEX.md\` and fills in the auto-generated sections (\`## Articles\`, \`## Subfolders\`). **Only** \`title\` and \`description\` are editable in \`INDEX.md\` — don't write a body or extra frontmatter fields, the rebuild will clobber them.

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

- Catalogs (\`INDEX.md\` files) auto-regenerate as you write articles — the file watcher picks up changes
- Read \`.open-knowledge/INDEX.md\` to verify the wiki is navigable
- Ensure every article has frontmatter with at minimum \`title\` and \`description\`
- Ensure every subfolder's \`INDEX.md\` has its sticky \`title\` and \`description\` set

## Non-goals

- **Don't produce a file-by-file code index** — the agent reads source code directly when needed
- **Don't copy source code into articles** — link by path
- **Don't write articles for things that change often** (dependency versions, file counts); focus on stable understanding

Full convention: read \`.open-knowledge/AGENTS.md\`.`;

export const DESCRIPTION = [
  'Bootstrap .open-knowledge/ by reading the codebase and writing initial knowledge articles grouped by topic.',
  '',
  '**Use when:**',
  '- Setting up a wiki for the first time in a repo',
  '- Onboarding to a new codebase and capturing initial understanding',
  '- .open-knowledge/ exists but articles/ is empty or sparse',
  '',
  '**Triggers on:**',
  '- "init wiki", "bootstrap wiki", "populate wiki", "set up project knowledge"',
  '- .open-knowledge/ exists but has no articles',
  '- User asks to document or catalog the codebase into the wiki',
].join('\n');

export function register(server: ServerInstance): void {
  server.tool('init-wiki', DESCRIPTION, () => textResult(BODY));
}
