# Changelog — specs/2026-04-21-open-in-agent-desktop/

Append-only process log. Substantive changes only (decisions, evidence additions, scope shifts). One entry per turn.

---

## 2026-04-21 — Session 1: Scaffold

- Created spec dir on worktree branch `worktree-open-with-agent-research` (PR #254). Baseline commit `a1e74cb8`.
- Story seed at `stories/open-in-agent-desktop/STORY.md` (merged to main via PR #255 today) is the anchor artifact.
- Intake validated against story's existing SCR + 5-probe + 9 LOCKED + 10 ASSUMED + 1 PARKED structure — no re-framing needed.
- Lightweight codebase probes:
  - `packages/desktop/src/shared/ipc-channels.ts` confirms `ok:shell:open-external` channel exists with D47 allowlist-enforced handler. `ok:shell:detect-protocol` will be a new channel.
  - `packages/desktop/src/shared/bridge-contract.ts` duplicated at core/desktop (deliberate per JSDoc — syncing needed for new bridge surface).
  - `packages/app/src/components/` has `DocPanel.tsx`, `EditorHeader.tsx`, `CommandPalette.tsx` as candidate surface hosts.
- Evidence captured at `evidence/codebase-surface-map.md`.
- SPEC.md scaffold written with §1-§4 populated (problem pointer, goals/non-goals, invariants, AC) and §5-§16 stubbed pending outline confirmation.
- Outline proposal presented to user for review (see /spec message).

## 2026-04-21 — Session 2: Decisions batch 1 absorbed; SPEC.md fully drafted

**User decisions (Andrew, batch 1 on the proposed outline):**

1. **SQ1 DIRECTED: Minimal prompt + OK-MCP hint.** Major simplification — frontmatter / title / excerpt all cut. Agent uses native `file=`/`path=`/`workspace=` attachment + MCP tools for context. Prompt is pure path-interpolation, deterministic, <500 chars by construction.
2. **SQ2 retired:** no bounding strategy needed — minimal composer can't overflow any realistic path.
3. **SQ3 DIRECTED:** `projectDir` + `docPath` as two distinct `HandoffPayload` fields. Both absolute paths. Claude gets both atomically; Codex gets `projectDir` only; Cursor gets `projectDir` for workspace spawn. Agent finds the file via tools once context is set.
4. **SQ4 DIRECTED:** Cursor settle = 500ms buffer + `&workspace=<basename>` safety-net. Skip poll-for-ready — the safety-net pins URL to the right window even on cold-start overrun.
5. **SQ5 DIRECTED:** Install-detect = show cached + async refresh on dropdown open. Throttled to 1 check / 10s per target.
6. **SQ6 DIRECTED:** All three surfaces in v0 — header + command palette + sidebar context menu. Shared `OpenInAgentMenu` component.
7. **SQ7 LOCKED:** Same PR (#254); spec is 5th commit to `worktree-open-with-agent-research` branch.
8. **SQ8 LOCKED:** Allowlist extension is hard prerequisite. No implementation proceeds without `{claude:, codex:, cursor:}` added + exact-set test passing.

**Spec-inferred DIRECTED items (await Andrew batch 2 for any LOCKED demands):**

- PQ4: "Open in [Cowork|Code|Codex|Cursor]" dropdown copy.
- TQ4-revised: new narrow `ok:shell:spawn-cursor` IPC channel (not overloading `ok:shell:open-external`).
- XQ1-refined: 6 E2E cells sampled from the 18-cell matrix.
- XQ2: Dogfood to Nick + immediate team first.
- XQ4: D47 changelog entry format pinned.

**Artifacts updated:**

- `SPEC.md` — §5-§16 fully populated. Architecture + module layout + sequence diagrams + URL-builder signatures + prompt composer + install detection + Cursor FSM + allowlist diff + decision log + test plan + Agent Constraints.
- `evidence/codebase-surface-map.md` — unchanged from Session 1.

**Next:** user review of the full draft, then audit phase (spawn /audit + design-challenger per /spec skill step 6).

## 2026-04-21 — Session 3: Registry pattern + TQ4 confirmation

**User decisions (Andrew, batch 2):**

1. **PQ4 LOCKED:** "Open in" prefix confirmed for all four rows.
2. **TQ4 clarification:** Andrew asked (a) is the new IPC channel required for Cursor? and (b) explain channel limitations. Answered in /spec message:
   - (a) YES, load-bearing. Cursor's `cursor://` scheme has NO folder-open route (all 10 routes are action URIs). Without step 1 the prompt URL fires into the wrong window or fails silently.
   - (b) Channel limitations explained: hand-rolled typed union (D14); scale trigger at 20 channels (we're going 8→9); security-threat models differ (scheme allowlist vs command allowlist).
   → TQ4b LOCKED in Decision Log.
3. **XQ1 DIRECTION SHIFT → SQ9 DIRECTED (Registry pattern):** Andrew pivoted from "sample E2E cells" to asking for a common interface + easy add/remove + third-party-build-your-own posture. Addressed by threading a `HandoffTargetDescriptor` + `BUILT_IN_TARGETS` registry through the entire spec. All per-target hardcoding is now driven by registry entries:
   - Dropdown renders from registry (§7.1)
   - Install detection enumerates registry schemes (§6.4)
   - Shell allowlist gets a registry-coverage drift-detector test (§6.6)
   - Dispatch switches on `descriptor.dispatch.kind` — no per-target if-cascades
   - Adding a 5th target = one descriptor + one URL builder + one allowlist row
   - Third-party plugin API is explicit Future Work with designed-for descriptor shape (§14)
4. **OQ-C DIRECTED:** Cursor `mode=agent` pinned in v0 (not configurable per-call).
5. **OQ-Codex-originUrl DIRECTED:** no cross-machine repo resolution in v0; `path=` only.

**Spec-inferred LOCKED/DIRECTED items carried forward:** PQ4 copy, TQ4-revised narrow IPC channel, XQ1-refined E2E sampling (6 cells — unchanged; the registry simplifies unit test iteration but doesn't change E2E strategy), XQ2 dogfood-first rollout, XQ4 D47 changelog format.

**Artifacts updated:**

- `SPEC.md` §5.1 (module layout adds `registry.ts`), §6.1 (new `HandoffTargetDescriptor` type), NEW §6.1.5 (the 4 built-in descriptors + implications), §6.6 (registry-coverage drift test), §7.1 ("registry-driven rows"), §9 (SQ9 / TQ4b / OQ-C / OQ-Codex-originUrl rows), §14 (third-party plugin API explicit future-work), §15 (SCOPE adds `registry.ts`; ASK_FIRST adds "expose registration API" + "change descriptor shape after ship").
- Changelog updated.

**Spec is now ready for audit phase.** All 9 LOCKED + 16 DIRECTED + 1 DELEGATED + 3 Future Work-deferred items resolved. No P0 open questions.

**Next:** spawn /audit + design-challenger parallel subprocesses (Step 6 of /spec skill).
