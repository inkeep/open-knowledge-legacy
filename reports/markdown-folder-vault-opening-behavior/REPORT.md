---
title: "Markdown Folder Vault Opening Behavior: Obsidian, AFFiNE, Logseq, Foam, Dendron, SilverBullet"
description: "Does pointing a markdown editor at an existing folder of .md files require conversion or mutation? Compares Obsidian, AFFiNE, Logseq (both file-mode and DB-mode), Foam, Dendron, and SilverBullet on folder-as-vault semantics, sidecar directories written on first open, whether existing .md files are modified, opt-out options, and storage source of truth."
createdAt: 2026-04-12
updatedAt: 2026-04-12
subjects:
  - Obsidian
  - AFFiNE
  - Logseq
  - Foam
  - Dendron
  - SilverBullet
  - BlockSuite
  - OctoBase
  - Datascript
topics:
  - folder vault semantics
  - markdown mutation
  - sidecar directories
  - storage source of truth
---

# Markdown Folder Vault Opening Behavior

**Purpose:** For a user evaluating whether an editor will treat an existing folder of `.md` files as a first-class, non-invasive workspace — versus requiring import/conversion or silently rewriting content — this report compares how six tools behave when pointed at an existing folder: Obsidian, AFFiNE, Logseq (covering both its file-mode and DB-mode), Foam, Dendron, and SilverBullet.

---

## Executive Summary

The six tools split into three categories on this question:

