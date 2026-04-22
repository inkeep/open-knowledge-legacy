---
type: evidence
sources:
  - SPEC.md §5 User journeys (P1-P5)
  - SPEC.md §6 Requirements (FR-1 through FR-9, NFR-1 through NFR-5)
  - SPEC.md §7 Success metrics (M1-M6)
  - SPEC.md §10 Decisions (D-A through D-L)
baseline: 2ad0177a
generated: 2026-04-21
consumed-by: implementation-time test authoring (/ship handoff)
---

# E2E acceptance scenarios — cross-FR product-experience criteria

## Purpose

The FR-by-FR acceptance criteria in SPEC.md §6 define what each requirement does in isolation. This file defines what the **product experience** looks like when all FRs ship together — the scenarios a human product owner would sign off on as "shipped."

Each scenario below is:
- **Real** across the stack — real browser, real dev server, real filesystem, real CRDT, real DataTransfer events, real HTTP uploads. No mocks at the boundary.
- **Perturbation-checked** — each scenario names what a silent implementation regression would look like, so the test author can verify the test catches the bug class it's meant to catch.
- **Edge-sibling enumerated** — variations beyond the happy path. Not every sibling needs its own E2E slot (most are narrow integration); they're listed so the author knows the edge space.

Test-tier discipline: this file enumerates **acceptance-level** scenarios. Lower-tier tests (unit, narrow integration, fidelity PBT) that catch bug classes E2E doesn't need to catch are in the "Push-down" list below. Never run these scenarios at a tier where a cheaper one would give the same signal.

---

## Path P1 — Dogfooder drops anything (G1, M1)

Story killed: *"I drag a PDF in and get 'Unsupported file type' — the editor is dead to me for non-image assets."* — AND, after 2026-04-21 D-M flip: *"I drag my CSV in and it rejects me with a toast telling me to paste-into-a-code-fence; I just wanted a link to the file."* Post-D-M: any file drop accepts. Non-sniffable / unrecognized types become opaque markdown links (ecosystem norm: matches Obsidian, Logseq, Notion, Bear, iA, Roam, Craft). Post-2026-04-22 streaming amendment: no user-facing byte cap either — disk fullness (`storage-full` → 507) is the only rejection axis and it's a server-side surface, not a product experience to author. See SPEC §Post-finalization amendment.

### P1.1 Drop a PDF from Finder into an open note ★

**Setup.** Real Chromium. Dev server running with default config (no `.obsidian/`, no custom `upload.*`). Content dir has `docs/meeting-notes.md` open in WYSIWYG. Temp directory contains a real 2MB PDF with actual PDF magic bytes.

**Action.** Simulate a real drag event sequence (`dragenter → dragover → drop`) with a `DataTransfer` containing the file bytes, targeting the TipTap editor surface.

**Invariants.**
1. Widget-decoration placeholder appears at the drop caret position within 100ms of `drop` event dispatch.
2. `POST /api/upload` returns `{ ok: true, src: "draft.pdf", deduped: false }` within NFR-1 bound.
3. Disk has `docs/draft.pdf` — real file (not symlink), 2MB, `file-type` identifies it as `application/pdf` on re-sniff.
4. Editor's `Y.Text('source')` contains literal `![[draft.pdf]]` at the drop position.
5. WYSIWYG shows a plain-link fallback with visible text "draft.pdf" that is clickable *(P0; Phase 2 promotion to PDFViewer flips this assertion per D-F — see "Phase 2 coordination" below)*.
6. Source-view toggle shows `![[draft.pdf]]` token verbatim.
7. Server restart + re-open: doc renders same embed (round-trip persistence).
8. No console errors, no unhandled rejections.

**Perturbation check.** If allowlist silently regresses to image-only, invariant 2 fails with 400. If emit-dispatch forgets PDF, invariant 4 produces `[draft.pdf](draft.pdf)` instead of `![[draft.pdf]]`. If `file-type` sniff breaks, invariant 2 fails with "Unsupported file type."

