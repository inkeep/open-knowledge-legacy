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

**The invariant.** If OK Electron is open for this project OR \`ok ui\` is running for it, every OK tool response carries the preview URL — plain HTTP, no custom URL schemes, works in any browser including agent in-app browsers (Claude Desktop, Cursor, Codex, Cowork). Read tools (\`exec\`, \`grep\`, \`search\`, \`list_documents\`, \`read_document\`) carry it in \`ui.baseUrl\` (top-level) and per-doc \`previewUrl\` fields; write tools carry it in \`previewUrl\` + the optional \`warning\` shape. Never construct this URL; always read it from the latest tool response.

**The default agent move.** Make your first OK tool call (any read works — \`list_documents\`, \`exec("ls -A")\`, or \`read_document\` is enough). The response carries the preview URL. Navigate to it immediately, then proceed with your real work. The user watches edits land live; you can re-navigate later to verify a CRDT edit landed when a response looks ambiguous. Per host:

- **In-app browser hosts** (Claude Desktop, Cursor, Codex, Cowork): navigate the in-app browser to the \`previewUrl\`. Default.
- **Claude Code Desktop**: call \`preview_start("open-knowledge-ui")\` (host tool, not OK MCP).
- **Stdio-only hosts**: surface the URL in chat; \`open <url>\` (macOS) if the host can shell out.

**Four signals to check if it's already open** (you usually can't pre-check, so read these from each write response):

1. You opened/navigated earlier this session → don't reopen.
2. Write response has \`previewUrl\` (non-null) and NO \`warning\` → a browser is attached somewhere; do nothing.
3. \`warning: { action: "attach-preview-once", previewUrl, message }\` → UI reachable, no browser attached; navigate one-shot.
4. \`warning: { action: "start-ui", previewUrl: null, message }\` → no UI running anywhere. Surface the message verbatim — recovery options are in the in-band copy. Don't loop on retries.

Warnings fire at most once per session in the fresh-start case.

**\`previewUrl: null\` only means "no UI reachable" on the three attach-warning tools: \`write_document\` / \`edit_document\` / \`frontmatter_patch\`.** Workflow tools return prose and don't carry \`previewUrl\`. \`delete_document\` / \`rename_document\` / \`rename_folder\` emit \`previousPreviewUrl\` (different field, for closing stale tabs) and don't fire attach warnings.

**Always read \`previewUrl\` from the latest write response.** Don't cache the session-start value — Electron quit/reopen (or \`ok ui\` restart) can change the port; the resolver picks up the new port automatically.

If you see \`"Hocuspocus server is not running"\`, run \`ok start\` and retry. NEVER construct preview URLs by hand.

OK Electron and \`ok ui\` cannot serve the same project at once — they share \`ui.lock\`. A UI-lock collision means the other is running for that project (use that one, or quit it first).

**The preview is read-only for the agent.** Navigate to verify edits landed; you cannot click or type to drive edits — the CRDT flow is one-way (agent → MCP → CRDT → preview).

**No screenshots after every edit.** Do NOT take \`preview_screenshot\` (host tool, not OK MCP) after every write. Trust the response. Screenshot only when (a) debugging a visual issue, (b) a response looks ambiguous, or (c) the user asks.

## Scope recap

Open Knowledge looks for documents under the resolved \`content.dir\` (discoverable at runtime via \`get_config({ path: ['content', 'dir'] })\`). \`.gitignore\` and \`.okignore\` (at the project root and at any folder depth) define exclusions. Folder defaults + templates live in nested \`<folder>/.ok/frontmatter.yml\` + \`<folder>/.ok/templates/\` files — NOT in \`.ok/config.yml\`.

Default mental model (no jargon): **every \`.md\` and \`.mdx\` under \`content.dir\`** not excluded by \`.gitignore\` or \`.okignore\` is an Open Knowledge document — including under \`specs/\`, \`reports/\`, \`docs/\`, etc. Read \`.okignore\` (and any nested \`.okignore\` files) once per turn to know what's excluded.

**First session in this project?** If \`frontmatter_defaults\` and \`templates_available\` are empty for substantial folders, the project hasn't been onboarded yet — invoke \`discover\` (Workflow tools table) before writing. Once onboarded, the cascade carries the discipline.


Full guidance lives in the bundled \`open-knowledge\` skill at \`~/.ok/skills/open-knowledge/SKILL.md\`.
`;
}
