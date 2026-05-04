---
name: open-knowledge
description: "MUST invoke when the project contains a .ok/ directory — before any read or edit of .md / .mdx files, any mcp__open-knowledge__ tool call, and any write_document / edit_document. Skip if no .ok/ — not an Open Knowledge project. Carries preview-attach (open preview browser at session start; one-shot on `action: attach-preview-once`), STOP rules for native Read/Grep/Edit on in-scope markdown, grounding rules (every factual claim needs a source), standard markdown linking with get_dead_links verification, image sourcing + alt-text + source-citation rules, folder-first organization with nested `<folder>/.ok/` defaults + templates, and the anti-pattern table. Authoritative — MCP server instructions and AGENTS.md overlap but do not substitute for the full attach rule, grounding rule, media rules, dead-link verification, and failure-mode guidance carried only here."
compatibility: "Claude Code, Claude Desktop, Claude Cowork, Claude.ai web. Requires Open Knowledge MCP server + code execution."
metadata:
  version: "0.3.0"
  author: "Inkeep"
  repository: "https://github.com/inkeep/open-knowledge"
---
# Open Knowledge — agent guidance

Open Knowledge (OK) is a markdown-CRDT collaboration platform exposed via MCP. This skill carries the behavioral rules agents need to use it fluently. Every section is a MUST unless marked otherwise.

> Skill version: tracks `@inkeep/open-knowledge-server` package version. Check `cat ~/.ok/skill-installed-version` to see what's installed locally.

## STOP — native tools on in-scope `.md` / `.mdx`

When this workspace has Open Knowledge MCP configured, do **not** use your host's native file tools on markdown paths inside the content directory. The ban covers every common rationalization:

- **Native `Read` / `Grep` / `Glob` on in-scope `.md` / `.mdx`** — the original case.
- **`Bash ls` / `Bash find` / `Bash cat` on dirs containing in-scope markdown** — use `exec("ls …")` / `exec("find … -name '*.md'")` / `exec("cat …")` instead. Native returns bare names; `exec` returns frontmatter, backlink counts, and recent activity per child.
- **Glob patterns that target markdown** (`**/*.md`, any dir known to be markdown-heavy like `specs/**`, `reports/**`, `docs/**`) — use `exec` with `find`, or `list_documents({ dir })`.
- **Dispatching the Explore / general-purpose subagent for markdown-heavy exploration** — subagents use native `Read` / `Grep` / `Glob` internally and bypass Open Knowledge entirely. Do markdown exploration yourself via `exec` / `search`. Subagents remain appropriate for **source-code** exploration.
- **Reading `.ok/AGENTS.md` via native `Read`** — observed failure mode during M1 testing. The `.ok/` directory is in-scope; treat its contents the same as any other knowledge-base file.

Why: native tools skip frontmatter, backlinks, shadow-repo activity, and project git history that OK's tools return for every matched knowledge-base file. `exec` is the primary read surface; it runs read-only bash (`cat`, `ls`, `grep`, `find`, `head`, `tail`, `wc`, `sort`, `uniq`, `cut` — pipes OK) and returns raw stdout plus enriched metadata per file.

**MCP tool visibility — not seeing `exec` is NOT the escape hatch.** MCP wiring varies by client. Claude Code, Cursor, Codex, Windsurf, VS Code — each surfaces MCP differently. Server labels are user-defined; tools may not appear as top-level symbols named `exec` in your specific UI. If Open Knowledge is registered as an MCP server in this workspace, route markdown reads through its `exec` / `search` / `read_document` via your client's documented MCP invocation (including any generic "call MCP tool" flow). Registration is the test, not top-level-symbol visibility.

**Escape hatch.** Native `Read` / `Grep` / `Glob` on `.md` / `.mdx` is allowed **only** when no Open Knowledge MCP server is registered for this project, **or** immediately after you tried an MCP call and it failed — then begin a user-visible sentence with `Open Knowledge MCP unavailable:`. Never use the hatch because you skipped your client's MCP path, didn't see `exec` as a top-level tool, or rationalized the skill wasn't necessary.

**Source code and non-markdown files** (`.ts`, `.py`, `package.json`, …): native `Read` / `Grep` / `Glob` always.

## Reads — examples

- Read a file: `exec("cat <path>.md")` — contents + full rich enrichment
- List a directory: `exec("ls <dir>")` — per-child frontmatter, recursive markdown counts, most-recently-updated doc per subdir
- Search: `exec("grep -rn <term> <dir> | head -5")` — matches + enrichment on matched files
- Typed tools (`read_document`, `search`, `list_documents`) remain available — prefer them when a structured `structuredContent` shape is useful (e.g., passing results to another tool). For interactive reads, `exec` is lighter.

