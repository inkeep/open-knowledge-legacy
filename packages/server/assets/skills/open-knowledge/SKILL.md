---
name: open-knowledge
description: "MUST invoke before ANY tool call in a project that contains a .open-knowledge/ directory. Also MUST invoke before any mcp__open-knowledge__ tool call, any write_document / edit_document, and any read or edit of a .md or .mdx file. Carries the preview-before-edit sequence (get_preview_url then open browser then write), STOP rules for native Read/Grep/Edit on in-scope markdown, grounding rules (every factual claim needs a source), standard markdown linking conventions with get_dead_links verification, image sourcing + alt-text + source-citation rules, folder-first organization with config.yml metadata, and the anti-pattern table. Do NOT assume the MCP server instructions or any AGENTS.md substitute for this skill — they overlap but this skill carries the full preview sequence, grounding rule, media rules, dead-link verification, and failure-mode guidance not in those surfaces."
---

# Open Knowledge — agent guidance

Open Knowledge (OK) is a markdown-CRDT collaboration platform exposed via MCP. This skill carries the behavioral rules agents need to use it fluently. Every section is a MUST unless marked otherwise.

> Skill version: tracks `@inkeep/open-knowledge-server` package version. Check `cat ~/.open-knowledge/skill-installed-version` to see what's installed locally.

## STOP — native tools on in-scope `.md` / `.mdx`

When this workspace has Open Knowledge MCP configured, do **not** use your host's native file tools on markdown paths inside the content directory. The ban covers every common rationalization:

- **Native `Read` / `Grep` / `Glob` on in-scope `.md` / `.mdx`** — the original case.
- **`Bash ls` / `Bash find` / `Bash cat` on dirs containing in-scope markdown** — use `exec("ls …")` / `exec("find … -name '*.md'")` / `exec("cat …")` instead. Native returns bare names; `exec` returns frontmatter, backlink counts, and recent activity per child.
- **Glob patterns that target markdown** (`**/*.md`, any dir known to be markdown-heavy like `specs/**`, `reports/**`, `docs/**`) — use `exec` with `find`, or `list_documents({ dir })`.
- **Dispatching the Explore / general-purpose subagent for markdown-heavy exploration** — subagents use native `Read` / `Grep` / `Glob` internally and bypass Open Knowledge entirely. Do markdown exploration yourself via `exec` / `search`. Subagents remain appropriate for **source-code** exploration.
- **Reading `.open-knowledge/AGENTS.md` via native `Read`** — observed failure mode during M1 testing. The `.open-knowledge/` directory is in-scope; treat its contents the same as any other wiki file.

Why: native tools skip frontmatter, backlinks, shadow-repo activity, and project git history that OK's tools return for every matched wiki file. `exec` is the primary read surface; it runs read-only bash (`cat`, `ls`, `grep`, `find`, `head`, `tail`, `wc`, `sort`, `uniq`, `cut` — pipes OK) and returns raw stdout plus enriched metadata per file.

**MCP tool visibility — not seeing `exec` is NOT the escape hatch.** MCP wiring varies by client. Claude Code, Cursor, Codex, Windsurf, VS Code — each surfaces MCP differently. Server labels are user-defined; tools may not appear as top-level symbols named `exec` in your specific UI. If Open Knowledge is registered as an MCP server in this workspace, route markdown reads through its `exec` / `search` / `read_document` via your client's documented MCP invocation (including any generic "call MCP tool" flow). Registration is the test, not top-level-symbol visibility.

**Escape hatch.** Native `Read` / `Grep` / `Glob` on `.md` / `.mdx` is allowed **only** when no Open Knowledge MCP server is registered for this project, **or** immediately after you tried an MCP call and it failed — then begin a user-visible sentence with `Open Knowledge MCP unavailable:`. Never use the hatch because you skipped your client's MCP path, didn't see `exec` as a top-level tool, or rationalized the skill wasn't necessary.

**Source code and non-markdown files** (`.ts`, `.py`, `package.json`, …): native `Read` / `Grep` / `Glob` always.

## Reads — examples

- Read a file: `exec("cat <path>.md")` — contents + full rich enrichment
- List a directory: `exec("ls <dir>")` — per-child frontmatter, recursive markdown counts, most-recently-updated doc per subdir
- Search: `exec("grep -rn <term> <dir> | head -5")` — matches + enrichment on matched files
- Typed tools (`read_document`, `search`, `list_documents`) remain available — prefer them when a structured `structuredContent` shape is useful (e.g., passing results to another tool). For interactive reads, `exec` is lighter.

## Writing — preview-before-edit (REQUIRED)

Every call to `write_document` / `edit_document` MUST follow this sequence:

1. **Call `get_preview_url(docName)`.** If it returns `null`, the UI isn't running — start it (`ok ui` from a terminal, or `preview_start("open-knowledge-ui")` in Claude Code). Then call `get_preview_url` again. NEVER construct a preview URL by hand.
2. **Open that URL in your preview browser** so the user sees the document.
3. **Only then call `write_document` / `edit_document`** — the CRDT edit streams live into the already-open editor.

