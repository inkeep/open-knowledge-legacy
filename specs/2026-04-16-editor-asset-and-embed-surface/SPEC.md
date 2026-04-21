# SPEC: Editor Asset + Embed Surface

**Status:** Draft (All 11 decisions LOCKED — ready for §Audit)
**Created:** 2026-04-16
**Last updated:** 2026-04-17
**Owner:** Nick Gomez
**Baseline commit:** 432a834b
**Worktree:** `.claude/worktrees/spec-asset-embed-surface` on branch `spec/asset-embed-surface`
**Supersedes (partial):** `specs/2026-04-08-editor-input-surface/SPEC.md` — 8 items not shipped in main; other items superseded, refuted, or fixed via micro-PR (see §9 Relationship to prior spec)
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
- **FR-8 Endpoint rename** (per D-G). `/api/upload-image` → `/api/upload` with a one-release shim on the old path.

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
- **[NOT NOW]** NG6: Git LFS for large binaries. Default reject at 25MB (FR-5 `upload.maxBytes` default; operator-tunable per FR-5 + P4 journey); revisit if someone hits practical upload-size ceilings (e.g. 100MB+ video assets forcing a Git LFS integration).
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
4. Client POSTs to `/api/upload` (renamed per FR-8 / D-G; `/api/upload-image` is a one-release deprecation shim) with `parentDocName: docs/meeting-notes.md`.
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

### P4 — Operator bumps upload size

1. Admin edits `.open-knowledge/config.yml`:
   ```yaml
   upload:
     maxBytes: 104857600  # 100MB
     allowedMimeTypes:
       - image/png
       - image/jpeg
       - application/zip
   ```
