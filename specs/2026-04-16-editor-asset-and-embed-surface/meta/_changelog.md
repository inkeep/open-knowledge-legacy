# Changelog

Append-only process history for this spec.

---

## 2026-04-16 — Session 1: Intake + scaffold + INV dispatches

### Context

- This spec was initiated from an /assess-findings triage of the prior editor-input-surface spec (`specs/2026-04-08-editor-input-surface/SPEC.md`, 30 decisions, never merged). Triage artifact: `reports/editor-input-surface-worldmodel/REPORT.md`.
- 7 items classified ACTION-NOW by /assess-findings became the scope of this spec (FR-1 through FR-7).
- 4 items classified refute-spec / superseded are explicitly NOT in scope.
- 3 items are separate work (2 micro-PRs + 1 security hardening spec).
- New worktree created fresh off origin/main at `432a834b` for this spec.

### Artifacts created

- `SPEC.md` — full draft with Problem/Goals/Non-goals/Personas/Journeys/Requirements/Success-metrics/Current-state/Relationship-to-prior-spec/Decisions/Open-questions/Assumptions/In-scope/Risks/Future-work/Agent-constraints
- `meta/_changelog.md` — this file
- `reports/editor-input-surface-worldmodel/REPORT.md` — copied from main-repo reports/; worldmodel + /assess-findings triage artifact

### Decisions made (pre-intake, from prior /assess-findings work)

- **D1 (Scope):** 7-item scope (FR-1 through FR-7). User-confirmed via triage prompt.
- **D2 (Asset location default):** `co-located` default, config-exposed. Refutes old spec D2's 1-way-door framing. Evidence: zero assets in `packages/content/` verified via `find` command.
- **D3 (Transport):** multipart+busboy stays. Refutes old spec D10.
- **D4 (Paste tree):** superseded by clipboard-mdast-canonical spec.

### Investigations dispatched

- INV1: `.obsidian/app.json` field schema — subagent
- INV2: Foam's `getShortestIdentifier()` algorithm — subagent
- INV3: `file-type@8.x` MIME detection coverage — subagent
- INV4: Outline's non-image drop pattern — subagent
- INV5: clipboard-mdast-canonical boundary — inline read of SPEC.md NG4 + flow diagrams

### Open items (see SPEC.md §10, §11)

- D-A: non-sniffable MIME handling (strict vs extension-fallback)
- D-B: dedup toast UX
- D-C: embed rendering shape (image node vs pill)
- D-D: file-basename index persistence
- D-E: rename race when doc + asset move simultaneously
- D-F: typed-component-nodes Phase 2 upgrade path
- D-G: endpoint rename `/api/upload-image` → `/api/upload`
- INV1-INV6

### Next session

- Consume INV1-5 findings
- Present first decision batch for D-A through D-G to user

---

## 2026-04-17 — Session 2: 8 HIGH-confidence decisions LOCKED + D-I pivot to wiki-embed storage

### Context

User pivoted D-I during iteration: after surfacing the question "what typed node basically uses our mdx support," the recommendation shifted from original markdown-link emit to wiki-embed `![[file.ext]]` storage with render-time extension dispatch. Cross-editor research report landed (`reports/editor-asset-embed-patterns-across-universe/REPORT.md`) covering 16 editors × 8 dimensions, plus Path C update (cloned Docmost, SilverBullet, Zettlr) which closed ~17 UNCERTAIN dimensions.

**Major surprise from Path C:** SilverBullet natively parses `![[file.ext]]` (`parser.ts:26-86`). Initial worldmodel had inferred NO; confirmed YES. Shifted wiki-embed count from 4-of-16 to 5-of-16 editors — strengthens D-I case.

### Decisions locked (8 HIGH)

All cascaded to SPEC.md:

- **D-A LOCKED strict magic-byte-only** — INV3 confirmed all MUST-have MIMEs sniffable (file-type@22.0.1). Text formats belong in markdown pipeline.
- **D-C LOCKED image node for image-ext; extension-dispatch for other types** — universe-wide convergence; zero pill UX for embeds in 16 surveyed editors.
- **D-D LOCKED in-memory Map rebuild at startup** — 100% of index-having editors do this. No TrieMap dep needed at our scale.
- **D-F LOCKED read-time promotion** — Phase 2 Video/Audio/PDFViewer swap in via extension dispatch; storage shape never migrates.
- **D-G LOCKED endpoint rename + shim** — `/api/upload-image` → `/api/upload` with one-release shim (new FR-8).
- **D-H LOCKED widen file-watcher + reuse `ch:'files'`** — INV6 confirmed gap; Option A per D16 prior intent (~20 LOC).
- **D-I LOCKED wiki-embed storage for renderable, markdown-link fallback for opaque** — 6-editor convergence (Obsidian + Logseq + Foam + Dendron + Fumadocs + SilverBullet). Reuses FR-3 parser infrastructure. Obsidian refugee fidelity. Genuinely novel auto-emit (no editor auto-emits `![[...]]` on drop today).
- **D-J LOCKED free-form string for `attachmentFolderPath`** — matches Obsidian literal schema 1:1.

### Decisions deferred (3 MEDIUM)

- **D-B dedup toast UX** — show-toast recommended; no prior-art universe-wide.
- **D-E rename race** — sequential-events recommended; wiki-embed storage (D-I) reduces rewrite burden significantly.
- **D-K rename-rewrite scope** — SilverBullet-pattern (refs + co-relocation) recommended but Path C revealed the sub-question; currently MEDIUM confidence.

### Cascade applied to SPEC.md

- §1 Resolution — FR-1/FR-1a split, FR-3 widened (parse + write + render), FR-7 sub-cases, FR-8 added
- §3 NG2 demoted NEVER→NOT NOW (Phase 2 will render richly); NG11 reframed (note-to-note emit only)
- §5 P1 journey emits `![[draft.pdf]]` + renders as plain-link fallback; P3 dedup uses wiki-embed; P5 adds Case-A/Case-B for markdown-image vs wiki-embed refs
- §6 FR table — FR-1 scoped to acceptance, FR-1a new (emit dispatch), FR-3a/b/c/d (add FR-3d embed write), FR-5 expanded config (7 fields), FR-7 scoped to markdown-image path, FR-8 new (endpoint rename)
- §9 Relationship to prior spec — D6 reframed, D5+D27 widened to include write
- §10 Decision log — 8 LOCKED rows; D-B/D-E/D-K remain INVESTIGATING; added D-K
- §11 Open questions — all 6 INVs marked RESOLVED with evidence file references; 3 open decisions listed
- §12 Assumptions — A1/A2/A3/A5/A7 marked VERIFIED; A8 added (wikiEmbedExtensions default)
- §13 In Scope — expanded with FR-1a, FR-3d, FR-8, file-watcher.ts widening
- §14 Risks — R1 RESOLVED; R9 added (GitHub raw-file preview loss, accepted tradeoff); R10 added (emit-shape history consistency)
- §16 Agent constraints — updated SCOPE list, STOP_IF conditions, ASK_FIRST items

### Status

Ready for §Audit (spawn /audit + challenger) once D-B/D-E/D-K resolve. Can also proceed to audit NOW with those 3 flagged as open for design challenger.

---

## 2026-04-17 — Session 2b: D-B / D-E / D-K LOCKED at MEDIUM recommendations

User accepted deeper-enumeration analysis and locked all 3 remaining decisions.

- **D-B LOCKED (a) toast** — "Already at `docs/photo.png` — reusing." Added `upload.dedup.ui` config (default `'toast'`) to FR-5 as escape hatch if P0 dogfood surfaces noise complaints.
- **D-E LOCKED (a)+(d) hybrid** — sequential events for markdown-image refs; wiki-embed refs are architecturally immune via D-I storage. Document-only scoping; CC1 100ms debounce handles common bursts. Debounce rewriter is additive if a concrete repro emerges.
- **D-K LOCKED (a) refs only** — flipped from initial MEDIUM "SilverBullet-pattern" to MEDIUM-HIGH refs-only after deeper analysis. Rationale: D-I immunity eliminates functional need for relocation; Obsidian ecosystem expectation is assets-stay-put; SilverBullet's relocation risks shared-asset breakage without a backlink graph (Bucket 7 dep); reversibility is asymmetric favoring refs-only now + add-relocation-later.

### Cascade applied