Never skip the preview step. The user expects to watch every edit land in real time. Write-tool responses include `previewUrl` (when resolvable) and a `warning` when no client is currently attached to the doc.

Native `Edit` / `sed` / direct `Write` on in-scope markdown is forbidden — it bypasses the CRDT and loses agent attribution in the shadow repo.

**No screenshots after edits.** Do NOT take `preview_screenshot` after every `edit_document` / `write_document`. Trust the CRDT tool response as confirmation the edit landed. Only screenshot when debugging a visual issue or when explicitly asked.

## Grounding — every factual claim needs a source (MUST)

Knowledge-base docs are factual artifacts. Every claim must be traceable to a source.

- **Every factual claim MUST cite its source at the point of claim.** No unsourced speculation.
- **Web sources** → inline markdown link: `[source name](https://example.com/path)`. Use your host's web-fetch / web-search tool (`WebFetch`, `WebSearch`, or equivalent) to find the source *first*. Don't write a fact and then look for a source to justify it.
- **Internal cross-refs** → standard markdown link to the OK doc that contains the authoritative claim: `[text](./path/to/doc.md)`. The linked doc itself must cite its sources — chains should terminate in external evidence eventually.
- **If you don't have evidence:**
  1. Run a web search and cite the result, OR
  2. Mark inline `(TODO: needs source)` so a human can verify, OR
  3. Don't write the claim. Do NOT fabricate.
- Unsourced speculation looks authoritative but rots into tribal knowledge that can't be audited. The knowledge base loses its value if readers can't trust it.
- If a fact is in the knowledge base, a reader must be able to trace it to its origin. Grounded evidence is the knowledge base's core contract.

## Linking — use standard markdown links

- **Every noun-phrase that names another document should be linked** using standard markdown link syntax: `[text](./relative/path.md)` or `[text](/absolute/from/content-root.md)`.
- **External web sources** → `[source name](https://...)` — required for citations per the Grounding rule above.
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

**Folder-level defaults via `.open-knowledge/config.yml` `folders:`.** See next section.

## Follow `.open-knowledge/config.yml` — it is the project contract

**Read `.open-knowledge/config.yml` at the start of every session that involves writing to the knowledge base.** It is the single source of truth for:

- **Folder structure intent** — the `folders:` block tells you which folders exist, what each one contains, and what tags its files should carry. Every `exec("ls <folder>")` / `read_document` / `search` call merges these defaults with per-file frontmatter automatically, but you should also read config.yml directly when orienting so you can *place new docs in the right folder* and *write them in the voice + shape the project expects*.
- **Per-folder instructions** — each `folders:` entry's `description:` field is the canonical place for "what does this folder contain + how should agents work inside it." Treat the description as a binding instruction, not flavor text. If a folder's description says "preserve verbatim, no analysis" (e.g. `external-sources/`), don't synthesize into those files; takeaways belong elsewhere.
- **Content scope** — `content.dir` / `content.include` / `content.exclude` define which files count as knowledge-base documents. Anything outside those globs is regular source code, not a wiki doc.

If a project uses `ok seed` to scaffold the Karpathy three-layer layout (`external-sources/` → `research/` → `articles/`), each folder's description in `config.yml` encodes the layer's rules. Projects with custom layouts put their own discipline in their own descriptions. Either way: **follow what config.yml says.**

## Folder structure + metadata — edit `.open-knowledge/config.yml`

When you create or restructure folders, you SHOULD add a matching entry to the `folders:` key in `.open-knowledge/config.yml` with a glob + frontmatter defaults. This is how per-folder title/description/tags land without duplicating frontmatter on every child file.

Example:

```yaml
folders:
  - match: 'articles/characters/team-avatar/**'
    frontmatter:
      title: Team Avatar
      description: Core Team Avatar character articles
      tags: [characters, team-avatar]
  - match: 'articles/characters/fire-nation/**'
    frontmatter:
      title: Fire Nation Characters
      description: Antagonists and Fire Nation cast
      tags: [characters, fire-nation]
```

Rules:
- Rules apply in declaration order; later matches override earlier scalars.
- Tags concat + dedup across all matching rules; first-occurrence preserved.
- File's own frontmatter always wins per-scalar; folder defaults fill in blanks.
- Folder metadata lives in `config.yml` only — NOT in an `INDEX.md` / `README.md` hub file inside the folder.

Prefer enriching `config.yml` over creating hub files. The merge is computed on every `exec("ls <folder>")` / `read_document` / `search` call and is never written back to disk.

## Organization

- **Folders are the organizational unit.** Group related docs in a shared folder.
- **Folder-level metadata lives in `config.yml`** under `folders:` (see section above).
- **Don't create `INDEX.md` / `README.md` hub files** solely to catalog children — `exec("ls <folder>")` returns the same view live, with per-file frontmatter + backlink counts.
- If a hub doc exists from prior work, keep it updated as children change — but don't create new ones.

## Cadence

