# Changelog

Append-only process history. Most-recent entries at the bottom.

## 2026-04-30 — Spec scaffolded

- Created `SPEC.md` (draft skeleton), `evidence/`, `meta/_changelog.md` at baseline commit `c1c76cb7` (worktree `edit-frontmatter`).
- Captured user-stated outcomes from intake to `evidence/_user_outcomes.md`.
- Light intake (Step 1) complete. Two clarifying questions answered:
  1. Drag-to-reorder: in scope for this spec, treated as "move selected text from A to B" — local during drag, committed as Y.Text move on mouseup.
  2. Migration: greenfield — no concern about existing CRDT state or backward compat with predecessor spec.
- **Architectural reframe captured during intake:** the property panel is a structured editor view over the YAML region of `Y.Text('source')`, not a separate CRDT data structure. Y.Map('metadata') becomes either a derived projection or fully eliminated. This supersedes the schema decisions in the predecessor spec (`specs/2026-04-30-crdt-direct-frontmatter-writes`) under greenfield permission.
- Next: Step 2 — dispatch /worldmodel against the new premise.

## 2026-04-30 — Step 3 framing complete; Step 4 backlog extracted

- User confirmed SCR + stress probes + scope hypothesis. Persisted to SPEC.md §1–§5, §8, §10 (just-resolve-it decisions D1–D7), §11 OQ table (Q1–Q30), §12 Assumptions A1–A5, §14 Risks.
- Extracted granular evidence files: `bindconfigdoc-sibling-pattern.md`, `predecessor-decisions-superseded.md`, `substrate-invariants.md`.
- Resolved unilaterally to §10:
  - D1: panel binds to YAML region of `Y.Text('source')` (DIRECTED — user-stated).
  - D2: `FORM_WRITE_ORIGIN` non-paired, semantics shift (LOCKED — STOP rule).
  - D3: region detection via existing `FRONTMATTER_RE` (DIRECTED — codebase consistency).
  - D4: `yaml@2.x` `parseDocument` (LOCKED — predecessor D25).
  - D5: writer-ID stays `principal-<UUID>` (LOCKED — precedent #25).
  - D6: Y.Text undo = native byte-level UndoManager (DIRECTED).
  - D7: Add Property toolbar wiring stays (DELEGATED).
- 25 P0 OQs and 5 P2 OQs in §11. Dependency anchor: Q1 (Y.Map fate) gates Q3 (binding API) and Q25 (Observer Meta deletion).

## 2026-04-30 — Audit + design challenge applied

- Cold-reader audit + design challenge ran in parallel.
- **Audit findings (11):** 2 HIGH (both about A5 mischaracterizing `applyAgentMarkdownWrite`), 4 MED, 5 LOW. Bottom line: implementable as written, with two factual corrections.
- **Design challenge findings (10):** 4 HIGH (A3 circularity, A1+A6 deferred-probe risk, D20 perf assumption wrong, Observer A baseline refresh undesigned), 5 MED, 1 LOW.
- **Inline yaml@2 probes ran.** A1 + A6 verified — see `evidence/yaml2-probe-results.md`. A6 requires `parseDocument({ uniqueKeys: false })` (added to D4). Both promoted from MED to HIGH.
- **Y.Text source verified.** `toString()` is O(n) per `node_modules/yjs/src/types/YText.js:935`. D20 strategy switched from `byte-range string equality` to `YTextEvent.delta`-based bailout.
- **Decisions added:**
  - D31: Y.Text region IS the source of truth (resolves A3 circularity).
  - D32: Observer A baseline refresh on FM-only edits via existing in-sync gate; verified by C-matrix integration test (audit Finding 4 + challenge Finding #4).
  - D33: FM region size limit (64 KB) at L1 commit gate (challenge Finding #8).
- **D4 updated:** mandatory `uniqueKeys: false` option.
- **D11 rationale rephrased:** explicit-methods chosen for discoverability over polymorphic ops-array, mirrors `bindConfigDoc` (challenge Finding #10).
- **D24 extended:** added layer (e) malformed-YAML fuzz suite at all four entry points (challenge Finding #6).
- **D25 sharpened:** explicitly calls out `agent-sessions.ts:129, 175, 264-265` as migration targets (audit Finding 1).
- **A5 demoted from HIGH to MED** with corrected claim (audit Finding 1).
- **§1 framing fixed:** TipTap binds `Y.XmlFragment('default')`, not Y.Text (audit Finding 6).
- **NG6 sharpened** to call out same-key-vs-different-key concurrent merge nuance (audit Finding 7) + per-property identity foreclosure (challenge Finding #8 / audit Finding 11).
- **STOP_IF expanded** to include byte-range recompute discipline + L3-class infra prohibition.
- **§17 manifest updated** for `tests/stress/` Playwright path convention (audit Finding 10).
- **Evidence files updated:** `predecessor-decisions-superseded.md` (added AC-S2/S6/S7 + AC-Q1/Q2/Q3/Q5 — audit Finding 3); `bindconfigdoc-sibling-pattern.md` (sub-region multi-writer novelty — audit Finding 11); new `yaml2-probe-results.md`.
- **One judgment-needed item surfaced to user:** D13 stomp-window framing (challenge Finding #5) — escalate impact in §14, commit surgical-edit upgrade now, or add telemetry counter?

## 2026-04-30 — Finalized

- User judgment on D13 stomp-window framing: **Escalate impact in §14.** D12 (full-region replace) ships v1; surgical-edit upgrade stays in §15 Future Work.
- §14 Risks updated — drag-stomp escalated to MED likelihood, **HIGH** impact with explicit risk acceptance.
- Mechanical adversarial checks complete:
  - No decisions at INVESTIGATING / ASSUMED / DEFERRED.
  - All 1-way-door decisions (D8, D10, D26, D29, D31, D32) have evidence references.
  - Non-goals (NG1–NG6) all carry temporal tags.
  - Pre-mortem: highest-fragility load-bearing assumption is the sub-region multi-writer pattern (audit Finding 11 surfaced this; D32 + C-matrix verification mitigate).
- Cross-cutting threading sweep complete: error envelope (D21/D30), L1/L2/L3 defense (D10/D31), idempotency (D11), telemetry naming (preserved), substrate invariant (D2/D32) — all reflected in §6/§11/§16 STOP_IF.
- Resolution completeness gate: every FR1–FR14 row passes; collective end-to-end check passes (FRs together deliver realtime FM editing without dependency on §15 Future Work).
- Status set to **Approved**. Baseline commit unchanged at `c1c76cb7` (no code edits during spec session).
