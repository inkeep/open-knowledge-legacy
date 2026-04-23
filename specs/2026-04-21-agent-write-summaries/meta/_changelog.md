# Changelog — agent-write-summaries

## 2026-04-21 — session 1 (workshop + intake + scaffold)

### Workshop conclusions locked

Six design decisions resolved during interactive workshop before /spec invocation:

- D1: Storage shape — additive `summariesByDoc?: Record<string, string[]>` on existing `ok-contributors:` JSON line (no v-bump per [[precedent#9]])
- D2: Coalescing — keep existing 15-30s L2 debounce; multiple writes coalesce to multi-bullet array
- D3: Optional with strong tool-description nudge; M1 metric drives required/optional revisit
- D4: All four MCP write tools accept `summary` (`write_document`, `edit_document`, `rename_document`, `rollback_to_version`)
- D5: Validation — accept + truncate at API boundary (50 chars + `…`); response includes `truncatedFrom` hint
- D6: Rendering — bullet list per row; falls back to doc-list when no summaries

### Intake artifacts

- SCR problem statement drafted (§1)
- 5 stress-test probes run (all pass; demand=N=1 self-reported, narrowest wedge ≈ locked design, future-fit positive)
- Personas drafted (P1 user, P2 agent, P3 future analytics consumer)
- 9 non-goals classified with temporal tags (NEVER × 3, NOT NOW × 4, NOT UNLESS × 2)

### Scaffold

- Created `specs/2026-04-21-agent-write-summaries/{evidence,meta}/`
- Stamped baseline commit `91ae79c4` in SPEC.md
- Created `SPEC.md` from template, populated workshop conclusions as DIRECTED/LOCKED decisions
- Initial Open Questions backlog: 10 items (8 self-resolvable after light investigation, 2 needing user input — Q3 mixed-rendering, Q4 single-string-vs-array tool param)

### Code investigation findings (persisted to evidence/)

- `handleAgentWrite` + `handleAgentWriteMd` + `handleAgentPatch` all call `recordContributor` after the transaction → straightforward summary plumbing
- `handleRollback` (api-extension.ts:2129) does NOT call `recordContributor` → Q1 needs decision on plumbing path
- `handleRename` (api-extension.ts:2657) does NOT call `recordContributor` → Q2 same situation
- `extractAgentIdentity` is the shared helper across the three write endpoints; natural place to extend with summary extraction
- Existing `formatContributors` includes the deprecated non-snapshot variant; new code lands on `formatContributorsFrom` (snapshot-based, race-free)

### Worldmodel dispatch

- General-purpose subagent loaded `/eng:worldmodel` for broader landscape investigation (adjacent surfaces, prior art, cross-cutting concerns, prior research). Running async; results integrate into next iteration.

### Pending for next session

- Worldmodel results integration
- Q1/Q2 decisions (rollback/rename attribution plumbing)
- Q3/Q4 user-judgment decisions
- Self-resolve Q5/Q6/Q9/Q10
- Decision Log status finalization (DIRECTED → LOCKED where appropriate)
- Audit + assess-findings + verify+finalize phases

## 2026-04-21 — session 1, turn 2 (worldmodel landed + cascade)

### Worldmodel synthesis persisted

- Created `evidence/worldmodel-synthesis.md` capturing 9 high-value findings (F1-F9).
- Key insights beyond the workshop:
  - **F1**: `exec` enrichment auto-carries summaries via existing `parseContributors` call in `shadow-log.ts:121` — agents reading prior history become an immediate consumer (P3 promotes from "future" to "immediate").
  - **F2**: Existing `ActivityEntry.description` field is written-but-not-read; recommend decoupling from `summariesByDoc` for v1 (NG10).
  - **F3**: `saveVersion` does NOT carry contributor lines into project-git; summaries are shadow-local (NG11).
  - **F4**: V0-14 `applyAgentUndo` forward-compat lock added to STOP\_IF.
  - **F5**: Cluster A activity sidebar (in-flight in `specs/2026-04-21-multi-agent-presence/`) is the natural future consumer; design symmetric to enable.
  - **F7**: PII/civility hint for tool descriptions (cheap insurance, FR15).

### Silent cascades to SPEC.md

- **§4 P3** updated — bumped from "future analytics consumer" to immediate "agent-to-agent narrative chaining" reader.
- **§3 NG10** added — don't unify with `ActivityEntry.description` channel in v1.
- **§3 NG11** added — don't carry summaries to project-git via `saveVersion` in v1.
- **§6 FR14** added — verify summaries appear in `exec` enrichment output.
- **§6 FR15** added — tool descriptions include PII/secrets hint.
- **§10 D12** added — `exec` enrichment carryover (DIRECTED, no opt-out).
- **§10 D13** added — `ActivityEntry.description` decoupled (DIRECTED).
- **§10 D14** added — PII/secrets hint required (DIRECTED, drives FR15).
- **§15 Future Work (Identified)** — added Cluster A activity sidebar consumer + `get_history` MCP first-class exposure.
- **§16 STOP\_IF** — added V0-14 forward-compat lock.

### No new user-judgment decisions surfaced

Worldmodel raised candidate decisions (D-ACT, D-EXEC, D-PII) but each could be self-resolved with strong recommendation + cascade. None elevate to load-bearing user-judgment threshold. D1/D2/D3 from prior batch remain pending user response.

### Pending

- User input on D1 (rename/rollback attribution plumbing), D2 (mixed-render UX), D3 (single-string vs array tool param)
- Implicit confirmation on Q5/Q6/Q9/Q10 self-resolutions
- Then proceed to backlog finalization → audit phase

## 2026-04-21 — session 1, turn 3 (decisions resolved)

User accepted recommendations for D1/D2/D3 + implicit accept on Q5/Q6/Q9/Q10. Cascaded as D15-D21.

### New Decision Log entries (D15-D21)

- **D15** LOCKED — `rename_document` and `rollback_to_version` MCP tools gain agent identity passthrough; server handlers call `extractAgentIdentity` + `recordContributor(primaryDocName, ..., summary ?? default)`. Primary doc only — backlink side-effects stay anonymous.
- **D16** LOCKED — TimelinePanel mixed-render: bullets enrich, doc-list line ALWAYS shown.
- **D17** LOCKED 1-way door — MCP `summary` param is single string, not array.
- **D18** DIRECTED — no storage cap; FR13 visual cap optional.
- **D19** DIRECTED — legacy `/api/agent-write` accepts summary.
- **D20** DIRECTED — `truncatedFrom` only set when input > 50.
- **D21** DIRECTED — Zod 200 + API 50 layered defense.

### Cascades to SPEC.md

- §6 FR2 amended — `truncatedFrom` semantics (D20)
- §6 FR7 amended — mixed-render explicit (D16)
- §6 FR9 amended — primary-doc-only attribution for rename (D15)
- §10 D15-D21 added to Decision Log
- §11 OQ status amendment block added below table — all P0 OQs closed
- §16 SCOPE — rename/rollback MCP tools must add agent identity passthrough (D15)
- §16 SCOPE — server handlers `handleRename` + `handleRollback` must call `extractAgentIdentity` + `recordContributor` (D15)

### Backlog state

All P0 OQs closed. Remaining items:

- Q7 closed (deferred to NG4)
- Q8 closed (deferred — post-ship measurement)

### Completeness re-sweep — new items unlocked?

Walking the world model again with D15-D21 in place:

- D15 expansion of rename/rollback identity surface — **does this unlock new questions?**
  - Sub-thread: should `/api/rename` response shape grow a `summary: { value, truncatedFrom? }` field like the other write endpoints? **Yes for symmetry** — append to FR2 acceptance, no new decision needed (cascade of D15 + D21).
  - Sub-thread: rename mutates many docs; does the contributor entry's `docs:` set include the renamed doc only or all touched docs? **Renamed doc only per D15** (already documented); side-effect docs stay anonymous. Documented.
- D16 mixed-render — **any cascades?** The doc-list rendering already exists in TimelinePanel.tsx:256-264; FR7 amendment encodes the new behavior. No new requirements.
- D17 single string — **any cascades?** Tool API shape locked; no new requirements.

No new P0 OQs surfaced. Backlog is stable.

### Pending

- Run audit + design-challenger subprocesses (mandatory per /spec workflow)
- Then assess findings, route, present to user
- Then verify + finalize

## 2026-04-21 — session 1, turn 4 (audit + design-challenge complete; assess-findings applied)

### Subprocess outputs

- Auditor (cold reader, /eng:audit + /eng:spec): 13 findings (5 H, 5 M, 3 L). Written to `meta/audit-findings.md`.
- Design challenger (cold reader, /eng:spec + design-challenge-protocol): 9 findings (3 H, 4 M, 2 L). Written to `meta/design-challenge.md`.

### Assess-findings evaluation per /eng:assess-findings protocol

**HIGH-confidence verifications performed:**

- `PRECEDENTS.md:22` confirms precedent #9 is ProseMirror schema only (Auditor H1 + Challenger F8 converged) → CITATION INCORRECT, principle still sound.
- `TiptapEditor.tsx:319` confirmed reading `description` for substring heuristic (Auditor M1) → NG10 wording was inaccurate.
- `EditorPane.tsx:155` confirmed posting to `/api/rollback` with NO agent identity (Auditor H2 + Challenger F3 converged) → D15 ships a bug for human Restore button.

### Pure corrections applied silently to SPEC.md

| Finding                                         | Resolution applied                                                                                                                                               |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1 + F8 (precedent #9 misapplication, 10 sites) | Reframed as "additive parsing per `parseContributors` tolerance + `ok-checkpoint-v1:` sibling-line prior art for v-bump path"                                    |
| H3 (§13 FR1-FR12 → FR1-FR15)                    | Updated In Scope requirement reference; FR13 explicit defer noted; NG range updated to NG1-NG11                                                                  |
| H5 (M1 nonexistent counter)                     | §16 SCOPE expanded — adds `agentWriteCalls`, `summariesProvided`, `summariesTruncated` counters to `metrics.ts` (all three are new)                              |
| M1 (NG10 written-but-not-read claim partial)    | NG10 wording corrected — `description` IS read by `TiptapEditor.tsx:319` for substring heuristic; CodeMirror plugin ignores; neither surfaces text to user today |
| M2 (verb mismatch Added vs Patched)             | NG10 verb-list corrected — line 1715 is `Patched` (handleAgentPatch), not `Added`                                                                                |
| L1 (sha-short 7 vs 8 chars)                     | FR10/D8 updated to 8 chars matching `api-extension.ts:2259` parent-git format                                                                                    |
| H4 (Q3/Q4 stale "Needs user input" cells)       | Already addressed by amendment block below table; cells supplementary, not contradicting current state                                                           |
| L2, L3                                          | No-action (confirmed coherent / folded into H1)                                                                                                                  |

### Pending — surfaced to user as decision-implicating findings

**CRITICAL:**

- **DI1** (Auditor H2 + Challenger F3 converged) — **D15 ships a bug**: UI Restore button at `EditorPane.tsx:155` would attribute every human-driven rollback to "Claude" via `extractAgentIdentity` fallback. Need to bound `recordContributor` to MCP-attributed bodies only (no agentId in body → no contributor entry → same anonymous behavior as today).

**HIGH:**

- **DI2** (Challenger F2) — D17 mislabeled as 1-way door. `string` → `string | string[]` IS additive (precedent applies symmetric to D9). Demote to DIRECTED OR widen to union from v1.

**MEDIUM (consolidated batch):**

- **DI3** (Challenger F1) — Storage shape per-doc unused at every layer; could simplify to flat `summaries?: string[]`
- **DI4** (Challenger F4) — 50 vs 80 char cap; 50 is at UI overflow edge (\~45 chars per challenger measurement)
- **DI5** (Challenger F5) — Adopt collapsible bullets (existing WipGroup pattern, \~10 LOC) preemptively to mitigate D2 risk
- **DI7** (Challenger F7) — Populate `ActivityEntry.description` with summary when provided (one-line consolidation; nuanced by M1 finding that the field IS read)
- **DI9** (Auditor M3) — Parser convention divergence: drop whole entry on malformed `summariesByDoc` vs drop just the field

**LOW (recommend defer):**

- **DI6** (Challenger F6) — Graduated required (write/edit only). Already addressed by M1 metric revisit trigger.
- **DI8** (Challenger F9) — Narrow NG2 NEVER → NOT NOW for hybrid intent+stats. Low priority.

## 2026-04-21 — session 1, turn 5 (audit cascade complete)

User accepted all recommendations: DI1 a, DI2 take rec, DI3-DI5 + DI7 + DI9 accept rec, defer DI6 + DI8.

### New Decision Log entries (D22-D27)

- **D22 LOCKED 1-way door** (DI1) — `handleRename` and `handleRollback` MUST guard `recordContributor` on explicit `agentId` presence in body. UI Restore button stays anonymous (NG12 added).
- **D23 LOCKED** (DI3) — Storage shape simplified: `summariesByDoc?: Record<string, string[]>` → `summaries?: string[]`. Renderer flattens, D17 single-string, D16 always-show-doc-list make per-doc keying unused.
- **D24 DIRECTED** (DI4) — Character cap 50 → 80 (matches GitHub Desktop / commit-message convention; fits TimelinePanel canvas at text-xs).
- **D25 DIRECTED** (DI5) — Collapsible bullet rendering in v1 (first bullet inline + "Show N more" expander matching `WipGroup` pattern). FR13 promoted Could → Should.
- **D26 DIRECTED** (DI2) — D17 demoted from LOCKED to DIRECTED with explicit revisit trigger (widen to `string | string[]` if M1 telemetry shows >3 multi-step calls per debounce window).
- **D27 DIRECTED** (DI9) — Field-level drop on malformed `summaries` (deliberate divergence from existing whole-entry-skip parser convention; rationale: decorative loss vs attribution loss).

### NG12 added

- **\[NEVER] NG12** — Attributing UI-driven (non-MCP) rollback or rename actions to any agent. Forbids the failure mode Audit H2 + Challenger F3 caught (UI Restore button → claude-1/Claude default attribution).

### Cascades to SPEC.md

- §1 Resolution paragraph — shape updated (`summaries?: string[]`)
- §2 G2 — keeps existing wording; G2 still applies
- §3 NG10 — wording updated (M1 audit cascade)
- §3 NG12 added (D22 cascade)
- §6 FR1 — Zod schema unchanged (200 hard cap)
- §6 FR2 — truncation 50 → 80 chars (D24); explicit `truncatedFrom` only when >80
- §6 FR3 — `recordContributor` API simplified (push to flat `summaries[]`)
- §6 FR4 — emit flat `summaries: [...]` shape on commit body
- §6 FR5 — type guard for `summaries: string[]`; D27 field-level drop
- §6 FR6 — `ShadowContributor.summaries?: string[]`
- §6 FR7 — collapsible bullet rendering (per D25)
- §6 FR9 — rename: identity AND summary only when MCP-attributed; default 80 chars
- §6 FR10 — rollback: same as FR9; sha-short 8 chars (per L1 correction)
- §6 FR13 — promoted Could → Should
- §6 FR14 — `history.contributors[*].summaries` (flat per D23)
- §10 D1 — marked superseded by D23 (audit-trail preserved)
- §10 D5/D17/D20/D21 — superseded/amended by D24, D26
- §10 D9, D12, D13 — minor wording cascades for new shape
- §13 In Scope — FR list updated to FR1-FR15 (no Could deferrals after D25)
- §13 Backward-compat row — updated for new shape
- §16 SCOPE — adds metric counters (D11 + H5), reflects D22 guard
- §16 STOP\_IF — V0-14 forward-compat preserved
- §16 ASK\_FIRST — wording cascade

### Deferred per user direction

- **DI6** (graduated required) — already addressed by M1 metric revisit trigger; deferred to post-ship if adoption signal demands.
- **DI8** (NG2 narrowing for hybrid intent+stats) — defer to Future Work (Noted).

### Backlog state

- All P0 OQs closed.
- All audit findings (5 H, 5 M, 3 L) and design challenger findings (3 H, 4 M, 2 L) addressed: applied silently, cascaded as new decisions, or explicitly deferred.
- Ready for verify-and-finalize phase.

## 2026-04-21 — session 1, turn 6 (verify and finalize)

### Mechanical adversarial checks (per /spec workflow Step 8)

- **ASSUMED decisions:** 0 (verified via grep — 0 occurrences of "INVESTIGATING\|ASSUMED")
- **1-way doors at LOW/MEDIUM confidence:** None. The 3 LOCKED 1-way doors (D4 tool API symmetry, D22 UI behavior contract, D23 storage shape) are all HIGH confidence with cited evidence.
- **Non-goal accuracy:** All 12 NGs (NG1-NG12) carry temporal tags (NEVER × 5, NOT NOW × 5, NOT UNLESS × 2). Each has a revisit condition or explicit reason.
- **Resolution status completeness:** All 27 decisions (D1-D27) carry LOCKED or DIRECTED resolution. No blanks.

### Resolution completeness gate (per In Scope item)

- ✅ All decisions affecting In Scope items are made (D1-D27 cover everything)
- ✅ No 3rd-party dependencies introduced (no decisions needed)
- ✅ Architectural viability validated — `evidence/code-trace-existing-attribution-pipeline.md` confirms all 5 extension points exist; auditor verified 12+ specific code references
- ✅ Integration feasibility — extending an existing `recordContributor` → `formatContributorsFrom` → `commitWip` → `parseContributors` → `EntryRow` pipeline (no new boundaries)
- ✅ Acceptance criteria verifiable — FR1-FR15 each have testable AC; metrics M1/M2 instrumented; D22 guard testable via integration test
- ✅ No dependency on Out of Scope items

### Future Work classification (per /spec quality bar)

- **Explored** (4 items): Per-bullet contributor identity (NG4), structured intent schema (NG5), searchable summaries (NG6), save-version commit body (NG8)
- **Identified** (4 items): Cluster A activity sidebar consumer, get\_history first-class MCP exposure, description restructure across MCP tools, per-write summary on browser/source-mode
- **Noted** (4 items): Hover preview on TimelinePanel rows, agent activity dashboard, intent-aware undo, i18n of tool descriptions
- **Plus DI6 + DI8 deferred per user direction** — graduated required + NG2 narrowing for hybrid intent+stats

### Status updated

- Draft → Approved (user explicitly accepted all decisions; audit + challenge passed; all P0 OQs closed)

### Baseline commit

- Current HEAD `91ae79c4` matches stamped baseline; no field update needed

### Spec ready for /ship

- File: `/Users/andrew/Documents/code/open-knowledge/specs/2026-04-21-agent-write-summaries/SPEC.md`
- Evidence: `evidence/code-trace-existing-attribution-pipeline.md`, `evidence/worldmodel-synthesis.md`
- Process record: `meta/_changelog.md`
- Audit findings: `meta/audit-findings.md`
- Design challenge: `meta/design-challenge.md`
