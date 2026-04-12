# Evidence: AFFiNE

**Dimension:** Folder-as-workspace, mutation behavior, sidecar, storage model
**Date:** 2026-04-12
**Sources:** github.com/toeverything/AFFiNE, docs.affine.pro, blocksuite.io, community.affine.pro

---

## Key sources referenced

- [GitHub issue #14118 — Sync a local/server folder of Markdown files with AFFiNE](https://github.com/toeverything/AFFiNE/issues/14118) — closed as "not planned" (Dec 2025)
- [GitHub issue #1923 — Support editing single markdown file](https://github.com/toeverything/AFFiNE/issues/1923) — closed as obsolete
- [GitHub issue #8263 — Can I just choose a location for my local storage?](https://github.com/toeverything/AFFiNE/issues/8263) — local storage path constraints
- [GitHub discussion #4616 — Where is my page stored](https://github.com/toeverything/AFFiNE/discussions/4616) — `userData` directory confirmation
- [GitHub PR #8811 — feat(nbstore): add sqlite implementation](https://github.com/toeverything/AFFiNE/pull/8811) — storage backend
- [GitHub PR #11712 — fix(editor): markdown html and image import](https://github.com/toeverything/AFFiNE/pull/11712) — import workflow
- [OctoBase GitHub](https://github.com/toeverything/OctoBase) — CRDT database layer
- [BlockSuite — Framework overview](https://blocksuite.io/guide/overview.html) — document-centric CRDT architecture
- [BlockSuite — Data synchronization](https://blocksuite.io/guide/data-synchronization.html)
- [AFFiNE docs — BlockSuite Adapter Reference](https://docs.affine.pro/blocksuite-wip/store/transformer-and-adapter) — explicit data-loss warning
- [AFFiNE blog — Study up, on Markdown](https://affine.pro/blog/study-up-on-markdown) ⚠️ vendor source, incentive bias
- [Community forum — Full Workspace export to zip or markdown](https://community.affine.pro/c/feature-requests/full-workspace-export-to-zip-or-markdown)

---

## Findings

### Finding: AFFiNE has no "open folder of markdown files" flow; it is a block-based CRDT workspace
**Confidence:** CONFIRMED
**Evidence:** [GitHub issue #14118](https://github.com/toeverything/AFFiNE/issues/14118)

Maintainer `darkskygit` closed the folder-sync feature request (Dec 21, 2025) with:

> "markdown cannot express all the styles supported by affine, so it cannot support two-way synchronization."

[GitHub issue #1923](https://github.com/toeverything/AFFiNE/issues/1923) (request to open a single `.md` file for direct editing) was closed as "Obsolete." No "point at folder" UI exists.

**Implications:** There is no analog to Obsidian's "Open folder as vault." AFFiNE's model is Notion-style workspaces backed by a CRDT store, not files on disk.

---

### Finding: AFFiNE stores workspace data as binary CRDT (Yjs snapshots) in the OS userData directory
**Confidence:** CONFIRMED
**Evidence:** [GitHub discussion #4616](https://github.com/toeverything/AFFiNE/discussions/4616), [GitHub issue #8263](https://github.com/toeverything/AFFiNE/issues/8263), [GitHub PR #8811](https://github.com/toeverything/AFFiNE/pull/8811)

Local storage lives in:
- macOS: `~/Library/Application Support/AFFiNE/`
- Linux: `~/.config/AFFiNE/`
- Windows: `%APPDATA%/AFFiNE/`

The data is a SQLite database (`nbstore` SQLite backend added in PR #8811, merged Dec 2024) holding Yjs CRDT snapshots + incremental updates as binary `Uint8Array`. Not human-readable, not markdown.

From issue #8263, an earlier configurable-location feature was removed:

> "this was a feature we used to have, but was removed later [because] users who placed storage in sync services like iCloud or Dropbox experienced serious data loss issues ... the system cannot safely merge synced files with locally stored data."

**Implications:** The workspace is not a directory you can point a text editor, git, or `grep` at. It's an opaque binary store.

---

### Finding: To work with existing markdown files, AFFiNE requires a one-way import that is lossy
**Confidence:** CONFIRMED
**Evidence:** [AFFiNE docs — BlockSuite Adapter Reference](https://docs.affine.pro/blocksuite-wip/store/transformer-and-adapter), [GitHub PR #11712](https://github.com/toeverything/AFFiNE/pull/11712)

Workflow: "Import" button → select `.md` file → parsed by BlockSuite adapter → converted to block tree → stored as CRDT doc. The original `.md` file is not touched (it is read and copied, not modified or deleted), but it is no longer the thing you are editing — the CRDT representation inside AFFiNE is.

Official docs explicitly flag lossiness:

> "adapters may result in data loss during the conversion process, as the target format might not support all the structures present in the original data."

**Implications:** The `.md` file on disk and the AFFiNE workspace become independent copies. Editing the `.md` file outside AFFiNE does not update the workspace. Editing inside AFFiNE does not update the `.md` file.

---

### Finding: Export back to markdown is per-page, lossy, and has no bidirectional sync
**Confidence:** CONFIRMED
**Evidence:** [Community forum — Full workspace export feature request](https://community.affine.pro/c/feature-requests/full-workspace-export-to-zip-or-markdown), [GitHub issue #12983](https://github.com/toeverything/AFFiNE/issues/12983), [affine-reader issue #19](https://github.com/toeverything/affine-reader/issues/19)

- Per-page markdown/HTML export via the UI "Export" button
- No native batch/workspace-level export to a folder of `.md` files
- Third-party tools (`affine-reader`, `affine-exporter`) provide workspace → markdown conversion but are community-maintained
- Issue #14118 confirms: no bidirectional folder sync is planned

**Implications:** Once content is in AFFiNE, getting it back out to a clean folder of `.md` is a manual, lossy operation. Not a viable "use AFFiNE like Obsidian" workflow.

---

### Finding: AFFiNE's source of truth is a Yjs CRDT document in SQLite, not markdown
**Confidence:** CONFIRMED
**Evidence:** [BlockSuite overview](https://blocksuite.io/guide/overview.html), [OctoBase README](https://github.com/toeverything/OctoBase)

BlockSuite uses a "document-centric architectural pattern" with CRDT "natively built into the data layer." OctoBase (AFFiNE's underlying DB) is an "offline-available, scalable, self-contained collaborative database" with SQLite/PostgreSQL/S3 backends. Markdown is treated as an import/export adapter format — a foreign format the CRDT can translate to and from, with documented fidelity loss.

⚠️ **Vendor-incentive flag:** AFFiNE markets "local-first" and "you own your data" ([affine.pro](https://affine.pro/blog/study-up-on-markdown)), but "own" here means the binary file in your OS userData dir, not portable `.md`. The primary-source issues (#14118, #8263) give the unvarnished technical position.

---

## Gaps / follow-ups

- Recent (2025-2026) releases have added "File System Access"-style features in some other apps — no evidence of such a mode in AFFiNE as of the Dec 2025 maintainer statement closing #14118
- The exact SQLite schema used by `nbstore` is not documented for external tool developers; reverse-engineering is possible via source but not relied on here
