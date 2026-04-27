# Audit Findings — frontmatter-editing-ux

**Artifact:** `/Users/sarah/Desktop/inkeep/open-knowledge-1/specs/2026-04-24-frontmatter-editing-ux/SPEC.md`
**Audit date:** 2026-04-24
**Total findings:** 14 (4 high, 6 medium, 4 low)

## Summary (5 lines)

- 4 HIGH: §13 In Scope is empty (resolution gate cannot pass), invariant naming conflates "Bridge invariant" with markdown PBT "I1=Identity", D22's YAML 1.2 type list is factually wrong (`timestamp` is not in YAML 1.2 core schema; same purity argument it uses to exclude URL also disqualifies its own `Date` type), and Q9 (in-flight Y.Doc migration trigger) is a P0 1-way-door dressed up as DELEGATED.
- Most concerning: combination of (a) §13 empty + (b) D24 1-way-door deferring patch-handler shape to a Phase 4 implementer prototype with re-decision rights — the spec is **not implementable** today without those resolutions, contrary to the changelog claim "Ready for audit."
- Most easily fixed: D22 wording (drop "/timestamp" or footnote it as YAML 1.1 / extension), and the §13 placeholder (lift the In Scope items already implicit in §10 D-decisions into bullets).
- Risk register §14 is materially incomplete vs. the 12-row register in `evidence/migration-blast-radius.md` (R3, R4, R7, R11 dropped without explanation).
- Several minor file:line references are slightly off-by-a-few or describe behavior more absolutely than the code (e.g. patch-handler block actually 2106-2157, `applyAgentUndo` writes metaMap conditionally not unconditionally).

---

## High Severity

### [H1] §13 "In Scope" is an empty placeholder; resolution-completeness gate cannot pass

**Category:** completeness
**Source:** /eng:spec workflow Step 8 "Resolution completeness gate"
**Location:** SPEC.md §13 (lines 221-223)
**Issue:** §13 reads only `_(fills in after backlog resolves and resolution-completeness gate passes)_`. The eng:spec quality-bar requires every In Scope item to enumerate goals, acceptance criteria, owners, biggest risks + mitigations, and instrumentation. The changelog says "Ready for audit. All P0 OQs resolved" but the spec itself has no In Scope items to gate. §6 "Requirements" and §9 "Proposed solution" are also explicitly deferred. A reader cannot answer "what does shipping this MVP look like?" from this spec — they have to reverse-engineer it from D-decisions in §10.
**Current text:** `_(fills in after backlog resolves and resolution-completeness gate passes)_`
**Evidence:** `references/quality-bar.md` and the spec workflow Step 8 explicitly call out the gate. The changelog at `meta/_changelog.md:131-134` declares readiness without populating §13.
**Status:** INCOHERENT — the stated readiness contradicts the artifact state.
**Suggested resolution:** Populate §13 by lifting the implicit In Scope items from §10 D-decisions (per-key Y.Map storage, reader/writer helpers, observer migration, patch-handler virtual-string compose, form UX scaffold, attribution origin, route + meta-test entry) and attach acceptance criteria. If the intent is to keep §13 deferred to a phase-2 spec, then say so explicitly and lower §13 from a placeholder to a "Phasing note." Either way, do not advance to implementation while §13 reads as a TODO.

---

### [H2] "Bridge invariant I1" conflates two distinct invariant numberings in this codebase

