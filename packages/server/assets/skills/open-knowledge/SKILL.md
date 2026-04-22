---
name: open-knowledge
description: Guidance for working with Open Knowledge — a markdown collaboration server exposed via MCP. STOP rules for native file tools on `.md` / `.mdx` (use `exec` / `read_document` / `search` / `write_document` / `edit_document` instead), preview-before-edit sequence (`get_preview_url` → open browser → edit), `[[wiki-link]]` authoring conventions, folder-first organization. Use whenever reading, editing, or creating markdown in a project with Open Knowledge MCP connected.
paths: "**/*.md, **/*.mdx"
---

# Open Knowledge — agent guidance

Open Knowledge (OK) is a markdown-CRDT collaboration platform exposed via MCP. This skill carries the behavioral rules agents need to use it fluently.

## STOP — native tools on in-scope `.md` / `.mdx`

When this workspace has Open Knowledge MCP configured, do **not** use your host's native file tools on markdown paths inside the content directory. The ban covers every common rationalization:

- **Native `Read` / `Grep` / `Glob` on in-scope `.md` / `.mdx`** — the original case.
- **`Bash ls` / `Bash find` / `Bash cat` on dirs containing in-scope markdown** — use `exec("ls …")` / `exec("find … -name '*.md'")` / `exec("cat …")` instead. Native returns bare names; `exec` returns frontmatter, backlink counts, and recent activity per child.
- **Glob patterns that target markdown** (`**/*.md`, any dir known to be markdown-heavy like `specs/**`, `reports/**`, `docs/**`) — use `exec` with `find`, or `list_documents({ dir })`.
- **Dispatching the Explore / general-purpose subagent for markdown-heavy exploration** — subagents use native `Read` / `Grep` / `Glob` internally and bypass Open Knowledge entirely. Do markdown exploration yourself via `exec` / `search`. Subagents remain appropriate for **source-code** exploration.

Why: native tools skip frontmatter, backlinks, shadow-repo activity, and project git history that OK's tools return for every matched wiki file. `exec` is the primary read surface; it runs read-only bash (`cat`, `ls`, `grep`, `find`, `head`, `tail`, `wc`, `sort`, `uniq`, `cut` — pipes OK) and returns raw stdout plus enriched metadata per file.

**Escape hatch.** Native `Read` / `Grep` / `Glob` on `.md` / `.mdx` is allowed **only** when no Open Knowledge MCP server is registered for this project, **or** immediately after you tried an MCP call and it failed — then begin a user-visible sentence with `Open Knowledge MCP unavailable:`. Never use the hatch because you skipped your client's MCP path.

**Source code and non-markdown files** (`.ts`, `.py`, `package.json`, …): native `Read` / `Grep` / `Glob` always.

## Reads — examples

- Read a file: `exec("cat <path>.md")` — contents + full rich enrichment
- List a directory: `exec("ls <dir>")` — per-child frontmatter, recursive markdown counts, most-recently-updated doc per subdir
- Search: `exec("grep -rn <term> <dir> | head -5")` — matches + enrichment on matched files
- Typed tools (`read_document`, `search`, `list_documents`) remain available when you need the typed `structuredContent` shape

## Writing — preview-before-edit (REQUIRED)

Every call to `write_document` / `edit_document` MUST follow this sequence:

1. **Call `get_preview_url(docName)`.** If it returns `null`, the UI isn't running — start it (`open-knowledge ui` from a terminal, or `preview_start("open-knowledge-ui")` in Claude Code). Then call `get_preview_url` again. NEVER construct a preview URL by hand.
2. **Open that URL in your preview browser** so the user sees the document.
3. **Only then call `write_document` / `edit_document`** — the CRDT edit streams live into the already-open editor.

Never skip the preview step. The user expects to watch every edit land in real time. Write-tool responses include `previewUrl` (when resolvable) and a `warning` when no client is currently attached to the doc.

Native `Edit` / `sed` / direct `Write` on in-scope markdown is forbidden — it bypasses the CRDT and loses agent attribution in the shadow repo.

**No screenshots after edits.** Do NOT take `preview_screenshot` after every `edit_document` / `write_document`. Trust the CRDT tool response as confirmation the edit landed. Only screenshot when debugging a visual issue or when explicitly asked.

## Linking — lean on `[[wiki-links]]` aggressively