When you make a multi-step change (batch of new docs, folder restructure), pause between steps to let the browser preview catch up. The CRDT edit streams live; the preview follows your edit cadence. Don't batch 10 writes in a row — interleave the writes so the user watching the browser sees the narrative progress.

If a hub doc exists in a folder, update it as you change children. Don't batch five child edits and then update the hub — write child → update hub → write next child.

This is primarily a human-watchability concern — the user watches edits land in the preview; interleaved cadence makes the narrative legible.

## Anti-patterns — at a glance

| Task                                          | Don't                                                     | Do                                                                 |
| --------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------ |
| List a markdown-heavy dir                     | `Bash: ls specs/`                                         | `exec("ls specs/")`                                                |
| Find all SPEC.md files                        | `Glob: **/SPEC.md`                                        | `exec("find specs -name SPEC.md")`                                 |
| Search a phrase across markdown               | `Grep: "pattern" *.md`                                    | `search({ query: "pattern" })`                                     |
| Read an individual doc                        | `Read: specs/foo/SPEC.md`                                 | `exec("cat specs/foo/SPEC.md")` or `read_document(...)`            |
| Explore a markdown-heavy dir                  | `Agent(Explore): "..."`                                   | Do `exec`-based exploration yourself                               |
| Edit without preview                          | `write_document(...)` direct                              | `get_preview_url` → open browser → `write_document`                |
| Reference another doc                         | `` `[text](./page.md)` `` (backticked) or HTML `<a>`      | `[text](./page.md)` (raw markdown)                                 |
| Embed an image                                | `<img src="...">` (HTML) or hot-linked external URL       | Fetch + save locally + `![meaningful alt](./assets/images/path)`   |
| Write a factual claim                         | plausible prose without citation                          | prose with `[source](URL)` per Grounding rule                      |
| Add an image                                  | empty alt `![](./x.png)` or generic alt `![image](./x)`   | meaningful alt + source caption below                              |
| Catalog folder contents                       | create `INDEX.md` hub file                                | add `folders:` entry in `.open-knowledge/config.yml`               |
| Fork a skill and expect no stomp              | Edit installed SKILL.md                                   | `npx skills remove` before CLI upgrade                             |

## Workflow tools — when to invoke them

Three MCP tools build on the primitives above and correspond to [Karpathy's three-layer knowledge-base pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f):

| Tool | Layer | When to invoke |
| --- | --- | --- |
| `ingest` | Raw sources (immutable) | User shares a URL, PDF, or file to preserve verbatim. No analysis in the file itself — takeaways go back to the user in chat. |
| `research` | Wiki, provisional | User asks you to investigate, compare alternatives, or synthesize multiple sources. Produces a `status: provisional` article with a `sources:` list. Follows scan-first routing, a STOP scoping gate, 3P-external framing, and a validate checklist — the tool body enforces each step. |
| `consolidate` | Wiki, canonical | Team has actually decided after research and wants the outcome committed as source-of-truth. Starts with a STOP gate confirming the decision exists; writes a `status: canonical` article with a `supersedes:` chain. |

Each tool returns a multi-step instructional body when invoked. The bodies enforce their own gates — follow the numbered steps in order, don't skip the STOP gates.

Typical day-2 flow: user shares a URL → `ingest` (preserve) → user asks "now research this" → `research` (provisional article + `ingest`s more sources as needed) → decision lands → `consolidate` (canonical article, supersedes the research).

**Do not chain silently.** After `ingest`, ask the user whether to proceed to `research`. After `research`, let the user decide whether the findings are ready to `consolidate`. Each tool completes on its own terms — the user drives the transitions.

**Project scaffolding is a CLI operation (optional).** Users who want the Karpathy three-layer layout as their folder structure can run `ok seed` once from a terminal. That command scaffolds `external-sources/` + `research/` + `articles/`, seeds an append-only `log.md` at the project root, and writes matching `config.yml` `folders:` entries so agents see layer descriptions at every `exec("ls <folder>")` call. It is **not required**: the three workflow tools above work against any folder structure the project already uses (`specs/`, `docs/`, `reports/`, or anything else). Only mention `ok seed` if the user explicitly asks for a starter layout or wants the Karpathy pattern specifically.

## Server lifecycle

If `write_document` or `edit_document` returns a "Hocuspocus server is not running" error, start it with `ok start` (via Bash) and retry. Never fall back to native `Edit` / `Write` for in-scope markdown — always route through the MCP write tools so edits go through the CRDT with proper attribution.

## Scope recap

When MCP is connected, the server's `instructions` echo the **resolved** `dir` / `include` / `exclude` for this session — treat that table and `.open-knowledge/config.yml` as two views of the same rules. `.gitignore` still applies.

Default mental model (no jargon): unless this project narrowed `content.include`, **every `.md` and `.mdx` under `content.dir`** is an Open Knowledge document — including under `specs/`, `reports/`, `docs/`, etc. If `content.include` is non-default, read `config.yml` once per turn so you do not mis-classify paths.