## Preview — open the browser at session start

**Open the preview browser as your first OK action of the session, if it is not already open.** The user watches edits land live in that pane; if it isn't open, your work is invisible and the whole CRDT pipeline is wasted. Treat this as step zero — before your first read, before your first write.

- Claude Code Desktop: `preview_start("open-knowledge-ui")`.
- Cursor: use the host's open-URL tool with a `previewUrl` from any write response.
- Other hosts: use whatever command opens a URL (macOS: `open <url>`). On hosts with no preview tool (Codex, generic stdio), surface the URL in chat for the user to click.

**How to know if it's already open.** You usually can't pre-check from the agent side — rely on these signals:

1. You already opened it earlier in this session → don't reopen.
2. A `write_document` / `edit_document` response returns `previewUrl` but NO `warning: { action: "attach-preview-once" }` → a browser is attached somewhere; do nothing.
3. A response DOES include `warning: { action: "attach-preview-once", previewUrl, message }` → no browser is attached; open immediately, one-shot. The hint fires only when needed (server tracks `__system__` subscribers) and at most once per session in the normal fresh-start case.

If the server isn't running, you'll see a `"Hocuspocus server is not running"` error or `previewUrl: null`. Start the UI (`open-knowledge ui` from a terminal, or `preview_start("open-knowledge-ui")` in Claude Code), then retry. NEVER construct preview URLs by hand — always use the `previewUrl` returned in tool responses.

**No screenshots after edits.** Do NOT take `preview_screenshot` after every `edit_document` / `write_document`. Trust the CRDT tool response as confirmation the edit landed. Only screenshot when debugging a visual issue or when explicitly asked.

## Writing

Call `write_document` / `edit_document` as soon as you have content. Native `Edit` / `sed` / direct `Write` on in-scope markdown is forbidden — it bypasses the CRDT and loses agent attribution in the shadow repo.

To delete a doc, call `delete_document` — never `rm` / `unlink` / native `Bash` removal on in-scope markdown. The MCP path closes open agent sessions and unloads the doc from Hocuspocus before unlinking; native `rm` desynchronizes those. Deletion is irreversible from this tool — call `save_version` first if you may need to roll back, and `get_backlinks` first if you want to fix the referrers that will become redlinks.

## Grounding — every factual claim needs a source (MUST)

Knowledge-base docs are factual artifacts — whether the project is a wiki, an LLM brain, a spec collection, a research log, or anything else markdown-shaped. Every claim must be traceable, and **the source has to live inside the knowledge base**, not float on the public web.

