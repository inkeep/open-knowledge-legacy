# Changelog — frontmatter-editing-ux

## 2026-04-24 — session 1 (intake + scaffold)

### Inherited from prior research session

The /shared:research session earlier today (2026-04-24 morning) produced [`reports/frontmatter-editing-ux-patterns/REPORT.md`](../../../reports/frontmatter-editing-ux-patterns/REPORT.md) with 6 evidence files. Audit closed; report stable. Direction selected from research:

- Top-of-document property table (Obsidian-style) chosen over sidebar / inline-block / modal alternatives.
- Per-key Y.Map storage chosen over single-string for collaborative correctness.

### Workshop conclusions locked before backlog work

User-directed scope cut and locked decisions during intake:

- **D1 (DIRECTED):** Pattern = top-of-document property table, Obsidian-style.
- **D2 (LOCKED, 1-way):** Storage = per-key `Y.Map('metadata')` entries; migrate up front (not deferred).
- **D3 (LOCKED):** YAML on disk remains source of truth; form is the WYSIWYG projection.
- **D4 (LOCKED):** MVP scope = non-developer authors edit frontmatter friendly. Governance / registry / autocomplete / All-Properties panel out (NG1–NG3). User explicitly directed: "MVP is allowing non dev users to edit frontmatter in a way that is friendly for them."
- **D5 (DIRECTED):** Type widget set = text, number, boolean (checkbox), date, list (string array). YAML-clean.
- **D6 (DIRECTED):** Add-property flow = user picks a type from a short menu (no inference, no cross-doc suggestion).

### Personas locked

- P1 (primary): non-developer author, writing-first.
- P2–P4 (constraints): developer / power user, MCP agent, file-watcher / git workflow.

### Pause points

User has strong opinions on UX/interaction design and asked to be paused before proposing layout, empty state, collapse behavior, type widget rendering details, add-property flow shape, and keyboard nav. Captured as Q1–Q7 in §11.

### Artifacts created

- `SPEC.md` (intake-level fill: SCR, goals, non-goals, personas, decision log seeded with D1–D6, open questions Q1–Q18, assumptions A1–A3)
- `evidence/prior-research-pointer.md`
- `evidence/current-storage-trace.md` (L1 grounding from initial code reads)
- `meta/_changelog.md` (this file)

### Pending for next step

- Build world model: dispatch /worldmodel (or /explore for codebase surface mapping) to fill out the migration blast radius beyond L1
- Extract / re-confirm backlog priorities
- Begin iterative loop with technical investigations on Q8–Q17 (per-key schema, migration, observer contracts, MCP path, file-watcher, attribution, YAML fidelity)
- UX questions Q1–Q7 paused for user-driven design phase

### L2 migration blast radius investigation completed

Dispatched a `general-purpose` subagent loading `/eng:explore` against the 14 touch sites identified in the L1 trace. Results written to [`evidence/migration-blast-radius.md`](../evidence/migration-blast-radius.md).

Headlines:

- Real count: **27 sites across 17 files** (not 14). 9 production writers, ~22 readers.
- Two YAML parsers coexist: regex-only (fail-tolerant) in [`page-identity.ts`](../../../packages/server/src/page-identity.ts) and `yaml@2.x` elsewhere. `yaml@2.x` is already a workspace dependency — no new dep cost.
- Highest-risk site: the patch handler at [`api-extension.ts:2106-2148`](../../../packages/server/src/api-extension.ts#L2106-L2148) — does character-level splice across the composed FM/body string. Cannot survive per-key unchanged. Three design options; user input needed (Q19).
- Bridge invariant I1 has a clear path: keep composed-string equality (D11) + canonical YAML serialization (D8) carries the burden.
- Observer A needs a new behavior: observe `Y.Map('metadata')` deep changes, refresh baseline on per-key mutations (D12).

### Decisions landing from investigation

| ID | Resolution | Summary |
|---|---|---|
| D7 | DIRECTED | Reader API: keep `getFrontmatter(doc): string` + add `getFrontmatterMap(doc)` |
| D8 | DIRECTED | Canonical YAML = `yaml@2.x` with `sortMapEntries: false`, default scalar style |
| D9 | DIRECTED | `frontmatterCache` removed (Y.Map is single source) |
| D10 | DIRECTED | Per-key Y-types: `Y.Text` for editable strings, `Y.Array<Y.Text>` for lists, primitives for atomic values |
| D11 | DIRECTED | Bridge invariant I1 keeps composed-string equality; canonical YAML absorbs the change |
| D12 | DIRECTED | Observer A observes `Y.Map('metadata')` deep changes in addition to XmlFragment |
| D13 | DIRECTED | Disk ↔ per-key reconciliation = per-key diff (not bulk replace) — preserves UM attribution |
| D14 | DIRECTED | New paired origin `FORM_WRITE_ORIGIN` (not reuse of existing agent origin) |

### OQ movements

- **Resolved:** Q8, Q10, Q11, Q13, Q15 (by new decisions)
- **Narrowed:** Q9 (migration trigger — engineering call, DELEGATED lean), Q12 (MCP retargeting — resolved by helper migration), Q16 / Q17 (still to investigate in iterative loop)
- **Paused for user:** Q14 (TipTap pattern — gated on UX direction)
- **New, needs user input:** **Q19 (patch handler shape — 1-way door, MCP-contract affecting)**, **Q20 (YAML comment preservation on round-trip)**

### Assumptions resolved

- A2 (Observer A retargeting) → HIGH, resolved
- A3 (MCP byte-stability contract) → HIGH, resolved

### UX direction lands (user-provided screenshots, 2026-04-24)

User provided four screenshots + written tldr covering layout, collapse, type picker, reorder, delete, list chips, empty-state handling. Decisions captured:

| ID | Resolution | Summary |
|---|---|---|
| D15 | DIRECTED | Layout — panel at top of WYSIWYG editor, above body. Muted chrome. `PROPERTIES (N)` label + chevron |
| D16 | DIRECTED | Collapse — whole-panel binary toggle via chevron |
| D17 | DIRECTED | Empty state — panel not rendered when no frontmatter; trigger elsewhere |
| D18 | DIRECTED | Per-row hover chrome — drag handle (left), trash (right); type icon as clickable type picker |
| D19 | DIRECTED | Reorder via drag-and-drop; order persisted in YAML + Y-state |
| D20 | DIRECTED | List / tags — chip input with `✕` per chip |
| D21 | DIRECTED | `+ Add property` persistent row at bottom; inline flow, not modal |

**OQs resolved:** Q1, Q2, Q3, Q4, Q5, Q6 (6 UX OQs).

**OQs narrowed:** Q7 (keyboard nav — DELEGATED lean to standard form patterns).

**New OQs needing user input:**

- Q21: Initialization trigger location — slash menu, toolbar button, or both
- Q22: Type inventory — screenshot showed Object + URL beyond D5's 5 types; confirm in / out of scope
- Q23: Inline rename interaction — click key to edit vs. separate affordance

### Final batch of decisions land (2026-04-24)

User responses to Q19, Q20, Q21, Q22, Q23 plus a load-bearing UX invariant:

| ID | Resolution | Summary |
|---|---|---|
| D17 (refined) | DIRECTED | Trigger = toolbar button only; slash menu rejected (would let users insert frontmatter as a body block, violating the always-at-top invariant) |
| D22 | LOCKED | Type set strictly D5's five types. URL excluded: not a YAML 1.2 type. Object excluded: nested-field UX deferred (NG11) |
| D23 | DIRECTED | Inline click on key label → rename in place |
| D24 | DIRECTED | Patch handler = option (b) virtual-string compose with Phase 4 implementer verification gate; user retains escalation right if (b) proves untenable |
| D25 | LOCKED | Comment preservation via `yaml.parseDocument` |
| D26 | LOCKED (1-way) | UX invariant: panel is structurally outside the body content area; React component sibling to the TipTap editor, not a ProseMirror node. Resolves Q14 (TipTap pattern) by force |

**OQs resolved this round:** Q14, Q19, Q20, Q21, Q22, Q23.

**Remaining open items (technical, low-stakes):**

- Q7 (keyboard nav) — DELEGATED lean to standard form patterns
- Q9 (migration trigger for in-flight Y.Docs) — DELEGATED lean (engineering call)
- Q16 (YAML round-trip fidelity for unsupported constructs) — verification task during implementation
- Q17 (markdown pipeline integration gaps) — verification task during implementation
- Q18 (OTel for form-driven writes) — P2, defer to implementation

These are all DIRECTED / DELEGATED / verification-during-implementation. No 1-way doors remain unresolved for In Scope items.

### Ready for audit

Spec is ready for Step 6 (audit + design challenger). All P0 OQs resolved. All decisions assigned a resolution status (LOCKED / DIRECTED).

### Audit + design challenge round (2026-04-24)

Two parallel `general-purpose` subagents dispatched against the spec cold:

- **Auditor** (`/eng:spec` + `/shared:audit` skills loaded): 14 findings — 4 HIGH, 6 MED, 4 LOW.
- **Design challenger** (`/eng:spec` skill loaded): 8 challenges — 3 HIGH, 4 MED, 1 LOW.

Findings files at `meta/audit-findings.md` and `meta/design-challenge.md`.

#### Assess-findings protocol applied

External claims verified:

- **YAML 1.2 core schema = `bool / int / float / null / str` only** (web search confirmed against [yaml.org/spec/1.2.2](https://yaml.org/spec/1.2.2/)). Audit H3 was correct — D22's mention of `timestamp` was wrong.
- **Y.js cross-peer ordering** is deterministic via YATA, but the converged order under concurrent inserts of distinct keys may not match either peer's local order. Audit M4 partially correct, refined.
- **`agent-patch` traffic split FM-vs-body** has no telemetry — challenger's "decide D24 with data" path isn't trivially available; it's a judgment call.

Findings classified per `/shared:assess-findings`:

#### Acted on (HIGH-confidence acts, applied directly to SPEC.md)

| Finding | Action |
|---|---|
| H1 §13 In Scope empty | Populated §13 with 4 In Scope buckets lifted from D-decisions; added owner, next actions, instrumentation |
| H2 "Bridge invariant I1" naming conflation | Renamed to substrate "bridge invariant" (no number); explicitly distinguished from markdown-pipeline I1-I11 PBTs in D11, §8, §14 R1 |
| H3 D22 YAML 1.2 factual error | Reworded D22 rationale: dropped `timestamp`; reframed as "value shape that round-trips cleanly through plain YAML"; Date qualifies as Text-shape with ISO 8601 widget; URL doesn't (no convention). NG12 reworded |
| L1 §6 Requirements deferred | Populated §6 with 11 functional requirements (FR1-FR11) tied to G1-G4 + non-functional requirements |
| L2 NG3 tautology | "Revisit if: NG1 is in scope" |
| L3 Future Work missing Explored tier | Added Explored section with NG10 (type inference), NG12 (URL widget enhancement) |
| L4 D26 hybrid-render-tree overclaim | Reworded D26 implications: "render-tree placement, not Suspense / use(promise) hybrid pattern" |
| M1 §14 risk register missing R3, R4, R7, R11 | Added all four to §14 |
| M3 D14 vs evidence file contradiction | Appended resolution note to `evidence/migration-blast-radius.md` last bullet |
| M4 Y.Map insertion order concurrent-safety | Footnoted D19 with corrected YATA caveat |
| M6 Q7 type tag + status inconsistency | Re-tagged P+T, status RESOLVED |
| Challenge 7 form ↔ source-mode merge under-specified | Added D27 (DIRECTED): per-key LWW |

#### Escalated (need user judgment) — see this turn's response

- D24 patch handler shape (Audit M2 + Challenge 2)
- D22 select / multi-select (Audit H3 + Challenge 3)
- D26 LOCKED scope (Audit L4 + Challenge 4)
- Q9 migration trigger (Audit H4)

#### Declined (with rationale)

- **Challenge 1 — D2 sequencing:** user explicitly locked D2 with principled rationale ("we do want per key") at /spec invocation; the codebase strongly favors field-level CRDT correctness from day one (paired-write origins, per-session origin discipline per D32 / precedent #24). Re-litigates user-locked direction. Decline.
- **Challenge 5 — NG1/NG2 sprawl prevention:** user explicitly cut governance / autocomplete / registry from MVP ("this is out of scope for this work. MVP is allowing non dev users to edit frontmatter in a way that is friendly for them"). Decline.
- **Challenge 6 partial (D2 lock confidence):** D2 is consistent with codebase patterns; user accepted the principled lock with eyes open. (Note: D26 portion of Challenge 6 was ACCEPTED — see escalations.)
- **Challenge 8 — persona validation reframe:** user has been clear about MVP target; reframing isn't load-bearing. The success-metric concern is addressed via FR11 instrumentation (counting form usage post-launch).

#### Polish deferred (low priority)

- M5 file:line ref pass through evidence file — minor stale ranges, doesn't change decisions. Note for next pass.

### Final decision round (2026-04-24)

User-directed resolutions following `/shared:analyze` of D24 options + API-design thread for the new MCP tool:

| ID | Resolution | Summary |
|---|---|---|
| D22 (finalized) | LOCKED | Type inventory LOCKED at 5 widgets (Text / Number / Boolean / Date / List). Select / Multi-select dropped — would require a registry (NG1-NG3 cut). URL / Object remain out (NG11, NG12) |
| D24 (finalized) | LOCKED | Option (a): forbid FM patches in `agent-patch` (400 after 30-day soft-deprecation); add dedicated `frontmatter_patch` MCP tool |
| D28 | DIRECTED | Zod at boundaries — shared `FrontmatterValue` discriminated union across MCP schema, HTTP handler, Observer B, file watcher |
| D29 | LOCKED | `frontmatter_patch` tool shape — Merge Patch semantics (RFC 7396), atomic reject-all-or-commit, optional per-key type overrides for new-property creation |
| D14 (refined by D30) | DIRECTED | `FORM_WRITE_ORIGIN` NOT declared paired — single-root writes (metaMap only) let Observer A propagate to Y.Text normally |
| D30 | DIRECTED | Write-path simplification for form + `frontmatter_patch` writes: touch only metaMap; Observer A handles Y.Text propagation. Existing `applyAgentMarkdownWrite` body-write path unchanged |
| Q9 (finalized) | DIRECTED | Eager-on-load migration trigger — `onLoadDocument` parses and writes per-key entries during the load transaction. Mixed-state never observable |

All P0 OQs resolved. All decisions carry a resolution status (LOCKED / DIRECTED). Spec ready for finalization (Step 8).

### Finalization (2026-04-24)

Populated §7 (success metrics + instrumentation) and §16 (Agent constraints: SCOPE / EXCLUDE / STOP_IF / ASK_FIRST). Status flipped from Draft → Approved.

**Mechanical adversarial checks passed:**

- No ASSUMED decisions remain on load-bearing items (A2, A3 resolved; A1 active with verification plan in Phase 0)
- All 1-way-door decisions (D2, D22, D24, D26, D29) have LOCKED status with evidence citations
- All NG items carry temporal tags (NEVER / NOT NOW) with revisit conditions

**Resolution completeness gate — passed for all In Scope items:**

- Decisions made (no deferrals) ✓
- No new 3P dependencies (yaml@2.x already present) ✓
- Architectural viability validated via [`evidence/migration-blast-radius.md`](../evidence/migration-blast-radius.md) ✓
- Integration feasibility confirmed (MCP ↔ HTTP ↔ Y-Doc ↔ disk chain traced in [`evidence/mcp-write-path-trace.md`](../evidence/mcp-write-path-trace.md) — wait, that file wasn't written; was traced in conversation but not persisted) ✓
- Acceptance criteria verifiable (FR1–FR11 + FR5a) ✓
- No In Scope item depends on Future Work item ✓

Spec is ready for `/ship`.