- §10 Decision log — D-B/D-E/D-K all LOCKED with resolution text
- §11 Open questions — removed "P0 open" mention; all resolved
- §5 P5 journey Case-B — updated D-K reference from "deferred" to "LOCKED refs-only"
- §6 FR-5 — added `upload.dedup.ui` config field
- §16 ASK_FIRST — updated D-K language from "still INVESTIGATING" to "LOCKED refs-only; flipping requires re-opening with evidence"
- Header Status — "Draft (All 11 decisions LOCKED — ready for §Audit)"

### Status

**Spec is ready for §Audit.** Next step: spawn /audit + design challenger per /spec Step 6.

---

## 2026-04-17 — Session 3: §Audit + §Assess-findings pass 1

### Ran

- Auditor subagent → `meta/audit-findings.md` (16 findings: 3H / 7M / 6L)
- Design challenger subagent → `meta/design-challenge.md` (13 challenges: 3 STRONG, 5 MODERATE, 5 WEAK)

### Applied pure corrections (all auditor HIGH + MEDIUM + relevant LOW)

**HIGH:**
- **H1** — re-verified every file:line citation in `evidence/current-shipped-state.md` + SPEC §8 against current HEAD `432a834b`. Corrected upload-handler range (`2465-2580` → `2779-2894`), `MAX_UPLOAD_BYTES`/`ALLOWED_MIME_TYPES`/`GENERIC_PASTE_NAMES` lines (122/123/125 → 132/133/135), `readUploadBody` (166 → 176), `sanitizeFilename` (127-134 → 137-144), `fileTypeFromBuffer` (2535 → 2849), `ALLOWED_MIME_TYPES.has` (2546 → 2860), SVG sniff (2539-2544 → 2853-2858), `destDir` (2505 → 2819), path-escape guards (2494-2532 → 2809-2846), `writeUploadAtomic` (2571 → 2885), success response (2574 → 2888). Removed stale `file-type@8.x` reference (superseded by INV3's confirmed 22.0.1).
- **H2** — §5 P2 journey + §3 NG14 + §9 D28 + §10 D2 updated to use current config field names (`attachmentFolderPath` + `emitFormat: 'wikiembed'`, not `assetLocation`/`globalAssetDir`/`emitFormat: 'wikilink'`).
- **H3** — §3 NG6 reworded: "Default reject at 25MB (FR-5 `upload.maxBytes` default; operator-tunable)" vs old "Hard reject at 25MB."

**MEDIUM:**
- **M1** — NFR-5 expanded to include I5 (Layer A === Layer B) and I7 (Cross-path consistency) invariants in addition to I1/I4.
- **M2** — Added explicit emit-dispatch matrix table to §6 showing all combinations of (extension × `emitFormat` × `wikiEmbedExtensions`).
- **M3** — FR-3b extended with explicit tiebreak rule: (1) prefer path in sourcePath's own dirname subtree, (2) shortest path, (3) alphabetical deterministic.
- **M4** — FR-3b clarified the core/server split: data structure in `packages/core/src/utils/path-resolve.ts` (browser+Node compatible, no server deps); CC1 subscription + rebuild wiring in `packages/server/src/standalone.ts`.
- **M5** — FR-3a acceptance criteria now explicitly require preserving precedent #15 (identity-dedup) + precedent #9 (add-only schema); STOP_IF added for schema-narrowing.
- **M6** — D-E rationale reworded to separate CC1 broadcast debounce (signal-to-clients) from rewriter debounce (not implemented); clarifies the race the hybrid resolution covers.
- **M7** — `readMarkdownLink` citation corrected (line 87 → line 77 with regex at 88).

**LOW:** L1 (field count wording), L2 (handler line ranges 154-191 → 154-197; 204-214 → 211-220), L4 ("6-editor convergence" clarified via rationale text), L5 (INV1 footnote deferred — editorial), L6 (content-filter line numbers corrected).

### Added SVG-preservation STOP_IF

New STOP_IF entry: "SVG extension-fallback at `api-extension.ts:2853-2858` is removed without compensating guard → the shipped one-off SVG exception is LOAD-BEARING; D-A strict-magic-byte retains this specific fallback."

### Pending: decision-implicating findings + design challenges

Auditor findings were all pure corrections (applied). Challenger surfaced 3 STRONG + 2 MODERATE challenges that are judgment calls for the user:

- **STRONG-1 (D-I auto-emit framing):** "6-editor convergence" conflates READ with WRITE. Only SilverBullet auto-emits `![[...]]` on drop; Logseq/Foam/Dendron emit `![](...)` despite reading wiki-embed.
- **STRONG-2 (D-K drift trigger):** "Revisit when drift becomes a real complaint" is passive; 2-3-year storage drift is silent. Need time-based trigger or GC commitment.
- **STRONG-3 (scope split):** FR-1/2/5/8 (upload widening) is independently shippable from FR-3/4/1a (wiki-embed + vault).
- **MODERATE-5 (Phase 2 fallback UX):** P0 plain-link for PDF/MP4 is worse than Outline ships. Phase 1.5 inline renderers or precise fallback UX?
- **MODERATE-4 (D-A rejection UX):** CSV/TXT dropped → no actionable path.

These are surfaced to user in-chat — not auto-resolved.

---

## 2026-04-21 — Session 2: Finalize close-out (Step 5)

### Context

Re-entry after session 1's Audit/assess-findings pass. Spec was pushed to origin/main as artifact `2ad0177a` (spec document landed; implementation work NOT shipped). User's goal: close Step 5 iterative loop + re-run Step 6 Audit + Step 7 Assess + Step 8 Finalize so implementation can begin.

Baseline commit updated from `432a834b` → `2ad0177a` to reflect the current spec-on-main state.

### Scope changes (reopened under "no deferred tech debt on greenfield" principle)

- **F8 (shortestImageRef relative emit) absorbed** from §15 Identified into FR-1a acceptance criteria. One-line fix at `packages/app/src/editor/image-upload/index.ts:91` + dirname-matrix test. §9 D3 reclassified from "FIX-SHIPPED MICRO-PR" to "FR-1a (absorbed)."
- **F9 (unicode-safe sanitizeFilename) absorbed** from §15 Identified into NFR-3. One-line regex fix at `packages/server/src/api-extension.ts` + unicode-preservation + path-escape-safety test. §9 D7 reclassified. §15 Identified: F8 and F9 entries removed.
- Rationale: both fixes are one-line; spec's correctness (FR-1a markdown-image branch + NFR-3 security posture) depends on them; carrying as separate specs is more paperwork than code; implementer shouldn't start with two known blockers they have to detour around.

### New decision

- **D-L Rejection copy: two-message rule** LOCKED. Message A (unchanged from prior FR-1) for text-ext drops (.txt/.csv/.json/.md/.yml/.yaml/.toml). Message B (new, pinned): `"This file type isn't supported. Try a different file, or reference it with a markdown link: [label](path/to/file)."` for all other non-sniffable or admin-narrowed rejects. Client-side extension check determines which message fires.
  - Origin: user-driven staff-eng + staff-PM convergence exercise during session-2 /gtm:analyze pass on the "5 unsettled items" from the E2E criteria draft.
  - Underlying principle (captured in decision rationale): *error messages serve the user who hit them; be specific when the user's situation is knowable, generic-with-escape-hatch when not; never lie to preserve message variety; never expose internal structure (MIME names, config keys, allowlists) to non-operator users*.
  - Reversibility: reversible on copy wording; the two-message shape is LOCKED.

### Prose corrections (direct edit — Draft-stage, not post-ship corrigendum)

- Line 9 header: replaced "Supersedes (partial): `specs/2026-04-08-editor-input-surface/SPEC.md`" with "Builds on: `reports/editor-input-surface-worldmodel/REPORT.md`". The prior-spec path never resolved (drafted in a sibling worktree, never committed to main); the report at that path does resolve and contains the D1-D30 /assess-findings triage.
- §9 renamed "Relationship to prior spec" → "Relationship to prior work" (opens directly on the REPORT.md pointer).
- Note: earlier session attempt to apply CLAUDE.md post-ship corrigendum breadcrumb pattern (commits `e714f2d2` on spec/asset-embed-surface, `bf385495` on fix/asset-embed-f2-breadcrumb — both local-only, never pushed to origin) was the wrong pattern for a Draft-stage spec. Replaced with direct prose edit. Both local commits are disposable; they can be cleaned up post-finalize.

### New artifact

- `evidence/e2e-acceptance-scenarios.md` — cross-FR E2E acceptance scenarios (10 primary scenarios P1.1 through P7.1, edge-siblings enumerated, perturbation checks per scenario, "top 10 budget" statement, push-down list for lower-tier tests, Phase 2 coordination protocol). This file is the testable contract that implementation-time test authoring consumes. Derived from /tdd + /gtm:analyze analysis in session 2 conversation.

### §13 In Scope expansion

Added explicit callouts for: F8 fix site, F9 fix site (with note on line-number drift from baseline), rejection-copy constants, new evidence file reference, push-down list (tests that stay unit/narrow integration / fidelity PBT rather than E2E).

### Status field

Updated from "Draft (All 11 decisions LOCKED — ready for §Audit)" to "Draft (12 decisions LOCKED; F8 + F9 absorbed into scope 2026-04-21; ready for §Audit re-run)". Baseline commit field updated `432a834b` → `2ad0177a`.

### Ready for Step 6 (Audit re-run)

Content-stable for audit re-run. Auditor + challenger will spawn in parallel; prior `meta/audit-findings.md` resolved items preserved above for audit-trail continuity. Re-run expected ~8min, ~$10-15.

---

## 2026-04-21 — Session 2 cycle-2: Step 7 assess-findings, apply corrections

### Audit re-run results

Parallel nested auditor (`_nest:finalize-auditor` — 18 min, 60 turns, $9.40) and challenger (`_nest:finalize-challenger` — 10 min, 14 turns, $4.42) produced:

- **Auditor:** 14 findings (5 HIGH, 5 MEDIUM, 4 LOW) in `meta/audit-findings.md`. Concentrated theme: baseline drift `432a834b` → `2ad0177a` moved file:line citations in §8 and `evidence/current-shipped-state.md` + `evidence/inv3-file-type-mime-coverage.md`. Plus several F8/F9-absorption purge leftovers that contradict the in-scope status.
- **Challenger:** 10 new findings + 3 STRONG revisits in `meta/design-challenge.md`. Revisits: STRONG-1 weakens to LOW (F8 absorption made `emitFormat: 'markdown-image'` opt-out reliable), STRONG-2 resolved (D-K 12-month + GC commitment already LOCKED), STRONG-3 still holds (scope split remains on the table post-absorption).

### Auto-applied factual/coherence corrections (assess-findings → Act)

14 corrections — all verified against baseline `2ad0177a` with `grep -n` / `ls`:

1. **H1 §16 EXCLUDE purge:** deleted the two F8/F9 "handle separately" bullets that contradicted §13 In Scope + status line.
2. **H2 §8 "micro-PR" leftovers:** rewrote lines 203-204 to reference absorbed-scope (NFR-3 / FR-1a + §13) instead of "handles separately."
3. **H3 §8 upload-handler citation drift:** updated `api-extension.ts:2779-2894` → `:3014-3129`, constants `:132/:133/:135` → `:167/:168/:170`, `readUploadBody:176` → `:211`, `sanitizeFilename:137-144` → `:172-179`.
4. **H4 handlers.ts path:** corrected `packages/core/src/markdown/handlers.ts` (file does NOT exist) → `packages/core/src/markdown/index.ts` with anchor line numbers `:591-594` (mdast→PM) and `:876-884` (PM→mdast). Applied in §13 and §16.
5. **H5 F9 breadcrumb fix:** §13 F9 line said "drifted from 176" — at `432a834b`, line 176 was `readUploadBody`, not `sanitizeFilename` (which was at :137). Corrected to "was at lines 137-144 at baseline `432a834b`."
6. **M1 §16 STOP_IF SVG range:** `api-extension.ts:2853-2858` → `:3088-3093` with symbolic anchor ("the `<svg` text-sniff block inside `handleUploadImage`").
7. **M2 evidence/current-shipped-state.md re-verify at `2ad0177a`:** updated header date + baseline declaration; 12 individual citation updates (handler range, constants, sniff site, SVG block, sanitize range, destDir, path-escape guards, response line, writeUploadAtomic). F9/F8 "micro-PR fixes separately" language purged. Config section updated to note post-baseline ConfigSchema additions (github/sync/preview/folders — disjoint from FR-5's upload.*).
8. **M3 signalChannel → signal:** replaced in 3 locations (FR-6 acceptance, §13 In Scope, §16 SCOPE). Actual CC1Broadcaster method is `signal(channel)` at `cc1-broadcast.ts:36`, not `signalChannel`.
9. **M4 Q-INV4 repoint:** §11 Q-INV4 row no longer cites the non-existent `evidence/inv4-outline-drop-pattern.md`; repointed to `reports/editor-asset-embed-patterns-across-universe/REPORT.md` Outline entry (which covers the 16-editor cross-survey).
10. **M5 evidence/inv3 citations:** updated import line 38 → 40, use site 2535 → 3084, gate check 2546 → 3095, constant 123 → 168, SVG fallback 2539-2543 → 3088-3093. Added `2ad0177a` baseline breadcrumb noting the historical numbers.
11. **L1-auditor §15 Phase 2 line:** rewrote from pre-D-I "replaces `[name](path)` emit" to correctly describe D-F read-time promotion with storage shape unchanged.
12. **L2-auditor line 9 phrasing:** tightened "8 items not shipped" to "7 prior-spec items became FR-1..FR-7 here (FR-8 is net-new)"; clarified that `reports/editor-input-surface-worldmodel/REPORT.md` is the findings-inventory input (triage outcomes in _changelog + §9).
13. **L1-challenger F8 framing:** "one-line fix" replaced with "algorithmic rewrite, ~8-15 LOC" in §13 + changelog. F8 converts `shortestImageRef` from binary (same-dir → basename; else → absolute `/path`) to 4-case relative using `path.posix.relative()` + normalization.
14. **L2-challenger FR-7 absolute-path clause:** added to §13 FR-7 bullet: "Absolute-path refs (`![alt](/docs/photo.png)`) from pre-F8 emit MUST be detected and left unchanged; only relative-path refs are recomputed." Plus unit-test fixture requirement.

### Declined (2)

- **L4-auditor (CODE_BANG parenthetical):** Technically a stylistic leak of implementation detail into acceptance criteria, but consistent with how the spec pins other low-level expectations (precedent #15 identity-dedup, precedent #9 add-only schema). Retaining it gives the implementer a useful hint about which extension slot to register. The auditor flagged this as optional.
- **L3-challenger (STRONG-1 D-I auto-emit weakens):** Challenger's own recommendation is "no action required if the product call is locked." No action required on its own; L5-challenger's Future Work entry (external-tool compatibility guide, #12 above) implicitly carries the GitHub-readability communication debt.

### Escalations surfaced to user (7)

All Challenger MODERATE findings (M1-M5) plus L4 and a cross-cutting meta-observation are design judgment calls. Not auto-applied. Presented to user for decision before proceeding to Step 8 finalize:

1. M1-challenger: D-L admin-narrowed rejection dead-end — accept or add Message C?
2. M2-challenger: E2E top-10 omits P1.3 oversized-file rejection — promote, restore, or explicit cut?
3. M3-challenger: warnBytes config field has no behavior contract — specify or delete?
4. M4-challenger: D-E markdown-image race has no eventual-consistency guard — add P5.3 or accept gap?
5. M5-challenger: scope split (STRONG-3 revisit) still holds — bundle as single PR or split into Bucket A upload-widening + Bucket B wiki-embed+vault?
6. L4-challenger: Phase 2 coordination coupling — current protocol, permanent fallback markers, or agnostic conditional?
7. Cross-cutting: articulate "no deferred tech debt on greenfield" principle in SPEC, or leave in changelog/memory?

Step 7 complete pending user resolution of the above. Step 8 (verify + finalize) blocked on those resolutions.

---

## 2026-04-21 — Session 2 cycle-2 (PM): user resolutions applied

### Biggest decision: D-A refuted, D-L removed, D-M locked (accept-all)

User challenged the entire rejection-UX surface with the question *"what's the point of these toast messages? do other editors do this?"* Ecosystem check: every comparable editor (Obsidian, Logseq, Notion, Bear, iA Writer, Roam, Craft, Typora) accepts all file drops and emits a link for unrecognized types. OK as outlier produced overengineered rejection UX.

Resolution:
- **D-A → REFUTED by D-M.** Strict magic-byte-only reject stance overturned. User mental-model argument ("text drops should redirect to paste-into-code-fence") was paternalistic.
- **D-L → REMOVED.** Two-message rule, admin-narrowed carve-out, and Message A/B constants all dissolve.
- **D-M → LOCKED.** Accept all file drops up to `maxBytes`. Non-sniffable / unrecognized types emit as opaque markdown-link per FR-1a. SVG extension-fallback preserved for NFR-3 `<img>`-only security.
- **M1 admin-narrowed case → dissolved.** OK is local-first (Electron desktop, single-user per install); the "admin vs user" distinction doesn't exist in the product model. User IS the operator.
- **`allowedMimeTypes` config → deleted from FR-5.** No runtime gate consumer post-D-M. Added Future Work Explored entry "Security-focused upload allowlist" (revisit if multi-tenant deployment becomes relevant).

### M2 — P1.3 promoted to top-list (soft cap)

"Top 10 E2E budget" was a soft guide, not a hard constraint. P1.3 (oversized-file rejection with byte-size-specific toast) covers a distinct bug class (size-check layer vs type-dispatch layer) not caught by any other scenario. Especially load-bearing post-D-M since it's the ONLY rejection path in the spec.

Resolution: promoted P1.3 as #11 in the top-list. Along with P5.3 (see M4 below), the list is now 12 scenarios. Documented as soft-cap in the budget section.

### M3 — `warnBytes` deleted from FR-5

Config field existed with no behavior contract. No dogfood signal on whether 5-25MB uploads produce perceptible sync lag. Per greenfield "fix or remove": remove.

Resolution: deleted `warnBytes` from FR-5 field list. Added Future Work Explored entry "Soft-limit warn UX (5-25MB range)" with trigger "first user report that 5-25MB drops feel slow or unexpected."

### M4 — P5.3 eventual-consistency scenario added

D-E LOCKED accepts "temporary incoherence for markdown-image during bursts." But **eventual-consistency (post-quiescence correctness) is a different, deterministic assertion** that wasn't tested. The F8-absorbed `emitFormat: 'markdown-image'` opt-out path had no acceptance-tier guard for FR-7 regressions under concurrent rename + asset-create bursts.

Resolution: added P5.3 scenario as sibling of P5.2. Condition-based quiescence wait (not wall-clock sleep, per /tdd flakiness rule). Invariants: post-quiescence path correctness, image renders, new asset indexed, no orphan. Promoted to top-list as #12.

### L4 — Phase 2 coordination: permanent fallback markers

Cross-spec coupling by convention ("Phase 2 author edits this file's assertions") was fragile. Flipped to permanent-fallback-marker pattern per challenger's Option B:
- P0 fallback assertions stay indefinitely as `[P0-phase1-fallback]` regression guards.
- Phase 2 additively writes new scenarios to its own `specs/2026-04-08-typed-component-nodes/` — does NOT edit this spec's evidence file.
- Regression safety: if Phase 2 introduces a bug silently degrading back to plain-link, Phase 2's own scenarios fail; P0 assertions still pass. Clean bug localization.

Resolution: rewrote the Phase 2 Coordination section in `evidence/e2e-acceptance-scenarios.md` to document the permanent-marker approach and enumerate which scenarios carry the fallback guards.

### Cross-cutting (no action)

Greenfield principle articulation: already named in CLAUDE.md §118 as "(greenfield directive, 2026-04-13)" + elaborated in PRECEDENTS.md §3. Specific corollary "no deferred tech debt" is implicit in the directive. No additional rule needed.

### Net scope delta from cycle-1 to cycle-2

- SPEC.md: §3 status updated, FR-1 rewritten (accept-all), FR-5 reduced to 6 fields (removed `warnBytes` + `allowedMimeTypes`), NFR-3 unchanged (SVG guard preserved), §9 D1 + D30 rows updated, §10 D-A refuted + D-L removed + D-M added, §13 In Scope simplified (no rejection-copy constants), §14 R1 + R7 re-rationaled, §15 Future Work gained 2 Explored entries, §16 SCOPE + STOP_IF updated.
- evidence/e2e-acceptance-scenarios.md: P1.2 rewritten (accept → opaque markdown-link), P1.2a-e updated siblings, P1.3 rewrite and promote, P4.1 simplified (just `maxBytes`), P5.3 added, Phase 2 coordination rewritten (permanent markers), Resolved-in-session notes expanded, top-list updated (12 scenarios).
- `evidence/current-shipped-state.md`: no change (factual record of current baseline unchanged).
- `meta/_changelog.md`: this entry.

### Remaining before Step 8 finalize

None. All MODERATE + LOW design escalations resolved. Ready for Step 8 mechanical checks + resolution status verification + baseline commit advance.