Link liberally. Open Knowledge's value compounds with link density: backlinks surface cross-document context in every read, graph queries (`get_hubs` / `get_orphans`) reveal structure, and agents navigate the knowledge base by following links. A document with no outbound links is an island.

**Defaults when writing:**

- **Every noun-phrase that names another document is a link.** Write `[[Page Title]]` instead of plain prose when mentioning concepts, projects, decisions, or entities that have (or should have) their own page. Redlinks are fine — they signal "this should exist."
- **Cross-link siblings.** When you create a document in a folder, skim the siblings (`exec("ls <folder>")`) and link to the 2–3 most related ones.
- **Link back to sources.** If a document is derived from research or prior reports, link to them — don't re-summarize. The reader can follow.
- **Prefer `[[Page]]` over Markdown `[text](./page.md)`.** Wiki-links resolve by docName and participate in the backlinks index; Markdown links to other wiki files don't.

Wiki-link syntax: the target in brackets is the **docName** — folder path + filename without `.md` / `.mdx`. `[[guides/auth-setup]]` points at `guides/auth-setup.md`. Wiki-links are absolute from the content root, never relative. Display text: `[[guides/auth-setup|Auth Setup]]`. Anchors: `[[guides/auth-setup#quickstart]]`. Combined: `[[guides/auth-setup#quickstart|see the quickstart]]`.

**Verify before walking away.** After writing a doc, call `get_dead_links({ sourceDocNames: ['your/doc/name'] })` — every unresolved bracket-target in that doc is listed. Fix or accept the redlinks deliberately.

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

**Folder-level defaults via `.open-knowledge/config.yml` `folders:`.** Declare `title` / `description` / `tags` defaults keyed by glob `match:`. Rules apply in declaration order; later matches override earlier scalars. Tags concat + dedup across all matching rules; file tags append last; first-occurrence preserved on dedup. File's own frontmatter always wins per-scalar; folder defaults fill in blanks.

Folder metadata lives in `config.yml`, NOT in content files — intentionally different from the `INDEX.md`-inside-content pattern. The merge is computed on every read and never written back to disk.

## Organization — folders, not hub files

Folders are the organizational unit. Group related docs in a shared folder and let the directory listing do the cataloging. Per-folder metadata (title, description, tags) lives in `.open-knowledge/config.yml` under the `folders:` key.

Don't maintain an `INDEX.md` / `README.md` hub file inside a folder solely to catalog its children — `exec("ls <folder>")` returns the same view live, with per-file frontmatter + backlink counts.

## Anti-patterns — at a glance

| Task                             | Don't                        | Do                                              |
| -------------------------------- | ---------------------------- | ----------------------------------------------- |
| List a markdown-heavy dir        | `Bash: ls specs/`            | `exec("ls specs/")`                             |
| Find all SPEC.md files           | `Glob: **/SPEC.md`           | `exec("find specs -name SPEC.md")`              |
| Summarize specs across the repo  | `Agent(Explore): "…"`        | `exec("head -25 specs/*/SPEC.md")` + `search`   |
| Search a phrase across markdown  | `Grep: "pattern" *.md`       | `search({ query: "pattern" })`                  |
| Read an individual spec          | `Read: specs/foo/SPEC.md`    | `read_document({ path: "specs/foo/SPEC.md" })`  |
| Edit without preview             | `write_document(...)` direct | `get_preview_url → open → write_document`        |
| Fork a skill and expect no stomp | Edit installed SKILL.md      | Run `npx skills remove` before CLI upgrade      |

## Server lifecycle

If `write_document` or `edit_document` returns a "Hocuspocus server is not running" error, start it with `open-knowledge start` (via Bash) and retry. Never fall back to native `Edit` / `Write` for in-scope markdown — always route through the MCP write tools so edits go through the CRDT with proper attribution.

## Scope recap

When MCP is connected, the server's `instructions` echo the **resolved** `dir` / `include` / `exclude` for this session — treat that table and `.open-knowledge/config.yml` as two views of the same rules. `.gitignore` still applies.

Default mental model (no jargon): unless this project narrowed `content.include`, **every `.md` and `.mdx` under `content.dir`** is an Open Knowledge document — including under `specs/`, `reports/`, `docs/`, etc. If `content.include` is non-default, read `config.yml` once per turn so you do not mis-classify paths.
