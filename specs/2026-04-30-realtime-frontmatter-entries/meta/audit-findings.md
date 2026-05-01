# Audit Findings

**Artifact:** `/Users/andrew/Documents/code/open-knowledge/.claude/worktrees/edit-frontmatter/specs/2026-04-30-realtime-frontmatter-entries/SPEC.md`
**Audit date:** 2026-04-30
**Baseline commit:** c1c76cb7 (verified — matches spec header)
**Total findings:** 11 (2 high, 4 medium, 5 low)

Bottom line: **implementable as written, with two factual corrections needed before implementation.** The spec is internally coherent, faithful to evidence, and correctly applies the substrate STOP rules. The architectural premise (PropertyPanel as a structured editor view over the YAML region of `Y.Text('source')`, mirroring `bindConfigDoc`) is sound and verified against `bindConfigDoc`'s actual signature. All cited file paths exist; predecessor decision IDs (D2/D7/D9/D10/D12/D13/D27/D30 from 04-24; AC-C1..C6, AC-S1, AC-S3..S5, AC-Q4 from 04-30) are real. The two high-severity findings are both about a single shared error: spec assumption A5 plus its propagation into D25 mis-state that `applyAgentMarkdownWrite` "already reads FM at Y.Text level" — code at `packages/server/src/agent-sessions.ts:129` reads `existingFm` from `metaMap.get('frontmatter')`, not from Y.Text. Worldmodel I-12 only makes this claim about `applyAgentUndo` (which is correct). The migration is still mechanical, but A5's "HIGH confidence" rating is wrong, and FR14's "Backed by D25" with a "yes" in the verification matrix overstates the readiness. The medium findings flag (1) the supersession enumeration omitting AC-S2/S6/S7 and AC-Q1/Q2/Q3/Q5 from the predecessor 04-30 spec despite FR11 deleting those exact surfaces; (2) Observer A baseline staleness after FM-only Y.Text edits is acknowledged as a STOP_IF condition but not prescriptively solved in the design; (3) the worldmodel's claim about `headless-tree` is incorrect (the codebase uses `@pierre/trees`); (4) the spec sentence "the body editor (TipTap) is a structured view over Y.Text via the bridge" is imprecise — TipTap binds to `Y.XmlFragment('default')`, with Y.Text as the parallel CRDT mirrored via Observer A. None of the findings invalidate the architectural direction or require a re-spec; all are addressable with targeted edits.

---

## High Severity

### [H] Finding 1: Assumption A5 mischaracterizes `applyAgentMarkdownWrite` — code reads FM from metaMap, not Y.Text

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** §12 Assumptions table (A5); §10 Decision log (D25); §13 Resolution completeness gate (FR14 row)
**Issue:** A5 states "applyAgentMarkdownWrite already reads FM at Y.Text level and the metaMap-mirror call is safely removable" with confidence HIGH and verification "Code trace (Q18) — already largely confirmed in worldmodel evidence." This is contradicted by the actual code.
**Current text:** A5 row: "`applyAgentMarkdownWrite` already reads FM at Y.Text level and the metaMap-mirror call is safely removable. | HIGH"
**Evidence:** `packages/server/src/agent-sessions.ts:129` reads `const existingFm = (metaMap.get('frontmatter') as string | undefined) ?? '';` — the `existingFm` source is the legacy single-string slot in `Y.Map('metadata')`, not Y.Text. The worldmodel I-12 entry correctly attributes the "reads FM from `stripFrontmatter(ytext.toString())` already (no metaMap read for FM source!)" claim to `applyAgentUndo` (line 264-265), not to `applyAgentMarkdownWrite`. D25's parenthetical "already partially the case for undo per worldmodel I-12" is accurate; A5's HIGH-confidence claim about `applyAgentMarkdownWrite` is not.
**Status:** CONTRADICTED
**Suggested resolution:** Re-rate A5 to MED confidence; rewrite as "`applyAgentUndo` reads FM from Y.Text already; `applyAgentMarkdownWrite` reads `existingFm` from `metaMap.get('frontmatter')` and is a mechanical migration to `stripFrontmatter(ytext.toString()).frontmatter`. No `writeFrontmatterDualSlot` calls remain after migration." Update D25 implications row to call out the migration on line 129 explicitly. The migration is still trivial — no design change is required — but the readiness claim should reflect "to-do" not "already done."