**Edge-case siblings.**
- P1.1a Drop MP4 (video) — same invariants, different extension.
- P1.1b Drop MP3 (audio) — same.
- P1.1c Drop WebM — same (less common, sniffable).
- P1.1d Drop ZIP — invariant 4 becomes `[archive.zip](archive.zip)` (opaque → markdown-link per emit matrix).
- P1.1e Drop font file (`.woff2`) — opaque emit, no rejection.
- P1.1f Drop 2MB SVG — renders via `<img>` tag, NOT inline `<svg>` DOM (NFR-3 security, no inline-script execution).

---

### P1.2 Drop a text file — accepted as opaque markdown link ★

**Setup.** Real browser. Temp file is a real `.csv` with plausible CSV bytes.

**Action.** Drag-drop the CSV into a WYSIWYG editor.

**Invariants.**
1. `POST /api/upload` succeeds with 200 and returns `{ ok: true, src: "<basename>.csv", deduped: false }`.
2. File `docs/<basename>.csv` exists on disk after response — real file, matches dropped bytes.
3. Editor's `Y.Text('source')` contains literal `[<basename>.csv](<basename>.csv)` at the drop position (opaque markdown-link emit per FR-1a; `.csv` is not in `wikiEmbedExtensions` default).
4. WYSIWYG shows a clickable link with the filename as label.
5. Clicking the link triggers browser download (content-type not inline-renderable).
6. No rejection toast.

**Perturbation check.** If D-M accept-all is silently reverted (e.g. the `ALLOWED_MIME_TYPES.has(detectedMime)` gate is re-added), invariant 1 fails with 400 "Unsupported file type." If the emit-dispatch regresses and emits `![[...]]` for text, invariant 3 catches the wiki-embed leak into the opaque path.

**Edge-case siblings.**
- P1.2a Drop `.txt` — same opaque markdown-link treatment.
- P1.2b Drop `.json` — same.
- P1.2c Drop `.md` — same; does NOT interpret as a nested document (user who wants document-content can paste contents manually, per D-M user-learns-mental-model tradeoff).
- P1.2d Drop `.xyz` unknown extension, bytes don't sniff to any known type — accepted; opaque markdown-link.
- P1.2e Drop a file whose bytes sniff as PDF but extension is `.txt` — accepts; emit uses extension `.txt` → opaque markdown-link (extension is authoritative for emit-shape dispatch, regardless of sniff).

---

### ~~P1.3 Drop exceeds `maxBytes`~~ — DELETED 2026-04-22

Scenario deleted under the post-finalization streaming-upload amendment. `upload.maxBytes` no longer exists; there is no user-facing byte cap and therefore no rejection toast to author. The streaming pipeline bounds memory to O(1) regardless of file size (`HashingPassThrough` + `stream.pipeline`), so the OOM-guard rationale the cap represented is gone. Disk fullness surfaces as `{ error: 'storage-full' }` → HTTP 507 with a server-side message — that's a transport failure, not a product-experience scenario.

See SPEC §Post-finalization amendment and `reports/streaming-upload-refactor/REPORT.md` §D8 for the full rationale. Server-side tests for `storage-full` / `malformed-upload` / `collision-exhaustion` live in `packages/server/src/api-extension.test.ts` (integration tier) and `packages/server/src/upload-streaming.test.ts` (unit tier).

---

## Path P2 — Obsidian refugee (G2, M2)

Story killed: *"I opened my Obsidian vault in OK and every embed broke. Refunded my time."*

### P2.1 Open a canonical Obsidian vault — refs render on first load ★

**Setup.** Real filesystem. Temp directory mimics an actual Obsidian vault:
```
vault/
  .obsidian/app.json             # {"attachmentFolderPath": "attachments", "useMarkdownLinks": false, "newLinkFormat": "shortest"}
  attachments/photo.png          # real 50KB PNG
  attachments/diagram.png        # real 30KB PNG
  docs/meeting.md                # contains ![[photo.png]] and [[Some Page]] on separate lines
  docs/2026/q2/retrospective.md  # contains ![[diagram.png]]
```
Start dev server against this directory.

**Action.** Open browser at dev URL, navigate to `/docs/meeting.md`.