2. Restart server. Config loads via Zod (FR-5), validates, `upload.maxBytes` flows to `MAX_UPLOAD_BYTES` constant, `allowedMimeTypes` flows to `ALLOWED_MIME_TYPES`.
3. Drops up to 100MB succeed. Unknown MIMEs still rejected.

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
| FR-1 | Must | Accept all magic-byte-sniffable types on drop | Drop `.pdf`/`.mp4`/`.mp3`/`.wav`/`.ogg`/`.webm`/`.zip`/fonts → passes FileHandler + server magic-byte check. Non-sniffable (`.txt`, `.csv`, `.json`, `.md`) rejected with actionable error per D-A: error message reads: "Text files (CSV, TXT, JSON, MD) aren't supported as binary drops. To include contents, paste into a code fence. To link to a text file in the repo, reference it with a regular markdown link." (Surfaced via toast on rejection.) Test vector per MIME + error-message assertion for rejected types. |
| FR-1a | Must | Emit-shape dispatch by extension | After upload success, client dispatches insert by (extension × `emitFormat` × `wikiEmbedExtensions`). See emit-dispatch matrix below. Tests: image `emitFormat=wikiembed` → `![[foo.png]]`; image `emitFormat=markdown-image` → `![foo](foo.png)`; pdf `emitFormat=wikiembed` → `![[doc.pdf]]`; pdf `emitFormat=markdown-image` → `[doc.pdf](doc.pdf)` (markdown-link for non-image when in markdown-image mode); zip → `[archive.zip](archive.zip)` (opaque always uses markdown-link). |
| FR-2 | Must | Same-dir sha256 dedup | Drop `vacation.jpg` twice into same note → second drop returns existing path with `deduped: true`; toast shown per D-B resolution (pending). |
| FR-3a | Must | `![[file.ext]]` embed tokenizer | Markdown `![[photo.png]]` parses to mdast `wikiLinkEmbed` node (distinct from `wikiLink`); serializes byte-identical. MUST preserve precedent #15 (use same `MICROMARK_EXT` singleton with identity-dedup) and precedent #9 (add-only — existing `wikiLink` tokenizer state machine and schema unchanged). Adding the `CODE_BANG` (33) entry to the syntax extension's text map at construct-registration time is the expected shape. Test: round-trip matrix across images/video/audio/PDF/opaque. |
| FR-3b | Must | File-basename index | `packages/core/src/utils/path-resolve.ts` (core: browser+Node compatible, no server deps) exposes the data structure `Map<basename, string[]>` + `resolveEmbed(basename, sourcePath) → resolvedPath | null` with Foam-style shortest-path from sourcePath's dirname. Tiebreak rule (when multiple paths tie on suffix length): (1) prefer a path in sourcePath's own dirname subtree (depth-first), (2) else prefer shortest path, (3) else alphabetical (deterministic across rebuilds). Server-side CC1 subscription + rebuild-on-signal wiring lives in `packages/server/src/standalone.ts` (server: constructs the index and subscribes via `cc1Broadcaster.signal('files')` path). Map-based (no TrieMap dep per D-D). |
| FR-3c | Must | Embed render by extension | `wikiLinkEmbed` mdast → PM dispatch: image extension → image node (P0); video/audio/pdf extension → plain-link PM node (P0 fallback), Phase 2 swaps to Video/Audio/PDFViewer MDX component per D-F read-time promotion; opaque extension → wiki-embed ref resolves but renders as plain link. Serializes to `![[name.ext]]` round-trip byte-identical. |
| FR-3d | Must | Embed write on drop insertion | Client-side insertion emits `![[basename.ext]]` at drop position when extension in `wikiEmbedExtensions` allowlist (per FR-1a). Tests: drop each renderable extension → assert `![[...]]` in Y.Text; drop opaque extension → assert `[...](...)` markdown link. |
| FR-4 | Must | Obsidian vault detection | Server startup reads `.obsidian/app.json` if present; pre-populates `upload.attachmentFolderPath` + `upload.emitFormat` per D-J free-form string schema. Non-destructive (never writes to `.obsidian/`). Missing-file → use defaults. Malformed JSON → log warning + use defaults. |
| FR-5 | Must | Upload config schema | `ConfigSchema.upload` exposes: `attachmentFolderPath` (free-form string, default `"./"` — matches Obsidian's literal schema per D-J); `emitFormat` (`'wikiembed' | 'markdown-image'`, default `'wikiembed'`); `maxBytes` (default 25MB); `warnBytes` (default 5MB); `dedup` (`'off' | 'same-dir'`, default `'same-dir'`); `dedup.ui` (`'silent' | 'toast' | 'confirm'`, default `'toast'` per D-B); `allowedMimeTypes` (string[], default image + PDF + common media + ZIP + fonts); `wikiEmbedExtensions` (string[], default `['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'pdf', 'mp4', 'webm', 'mov', 'mp3', 'wav', 'ogg', 'm4a']`). |
| FR-6 | Must | CC1 reuse for index invalidation + widened DiskEvents | Extend `file-watcher.ts` to emit DiskEvents for asset CREATE/DELETE/RENAME (per D-H Option A). `signalChannel('files')` fires on asset events too. Basename index subscribes to CC1 `ch:'files'`; rebuilds at fs-event. No new channel. |
| FR-7 | Must | Image-ref rewrite on doc rename | `managed-rename-rewrite.ts` extended to handle `![alt](src)` markdown image refs when containing doc moves (remove `line[idx - 1] !== '!'` exclusion at line 243). Recompute relative path from new doc dirname. Tests: (a) cross-dir move with same-dir image, (b) depth change, (c) `![[...]]` wiki-embed refs untouched (index resolves dynamically — D-K separate). |
| FR-8 | Must | Endpoint rename `/api/upload-image` → `/api/upload` | Per D-G. New `/api/upload` endpoint handler; `/api/upload-image` registered as forwarder (one-release deprecation shim). Client (`image-upload/index.ts:132`) updated to POST to `/api/upload`. Tests: both endpoints return identical response shape during shim window. |

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

- **NFR-1 Performance:** sha256 on 25MB completes <200ms (baseline validation). Basename index lookup O(1) with small constant. Vault-scan startup < 2s for 1000-file vaults.
- **NFR-2 Reliability:** Non-sniffable files rejected with actionable error. Dedup match surfaced to user (no silent reuse).
- **NFR-3 Security:** Filename sanitization preserves unicode (see F9 micro-PR; prerequisite). Path-escape guards unchanged. SVG `<img>`-only unchanged. New file types (PDF) render as link, never inline execution.
- **NFR-4 Observability:** Upload events logged with `{ dedup, mime, size, destPath }`. CC1 broadcasts unchanged.
- **NFR-5 Round-trip fidelity:** `![[file.ext]]` byte-identical through parse → PM → serialize. Preserves I1 (Identity), I4 (Idempotence), I5 (Layer A === Layer B: mdManager parse/serialize and Y.Doc → PM → Y.Text round-trip agree), and I7 (Cross-path consistency: FR-3d emit-on-drop and FR-3a parse of hand-authored `![[...]]` produce equivalent mdast + PM) invariants from CLAUDE.md Storage-layer fidelity contract.

## 7) Success metrics

- **M1:** P1 can drag any file from Finder → gets image or markdown link, never "Unsupported file type."
- **M2:** Imported Obsidian vault with `.obsidian/app.json` + `![[photo.png]]` refs renders all embeds correctly on first open, no manual config required.
- **M3:** Same screenshot dropped twice → second drop shows dedup toast, no storage bloat.
- **M4:** Rename a doc with a same-dir image ref → ref resolves correctly in the new location, no broken image.
- **M5:** Operator adds `application/zip` to `upload.allowedMimeTypes` in config → drops `archive.zip` → works. No code change.
- **M6:** Zero regressions to shipped image-upload + clipboard-mdast + wiki-link text + doc-to-doc managed-rename tests.

## 8) Current state

See `evidence/current-shipped-state.md` for file:line citations. TL;DR:

- `POST /api/upload-image` at `api-extension.ts:2779-2894` (handler) with constants at `:132` (`MAX_UPLOAD_BYTES = 10MB`), `:133` (`ALLOWED_MIME_TYPES`), `:135` (`GENERIC_PASTE_NAMES`). Multipart + busboy (via `readUploadBody` starting at line 176). 10MB cap. Image-only MIME allowlist. Co-located storage (`dirname(parentDocName)`). No dedup. ASCII-only filename sanitization at lines 137-144 (F9 micro-PR fixes separately). Returns `{ src: basename }`.
- `@tiptap/extension-file-handler` at `shared.ts:32-44` pinned to image MIMEs. Widget decoration at `image-upload/index.ts:27-79`. `shortestImageRef()` at `image-upload/index.ts:91-96` (needs fix, see §9 separate F8 micro-PR).
- `wiki-link-micromark.ts` tokenizes `[[...]]` only — `start` state at line 42 checks `CODE_LBRACKET` (91), zero `!` prefix branch. Module-level singleton `MICROMARK_EXT = wikiLinkSyntax()` at line 238 with identity-dedup at 259/265/270 enforces precedent #15 (idempotent attacher).
- `managed-rename-rewrite.ts:243` explicitly excludes image refs via `line[idx - 1] !== '!'`. `readMarkdownLink` at line 77 with regex at line 88: `/^\[([^\]\n]*)\]\(.../` starts with `\[`, not `!\[`.
- `packages/cli/src/config/schema.ts` has no `upload.*` section.
- Zero references to `.obsidian`, `app.json`, `attachmentFolderPath`, `useMarkdownLinks`, `newLinkFormat` across the codebase.
- `packages/content/` has zero asset files today (0 image refs).
- `file-type` package pinned at `^22.0.1` (not 8.x as older evidence drafts claimed — see INV3 for corrected version).

## 9) Relationship to prior spec

The prior spec (`specs/2026-04-08-editor-input-surface/SPEC.md`, 30 decisions D1-D30) is superseded in part:

| Prior decision | Status in this spec |
|---|---|
| D1 accept all file types | FR-1 (accepted, narrowed: magic-byte sniffable + explicit allowlist) |
| D2 global `assets/` at project root | **REFUTED by shipped evidence (content has zero assets; 1-way door not traversed). Default is co-located; FR-5 exposes choice.** |
| D3 relative refs | **FIX-SHIPPED MICRO-PR (F8) — not in this spec.** One-line fix to `shortestImageRef` (applies only to opaque-type `[name](path)` emit; wiki-embed refs resolve via basename index). |
| D4 sha256 dedup | FR-2 (accepted, scope narrowed to same-dirname) |
| D5 + D27 `![[file.ext]]` embed + file-basename index | FR-3 (accepted + WIDENED: also covers embed WRITE on drop per D-I wiki-embed storage). |
| D6 standard markdown emit | **REFRAMED by D-I.** FR-5's `emitFormat` now toggles emit for renderable types (default `wikiembed`, optional `markdown-image`). Opaque types always emit markdown link. |
| D7 unicode-preserving sanitization | **FIX-SHIPPED MICRO-PR (F9) — not in this spec.** One-line regex fix. |
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
| D19 5MB/25MB limits | FR-5 (accepted via `warnBytes`/`maxBytes`; default 5MB/25MB per old D19) |
| D20 6-guard XSS | **SEPARATE SPEC** (Guard 5 `validate:` specs sweep; CVE-2024-40626 class; not in this spec) |
| D21 Outline's 6-step paste tree | **SUPERSEDED** by `specs/2026-04-16-clipboard-mdast-canonical/` |
| D22-D26 paste edge cases | **SUPERSEDED** by clipboard-mdast-canonical spec |
| D28 `assetLocation` default | FR-5 `attachmentFolderPath` (semantic equivalent per D-J free-form; default `"./"` = co-located, not global). |
| D29 Obsidian vault detection | FR-4 (accepted) |
| D30 image format allowlist | FR-5 (subsumed by `allowedMimeTypes` config) |

## 10) Decision log

| # | Decision | Type | Resolution | 1-way? | Status |
|---|---|---|---|---|---|
| D1 | Scope: 8 items (FR-1 through FR-8). | Cross-cutting | DIRECTED | No | User confirmed via /assess-findings triage (updated to include FR-8 endpoint rename per D-G) |
| D2 | `attachmentFolderPath` default is `"./"` (co-located semantic per D-J free-form string). | Product | DIRECTED | No | Refutes old D2's 1-way framing; evidence: zero assets in content. Semantic bridge: "co-located" = `"./"` per D-J schema (INV1 §2.1). |
| D3 | Transport stays multipart+busboy. | Technical | DIRECTED | No | Refutes old D10; shipped works |
| D4 | Paste decision tree handled by clipboard-mdast-canonical; not in this spec. | Cross-cutting | DIRECTED | No | Superseded |
| D-A | Non-sniffable MIMEs: **strict magic-byte-only**. | Technical | **LOCKED** | No | INV3 confirmed all MUST-haves sniffable; text formats intentionally excluded; belongs in markdown pipeline. |
| D-B | Dedup toast UX: **show toast** — "Already at `docs/photo.png` — reusing." Transient, non-blocking. | Product | **LOCKED** | No | MEDIUM confidence. No prior-art in universe; honest-UX beats silent-reuse debugging opacity. Reversible to silent if P0 dogfood shows noise. `upload.dedup.ui: 'silent' \| 'toast' \| 'confirm'` config escape hatch added to FR-5 with default `'toast'`. |
| D-C | Embed rendering: **image node for image extensions; extension-dispatch for typed Phase 2 nodes (video/audio/PDF) or plain-link fallback in P0**. | Product | **LOCKED** | Yes (user-visible UX) | Universe convergence: Foam + Fumadocs + SilverBullet + Dendron all render as inline image for image-ext; zero pill UX for embeds in surveyed editors. |
| D-D | File-basename index: **in-memory `Map<basename, string[]>`, rebuild at startup + on CC1 `ch:'files'`.** No disk persistence. | Technical | **LOCKED** | No | 100% of index-having editors rebuild at startup (INV2 + Path C). Map sufficient at our scale; no TrieMap dep. |
| D-E | Rename race: **sequential events for markdown-image refs; wiki-embed refs are resolution-independent (architecturally immune).** Document the scope; accept temporary incoherence for markdown-image during bursts. | Technical | **LOCKED** | No | MEDIUM confidence. D-I wiki-embed locks most of the race surface. For residual markdown-image case, Foam/Dendron/SilverBullet all rely on fs-event ordering (no documented pathology). The CC1 100ms broadcast debounce coalesces UI-side invalidation signals (ProviderPool sees one `ch:'files'` event after a burst) — NOT the rewriter path itself. If P0 dogfood surfaces a concrete repro, additively debounce the rewriter. |
| D-F | Non-image emit: **read-time promotion** (Phase 2 adds Video/Audio/PDFViewer dispatch via extension; storage shape never migrates). | Cross-cutting | **LOCKED** | Yes | D-I wiki-embed storage + Phase 2 rendering dispatch = zero content migration. |
| D-G | Endpoint rename: **`/api/upload-image` → `/api/upload` with one-release deprecation shim** (FR-8). | Technical | **LOCKED** | Yes (client breaking) | Greenfield + no-deferred-tech-debt; shim is ~5 LOC; client updates in same PR. |
| D-H | CC1 asset events: **widen file-watcher to emit asset DiskEvents + reuse `ch:'files'`**. | Technical | **LOCKED** | No | Option A per INV6. Reuses shipped infrastructure; matches prior-spec D16 intent (~20 LOC). |
| D-I | Non-image emit shape: **`![[file.ext]]` wiki-embed for renderable extensions (`upload.wikiEmbedExtensions` allowlist); `[name](path)` markdown link fallback for opaque types.** | Product | **LOCKED** | Yes (persistence shape) | 6-editor convergence (Obsidian + Logseq + Foam + Dendron + Fumadocs + SilverBullet) on `![[...]]`; reuses FR-3 parser; Obsidian refugee fidelity; Phase 2 is pure render dispatch. |
| D-J | Obsidian `attachmentFolderPath`: **free-form string** matching Obsidian's literal schema (`"/"` = vault root, `"./"` = co-located, `"./subdir"` = co-located subdir, other = global path). | Technical | **LOCKED** | No | INV1-confirmed 4 patterns; free-form 1:1 passthrough is lossless. |
| D-K | Rename-rewrite scope: **refs only (Foam/Dendron/Obsidian pattern).** Do NOT move co-located asset files when a doc moves. Basename index resolves from new doc location via shortest-path. | Technical | **LOCKED** | Asymmetric (easy to add relocation later; hard to remove it) | MEDIUM-HIGH confidence. D-I wiki-embed immunity means resolution works regardless of physical location — zero functional need for relocation. Obsidian refugee ecosystem expectation matches. SilverBullet's relocation pattern risks silent breakage of shared assets (e.g., `logo.png` referenced by 5 docs) without a backlink-graph (Bucket 7 dep). **Concrete revisit trigger** (per challenger STRONG-2): re-audit orphan-asset density after 12 months of dogfood use. **Paired commitment:** ship `openknowledge gc` (see Future Work → Identified for `gc` scope and triggers). Passive "revisit when complaint" is replaced by this explicit trigger + concrete forward path. |

## 11) Open questions

All P0 decisions resolved. Spec is ready for §Audit.

Cross-editor research grounding: [reports/editor-asset-embed-patterns-across-universe/REPORT.md](../../reports/editor-asset-embed-patterns-across-universe/REPORT.md) (16 editors × 8 dimensions).

Investigation threads (all RESOLVED):

| # | Question | Type | Status |
|---|---|---|---|
| Q-INV1 | Literal schema of `.obsidian/app.json` field names + types | Technical | RESOLVED — `evidence/inv1-obsidian-app-json-schema.md`. 3 target fields confirmed; `"./subdir"` 4th pattern handled by D-J free-form string. |
| Q-INV2 | Foam's TrieMap + `getShortestIdentifier()` algorithm | Technical | RESOLVED — `evidence/inv2-foam-shortest-path-algorithm.md`. Plain `Map<basename, string[]>` sufficient at our scale. |
| Q-INV3 | `file-type@Nx` detection coverage for non-image MIMEs | Technical | RESOLVED — `evidence/inv3-file-type-mime-coverage.md`. We're on v22.0.1 (not 8.x). All MUST-haves (PDF/MP4/MP3/WAV/OGG/WebM/ZIP/fonts) sniffable. Text formats NOT. D-A locked strict. |
| Q-INV4 | Outline's non-image drop pattern for convergence | Technical | RESOLVED — `evidence/inv4-outline-drop-pattern.md`. Outline uses typed nodes (image/video/attachment) with `[title size](url)` metadata encoding. Contributed to D-I analysis. |
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
| A6 | Bun `sha256` or `crypto.subtle.digest('SHA-256')` performance <200ms on 25MB | HIGH | Napkin: SHA-256 is ~500MB/s on modern CPUs; 25MB = ~50ms | Implementation phase |
| A7 | Clipboard-mdast-canonical does NOT touch file-drop paths (NG4 carveout) | **VERIFIED** (INV5) | Done — spec NG4 carveout confirmed verbatim | Resolved |
| A8 | `upload.wikiEmbedExtensions` default allowlist (images + PDF + video + audio) matches what Obsidian renders natively | HIGH | Cross-reference `reports/obsidian-vs-fumadocs-component-inventory/REPORT.md` + Obsidian help docs | Implementation phase |

## 13) In Scope

- Widen FileHandler + server MIME allowlist (FR-1) — `packages/app/src/editor/extensions/shared.ts` + `packages/core/src/constants/upload.ts`
- Client-side emit dispatch on extension (FR-1a) — `packages/app/src/editor/image-upload/index.ts`: wiki-embed emit for `upload.wikiEmbedExtensions` match, plain-link fallback otherwise
- Server sha256 dedup at same-dir scope (FR-2) — `packages/server/src/api-extension.ts` upload handler
- Dedup response shape update (FR-2) — `{deduped: boolean}` in response body
- `wiki-link-micromark.ts` embed tokenizer branch (FR-3a) — `packages/core/src/markdown/wiki-link-micromark.ts`: add `CODE_BANG` (33) → `CODE_LBRACKET` sequence → emit distinct `wikiLinkEmbed` token; reuse existing `[[...]]` tokenizer state machine for body
- File-basename index module (FR-3b) — NEW `packages/core/src/utils/path-resolve.ts`: `Map<basename, string[]>` + `resolveEmbed(basename, sourcePath)` with Foam-style shortest-path elimination
- Embed mdast → PM handler (FR-3c) — `packages/core/src/markdown/handlers.ts`: extension-dispatch (image-ext → PM image node; other `wikiEmbedExtensions` → plain-link fallback in P0, Phase 2 promotes)
- Embed PM → mdast handler (FR-3c reverse) — same file: image/plain-link PM nodes that originated from a `wikiLinkEmbed` serialize back to `![[basename.ext]]`
- Embed write on drop (FR-3d) — bundled into FR-1a insertion logic
- Obsidian vault detection module (FR-4) — NEW `packages/server/src/obsidian-vault-detect.ts`: read-only `.obsidian/app.json` parser with defaults-on-missing/malformed
- Config schema extension (FR-5) — `packages/cli/src/config/schema.ts`: `upload.*` section with `attachmentFolderPath`, `emitFormat`, `maxBytes`, `warnBytes`, `dedup`, `allowedMimeTypes`, `wikiEmbedExtensions`
- File-watcher asset-event widening + CC1 subscriber wiring (FR-6) — `packages/server/src/file-watcher.ts` (emit DiskEvents for asset ext lifecycle) + `packages/server/src/standalone.ts` (`handleDiskEvent` asset-create/delete/rename → `signalChannel('files')`) + `path-resolve.ts` subscribes
- Image-ref rewrite handler (FR-7) — `packages/server/src/managed-rename-rewrite.ts`: remove `line[idx - 1] !== '!'` exclusion; add `readImageRef` branch with relative-path recompute
- Endpoint rename (FR-8) — `packages/server/src/api-extension.ts` register `/api/upload` as primary + `/api/upload-image` as alias-shim; update client POST target at `packages/app/src/editor/image-upload/index.ts:132`
- Tests: unit + integration + fidelity PBT for embed round-trip + rename-rewrite + emit-dispatch matrix (image/video/pdf/audio/zip/docx)

## 14) Risks & mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | `file-type@22.0.1` can't sniff some common user MIMEs (text files, CSVs) | ~~Medium~~ → **RESOLVED** | — | D-A LOCKED strict magic-byte-only. Text formats intentionally excluded by library design; belong in markdown pipeline. |
| R2 | `wikiLinkEmbed` node interacts poorly with existing wiki-link test suite | Low | Medium | New node type, strictly additive per CLAUDE.md precedent #9; existing `wikiLink` tests unchanged |
| R3 | Obsidian schema fields change between versions (vault from older/newer Obsidian) | Medium | Low | Parser tolerates missing fields (defaults); logs warning on schema mismatch |
| R4 | Basename index churn on large vaults (1000+ files) | Low | Medium | NFR-1 sets bound; INV2 validates Foam's perf |
| R5 | Dedup toast UX fights with widget-decoration placeholder UX | Low | Low | Dedup detected server-side; skip placeholder entirely; toast-only path |
| R6 | FR-7 image-rewrite regresses doc-to-doc rename tests | Medium | High | FR-7 is additive branch (doesn't modify existing `[text](link)` path); full regression of managed-rename test suite |
| R9 | `![[file.ext]]` emit storage loses GitHub raw-file preview rendering (GitHub doesn't render wiki-embed) | Medium | Medium | Accepted tradeoff — Obsidian + OK + Fumadocs parity prioritized; GitHub preview is secondary to in-editor/publish paths. Future NG5 publish-time transform covers GitHub export if needed. |
| R10 | FR-3d embed-write on drop produces different content shape than pre-FR-3d hand-authored markdown image refs (`![[foo.png]]` vs `![foo](foo.png)`) — round-trip consistency risk | Low | Medium | Both forms continue to round-trip independently. FR-5's `emitFormat: 'markdown-image'` override available for users who want consistent-shape history. |
| R7 | Widened MIME allowlist enables novel XSS via content-type confusion | Low | High | Server ignores client MIME; magic-byte sniff determines type; SVG-via-img unchanged; non-image types render as link only |
| R8 | FR-4's `.obsidian/app.json` could be a symlink escape vector | Low | Medium | Reuse existing `realpathSync` + `isWithinContentDir` check from upload handler |

## 15) Future work

### Explored (investigated, clear path, not in scope now)

| Item | Recommended approach | Trigger to revisit |
|---|---|---|
| Whole-vault sha256 dedup | Persistent hash index + rebuild on basename-index signal | User reports storage pressure |
| Wiki-link emit (`emitFormat: 'wikilink'`) | Config flag exists; emit-path implementation ~50 LOC | Hardcore Obsidian user requests |
| Typed-component-nodes Phase 2 rich previews | Video/Audio/PDFViewer replace `[name](path)` emit from FR-1 | Phase 2 lands |
| MCP `upload_asset` for agents | Secure bytes upload with origin attribution | Agent-generated diagrams become a feature |
| GC of orphaned assets | `npx openknowledge gc` (scan refs, diff against disk, list+confirm) | Users report storage bloat |
| Embed size modifiers `![[image.png\|640x480]]` | Extend wiki-link-micromark tokenizer with `|modifiers` branch post-anchor; preserve round-trip | User asks |
| Audio/video/PDF anchor modifiers `![[file.pdf#page=3]]` | Extend anchor handling in wikiLinkEmbed mdast | Typed-component-nodes Phase 2 |

### Identified (known to matter, needs its own spec)

- Guard 5 (`validate:` specs across custom nodes) — CVE-2024-40626 class security hardening
- F8 micro-PR: `shortestImageRef` relative emit (one-line + test)
- F9 micro-PR: unicode-safe filename regex (one-line + test)
- Bucket 7: note-to-note `[[Page Name]]` resolution + backlinks + `[[` autocomplete
- **`openknowledge gc` CLI command** (paired with D-K 12-month revisit trigger): scan all markdown refs via basename index + `![alt](src)` regex, diff against actual files under content dir, list orphan assets with per-file size + last-reference timestamp; `--dry-run` default, `--apply` deletes after confirm. Scope: self-contained CLI; reuses existing file-watcher walk logic. Trigger to ship: after D-K 12-month drift audit surfaces non-trivial orphan density in any dogfood vault.

### Noted (surfaced, not examined)

- Obsidian Local REST API plugin integration (alternative vault-access path)
- Compression for pasted screenshots
- Windows path separator testing matrix for cross-platform asset refs

## 16) Agent constraints

**SCOPE:**
- `packages/core/src/markdown/wiki-link-micromark.ts` — extend tokenizer with `!` prefix → `wikiLinkEmbed` token
- NEW `packages/core/src/utils/path-resolve.ts` — file-basename index (`Map<basename, string[]>`) + Foam-style shortest-path resolver + CC1 `ch:'files'` subscriber
- `packages/core/src/markdown/handlers.ts` — add `wikiLinkEmbed` → PM handler (extension dispatch) + PM → mdast reverse
- `packages/core/src/constants/upload.ts` — widen default MIME allowlist (image + PDF + video + audio + ZIP + fonts)
- `packages/cli/src/config/schema.ts` — add `upload.*` Zod section (7 fields per FR-5)
- `packages/server/src/api-extension.ts` — dedup logic in upload handler + register `/api/upload` primary + `/api/upload-image` shim
- `packages/server/src/file-watcher.ts` — widen DiskEvent emission to asset extensions (per D-H)
- `packages/server/src/standalone.ts` — extend `handleDiskEvent` asset cases → `signalChannel('files')`; wire Obsidian vault detection on startup
- NEW `packages/server/src/obsidian-vault-detect.ts` — `.obsidian/app.json` reader with defaults
- `packages/server/src/managed-rename-rewrite.ts` — add `readImageRef` branch (remove `line[idx - 1] !== '!'` exclusion at line 243)
- `packages/app/src/editor/extensions/shared.ts` — FileHandler `allowedMimeTypes` widening
- `packages/app/src/editor/image-upload/index.ts` — extension-dispatch emit (FR-1a) + endpoint URL update `/api/upload-image` → `/api/upload` + dedup toast
- Test files co-located with each new/edited module

**EXCLUDE:**
- Do not modify the clipboard-mdast-canonical pipeline (`packages/core/src/markdown/html-to-mdast.ts`, `mdast-to-html.ts`, WYSIWYG/Source paste handlers)
- Do not modify the shipped image-upload happy path (multipart parsing, widget decoration, server write path, filter-aware sirv)
- Do not modify observer bridges (`observers.ts`, `server-observers.ts`)
- Do not modify the existing wiki-link tokenizer `[[...]]` path — the embed branch is additive
- Do not touch `shortestImageRef()` behavior change (F8 micro-PR handles separately)
- Do not touch filename sanitization regex (F9 micro-PR handles separately)
- Do not add `validate:` specs to custom nodes (A3 separate hardening spec)

**STOP_IF:**
- `wiki-link-micromark.ts` embed branch breaks existing `[[...]]` parser tests → revert and reconsider tokenizer structure
- `wikiLinkEmbed` node definition or tokenizer changes narrow the existing `wikiLink` shape → schema changes must be add-only per precedent #9
- Basename index rebuild time exceeds NFR-1 bound (2s startup for 1000-file vault) → D-D revisit disk persistence
- `file-type@22.0.1` fails to sniff any extension in the shipped `wikiEmbedExtensions` default (PDF/MP4/MP3/WAV/OGG/WebM) → reopen D-A scope; do NOT silently fall back to extension-only
- SVG extension-fallback at `api-extension.ts:2853-2858` is removed without compensating guard → the shipped one-off SVG exception is LOAD-BEARING; D-A strict-magic-byte retains this specific fallback
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