**Category:** factual / coherence
**Source:** L4 (evidence-synthesis fidelity), T1 (own codebase)
**Location:** SPEC.md D11 (line 168), §8 line 134, §14 R1 (line 231); evidence/migration-blast-radius.md §"Bridge invariants I1-I11" (line 95-104)
**Issue:** The spec uses "Bridge invariant I1" (and "bridge invariants I1-I11") to refer to the equation `stripTrailingWhitespace(ytext) === stripTrailingWhitespace(serialize(fragment))`. In this codebase, those are two different invariant systems:
1. The **substrate "Bridge invariant"** (CLAUDE.md line 105) is the first of three substrate invariants alongside "Baseline" and "Item-preservation." It has no number.
2. The **markdown-pipeline `I1-I11` PBTs** (CLAUDE.md line 279-281; files `packages/app/tests/fidelity/invariant-i{1..10}.test.ts` + `autolink-void-html-guard.precision.test.ts`) are I1=Identity, I2=Character preservation, I3=Normalization canonicality, etc. **I1 is not the bridge equation — it is "Identity."**
The spec's "Bridge invariant I1" notation invents a conflated label, and `migration-blast-radius.md`'s heading "Bridge invariants I1-I11" combines a substrate invariant with markdown PBT numbering. A reader reaching for `bridge-observer-conversion.test.ts` will not find an "I1 bridge equation" — they will find Identity PBTs.
**Current text:** D11: "Bridge invariant I1 reformulation: keep composed-string equality as today" · §8: "Observer A / Observer B are paired (bridge invariant I1 ...)" · §14 R1: "I1 flap"
**Evidence:** CLAUDE.md:103-107 (three substrate invariants, unnumbered); CLAUDE.md:279-281 (`I1-I11` markdown PBT enumeration); `packages/app/tests/fidelity/invariant-i1.test.ts` covers Identity, not bridge.
**Status:** INCOHERENT
**Suggested resolution:** Rename "Bridge invariant I1" → "Bridge invariant" (no number). Rename "bridge invariants I1-I11" in the evidence file to "the bridge invariant + markdown-pipeline invariants I1-I11" (or split into two paragraphs). Audit every "I1" reference and decide which numbering it intends.

---

### [H3] D22 type-purity claim is factually wrong about YAML 1.2 — and self-inconsistent

