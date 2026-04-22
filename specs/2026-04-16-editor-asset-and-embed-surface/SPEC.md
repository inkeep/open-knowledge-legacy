# SPEC: Editor Asset + Embed Surface

**Status:** **Finalized** (2026-04-21; 13 decisions — 11 LOCKED, 1 REFUTED [D-A by D-M], 1 REMOVED [D-L]; plus D1-D4 DIRECTED; all P0 resolution gates pass; ready for `/ship`)
**Created:** 2026-04-16
**Last updated:** 2026-04-21
**Owner:** Nick Gomez
**Baseline commit:** 4b527410
**Worktree:** `.claude/worktrees/finalize-asset-embed-surface` on branch `finalize/asset-embed-surface`
**Builds on:** `reports/editor-input-surface-worldmodel/REPORT.md` — findings inventory from an earlier 30-decision draft SPEC that was developed in a sibling worktree but never committed to main. 7 prior-spec items became FR-1..FR-7 here (FR-8 endpoint-rename is net-new in this spec); others superseded, refuted, or fixed. See §9 for per-row disposition; triage outcomes are durable in `meta/_changelog.md`.
**Related:**
- `specs/2026-04-16-clipboard-mdast-canonical/` — text/HTML clipboard pipeline (shipped); this spec is file-upload paste/drop only
- `specs/2026-04-08-typed-component-nodes/` — Phase 2 Video/Audio/PDFViewer render dispatch triggered by wiki-embed extension (D-F read-time promotion)

**Inputs:**
- `reports/editor-input-surface-worldmodel/REPORT.md` (worldmodel + assess-findings triage)
- `reports/editor-asset-embed-patterns-across-universe/REPORT.md` (16-editor cross-survey, grounded D-I + D-C + D-D + D-H)

---

## 1) Problem statement (SCR)

