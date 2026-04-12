# Evidence: Logseq

**Dimension:** Folder-as-graph, mutation behavior, sidecar, storage model
**Date:** 2026-04-12
**Sources:** github.com/logseq/logseq, docs.logseq.com, discuss.logseq.com, blog.logseq.com

---

## Key sources referenced

- [blog.logseq.com — How to Set Up and Use Logseq Sync](https://blog.logseq.com/how-to-setup-and-use-logseq-sync/) — "Open a local directory" UI flow
- [discuss.logseq.com — How to create a Logseq graph using existing Markdown files](https://discuss.logseq.com/t/how-to-create-a-logseq-graph-using-existing-markdown-files/8431) — auto-created subfolders
- [discuss.logseq.com — Comprehending file structure](https://discuss.logseq.com/t/comprehending-file-structure-requesting-help-to-resolve-unexpected-behavior/23605) — required folder layout
- [GitHub issue #1332 — Do not overwrite .md file if it already exists (data loss)](https://github.com/logseq/logseq/issues/1332) — historical data-loss bug, fixed Aug 2022
- [GitHub issue #3189 — Logseq should generate a .gitignore file](https://github.com/logseq/logseq/issues/3189) — what to gitignore
- [GitHub discussion #4957 — Should you gitignore pages-metadata.edn?](https://github.com/logseq/logseq/discussions/4957) — metadata file
- [GitHub discussion #11204 — How to have Logseq not format my notes into lists](https://github.com/logseq/logseq/discussions/11204) — outliner-imposed structure
- [discuss.logseq.com — Confused by how logseq treats the id: property](https://discuss.logseq.com/t/confused-by-how-logseq-treats-the-id-property/1558) — `id::` injection behavior
- [discuss.logseq.com — True Document/Long Form Mode](https://discuss.logseq.com/t/true-document-long-form-mode-support-changing-page-type-from-outline-to-document/12153) — document mode is visual-only
- [discuss.logseq.com — Converting existing text and markdown notes](https://discuss.logseq.com/t/converting-importing-existing-text-and-markdown-notes-into-logseq/27318) — manual reformatting required
- [GitHub CODEBASE_OVERVIEW.md](https://github.com/logseq/logseq/blob/master/CODEBASE_OVERVIEW.md) — Datascript runtime model
- [github.com/logseq/logseq/tree/master/deps/graph-parser](https://github.com/logseq/logseq/tree/master/deps/graph-parser) — graph parser library

---

## Findings

### Finding: Logseq accepts any folder as a graph but imposes a required subfolder structure
**Confidence:** CONFIRMED
**Evidence:** [discuss.logseq.com — Comprehending file structure](https://discuss.logseq.com/t/comprehending-file-structure-requesting-help-to-resolve-unexpected-behavior/23605), [discuss.logseq.com — Create graph using existing Markdown files](https://discuss.logseq.com/t/how-to-create-a-logseq-graph-using-existing-markdown-files/8431)

The UI flow is "Open a local directory." The selected folder becomes a graph root, but Logseq auto-creates four sibling directories inside it if they don't exist:

```text
<folder>/
├── logseq/       # config, css, js, backups
├── pages/        # .md pages
├── journals/     # daily notes
├── assets/       # attachments
└── whiteboards/  # whiteboard artifacts (if used)
```

These must be **siblings at the graph root** — Logseq will not discover `.md` files in arbitrary subdirectories without moving them to `pages/` (or expecting them there).

**Implications:** A pre-existing flat folder of `.md` files won't "just work" — Logseq expects them in `pages/`. Users typically need to move files into `pages/` before opening.

---

### Finding: Logseq creates a `logseq/` subdirectory with config and cache files on first open
**Confidence:** CONFIRMED (partial — exact first-open timing inferred)
**Evidence:** [GitHub issue #3189](https://github.com/logseq/logseq/issues/3189), [blog.logseq.com — Logseq Sync](https://blog.logseq.com/how-to-setup-and-use-logseq-sync/), [discuss.logseq.com — config.edn options](https://discuss.logseq.com/t/official-comprehensive-list-of-config-edn-options/4935)

Typical contents of the `logseq/` subfolder:
- `config.edn` — main configuration
- `custom.css`, `custom.js` — user customizations
- `graphs-txid.edn` — sync state/transaction id
- `pages-metadata.edn` — file creation/modification time index
- `bak/` — backup cache (Logseq keeps copies of modified pages here)
- `.recycle/` — soft-deleted pages

**Implications:** Similar in spirit to Obsidian's `.obsidian/`, but Logseq puts its sidecar *next to* content directories rather than as a single hidden root. The `bak/` and `.recycle/` directories grow over time.

---

### Finding: On first open, Logseq does NOT rewrite existing `.md` files (post-August 2022)
**Confidence:** CONFIRMED
**Evidence:** [GitHub issue #1332 — data-loss fix](https://github.com/logseq/logseq/issues/1332) (fixed in commit `5da5009`, Aug 2022)

The commit message is explicit: **"fix: do not overwrite .md file if it already exist"**. Prior to this fix, opening a graph could overwrite existing pages with Logseq's re-serialized version. Post-fix, existing `.md` files are preserved on open.

**Implications:** On a modern (2023+) Logseq build, opening a folder with existing notes will not destroy content on load. But this is a relatively recent guarantee — historical Logseq had a data-loss bug in exactly this scenario, so the community sentiment remains cautious.

---

### Finding: Editing existing `.md` files in Logseq reshapes them into the outliner/bullet format
**Confidence:** CONFIRMED
**Evidence:** [GitHub discussion #11204 — Not format my notes into lists](https://github.com/logseq/logseq/discussions/11204), [discuss.logseq.com — True Document/Long Form Mode](https://discuss.logseq.com/t/true-document-long-form-mode-support-changing-page-type-from-outline-to-document/12153), [discuss.logseq.com — Converting existing notes](https://discuss.logseq.com/t/converting-importing-existing-text-and-markdown-notes-into-logseq/27318)

Logseq is an outliner — every top-level element is a block (`- bullet`). Paragraphs authored as flat markdown get interpreted as implicit blocks and, when the user edits and saves, are serialized back with bullets and hierarchy markers.

From the "Long Form Mode" thread:

> "This toggle only hides the bullets — they still appear when you copy the content and when you open the document in another editor."

Document Mode is **visual-only**; the underlying file still carries the outliner structure. Block-referenced content also gets `id::` property injections (these are primarily an org-mode-compatibility feature but do appear in markdown files when blocks are referenced — see [discuss.logseq.com — id property thread](https://discuss.logseq.com/t/confused-by-how-logseq-treats-the-id-property/1558)).

**Implications:** Editing existing markdown inside Logseq is not non-invasive to file content. On first save-after-edit, flat prose may be normalized into bulleted blocks. This is distinct from Obsidian, where `- bullet` vs `plain paragraph` round-trip is preserved.

---

### Finding: Runtime authority is a Datascript in-memory DB; `.md` files are the persistent store
**Confidence:** CONFIRMED
**Evidence:** [CODEBASE_OVERVIEW.md](https://github.com/logseq/logseq/blob/master/CODEBASE_OVERVIEW.md), [graph-parser library](https://github.com/logseq/logseq/tree/master/deps/graph-parser)

From the codebase overview:

> "On startup, files load from local or cloud storage, parse (potentially decrypt), and populate DataScript. When users type, edit handlers simultaneously persist changes and update the database query cache."

Flow: markdown → `mldoc` parser → Datascript (authoritative during session) → on save, serialize back to markdown. Any divergence between parse-in and serialize-out is an opportunity for silent reformatting (list marker style, heading style, bullet indentation).

**Implications:** The "markdown on disk is source of truth" statement is true *only at rest*. During a session, Datascript is authoritative; re-serialization can normalize formatting even when the user didn't intentionally edit that prose.

---

### Finding: `logseq/bak/` is the main thing to gitignore; no "strict markdown preservation" mode exists
**Confidence:** CONFIRMED
**Evidence:** [GitHub issue #3189](https://github.com/logseq/logseq/issues/3189), [GitHub discussion #4957](https://github.com/logseq/logseq/discussions/4957)

Maintainer guidance on gitignore: ignore `logseq/bak/`; optionally `pages-metadata.edn` (per-machine file mtime index). Other `logseq/` files are intended to be versioned.

There is no documented setting to tell Logseq "do not reformat, preserve my flat markdown." The `:preferred-format :markdown` option in `config.edn` controls the *format* new pages are created in (`.md` vs `.org`), not whether existing markdown is preserved verbatim.

---

## Gaps / follow-ups

- Whether opening a graph on a *fresh* Logseq install triggers a one-time full-file re-serialization of existing `.md` (post-Aug 2022 behavior says no, but the Datascript round-trip could still produce incidental rewrites on first edit)
- Exact fidelity matrix for "what reformats on save" — no official doc enumerates the normalizations