---

### [H] Finding 2: §13 verification matrix marks FR14 "architecture validated: yes" while resting on the unverified A5

**Category:** COHERENCE
**Source:** L4 (evidence-synthesis fidelity)
**Location:** §13 Resolution completeness gate, FR14 row
**Issue:** The matrix states FR14 has "Architecture validated: yes" with backing decision D25. D25 inherits A5's premise that `applyAgentMarkdownWrite` already reads FM at Y.Text level. Once Finding 1 is corrected, the validation status for FR14 is "to-do, mechanical migration confirmed" rather than "already largely confirmed in worldmodel evidence."
**Current text:** "FR14 (agent-write Y.Text reads) | D25 | none | yes | yes (`api-agent-frontmatter.test.ts`) | yes | yes"
**Evidence:** Same as Finding 1 — `agent-sessions.ts:129` and `agent-sessions.ts:175` (writeFrontmatterDualSlot call) need migration; `agent-sessions.ts:272, 281` need migration too. None of these are "already done" — they're "mechanical migration not yet applied."
**Status:** INCOHERENT (with itself once A5 is corrected)
**Suggested resolution:** No matrix-level change needed if A5/D25 are clarified per Finding 1 — the matrix's "yes" for "Architecture validated" can mean "the migration target is clear and the mechanical edits are enumerated" rather than "the code already reflects the target." Add a note row to clarify: FR14's verification confirms the migration target (Y.Text read), not that the migration is already in place.

---

## Medium Severity

### [M] Finding 3: Predecessor 04-30 supersession enumeration is incomplete — AC-S2, AC-S6, AC-S7, and AC-Q1/Q2/Q3/Q5 are not addressed

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions)
**Location:** `evidence/predecessor-decisions-superseded.md` table; SPEC.md §1 Links
**Issue:** The supersession evidence file lists AC-C1..C6, AC-S1, AC-S3..S5, AC-Q4 as superseded. But FR11 explicitly deletes the entire L3 surface, which includes:
- AC-S2 (`FRONTMATTER_VALIDATION_REVERT_ORIGIN` from `frontmatter-edit-origin.ts`) — deleted by FR11
- AC-S6 (`emitFrontmatterValidationRejected` + `CC1_CHANNEL_FRONTMATTER_VALIDATION_REJECTED`) — deleted by FR11
- AC-S7 (`boot.ts`/`standalone.ts` wiring) — deleted by FR11
- AC-Q1 (`bun run check` passes) — preserved (mentioned in §13 deployment)
- AC-Q2 (unit test in `bind-frontmatter-doc.test.ts`) — heavily reshaped (the test file is REWRITE per §13)
- AC-Q3 (L3 integration test) — deleted with L3 (see FR11 + §13 file enumeration)
- AC-Q5 (Playwright property-panel coverage) — preserved/migrated (E2E layer per D24)
**Current text (predecessor-decisions-superseded.md):** "| 04-30 | AC-S3..S5 | L3 hook validates per-key metaMap and reverts via FRONTMATTER_VALIDATION_REVERT_ORIGIN | Reframe or delete..."
**Evidence:** Predecessor SPEC `specs/2026-04-30-crdt-direct-frontmatter-writes/SPEC.md` enumerates AC-S1..S7 and AC-Q1..Q5; confirmed via grep. FR11 of the new spec lists deletions matching AC-S2/S6/S7. AC-Q1/Q2/Q3/Q5 are not addressed in the supersession table.
**Status:** INCOHERENT
**Suggested resolution:** Add rows to the supersession table for AC-S2 ("Delete — origin no longer needed"), AC-S6 ("Delete — CC1 channel removed"), AC-S7 ("Delete — boot wiring removed"), AC-Q1 ("Preserve — quality gate"), AC-Q2 ("Reshape — test file rewritten for new API"), AC-Q3 ("Delete — L3 surface removed"), AC-Q5 ("Reshape — D24 layer d covers"). This closes the supersession-trace loop the evidence file is meant to provide.