- **The knowledge base is source-of-truth — closed loop.** External sources don't get *cited out* to the live web; they get *pulled in* via `ingest`, then cited locally. A bare `[source](https://...)` URL inside a knowledge-base doc is **not** a finished citation — it's a TODO that says "this source still needs to be ingested." The chain only works if every leaf is a local doc.
- **Every factual claim MUST cite its source at the point of claim.** No unsourced speculation.
- **Web sources for knowledge-base docs** → fetch the page (your host's `WebFetch` / `WebSearch` / equivalent), then `ingest` it as a local doc, then cite the local path: `[source name](./path/to/source.md)`. The local doc carries the original URL in its frontmatter `source_url:`. **Inline `[source](URL)` is a chat affordance, not a knowledge-base one.**
- **Self-fetched counts.** When YOU fetched a URL to ground a claim that's about to land in the knowledge base, that fetch triggers `ingest` exactly like a user share does. Don't downgrade to inline-URL citation because the fetch was agent-initiated — same KB, same closed-loop contract.
- **Internal cross-refs** → standard markdown link to the OK doc that contains the authoritative claim: `[text](./path/to/doc.md)`. The linked doc itself must cite its sources — chains should terminate in preserved local docs. Where ingested sources live is project-specific (an `external-sources/` folder if the project uses Karpathy's layout; wherever the project's existing layout puts raw references otherwise).
- **If you don't have evidence:**
  1. Run a web search and `ingest` the result, OR
  2. Mark inline `(TODO: needs source)` so a human can verify, OR
  3. Don't write the claim. Do NOT fabricate.
- Unsourced speculation looks authoritative but rots into tribal knowledge that can't be audited. The knowledge base loses its value if readers can't trust it.
- If a fact is in the knowledge base, a reader must be able to trace it to its origin via local docs only — no dead-link-on-the-public-web exposure.

## Linking — use standard markdown links

- **Every noun-phrase that names another document should be linked** using standard markdown link syntax: `[text](./relative/path.md)` or `[text](/absolute/from/content-root.md)`.
- **External web sources are NOT inline body links.** Per the Grounding rule above, web URLs live in the `source_url:` frontmatter of an ingested doc under `external-sources/` (or the project's equivalent raw-sources folder); the body cites the local path: `[source name](./external-sources/source-slug.md)`. A raw `[source](https://...)` inline in the body is a TODO, not a citation — see Grounding for the closed-loop contract.
- **Internal cross-refs between OK docs** → `[text](./other-doc.md)` — link liberally to aid navigation.
- **Never wrap a link in backticks.** `` `[text](./foo.md)` `` is a bug — the backticks make it render as literal code rather than a link.
- **Never use HTML anchors** (`<a href="...">`). Markdown link syntax only.
- **Verify before walking away.** After writing a doc, call `get_dead_links({ sourceDocNames: ['your/doc'] })` to find broken references. Fix each redlink or explicitly accept it.
- **The editor's red-underline visual lies.** Its dead-link detection tolerates slug-fallback (e.g., `foo` may appear resolved because `foo.md` exists at root). `get_dead_links` is strict-exact — trust the tool, not the visual.

**Note on wiki-link syntax (`[[Page]]`):** the parser still handles it for legacy content, but it's NO LONGER the recommended default. Write new content with standard markdown links per above.

## Media — images and attachments

### 1. Markdown syntax only

- Use markdown image syntax: `![alt text](./path/to/image.png)`.
- Do NOT emit HTML `<img src="...">` tags. They get preserved in the CRDT but don't participate in OK's content graph and don't render consistently across Fumadocs / preview surfaces.
- Paths resolve relative to the doc's own path (standard CommonMark).

### 2. Image sourcing — save locally, don't hot-link

- Agents MUST NOT embed external image URLs directly (e.g., `![pic](https://somesite.com/pic.png)`). Hot-linked images rot when the source disappears, leak referrers, and don't travel if content is exported or archived.
- To use an image from an external source:
  1. Fetch it (`WebFetch` / `curl` / your host's equivalent) and save to a local path.
  2. Reference with a relative markdown image link.
  3. Cite the source in a caption (see §4 below).
- **Conventional location:** `assets/images/<topic>/<filename>` under the content root. If the project already has a different convention, follow it — check via `exec("ls assets/")` or `exec("find . -type d -name images")` first.
- If you cannot fetch (no network, paywalled source, etc.): DON'T invent a local path. Either omit the image or mark inline `(TODO: image needs sourcing from <URL>)` for a human.

### 3. Alt-text discipline

- Every image needs **meaningful alt text** describing what the image shows, not what it is.
  - Bad: `![](./aang.png)` (empty — invisible to assistive tech, zero searchability)
  - Bad: `![image](./aang.png)` (generic — same problem)
  - Bad: `![aang.png](./aang.png)` (filename as alt — still generic)
  - Good: `![Aang using the Avatar State to defeat Ozai](./aang.png)`
- Alt text is both an accessibility requirement AND a searchability signal — OK indexes alt text.

### 4. Cite image sources (Grounding rule applies)

- Every image pulled from the web needs a source caption right below it, per the Grounding rule:
  ```markdown
  ![Aang using the Avatar State to defeat Ozai](./assets/images/aang/avatar-state.png)
  *Source: [Avatar Wiki — Aang](https://avatar.fandom.com/wiki/Aang#Avatar_State)*
  ```
- Original images (your own diagrams, screenshots of your own tool, etc.) may caption `*Original*` or omit the caption.
- Unattributed web images are a failure mode equivalent to unsourced factual claims.

## Frontmatter conventions

Open Knowledge has two metadata surfaces that merge at read time:

**Per-file frontmatter.** Every `.md` / `.mdx` file in the knowledge base should have YAML frontmatter:

```yaml
---
title: Article Title (required)
description: Brief summary (required)
tags:
  - relevant
  - tags
---
```

**Folder-level defaults via opt-in nested `<folder>/.ok/frontmatter.yml`.** See "Folder structure + metadata" below.

## Follow project conventions — read folder defaults before writing

Before creating or editing docs in a folder, look at `list_documents(<folder>)` (or `exec("ls <folder>")`) and skim:

- **`frontmatter_defaults`** — the merged folder defaults (title shape, description, tags) that any new doc here will inherit. Surfaces nested `<folder>/.ok/frontmatter.yml` cascade walked root → leaf, leaf wins per-key.
- **`templates_available`** — the menu of starter shapes for `write_document({ template })`. Each entry has `name`, `title`, `description`, and `scope` (`local` / `inherited` / `descendant`). Pick one that matches the doc's purpose.
- **Content scope** — `content.dir` (in `.ok/config.yml`) defines the content root. `.gitignore` and `.okignore` files (gitignore syntax, nested at any depth) define which paths are excluded from the document index. Anything excluded is regular source code, not a knowledge-base doc.

If a project uses `ok seed` to scaffold the Karpathy three-layer layout (`external-sources/` → `research/` → `articles/`), the seed encodes layer rules in the project config so each layer's defaults show up in `list_documents` enrichment for that folder. Projects with custom layouts put their own discipline in their own folder defaults. Either way: **read the folder before writing**.

## Folder structure + metadata — nested `<folder>/.ok/`

Folder defaults and templates live in opt-in nested `.ok/` directories — sparse, lazy-create, auto-clean. **Most folders have NO `.ok/`**. A folder gets one only when it declares its own frontmatter defaults or carries templates.

```
content-root/
├── .ok/                        ← project root .ok/ (config.yml, cache, etc.)
├── meetings/
│   ├── .ok/                    ← opt-in: this folder declares defaults + templates
│   │   ├── frontmatter.yml
│   │   └── templates/
│   │       ├── prep-notes.md
│   │       └── post-notes.md
│   └── 2026-05-01.md
└── research/                   ← no .ok/ — declares nothing, inherits root cascade
    └── auth-providers.md
```

### Editing folder defaults

Use the `set_folder_rule` MCP tool. It writes nested `<folder>/.ok/frontmatter.yml`:

```ts
set_folder_rule({
  rules: [
    { match: "meetings/**", frontmatter: { title: "Meetings", tags: ["meeting"] } },
    { match: "meetings/prep-notes/**", frontmatter: { tags: ["meeting", "prep"] } },
  ],
})
```

Each `match` glob must resolve to a SINGLE target folder (leading literal segments + trailing `*`/`**`). Multi-folder globs like `specs/*/evidence/**` are rejected with `MULTI_FOLDER_GLOB` — split into one rule per folder.

To remove a folder rule, pass an empty `frontmatter: {}` — the file is deleted and `.ok/` is auto-cleaned if no other tenant remains.

Cascade rules (D6 — asymmetric per scalar vs list semantics):

- **Scalars** (`title`, `description`): walk root → leaf, last-wins per key (leaf replaces ancestor).
- **Tags**: union-and-dedup along the chain, first-occurrence preserved. Root `tags: [kb]` plus a leaf `tags: [spec]` produces `[kb, spec]` at the leaf — tags accumulate naturally; you don't need to redeclare ancestor tags at each level.
- **File frontmatter** wins per-scalar over folder defaults; file tags union with the cascade.

### Creating templates

Templates are markdown starter shapes. Use `write_template`:

```ts
write_template({
  folder: "meetings/",
  name: "prep-notes",
  body: "# {Meeting Title}\n\n**Attendees:** \n**Date:** \n\n## Agenda\n- \n",
  frontmatter: {
    title: "Meeting Prep Notes",          // MUST be present (D14 — hard error if missing)
    description: "Use before a meeting.", // SHOULD be present (D14 — soft warning)
    tags: ["meeting", "prep"],
  },
})
```

`title` is the menu surface — agents pick by title, so it's required at write time (`TEMPLATE_TITLE_REQUIRED` if missing). `description` is recommended for menu disambiguation but produces only a warning when absent.

**Substitution allowlist (D5).** Template bodies MAY use exactly two server-side substitutions: `{{date}}` (today's ISO-8601 date) and `{{user}}` (calling principal display name). Any other `{{...}}` token is rejected at write time with `TEMPLATE_UNKNOWN_VARIABLE`. Plain placeholder text in `{shape}` form (e.g., `{Meeting Title}`) is LITERAL — agents fill those in via subsequent `edit_document` calls. Substitution happens at instantiation time only; templates on disk show the raw `{{date}}` token.

To delete a template: `delete_template({ folder, name })` — auto-cleans empty `.ok/templates/` and `.ok/`.

### Creating a doc from a template

```ts
// 1. Inspect the menu
list_documents("meetings/", { depth: 1 })
//    → templates_available: [{ name: "prep-notes", title: ..., scope: "local" }, ...]

// 2. Instantiate (template + markdown are mutually exclusive — pass one)
write_document({
  docName: "meetings/2026-05-02-roadmap-sync",
  template: "prep-notes",
  position: "replace",
})
```

Templates resolve via leaf → root walk-up at the target's parent folder, with closest-wins on filename collision (D7). The `scope` field has two values: `"local"` (template lives in this folder's `.ok/templates/`) and `"inherited"` (template lives in an ancestor's). Descendant templates do NOT appear in the parent's array — they surface only inside `subfolders[].templates_available` when `list_documents` is called with `depth > 1`.

**`template` and `markdown` are mutually exclusive** (D21). Passing both errors with `TEMPLATE_AND_MARKDOWN_BOTH_SET`. The template body becomes the new doc's body verbatim (after `{{date}}`/`{{user}}` substitution); fill placeholders via subsequent `edit_document` calls.

## Organization

- **Folders are the organizational unit.** Group related docs in a shared folder.
- **Folder-level metadata lives in nested `<folder>/.ok/frontmatter.yml`** (sparse, opt-in, auto-clean).
- **Don't create `INDEX.md` / `README.md` hub files** solely to catalog children — `exec("ls <folder>")` returns the same view live, with per-file frontmatter + backlink counts.
- If a hub doc exists from prior work, keep it updated as children change — but don't create new ones.

## Cadence

When you make a multi-step change (batch of new docs, folder restructure), pause between steps to let the browser preview catch up. The CRDT edit streams live; the preview follows your edit cadence. Don't batch 10 writes in a row — interleave the writes so the user watching the browser sees the narrative progress.

If a hub doc exists in a folder, update it as you change children. Don't batch five child edits and then update the hub — write child → update hub → write next child.

This is primarily a human-watchability concern — the user watches edits land in the preview; interleaved cadence makes the narrative legible.

## Log discipline — check for a project log when KB content changes

Some projects keep an append-only project log to make agent activity auditable. **After any turn that creates, edits, or restructures docs in the knowledge base, check for a project log:** look for a `log.md` at the project root (or at the seed `rootDir` if `ok seed --root <dir>` was used). If one exists, follow whatever its frontmatter `description:` and in-file comment say — they carry the project-specific contract (entry shape, cadence, categories). Different projects log differently — some treat the log as a wiki audit trail, others as an LLM-brain history, others as a spec changelog. If no `log.md` exists, no log discipline applies; don't fabricate one.

The skill carries the trigger ("KB content changed this turn — go look"). The file owns the policy.

## Anti-patterns — at a glance

| Task                                            | Don't                                                                              | Do                                                                                |
| ----------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| List a markdown-heavy dir                       | `Bash: ls specs/`                                                                  | `exec("ls specs/")`                                                               |
| Find all SPEC.md files                          | `Glob: **/SPEC.md`                                                                 | `exec("find specs -name SPEC.md")`                                                |
| Search a phrase across markdown                 | `Grep: "pattern" *.md`                                                             | `search({ query: "pattern" })`                                                    |
| Read an individual doc                          | `Read: specs/foo/SPEC.md`                                                          | `exec("cat specs/foo/SPEC.md")` or `read_document(...)`                           |
| Explore a markdown-heavy dir                    | `Agent(Explore): "..."`                                                            | Do `exec`-based exploration yourself                                              |
| Wait for the server to tell you to open preview | Skip the session-start preview open and wait for the `attach-preview-once` hint    | Open the preview browser at session start; the hint is a fallback when you didn't |
| Ignore the attach hint                          | Skip the `warning: { action: "attach-preview-once" }` hint in write-tool responses | Open the `previewUrl` when the hint fires; otherwise do nothing                   |
| Reference another doc                           | `` `[text](./page.md)` `` (backticked) or HTML `<a>`                               | `[text](./page.md)` (raw markdown)                                                |
| Embed an image                                  | `<img src="...">` (HTML) or hot-linked external URL                                | Fetch + save locally + `![meaningful alt](./assets/images/path)`                  |
| Write a factual claim in a KB doc               | plausible prose without citation, OR inline `[source](https://URL)`                | `ingest` the source first, then cite the local path per Grounding                  |
| Cite a web source you just fetched              | inline `[source](https://...)` because YOU did the fetch (not the user)            | `ingest` it — agent-initiated fetches are not exempt from the closed-loop rule    |
| Finish a turn that changed KB content           | move on without checking for a log                                                 | check for a `log.md` and follow its contract per Log discipline                    |
| Add an image                                    | empty alt `![](./x.png)` or generic alt `![image](./x)`                            | meaningful alt + source caption below                                             |
| Catalog folder contents                         | create `INDEX.md` hub file                                                         | `set_folder_rule({ rules: [{ match, frontmatter }] })` writes `<folder>/.ok/frontmatter.yml` |
| Delete a markdown doc                           | `Bash: rm` / `unlink` / native deletion on in-scope `.md`                          | `delete_document` — `save_version` first if rollback may be needed                |
| Fork a skill and expect no stomp                | Edit installed SKILL.md                                                            | `npx skills remove` before CLI upgrade                                            |

## Workflow tools — when to invoke them

Three MCP tools build on the primitives above and correspond to [Karpathy's three-layer knowledge-base pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f):

| Tool          | Layer                   | When to invoke                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ingest`      | Raw sources (immutable) | User shares a URL/PDF/file to preserve verbatim, **OR you fetched a URL** (`WebFetch` / `WebSearch` / equivalent) to ground a claim that's about to land in the knowledge base. The KB is closed-loop — agent-initiated fetches are not exempt. No analysis in the file itself — takeaways go back to the user in chat.                                                                                                                                  |
| `research`    | KB, provisional         | User asks you to investigate, compare alternatives, or synthesize multiple sources. Produces a `status: provisional` article with a `sources:` list. Follows scan-first routing, a STOP scoping gate, 3P-external framing, and a validate checklist — the tool body enforces each step. |
| `consolidate` | KB, canonical           | Team has actually decided after research and wants the outcome committed as source-of-truth. Starts with a STOP gate confirming the decision exists; writes a `status: canonical` article with a `supersedes:` chain.                                                                   |

Each tool returns a multi-step instructional body when invoked. The bodies enforce their own gates — follow the numbered steps in order, don't skip the STOP gates.

**These tools are your default move, not `write_document`.** When the work fits one of the three layers — preserving an external source, investigating/synthesizing, committing a decided outcome — invoke the corresponding tool instead of going straight to `write_document` / `edit_document`. The tool bodies enforce framing (sources, status, supersedes chains) that hand-written articles routinely miss. `write_document` is correct for everything that does **not** fit the three layers (specs, runbooks, scratch notes, project pages); for the three that do, lead with the tool. This is doubly true in projects that ran `ok seed` — a doc landing in `external-sources/` / `research/` / `articles/` should have come out of `ingest` / `research` / `consolidate`.

Typical day-2 flow: user shares a URL → `ingest` (preserve) → user asks "now research this" → `research` (provisional article + `ingest`s more sources as needed) → decision lands → `consolidate` (canonical article, supersedes the research).

**Do not chain silently.** After `ingest`, ask the user whether to proceed to `research`. After `research`, let the user decide whether the findings are ready to `consolidate`. Each tool completes on its own terms — the user drives the transitions.

**Project scaffolding is a CLI operation (optional).** Users who want the Karpathy three-layer layout as their folder structure can run `ok seed` once from a terminal. That command scaffolds `external-sources/` + `research/` + `articles/`, seeds an append-only `log.md` at the project root, and registers per-layer folder defaults so agents see layer descriptions at every `list_documents(<folder>)` / `exec("ls <folder>")` call. It is **not required**: the three workflow tools above work against any folder structure the project already uses (`specs/`, `docs/`, `reports/`, or anything else). Only mention `ok seed` if the user explicitly asks for a starter layout or wants the Karpathy pattern specifically.

## Server lifecycle

If `write_document` or `edit_document` returns a "Hocuspocus server is not running" error, start it with `ok start` (via Bash) and retry. Never fall back to native `Edit` / `Write` for in-scope markdown — always route through the MCP write tools so edits go through the CRDT with proper attribution.

## Scope recap

When MCP is connected, the server's `instructions` echo the **resolved** `content.dir` for this session — that's where Open Knowledge looks for documents. `.gitignore` and `.okignore` (at the project root and at any folder depth) define exclusions. Folder defaults + templates live in nested `<folder>/.ok/frontmatter.yml` + `<folder>/.ok/templates/` files — NOT in `.ok/config.yml`.

Default mental model (no jargon): **every `.md` and `.mdx` under `content.dir`** not excluded by `.gitignore` or `.okignore` is an Open Knowledge document — including under `specs/`, `reports/`, `docs/`, etc. Read `.okignore` (and any nested `.okignore` files) once per turn to know what's excluded.