- **True non-invasive folder-of-markdown editors** — **Obsidian**, **Foam**, **SilverBullet**, and **Logseq file-mode** all accept an arbitrary folder of `.md` files without conversion. Of these, **Foam is the lowest-impact** (it writes no required sidecar — it's a VS Code extension that observes the folder), and **Obsidian/SilverBullet** both add sidecars that are essentially derived caches or config (`.obsidian/` and `.silverbullet.db*` respectively). Markdown on disk is the source of truth.
- **Folder-native but mutation-invasive** — **Dendron** and **Logseq** both edit the markdown files in ways that change their shape. Dendron injects required YAML frontmatter (`id`, `title`) and the Doctor command can rewrite every pre-existing `.md` to add it. Logseq (file-mode) does not overwrite on open (post-Aug 2022) but serializes edits through its outliner, converting flat prose into `- bullets` and potentially injecting `id::` properties.
- **Not folder-of-markdown tools at all** — **AFFiNE** and **Logseq DB-mode** store content in an opaque SQLite database as source of truth. The only way to get existing `.md` into either is a one-way, lossy import. AFFiNE's maintainer closed the folder-sync feature request as "not planned" in Dec 2025; Logseq's team reframed DB-mode as "database as single source of truth" with markdown export explicitly secondary.

**Key Findings:**

- **Four of six tools (Obsidian, Foam, SilverBullet, Logseq file-mode) can open any folder of `.md` and preserve it as the source of truth.** Each adds a sidecar but none mutate `.md` content merely by opening.
- **Dendron is the most frontmatter-aggressive tool.** It expects every note to carry Dendron-shaped YAML; running `Doctor: fixFrontmatter` will inject it across an entire vault.
- **Logseq DB-mode is architecturally different from file-mode and breaks the "open a folder" promise.** The `db.sqlite` file becomes authoritative; markdown round-trip is one-way and lossy. File-mode remains the recommended default as of April 2026 (DB-mode is still in beta).
- **AFFiNE has no folder-of-markdown mode; markdown is an import-only adapter format.** Primary storage is Yjs CRDT binary in SQLite under OS userData.

---

## Research Rubric

**Primary question:** Can you point the editor at an existing folder of `.md` files and edit them directly, or does the tool require a conversion / mutative setup step first?

**Dimensions:**

| # | Dimension | Depth |
|---|-----------|-------|
| D1 | Folder-as-vault / workspace / graph model — can you point at an arbitrary existing folder? | Moderate |
| D2 | What the tool writes on first open — sidecar directories, config files, timing | Deep |
| D3 | Does the tool modify existing `.md` files on first open, or later during edit? | Deep |
| D4 | Opt-out / minimizing mutation — relocation, gitignore, read-only modes | Light |
| D5 | Storage model — is `.md` on disk the source of truth, or is there an authoritative DB? | Light |

**Non-goals:** Sync/publish services, plugin ecosystems, rendering fidelity, performance at scale, collaboration features.

**Stance:** Factual (no recommendations).

**Tools in scope:** Obsidian, AFFiNE, Logseq (file-mode and DB-mode), Foam, Dendron, SilverBullet. Initial scope (Obsidian, AFFiNE, Logseq file-mode) was grounded in existing repo reports ([openknowledge-competitive-landscape](../openknowledge-competitive-landscape/REPORT.md), [wiki-links-backlinks-architecture](../wiki-links-backlinks-architecture/REPORT.md)). Extended on 2026-04-12 to add Logseq DB-mode (closes a Logseq coverage gap), Foam/Dendron (VS Code extensions — the "extension's behavior" is non-trivial even if VS Code's folder-open is trivial), and SilverBullet (self-hosted web app with folder-as-space model). Notion/Confluence/Outline/Chroma still excluded — no folder-of-markdown model.

---

## Comparison Table

| Question | **Obsidian** | **AFFiNE** | **Logseq (file-mode)** | **Logseq (DB-mode)** | **Foam** | **Dendron** | **SilverBullet** |
|---|---|---|---|---|---|---|---|
| Point at any folder and open directly? | ✅ Yes | ❌ No folder model | ⚠️ Yes, but imposes `pages/`, `journals/`, `assets/`, `logseq/` subdirs | ❌ Must import from file-mode; no direct folder binding | ✅ Yes (via VS Code) | ⚠️ Must run `Initialize Workspace` | ✅ Yes (`silverbullet <path>`) |
| Conversion / import required? | ❌ None | ✅ Import required (lossy) | ❌ None (post-Aug 2022) | ✅ One-way File-to-DB import | ❌ None | ⚠️ Structural init, no content conversion | ❌ None |
| Sidecar created on open | `.obsidian/` at vault root | n/a (data in OS userData) | `logseq/` subfolder + 3 content subfolders | `db.sqlite` + accessory dirs | None required | `dendron.yml`, `dendron.code-workspace`, `root.md` | `.silverbullet.db*`, `_plug/`, `index.md`, `SETTINGS.md` |
| Existing `.md` files touched on open? | ❌ No | n/a (not read as source) | ❌ No (post-Aug 2022 fix) | n/a (not read as source; only via importer) | ❌ No | ❌ No on open, but Doctor command will inject frontmatter on demand | ❌ No |
| Existing `.md` files touched on edit? | Only the edited file | n/a (edits live in CRDT store) | ⚠️ Re-serialized through outliner; bullets/`id::` injected | n/a (edits in `db.sqlite`, not `.md`) | Only the edited file | ⚠️ Auto-injects `id` + `title` frontmatter in new notes; Doctor can retrofit existing | Only the edited file |
| Source of truth | `.md` on disk | Yjs CRDT in SQLite (OctoBase / nbstore) | Datascript DB at runtime; `.md` at rest | `db.sqlite` (authoritative) | `.md` on disk | `.md` on disk (Dendron-shaped frontmatter + dot hierarchy) | `.md` on disk; SQLite is regenerable index |
| Export back to clean `.md`? | ✅ Trivial (it's already `.md`) | ⚠️ Per-page, lossy, no batch | ⚠️ Already `.md` but reshaped as bullets | ⚠️ One-way, lossy (tags drop) | ✅ Trivial | ✅ Trivial (but with injected frontmatter) | ✅ Trivial |
| Sidecar gitignorable? | ✅ Community-standard patterns | n/a | ✅ `logseq/bak/` + `pages-metadata.edn` | `db.sqlite` typically committed (it IS the content) | Nothing to ignore | Configs typically committed | `.silverbullet.db*` typically ignored |

---

## Detailed Findings

### D1: Folder-as-vault / workspace / graph model

**Finding:** Only Obsidian and Logseq treat a filesystem folder as the primary workspace unit. AFFiNE does not.

**Evidence:** [evidence/obsidian.md](evidence/obsidian.md), [evidence/affine.md](evidence/affine.md), [evidence/logseq.md](evidence/logseq.md)

**Obsidian:** Any folder becomes a vault the moment you choose it from "Open folder as vault." No required structure, no required files. Vault registration metadata lives outside the folder in a per-machine config ([forum — Open folders as vaults from CLI](https://forum.obsidian.md/t/open-folders-as-vaults-from-the-cli/89714)).

**AFFiNE:** There is no "open folder" flow. The feature request was closed as not planned in Dec 2025 ([issue #14118](https://github.com/toeverything/AFFiNE/issues/14118)). AFFiNE workspaces are opaque CRDT stores, not directories.

**Logseq:** "Open a local directory" exists, but Logseq expects — and auto-creates — four sibling subdirectories: `pages/`, `journals/`, `assets/`, `logseq/`. A pre-existing flat folder of `.md` files at the root doesn't "just work"; files need to be in `pages/` to be discovered as pages ([discuss — file structure](https://discuss.logseq.com/t/comprehending-file-structure-requesting-help-to-resolve-unexpected-behavior/23605)).

**Implications:**
- For a user who just wants to open `/path/to/my/notes` and start editing, only Obsidian matches that mental model fully.
- Logseq technically opens any folder, but the user will see new subfolders appear and may need to move content into `pages/`.
- AFFiNE is a fundamentally different category of tool — a block workspace, not a markdown-folder editor.

---

### D2: What the tool writes on first open

**Finding:** Obsidian writes a `.obsidian/` sidecar with config JSON files (some rewritten on every app startup). Logseq writes a `logseq/` subfolder plus three content directories. AFFiNE writes binary CRDT data to the OS userData directory, outside the folder entirely.

**Evidence:** [evidence/obsidian.md](evidence/obsidian.md), [evidence/affine.md](evidence/affine.md), [evidence/logseq.md](evidence/logseq.md)

**Obsidian's `.obsidian/`** typically contains `app.json`, `workspace.json`, `appearance.json`, `core-plugins.json`, `community-plugins.json`, `hotkeys.json`, and `plugins/` / `themes/` / `snippets/` subdirectories. A feature request explicitly documents that `app.json`, `appearance.json`, `community-plugins.json`, and `core-plugins.json` "are modified as soon as Obsidian starts" regardless of user changes ([feature request #111529](https://forum.obsidian.md/t/dont-update-app-json-appearance-json-community-plugins-json-core-plugins-json-on-app-start-for-no-reason/111529)). This is why `workspace.json` is nearly always gitignored.

**Logseq's `logseq/`** contains `config.edn`, `custom.css`, `custom.js`, `graphs-txid.edn`, `pages-metadata.edn`, `bak/` (rolling backups of modified pages), and `.recycle/`. The graph root also gains `pages/`, `journals/`, `assets/` sibling directories if they didn't exist.

**AFFiNE** doesn't write into your folder because your folder isn't the workspace. Data lives in `~/Library/Application Support/AFFiNE/` (macOS), `~/.config/AFFiNE/` (Linux), or `%APPDATA%/AFFiNE/` (Windows) as a SQLite database holding Yjs snapshots + incremental updates ([discussion #4616](https://github.com/toeverything/AFFiNE/discussions/4616), [PR #8811](https://github.com/toeverything/AFFiNE/pull/8811)). Storage location was once configurable but was removed to avoid data loss on cloud-synced folders ([issue #8263](https://github.com/toeverything/AFFiNE/issues/8263)).

**Implications:**
- All three tools produce persistent artifacts on open, but the location differs: in-folder sidecar (Obsidian, Logseq) vs out-of-folder DB (AFFiNE).
- Obsidian's `.obsidian/workspace.json` churning on every app start is a documented git-noise source — not content mutation, but config mutation that shows up in version control.

---

### D3: Does the tool modify existing `.md` files?

**Finding:** Obsidian does not modify existing `.md` files on open or until the user edits them. Logseq does not modify them on open (post-Aug 2022), but does normalize them through an outliner model on edit-and-save. AFFiNE does not modify `.md` files at all — because it does not read them as source; it only imports them into a separate CRDT store.

**Evidence:** [evidence/obsidian.md](evidence/obsidian.md), [evidence/logseq.md](evidence/logseq.md), [evidence/affine.md](evidence/affine.md)

**Obsidian:** Opening the vault parses notes into an in-memory `MetadataCache` but does not rewrite them. Documented file mutations happen only during explicit user actions (editing a note, renaming a file that has incoming `[[wikilinks]]` — see [forum — Preserve file mtime when updating internal links](https://forum.obsidian.md/t/preserve-file-modification-time-when-updating-internal-links/25629)). No automatic frontmatter injection, no heading/bullet normalization.

**Logseq:** Prior to August 2022, [issue #1332](https://github.com/logseq/logseq/issues/1332) documented data loss where Logseq overwrote existing `.md` files with its serialized representation. Commit `5da5009` fixed this with the explicit message "do not overwrite .md file if it already exist." Post-fix, existing files survive first open. However, the outliner model shapes content on *edit*: flat paragraphs get serialized as `- bullets`, and referenced blocks may gain `id::` property lines. "Document Mode" hides bullets visually but they remain in the stored file ([discuss — Long Form Mode](https://discuss.logseq.com/t/true-document-long-form-mode-support-changing-page-type-from-outline-to-document/12153)).

**AFFiNE:** Import is a copy-and-transform operation. The source `.md` is read but not modified; the target is a new BlockSuite-format CRDT doc inside AFFiNE's SQLite store. AFFiNE's own docs warn that "adapters may result in data loss during the conversion process" ([BlockSuite Adapter Reference](https://docs.affine.pro/blocksuite-wip/store/transformer-and-adapter)). After import, editing happens in the CRDT — changes do not propagate back to the `.md` file on disk.

**Implications:**
- Obsidian: the user's existing `.md` content round-trips identically until they choose to edit.
- Logseq: first open is safe; editing is not format-preserving — prose becomes bulleted outline blocks.
- AFFiNE: `.md` files are an inert backup after import; real work diverges into the CRDT store.

---

### D4: Opt-out / minimizing mutation

**Finding:** Obsidian and Logseq sidecar directories can be gitignored with well-known patterns. Neither has a "read-only" or "strict format preservation" mode. AFFiNE's storage location is not user-configurable (removed in a past release).

**Evidence:** [evidence/obsidian.md](evidence/obsidian.md), [evidence/logseq.md](evidence/logseq.md), [evidence/affine.md](evidence/affine.md)

**Obsidian:** Community conventions span three tiers of `.gitignore` aggressiveness — from ignoring all of `.obsidian/` to committing most of it except `workspace.json` ([forum — gitignore conventions](https://forum.obsidian.md/t/what-should-i-gitignore-for-my-vaults-github-repository/101077), [github/gitignore PR #4370](https://github.com/github/gitignore/pull/4370)). No documented mechanism to relocate `.obsidian/` or operate in a read-only mode.

**Logseq:** Maintainer guidance is to gitignore `logseq/bak/` (rolling backups) and optionally `pages-metadata.edn` (per-machine file-time index) ([issue #3189](https://github.com/logseq/logseq/issues/3189), [discussion #4957](https://github.com/logseq/logseq/discussions/4957)). No setting prevents outliner-driven reformatting on edit. `:preferred-format :markdown` in `config.edn` only controls *new page format*, not preservation of existing content.

**AFFiNE:** Storage is at the OS userData path, hardcoded since the configurable-path feature was removed to prevent data loss with cloud-sync tools ([issue #8263](https://github.com/toeverything/AFFiNE/issues/8263)).

---

### D5: Storage model — source of truth

**Finding:** Obsidian treats `.md` on disk as authoritative. AFFiNE treats a binary Yjs CRDT document as authoritative. Logseq is a hybrid: markdown files are the persistent store, but a Datascript in-memory DB is authoritative during a session.

**Evidence:** [evidence/obsidian.md](evidence/obsidian.md), [evidence/affine.md](evidence/affine.md), [evidence/logseq.md](evidence/logseq.md)

**Obsidian:** The [Obsidian API README](https://github.com/obsidianmd/obsidian-api/blob/master/README.md) describes `Vault` as "the interface that lets you interact with files and folders" and `MetadataCache` as a cache of parsed metadata. Cache, not authority. External processes reading the folder see canonical state.

**AFFiNE:** OctoBase (or its successor `nbstore`) stores the CRDT doc as binary data in SQLite. BlockSuite's architecture is "document-centric" with CRDT "natively built into the data layer" ([BlockSuite overview](https://blocksuite.io/guide/overview.html)). Markdown is an adapter format — a translation target, not a store.

**Logseq:** The [codebase overview](https://github.com/logseq/logseq/blob/master/CODEBASE_OVERVIEW.md) states: "On startup, files load from local or cloud storage, parse (potentially decrypt), and populate DataScript. When users type, edit handlers simultaneously persist changes and update the database query cache." The round-trip through Datascript is where reformatting can happen even without an intentional content change.

**Implications:**
- Tools that read the folder directly (git, grep, ripgrep, AI agents using filesystem MCP) see canonical state only for Obsidian.
- For AFFiNE, external tools see nothing useful — just a binary SQLite file.
- For Logseq, external tools see the last-saved markdown, but the outliner's serialization may differ from what a user typed.

---

### Logseq DB-Mode (addendum to D1–D5)

**Finding:** Logseq's DB-mode (announced April 2024, still in beta as of April 2026) is a fundamentally different storage architecture from file-mode. DB-mode stores content in a single `db.sqlite` file (via a forked Datascript on SQLite, compiled to WASM). There is no "open folder of `.md`" flow — the only entry path is the **File-to-DB graph importer** (one-way). Export back to markdown is lossy (tags and properties drop). The maintainer committed to supporting both modes and described "seamless two-way sync" as a long-term goal, but all current evidence positions DB-mode as "database is the single source of truth."

**Evidence:** [evidence/logseq-db-version.md](evidence/logseq-db-version.md)

**Key quotes:**

> "No, we'll continue to support both file-based and database-based graphs. Our long-term goal is to achieve seamless two-way sync between the database and markdown files." — Tienson, [April 2024 announcement](https://discuss.logseq.com/t/why-the-database-version-and-how-its-going/26744)

> "While there is an automated backup for DB graphs, we recommend only using DB graphs for testing purposes." — [Current docs](https://github.com/logseq/docs/blob/master/db-version.md)

**Decision trigger:** If a user is evaluating Logseq today (April 2026), file-mode remains the correct choice for "open a folder and edit." DB-mode does not satisfy the "non-invasive folder" requirement at all, and is not yet stable enough for production use.

---

### Foam (VS Code extension)

**Finding:** Foam is the **least invasive** tool in this report. It auto-activates when any markdown-containing folder is opened in VS Code. No sidecar directory, no database, no index file — the graph is held entirely in memory using VS Code's file watcher. No frontmatter injection, no content rewriting on open or edit. The only tool-adjacent artifact is an optional `.foam/templates/` directory (user-authored, not auto-generated). Markdown on disk is authoritative.

**Evidence:** [evidence/foam.md](evidence/foam.md)

**Implications:** Foam is the zero-impact option — install the extension, open a folder, and nothing on disk changes. The trade-off is that Foam has no out-of-editor capabilities (no CLI, no server, no search index).

---

### Dendron (VS Code extension)

**Finding:** Dendron requires an explicit `Initialize Workspace` command and writes `dendron.yml`, `dendron.code-workspace`, and a `root.md` seed. It does not rewrite existing `.md` files on initialization, but structurally pressures the user to add Dendron-shaped YAML frontmatter (`id`, `title`) to every note — files lacking frontmatter generate persistent editor warnings. Running `Doctor: fixFrontmatter` will inject frontmatter across the entire vault. Markdown-on-disk remains the authoritative store (no parallel DB), but the files accumulate Dendron-specific metadata.

**Evidence:** [evidence/dendron.md](evidence/dendron.md)

**Implications:** Dendron is more invasive than Obsidian/Foam in terms of what it *wants* to write into `.md` files (frontmatter injection), even though it does not mutate them without user action. A user who runs the Doctor command on a pre-existing folder will see every file modified.

---

### SilverBullet (self-hosted web app)

**Finding:** SilverBullet maps closely to Obsidian's model: point it at a folder (`silverbullet <path>`), and the folder becomes a "space" with markdown as the source of truth. On first run it creates `.silverbullet.db*` SQLite files (a regenerable index — not the authoritative store), `_plug/` (extension assets), and seeds `index.md` + `SETTINGS.md` if absent. It does not inject frontmatter or rewrite existing `.md` on open or edit. The documented stance is "truth is in the markdown."

**Evidence:** [evidence/silverbullet.md](evidence/silverbullet.md)

**Implications:** SilverBullet is the closest non-Obsidian tool to the "true folder editor" model. The SQLite files are caches (like Obsidian's MetadataCache), not authoritative stores. The main difference from Obsidian: SilverBullet is a web app (localhost), not a desktop app.

---

## Limitations & Open Questions

### Dimensions not fully covered

- **Exact first-open write timing for Obsidian's `.obsidian/`** — community setup guides consistently describe creation on first open, but no primary source explicitly says "opening and immediately closing without interaction still writes `.obsidian/`." Inferred from volatile-write behavior; not independently reproduced.
- **Logseq format normalization matrix (file-mode)** — no official documentation enumerates which markdown formatting Logseq preserves vs. normalizes on edit-and-save. Behavior was observed from community discussions, not from a formal fidelity test.
- **Logseq DB-mode stability timeline** — no official roadmap for DB-mode graduating out of beta or for file-mode deprecation; coexistence is committed but open-ended.
- **AFFiNE SQLite schema** — not publicly documented; third-party tools (`affine-reader`) reverse-engineer it.
- **Dendron `id` frontmatter requirement strictness** — whether notes without the `id` field are merely warned or functionally broken is not fully clear from the docs reviewed.
- **SilverBullet markdown normalization on save** — stance statements say markdown is authoritative, but edge cases (list marker style, indentation) were not tested.

### Out of scope (per rubric)

- Sync services (Obsidian Sync, Logseq Sync, AFFiNE Cloud)
- Plugin/extension ecosystems
- Mobile-specific behavior beyond the desktop vault/graph model
- Performance on large vaults/graphs
- Real-time collaboration features

---

## References

### Evidence Files

- [evidence/obsidian.md](evidence/obsidian.md) — Obsidian folder-as-vault behavior, `.obsidian/` sidecar, markdown non-invasiveness
- [evidence/affine.md](evidence/affine.md) — AFFiNE workspace model, CRDT storage, lossy markdown import
- [evidence/logseq.md](evidence/logseq.md) — Logseq file-mode: graph structure, outliner serialization, Datascript runtime
- [evidence/logseq-db-version.md](evidence/logseq-db-version.md) — Logseq DB-mode: SQLite storage, one-way import, "database as source of truth" reframe
- [evidence/foam.md](evidence/foam.md) — Foam: zero-sidecar VS Code extension, in-memory graph
- [evidence/dendron.md](evidence/dendron.md) — Dendron: required frontmatter injection, dot-hierarchy file naming, `dendron.yml`
- [evidence/silverbullet.md](evidence/silverbullet.md) — SilverBullet: self-hosted folder-as-space, regenerable SQLite index

### External Sources

**Obsidian**
- [Obsidian Help — Data storage](https://help.obsidian.md/data-storage)
- [Obsidian API README](https://github.com/obsidianmd/obsidian-api/blob/master/README.md)
- [Forum — Open Folder as Vault (mobile)](https://forum.obsidian.md/t/open-folder-as-vault-option-on-mobile/26341)
- [Forum — What does workspace.json do](https://forum.obsidian.md/t/what-does-workspace-json-do/68392)
- [Forum — Don't update app.json etc. on app start (#111529)](https://forum.obsidian.md/t/dont-update-app-json-appearance-json-community-plugins-json-core-plugins-json-on-app-start-for-no-reason/111529)
- [Forum — Where are my notes stored](https://forum.obsidian.md/t/where-and-in-which-format-are-my-notes-stored/60728)
- [Forum — What to gitignore](https://forum.obsidian.md/t/what-should-i-gitignore-for-my-vaults-github-repository/101077)
- [github/gitignore — Obsidian community patterns PR #4370](https://github.com/github/gitignore/pull/4370)

**AFFiNE**
- [GitHub — AFFiNE repo](https://github.com/toeverything/AFFiNE)
- [GitHub issue #14118 — folder sync closed as not planned](https://github.com/toeverything/AFFiNE/issues/14118)
- [GitHub issue #1923 — single markdown file editing](https://github.com/toeverything/AFFiNE/issues/1923)
- [GitHub issue #8263 — choose local storage location](https://github.com/toeverything/AFFiNE/issues/8263)
- [GitHub PR #8811 — nbstore SQLite implementation](https://github.com/toeverything/AFFiNE/pull/8811)
- [BlockSuite overview](https://blocksuite.io/guide/overview.html)
- [AFFiNE docs — BlockSuite Adapter Reference](https://docs.affine.pro/blocksuite-wip/store/transformer-and-adapter)
- [OctoBase GitHub](https://github.com/toeverything/OctoBase)

**Logseq (file-mode)**
- [blog.logseq.com — How to Set Up and Use Logseq Sync](https://blog.logseq.com/how-to-setup-and-use-logseq-sync/)
- [GitHub issue #1332 — do not overwrite .md file if it already exists](https://github.com/logseq/logseq/issues/1332)
- [GitHub issue #3189 — gitignore guidance](https://github.com/logseq/logseq/issues/3189)
- [GitHub CODEBASE_OVERVIEW.md](https://github.com/logseq/logseq/blob/master/CODEBASE_OVERVIEW.md)
- [discuss.logseq.com — Comprehending file structure](https://discuss.logseq.com/t/comprehending-file-structure-requesting-help-to-resolve-unexpected-behavior/23605)
- [discuss.logseq.com — True Document/Long Form Mode](https://discuss.logseq.com/t/true-document-long-form-mode-support-changing-page-type-from-outline-to-document/12153)
- [discuss.logseq.com — id property treatment](https://discuss.logseq.com/t/confused-by-how-logseq-treats-the-id-property/1558)

**Logseq (DB-mode)**
- [discuss.logseq.com — Why the database version and how it's going](https://discuss.logseq.com/t/why-the-database-version-and-how-its-going/26744)
- [discuss.logseq.com — Logseq OG (markdown) vs Logseq (DB:sqlite) FAQ](https://discuss.logseq.com/t/logseq-og-markdown-vs-logseq-db-sqlite/34608)
- [discuss.logseq.com — Database version: too drastic choice?](https://discuss.logseq.com/t/database-version-too-drastic-choice/20346)
- [discuss.logseq.com — Is there still a bi-directional approach of DB-Markdown?](https://discuss.logseq.com/t/is-there-still-a-bi-directional-approach-of-db-markdown-or-only-export-to-markdown-remains/26051)
- [discuss.logseq.com — Current Logseq DB Import Limitations](https://discuss.logseq.com/t/current-logseq-db-import-limitations/31172)
- [github.com/logseq/docs — db-version.md](https://github.com/logseq/docs/blob/master/db-version.md)
- [github.com/logseq/sqlite-db](https://github.com/logseq/sqlite-db/blob/master/README.md)
- [github.com/logseq/logseq — PR #11829 (basic markdown export for DB graphs)](https://github.com/logseq/logseq/pull/11829)

**Foam**
- [foamnotes.com — Creating Your First Workspace](https://foamnotes.com/user/getting-started/first-workspace.html)
- [foamnotes.com — Using Foam with VS Code Features](https://foamnotes.com/user/getting-started/get-started-with-vscode.html)
- [github.com/foambubble/foam](https://github.com/foambubble/foam)
- [github.com/foambubble/foam-template](https://github.com/foambubble/foam-template)

**Dendron**
- [wiki.dendron.so — Workspace](https://wiki.dendron.so/notes/c4cf5519-f7c2-4a23-b93b-1c9a02880f6b/)
- [wiki.dendron.so — Configuration](https://wiki.dendron.so/notes/f83c1d87-eac0-48f3-a5cf-8a69989d8ec1/)
- [wiki.dendron.so — Vaults](https://wiki.dendron.so/notes/6682fca0-65ed-402c-8634-94cd51463cc4/)
- [wiki.dendron.so — Frontmatter](https://wiki.dendron.so/notes/ffec2853-c0e0-4165-a368-339db12c8e4b/)

**SilverBullet**
- [silverbullet.md — home](https://silverbullet.md/)
- [silverbullet.md — Plugs](https://silverbullet.md/Plugs)
- [github.com/silverbulletmd/silverbullet](https://github.com/silverbulletmd/silverbullet)
- [community.silverbullet.md — Installation](https://community.silverbullet.md/t/installation/2117/14)
- [LWN.net — A look at the SilverBullet note-taking application](https://lwn.net/Articles/1030941/)

### Related Research

- [`openknowledge-competitive-landscape/`](../openknowledge-competitive-landscape/REPORT.md) — 7 primary competitors, storage models, AI strategies
- [`obsidian-karpathy-workflow-deep-dive/`](../obsidian-karpathy-workflow-deep-dive/REPORT.md) — Obsidian for agent workflows, ingestion, writing patterns
- [`wiki-links-backlinks-architecture/`](../wiki-links-backlinks-architecture/REPORT.md) — Obsidian vs Logseq vs AFFiNE link representations and index architectures