---

### [M] Finding 4: Observer A baseline staleness after pure FM-region edits is recognized as a STOP_IF but not prescriptively resolved

**Category:** COHERENCE
**Source:** L4 (evidence-synthesis fidelity); also reader-pass intuition
**Location:** §10 D2; §16 STOP_IF; `evidence/substrate-invariants.md` "Bridge invariant" + "Settlement dispatcher" sections
**Issue:** Substrate invariants explicitly flag the risk: "Subtle staleness if a Y.Text-region edit fires Observer B (recompute body XmlFragment from Y.Text body), and Observer A's `lastSyncedXmlMd` baseline isn't refreshed for the FM-only edit case." The new design has Observer A only firing on XmlFragment changes (D9 deletes Observer Meta + metaDirty). After a pure FM-only Y.Text edit under FORM_WRITE_ORIGIN, XmlFragment is unchanged → Observer A does NOT fire → `lastSyncedXmlMd` is not refreshed. On the NEXT body edit, Observer A computes `md = prependFrontmatter(<NEW-FM-from-ytext>, body)`; `lastSyncedXmlMd` still holds the OLD FM. The "already-in-sync gate" (`normalizeBridge(currentText) === normalizeBridge(md)`) checks whether Y.Text matches the newly composed `md` — if so, baseline updates and exits. If not (concurrent write race), Path B (three-way merge) fires with a stale baseline. The spec lists this as a STOP_IF condition but does not prescriptively design a mitigation (e.g., add a Y.Text observer that refreshes `lastSyncedXmlMd` on FORM_WRITE_ORIGIN edits, or rely on the already-in-sync gate exclusively).
**Current text (D2):** "Tests checking origin shape stay; Observer B normalize-gate must verify no loop on FM-only edits (see §11 OQ)." STOP_IF: "Observer A's `lastSyncedXmlMd` baseline becomes stale after a pure FM-region edit (would surface as bridge-invariant violation or content loss in C-matrix tests)."
**Evidence:** `packages/server/src/server-observers.ts:432-465` (Observer A only fires on XmlFragment); lines 488-512 (Observer Meta is the only path that triggers Observer A on metaMap changes today, deleted under D9). Section 10 D2 implies "spec must verify" but the verification design is not specified in §9 or §13.
**Status:** INCOHERENT (acknowledged risk without designed mitigation in the in-scope plan)
**Suggested resolution:** Add a §10 decision (or extend D2 implications) describing one of: (a) "Observer A's baseline refresh after FORM_WRITE_ORIGIN Y.Text edits is handled by the already-in-sync gate at line 369 — verified in C-matrix integration test extending FR10"; (b) "Add a lightweight Y.Text observer that refreshes `lastSyncedXmlMd` on FM-region byte-range changes from FORM_WRITE_ORIGIN"; or (c) "After FM-region edit, Observer A is force-fired via `xmlDirty = true` from a Y.Text observer." Pick one and call it out.

---

