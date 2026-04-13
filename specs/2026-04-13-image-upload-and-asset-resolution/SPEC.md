# Image Upload & Asset Resolution — Spec

**Status:** Approved (Session 1 finalized 2026-04-13)
**Owner(s):** Andrew (taking over PR #41 from Sarah Niemiec)
**Last updated:** 2026-04-13
**Baseline commit:** b822fb2 (verified — no commits made in this worktree during spec)
**Links:**
- Prior PR: [inkeep/open-knowledge#41 (implement/image-upload)](https://github.com/inkeep/open-knowledge/pull/41) — in-flight; spec drives rework of three load-bearing decisions
- Evidence: `./evidence/markdown-asset-conventions.md`, `./evidence/pr41-current-state.md`
- Source meeting: 2026-04-13 sync with Sarah Niemiec
- Sibling spec (parallel track, not this spec): new-file UX + copy/delete/duplicate file ops

---

## 1) Problem statement

**Situation.** Open Knowledge is a markdown-first CRDT wiki editor. The TipTap schema already accepts `image` nodes; the unified/remark pipeline round-trips `![alt](path)` losslessly. An in-flight PR (#41) has built drag/paste/slash-command image upload with solid security (magic-bytes MIME verification, sanitized filenames, atomic writes, nosniff headers) and upload UX (skeleton placeholder, error toasts). However, PR #41 stores all uploads in a single flat `<contentDir>/uploads/` directory, serves them through a parallel `sirv` middleware that bypasses the content-filter, and adds a new `content.uploadsDir` config key.

**Complication.** The flat-uploads topology encoded in PR #41 does not match the authoring model the team agreed on: uploads should land **as siblings of the editing `.md` file** so markdown + assets move together as a bundle, multiple `.md` files can reference the same image across arbitrary paths, and the existing `content.include`/`content.exclude` config interprets assets correctly without a schema addition. PR #41 also has a latent reference-path bug: root-relative `src="uploads/screenshot.png"` resolves against the current page URL, which breaks on any nested docs-site route. Shipping PR #41 as-is locks in three one-way doors (storage topology, inclusion mechanism, reference-path convention) that must be reverted before any of the other v0 work that depends on "where assets live" can proceed.

**Resolution.** Retarget PR #41 to the sibling-co-located model with three coordinated changes, preserving everything else PR #41 built:
1. **Storage.** New uploads land as siblings of the editing `.md` file. A content-hash or timestamp filename strategy prevents collisions.
2. **Inclusion.** Reinterpret `content.include` globs: for every `.md` file matched by `include`, any sibling file whose extension is in a hardcoded asset-allowlist (png/jpg/jpeg/gif/webp, extensible later) is auto-included. `content.exclude` continues to override. No config schema change.
3. **References + serving.** Inserted markdown references are relative to the editing `.md` (`![](screenshot.png)` when co-located). A single asset-serving HTTP endpoint resolves asset paths consistently for both editor and docs site.

## 2) Goals
- G1: Wiki authors can drag / paste / slash-command images into the editor and have them land next to the page's markdown with zero config.
- G2: A single image can be referenced from multiple `.md` files via relative paths; the authoring model doesn't force duplication.
- G3: Config schema (`content.include` / `content.exclude`) is unchanged; existing configs continue to work; defaults continue to "just work" without user edits.
- G4: Asset references resolve correctly in both the editor (`bun run dev`) and the built docs site.
- G5: No degradation of PR #41's security properties (MIME magic-bytes check, size cap, filename sanitization, nosniff headers).

## 3) Non-goals
- **[NOT NOW]** NG1: UI control to move an image to a different directory after upload. — Revisit when sibling model is shipped and we observe asset-reorganization friction; likely next spec cycle.
- **[NOT NOW]** NG2: Orphaned-asset garbage collection (deleting image files whose references were all removed). — Revisit when we have data on orphan accumulation rates.
- **[NOT NOW]** NG3: Cross-file reference rewrite when an image is moved. — Depends on NG1 shipping first.
- **[NOT NOW]** NG4: Configurable upload location (Obsidian-style 4-mode picker). — Sibling-only for v1; revisit on user demand.
- **[NEVER]** NG5: New-file UX and copy/delete/duplicate file operations. — Handled by a separate parallel-track spec (per meeting, "handled by someone else").
- **[NOT UNLESS]** NG6: MCP asset-write tool for agents. — Only if agents produce enough generated-image workflows (diagrams, charts) that human-upload-only is a measurable bottleneck.

## 4) Personas / consumers
- **P1 — Wiki author (human writer).** Primary persona. Drags screenshots in; expects inline rendering; expects the markdown file to commit cleanly alongside the asset; expects "move the folder = move the images" semantics.
- **P2 — Reader of published docs site.** Loads Fumadocs-rendered pages; expects `<img>` tags to resolve.
- **P3 — Agent (MCP).** Writes markdown referencing images. In scope for path-resolution correctness; out of scope for upload capability (NG6).
- **P4 — Repo admin.** Authors `content.include`/`exclude` in YAML; expects defaults to work without changes.

## 5) User journeys

### P1 — Wiki author (happy path: drag-drop)
1. Opens `docs/guide.md` in the editor.
2. Drags `screenshot.png` from Finder into the editor.
3. Sees an immediate skeleton placeholder at the cursor.
4. `uploadAndInsert()` POSTs multipart to `/api/upload-image` with `parentDocName=docs/guide.md`.
5. Server validates: MIME magic-bytes ∈ allowlist, size < 10 MB, filename sanitized, `safeContentPath` on `contentDir/docs/screenshot.png`, atomic `openSync(..., 'wx')` write; on `EEXIST`, retries `screenshot-1.png`, `screenshot-2.png`, ..., up to `-99`.
6. Server responds `{ ok: true, src: 'screenshot.png' }` (bare filename, since it's a sibling).
7. Editor removes skeleton, inserts `imageNode({ src: 'screenshot.png', alt: 'screenshot' })`. CRDT sync writes `![screenshot](screenshot.png)` to `docs/guide.md`.
8. Browser renders the image via `/screenshot.png` (resolved against `docs/guide.md`'s URL base → `/docs/screenshot.png` → filtered-sirv serves `contentDir/docs/screenshot.png`).
9. File watcher `create` event fires for `docs/screenshot.png`; filter includes it (png ∈ allowlist, `docs/` has `.md`); enters the file index.

### P1 — Paste path (happy)
Same as drag-drop, except: `file.name` from clipboard is usually `image.png` or empty. `sanitizeFilename` detects generic/empty → synthesizes `pasted-20260413-104523.png`. Rest identical.

### P1 — Slash-command path
User types `/image`, selects file via `<input type=file>`. Routes through `uploadAndInsert()` with cursor position as `insertPos`. Same backend.

### P1 — Failure paths
- **File too large:** Server 413. Editor removes skeleton, toasts "Payload too large."
- **Unsupported MIME** (e.g. dropped a `.heic` or `.tiff` — note SVG is now accepted per D12): Server 400 with detected type. Editor toasts "Unsupported file type: image/heic."
- **Symlink escape:** Server 400 "symlink-escape". Editor toasts generic "Upload failed."
- **Network error:** Editor toasts "Upload failed"; skeleton removed.

### P1 — Undo path
User Ctrl-Z after insert. `imageNode` removed from XmlFragment; `![](screenshot.png)` removed from Y.Text → markdown file. **File remains on disk** (D14 orphan policy). Redo re-inserts the reference; file is already there; no re-upload needed.

### P1 — Debug experience
- Image doesn't render after insert: Network tab shows 404 on `/docs/screenshot.png` → filter excluded it (check D11 allowlist / gitignore) OR file watcher didn't see the create event (check watcher logs).
- Upload fails with 400: Server logs the detected MIME + sanitized filename.

### P2 — Docs site reader
**Out of scope today (D10).** Follow-up owns Fumadocs-side resolution.

### P3 — Agent (MCP)
Agent writes `![](diagrams/flow.png)` in a `.md` file it can edit. No upload capability (D13). Reference resolves via same filtered-sirv path if `diagrams/flow.png` was previously uploaded by a human.

### Interaction state matrix

| Surface | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| Drag-drop | skeleton widget | — | sonner toast + skeleton removed | `imageNode` inserted, skeleton removed | — |
| Paste | skeleton widget | — | sonner toast + skeleton removed | `imageNode` inserted at cursor | — |
| Slash `/image` | file picker → skeleton | picker cancelled: noop | picker error: noop | same as drag | — |
| Image render | browser loading state | — | broken-image icon | image displays | — |
| Filter re-include | — | no `.md` in dir → asset excluded | — | asset included | — |

## 6) Requirements

### Functional
| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | FR1. Drag-drop of an allowlisted image into editor uploads + inserts `![alt](filename)` at cursor. | Drop `screenshot.png` → file appears at `<contentDir>/<mdDir>/screenshot.png`; markdown contains `![screenshot](screenshot.png)` at the drop position; image renders in WYSIWYG within 2s. | Uses `FileHandler.onDrop`. |
| Must | FR2. Paste of a clipboard image uploads + inserts at cursor with a timestamp-stemmed filename if no real name is present. | Cmd-V on a screenshot → file named `pasted-YYYYMMDD-HHMMSS.png` (UTC), same insert/render behavior as FR1. | `FileHandler.onPaste` + D8 naming logic. |
| Must | FR3. Slash-command `/image` opens file picker → upload + insert. | `/image` + file selection → same behavior as FR1. | Existing slash-command infra. |
| Must | FR4. Uploaded images land as siblings of the editing `.md`. | `parentDocName` carried in upload request; server writes to `dirname(parentDocName)/<sanitized-filename>`. | Cross-path references still legal — only the *default* is sibling. |
| Must | FR5. Content-filter auto-includes allowlisted non-md files in directories containing ≥1 included `.md`. | `docs/screenshot.png` included iff `docs/*.md` matches include AND `png ∈ ASSET_EXTENSIONS` AND not in `exclude`/gitignore. | D11 algorithm. |
| Must | FR6. `exclude` / gitignore still supersedes the allowlist. | Add `'**/*.png'` to `content.exclude` → no png served; gitignore the dir → dir excluded. | Existing precedence preserved. |
| Must | FR7. Assets served via filtered-sirv over `contentDir`. | GET `/<path>` returns file bytes with correct Content-Type + `X-Content-Type-Options: nosniff` iff `!contentFilter.isExcluded(path)`. | D9. |
| Must | FR8. Asset references inserted use shortest-path hybrid (D7): bare filename when sibling, `'/' + path` when cross-dir. | Sibling upload (the only insertion path in v1) → `![](screenshot.png)` (not `/docs/screenshot.png` or `uploads/screenshot.png`). Cross-dir helper present and unit-tested for future use. | D7 hybrid. |
| Must | FR9. Symlink-escape-safe uploads. | POST with a path whose `realpath` resolves outside `contentDir` → 400 `symlink-escape`. | D15, reuse `safeContentPath`. |
| Must | FR10. Finder-dropped images (direct filesystem write, not through editor) become reachable. | `cp img.png docs/` from terminal → `/docs/img.png` serves correctly within 1 watcher tick. | D17, filter + watcher integration. |
| Should | FR11. Upload size cap enforced at 10 MB with clear error. | POST > 10 MB → 413 + "Payload too large"; editor toasts the message. | Inherit PR #41. |
| Should | FR12. MIME verified via magic bytes, not trust client. | Rename `.exe` → `.png` + upload → 400 "Unsupported file type." | Inherit PR #41. |
| Could | FR13. Collision on drop uses numeric suffix up to `-99`. | Drop `screenshot.png` 3 times → `screenshot.png`, `screenshot-1.png`, `screenshot-2.png`. | Inherit PR #41. |

### Non-functional
- **Performance:** Content-filter startup walk over 10k `.md` completes <500 ms. `isExcluded` remains O(1) amortized.
- **Reliability:** Upload atomic (existing `openSync('wx')` pattern); partial-write artifacts impossible.
- **Security:** MIME magic-bytes verification; sanitized filenames; symlink-escape-safe; filter-wrapped sirv; no SVG.
- **Operability:** Upload endpoint logs `[upload] ok <path> <bytes>` / `[upload] error <path> <bytes> <msg>` (PR #41 precedent).
- **Cost:** No new runtime dependencies beyond PR #41 (busboy, file-type, sonner already added).

## 7) Success metrics & instrumentation
*(To draft.)*

## 8) Current state (how it works today)
PR #41 ships:
- `POST /api/upload-image` multipart endpoint (busboy, 10 MB cap, MIME magic-bytes via `file-type`)
- MIME allowlist: jpeg/png/gif/webp in `@core/constants/upload.ts`
- TipTap `FileHandler` (drop + paste) + slash `/image`
- `uploadAndInsert()` with skeleton PM decoration + sonner toasts
- `sirv` static serving at `/${uploadsDir}/*` in both dev plugin and CLI prod
- Flat `<contentDir>/uploads/` storage; `content.uploadsDir` config key

See `evidence/pr41-current-state.md` for the full catalog.

## 9) Proposed solution (vertical slice)

### Architecture

```
Browser (editor)
  │
  │  drag / paste / slash  ─┐
  │                          │
  │                          ▼                    ┌──────────────────────┐
  │            @tiptap/extension-file-handler ──► │ uploadAndInsert()    │
  │                                                │   POST multipart     │
  │                                                │   /api/upload-image  │
  │                                                │   body: {file,        │
  │                                                │     parentDocName}   │
  │                                                └──────────┬───────────┘
  │                                                           │
  │   GET /<parentDir>/<filename>                             ▼
  │   ◄────────────────────────────┐       ┌─────────────────────────┐
  │                                │       │ handleUploadImage        │
  ▼                                │       │  busboy → bytes           │
┌─────────────────────────┐        │       │  file-type magic-bytes    │
│ contentDir middleware   │        │       │  sanitizeFilename (+ paste│
│  (filter-aware sirv)    │◄───────┤       │   timestamp)              │
│  if isExcluded → next() │        │       │  safeContentPath          │
│  else sirv serves file  │        │       │  atomic openSync('wx')    │
└────────────┬────────────┘        │       │  numeric-suffix collision │
             │                     │       └──────────┬───────────────┘
             ▼                     │                  │ write
      <img> renders                │                  ▼
                                   │         ┌──────────────────┐
                                   │         │ <contentDir>/    │
                                   │         │   <parentDir>/   │
                                   │         │     <filename>   │
                                   │         └────────┬─────────┘
                                   │                  │ fs watch
                                   │                  ▼
                                   │         ┌──────────────────┐
                                   │         │ file-watcher     │
                                   │         │  isExcluded?     │
                                   │         │  allowlisted ext │
                                   │         │  + sibling .md?  │
                                   │         │   → include      │
                                   │         └────────┬─────────┘
                                   └──────────────────┘
                                       file index updated
```

### Data model
No CRDT / schema additions. Existing `image` node carries `src` attr. Existing mdast `image` Tier-A handler serializes/parses. `content.uploadsDir` schema field is removed (D16).

New persistent state: directory-index set `dirsWithIncludedMd: Set<string>` held in `ContentFilter`. Rebuilt at construct; mutated incrementally on watcher `.md` create/delete.

New shared constants in `@core/constants/upload.ts`:
```ts
export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'] as const;
export const ASSET_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']);
```

### API / transport
- **`POST /api/upload-image`** (preserved from PR #41):
  - multipart/form-data, field `file` + field `parentDocName` (NEW — derived from editor's current doc).
  - Response: `{ ok: true, src: '<bareFilename>' }` (CHANGED from PR #41 — bare filename, not path).
- **`GET /<relPath>`** (CHANGED from PR #41):
  - Served by filter-aware sirv over `contentDir`. Respects `ContentFilter.isExcluded`.
  - Headers: `Content-Type` from ext, `X-Content-Type-Options: nosniff`, sirv's standard caching.

### Auth / permissions
Inherits current server model (no auth layer on dev/CLI server yet — same as existing `/api/*`). Out of scope to add here.

### Enforcement points
- **Extension allowlist:** upload endpoint (magic-bytes check) AND filter (`ASSET_EXTENSIONS.has(ext)`).
- **Exclude/gitignore:** filter only.
- **Symlink escape:** upload endpoint via `safeContentPath`; sirv path-traversal protections (battle-tested).

### Observability
- Upload logs: `[upload] ok <relPath> <bytes>` / `[upload] error <filename> <bytes> <msg>` (existing).
- Filter logs (new, debug only): first-time allowlist-inclusion of a file emits `[filter] include-asset <path>` at debug level.
- No metrics additions for v1.

### Data flow — primary + shadow paths
- **Primary:** drop → upload → disk → watcher → filter include → file index → subsequent GETs served.
- **Shadow — drop before watcher ready:** extremely rare; if the watcher hasn't bootstrapped, the file lands on disk but isn't yet in the index. Next watcher tick picks it up.
- **Shadow — concurrent drops of same filename:** atomic `wx` + retry loop; one client gets `screenshot.png`, the other gets `screenshot-1.png`. No data loss.
- **Shadow — `.md` deleted after asset inclusion:** filter removes the dir from `dirsWithIncludedMd` on last-md-delete; asset becomes excluded; GET returns 404. Asset file remains on disk (orphan, NG2).
- **Shadow — symlink escape:** upload 400.
- **Shadow — MIME spoof:** magic bytes reject, 400.
- **Shadow — oversize:** 413.

### Failure modes

| Component | Failure | Detection | Recovery | User impact |
|---|---|---|---|---|
| busboy parser | malformed multipart | busboy error event | 400 with message | toast "Failed to parse upload" |
| file-type check | bytes don't match any known type | `fileTypeFromBuffer` returns undefined | 400 "Unsupported file type" | toast |
| atomic write | 99 collisions in one dir | retry loop exhausted | 500 "Failed to save" | toast; rare |
| safeContentPath | resolves outside contentDir | helper throws | 400 "symlink-escape" | toast |
| filter cache | `.md` created but cache stale | watcher emits `create` but filter doesn't update | N/A — must not happen; watcher→filter wiring is the correctness property | image 404s permanently until server restart |
| sirv | path traversal in URL | sirv rejects `..` segments | 404 | none |

### Alternatives considered
- **Reference-driven inclusion** (walk `.md` files, parse references, include those exact paths). Rejected — evidence/markdown-asset-conventions.md shows every production tool that uses this does it at build time, not as a live content-source gate. Fails the drop-before-type race and CRDT write race for a live collab editor.
- **Central `assets/` folder** (Obsidian/Logseq/Jekyll default). Rejected — contradicts the team's "move the folder, images come with it" authoring model and is the design encoded in PR #41 that this spec exists to replace.
- **Sibling with blanket non-md include** (include every non-`.md` file next to any matched `.md`). Rejected — over-includes `package.json`, lockfiles, miscellaneous text files. Hardcoded extension allowlist narrows to actual assets.

## 10) Decision log

| ID | Decision | Type | Resolution | 1-way? | Rationale | Evidence | Implications |
|---|---|---|---|---|---|---|---|
| D1 | Frame this spec as a rework of PR #41 to the sibling-co-located model, preserving upload transport / security / UX polish. | X | LOCKED | No | Meeting transcript + PR #41 diff confirm divergence on three load-bearing axes; rest is reusable. | evidence/pr41-current-state.md | Spec drives diff, not greenfield. |
| D2 | Move-image UI is OUT of this spec (NG1). | P | LOCKED | No | Meeting transcript: "later." User confirmed someone else owns it. | — | Storage model must permit cross-path references so the future UI can move assets without breaking markdown. |
| D3 | Sibling-auto-include with hardcoded asset-extension allowlist; no `include`/`exclude` schema change. Allowlist may be surfaced in default config for visibility. | T | LOCKED | Yes | Research shows reference-driven fails live-editor races; blanket sibling over-includes. Narrow allowlist solves both. | evidence/markdown-asset-conventions.md | `content-filter.ts` gets a second pass: if a file's extension is in the allowlist AND a sibling `.md` is included, include the file. `exclude` still wins. |
| D6 | Upload location is sibling-only for v1. Configurable upload location is Explored Future Work. | P | LOCKED | No | Simplest surface that matches the meeting intent; Obsidian-style 4-mode picker is future. | — | Storage model designed to permit future relocation config without migration. |
| D7 | **Shortest-path hybrid** insertion rule: choose the shorter of (a) sibling-relative bare filename (`![](screenshot.png)`) when the asset lives in the same directory as the editing `.md`, or (b) root-relative-with-leading-slash (`![](/docs/diagrams/screenshot.png)`) when the asset lives in a different directory. For uploads — which always land sibling per D6 — this collapses to (a). For pre-existing or relocated references, the editor/serializer applies the rule consistently. The serving layer MUST resolve both forms correctly. | T | LOCKED | Yes | Q24 reopen result. Sibling-relative is portable for bundles but breaks under single-`.md` moves; root-relative survives moves but is verbose. Shortest-path hybrid: ergonomic in the common case (sibling), robust elsewhere. **Move-rewrite (NG3) becomes the principled fix** for cross-directory updates and remains future work. | evidence/markdown-asset-conventions.md, design-challenge.md H2 | Editor needs a `relativeFromMd(assetPath, mdPath)` helper. Serving layer must accept both `<file>` (resolved from current URL base) and `/<path>` (resolved from contentDir root). |
| D16 | Rip out `content.uploadsDir` config key entirely. Not redefined, not kept. | T | LOCKED | Yes | Sibling-only (D6) means no central uploads dir exists. Keeping the key would be dead config; redefining smuggles configurability deferred to Future Work. Pre-v0 — no deployed users to break. | evidence/pr41-current-state.md | PR #41's schema change reverts. Config stays at `{dir, include, exclude}`. |
| D5 | Launch target: 2026-04-13 (today). Andrew takes over PR #41 from Sarah. DoD = "drop/paste/slash works; sibling storage; filter includes assets; renders in editor + docs." | P | LOCKED | No | User-stated. | — | Spec trims to actionable rework guidance; deep world-model pass compressed. |
| D8 | Filename collision: numeric suffix `-1..-99` for drop + slash-picker (inherit PR #41); timestamp-stemmed `pasted-YYYYMMDD-HHMMSS.png` for clipboard paste when no real filename present. | T | LOCKED | No | Matches Obsidian/VS Code/Typora convention; avoids `image-N.png` accumulation. | evidence/markdown-asset-conventions.md | Small addition to PR #41's `sanitizeFilename` — detect clipboard-origin pastes and synthesize timestamp stem before sanitize. |
| D13 | MCP asset-write tool OUT of v1. | P | LOCKED | No | User postpones; file-edit MCP tools are in scope of Tim's PR #103 (separate concern). | https://github.com/inkeep/open-knowledge/pull/103 | Keep the upload endpoint human-only; no new MCP tool. |
| D14 | Orphan-on-undo: file stays on disk when image-insert is undone. Revisit when shadow-repo git attribution lands (Miles's PR #39). | P | LOCKED | No | Cross-client delete races are unresolvable without a reference index; shadow-repo attribution will enable a principled policy later. | https://github.com/inkeep/open-knowledge/pull/39 | No cleanup code in this spec's rework. Future Work NG2 (orphan GC) gains a trigger condition. |
| D4 | Of the 22 candidate Open Questions from Intake, P0 set (13): Q1, Q2, Q3+Q11 (merged), Q4, Q7, Q8, Q9, Q10, Q17, Q19, Q20, Q21, Q22. P2 set (8): Q5, Q6, Q12, Q13, Q14, Q15, Q16, Q18. P0 questions resolved by D6/D7/D8/D9/D11/D12/D13/D14/D15/D17. | X | DIRECTED | No | Scoped by launch-today pressure (D5); P2 items are PR #41 inheritances or Future Work. Audit H2: counts now exhaustive (22 = 13 + 8 + 1 dup-merged). | §11 lists the questions. | P0 items closed by decision log; rework checklist (§13) makes them implementable. |
| D9 | Asset serving via **filtered-sirv over `contentDir`**: keep `sirv` from PR #41 but remove the scoped `/${uploadsDir}/` mount; instead mount over all of `contentDir` with a middleware wrapper that consults `ContentFilter.isExcluded(path)` and short-circuits to `next()` (404) when excluded. | T | LOCKED | Yes | Q23 reopen result: user direction is to keep filtered-sirv wide for v1; auth (currently absent system-wide) will be the proper gate for HTTP resource access when it lands. Narrowing to ASSET_EXTENSIONS-only (the alternative) is logged as a viable future hardening if auth doesn't ship soon. | packages/app/src/server/hocuspocus-plugin.ts, packages/cli/src/commands/start.ts | **Known surface area expansion (deferred):** raw `.md` source becomes HTTP-reachable (Med risk in §14). Acceptable for v1 — content is intentionally browseable, no auth boundary exists yet to gate finer-grained access. Future Work — Identified: when auth lands, gate filtered-sirv accordingly (or narrow to assets-only). |
| D10 | Docs-site (Fumadocs) rendering of uploaded images is **follow-up, not launch-today**. DoD scoped to editor (`bun run dev` + `open-knowledge start`). | P | LOCKED | No | User-directed. Fumadocs/Next.js has its own image resolution pipeline outside this server's scope. | — | Separate task for whoever owns `docs/`. Filed under Future Work — Identified. |
| D11 | Content-filter reinterpretation: at construct time, walk `contentDir` and build `Map<string, number>` (refcount of included `.md` per directory). `isExcluded(path)` new logic, in order: **(1) gitignore/exclude wins** — if `ig.ignores(...)` return true; **(2) include-pattern match** → include; **(3) sibling-asset rule** — if `extname(path).slice(1).toLowerCase() ∈ ASSET_EXTENSIONS` AND `dirCount.get(dirname(path)) > 0` → include; **(4) else** → exclude. On watcher `.md` `create`: increment counter at `dirname(docName)`. On `.md` `delete`: decrement; remove key when 0. **Rename across dirs** is decomposed by parcel/chokidar into delete+create (assumption A4) — both fire, refcount stays consistent. **Hot-reload of `content.include`** is NOT supported in v1: config changes require server restart (assumption A5). | T | LOCKED | Yes | Sibling-auto-include narrowed by extension allowlist; exclude-wins preserved (M1-audit). Refcount avoids boolean-set scan-on-delete bug (M3-challenge). Rename + hot-reload assumptions documented. | packages/server/src/content-filter.ts, packages/server/src/file-watcher.ts | Filter becomes stateful (refcount map). Watcher must call filter lifecycle hook on `.md` create/delete. |
| D12 | `ASSET_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']`. `ALLOWED_IMAGE_MIME_TYPES` includes `'image/svg+xml'`. Co-exported from `@core/constants/upload.ts`. **SVG accepted at storage** consistent with CLAUDE.md's "storage never sanitizes; render-time layers do" precedent. **Render path constraint:** SVGs are rendered ONLY via `<img src>` (TipTap default); inline `<svg>` HTML embedding is NOT supported by the editor. Per HTML spec, scripts in SVG loaded via `<img>` do not execute. Docs site (D10 deferred) owns its own SVG render-safety story. | T | LOCKED | Yes | Q25 reopen result. Architectural precedent (CLAUDE.md storage-fidelity contract) + HTML spec safety of `<img src=svg>` + diagram-authoring use case (Mermaid/Figma exports) all align. | CLAUDE.md "Storage-layer fidelity contract", design-challenge.md M4 | If a future feature surfaces inline-SVG embedding, the render-layer sanitizer becomes a new requirement. Not in v1 scope. |
| D15 | Upload endpoint MUST: (1) reject `parentDocName` containing `\x00` or `..` segments or absolute paths; (2) compute `destPath = resolve(contentDir, dirname(parentDocName), sanitizedFilename)`; (3) verify `isWithinContentDir(destPath, contentDir) === true` (helper already exists at `persistence.ts:50`); (4) verify `isWithinContentDir(realpathSync(dirname(destPath)), contentDir) === true` to defeat symlink escape. Reject with 400 `path-escape` on any failure. | T | LOCKED | Yes | Audit H1: `safeContentPath` is not reusable as originally claimed (it appends `.md`). `isWithinContentDir` is the correct primitive. Audit H3: explicit normalization required. Non-negotiable. | packages/server/src/persistence.ts:50 | Rework task amended (§13 step 5). |
| D17 | Upload HTTP response-shape change from `{ src: '<uploadsDir>/<file>' }` (PR #41) to `{ src: '<bareFilename>' }` is a wire-contract change. Marked 1-way=No because pre-v0, no external consumers. | T | LOCKED | No | Audit M4: deserves an explicit decision row even though pre-v0. | evidence/pr41-current-state.md | Editor frontend updated (§13 step 8) to consume bare filename verbatim. |

## 11) Open questions

All 22 candidate questions from Intake have been triaged into D4. The full enumeration:

| ID | Question | P | Resolution |
|---|---|---|---|
| Q1 | Sibling = same-dir only or extends to nested `assets/`? | P0 | Resolved by D11: same-dir only; refcount keyed by `dirname()`. |
| Q2 | Filename collision strategy (drop vs paste)? | P0 | Resolved by D8. |
| Q3 | Allowed MIME / extension set? | P0 | Resolved by D12 (`png/jpg/jpeg/gif/webp`). |
| Q4 | Max upload size? | P0 | 10 MB (inherit PR #41). |
| Q5 | Upload transport — multipart vs base64? | P2 | multipart inherited from PR #41. |
| Q6 | Atomic-write strategy? | P2 | `openSync('wx')` inherited. |
| Q7 | Serving endpoint shape? | P0 | Resolved by D9 (filtered-sirv); pending Q23 reopen. |
| Q8 | Docs site (Fumadocs) parity? | P0 | Resolved by D10 (deferred). |
| Q9 | Filter reinterpretation algorithm? | P0 | Resolved by D11. |
| Q10 | Default-config behavior against `**/*.md`? | P0 | Resolved by D11+D12. |
| Q11 | Asset vs not-asset (allowlist)? | P0 | Merged with Q3. |
| Q12 | Orphan GC? | P2 | NG2 — Future Work. |
| Q13 | Move/rename UI? | P2 | NG1 — Future Work. |
| Q14 | Reference rewrite on move? | P2 | NG3 — Future Work. |
| Q15 | Paste / drag / slash same backend? | P2 | Yes (PR #41). |
| Q16 | MCP asset-write tool? | P2 | Resolved by D13 (NG6). |
| Q17 | Finder-dropped images auto-served? | P0 | Resolved by D11+D17. |
| Q18 | Slash-command name? | P2 | `/image` (PR #41). |
| Q19 | Undo policy? | P0 | Resolved by D14 (orphan). |
| Q20 | Multi-client race on same path? | P0 | Resolved: atomic `wx` + numeric retry. |
| Q21 | Symlink escape? | P0 | Resolved by D15. |
| Q22 | Security: arbitrary binaries via docs site? | P0 | Resolved by D12 + nosniff + filter. |

**RESOLVED — judgment reopens (Session 1):**

| ID | Question | Resolution |
|---|---|---|
| Q23 | Narrow filtered-sirv to `ASSET_EXTENSIONS`-only? | NO (per user). Keep wide; auth (future) is the proper gate. Logged as Future Work — Identified. |
| Q24 | Reference-path style? | Shortest-path hybrid (D7 updated). |
| Q25 | Accept SVG? | YES (D12 updated). Render via `<img src>` only. |
| Q26 | Ship full rework today vs staged? | All today (per user). |

## 12) Assumptions
| ID | Assumption | Confidence | Verification plan | Expiry |
|---|---|---|---|---|
| A1 | `@tiptap/extension-file-handler` covers the drop + paste surface completely for our needs (no Safari / Firefox / mobile gaps). | MEDIUM | Browser matrix test during /worldmodel or implementation. | Before finalization. |
| A2 | Root-relative `src="uploads/file.png"` in PR #41 does break on nested docs-site routes. | MEDIUM | Render a nested page in `docs/` and inspect `<img>` resolution. | Before finalization. |
| A3 | Content-filter second-pass (auto-include allowlisted siblings of included `.md`) does not introduce pathological startup-time cost for large repos. | MEDIUM | Benchmark on a repo with ~10k markdown files. | Before In Scope lock. |
| A4 | parcel/chokidar emit `.md` rename across directories as delete+create (both events fire), so the refcount-based filter stays consistent. | MEDIUM | Add a watcher-rename test that asserts both `dirCount` decrement (old dir) and increment (new dir). | Before merge. |
| A5 | Hot-reload of `content.include` is not supported in v1; config changes require server restart. | HIGH | Not a feature — verified by inspection of `resolveContentConfig()` (called once at module load). | — |

## 13) In Scope (rework PR #41 → merge today)

**Goal:** Ship sibling-located image upload with filter-aware asset serving, preserving PR #41's upload transport + security + UX polish.

**Rework checklist (the implementable artifact):**

1. **Remove** `content.uploadsDir` from `packages/cli/src/config/schema.ts` and the commented example in `.open-knowledge/config.yml`.
2. **Remove** `uploadsDir` param from `ServerOptions` (`packages/server/src/standalone.ts`), `ApiExtensionOptions` (`packages/server/src/api-extension.ts`), and all call sites.
3. **Remove** the `sirv(uploadsDir)` mount in `packages/app/src/server/hocuspocus-plugin.ts` (~line 200) and the "Priority 2: Uploaded images" block in `packages/cli/src/commands/start.ts`.
4. **Add** filter-aware sirv middleware in both dev plugin + CLI (D9):
   ```ts
   const contentSirv = sirv(contentDir, { dev: <mode>, dotfiles: false });
   middlewares.use((req, res, next) => {
     const rel = decodeURIComponent(req.url?.split('?')[0]?.replace(/^\//, '') ?? '');
     if (!rel || contentFilter.isExcluded(rel)) return next();
     res.setHeader('X-Content-Type-Options', 'nosniff');
     contentSirv(req, res, next);
   });
   ```
5. **Rewrite** `handleUploadImage` in `packages/server/src/api-extension.ts`:
   - Accept `parentDocName` field from multipart (required).
   - Compute `destDir = resolve(contentDir, dirname(parentDocName))`.
   - Run through `safeContentPath(destDir, ...)` for symlink-escape check (D15).
   - If `filename` is empty or generic (`image.png`, `Clipboard*`, empty) → synthesize `pasted-YYYYMMDD-HHMMSS.<ext>` from detected MIME (D8/b1).
   - Keep sanitize + numeric-suffix collision + atomic `openSync('wx')`.
   - Response: `{ ok: true, src: '<bareFilename>' }`.
6. **Modify** `packages/server/src/content-filter.ts`:
   - Construct: walk `contentDir`, build `dirCount: Map<string, number>` (refcount of included `.md` per dir).
   - Extend `isExcluded` per D11 (gitignore/exclude → include-pattern → sibling-asset → exclude).
   - Export `incrementMdDir(dir)` / `decrementMdDir(dir)` helpers for watcher callbacks.
7. **Modify** `packages/server/src/file-watcher.ts`: on `.md` create event call `filter.incrementMdDir(dirname(docName))`; on `.md` delete call `filter.decrementMdDir(dirname(docName))`; on rename (if emitted as a single event) decompose to delete-old + create-new. Apply to the initial startup walk so the refcount map is consistent on first watcher tick.
8. **Add** `ASSET_EXTENSIONS = new Set(['png','jpg','jpeg','gif','webp','svg'])` to `packages/core/src/constants/upload.ts`; extend `ALLOWED_IMAGE_MIME_TYPES` with `'image/svg+xml'`; export both from `packages/core/src/index.ts` (D12).
9. **Frontend: update** `packages/app/src/editor/image-upload/index.ts`:
   - Include `parentDocName` in the `FormData` (derive from the editor's provider docName / current file).
   - Consume `{ src: '<bareFilename>' }` and insert `imageNode({ src: bareFilename, alt })` — for uploads (always sibling) the bare name IS the shortest reference.
   - Add `shortestImageRef(assetPath, mdPath)` helper for future cross-dir cases (D7 hybrid): `dirname(asset) === dirname(md)` → bare filename; else `'/' + assetPath`. Helper unused on the upload path today; will be used by future move-rewrite (NG3) and any non-upload insertion paths.
10. **Preserve** from PR #41: `FileHandler` wiring, slash `/image`, skeleton widget, sonner, magic-bytes check, busboy, 10 MB cap.

**Owner/DRI:** Andrew (taking over PR #41).

**Acceptance for merge:**
- FR1–FR13 pass manual test.
- `bun run check` green (no regressions to filter tests, bridge-matrix).
- `bun run test` includes new `content-filter.test.ts` cases for: sibling-inclusion rule, `exclude` precedence over allowlist, refcount lifecycle on `.md` create/delete (A4).
- `packages/server/src/api-extension.ts` upload tests cover: happy-path sibling write, paste timestamp-stem, parentDocName traversal-rejection (`../` and absolute), symlink-escape reject, oversize reject, bad-MIME reject, **svg accepted with `image/svg+xml`** (D12).
- Manual browser test in `bun run dev`: drop png, paste png, drop svg, slash-pick a file, undo — all five render.
- A3 benchmark: filter startup time on a synthetic 10k-`.md` content tree captured (<500ms target). Result logged in §15 Future Work / Identified entry.
- Existing e2e paths (no image) don't regress.

**Instrumentation:** PR #41's existing `[upload]` logs suffice for v1.

**Risks/mitigations:** See §14.

### Deployment / rollout

| Concern | Approach | Verify |
|---|---|---|
| Users on local dev who pulled PR #41 have `uploads/` dirs full of images | Not a concern — sibling filter still allowlists `.png` files in any dir with `.md`. The old `uploads/` dir will only serve if a `.md` lives next to it. | `ls content/uploads/` + `ls content/**/*.md` — if no sibling `.md`, expected behavior is 404. Document this in PR description. |
| Existing gitignore rules that excluded non-md | Preserved — exclude wins over allowlist. | Add a filter test with gitignored `.png`. |
| Worktree isolation / test content dirs | Filter constructs fresh per test; no shared state. | Existing test harness pattern. |

## 14) Risks & mitigations
| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Filter rebuild on large repos blocks startup | Low | Med | Assumption A3: benchmark on 10k-file repo; if >500ms, add async incremental build. | Andrew |
| Raw `.md` sources now HTTP-reachable (filtered-sirv) | Med (new behavior) | Low | Content is inherently browseable via `/api/document`; direct `.md` GET returns the same bytes. Document in PR body; users who don't want this can add `exclude: ['**/*.md']` — but then the editor breaks, so they won't. | Andrew |
| `parentDocName` spoofing — client lies about which doc they're editing | Med | Low | Upload path still goes through `safeContentPath`, so worst case is uploading a sibling into *any* doc's folder. No elevation. Document; add editor-side guard that `parentDocName` is set. | Andrew |
| Docs site doesn't resolve co-located images | High (known gap, deferred) | Med | D10: follow-up task. Spec explicitly scopes to editor. | Docs-site owner |
| Filter dir-set stale between `.md` create and watcher tick | Low | Low | Filter refreshes on watcher event; window is platform-dependent (M3-audit) — typically <200ms (Linux inotify <10ms; macOS FSEvents up to ~100ms). If user's workflow creates .md + drops image in same tick, image 404s briefly. Self-heals. | — |
| Raw `.md` source HTTP-reachable via filtered-sirv | Med (new) | Med | Audit M2 + Challenge H1: existing rationale ("`/api/document` already exposes content") is incomplete — `/api/document` requires docName param while filtered-sirv exposes a fetchable URL space. Mitigation candidate: **narrow filtered-sirv to `ASSET_EXTENSIONS` only** (Q23 pending user decision). If adopted, this risk collapses to zero. | Andrew |
| `parentDocName` spoofing | Med | Low | D15 explicitly normalizes (rejects abs/`..`), `isWithinContentDir` enforced on resolved destination + realpath of dest dir. Worst case bounded to "asset written to allowed sibling dir of attacker's choice." | Andrew |
| Users save `screenshot.png` via File → Save As into `docs/` → filter never sees it | Low | Low | File watcher sees non-md creates and applies filter; if extension is allowlisted and dir has .md, it's included. | — |

## 15) Future Work

### Explored
- **Configurable upload location** (Obsidian-style 4 modes: vault-root / specified-folder / same-as-note / subfolder-of-current). Storage model is already compatible — adding this is a config additive change, not a migration.
- **Build-time reference walker** for orphan detection + broken-link reports. Orthogonal to inclusion; pure reporting/linting.

### Identified
- **Move-image UI + cross-file reference rewrite** (NG1 + NG3). D7's hybrid insertion rule needs a counterpart on the move side: when an asset is relocated, all references must be recomputed to maintain the shortest-form invariant. Always implied by NG3 — anchored explicitly here.
- **MCP asset-write tool** (NG6) for agent-generated images. **Trigger to revisit:** agent workflows demonstrate measurable need to author images (diagrams, charts) without human intervention.
- **Auth-gated asset serving (resolves Q23 in v2).** When the system gains an auth layer, gate `/api/*` and the filtered-sirv asset path consistently. Decide then whether to keep the wide-filter mount or narrow to `ASSET_EXTENSIONS`-only.
- **Filter startup-time benchmark (A3).** To be done as part of this spec's launch verification.

### Noted
- Orphaned-asset GC (NG2).
- Paste-from-URL (vs file) — browser auto-resolves but we don't control the source.
- Non-image assets (pdf, mp4, audio). Allowlist can extend later; storage model unchanged.

## 16) Agent constraints

- **SCOPE:**
  - `packages/server/src/api-extension.ts` (rework `handleUploadImage`; no new endpoints)
  - `packages/server/src/content-filter.ts` (D11 algorithm + lifecycle hook)
  - `packages/server/src/file-watcher.ts` (wire `.md` lifecycle event to filter)
  - `packages/server/src/standalone.ts` (remove `uploadsDir`)
  - `packages/app/src/server/hocuspocus-plugin.ts` (remove scoped sirv mount; add filter-wrapped sirv over contentDir; remove `uploadsDir`)
  - `packages/cli/src/commands/start.ts` (remove scoped sirv mount; add filter-wrapped sirv; remove `uploadsDir`)
  - `packages/cli/src/config/schema.ts` (remove `uploadsDir`)
  - `packages/app/src/editor/image-upload/index.ts` (send `parentDocName`; consume bare-filename `src`)
  - `packages/core/src/constants/upload.ts` (add `ASSET_EXTENSIONS`)
  - `.open-knowledge/config.yml` (remove uploadsDir comment lines)
  - Tests: `packages/server/src/content-filter.test.ts` (extend with allowlist branch cases)

- **EXCLUDE:**
  - `packages/app/src/editor/extensions/shared.ts` FileHandler wiring (keep as-is)
  - `packages/app/src/editor/slash-command/items.ts` `/image` command (keep as-is)
  - `packages/app/src/globals.css` image selection outline (keep as-is)
  - Skeleton-widget plugin in `packages/app/src/editor/image-upload/index.ts` (keep as-is)
  - Sonner toast logic (keep as-is)
  - `busboy`, `file-type`, `sonner`, `@tiptap/extension-file-handler` dependencies (keep as-is)
  - `docs/` package entirely (D10 deferred)
  - New-file UX, copy/delete/duplicate file ops (separate spec)
  - MCP tools (D13)
  - Shadow-repo / attribution journal (Miles's PR #39)
  - Agent file edits (Tim's PR #103)

- **STOP_IF:**
  - Filter-rebuild benchmark (A3) exceeds 500ms on realistic repo → stop and design async rebuild.
  - `safeContentPath` cannot be reused in upload context (unexpected API surface) → stop and align with persistence-layer maintainer.
  - PR #41 rebase surfaces conflicts in `shared-extensions` or `sharedExtensions` drift → stop (CLAUDE.md warns: drift causes silent data corruption).
  - Fumadocs/Next.js image resolution is found to require filtered-sirv route changes → escalate to D10 follow-up owner before shipping.

- **ASK_FIRST:**
  - Adding any new runtime dependency beyond what PR #41 already brought in.
  - Extending `ASSET_EXTENSIONS` beyond `[png, jpg, jpeg, gif, webp, svg]`. (Adding non-image types — pdf, mp4 — is out of scope until storage size + serving cost is reviewed.)
  - Changing the upload HTTP contract (`parentDocName`, response shape).
  - Touching `ContentFilter` API surface (existing tests depend on it).
  - Embedding inline `<svg>` in editor render path (D12 explicitly forbids — `<img src=svg>` only).
