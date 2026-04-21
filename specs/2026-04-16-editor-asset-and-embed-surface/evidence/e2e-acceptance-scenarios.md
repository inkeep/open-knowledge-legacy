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

## Path P1 — Dogfooder drops binaries (G1, M1)

Story killed: *"I drag a PDF in and get 'Unsupported file type' — the editor is dead to me for non-image assets."*

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

### P1.2 Drop a text file — actionable rejection (message A) ★

**Setup.** Real browser. Temp file is a real `.csv` with plausible CSV bytes.

**Action.** Drag-drop the CSV into a WYSIWYG editor.

**Invariants.**
1. No POST to `/api/upload` occurs (FileHandler rejects at client boundary) — OR if it reaches the server, server returns 400 with D-A strict reject.
2. A toast appears containing the **exact** D-L message A: *"Text files (CSV, TXT, JSON, MD) aren't supported as binary drops. To include contents, paste into a code fence. To link to a text file in the repo, reference it with a regular markdown link."*
3. No placeholder left in the doc — editor state byte-identical to pre-drop.
4. No file written under content dir.

**Perturbation check.** If message A text changes to anything else (losing the actionable "paste into a code fence" guidance), invariant 2 catches it verbatim.

**Edge-case siblings.**
- P1.2a Drop `.txt` — message A fires.
- P1.2b Drop `.json` — message A fires.
- P1.2c Drop `.md` — message A fires.
- P1.2d **Drop `.xyz` unknown extension with no magic-byte signature — message B fires per D-L two-message rule.** Message B exact: *"This file type isn't supported. Try a different file, or reference it with a markdown link: [label](path/to/file)."*
- P1.2e Drop a file whose bytes sniff as PDF but whose extension is `.txt` — accepts (magic-byte wins per D-A); emit uses extension `.txt` → opaque markdown-link.

---

### P1.3 Drop exceeds `maxBytes` — rejection with byte-size reason

**Setup.** Default config (25MB `maxBytes`). Temp file is a 30MB video with real MP4 magic bytes.

**Action.** Drop into editor.

**Invariants.**
1. `POST /api/upload` returns 413 (or 400) identifying the violation (`"maxBytes"` category).
2. Toast includes both the attempted file size AND the configured limit — not a generic "too large."
3. No file written.
4. No placeholder lingers.

**Perturbation check.** If size check fires after bytes are written to disk (insecure path), invariant 3 catches the orphan file.

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

### P4.1 Operator widens allowlist and size cap

**Setup.** Operator edits `.open-knowledge/config.yml` (server off):
```yaml
upload:
  maxBytes: 104857600     # 100MB
  allowedMimeTypes:
    - image/png
    - image/jpeg
    - application/zip
    - font/woff2
```
Start server. Open browser.

**Action.**
1. Drop 60MB MP4 — should REJECT (MP4 not in custom allowlist).
2. Drop 80MB ZIP — should ACCEPT (under 100MB, in allowlist).

**Invariants.**
1. Step 1: POST returns 400. Toast fires D-L message B (operator narrowed — no text-ext). No file written.
2. Step 2: POST returns 200 within NFR-1. File `docs/notes-archive.zip` on disk. Inserted markdown `[notes-archive.zip](notes-archive.zip)` per emit-matrix opaque-always-markdown-link.
3. No rebuild of server binary needed — just config edit + restart.

**Perturbation check.** If `upload.*` config isn't wired, invariant 1 fails (MP4 accepted under old hardcoded allowlist).

**Edge-case siblings.**
- P4.1a Invalid `allowedMimeTypes` — server startup logs Zod validation error, refuses to start with clear message. Config file unmodified.
- P4.1b `upload.emitFormat: 'markdown-image'` override — drop PNG, emits `![foo](foo.png)` not `![[foo.png]]`.

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
- **I-perf-sha256.** Drop of 25MB file end-to-end <800ms (NFR-1: sha256 <200ms + network + write). Asserted inline in P1.1 / P3.1.
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
5. **P4.1** Operator config without rebuild — G4 tent-pole.
6. **P5.1** Rename with plain markdown-image ref — G5 tent-pole, Case A.
7. **P5.1a** Rename with wiki-embed ref (NO rewrite) — distinguishes Case A.
8. **P5.2** Wiki-embed immunity under concurrent burst — D-E architectural-immunity regression guard.
9. **P6.1** Multi-user CRDT propagation of new embed — proves FR-3d writes through CRDT.
10. **P6.2** Multi-user basename-index invalidation via CC1 — proves FR-6 reused the primitive correctly.

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
- **Sha256 perf <200ms on 25MB**: standalone perf micro-benchmark, NOT inside an E2E. Guards NFR-1 without browser variance.
- **CC1 signal fan-out semantics**: narrow integration at server level, no browser needed.

---

## Phase 2 coordination

Several P0 invariants will flip when `specs/2026-04-08-typed-component-nodes/` Phase 2 ships (D-F read-time promotion, D-C extension-dispatch). Marked with *(Phase 2)* in the scenarios above:

- P1.1 invariant 5 "plain-link fallback" → "PDFViewer component visible"
- P1.1a / P1.1b / P1.1c (video/audio variants) — same flip to Video / Audio components
- P6.1 invariant 2 — same flip

**Storage shape (`![[file.ext]]`) does NOT change at Phase 2** — that's the point of D-F. Zero content migration.

**Coordination protocol.** When Phase 2 lands, update THESE assertions in THIS file (and corresponding test code) to assert the typed-component render instead of plain-link fallback. Do not rewrite scenarios; do not make current assertions Phase-2-agnostic. The typed-component-nodes spec's In-Scope list should include "update E2E assertions in `specs/2026-04-16-editor-asset-and-embed-surface/evidence/e2e-acceptance-scenarios.md` at [marked lines]."

---

## Resolved-in-session notes

These were flagged as "unsettled" during the /tdd + /gtm:analyze pass (2026-04-21) and resolved before this file landed:

- **Dedup toast template** — pinned as `"Already at <path> — reusing."` per D-B. Asserted in P3.1 invariant 2.
- **FR-1 rejection copy coverage** — resolved via D-L two-message rule. Message A for text-ext, Message B for all other non-sniffable. Asserted in P1.2 + P1.2d.
- **D-E rename race testability** — write P5.2 (wiki-embed immunity, deterministic). Skip markdown-image bound (inherently flaky under real fs-events; D-E accepts temporary incoherence).
- **R9 GitHub export** — no new scenario; P2.2 doubles as escape-hatch validator (via `useMarkdownLinks: true` / `emitFormat: 'markdown-image'` producing GitHub-renderable shape).
- **Phase 2 promotion coordination** — protocol documented above; coordination lives in typed-component-nodes spec's In-Scope when it's drafted.