### [M] Finding 5: Worldmodel claims FileTree uses `headless-tree` — the codebase uses `@pierre/trees`

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** `evidence/_init_worldmodel.md` "Patterns / caveats" section
**Issue:** Worldmodel says "FileTree.tsx uses `headless-tree`'s built-in dragAndDrop" in the patterns-with-caveats subsection. The actual import is from `@pierre/trees` (`packages/app/src/components/file-tree-adapter.ts:1`, `packages/app/src/components/FileTree.tsx`). `headless-tree` only appears in `packages/cli/dist/THIRD_PARTY_NOTICES.md` as a deprecated reference noting that "the initial version of this project used `headless-tree` as the underlying tree" before the migration to `@pierre/trees`.
**Current text (worldmodel):** "FileTree.tsx uses `headless-tree`'s built-in dragAndDrop"
**Evidence:** `grep -r 'headless-tree' packages/` returns only THIRD_PARTY_NOTICES; `grep '@pierre/trees' packages/app/package.json` returns the actual dep. SPEC.md does not propagate this error (D14 says "@dnd-kit chosen; existing alternatives include headless-tree (tree-specific) and HTML5 native"), but the worldmodel evidence file is stale on this point.
**Status:** STALE (the codebase migrated; evidence wasn't refreshed)
**Suggested resolution:** Update worldmodel "Patterns / caveats" section: "FileTree.tsx uses `@pierre/trees`'s built-in dragAndDrop (the codebase migrated from `headless-tree` per `packages/cli/dist/THIRD_PARTY_NOTICES.md`)." Does not change the spec's choice of `@dnd-kit` (D14) — `@pierre/trees` is tree-specific and not appropriate for the property panel.

---

### [M] Finding 6: §1 problem statement's framing of TipTap as "structured view over Y.Text via the bridge" is imprecise

**Category:** FACTUAL
**Source:** T1 (own codebase) + L8 (terminology consistency)
**Location:** §1 Problem statement, last sentence of Situation paragraph
**Issue:** Spec says "the body editor (TipTap) is a structured view over Y.Text via the bridge." Per CLAUDE.md "Editor substrate" §1, TipTap binds directly to `Y.XmlFragment('default')`; `Y.Text('source')` is a parallel CRDT mirrored from XmlFragment by Server Observer A. TipTap is NOT a view over Y.Text; the bridge is XmlFragment ↔ Y.Text, with TipTap on the XmlFragment side and CodeMirror on the Y.Text side.
**Current text:** "The codebase already has the canonical pattern for 'typed read/patch/subscribe over a Y.Text holding YAML' (`bindConfigDoc`), and the body editor (TipTap) is a structured view over Y.Text via the bridge."
**Evidence:** CLAUDE.md "Editor substrate" diagram explicitly shows `Y.XmlFragment('default')` ← TipTap binds here; Y.Text('source') ← CodeMirror binds (y-codemirror.next). `packages/server/src/server-observers.ts` Observer A bridges XmlFragment → Y.Text.
**Status:** INCOHERENT (with substrate documentation)
**Suggested resolution:** Rewrite as: "the body editor (TipTap) is a structured view over `Y.XmlFragment('default')`, which the bridge mirrors to `Y.Text('source')` via Observer A. The frontmatter UI is the only structured editor in the system that does not bind to a CRDT root-level structure (today: it binds to per-key entries in `Y.Map('metadata')`; this spec rebinds it to the YAML region of `Y.Text('source')`)." This is a one-paragraph rewrite that fixes the framing without changing the spec's logic.

---

## Low Severity

### [L] Finding 7: §3 NG6 "Field-level CRDT merge" framing implies a true regression that is partially mitigated by Y.Text character-level merge

**Category:** COHERENCE
**Source:** L2 (confidence-prose misalignment); L3 (missing conditionality)
**Location:** §3 NG6
**Issue:** NG6 states the new model "gives up the predecessor's per-key field-level merge in favor of Y.Text character-level merge." This is true for same-key concurrent edits where one client deletes the key and another mutates the value: the predecessor's per-key Y.Map slot would have given both a chance to land on different keys, but the new model has them as overlapping byte ranges where Y.Text's last-write-wins applies. However, for non-overlapping keys (different lines in the YAML region), Y.Text's character-level CRDT does merge correctly — better than the predecessor's per-key LWW. The NG6 framing reads as a strict regression when it's a more nuanced trade.
**Current text:** "NG6: Field-level CRDT merge for two clients editing the same YAML key concurrently. — The new model gives up the predecessor's per-key field-level merge in favor of Y.Text character-level merge. Reconsider only if character-level merge produces unacceptable user-visible conflicts in practice."
**Evidence:** Y.Text CRDT semantics; `packages/server/src/server-observers.ts` Path B three-way merge for body; the predecessor 04-30 spec AC-Q4 ("two clients commit different property values to the same key concurrently; convergence to last-wins").
**Status:** INCOHERENT (sub-case)
**Suggested resolution:** Refine NG6: "The new model replaces per-key field-level merge with Y.Text character-level merge. Different-key concurrent edits merge cleanly via Y.Text character-level CRDT (better than per-key LWW). Same-key concurrent value edits collapse to Y.Text byte-range LWW on overlapping ranges (regression vs. predecessor's per-key slot LWW). Reconsider only if same-key concurrent edits produce unacceptable user-visible conflicts in practice."

---

### [L] Finding 8: §1 "~7 files of L3 validation infrastructure" conflates standalone files with method/channel/effect call sites

**Category:** FACTUAL (terminology)
**Source:** T1 (own codebase) + L8 (terminology consistency)
**Location:** §1 Complication; §2 G5; §6 FR11; §10 D10
**Issue:** Spec claims "~7 files" but the enumerated items are: `frontmatter-l3.ts` (file), `frontmatter-edit-origin.ts` (file), CC1 broadcaster method (a function within `cc1-broadcast.ts`, not a file), persistence wiring (lines within `persistence.ts`/`boot.ts`/`standalone.ts`), error events module (`frontmatter-validation-events.ts`, file), `cc1.ts` channel constant (lines within `cc1.ts`), PropertyPanel rejection-subscription effect (lines within `PropertyPanel.tsx`). Only 3 of these are standalone files; the rest are surfaces within larger files. This is a minor verbal imprecision but the "~7 files" claim is repeated 3x in the spec.
**Current text:** "Defending against the dual-storage divergence the per-key schema introduces costs ~7 files of L3 validation infrastructure (`frontmatter-l3`, `frontmatter-edit-origin`, CC1 broadcaster, persistence wiring, error events module, PropertyPanel subscription)."
**Evidence:** `ls packages/server/src/frontmatter-l3.ts packages/server/src/frontmatter-edit-origin.ts packages/app/src/lib/frontmatter-validation-events.ts` returns 3 files. CC1 broadcaster, persistence wiring, PropertyPanel subscription are call-site changes within existing files.
**Status:** STALE (loose phrasing — count claim doesn't match the file count)
**Suggested resolution:** Replace "~7 files" with "~7 surfaces" or "~3 files plus ~4 call-site surfaces" to remove the precision claim. Or keep "~7" as a soft count but rephrase as "~7 distinct surfaces of L3 validation infrastructure."

---

### [L] Finding 9: D8 "~30 reader sites" is approximate; spec doesn't reconcile with the more concrete §17 manifest

**Category:** COHERENCE
**Source:** L7 (inline source attribution)
**Location:** §10 D8 evidence column
**Issue:** D8's evidence cell says "~30 reader sites identified across `packages`" but §17's full manifest enumerates 28 files. The spec doesn't tell the reader the relationship between "30 reader sites" (the unit of D8 — call sites) and "28 files" (the unit of §17 — files containing call sites). A skim reader could read the count as inconsistent.
**Current text (D8):** "Investigation: ~30 reader sites identified across `packages`."
**Evidence:** `grep metaMap. packages/...` returns 41 hits (44 if including dist); `grep metaMap.get/set/delete packages/...` returns 26 hits. §17's full manifest is 28 files. Both figures are roughly aligned but referenced without unit clarification.
**Status:** INCOHERENT (unit mismatch; minor)
**Suggested resolution:** D8 evidence cell: "~30 reader call sites across ~28 files (full enumeration in §17)." Aligns the two counts and units explicitly.

---

### [L] Finding 10: Test file references in §13 and §17 use both `frontmatter-edit.e2e.ts` and `e2e/frontmatter-edit.e2e.ts` paths

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions); L8 (terminology consistency)
**Location:** §13 Test churn enumeration ("New" subsection); §16 NEW; §17 last paragraph
**Issue:** §13 says "New: `packages/app/tests/e2e/frontmatter-edit.e2e.ts`". §16 also says `packages/app/tests/e2e/frontmatter-edit.e2e.ts`. The repo's actual e2e directory is `packages/app/tests/stress/` for Playwright `*.e2e.ts` files (CLAUDE.md Testing layers) — though `packages/app/tests/e2e/` may be acceptable. Need to verify the canonical path. Looking at existing files: `packages/app/tests/stress/docs-open.e2e.ts` is referenced in CLAUDE.md as "the reference pattern" for Playwright tests with `seedDocs`. The spec's path may not match the repo convention.
**Current text:** §13 + §16 + §17 all reference `packages/app/tests/e2e/frontmatter-edit.e2e.ts`
**Evidence:** `find packages/app/tests -name '*.e2e.ts'` would clarify; based on CLAUDE.md "Playwright policy" section referencing `docs-open.e2e.ts` and `stress/*.e2e.ts`, the convention may be `tests/stress/`.
**Status:** UNVERIFIABLE (without file listing)
**Suggested resolution:** Verify the canonical Playwright `*.e2e.ts` directory in this repo before implementation. If `packages/app/tests/stress/` is correct, update the path. If a separate `e2e/` directory is acceptable, document in §16 SCOPE that this is a new directory.

---

### [L] Finding 11: Spec's "structured view over Y.Text" is at industry frontier — claim of "well-established in this codebase" via `bindConfigDoc` understates novelty

**Category:** COHERENCE
**Source:** L2 (confidence-prose misalignment)
**Location:** `evidence/bindconfigdoc-sibling-pattern.md` "Why this matters for scope"; spec §1 Resolution
**Issue:** Sibling-pattern doc says "the pattern itself is well-established in this codebase via `bindConfigDoc`." The worldmodel's 3P landscape section more accurately notes: "No widely-cited precedent for an Obsidian-style Properties view rendered specifically over a CRDT-synced Y.Text region — the topic is at the frontier." The spec inherits the sibling-pattern's overconfidence. The pattern is established for `bindConfigDoc` (full-Y.Text YAML — `__config__/workspace`, `__user__/config.yml`); applying it to a *sub-region* of Y.Text (the FM region of `Y.Text('source')` while CodeMirror's `yCollab` and TipTap's bridge also touch the same Y.Text) is novel within the codebase.
**Current text (bindconfigdoc-sibling-pattern.md):** "The pattern itself is well-established in this codebase via `bindConfigDoc`."
**Evidence:** `bindConfigDoc(provider, scope)` operates on a dedicated Y.Text whose ENTIRE content is YAML, not a sub-region of a shared Y.Text. The new `bindFrontmatterDoc` operates on a sub-region while another writer (`yCollab` from CodeMirror) and the bridge (Observer B) write to the same Y.Text. The novelty is in the multi-writer, sub-region scoping.
**Status:** INCOHERENT (with worldmodel's 3P landscape section)
**Suggested resolution:** Rephrase the sibling-pattern doc and spec §1: "The full-Y.Text version of this pattern is established via `bindConfigDoc`; the sub-region version (where another collaborative writer is active on the same Y.Text) is novel within the codebase but follows the same parse-edit-stringify primitive shape." Aligns with the worldmodel's frontier framing.

---

## Confirmed Claims (summary)

**Coherence (L1-L8):** §10 decision IDs (D1-D30) are internally consistent with §6 FRs and §13 verification matrix. §11 correctly empties the Open Questions table after resolving Q1-Q25 into D-numbers (excluding the few resolved as Future Work). The §17 manifest's 28-file count matches the worldmodel "Summary table." The supersession claim against predecessor 04-24 D2/D7/D9/D10/D12/D13/D27/D30 is verified — every cited D-number exists in 04-24's SPEC.md and the predecessor decision content matches the supersession description.

**Factual (T1-T5):**
- `bindConfigDoc(provider, scope)` signature exists at `packages/core/src/config/bind-config-doc.ts:178` — verified.
- `FRONTMATTER_RE` exists at `packages/core/src/extensions/frontmatter.ts:8` — verified.
- `attachBridgeInvariantWatcher` exists at `packages/app/tests/integration/test-harness.ts:933` — verified.
- All cited file paths in §16 SCOPE/EXCLUDE/DELETE/NEW exist (or, for NEW, are not yet present, as expected).
- `getFrontmatter(doc)` consumer count: ~9 actual call sites (server-observers.ts ×6, live-derived-index.ts, suggest-links.ts, standalone.ts) — spec's "8 sites" is approximately correct.
- Predecessor 04-24 D-numbers (D2 LOCKED, D7, D9, D10, D12, D13, D27, D30 plus preserved D1/D3/D5/D8/D11/D14-D21/D23/D25/D26/D28/D29) exist in `specs/2026-04-24-frontmatter-editing-ux/SPEC.md`.
- Predecessor 04-30 ACs (AC-C1..C6, AC-S1, AC-S3..S5, AC-Q4 plus AC-R1..R5 preserved) exist in `specs/2026-04-30-crdt-direct-frontmatter-writes/SPEC.md`.
- L3 infrastructure files exist: `frontmatter-l3.ts`, `frontmatter-edit-origin.ts`, `frontmatter-validation-events.ts`, `frontmatter-l3.test.ts`, `persistence-perkey.test.ts`, `frontmatter-perkey-roundtrip.test.ts` — all confirmed.
- CC1 channel `frontmatter-validation-rejected` at `cc1.ts:192`; broadcaster method at `cc1-broadcast.ts:373` — verified.
- C1-C10 integration test files exist at `packages/app/tests/integration/c{1..10}-*.test.ts` — verified.
- `FORM_WRITE_ORIGIN` is non-paired in current code (`bind-frontmatter-doc.ts:53`, `frontmatter-edit-origin.ts:18-22`) — D2's claim is consistent.
- `OBSERVER_SYNC_ORIGIN` discipline observed at `server-observers.ts:434, 492, 402, 523, 581, 622, 653` — D9 deletion of Observer Meta does not disturb this.
- `isPairedWriteOrigin` STOP rule: new FORM_WRITE_ORIGIN touches only Y.Text (not BOTH XmlFragment and Y.Text), so non-paired status is correct per CLAUDE.md STOP rule.
- `isSystemDoc()` / `isConfigDoc()` gates: `server-observer-extension.ts:51`, `external-change.ts:67`, `file-watcher.ts:569`, `EditorActivityPool.tsx:236`, `provider-pool.ts:815, 1294` — all observe the gate before binding to `Y.Text`. The new spec's PropertyPanel binding is mounted via `EditorActivityPool` which already filters synthetic docs. No violation.

**Cross-cutting concerns coverage (§11):** Error envelope (D21, D30 — last-valid + banner; commit-time L1 envelope unchanged) ✓; Idempotency (D11 — single transact per UI commit) ✓; Telemetry naming (preserved `recordFrontmatterEditSurface('form')`; per-op breakdown deferred to Future Work) ✓; L1/L2/L3 defense pattern (L1 retained at binding; L2 not needed; L3 deleted entirely under D10) ✓.

**Future Work tier accuracy (§15):** Surgical Pair-swap drag-reorder (Explored, has implementation sketch) ✓; Source-mode panel rendering (Identified, has investigation needed) ✓; Per-op telemetry (Identified, brief investigation needed) ✓; Noted items (NG1-NG5, drag-undo granularity, auto-scroll, edit-during-drag) — appropriate brevity ✓.

**STOP rule compliance:** All STOP rules (FORM_WRITE_ORIGIN paired discipline; isPairedWriteOrigin discipline; OBSERVER_SYNC_ORIGIN discipline; settlement dispatcher #13(b); isSystemDoc/isConfigDoc gates) are addressed correctly or preserved by the spec. No STOP rule violations identified.

## Unverifiable Claims

- **A1 — yaml@2 comment placement under `Pair` reorder.** Marked MED confidence; verification plan is a probe during implementation (≤30 LOC). Cannot be verified by static analysis; spec correctly defers.
- **A2 — `ytext.observe` content-equality bailout perf.** MED confidence; verification plan is a micro-benchmark. Cannot be verified statically.
- **A6 — yaml@2 Document.toString() emits duplicate-key Pairs.** MED confidence; verification plan is a 10-LOC probe in `yaml-codec.test.ts`. Web search noted yaml@2 may throw on duplicate keys by default unless `json: true` option is set — implementation must verify what `Document.toString()` does on a `Document` whose `.contents.items` has been programmatically mutated to have two same-key Pairs (a different code path from initial parse). Spec correctly flags this as needing implementation probe and includes a STOP_IF if A6 fails.
- **§13 Playwright path conventions.** Cited `packages/app/tests/e2e/frontmatter-edit.e2e.ts` — CLAUDE.md mentions `packages/app/tests/stress/*.e2e.ts` as the typical location. Path may need correction during implementation (Finding 10).