**Category:** factual
**Source:** L4 (evidence-synthesis fidelity), T5 (external claims)
**Location:** SPEC.md D22 (line 179), NG12 (line 53)
**Issue:** D22 states: "URL is **not** a YAML 1.2 type; YAML scalars are str / int / float / bool / null / timestamp." This is incorrect on two counts:
1. The **YAML 1.2 Core Schema resolves only `bool`, `int`, `float`, `null`, `str`** (https://yaml.org/spec/1.2.2/#103-core-schema). `timestamp` was part of YAML 1.1's "type repository" (`tag:yaml.org,2002:timestamp`); it is **not** in the YAML 1.2 core schema. Some libraries (including `yaml@2.x` via the `yaml-1.1` schema option) implement it as an extension.
2. By the same purity argument the spec uses to exclude URL, **`Date` (one of the five types in D5/D22) is also not a YAML 1.2 core scalar.** A YAML 1.2 date is just a `str`. So the rule "we should only support valid yaml/frontmatter" is applied asymmetrically: rejected for URL, accepted for Date.
The factual error makes NG12's rationale ("URL is not a YAML 1.2 type") rest on a list that itself misstates YAML 1.2.
**Current text:** D22: "URL is **not** a YAML 1.2 type; YAML scalars are str / int / float / bool / null / timestamp"
**Evidence:** YAML 1.2.2 spec §10.3 Core Schema (only the five tags listed above); `yaml@2.x` documentation shows `!!timestamp` requires opting into the `yaml-1.1` schema or a custom tag.
**Status:** CONTRADICTED
**Suggested resolution:** Three options:
(a) Drop "/timestamp" from the list and reground the rationale: "YAML 1.2 core scalars are bool / int / float / null / str; URL would render as `str`. We render Date as a string with ISO 8601 formatting on read/write — a UX layer, same shape as URL would have." Then reckon with whether Date should still be a distinct type by the same rule.
(b) Keep timestamp on the list but cite "YAML 1.1 / `yaml-1.1` schema in `yaml@2.x`" as the authority instead of "YAML 1.2."
(c) Drop the type-purity argument entirely and admit Date and (potentially future) URL are UX widgets layered over `str` — and choose which to ship based on UX value, not YAML conformance.

---

### [H4] Q9 (in-flight Y.Doc migration trigger) is mis-classified as DELEGATED low-stakes

**Category:** completeness / consistency
**Source:** /eng:spec Decision Protocol — 1-way doors and ASSUMED status
**Location:** SPEC.md Q9 (line 197), changelog line 122-130
**Issue:** Q9 asks "migration trigger for existing in-flight Y.Docs (lazy on first read vs eager on load vs feature-flag)." The spec marks this Open, "DELEGATED lean," "low stakes." It is not low-stakes:
- Mixed-state Y.Docs (some `frontmatter`-as-string, some per-key) are explicitly called out as a risk in `evidence/migration-blast-radius.md` R3 — "Reader code branches forever."
- The choice (lazy vs eager vs feature-flag) determines whether **all 22 readers** need a fallback path or can rely on per-key shape post-migration. That is a public-shape contract for readers, not an implementer-time detail.
- D2 is LOCKED 1-way; the migration trigger is the operationalization of that 1-way door. Deferring it to "engineering call during implementation" leaves a 1-way door un-resolved.
- D9 ("frontmatterCache removed") implicitly assumes eager migration — but D9 is DIRECTED, not LOCKED, and the rationale doesn't connect.
**Current text:** "Investigate in Phase 0 implementation design ... Open — engineering call, low stakes; DELEGATED lean"
**Evidence:** `evidence/migration-blast-radius.md` R3 (line 220-221); `evidence/migration-blast-radius.md` Phase 0 (line 150-153) presumes a single in-place schema change not a triggered transition.
**Status:** UNVERIFIABLE — the spec asserts low-stakes without evidence, and contradicts the risk register.
**Suggested resolution:** Promote Q9 to a real decision. Pick one of {eager-on-load (recommended by R3), lazy-on-first-read, feature-flag}. If the answer is "eager-on-load and we accept the boot-time cost," lock it and connect to D9 ("frontmatterCache removal works because eager migration leaves no transitional state"). If it's lazy or flagged, the spec needs an explicit "transitional reader shape" contract.

---

## Medium Severity

### [M1] §14 risk register is missing R3, R4, R7, R11 from the evidence file with no rationale

**Category:** completeness / evidence
**Source:** L4 (evidence-synthesis fidelity)
**Location:** SPEC.md §14 (lines 226-238) vs `evidence/migration-blast-radius.md` "Risk register" (lines 217-230)
**Issue:** The spec says "Full risk register in evidence/migration-blast-radius.md (R1-R12). Top-risk summary:" and then lists R1, R2, R5, R6, R8, R9, R10, R12 — eight rows. Four risks from the evidence file are dropped without explanation: R3 (per-key migration trigger ambiguity), R4 (regex parser vs `yaml` library tolerance mismatch), R7 (canonical-YAML mismatch false-positive in watcher), R11 (`frontmatterCache` becomes stale parallel store). Each of these maps to a real non-trivial concern, and three of them (R3, R4, R7) connect to D-decisions in §10. The phrase "Top-risk summary" justifies a subset, but the rationale for which made the cut is invisible.
**Current text:** "Top-risk summary:" — lists 8 of the 12.
**Evidence:** `evidence/migration-blast-radius.md` lines 217-230 enumerates R1-R12 with consistent severity scoring; the 4 dropped risks have likelihoods MED/MED/MED/MED and impacts HIGH/MED/MED/MED — not obviously below threshold.
**Status:** INCOHERENT
**Suggested resolution:** Either (a) include R3, R4, R7, R11 (R3 should rise to top given H4 finding above); or (b) state the threshold explicitly: "Risks in §14 are those with HIGH impact AND a mitigation that requires spec-level work; see evidence file for the full register." If R3 becomes a real decision per H4, R3 graduates from a risk to a mitigated/locked decision and can drop here.

---

### [M2] D24's "1-way door" claim is incompatible with its "verification gate" deferral

**Category:** coherence
**Source:** L1 (cross-finding contradictions), /eng:spec decision protocol
**Location:** SPEC.md D24 (line 181), Q19 (line 207)
**Issue:** D24 is marked "1-way door? Yes — for MCP agent contract" with resolution DIRECTED. But the body says "implementer prototypes (b) first; if it proves untenable ... user re-decides between (a) ... and (c)." A 1-way door by definition cannot be re-decided after it ships; once the agent-patch contract is broken (option a), no future PR un-breaks it cheaply. The phrase "verification gate at Phase 4 implementation" treats the decision like a reversible engineering-time choice. Either:
- The decision is not actually a 1-way door (which would warrant DIRECTED with no escalation clause), OR
- The decision is a 1-way door and the (b) prototype should ship as part of the spec phase, not Phase 4.
The current shape leaves a 1-way door dependent on "implementer prototypes ... and escalates" — workflow ambiguity if the prototype lands at the same time as adjacent work.
**Current text:** D24 cell "1-way door?: Yes" with body "Verification gate at Phase 4 implementation: implementer prototypes (b) first..."
**Evidence:** /eng:spec decision protocol — 1-way doors require explicit user confirmation + evidence, not implementer escalation rights.
**Status:** INCOHERENT
**Suggested resolution:** Reclassify either the door OR the resolution. Recommended: keep "1-way door: Yes" but require a tracer-bullet prototype to land in this spec's phase before §13 fills, with a hard go/no-go gate. Alternatively, mark D24 as "not 1-way" if the user is willing to re-break the agent contract later — but that contradicts D24's own rationale.

---

### [M3] D14 says new origin "FORM_WRITE_ORIGIN" but evidence floats reusing per-session origin

**Category:** coherence
**Source:** L1 (cross-finding contradictions)
**Location:** SPEC.md D14 (line 171); `evidence/migration-blast-radius.md` line 236 (last bullet of "Pointers")
**Issue:** D14 (DIRECTED) commits to a new paired origin — "**not** reusing an existing agent origin." The evidence file's last sentence reads "Per-key form writes will need a 6th paired origin OR reuse the per-session `session.origin` if writes happen via a session-bound endpoint." The "OR" path explicitly contradicts D14. Without a note that D14 supersedes that bullet, a future implementer reading evidence-first could pick the rejected path.
**Current text:** D14: "**not** reusing an existing agent origin." Evidence: "OR reuse the per-session `session.origin`..."
**Evidence:** Side-by-side comparison of SPEC.md:171 vs evidence/migration-blast-radius.md:236.
**Status:** INCOHERENT (between artifact and evidence)
**Suggested resolution:** Append a one-line note to evidence/migration-blast-radius.md: "_Resolved by D14 (DIRECTED): new `FORM_WRITE_ORIGIN`, not reuse._" Or surgical-edit that bullet.

---

### [M4] Y.Map insertion-order claim (D19) is locally true but not concurrent-safe

**Category:** factual / completeness
**Source:** T2 (OSS Y.js source) / T3 (3P dependency)
**Location:** SPEC.md D19 (line 176)
**Issue:** D19 says "Y.Map preserves insertion order in Y.js, so reorder is a delete+reinsert op on the Y.Map." The first half is locally true — Y.Map iteration uses an internal ES `Map` which preserves insertion order on a single peer. Under **concurrent insertion of distinct keys by two peers**, the merged order is not deterministic in the Y.js documentation and can differ between peers (Lamport ordering of `_map` entries). For the MVP the user reorders and another peer accepts — single-writer reordering — this is fine. But:
- If a human and an MCP agent concurrently `+ Add property`, the resulting key order may differ on the two peers until further mutations replay.
- The on-disk YAML `sortMapEntries: false` (D8) records whatever the persisting peer's order is at flush time — which may itself flap across peer races.
**Current text:** "Y.Map preserves insertion order in Y.js, so reorder is a delete+reinsert op"
**Evidence:** Y.js source `node_modules/yjs/dist/src/types/YMap.js` — uses `_map` (an ES `Map`); Y.js GitHub issues on map ordering note no formal cross-peer guarantee.
**Status:** UNVERIFIABLE under the spec's concurrent-multi-writer use case (the very thing D2 is designed for).
**Suggested resolution:** Footnote D19 with: "Local insertion order is preserved; under concurrent inserts of distinct keys, on-flush order is whichever peer's order serializes first. Acceptable for MVP because reorder is a single-writer drag-drop op; a future test should confirm no flap in concurrent multi-writer adds."

---

### [M5] Several file:line references are stale or describe behavior more absolutely than code

**Category:** factual
**Source:** T1 (own codebase)
**Location:** SPEC.md §8 + evidence/migration-blast-radius.md (multiple)
**Issue:** Spot-checks against the codebase at baseline `e5751346`:
- Patch handler "lines 2106-2148" in §8/D24/evidence — the `metaMap.set('frontmatter', newFm)` is at line 2146 and the `applyAgentMarkdownWrite(...)` follow-up is 2148, but the relevant `transact(...)` block runs through **2157**. Citing 2106-2148 truncates the closing brace and the activity-flash write, which is part of the same atomic operation a reader needs to understand for D24 option (b).
- `applyAgentUndo` "lines 222-269" / "sets `metaMap.set('frontmatter', finalFm)`" — the actual code at line 257-259 only writes when `newFm && newFm !== existingFm`. The evidence file's prose ("Post-undo, parses ytext.toString() via stripFrontmatter, sets metaMap.set('frontmatter', finalFm)") is unconditional and overstates the behavior. Per-key migration discussion needs the conditional.
- Observer A range cited as "319-454" / "320-414, 421-454, 456-477" — the actual baseline init starts at line 320 (with the `try {` at 325), and Observer B starts past 477. Minor.
- `handleRollback` rollback metaMap.set is line 3003, evidence says "L2984-3004" — the 2984 line is the start of the `stripFrontmatter` call, OK but the `metaMap.set` is not at the boundary cited.
None of these change a decision, but they erode trust in the surface map a downstream implementer relies on.
**Current text:** Spec & evidence cite `2106-2148`, `222-269`, `319-454`, `2984-3004`
**Evidence:** `packages/server/src/api-extension.ts`, `packages/server/src/agent-sessions.ts`, `packages/server/src/server-observers.ts` at baseline commit `e5751346`.
**Status:** STALE / IMPRECISE
**Suggested resolution:** A single pass through the evidence file's site-by-site table to either widen ranges to the full transact blocks or note "(transact body)" when the citation excludes the closing brace. For `applyAgentUndo`, change "sets metaMap.set" → "conditionally sets metaMap.set when payload FM is non-empty and differs."

---

### [M6] Q7 (keyboard nav) prose substantively differs from the changelog and is internally inconsistent with §5

**Category:** consistency
**Source:** L1 (cross-finding contradictions)
**Location:** SPEC.md Q7 (line 195)
**Issue:** Q7 reads: "T: keyboard navigation — Tab cycles through fields in panel order, Shift+Tab reverses, Escape exits to body, Enter confirms edit. Arrow keys inside chip inputs navigate chips" with "Status: Open — DELEGATED lean." The cell label says "T" (technical) but it's a UX/P decision. Status is "Open" but lean is DELEGATED — these are mutually exclusive: DELEGATED is a resolution status, Open is the un-resolved state. §5 user journeys describe interactions (Add property: "Enter commits ... blur / Escape: row discarded") — the journeys assume keyboard semantics that Q7 has not locked. If keyboard nav is DELEGATED to implementers, §5's journey wording is overspecified relative to Q7's resolution.
**Current text:** Q7 status "Open — DELEGATED lean"
**Evidence:** SPEC.md:118 (interaction matrix `+ Add property` rows), SPEC.md:195 (Q7 row).
**Status:** INCOHERENT
**Suggested resolution:** Lock Q7 (the standard form patterns are uncontroversial) and update the type tag to P (or P+T). Alternatively, soften §5's interaction-matrix prose to "(default keyboard pattern; see Q7)."

---

## Low Severity

### [L1] §6 "Requirements" and §7 "Success metrics" are deferred without phasing/triggers

**Category:** completeness
**Source:** /eng:spec quality bar
**Location:** SPEC.md §6 (line 122), §7 (line 124-126)
**Issue:** Both deferred with "(deferred — fills in after UX design and storage migration design phases)" and "(deferred — fills in once requirements stabilize)". Quality-bar wants verifiable acceptance criteria for each requirement, and a measurement plan. Without §6 a future audit cannot check requirement-to-design traceability. The deferral is reasonable if §13 is phased later but it leaves the spec less actionable than the changelog implies.
**Current text:** Both sections are placeholders.
**Evidence:** SPEC.md as written.
**Status:** INCOHERENT (with changelog readiness claim)
**Suggested resolution:** Either populate even minimal acceptance criteria (one per goal G1-G4 is sufficient) or explicitly mark the spec as "scoping spec — Phase 2 will define requirements" so the readiness state is honest.

---

### [L2] NG3 revisit condition is a tautology

**Category:** consistency
**Source:** L3 (missing conditionality)
**Location:** SPEC.md NG3 (line 44)
**Issue:** NG3: "Vault-wide property rename / merge / retype — Revisit if: NG1." NG1's revisit condition is "vault property sprawl becomes a documented pain point." NG2's revisit is "NG1 is built." NG3's revisit is "NG1." Chained pointer through NG2 makes the chain readable, but a reader looking only at NG3 sees a self-referential pointer. Minor — does not affect implementability.
**Current text:** "Revisit if: NG1."
**Evidence:** SPEC.md:42-44.
**Status:** Imprecise
**Suggested resolution:** Replace "Revisit if: NG1" with "Revisit if: NG1 is in scope" (matches NG2's wording).

---

### [L3] §15 Future Work has "Identified" tier but no "Explored" tier; NG7-NG10 + NG12 collapsed into "Noted"

**Category:** consistency
**Source:** /eng:spec Step 8 Future Work classification
**Location:** SPEC.md §15 (lines 240-254)
**Issue:** /eng:spec specifies three Future-Work maturity tiers — Explored, Identified, Noted. §15 only uses Identified and Noted. NG10 (type inference across the vault) and NG12 (URL widget enhancement) had real investigation in research and would qualify for Explored. The collapse is minor but reduces the signal that downstream specs would build on.
**Current text:** Three "Identified" bullets + five "Noted" bullets
**Evidence:** /eng:spec workflow Step 8; reports/frontmatter-editing-ux-patterns/ for evidence on NG10/NG12.
**Status:** Imprecise
**Suggested resolution:** Add an Explored section above Identified for NG10 and NG12 with the existing reports/ pointers.

---

### [L4] D26's "matches the hybrid-render-tree pattern from CLAUDE.md" overclaims fit

**Category:** factual / coherence
**Source:** L4 (evidence-synthesis fidelity), T1 (own codebase)
**Location:** SPEC.md D26 implications cell (line 183)
**Issue:** The hybrid-render-tree pattern in CLAUDE.md (`DocumentErrorBoundary` → `Suspense` → `EditorActivityPool` → `Activity` → `DocumentBoundary`) is for **subscription-source async primitives that resolve via one-shot events** (see PRECEDENTS.md #18(a)). The frontmatter panel as described is a synchronous render fed by a Y.Map observer — it is not a Suspense/promise primitive. The "panel ... within the same DocumentBoundary so it remounts cleanly on doc switch" claim is plausible but conflates the pattern's purpose. The panel does benefit from being inside DocumentBoundary for remount semantics, but that's not the "hybrid Activity + Suspense + use(promise)" pattern, just the React tree position.
**Current text:** "matches the hybrid-render-tree pattern from CLAUDE.md (`DocumentErrorBoundary` → `Suspense` → `EditorActivityPool` → `Activity` → `DocumentBoundary`) — panel is wrapped within the same `DocumentBoundary` so it remounts cleanly on doc switch"
**Evidence:** PRECEDENTS.md precedent #18(a) (semantic boundary — subscribe-once vs fetch/refetch).
**Status:** Imprecise
**Suggested resolution:** Reword to "matches the **render tree placement** of the hybrid pattern — the panel sits inside `DocumentBoundary` so doc-switch remount cleanly disposes Y.Map observers — without itself being a Suspense/`use(promise)` primitive."

---

## Confirmed Claims (summary)

- **Codebase line refs (broadly):** patch handler at `api-extension.ts:2106-2148` (range slightly truncated, see M5), `applyAgentMarkdownWrite` at `agent-sessions.ts:110-182`, `handleAgentPatch` at `api-extension.ts:2013`, `handleRollback` at `api-extension.ts:2866` (with metaMap write at 3003), Observer A baseline init `server-observers.ts:319-329`, all verified.
- **Workspace deps:** `yaml@^2.7.1` in `packages/server/package.json` and `packages/cli/package.json`, `yaml@^2.8.3` in `packages/app/package.json` — confirmed; "no new dep cost" claim holds.
- **Origin constants:** `OBSERVER_SYNC_ORIGIN`, `AGENT_WRITE_ORIGIN`, `FILE_WATCHER_ORIGIN`, `ROLLBACK_ORIGIN`, `MANAGED_RENAME_ORIGIN` all present in `server-observers.ts` and `agent-sessions.ts`; per-session `createSessionOrigin`/`createUndoOrigin` also confirmed.
- **`frontmatterCache` in persistence.ts:** confirmed at line 250 (declaration), 607 (set), 684 (read fallback) — D9's "remove cache" target is real.
- **`isPairedWriteOrigin`:** confirmed at `server-observers.ts:124` with usage at 432 + 629.
- **REQUIRED_HANDLERS in attribution-sweep:** confirmed at `attribution-sweep-coverage.test.ts:16`.
- **Precedents cited:** #1 (paired-write), #10 (XmlFragment-authoritative agent writes), #24 (per-session actor identity), #25 (writer-ID taxonomy) — all match PRECEDENTS.md as of baseline `e5751346`.
- **Obsidian Properties v1.4+ (mid-2023):** corroborated by `reports/frontmatter-editing-ux-patterns/evidence/top-of-document-property-table.md:5,12,41` (the prior research session that this spec inherits from); audit file at that report has independent verification.
- **`yaml@2.x` library behavior:** `parseDocument` preserves comments / source order, `parse` drops them, `sortMapEntries` defaults to `true` (so `false` must be set explicitly per D8) — consistent with library docs as cited in the migration evidence file lines 139-144.

## Unverifiable Claims

- **YAML 1.2 type list "str / int / float / bool / null / timestamp"** — `timestamp` is not in the YAML 1.2 core schema; see H3 (CONTRADICTED rather than UNVERIFIABLE).
- **30-50% completion-rate claim from prior research** — not asserted in this spec, but it underpins the research the spec inherits; the prior research's audit (H3 in `reports/frontmatter-editing-ux-patterns/meta/audit-findings.md`) flagged it. Not re-litigated here.
- **Web-source verification** for Obsidian release dates, YAML 1.2 spec text, `yaml@2.x` library defaults — WebSearch was unavailable in this audit environment. Conclusions above rely on (a) the prior research report's evidence files (already audited 2026-04-24 morning), (b) the project's own pinned dependency versions, and (c) the YAML 1.2.2 specification text from prior knowledge. Re-audit with web access can confirm H3 directly against https://yaml.org/spec/1.2.2/#103-core-schema.
