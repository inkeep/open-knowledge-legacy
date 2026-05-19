import type { Config } from '../config/schema.ts';

export function buildInstructions(_content: Config['content']): string {
  return `Open Knowledge is a markdown-CRDT knowledge base exposed via MCP.

## STOP — native tools on in-scope \`.md\` / \`.mdx\`

When this workspace has Open Knowledge MCP configured, do **not** use your host's native file tools on markdown paths inside the content directory. The ban covers every common rationalization:

- **Native \`Read\` / \`Grep\` / \`Glob\` on in-scope \`.md\` / \`.mdx\`** — the original case.
- **\`Bash ls\` / \`Bash find\` / \`Bash cat\` on dirs containing in-scope markdown** — use \`exec("ls -A …")\` / \`exec("find … -name '*.md'")\` / \`exec("cat …")\` instead. Native returns bare names; \`exec\` returns frontmatter, backlink counts, and recent activity per child. \`-A\` shows hidden entries (\`.ok/\`, \`.okignore\`) which OK projects carry; omit \`.\` and \`..\` rows that \`-a\` would add.
- **Glob patterns that target markdown** (\`**/*.md\`, any dir known to be markdown-heavy like \`specs/**\`, \`reports/**\`, \`docs/**\`) — use \`exec\` with \`find\`, or \`list_documents({ dir })\`.
- **Dispatching the Explore / general-purpose subagent for markdown-heavy exploration** — subagents use native \`Read\` / \`Grep\` / \`Glob\` internally and bypass Open Knowledge entirely. Do markdown exploration yourself via \`exec\` / \`search\` / \`grep\`. Subagents remain appropriate for **source-code** exploration.
- **Native \`Read\` / \`Grep\` on any in-scope markdown inside \`.ok/\`** — the \`.ok/\` directory is in-scope; if it carries \`.md\` / \`.mdx\`, treat those the same as any other knowledge-base file.

Why: native tools skip frontmatter, backlinks, shadow-repo activity, and project git history that OK's tools return for every matched knowledge-base file. \`exec\` is the primary read surface; it runs read-only bash (\`cat\`, \`ls\`, \`grep\`, \`find\`, \`head\`, \`tail\`, \`wc\`, \`sort\`, \`uniq\`, \`cut\` — pipes OK) and returns raw stdout plus enriched metadata per file.

**MCP tool visibility — not seeing \`exec\` is NOT the escape hatch.** MCP wiring varies by client. Claude Code, Cursor, Codex, Windsurf, VS Code — each surfaces MCP differently. Server labels are user-defined; tools may not appear as top-level symbols named \`exec\` in your specific UI. If Open Knowledge is registered as an MCP server in this workspace, route markdown reads through its \`exec\` / \`search\` / \`grep\` / \`read_document\` via your client's documented MCP invocation (including any generic "call MCP tool" flow). Registration is the test, not top-level-symbol visibility.

**Escape hatch.** Native \`Read\` / \`Grep\` / \`Glob\` on \`.md\` / \`.mdx\` is allowed **only** when no Open Knowledge MCP server is registered for this project, **or** immediately after you tried an MCP call and it failed — then begin a user-visible sentence with \`Open Knowledge MCP unavailable:\`. Never use the hatch because you skipped your client's MCP path, didn't see \`exec\` as a top-level tool, or rationalized the skill wasn't necessary.

**Source code and non-markdown files** (\`.ts\`, \`.py\`, \`package.json\`, …): native \`Read\` / \`Grep\` / \`Glob\` always.

## Reads — examples

- Read a file: \`exec("cat <path>.md")\` — contents + full rich enrichment
- List a directory: \`exec("ls -A <dir>")\` — per-child frontmatter, recursive markdown counts, most-recently-updated doc per subdir. Prefer \`-A\` over plain \`ls\`: OK projects carry dot-prefixed entries (\`.ok/\`, nested \`.ok/\`, \`.okignore\`) that plain \`ls\` omits. \`-A\` shows hidden entries without the noisy \`.\`/\`..\` rows that \`-a\` adds, and without the verbose long-format columns that \`-la\` adds (the per-child enrichment already carries the useful metadata \`-l\` would surface).
- Search: \`exec("grep -rn <term> <dir> | head -5")\` — matches + enrichment on matched files
- Typed tools (\`read_document\`, \`search\`, \`grep\`, \`list_documents\`) remain available — prefer them when a structured \`structuredContent\` shape is useful (e.g., passing results to another tool). For interactive reads, \`exec\` is lighter. **Pick the right search:** \`search\` for ranked retrieval (cmd-K parity — title boost + body BM25 + recency); \`grep\` for every literal-string occurrence grouped by file with frontmatter enrichment.

## Preview — open the browser at session start

**Open the preview browser as your first OK action of the session, if it is not already open.** The user watches edits land live in that pane; if it isn't open, your work is invisible and the whole CRDT pipeline is wasted. Treat this as step zero — before your first read, before your first write.

- Claude Code Desktop: \`preview_start("open-knowledge-ui")\`.
- Cursor: use the host's open-URL tool with a \`previewUrl\` from any write response.
- Other hosts: use whatever command opens a URL (macOS: \`open <url>\`). On hosts with no preview tool (Codex, generic stdio), surface the URL in chat for the user to click.

**How to know if it's already open.** You usually can't pre-check from the agent side — rely on these signals:

1. You already opened it earlier in this session → don't reopen.
2. A \`write_document\` / \`edit_document\` response returns \`previewUrl\` but NO \`warning\` → a browser is attached somewhere; do nothing.
3. A response DOES include \`warning: { action: "attach-preview-once", previewUrl, message }\` → a UI server is reachable but no browser is attached; open the URL immediately, one-shot.
4. A response includes \`warning: { action: "start-ui", previewUrl: null, message }\` → no UI is running anywhere for this project. Surface the message to the user (the in-band copy names the recovery options: \`open-knowledge ui\` in a terminal, \`preview_start("open-knowledge-ui")\` in Claude Code Desktop, or opening the project in OK Electron). Don't loop on retries — the user has to act.

Both warning shapes fire only when needed (server tracks \`__system__\` subscribers) and at most once per session in the normal fresh-start case.

If the server isn't running, you'll see a \`"Hocuspocus server is not running"\` error. If \`previewUrl\` is \`null\` in a tool response, no UI is reachable for this project — neither a CLI \`open-knowledge ui\` process nor an OK Electron window. Start one (\`open-knowledge ui\` from a terminal, \`preview_start("open-knowledge-ui")\` in Claude Code, or just open the project in OK Electron), then retry. NEVER construct preview URLs by hand — always use the \`previewUrl\` returned in tool responses.

OK Electron and the CLI's \`ok ui\` cannot serve the same project at the same time — they both hold the same \`ui.lock\`. If \`ok ui\` errors with a UI-lock collision, an OK Electron window is open for that project (use that window, or quit it and re-run \`ok ui\`). The reverse holds for the user-facing case: opening a project in OK Electron while a standalone \`ok ui\` is running for the same project will fail the lock acquire.

**No screenshots after edits.** Do NOT take \`preview_screenshot\` after every \`edit_document\` / \`write_document\`. Trust the CRDT tool response as confirmation the edit landed. Only screenshot when debugging a visual issue or when explicitly asked.

## Scope recap

Open Knowledge looks for documents under the resolved \`content.dir\` (discoverable at runtime via \`get_config({ path: ['content', 'dir'] })\`). \`.gitignore\` and \`.okignore\` (at the project root and at any folder depth) define exclusions. Folder defaults + templates live in nested \`<folder>/.ok/frontmatter.yml\` + \`<folder>/.ok/templates/\` files — NOT in \`.ok/config.yml\`.

Default mental model (no jargon): **every \`.md\` and \`.mdx\` under \`content.dir\`** not excluded by \`.gitignore\` or \`.okignore\` is an Open Knowledge document — including under \`specs/\`, \`reports/\`, \`docs/\`, etc. Read \`.okignore\` (and any nested \`.okignore\` files) once per turn to know what's excluded.

**First session in this project?** If \`frontmatter_defaults\` and \`templates_available\` are empty for substantial folders, the project hasn't been onboarded yet — invoke \`discover\` (Workflow tools table) before writing. Once onboarded, the cascade carries the discipline.


Full guidance lives in the bundled \`open-knowledge\` skill at \`~/.ok/skills/open-knowledge/SKILL.md\`.
`;
}