**Situation.** Open Knowledge ships a working image-upload pipeline today (PR #171-era: `POST /api/upload-image` with multipart+busboy, magic-byte MIME sniff, `@tiptap/extension-file-handler` wiring, widget-decoration placeholders, sibling-dirname storage, filter-aware sirv serving). A canonical mdast clipboard pipeline handles text/HTML paste symmetrically across WYSIWYG and Source. Wiki-link text syntax `[[Page]]` is parsed and rendered. Filename sanitization, path-escape guards, SVG `<img>`-only rendering, and magic-byte MIME validation are in place.

**Complication.** Five user outcomes remain broken, and two shipped subsystems have narrow gaps that pull on the same code paths:

1. **Dropping a PDF, video, or audio file returns "Unsupported file type."** P1 dogfooders hit this in the first five minutes; P2 Obsidian refugees lose every non-image attachment on migration.
2. **Dropping the same screenshot twice creates `photo.png` and `photo-1.png`.** No content-hash dedup. Obsidian has carried this annoyance for six years because nobody shipped the fix; we can.
3. **Obsidian vault embed refs `![[photo.png]]` parse as `[[photo.png]]` wiki-link text, not as an image embed.** Upstream `remark-wiki-link` does NOT handle the `!` prefix. P2 refugees open their vault in OK and every inline image becomes a broken text link.
4. **There is no Obsidian vault detection.** `.obsidian/app.json` sits untouched; attachmentFolderPath, useMarkdownLinks, newLinkFormat settings go unread. P2 refugees configure twice — once in Obsidian, once in OK — with no migration.
5. **There are no user-facing upload config fields.** `MAX_UPLOAD_BYTES`, the MIME allowlist, and the asset location are hardcoded in source. Operators cannot tune these without a code patch.

Two adjacent gaps pull on the same code:

6. **CC1 broadcaster at `ch:'files'` has no consumer for a file-basename index.** The push-over-awareness primitive is ready; the index it should feed doesn't exist.
7. **`managed-rename-rewrite.ts:243` explicitly excludes image refs** via `line[idx - 1] !== '!'`. Image refs do NOT get rewritten when a containing doc moves — a silent portability bug in the shipped rename feature.

**Resolution.** Ship one coherent expansion of the upload+embed surface:
- **FR-1 All magic-byte-sniffable file types accepted on drop** (per D-A strict). FileHandler `allowedMimeTypes` and server `ALLOWED_MIME_TYPES` widened per FR-5 config defaults (image + PDF + video + audio + fonts + ZIP). Non-sniffable types rejected.
- **FR-1a Emit-shape dispatch** (per D-I wiki-embed). Extension-based routing at insert time: `renderableExtensions` (image + PDF + video + audio) → `![[filename.ext]]`; opaque types (ZIP, DOCX, generic) → `[filename](path)` markdown link fallback.
- **FR-2 Same-dirname sha256 dedup** with an explicit toast.
- **FR-3 `![[file.ext]]` embed parsing + emit + file-basename index** — new `wikiLinkEmbed` mdast node (distinct from existing `wikiLink`) + Foam-style shortest-path resolver at `packages/core/src/utils/path-resolve.ts`. Parsing covers read; emit (FR-1a) covers write. Render dispatches by extension: image → PM image node (P0); video/audio/PDF → P0 plain-link fallback, Phase 2 adds Video/Audio/PDFViewer MDX components (D-F read-time promotion).
- **FR-4 Obsidian vault detection** — non-destructive `.obsidian/app.json` read at server startup with pre-population of the new config defaults.
- **FR-5 Upload config schema** — `upload.*` section under the existing Zod `ConfigSchema` including `wikiEmbedExtensions` allowlist + free-form `attachmentFolderPath` string (D-J).
- **FR-6 CC1 reuse** for basename-index invalidation (per D-H widen file-watcher to emit asset DiskEvents; reuse `ch:'files'` — bundled into FR-3).
- **FR-7 Image-ref rewrite** on parent-doc rename via extension of `managed-rename-rewrite.ts`. `![alt](src)` markdown image refs get path recompute. `![[file.ext]]` wiki-embed refs NO rewrite needed — basename index resolves dynamically from the containing doc's dirname.
- **FR-8 Endpoint rename** (per D-G). `/api/upload-image` → `/api/upload`. Greenfield — no shim, client updates in the same PR.

Explicitly NOT in scope (evidence-backed declines from the worldmodel triage):
- Transport migration (old D10 raw-body rationale unsupported; shipped multipart stays)
- Paste decision heuristic (superseded by `specs/2026-04-16-clipboard-mdast-canonical/`)
- Global-`assets/` 1-way door (content has zero assets today; config exposes the choice)
- Outline's 6-step paste tree (superseded)

---

## 2) Goals

- **G1.** No dead-ends on file drop. Any reasonable file type (PDF, MP4, MP3, WAV, ZIP) drops cleanly and emits a usable markdown reference.
- **G2.** Obsidian refugees open their vault in OK and it "just works" — embed refs render, settings migrate, images render inline with shortest-path resolution.
- **G3.** Dropping the same screenshot twice in a note uses the existing file and tells the user so (no silent dedup, no storage bloat).
- **G4.** Operators can tune upload behavior (size limits, MIME allowlist, asset location, emit format) without forking the code.
- **G5.** Moving a doc that contains image refs keeps those refs resolving correctly — shipping-feature completeness.
- **G6.** Zero regressions to the shipped image-upload pipeline, shipped clipboard-mdast pipeline, shipped wiki-link text syntax, or shipped managed-rename for doc-to-doc links.

## 3) Non-goals

- **[NEVER]** NG1: Whole-vault content-hash dedup across different directories. Future Work if users report storage pressure the same-dir dedup doesn't relieve.
- **[NOT NOW]** NG2: Rich previews for PDF/video/audio (inline PDF viewer, video player, HTML5 audio player). Belongs to typed-component-nodes Phase 2 (Video/Audio/PDFViewer MDX components). D-F chose read-time promotion: in P0 the `![[file.mp4]]`/`![[file.pdf]]` wiki-embed resolves to a plain-link fallback node in WYSIWYG; Phase 2 wires the Video/Audio/PDFViewer rendering by extension. Storage shape (`![[file.ext]]`) does NOT change at Phase 2 — zero content migration.
- **[NEVER]** NG3: Image editing (crop/rotate/annotate/resize). Not the editor's problem.
- **[NEVER]** NG4: Note-to-note `[[Page Name]]` wiki-link resolution, backlinks panel, `[[` autocomplete, link-graph MCP tools. Bucket 7 / S10 scope. Disjoint key space (page titles vs file basenames) keeps the two indexes separate. FR-3 is EMBED-syntax only.
- **[NOT NOW]** NG5: Garbage collection of orphaned assets. `npx openknowledge gc` is a follow-on CLI command.
- **[NOT NOW]** NG6: Git LFS for large binaries. No user-facing byte cap (post-2026-04-22 amendment — see §Post-finalization amendment; the buffer-to-memory `upload.maxBytes` guard was made obsolete by the streaming pipeline). Revisit if someone hits practical sync ceilings from committing large binaries to git (e.g. 500MB+ video assets where git itself chokes — that would be the Git LFS trigger, not an OK-side cap).
- **[NOT NOW]** NG7: MCP `upload_asset` tool for agents. Agents write markdown refs; binary upload is a follow-on with its own security considerations.
- **[NOT NOW]** NG8: Thumbnail/lazy loading / blur placeholders. Revisit when large vaults surface performance issues.
- **[NOT NOW]** NG9: Paste-image-from-URL (clipboard contains URL → download bytes → store locally). Clipboard URL → `![](url)` direct-link is fine for P0.
- **[NOT NOW]** NG10: Drag-drop into a component's children region. Requires typed-component-nodes Phase 3.
- **[NOT NOW]** NG11: Note-to-note wiki-link **emit** (i.e., the old spec's `emitFormat: 'markdown' | 'wikilink'` toggle for `[[Page Name]]`-style links). This spec emits `![[file.ext]]` for file embeds (default, per D-I); note-to-note emit is Bucket 7 scope. The `emitFormat` config flag is retained in FR-5 but scoped to image emit only (`![[img.png]]` wiki-embed vs `![img](img.png)` plain markdown).
- **[NOT NOW]** NG12: Embed size/width modifiers (`![[image.png|640x480]]`). Spec parses the base embed; modifier round-trip is deferred. SilverBullet precedent exists (`parser.ts:26-86` supports `|200x300`) but modifier semantics (e.g., does Obsidian's `|640x480` mean px or rem?) warrant their own investigation.
- **[NOT UNLESS]** NG13: Transport migration (raw body POST vs shipped multipart). Not revisited unless concrete Bun formData binary bug surfaces in practice.
- **[NOT UNLESS]** NG14: Global `assets/` as default. FR-5's `attachmentFolderPath` default is `"./"` (co-located semantic per D-J); Obsidian refugees opt into global via their vault's `attachmentFolderPath` setting via FR-4 (e.g. `"attachments"` becomes a global path).

## 4) Personas

- **P1 — Nick / internal dogfooders.** Drags screenshots, PDFs, occasional binaries from Finder. Expects Bear/Typora feel. Today hits "Unsupported file type" on every non-image.
- **P2 — Obsidian refugees.** Have a vault with `![[photo.png]]` refs + `.obsidian/app.json` settings + existing attachment folder (vault root / configured / same-as-note). Expect "open vault in OK → it works." Today every non-image is lost and every embed ref looks like text.
- **P3 — AI agent via MCP.** Writes markdown with image/embed refs. Expects refs to resolve when the file exists. Not in P0 changes.
- **P4 — Operator / self-host admin.** Wants to bump upload size, add allowed MIME types, pin asset location. Today has to patch `packages/core/src/constants/upload.ts`.

## 5) User journeys

### P1 — Drop a PDF into a note

1. User drags `draft.pdf` from Finder into an open note `docs/meeting-notes.md`.
2. FileHandler accepts the file (MIME `application/pdf` now in allowlist per FR-1 + FR-5 default).
3. Widget decoration placeholder appears.
4. Client POSTs to `/api/upload` (renamed per FR-8 / D-G; greenfield has no prior release to deprecate from, so `/api/upload-image` is removed outright in the same PR) with `parentDocName: docs/meeting-notes.md`.
5. Server magic-byte-sniffs, validates against widened allowlist, sanitizes filename (unicode-preserving per F9), atomic-writes `docs/draft.pdf` (co-located), returns `{ src: "draft.pdf" }`.
6. Client dispatches on extension (FR-1a): `.pdf` is in `upload.wikiEmbedExtensions` default, so inserts `![[draft.pdf]]` at drop position.
7. In WYSIWYG: P0 renders as a plain-link fallback node (`draft.pdf` clickable). Phase 2 promotes to PDFViewer component at read-time.
8. In Obsidian (if user later opens the vault there): renders natively as inline PDF viewer. In Source view: shows `![[draft.pdf]]` verbatim.
9. Persistence → disk; file-watcher picks up `draft.pdf` (per FR-6 widened DiskEvents); CC1 fires `ch:'files'`; basename index (FR-3) registers the entry.

### P2 — Obsidian refugee opens vault

1. User runs `open-knowledge start` in a directory containing `.obsidian/app.json` with `{ attachmentFolderPath: "attachments", useMarkdownLinks: false, newLinkFormat: "shortest" }`.
2. Server startup (FR-4) detects `.obsidian/app.json`, reads the three fields, pre-populates `upload.attachmentFolderPath: 'attachments'` (global path form per D-J free-form string) and `upload.emitFormat: 'wikiembed'` (mapped from `useMarkdownLinks: false`) in the in-memory config. Does NOT write to `.open-knowledge/config.yml` — non-destructive.
3. File-watcher scans vault; basename index (FR-3) builds `Map<basename, string[]>` entries for every asset.
4. User opens `docs/meeting.md` containing `![[photo.png]]`.
5. Markdown pipeline parses `wikiLinkEmbed` mdast node (FR-3 new embed branch in tokenizer).
6. mdast → PM conversion resolves `photo.png` via basename index using shortest-path from `docs/meeting.md`'s dirname. Renders as image node.
7. User edits the note. On save, PM → mdast → serialize re-emits `![[photo.png]]` byte-identical.

### P3 — Same-screenshot-twice dedup

1. User takes Cmd+Shift+4 screenshot, drops it into `docs/notes.md`. Server writes `docs/pasted-20260416-140523.png`, client inserts `![[pasted-20260416-140523.png]]`.
2. Same day, user takes another screenshot, accidentally drops the same bytes (maybe re-dragged the same file).
3. Client POSTs to `/api/upload`.
4. Server computes sha256 of buffer, scans existing files in `docs/` for matching hash (FR-2 same-dir scope).
5. Match found at `docs/pasted-20260416-140523.png`. Server returns `{ ok: true, src: "pasted-20260416-140523.png", deduped: true }`.
6. Client shows toast (per D-B): "Already at `docs/pasted-20260416-140523.png` — reusing." Inserts `![[pasted-20260416-140523.png]]` (FR-1a emit for image extension).

### P4 — Operator tunes upload surface

_[Amended 2026-04-22 post-finalization: per §Post-finalization amendment at the bottom of this doc, `upload.maxBytes` was removed when uploads switched to streaming — there is no user-facing byte cap anymore. The remaining operator knobs (`attachmentFolderPath`, `emitFormat`, `dedup`, `wikiEmbedExtensions`) still round-trip via FR-5 exactly as described.]_

1. Admin edits `.open-knowledge/config.yml`:
   ```yaml
   upload:
     attachmentFolderPath: attachments     # Obsidian-style global folder
     emitFormat: markdown-image             # prefer ![alt](path) over ![[...]]
     dedup:
       mode: same-dir
       ui: toast
   ```
2. Restart server. Config loads via Zod (FR-5), validates, and the resolved `UploadConfig` flows to both `/api/upload` (write path) and `/api/upload-config` (client emit-dispatch). Uploads stream to disk regardless of size; disk fullness (`storage-full` → HTTP 507) is the only rejection axis.
3. Drops of arbitrary size succeed. Emit shape follows the new `emitFormat`.

### P5 — Doc rename preserving image refs (FR-7)

Two cases depending on what the ref looks like:

**Case A — plain markdown image ref `![alt](src)`:**
1. Doc `docs/meeting-notes.md` contains `![first draft](first-draft.png)` (same-dir co-located ref, pre-existing from before FR-1a shipped, or hand-authored).
2. User renames doc via UI/MCP: `docs/meeting-notes.md` → `archive/2026/meeting-notes.md`.
3. `managed-rename-rewrite.ts` (FR-7 extension) detects image ref, recomputes path: same-dir co-located means the asset DOESN'T move; the ref in the new location becomes `../../docs/first-draft.png` (or equivalent).

**Case B — wiki-embed ref `![[first-draft.png]]` (FR-1a emit form):**
1. Doc `docs/meeting-notes.md` contains `![[first-draft.png]]`.
2. User renames doc via UI/MCP: `docs/meeting-notes.md` → `archive/2026/meeting-notes.md`.
3. **No rewrite needed.** The ref resolves at read time via the basename index (FR-3b) from whatever dir the containing doc is in. `first-draft.png` stays at `docs/first-draft.png` on disk (per D-K refs-only); the index's `resolveEmbed("first-draft.png", "archive/2026/meeting-notes.md")` finds it via shortest-path.
4. D-K LOCKED refs-only: assets do NOT follow the doc. Matches Obsidian refugee expectation + avoids shared-asset breakage risk. Revisit if drift becomes a real complaint.

## 6) Requirements

### Functional

| # | Priority | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-1 | Must | Accept all file drops | Per D-M: every file drop is accepted, stored on disk, and inserted into the editor — no type-based rejection, no MIME allowlist gate. Post-2026-04-22 amendment: no user-facing byte cap either (streaming pipeline makes it architecturally obsolete; see §Post-finalization amendment). Emit shape determined by extension × `emitFormat` per the FR-1a emit-dispatch matrix (the single authoritative table). The SVG one-off extension-fallback at `api-extension.ts:3088-3093` is preserved so `.svg` files render as `<img>` per NFR-3. Server-side rejection axes are limited to `malformed-upload` (400), `storage-full` (507), `storage-readonly` (500), `collision-exhaustion` (500), `storage-error` (500). Test vectors: drop `.pdf`/`.mp4`/`.mp3`/`.wav`/`.ogg`/`.webm`/images (extensions in `wikiEmbedExtensions` default) → `![[filename.ext]]` emit; drop `.zip`/`.woff2`/`.dmg`/`.xyz`/`.txt`/`.csv`/`.json`/`.md`/`.yml` (extensions NOT in `wikiEmbedExtensions`) → opaque `[filename](path)` markdown-link emit; arbitrary-size drop succeeds (memory footprint O(1) via `HashingPassThrough` + `stream.pipeline`). |
| FR-1a | Must | Emit-shape dispatch by extension | After upload success, client dispatches insert by (extension × `emitFormat` × `wikiEmbedExtensions`). See emit-dispatch matrix below. Tests: image `emitFormat=wikiembed` → `![[foo.png]]`; image `emitFormat=markdown-image` → `![foo](foo.png)`; pdf `emitFormat=wikiembed` → `![[doc.pdf]]`; pdf `emitFormat=markdown-image` → `[doc.pdf](doc.pdf)` (markdown-link for non-image when in markdown-image mode); zip → `[archive.zip](archive.zip)` (opaque always uses markdown-link). **F8 fix absorbed (2026-04-21 scope review):** `shortestImageRef` at `packages/app/src/editor/image-upload/index.ts:91` emits minimal-correct relative paths across all dirname permutations: same-dir → basename; parent-dir → `../<path>`; deeper-dir → `./<subpath>/<basename>`; cross-tree → `../.../<basename>`. Dirname-matrix test per permutation. |
| FR-2 | Must | Same-dir sha256 dedup | Drop `vacation.jpg` twice into same note → second drop returns existing path with `deduped: true`; toast shown per D-B LOCKED resolution (exact template: `"Already at <path> — reusing."`). Config escape hatch `upload.dedup.ui: 'silent' \| 'toast' \| 'confirm'` per D-B, default `'toast'`. |
| FR-3a | Must | `![[file.ext]]` embed tokenizer | Markdown `![[photo.png]]` parses to mdast `wikiLinkEmbed` node (distinct from `wikiLink`); serializes byte-identical. MUST preserve precedent #15 (use same `MICROMARK_EXT` singleton with identity-dedup) and precedent #9 (add-only — existing `wikiLink` tokenizer state machine and schema unchanged). Adding the `CODE_BANG` (33) entry to the syntax extension's text map at construct-registration time is the expected shape. Test: round-trip matrix across images/video/audio/PDF/opaque. |
| FR-3b | Must | File-basename index | `packages/core/src/utils/path-resolve.ts` (core: browser+Node compatible, no server deps) exposes the data structure `Map<basename, string[]>` + `resolveEmbed(basename, sourcePath) → resolvedPath | null` with Foam-style shortest-path from sourcePath's dirname. Tiebreak rule (when multiple paths tie on suffix length): (1) prefer a path in sourcePath's own dirname subtree (depth-first), (2) else prefer shortest path, (3) else alphabetical (deterministic across rebuilds). Server-side CC1 subscription + rebuild-on-signal wiring lives in `packages/server/src/standalone.ts` (server: constructs the index and subscribes via `cc1Broadcaster.signal('files')` path). Map-based (no TrieMap dep per D-D). |
| FR-3c | Must | Embed render by extension | `wikiLinkEmbed` mdast → PM dispatch: image extension → image node (P0); video/audio/pdf extension → plain-link PM node (P0 fallback), Phase 2 swaps to Video/Audio/PDFViewer MDX component per D-F read-time promotion; opaque extension → wiki-embed ref resolves but renders as plain link. Serializes to `![[name.ext]]` round-trip byte-identical. |
| FR-3d | Must | Embed write on drop insertion | Client-side insertion emits `![[basename.ext]]` at drop position when extension in `wikiEmbedExtensions` allowlist (per FR-1a). Tests: drop each renderable extension → assert `![[...]]` in Y.Text; drop opaque extension → assert `[...](...)` markdown link. |
| FR-4 | Must | Obsidian vault detection | Server startup reads `.obsidian/app.json` if present; pre-populates `upload.attachmentFolderPath` + `upload.emitFormat` per D-J free-form string schema. Non-destructive (never writes to `.obsidian/`). Missing-file → use defaults. Malformed JSON → log warning + use defaults. |
| FR-5 | Must | Upload config schema | `ConfigSchema.upload` exposes: `attachmentFolderPath` (free-form string, default `"./"` — matches Obsidian's literal schema per D-J); `emitFormat` (`'wikiembed' | 'markdown-image'`, default `'wikiembed'`); `dedup` (`'off' | 'same-dir'`, default `'same-dir'`); `dedup.ui` (`'silent' | 'toast' | 'confirm'`, default `'toast'` per D-B); `wikiEmbedExtensions` (string[], default `['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'pdf', 'mp4', 'webm', 'mov', 'mp3', 'wav', 'ogg', 'm4a']`). NOTE: prior drafts had `warnBytes` (M3 → deleted 2026-04-21, no behavior contract; see §15 Future Work Explored), `allowedMimeTypes` (D-M removed 2026-04-21, accept-all pattern; see §15 Future Work Explored for security-narrow), and `maxBytes` (removed 2026-04-22 post-streaming refactor — see §Post-finalization amendment at the bottom of this doc and `reports/streaming-upload-refactor/REPORT.md` §D8). Legacy configs still carrying the removed keys parse cleanly (Zod strips unknown keys) with a one-time deprecation WARN from the CLI loader, Vite dev plugin, and desktop loader. |
| FR-6 | Must | CC1 reuse for index invalidation + widened DiskEvents | Extend `file-watcher.ts` to emit DiskEvents for asset CREATE/DELETE/RENAME (per D-H Option A). `cc1Broadcaster.signal('files')` fires on asset events too. Basename index subscribes to CC1 `ch:'files'`; rebuilds at fs-event. No new channel. |
| FR-7 | Must | Image-ref rewrite on doc rename | `managed-rename-rewrite.ts` extended to handle `![alt](src)` markdown image refs when containing doc moves (remove `line[idx - 1] !== '!'` exclusion at line 243). Recompute relative path from new doc dirname. Tests: (a) cross-dir move with same-dir image, (b) depth change, (c) `![[...]]` wiki-embed refs untouched (index resolves dynamically — D-K separate). |
| FR-8 | Must | Endpoint rename `/api/upload-image` → `/api/upload` | Per D-G. New `/api/upload` endpoint handler; `/api/upload-image` route removed in the same PR (greenfield — no prior release to deprecate from). Client (`image-upload/index.ts:132`) updated to POST to `/api/upload` in the same PR. Tests: `/api/upload` is the only upload route registered. |

### Emit-dispatch matrix (FR-1a × FR-5)

| File ext in `wikiEmbedExtensions`? | `emitFormat` | Emit shape | Example |
|---|---|---|---|
| Yes, extension is an image ext | `wikiembed` (default) | `![[filename.ext]]` | `![[photo.png]]` |
| Yes, extension is an image ext | `markdown-image` | `![alt](relativePath)` | `![photo](photo.png)` |
| Yes, extension is non-image (mp4/pdf/mp3/wav/...) | `wikiembed` (default) | `![[filename.ext]]` | `![[draft.pdf]]` |
| Yes, extension is non-image (mp4/pdf/mp3/wav/...) | `markdown-image` | `[filename](relativePath)` — markdown link | `[draft.pdf](draft.pdf)` |
| No (opaque: zip/docx/txt/generic) | (ignored) | `[filename](relativePath)` — markdown link always | `[archive.zip](archive.zip)` |

The `emitFormat` toggle scopes to **any extension in `wikiEmbedExtensions`**: `wikiembed` emits `![[...]]`, `markdown-image` emits the standard markdown equivalent (image-node form for image extensions; markdown-link for non-image). Opaque extensions (not in `wikiEmbedExtensions`) always emit markdown link, regardless of `emitFormat`.

### Non-functional

- **NFR-1 Performance:** sha256 runs on-the-fly during the streaming-upload pipeline (`HashingPassThrough` transform) — no separate pass over the bytes, memory footprint O(1) regardless of file size. `findDuplicateAsset` reads each candidate sibling back to hash-compare (disk-bound; amortized by the same-dir dedup scope). Basename index lookup O(1) with small constant. Vault-scan startup < 2s for 1000-file vaults. (Pre-2026-04-22: "sha256 on 25MB completes <200ms" — superseded because the 25 MB cap no longer exists; streaming throughput is disk-I/O-bound, not hash-bound.)
- **NFR-2 Reliability:** Non-sniffable files rejected with actionable error. Dedup match surfaced to user (no silent reuse).
- **NFR-3 Security:** **F9 fix absorbed (2026-04-21 scope review):** `sanitizeFilename` at `packages/server/src/api-extension.ts` preserves unicode code points (letters, digits, marks, punctuation) while stripping path separators and control bytes. Unicode-preservation + path-escape-safety test required. Path-escape guards unchanged. SVG `<img>`-only unchanged. New file types (PDF) render as link, never inline execution.
- **NFR-4 Observability:** Upload events logged with `{ dedup, mime, size, destPath }`. CC1 broadcasts unchanged.
- **NFR-5 Round-trip fidelity:** `![[file.ext]]` byte-identical through parse → PM → serialize. Preserves I1 (Identity), I4 (Idempotence), I5 (Layer A === Layer B: mdManager parse/serialize and Y.Doc → PM → Y.Text round-trip agree), and I7 (Cross-path consistency: FR-3d emit-on-drop and FR-3a parse of hand-authored `![[...]]` produce equivalent mdast + PM) invariants from CLAUDE.md Storage-layer fidelity contract.

## 7) Success metrics

- **M1:** P1 can drag any file from Finder → gets image or markdown link, never "Unsupported file type."
- **M2:** Imported Obsidian vault with `.obsidian/app.json` + `![[photo.png]]` refs renders all embeds correctly on first open, no manual config required.
- **M3:** Same screenshot dropped twice → second drop shows dedup toast, no storage bloat.
- **M4:** Rename a doc with a same-dir image ref → ref resolves correctly in the new location, no broken image.
- **M5:** Operator tunes `upload.attachmentFolderPath` / `upload.emitFormat` / `upload.dedup` in `.open-knowledge/config.yml` → behavior reflects on the next upload. No code change, no rebuild. (Per D-M accept-all there is no MIME narrow to configure; per post-2026-04-22 streaming refactor there is no byte cap to tune. Operators tune attachment placement, emit-shape, dedup, and the wiki-embed allowlist — see §Post-finalization amendment.)
- **M6:** Zero regressions to shipped image-upload + clipboard-mdast + wiki-link text + doc-to-doc managed-rename tests.

## 8) Current state

See `evidence/current-shipped-state.md` for file:line citations. TL;DR:

- `POST /api/upload-image` at `api-extension.ts:3014-3129` (handler `handleUploadImage`) with top-of-file constants at `:167` (`MAX_UPLOAD_BYTES = 10MB`), `:168` (`ALLOWED_MIME_TYPES`), `:170` (`GENERIC_PASTE_NAMES`). Multipart + busboy (via `readUploadBody` starting at line 211). 10MB cap. Image-only MIME allowlist. Co-located storage (`dirname(parentDocName)`). No dedup. ASCII-only filename sanitization at lines 172-179 (F9 absorbed — see NFR-3 + §13). Returns `{ src: basename }`.
- `@tiptap/extension-file-handler` at `shared.ts:32-44` pinned to image MIMEs. Widget decoration at `image-upload/index.ts:27-79`. `shortestImageRef()` at `image-upload/index.ts:91-96` (binary same-dir/absolute logic; F8 absorbed as algorithmic rewrite to 4-case relative — see FR-1a + §13).
- `wiki-link-micromark.ts` tokenizes `[[...]]` only — `start` state at line 42 checks `CODE_LBRACKET` (91), zero `!` prefix branch. Module-level singleton `MICROMARK_EXT = wikiLinkSyntax()` at line 238 with identity-dedup at 259/265/270 enforces precedent #15 (idempotent attacher).
- `managed-rename-rewrite.ts:243` explicitly excludes image refs via `line[idx - 1] !== '!'`. `readMarkdownLink` at line 77 with regex at line 88: `/^\[([^\]\n]*)\]\(.../` starts with `\[`, not `!\[`.
- `packages/cli/src/config/schema.ts` has no `upload.*` section.
- Zero references to `.obsidian`, `app.json`, `attachmentFolderPath`, `useMarkdownLinks`, `newLinkFormat` across the codebase.
- `packages/content/` has zero asset files today (0 image refs).
- `file-type` package pinned at `^22.0.1` (not 8.x as older evidence drafts claimed — see INV3 for corrected version).

## 9) Relationship to prior work

An earlier 30-decision draft SPEC (dated 2026-04-08, developed in a sibling worktree, never committed to main) is partially superseded here. See `reports/editor-input-surface-worldmodel/REPORT.md` for the per-decision /assess-findings triage of D1-D30. Per-row disposition:

| Prior decision | Status in this spec |
|---|---|
| D1 accept all file types | FR-1 (accepted per D-M: any file drop accepts; non-sniffable or unrecognized types emit as opaque markdown link. Post-2026-04-22: no user-facing byte cap — see §Post-finalization amendment). |
| D2 global `assets/` at project root | **REFUTED by shipped evidence (content has zero assets; 1-way door not traversed). Default is co-located; FR-5 exposes choice.** |
| D3 relative refs | **FR-1a (absorbed 2026-04-21 via scope review).** `shortestImageRef` dirname-matrix fix now in-scope; applies only to opaque-type `[name](path)` / markdown-image emit path (wiki-embed refs resolve via basename index, so F8 irrelevant there). |
| D4 sha256 dedup | FR-2 (accepted, scope narrowed to same-dirname) |
| D5 + D27 `![[file.ext]]` embed + file-basename index | FR-3 (accepted + WIDENED: also covers embed WRITE on drop per D-I wiki-embed storage). |
| D6 standard markdown emit | **REFRAMED by D-I.** FR-5's `emitFormat` now toggles emit for renderable types (default `wikiembed`, optional `markdown-image`). Opaque types always emit markdown link. |
| D7 unicode-preserving sanitization | **NFR-3 (absorbed 2026-04-21 via scope review).** `sanitizeFilename` unicode-preserving regex now in-scope. |
| D8 auto-update refs on rename | FR-7 (accepted, extended to image refs) |
| D9 publishing out of scope | Maintained |
| D10 raw-body POST | **REFUTED.** Shipped multipart+busboy works; D10 rationale unsupported. |
| D11 client-side insertion | Shipped as-is; no change |
| D12 widget decorations | Shipped as-is; no change |
| D13 multi-file sequential | Shipped as-is; no change |
| D14 upload failure UX | Shipped as-is; no change |
| D15 `@tiptap/extension-file-handler` | Shipped as-is; no change |
| D16 disk bridge asset event | FR-6 (reused: CC1 `ch:'files'` broadcast) |
| D17 asset serving middleware | Shipped (filter-aware sirv); no change |
| D18 shadow repo coordination | Shipped as-is; no change |
| D19 5MB/25MB limits | **REFUTED 2026-04-22 by streaming refactor.** `warnBytes` was deleted 2026-04-21 (M3 — no behavior contract); `maxBytes` was deleted 2026-04-22 alongside the streaming pipeline (buffer-to-memory OOM guard it represented is gone). No user-facing cap exists; disk fullness surfaces as HTTP 507. See §Post-finalization amendment. |
| D20 6-guard XSS | **SEPARATE SPEC** (Guard 5 `validate:` specs sweep; CVE-2024-40626 class; not in this spec) |
| D21 Outline's 6-step paste tree | **SUPERSEDED** by `specs/2026-04-16-clipboard-mdast-canonical/` |
| D22-D26 paste edge cases | **SUPERSEDED** by clipboard-mdast-canonical spec |
| D28 `assetLocation` default | FR-5 `attachmentFolderPath` (semantic equivalent per D-J free-form; default `"./"` = co-located, not global). |
| D29 Obsidian vault detection | FR-4 (accepted) |
| D30 image format allowlist | REFRAMED by D-M: `allowedMimeTypes` config removed; extension-based emit-shape control lives in `wikiEmbedExtensions`. Security-focused hard-block allowlist deferred to Future Work. |

## 10) Decision log

| # | Decision | Type | Resolution | 1-way? | Status |
|---|---|---|---|---|---|
| D1 | Scope: 8 items (FR-1 through FR-8). | Cross-cutting | DIRECTED | No | User confirmed via /assess-findings triage (updated to include FR-8 endpoint rename per D-G) |
| D2 | `attachmentFolderPath` default is `"./"` (co-located semantic per D-J free-form string). | Product | DIRECTED | No | Refutes old D2's 1-way framing; evidence: zero assets in content. Semantic bridge: "co-located" = `"./"` per D-J schema (INV1 §2.1). |
| D3 | Transport stays multipart+busboy. | Technical | DIRECTED | No | Refutes old D10; shipped works |
| D4 | Paste decision tree handled by clipboard-mdast-canonical; not in this spec. | Cross-cutting | DIRECTED | No | Superseded |
| D-A | ~~Non-sniffable MIMEs: **strict magic-byte-only**.~~ | Technical | **REFUTED 2026-04-21 by D-M** | No | Original rationale (INV3 confirmed all MUST-haves sniffable; text formats intentionally excluded; belongs in markdown pipeline) was paternalistic: it redirected users who dropped CSV/TXT toward paste-into-code-fence. Overturned after ecosystem check (Obsidian / Logseq / Notion / Bear / iA Writer / Roam / Craft all accept text drops as file links; OK as outlier produced overengineered rejection UX with two-message rule and admin-narrowed carve-outs). D-M replaces. |
| D-B | Dedup toast UX: **show toast** — "Already at `docs/photo.png` — reusing." Transient, non-blocking. | Product | **LOCKED** | No | MEDIUM confidence. No prior-art in universe; honest-UX beats silent-reuse debugging opacity. Reversible to silent if P0 dogfood shows noise. `upload.dedup.ui: 'silent' \| 'toast' \| 'confirm'` config escape hatch added to FR-5 with default `'toast'`. |
| D-C | Embed rendering: **image node for image extensions; extension-dispatch for typed Phase 2 nodes (video/audio/PDF) or plain-link fallback in P0**. | Product | **LOCKED** | Yes (user-visible UX) | Universe convergence: Foam + Fumadocs + SilverBullet + Dendron all render as inline image for image-ext; zero pill UX for embeds in surveyed editors. |
| D-D | File-basename index: **in-memory `Map<basename, string[]>`, rebuild at startup + on CC1 `ch:'files'`.** No disk persistence. | Technical | **LOCKED** | No | 100% of index-having editors rebuild at startup (INV2 + Path C). Map sufficient at our scale; no TrieMap dep. |
| D-E | Rename race: **sequential events for markdown-image refs; wiki-embed refs are resolution-independent (architecturally immune).** Document the scope; accept temporary incoherence for markdown-image during bursts. | Technical | **LOCKED** | No | MEDIUM confidence. D-I wiki-embed locks most of the race surface. For residual markdown-image case, Foam/Dendron/SilverBullet all rely on fs-event ordering (no documented pathology). The CC1 100ms broadcast debounce coalesces UI-side invalidation signals (ProviderPool sees one `ch:'files'` event after a burst) — NOT the rewriter path itself. If P0 dogfood surfaces a concrete repro, additively debounce the rewriter. |
| D-F | Non-image emit: **read-time promotion** (Phase 2 adds Video/Audio/PDFViewer dispatch via extension; storage shape never migrates). | Cross-cutting | **LOCKED** | Yes | D-I wiki-embed storage + Phase 2 rendering dispatch = zero content migration. |
| D-G | Endpoint rename: **`/api/upload-image` → `/api/upload`, old route removed outright** (FR-8). | Technical | **LOCKED** | Yes (client breaking) | Greenfield + no-deferred-tech-debt — there is no prior release to deprecate from. Client updates in the same PR. A shim would be pure deferred tech debt: future-you or a future reviewer eventually has to delete it, and every call site + response-shape divergence has to stay compatible until then. Cleaner to delete it now. |
| D-H | CC1 asset events: **widen file-watcher to emit asset DiskEvents + reuse `ch:'files'`**. | Technical | **LOCKED** | No | Option A per INV6. Reuses shipped infrastructure; matches prior-spec D16 intent (~20 LOC). |
| D-I | Non-image emit shape: **`![[file.ext]]` wiki-embed for renderable extensions (`upload.wikiEmbedExtensions` allowlist); `[name](path)` markdown link fallback for opaque types.** | Product | **LOCKED** | Yes (persistence shape) | 6-editor convergence (Obsidian + Logseq + Foam + Dendron + Fumadocs + SilverBullet) on `![[...]]`; reuses FR-3 parser; Obsidian refugee fidelity; Phase 2 is pure render dispatch. |
| D-J | Obsidian `attachmentFolderPath`: **free-form string** matching Obsidian's literal schema (`"/"` = vault root, `"./"` = co-located, `"./subdir"` = co-located subdir, other = global path). | Technical | **LOCKED** | No | INV1-confirmed 4 patterns; free-form 1:1 passthrough is lossless. |
| D-K | Rename-rewrite scope: **refs only (Foam/Dendron/Obsidian pattern).** Do NOT move co-located asset files when a doc moves. Basename index resolves from new doc location via shortest-path. | Technical | **LOCKED** | Asymmetric (easy to add relocation later; hard to remove it) | MEDIUM-HIGH confidence. D-I wiki-embed immunity means resolution works regardless of physical location — zero functional need for relocation. Obsidian refugee ecosystem expectation matches. SilverBullet's relocation pattern risks silent breakage of shared assets (e.g., `logo.png` referenced by 5 docs) without a backlink-graph (Bucket 7 dep). **Concrete revisit trigger** (per challenger STRONG-2): re-audit orphan-asset density after 12 months of dogfood use. **Paired commitment:** ship `openknowledge gc` (see Future Work → Identified for `gc` scope and triggers). Passive "revisit when complaint" is replaced by this explicit trigger + concrete forward path. |
| D-L | ~~Rejection copy: two-message rule.~~ | Product | **REMOVED 2026-04-21** | — | Removed alongside D-A refutation. With accept-all (D-M), there is no type-based rejection path and therefore no copy to author. Post-2026-04-22 streaming refactor there is no byte-cap rejection either — disk fullness (`storage-full` → 507) is the only axis and its message is handled server-side. Admin-narrowed carve-out dissolved (OK is local-first; no admin distinct from user). Historical note: originally LOCKED 2026-04-21 AM via staff-eng + staff-PM convergence on message-specificity principle; unwound same-day PM when ecosystem check surfaced that no comparable editor implements type-based rejection UX. |
| D-M | **Accept-all file drops.** No type-based rejection, no MIME allowlist gate, and post-2026-04-22 no user-facing byte cap (streaming pipeline makes it architecturally obsolete — see §Post-finalization amendment). Non-sniffable or unrecognized types emit as opaque markdown link `[filename](path)` per FR-1a emit-dispatch matrix. SVG extension-fallback at `api-extension.ts:3088-3093` preserved so `.svg` renders as `<img>` per NFR-3. Server-side rejection axes are disk/transport failures only (`malformed-upload` / `storage-full` / `storage-readonly` / `collision-exhaustion` / `storage-error`). | Product | **LOCKED** | Reversible (can narrow via config later) | Ecosystem convergence: every major Obsidian-class editor (Obsidian / Logseq / Notion / Bear / iA / Roam / Craft) accepts all file drops. User-intent clarity: user who dropped CSV expecting inline contents sees a link → learns → pastes contents manually (same path these users take in Obsidian). Refutes D-A's paternalistic redirect stance. Eliminates D-L two-message rule + client-side extension-check branch + toast copy maintenance. Dissolves M1 admin-narrowed case (OK is local-first; every user is the operator). `allowedMimeTypes` config removed from FR-5 (see §15 Future Work Explored — "Security-focused upload allowlist" deferred pending multi-tenant need). `maxBytes` removed 2026-04-22 post-streaming refactor (see §Post-finalization amendment and `reports/streaming-upload-refactor/REPORT.md` §D8). |

## 11) Open questions

All P0 decisions resolved. Spec is ready for §Audit.

Cross-editor research grounding: [reports/editor-asset-embed-patterns-across-universe/REPORT.md](../../reports/editor-asset-embed-patterns-across-universe/REPORT.md) (16 editors × 8 dimensions).

Investigation threads (all RESOLVED):

| # | Question | Type | Status |
|---|---|---|---|
| Q-INV1 | Literal schema of `.obsidian/app.json` field names + types | Technical | RESOLVED — `evidence/inv1-obsidian-app-json-schema.md`. 3 target fields confirmed; `"./subdir"` 4th pattern handled by D-J free-form string. |
| Q-INV2 | Foam's TrieMap + `getShortestIdentifier()` algorithm | Technical | RESOLVED — `evidence/inv2-foam-shortest-path-algorithm.md`. Plain `Map<basename, string[]>` sufficient at our scale. |
| Q-INV3 | `file-type@Nx` detection coverage for non-image MIMEs | Technical | RESOLVED — `evidence/inv3-file-type-mime-coverage.md`. We're on v22.0.1 (not 8.x). All MUST-haves (PDF/MP4/MP3/WAV/OGG/WebM/ZIP/fonts) sniffable. Text formats NOT. **2026-04-21 cycle-2 update:** original reasoning flowed into D-A (strict magic-byte reject) — D-A subsequently REFUTED by D-M (accept-all). Sniff results now feed SVG `<img>` routing (NFR-3) and FR-1a emit-dispatch consistency, not a rejection gate. |
| Q-INV4 | Outline's non-image drop pattern for convergence | Technical | RESOLVED via external cross-survey — `reports/editor-asset-embed-patterns-across-universe/REPORT.md` (Outline entry in the 16-editor table). Outline uses typed nodes (image/video/attachment) with `[title size](url)` metadata encoding. Contributed to D-I analysis. (Originally authored to an `evidence/inv4-outline-drop-pattern.md` that was never committed; knowledge persists in the external cross-survey report.) |
| Q-INV5 | clipboard-mdast-canonical boundary with file drop/paste | Cross-cutting | RESOLVED — `evidence/inv5-clipboard-mdast-boundary.md`. Clean NG4 carveout. Zero touchpoint. |
| Q-INV6 | CC1 broadcaster semantics: asset-event fire path | Technical | RESOLVED — `evidence/inv6-cc1-asset-event-semantics.md`. Asset events not reaching CC1 today. D-H locked widen file-watcher. |

## 12) Assumptions

| # | Assumption | Confidence | Verification | Expiry |
|---|---|---|---|---|
| A1 | `file-type@22.0.1` detects PDF, MP4, MP3, WAV, OGG, WebM, ZIP, fonts | **VERIFIED** (INV3) | Done — package version confirmed, supported types list extracted from source | Resolved |
| A2 | Foam's reverse-path shortest-path algorithm ports to TS with <100 LOC using plain Map | **VERIFIED** (INV2) | Done — algorithm documented | Resolved |
| A3 | Obsidian `.obsidian/app.json` 3 target field names are stable across versions | MEDIUM → **VERIFIED** (INV1) | INV1 sampled 7 real vaults + community plugin source; all 3 fields consistent | Implementation phase |
| A4 | Extending `wiki-link-micromark.ts` with `!` prefix is backwards-compatible with existing `[[...]]` tokenization | HIGH | Unit tests cover both cases | Implementation phase |
| A5 | Asset-level DiskEvents CAN be emitted from file-watcher after ~20 LOC widening | **VERIFIED (not pre-verified)** — INV6 confirmed this is NEW code, not already happening. D-H locks the widening. | Implementation phase |
| A6 | Bun `sha256` via `crypto.createHash` performance on streamed bytes keeps up with disk I/O | HIGH | Napkin: SHA-256 is ~500MB/s on modern CPUs; on the streaming path the hash is folded into the pipeline via `HashingPassThrough` so it piggybacks on disk writes (no separate pass). Post-2026-04-22 streaming amendment. | Implementation phase |
| A7 | Clipboard-mdast-canonical does NOT touch file-drop paths (NG4 carveout) | **VERIFIED** (INV5) | Done — spec NG4 carveout confirmed verbatim | Resolved |
| A8 | `upload.wikiEmbedExtensions` default allowlist (images + PDF + video + audio) matches what Obsidian renders natively | HIGH | Cross-reference `reports/obsidian-vs-fumadocs-component-inventory/REPORT.md` + Obsidian help docs | Implementation phase |

## 13) In Scope

- Accept-all file upload (FR-1 per D-M) — `packages/app/src/editor/extensions/shared.ts` (widen FileHandler `allowedMimeTypes` to `undefined` or a broad set so text drops aren't rejected at the browser boundary) + `packages/server/src/api-extension.ts` (remove `ALLOWED_MIME_TYPES.has(detectedMime)` gate at `:3095`; keep SVG magic-byte fallback at `:3088-3093`). `packages/core/src/constants/upload.ts` `ALLOWED_IMAGE_MIME_TYPES` may be deleted or retained as a reference constant (no runtime consumer post-D-M). Post-2026-04-22 streaming amendment: no user-facing byte cap — see §Post-finalization amendment.
- Client-side emit dispatch on extension (FR-1a) — `packages/app/src/editor/image-upload/index.ts`: wiki-embed emit for `upload.wikiEmbedExtensions` match, plain-link fallback otherwise
- Server sha256 dedup at same-dir scope (FR-2) — `packages/server/src/api-extension.ts` upload handler
- Dedup response shape update (FR-2) — `{deduped: boolean}` in response body
- `wiki-link-micromark.ts` embed tokenizer branch (FR-3a) — `packages/core/src/markdown/wiki-link-micromark.ts`: add `CODE_BANG` (33) → `CODE_LBRACKET` sequence → emit distinct `wikiLinkEmbed` token; reuse existing `[[...]]` tokenizer state machine for body
- File-basename index module (FR-3b) — NEW `packages/core/src/utils/path-resolve.ts`: `Map<basename, string[]>` + `resolveEmbed(basename, sourcePath)` with Foam-style shortest-path elimination
- Embed mdast → PM handler (FR-3c) — `packages/core/src/markdown/index.ts` (add near the existing `handlers.wikiLink` at `index.ts:591-594`): extension-dispatch (image-ext → PM image node; other `wikiEmbedExtensions` → plain-link fallback in P0, Phase 2 promotes)
- Embed PM → mdast handler (FR-3c reverse) — same file: add near `nodeHandlers.wikiLink` at `index.ts:876-884`; image/plain-link PM nodes that originated from a `wikiLinkEmbed` serialize back to `![[basename.ext]]`
- Embed write on drop (FR-3d) — bundled into FR-1a insertion logic
- Obsidian vault detection module (FR-4) — NEW `packages/server/src/obsidian-vault-detect.ts`: read-only `.obsidian/app.json` parser with defaults-on-missing/malformed
- Config schema extension (FR-5) — `packages/cli/src/config/schema.ts`: `upload.*` section with `attachmentFolderPath`, `emitFormat`, `dedup`, `dedup.ui`, `wikiEmbedExtensions` (5 fields post-2026-04-22 — `warnBytes` deleted 2026-04-21 per M3; `allowedMimeTypes` deleted 2026-04-21 per D-M; `maxBytes` deleted 2026-04-22 per streaming refactor — see §Post-finalization amendment)
- File-watcher asset-event widening + CC1 subscriber wiring (FR-6) — `packages/server/src/file-watcher.ts` (emit DiskEvents for asset ext lifecycle) + `packages/server/src/standalone.ts` (`handleDiskEvent` asset-create/delete/rename → `cc1Broadcaster.signal('files')`) + `path-resolve.ts` subscribes
- Image-ref rewrite handler (FR-7) — `packages/server/src/managed-rename-rewrite.ts`: remove `line[idx - 1] !== '!'` exclusion; add `readImageRef` branch with relative-path recompute. **Absolute-path refs (`![alt](/docs/photo.png)`) from pre-F8 emit MUST be detected and left unchanged** — only relative-path refs (`./...`, `../...`, bare-name) are recomputed. Unit-test fixtures must include a pre-existing absolute-path ref that survives rename unchanged.
- Endpoint rename (FR-8) — `packages/server/src/api-extension.ts` replace `/api/upload-image` registration with `/api/upload` (no shim, no alias); update client POST target at `packages/app/src/editor/image-upload/index.ts:132`
- **F8 absorbed fix (FR-1a):** algorithmic rewrite of `shortestImageRef` at `packages/app/src/editor/image-upload/index.ts:91` from binary (same-dir → basename; else → absolute `/path`) to 4-case relative (same-dir → basename; parent → `../<path>`; deeper → `./<subpath>/<basename>`; cross-tree → `../.../<basename>`). ~8-15 LOC using `path.posix.relative()` + normalization. Dirname-matrix test per permutation.
- **F9 absorbed fix (NFR-3):** one-line regex swap on `sanitizeFilename` at `packages/server/src/api-extension.ts` (currently lines 172-179 at baseline `2ad0177a`; was at lines 137-144 at baseline `432a834b`) + unicode-preservation + path-escape-safety tests.
- Tests: unit + integration + fidelity PBT for embed round-trip + rename-rewrite + emit-dispatch matrix (image/video/pdf/audio/zip/docx). Under D-M accept-all + streaming amendment (2026-04-22) there is no product-side rejection UX — server-side `malformed-upload` / `storage-full` / `storage-readonly` / `collision-exhaustion` / `storage-error` messages are covered by unit + integration tests on the streaming pipeline primitives.
- **E2E acceptance scenarios (cross-FR):** see `evidence/e2e-acceptance-scenarios.md` — product-experience scenarios with setup / action / invariants / perturbation check / edge-siblings per scenario (P1.1 drop PDF typed-emit, P1.2 drop CSV accept-opaque, P2.1 Obsidian vault open + ambiguous resolution, P3.1 same-dir dedup + cross-dir no-dedup, P5.1 rename with markdown-image ref, P5.1a rename with wiki-embed ref, P5.2 wiki-embed immunity under concurrent burst, P5.3 markdown-image eventual-consistency under burst, P6.1 multi-user CRDT propagation, P6.2 multi-user basename-index invalidation via CC1). Plus P2.2 (Obsidian useMarkdownLinks=true emit) as an in-file scenario not promoted to top-list. **Post-2026-04-22 amendment:** P1.3 (oversized-file rejection) and P4.1 (operator bumps maxBytes) were deleted — both targeted `upload.maxBytes` which no longer exists under the streaming refactor. See §Post-finalization amendment.
- **Not-E2E (push-down — lower-tier tests):** MIME allowlist precision (narrow integration), `wikiLinkEmbed` tokenizer round-trip (fidelity PBT), path-resolver tiebreak determinism (unit PBT), Obsidian `app.json` parsing variants (unit), `sanitizeFilename` regex coverage (unit), `shortestImageRef` dirname matrix (unit), `managed-rename-rewrite` regex fixtures (narrow integration), Zod config validation (unit), streaming upload primitives — `HashingPassThrough`, `linkTempToFinalWithCollisionRetry`, `cleanupOrphanUploadTempfiles` (unit + integration), CC1 signal fan-out semantics (narrow integration). These are NOT E2E candidates — they're lower-tier where they give stronger signal per test-runtime dollar.

## 14) Risks & mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | `file-type@22.0.1` can't sniff some common user MIMEs (text files, CSVs) | ~~Medium~~ → **RESOLVED** | — | D-M accept-all: non-sniffable types are accepted and emitted as opaque markdown link. No rejection dead-end, no copy maintenance. SVG retains its extension-fallback for `<img>` rendering. |
| R2 | `wikiLinkEmbed` node interacts poorly with existing wiki-link test suite | Low | Medium | New node type, strictly additive per CLAUDE.md precedent #9; existing `wikiLink` tests unchanged |
| R3 | Obsidian schema fields change between versions (vault from older/newer Obsidian) | Medium | Low | Parser tolerates missing fields (defaults); logs warning on schema mismatch |
| R4 | Basename index churn on large vaults (1000+ files) | Low | Medium | NFR-1 sets bound; INV2 validates Foam's perf |
| R5 | Dedup toast UX fights with widget-decoration placeholder UX | Low | Low | Dedup detected server-side; skip placeholder entirely; toast-only path |
| R6 | FR-7 image-rewrite regresses doc-to-doc rename tests | Medium | High | FR-7 is additive branch (doesn't modify existing `[text](link)` path); full regression of managed-rename test suite |
| R9 | `![[file.ext]]` emit storage loses GitHub raw-file preview rendering (GitHub doesn't render wiki-embed) | Medium | Medium | Accepted tradeoff — Obsidian + OK + Fumadocs parity prioritized; GitHub preview is secondary to in-editor/publish paths. Future NG5 publish-time transform covers GitHub export if needed. |
| R10 | FR-3d embed-write on drop produces different content shape than pre-FR-3d hand-authored markdown image refs (`![[foo.png]]` vs `![foo](foo.png)`) — round-trip consistency risk | Low | Medium | Both forms continue to round-trip independently. FR-5's `emitFormat: 'markdown-image'` override available for users who want consistent-shape history. |
| R7 | Accept-all (D-M) enables novel XSS via content-type confusion | Low | High | Server ignores client MIME; magic-byte sniff used only for SVG `<img>` routing (NFR-3 preserved); non-image types render as link only; content-type at sirv time determined by extension (browser offers download rather than inline-execute for unknown types). |
| R8 | FR-4's `.obsidian/app.json` could be a symlink escape vector | Low | Medium | Reuse existing `realpathSync` + `isWithinContentDir` check from upload handler |

## 15) Future work

### Explored (investigated, clear path, not in scope now)

| Item | Recommended approach | Trigger to revisit |
|---|---|---|
| Security-focused upload allowlist (hard-block types) | Re-add optional `upload.allowedMimeTypes` narrow; when present, reject excluded types with a single generic message; default `undefined` (accept-all per D-M) | Multi-tenant deployment or shared-machine security policy surface (not applicable to P0 local-first) |
| Soft-limit warn UX (large-upload slowness) | Add toast or confirm-dialog at a configurable threshold when uploads cross it; needs dogfood signal on whether large-file drops produce perceptible sync lag before choosing treatment. Post-2026-04-22 streaming amendment: uploads no longer OOM, but a multi-hundred-MB video can still feel slow on a cold Hocuspocus sync path. | First user report that large drops feel slow or unexpected |
| Whole-vault sha256 dedup | Persistent hash index + rebuild on basename-index signal | User reports storage pressure |
| Wiki-link emit (`emitFormat: 'wikilink'`) | Config flag exists; emit-path implementation ~50 LOC | Hardcore Obsidian user requests |
| Typed-component-nodes Phase 2 rich previews | Video/Audio/PDFViewer swap in for the P0 plain-link fallback at read-time (D-F read-time promotion); storage shape `![[file.ext]]` unchanged | Phase 2 lands |
| MCP `upload_asset` for agents | Secure bytes upload with origin attribution | Agent-generated diagrams become a feature |
| GC of orphaned assets | `npx openknowledge gc` (scan refs, diff against disk, list+confirm) | Users report storage bloat |
| Embed size modifiers `![[image.png\|640x480]]` | Extend wiki-link-micromark tokenizer with `|modifiers` branch post-anchor; preserve round-trip | User asks |
| Audio/video/PDF anchor modifiers `![[file.pdf#page=3]]` | Extend anchor handling in wikiLinkEmbed mdast | Typed-component-nodes Phase 2 |

### Identified (known to matter, needs its own spec)

- Guard 5 (`validate:` specs across custom nodes) — CVE-2024-40626 class security hardening
- Bucket 7: note-to-note `[[Page Name]]` resolution + backlinks + `[[` autocomplete
- **`openknowledge gc` CLI command** (paired with D-K 12-month revisit trigger): scan all markdown refs via basename index + `![alt](src)` regex, diff against actual files under content dir, list orphan assets with per-file size + last-reference timestamp; `--dry-run` default, `--apply` deletes after confirm. Scope: self-contained CLI; reuses existing file-watcher walk logic. Trigger to ship: after D-K 12-month drift audit surfaces non-trivial orphan density in any dogfood vault.
- **External-tool compatibility guide** (docs page + one-line `open-knowledge init` tip): explain the `![[...]]` vs `![alt](...)` trade-off for users reading their vault on GitHub, VS Code markdown preview, Cursor, Claude Code, or other general-purpose viewers; point at `upload.emitFormat: 'markdown-image'` as the whole-vault escape hatch. Trigger to ship: first support inquiry or PR from a user who hit the broken-external-render issue (per R9 acknowledged tradeoff).

### Noted (surfaced, not examined)

- Obsidian Local REST API plugin integration (alternative vault-access path)
- Compression for pasted screenshots
- Windows path separator testing matrix for cross-platform asset refs

## 16) Agent constraints

**SCOPE:**
- `packages/core/src/markdown/wiki-link-micromark.ts` — extend tokenizer with `!` prefix → `wikiLinkEmbed` token
- NEW `packages/core/src/utils/path-resolve.ts` — file-basename index (`Map<basename, string[]>`) + Foam-style shortest-path resolver + CC1 `ch:'files'` subscriber
- `packages/core/src/markdown/index.ts` — add `wikiLinkEmbed` → PM handler near existing `handlers.wikiLink` at `index.ts:591-594` (extension dispatch) + PM → mdast reverse near `nodeHandlers.wikiLink` at `index.ts:876-884`
- `packages/core/src/constants/upload.ts` — `ALLOWED_IMAGE_MIME_TYPES` retained as a reference constant for extension/MIME mapping helpers; no runtime gate consumer post-D-M.
- `packages/cli/src/config/schema.ts` — add `upload.*` Zod section (5 fields per FR-5 post-2026-04-22: `attachmentFolderPath`, `emitFormat`, `dedup`, `dedup.ui`, `wikiEmbedExtensions`)
- `packages/server/src/api-extension.ts` — dedup logic in upload handler + replace `/api/upload-image` route with `/api/upload` (no shim; greenfield per D-G) + remove `ALLOWED_MIME_TYPES.has(detectedMime)` gate at `:3095` (D-M accept-all); keep SVG magic-byte fallback at `:3088-3093`
- `packages/server/src/file-watcher.ts` — widen DiskEvent emission to asset extensions (per D-H)
- `packages/server/src/standalone.ts` — extend `handleDiskEvent` asset cases → `cc1Broadcaster.signal('files')`; wire Obsidian vault detection on startup
- NEW `packages/server/src/obsidian-vault-detect.ts` — `.obsidian/app.json` reader with defaults
- `packages/server/src/managed-rename-rewrite.ts` — add `readImageRef` branch (remove `line[idx - 1] !== '!'` exclusion at line 243)
- `packages/app/src/editor/extensions/shared.ts` — FileHandler `allowedMimeTypes` widened to `undefined` (or broad accept-set) per D-M
- `packages/app/src/editor/image-upload/index.ts` — extension-dispatch emit (FR-1a) + endpoint URL update `/api/upload-image` → `/api/upload` + dedup toast + server-message-pass-through rejection toast (no D-L two-message branch — D-M removes; no byte-size branch — post-2026-04-22 streaming amendment removes `maxBytes`)
- Test files co-located with each new/edited module

**EXCLUDE:**
- Do not modify the clipboard-mdast-canonical pipeline (`packages/core/src/markdown/html-to-mdast.ts`, `mdast-to-html.ts`, WYSIWYG/Source paste handlers)
- Do not modify the shipped image-upload happy path (multipart parsing, widget decoration, server write path, filter-aware sirv)
- Do not modify observer bridges (`observers.ts`, `server-observers.ts`)
- Do not modify the existing wiki-link tokenizer `[[...]]` path — the embed branch is additive
- Do not add `validate:` specs to custom nodes (A3 separate hardening spec)

**STOP_IF:**
- `wiki-link-micromark.ts` embed branch breaks existing `[[...]]` parser tests → revert and reconsider tokenizer structure
- `wikiLinkEmbed` node definition or tokenizer changes narrow the existing `wikiLink` shape → schema changes must be add-only per precedent #9
- Basename index rebuild time exceeds NFR-1 bound (2s startup for 1000-file vault) → D-D revisit disk persistence
- `file-type@22.0.1` sniff behavior changes on upgrade → re-verify SVG extension-fallback still needed + confirm MIME/extension mapping constants stay correct (D-M doesn't gate on sniff success, but FR-1a emit dispatch + NFR-3 security still rely on correct `.svg` detection)
- SVG extension-fallback at `api-extension.ts:3088-3093` (the `<svg` text-sniff block inside `handleUploadImage`) is removed without compensating guard → the shipped one-off SVG exception is LOAD-BEARING for NFR-3 security (SVG must render via `<img>`, never inline DOM); retain this specific fallback even under D-M accept-all
- Obsidian `.obsidian/app.json` parsing fails on real-world vault (beyond INV1's 7 samples) → extend parser tolerance + document schema deviation; do NOT throw
- Asset DiskEvent widening (D-H) breaks existing markdown DiskEvent tests → revert widening, reconsider Option B (new `ch:'asset-index'` channel)

**ASK_FIRST:**
- Before adding any npm dependency (including utility libs for hash computation — Bun has built-in `Bun.hash` / `crypto.createHash`; no TrieMap per D-D, stdlib Map sufficient)
- Before changing any default in `FR-5 upload.*` config
- Before extending clipboard-mdast-canonical touchpoints
- Before implementing note-to-note wiki-link emit (NG11; Bucket 7 scope)
- Before implementing embed size modifiers like `|640x480` (NG12; deferred)
- Before implementing any form of asset relocation on rename (D-K LOCKED refs-only; flipping to asset-relocation requires re-opening D-K with evidence)
- Before modifying any file outside SCOPE list

## Post-finalization amendment (2026-04-22) — streaming upload refactor

**Summary.** This spec was Finalized 2026-04-21 with FR-5 carrying a `maxBytes` field (default 25 MB) and an associated rejection path (P1.3 in `evidence/e2e-acceptance-scenarios.md`, P4.1 operator-bump scenario, byte-size-specific client toast). On 2026-04-22, pre-merge, the user asked what `maxBytes` actually did and whether it could be removed — the question surfaced that the cap was a buffer-to-memory OOM guard dressed as a product choice rather than a product requirement. Authoritative research at [`reports/streaming-upload-refactor/REPORT.md`](../../reports/streaming-upload-refactor/REPORT.md) (476 LOC synthesis + 9 evidence files + peer-editor survey of 11 editors) established that the architecturally correct response is to stream uploads end-to-end, not to tune the cap. This amendment captures the resulting changes.

**Scope of amendment (what actually changed):**

1. **`upload.maxBytes` deleted from FR-5 and from every surface** — `UploadConfig` interface, `DEFAULT_UPLOAD_CONFIG`, `ConfigSchema.upload`, `/api/upload-config` response, client `UploadResponseBody`. Legacy configs still carrying `upload.maxBytes:` parse cleanly (Zod strips unknown keys since `UploadConfigSchema` is not `.strict()`); a one-time deprecation WARN surfaces from the CLI loader, Vite dev plugin, and desktop loader.
2. **Upload handler rewritten to stream end-to-end** — `packages/server/src/upload-streaming.ts` adds `HashingPassThrough` (on-the-fly sha256) + `stream.pipeline(busboyFile, HashingPassThrough, createWriteStream(tempPath))`. Memory footprint is O(1) regardless of file size. Tempfile at `<contentDir>/.open-knowledge/tmp/upload-<uuid>` promoted via POSIX `linkSync` with 99-attempt collision retry (preserves the pre-amendment `-1`…`-99` suffix semantic). Orphan sweep at boot, 24h TTL, matches the `recoverPendingManagedRename` precedent.
3. **Rejection axes reframed.** Previously: `max-bytes` (413) was the primary product-facing rejection. Now: disk fullness (`storage-full` → 507), malformed multipart (`malformed-upload` → 400), read-only mount (`storage-readonly` → 500), 99-attempt collision exhaustion (`collision-exhaustion` → 500), unclassified write error (`storage-error` → 500). All typed in `packages/server/src/upload-errors.ts`'s `UploadWriteReason` union. None of these are product choices — they're transport/disk failures and the message passes through server-side.
4. **Evidence — P1.3 and P4.1 deleted** from `evidence/e2e-acceptance-scenarios.md` (both targeted `maxBytes` and have no post-amendment equivalent).
5. **STOPs** added to `AGENTS.md` forbidding re-introduction of `upload.maxBytes` or any buffer-to-memory upload pattern; cross-linked to this amendment + `reports/streaming-upload-refactor/REPORT.md` §D8.

**What did not change.** The dual-representation CRDT bridge (precedent #14), FR-1 accept-all posture (D-M), FR-2 same-dir sha256 dedup, FR-3a/b/c/d wiki-embed parse + resolve + dispatch + emit, FR-4 Obsidian vault detection (US-018 user-wins precedence), FR-6 CC1 `ch:'files'` asset events, FR-7 managed-rename image-ref rewrite (D-K refs-only), FR-8 endpoint rename. NFR-3 SVG `<img>`-only routing is preserved — the SVG text-sniff fallback survives the buffer-to-stream rewrite unchanged.

**Why direct edit + amendment breadcrumb (not corrigendum annotations).** Per the CLAUDE.md "Post-ship corrigendum annotations on shipped specs" convention, the breadcrumb pattern is reserved for specs whose implementation has **shipped**. This spec was Finalized but its implementation PR has not merged to main. Direct in-line edits to §3 (NG6), §5 (P4), §6 (FR-1, FR-5, NFR-1), §7 (M5), §10 (D-A→D-M row + legacy mapping), §13 in-scope + agent-constraints preserve readability; this amendment section preserves auditability. Changelog entry in `meta/_changelog.md` dated 2026-04-22.

**Authoritative cross-reference.** [`reports/streaming-upload-refactor/REPORT.md`](../../reports/streaming-upload-refactor/REPORT.md) is the contract research artifact. It carries the full rationale (D1–D11 design decisions), the 11-editor peer survey, the O(1) memory proof, the disk-I/O performance table, and the 4-commit implementation plan this amendment landed.