**Invariants.**
1. Server log shows exactly one `.obsidian/app.json` read at startup (non-destructive — file mtime unchanged).
2. `.open-knowledge/config.yml` NOT created and NOT modified (FR-4 non-destructive).
3. `![[photo.png]]` renders as inline `<img>` with resolved `src` pointing at `/attachments/photo.png` (or equivalent served path).
4. Image loads (network request 200, bytes match original).
5. `[[Some Page]]` on adjacent line renders as wiki-link text, NOT an embed (distinguishes FR-3 embed tokenizer from existing `[[Page]]` path).
6. Navigate to `/docs/2026/q2/retrospective.md`: `![[diagram.png]]` resolves via shortest-path from deep dir — image renders inline.
7. Source view on either doc: `![[photo.png]]` / `![[diagram.png]]` verbatim.
8. File on disk after load (user did nothing but load) is byte-identical to before. No save side-effect from opening.

**Perturbation check.** If `wiki-link-micromark.ts` accidentally parses `[[Some Page]]` as embed, invariant 5 catches it. If FR-4 is silently destructive, invariant 2 catches it. Ambiguous-resolution bug gets its own scenario below.

**Edge-case siblings.**
- **P2.1a Ambiguous basename resolution ★.** Vault has `attachments/photo.png` AND `docs/photo.png`. Opening `docs/meeting.md` with `![[photo.png]]` → tiebreak prefers `docs/photo.png` (sourcePath's own dirname subtree). Opening a third doc in `archive/` → falls to shortest-path then alphabetical (deterministic across rebuilds).
- P2.1b `.obsidian/app.json` missing — server uses defaults, no error.
- P2.1c `.obsidian/app.json` malformed (truncated JSON) — server logs warning, uses defaults, vault still opens, no unhandled exception crashes server.
- P2.1d `.obsidian/app.json` extra unknown fields — parser tolerates.
- P2.1e `useMarkdownLinks: true` — emit-on-drop uses `![alt](path)`, not `![[...]]` (exercised in P2.2).
- P2.1f `.obsidian/app.json` symlink pointing OUTSIDE content dir — parser refuses via `realpathSync` escape guard (R8), uses defaults.

### P2.2 Refugee drops a new screenshot into vault — emits in vault's configured shape

**Setup.** Same vault as P2.1, but `.obsidian/app.json` has `useMarkdownLinks: true`.

**Action.** Drop a real PNG into `docs/meeting.md`.

**Invariants.**
1. Upload succeeds, file lands in `attachments/` (vault-configured), not colocated.
2. Inserted Y.Text is `![alt](attachments/foo.png)` relative form, NOT `![[foo.png]]`.
3. Opening the file back in Obsidian shows inline image with the same path (refugee-shape parity).
4. **(Bonus: GitHub-rendering escape hatch per R9.)** This same shape renders inline on github.com for users who browse the repo there. P2.2 doubles as the GitHub-compat validator.

**Perturbation check.** If config migration skips `useMarkdownLinks`, invariant 2 catches the emit mismatch.

---

## Path P3 — Same-screenshot-twice (G3, M3)

### P3.1 Dedup within same doc, same dir ★

**Setup.** Real browser, dev server. Content dir fresh.

**Action.** Take a fixed 300KB PNG (deterministic bytes). Drop into `docs/notes.md` — first upload writes `docs/notes-asset-<timestamp>.png`. Drop the exact same bytes a second time into the same doc.

**Invariants.**
1. Second upload's `POST /api/upload` returns `{ ok: true, src: "notes-asset-<timestamp>.png", deduped: true }` — same filename as first drop.
2. Non-blocking toast on client matches D-B template exactly: *"Already at `docs/notes-asset-<timestamp>.png` — reusing."*
3. Inserted markdown is `![[notes-asset-<timestamp>.png]]` pointing at the original file.
4. Disk has **only one** file at `docs/notes-asset-<timestamp>.png`. No `-1.png`.
5. Sha256 of file on disk matches sha256 of DataTransfer bytes.
6. NFR-1: second upload completes <200ms (dedup check is not O(n) over whole vault).

**Perturbation check.** If dedup silently fails and writes a second file, invariant 4 catches it. If dedup succeeds but toast is suppressed, invariant 2 catches it (D-B honest-UX principle).

**Edge-case siblings.**
- **P3.1a No dedup across dirs ★.** Same bytes into `docs/notes.md` then into `archive/old.md`. Both files exist — same-dir scope is intentional (D-D, FR-2). Disk has two files with same hash, different paths.
- P3.1b Dedup with different original filenames but same bytes — server detects hash match, reuses first path.
- P3.1c Dedup disabled via config (`upload.dedup: 'off'`) — second drop writes `-1.png`, no toast.
- P3.1d `upload.dedup.ui: 'silent'` — dedup happens, no toast, but disk still has one file (operator escape hatch).

---

## Path P4 — Operator tuning (G4, M5)

### P4.1 Operator tunes `attachmentFolderPath` / `emitFormat` — config-driven, no rebuild

_[Amended 2026-04-22: previous P4.1 centered on `upload.maxBytes`. Post-streaming-refactor there is no byte cap to tune, so the scenario now covers the remaining operator knobs that still round-trip via FR-5. See SPEC §Post-finalization amendment.]_

**Setup.** User-operator (OK is local-first; operator = user) edits `.open-knowledge/config.yml` (server off):
```yaml
upload:
  attachmentFolderPath: attachments   # Obsidian-style global folder
  emitFormat: markdown-image          # prefer ![alt](path) over ![[...]]
```
Start server. Open browser.

**Action.**
1. Drop a 2MB PNG into `docs/meeting-notes.md`.
2. Drop the same PNG into `docs/2026/q2/retrospective.md`.

**Invariants.**
1. Step 1: POST returns 200. File at `attachments/<basename>.png` (NOT `docs/<basename>.png` — `attachmentFolderPath: attachments` overrides co-location). Inserted markdown `![<alt>](../attachments/<basename>.png)` (relative to doc dir, `markdown-image` shape per `emitFormat`).
2. Step 2: POST returns 200 with `deduped: true` — same bytes as Step 1 dedup even though the doc dir differs, because the dedup scope is the destination folder (`attachments/`), not the doc dir. Inserted markdown `![<alt>](../../../attachments/<basename>.png)` — relative path recomputed from the deeper doc location to the same shared asset.
3. No rebuild of server binary needed — just config edit + restart.

**Perturbation check.** If `attachmentFolderPath` config isn't wired, invariant 1 fails (file lands at `docs/<basename>.png`). If `emitFormat` config isn't wired, invariants 1/2 fail (markdown is `![[...]]` shape instead of `![alt](...)`). If relative-path computation regresses, invariant 2 produces `../attachments/<basename>.png` from the deep doc (wrong ancestor count).

**Edge-case siblings.**
- P4.1a Invalid `upload.*` config shape (e.g., `emitFormat: "html-image"`) — server startup logs Zod validation error, refuses to start with clear message. Config file unmodified.
- P4.1b `upload.emitFormat: 'markdown-image'` on non-image extension (PDF) → emits `[name](path)` markdown-link (not markdown-image — markdown has no `![alt](foo.pdf)` shape for non-images).
- P4.1c `upload.dedup.mode: 'off'` — same-bytes drop writes a second file with collision suffix.
- P4.1d `upload.wikiEmbedExtensions: []` — every drop emits opaque markdown-link regardless of extension.

**Note on scope change.** Session 2 cycle-1 draft of P4.1 tested `allowedMimeTypes` narrow + MP4 rejection against custom allowlist. Session 2 cycle-2 removed `allowedMimeTypes` from FR-5 per D-M accept-all. Post-2026-04-22 streaming amendment removed `maxBytes` from FR-5 and from P4.1; the scenario now exercises the remaining live knobs.

---

## Path P5 — Rename stability (G5, M4)

### P5.1 Rename doc with plain markdown image ref — path rewrites ★

**Setup.**
```
docs/meeting-notes.md      # contains: ![first draft](first-draft.png)
docs/first-draft.png       # real PNG, 100KB
```

**Action.** Via FileSidebar UI (or MCP `rename_document`), rename `docs/meeting-notes.md` → `archive/2026/meeting-notes.md`.

**Invariants.**
1. File at new location exists, old path does NOT.
2. `archive/2026/meeting-notes.md` contains `![first draft](../../docs/first-draft.png)` — relative path recomputed.
3. Asset `docs/first-draft.png` stays put (D-K refs-only).
4. Open `archive/2026/meeting-notes.md` — image renders (recomputed path is correct, server serves it).
5. No rewrite to other files — only the renamed doc's body changed.
6. Git status shows: one rename + body change, one untouched asset.

**Perturbation check.** If `managed-rename-rewrite.ts` still has `line[idx - 1] !== '!'` exclusion (FR-7 not implemented), invariant 2 catches `![first draft](first-draft.png)` unchanged — would 404 on render.

**Edge-case siblings.**
- **P5.1a Case B — wiki-embed ref NO rewrite ★.** Same setup but `docs/meeting-notes.md` has `![[first-draft.png]]`. Rename. Invariant: new file body unchanged (still `![[first-draft.png]]`), AND image renders via basename-index dynamic resolution. The NO-REWRITE case is as important as the DO-REWRITE case.
- P5.1b Rename across 3+ dir levels (both directions).
- P5.1c Rename into asset's own dir — path becomes just `first-draft.png`.
- P5.1d Rename while another client has the doc open — remote tab's body reconciles to new relative path (managed-rename CRDT flow).
- P5.1e MIX of refs: `![[wiki-embed.png]]`, `![plain](md-image.png)`, `[doc-to-doc](./other.md)`. Only md-image + doc-to-doc rewrite; wiki-embed stays.
- P5.1f Assets referenced from MULTIPLE docs — confirm none get accidentally rewritten under FR-7's additive branch.

### P5.2 Wiki-embed immunity under concurrent rename burst ★

**Setup.** Vault with 5 assets in a shared dir. A doc with `![[a.png]]` through `![[e.png]]` refs. (Per Item 3 analysis: tests the D-E architectural-immunity claim, which D-E's LOCKED rationale leans on.)

**Action.** In a single Y.Doc transaction, trigger: (a) rename of the containing doc AND (b) 5 asset DiskEvents in rapid succession.

**Invariants.**
1. All 5 refs resolve correctly at every post-transaction intermediate state.
2. Polled on each observer fire (not time-based), ref-resolution outcome is always "hit" — never "not found."

**Perturbation check.** If basename index is rebuilt out of order (or if FR-6 wiring forgets asset DiskEvents), some refs transiently fail to resolve — observer-fire poll catches the gap.

### P5.3 Markdown-image eventual-consistency under concurrent rename + asset-move ★

**Setup.** Config has `upload.emitFormat: 'markdown-image'` (the F8-absorbed opt-out path — now reliable post-FR-1a algorithmic rewrite). Doc `docs/notes.md` contains `![alt](photo.png)`. Asset `docs/photo.png` exists (100KB real PNG).

**Action.** In a rapid fs-event burst (within one file-watcher debounce window): (a) rename the doc via `managed-rename-rewrite` from `docs/notes.md` → `archive/notes.md`; (b) create a second asset `docs/diagram.png` (real PNG, 50KB).

**Quiescence.** Wait for managed-rename transactions to settle AND CC1 asset signals to drain. Use **condition-based wait** (poll until queue empty + last-event timestamp older than 100ms debounce window), NOT a wall-clock `wait(N)` — explicitly non-flaky per /tdd's "never sleep" rule.

**Invariants.**
1. Post-quiescence: `archive/notes.md` body contains correctly recomputed relative path to `docs/photo.png` (i.e., `![alt](../docs/photo.png)` or equivalent depending on depth).
2. Image renders via fetch: network request returns 200, bytes match original `docs/photo.png`.
3. The new `docs/diagram.png` is indexed in the basename index and reachable via `resolveEmbed('diagram.png', '<any-sourcePath>')`.
4. No orphan asset at the old doc's co-located path (asset did NOT move per D-K refs-only).
5. No intermediate state where `archive/notes.md` contains BOTH the old path and the new path (write is atomic per managed-rename CRDT semantics).

**Perturbation check.** If FR-7's absolute-path-leave-unchanged branch is buggy, invariant 1 catches a path that got rewritten when it shouldn't have. If the basename-index rebuild loses the new `diagram.png` event (FR-6 misses asset DiskEvents), invariant 3 fails. If the path recompute has an off-by-one under burst conditions, invariant 2 fails (image 404s).

**Why this scenario matters.** P5.2 tests wiki-embed architectural immunity (happy path). The `emitFormat: 'markdown-image'` opt-out is the F8-absorbed path — users opt in for GitHub-compat per R9. Without P5.3, regressions in FR-7's path recompute under burst conditions would land silently and only surface when a user notices a broken image days later. Per M4 in Session 2 cycle-2 assessment: the eventual-consistency assertion is deterministic (quiescence is well-defined); the bounded-time assertion would be flaky. This scenario adds the former.

---

## Path P6 — Multi-user collaboration (G6 + implicit product shape)

### P6.1 User A's drop appears in User B's open editor ★

**Setup.** Two real Chromium contexts (separate instances or incognito — real WebSocket sessions). Both navigate to `docs/meeting.md`.

**Action.** User A drops a PDF. Wait for upload to settle.

**Invariants.**
1. Within 500ms of User A's upload response, User B's Y.Text contains `![[draft.pdf]]` at the same position (CRDT sync).
2. User B's WYSIWYG re-renders the plain-link fallback for the new embed without page reload.
3. User B can click the link and fetch `draft.pdf` — asset served to B just like to A (no per-user auth wall).
4. User B does NOT see User A's widget-decoration placeholder (ephemeral presence, not persistent state).

**Perturbation check.** If upload bypasses CRDT and writes directly to disk without informing Y.Text (buggy FR-3d), invariant 1 catches the missing insertion.

### P6.2 User A drops a new asset in doc1; User B viewing doc2 with `![[that-asset.png]]` sees index invalidate ★

**Setup.**
- `docs/active.md` — User A open, empty.
- `archive/old.md` — User B open, contains `![[photo.png]]` pointing at a file that doesn't exist yet (shows broken-image placeholder).

**Action.** User A drops `photo.png` into `active.md`. File lands at `docs/photo.png`.

**Invariants.**
1. File watcher fires; CC1 emits `ch:'files'`.
2. User B's client receives the signal via `__system__` Y.Doc within ~150ms (100ms debounce + network).
3. User B's basename index rebuilds; `![[photo.png]]` in `archive/old.md` resolves (shortest-path from `archive/` finds `docs/photo.png`).
4. Broken-image placeholder in User B's editor re-renders as real `<img>` loading `docs/photo.png` WITHOUT page reload.
5. User B's toast/UI shows the image naturally appearing.

**Perturbation check.** If FR-6 widening is incomplete (file-watcher doesn't emit asset DiskEvents), invariants 1/2/3 all fail — B sees broken image forever until reload. This is the end-to-end test for "CC1 primitive ready but consumer not wired."

**Edge-case siblings.**
- P6.2a Asset deleted on disk externally (`rm docs/photo.png`) — B's editor flips image to broken-placeholder via same CC1 pathway.
- P6.2b Asset renamed externally — shows as delete+create DiskEvents, basename index updates both ways.

---

## Path P7 — Regression guard (G6, M6)

### P7.1 Shipped image-drop path unchanged ★

**Setup.** Drop a PNG into a note with all defaults.

**Invariants.**
1. Experience matches pre-FR shape (placeholder, toast-free success, image renders inline).
2. File path on disk: colocated with doc (as before).
3. Emit is `![[foo.png]]` — CHANGED from pre-FR `![alt](foo.png)`, but intentionally per D-I. The NEW shape is the assertion.

**Perturbation check.** Direct consistency check — if FR-1a breaks, invariant catches.

**Edge-case siblings merged into other scenarios.**
- Existing `[[Page]]` wiki-link text stays text — covered in P2.1 invariant 5.
- Existing doc-to-doc `[title](./other.md)` rename still rewrites — covered in P5.1 siblings.

---

## Cross-cutting invariants (assertions embedded in the above, not standalone)

- **I-roundtrip.** After any scenario that writes to the editor, serialize Y.Text to disk, re-parse, compare to pre-save Y.Text → byte-identical (NFR-5 / I1, I4, I5, I7). Asserted implicitly by reload-after-write in P1.1, P2.1, etc.
- **I-perf-streaming.** Large-file drop completes with memory footprint bounded by streaming (not proportional to file size). Asserted at the unit/integration tier on the pipeline primitives — post-2026-04-22 streaming amendment supersedes the prior "sha256 <200ms on 25MB" invariant since hash is folded into the pipeline via `HashingPassThrough` rather than running as a separate pass. See `reports/streaming-upload-refactor/REPORT.md` §D9 for the O(1) memory proof.
- **I-perf-vault.** P2.1 with synthetic 1000-file vault completes initial render <2s (NFR-1).
- **I-security-svg.** SVG uploads render via `<img>` only, never inline DOM. Asserted in P1.1f.
- **I-observability.** Every scenario's upload event emits server log with `{ dedup, mime, size, destPath }` per NFR-4.

---

## "If I only had 10 E2E tests" — the budget (top 10)

In descending order of what-would-break-most-visibly-if-it-regressed:

1. **P1.1** Drop PDF — G1 tent-pole.
2. **P1.2** Drop CSV + **P1.2d** drop `.xyz` — text-ext/other boundary for D-L two-message rule.
3. **P2.1** Obsidian vault open + **P2.1a** ambiguous resolution — G2 tent-pole + shortest-path determinism.
4. **P3.1** Dedup same-dir (with **P3.1a** cross-dir negative) — G3 tent-pole.
5. **P4.1** Operator tunes `attachmentFolderPath` / `emitFormat` — G4 tent-pole (post-2026-04-22 amendment: maxBytes branch removed with the field).
6. **P5.1** Rename with plain markdown-image ref — G5 tent-pole, Case A.
7. **P5.1a** Rename with wiki-embed ref (NO rewrite) — distinguishes Case A.
8. **P5.2** Wiki-embed immunity under concurrent burst — D-E architectural-immunity regression guard.
9. **P6.1** Multi-user CRDT propagation of new embed — proves FR-3d writes through CRDT.
10. **P6.2** Multi-user basename-index invalidation via CC1 — proves FR-6 reused the primitive correctly.
11. ~~**P1.3** Oversized-file rejection~~ — DELETED 2026-04-22 under the streaming-upload amendment. `upload.maxBytes` no longer exists; server-side `storage-full` / `malformed-upload` / `collision-exhaustion` errors are covered in `packages/server/src/api-extension.test.ts` (integration) and `upload-streaming.test.ts` (unit) — not at E2E tier.
12. **P5.3** Markdown-image eventual-consistency under concurrent burst — guards the F8-absorbed opt-out path (`emitFormat: 'markdown-image'`) against silent FR-7 regressions. Promoted per M4.

Note: "top 10" is a soft cap; post-2026-04-22 streaming amendment this list holds 11 (P1.3 removed). P5.3 (covers a genuine regression surface) remains a top-list candidate for the same reason it was promoted in Session 2 cycle-2.

Everything else pushes to lower tiers below.

---

## Push-down list — NOT E2E candidates

These would be ceremony as E2E; they belong at cheaper tiers where each test runs in 50ms instead of 5s.

- **MIME allowlist precision** (every `file-type@22.0.1` supported extension behaves correctly): parameterized narrow integration against server handler, not browser.
- **`wikiLinkEmbed` tokenizer round-trip fidelity** (I1/I4/I5/I7 PBT): handler-specific PBT in `packages/app/tests/fidelity/` alongside existing ones.
- **Path-resolver tiebreak determinism**: unit PBT against `packages/core/src/utils/path-resolve.ts` with shrinking over vault shapes.
- **Obsidian app.json parsing variants** (all 4 `attachmentFolderPath` patterns + missing + malformed + extra fields + symlink-escape): unit test against `obsidian-vault-detect.ts`.
- **Filename sanitization (F9)**: unit test with unicode corpus + path-escape corpus.
- **`shortestImageRef` dirname matrix (F8)**: unit test with permutation fixtures.
- **`managed-rename-rewrite` regex coverage**: narrow integration with real markdown fixtures.
- **Zod config schema validation** (all `upload.*` fields + all error paths): unit test against `schema.ts`.
- **Streaming upload pipeline primitives** (`HashingPassThrough`, `linkTempToFinalWithCollisionRetry`, `cleanupOrphanUploadTempfiles`): unit tests in `packages/server/src/upload-streaming.test.ts`. Post-2026-04-22 streaming amendment replaced the prior sha256 perf micro-benchmark — hash throughput is no longer the bottleneck under streaming (disk I/O is).
- **CC1 signal fan-out semantics**: narrow integration at server level, no browser needed.

---

## Phase 2 coordination — permanent fallback markers (L4 B resolution)

Per L4-challenger in Session 2 cycle-2: **cross-spec coupling by "Phase 2 edits this file" convention was too fragile.** Replaced with permanent-fallback-marker pattern: P0 scenarios assert the plain-link fallback behavior explicitly as the `[P0-phase1-fallback]` path and persist as fallback-path regression guards indefinitely. Phase 2 **additively writes new scenarios to its own spec** for typed-component rendering — it does NOT edit THIS file.

**Scenarios that assert the `[P0-phase1-fallback]` behavior:**

- P1.1 invariant 5: *"WYSIWYG shows a plain-link fallback with visible text 'draft.pdf' that is clickable"* — stable forever. When Phase 2 ships PDFViewer, this invariant still holds: the plain-link fallback remains the P0 emit shape, guarded as a regression test against "Phase 2 broke the fallback path."
- P1.1a (MP4), P1.1b (MP3), P1.1c (WebM), P1.1d (ZIP), P1.1e (fonts) — all assert opaque link / plain-link rendering as the stable P0 behavior.
- P6.1 invariant 2: *"User B's WYSIWYG re-renders the plain-link fallback for the new embed"* — stable.

**Storage shape (`![[file.ext]]`) does NOT change at Phase 2** — that's the point of D-F. Zero content migration.

**Phase 2's scope of NEW scenarios** (authored in `specs/2026-04-08-typed-component-nodes/` when that spec drafts):

- "Drop PDF in Phase-2-enabled editor → PDFViewer component renders with native controls"
- "Drop MP4 → Video component renders with playback controls"
- "Drop MP3 → Audio component renders with playback controls"
- etc.

These are ADDITIVE. No edits to this file needed; the P0 fallback assertions stay as they are. Regression safety: if Phase 2 introduces a bug that silently degrades back to plain-link (e.g., feature flag misconfigured in production), the P0 assertions still pass — but Phase 2's own scenarios fail, localizing the bug. Under-coverage impossible: both fallback AND typed-component behaviors are independently asserted.

---

## Resolved-in-session notes

Captures the evolution of this file across two resolution cycles on 2026-04-21. The file now reflects all Session 2 cycle-2 user decisions.

**Session 2 cycle-1 (AM 2026-04-21 — /tdd + /gtm:analyze):**

- **Dedup toast template** — pinned as `"Already at <path> — reusing."` per D-B. Asserted in P3.1 invariant 2.
- **D-E rename race testability** — P5.2 (wiki-embed immunity) added as deterministic test.
- **R9 GitHub export** — P2.2 doubles as escape-hatch validator via `useMarkdownLinks: true` / `emitFormat: 'markdown-image'`.

**Session 2 cycle-2 (PM 2026-04-21 — post-audit, user escalation resolutions):**

- **D-L two-message rule → REMOVED, D-A → REFUTED by D-M.** User observed this is overengineering; no major editor does type-based rejection UX (Obsidian / Logseq / Notion / Bear / iA / Roam / Craft all accept-all). Refutation also dissolves M1 admin-narrowed case (OK is local-first; no admin distinct from user). P1.2 + P1.2d scenarios rewritten as accept-with-opaque-emit rather than rejection.
- **M2 E2E top-10 budget** → soft cap. P1.3 promoted alongside P5.3 (now 12 scenarios; cheap at E2E tier, covers distinct bug classes). **Post-2026-04-22 amendment:** P1.3 deleted under streaming-upload refactor (scenario targeted `upload.maxBytes`; field no longer exists). Top-list holds 11.
- **M3 `warnBytes`** → DELETED from FR-5. No behavior contract, no journey, no dogfood signal. Future Work Explored entry added in SPEC §15.
- **M4 P5.3 eventual-consistency** → ADDED as sibling of P5.2. Guards F8-absorbed `emitFormat: 'markdown-image'` opt-out from silent FR-7 regression under concurrent fs-event burst.
- **L4 Phase 2 coordination** → flipped to permanent-fallback-marker pattern. P0 assertions stay as regression guards; Phase 2 adds its own scenarios in `specs/2026-04-08-typed-component-nodes/` additively.
- **Cross-cutting greenfield principle** → no action per user; CLAUDE.md §118 already names the "greenfield directive (2026-04-13)" as governance.
