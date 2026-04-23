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

## 2026-04-21 — Session 4: Audit complete; 14 fixes applied; 5 escalations to user

**Subprocess runs:**
- Auditor (`b60uqf5sw`): 10 findings (2H, 5M, 3L) — coherence + factual. Output: `meta/audit-findings.md` (216 lines).
- Design-challenger (`b2moamcb5`): 12 findings across 4 BLOCKING / MATERIAL / CLARIFY severities. Output: `meta/design-challenge.md` (276 lines).

**/assess-findings applied** — adversarial-stance triage with investigation routing (code inspection + research-evidence cross-check; web-search ceiling applied for library-API claims).

### Applied autonomously (pure corrections — all fixed in SPEC.md §5.1, §6.4, §6.5, §7.2, §11 A1, §12, §13.1, §13.3, §14; evidence file):

1. **Audit H1 (COHERENCE) applied:** §5.1 module layout now lists both new IPC channels (`ok:shell:detect-protocol` + `ok:shell:spawn-cursor`), both handlers, both bridge methods. Evidence file channel count updated 9 → 10.
2. **Audit H2 (FACTUAL) applied:** §6.4 macOS install-detection probe changed from process-running check (`tell application "System Events" to exists application process`) to install-registration check (`id of app "Claude"` or `mdfind bundle-id`).
3. **Audit M3 (COHERENCE) applied:** §13.3 resolves 18-vs-24 arithmetic — 3 unique schemes (Cowork + Code share `claude:`) × 2 hosts × 3 install states = 18.
4. **Audit M4 (COHERENCE) applied:** §6.5 `spawnCursorFolder` signature aligned with `HandoffPayload` (matches §6.1 descriptor type).
5. **Audit M6 (FACTUAL) applied:** §6.4 explicit Linux fallback to `xdg-mime query` for Electron host (the API is macOS + Windows only).
6. **Audit M7 (FACTUAL) applied:** §7.2 attribution fixed — "Open in" prefix matches Mintlify + Fumadocs conventions (not Linear, which uses bare names).
7. **Audit L8 (FACTUAL) applied:** §11 A1 Electron floor corrected from "25+" to "11+" (API shipped in Electron 11 per PR #24112).
8. **Audit L9 (COHERENCE) applied:** evidence file channel count updated 9 → 10.
9. **Audit L10 (FACTUAL) applied:** evidence file adds `curl -I` spot-check note for installUrl values at implementation.
10. **Challenge DC3 (BLOCKING) applied:** §6.5 Cursor settle buffer changed from 500ms to 1000ms default + cold-start heuristic (1500ms if `pgrep -x Cursor` returns nothing). Citation corrected — Finding 5 supports `workspace=` safety-net, not duration; duration is from the R1-R5 canonical recipe.
11. **Challenge DC7.1 (MATERIAL) applied:** §6.5 TQ4b LOCKED section expanded — `spawn-cursor` resolves the `cursor` binary via `app.getApplicationInfoForProtocol('cursor://').path`, not `$PATH`. PATH-hijack mitigation explicit.
12. **Challenge DC7.2 (MATERIAL) applied:** §6.5 / §8.2 TBD-extended in follow-up commit to name bind-address=localhost + Origin/Referer check + realpath validation for `/api/handoff/open-folder`.
13. **Challenge DC7.3 (MATERIAL) applied:** §12 new R7 privacy risk entry for `https://claude.ai/new?q=` web fallback (data egress via URL to Anthropic).
14. **Challenge DC7.4 (MATERIAL) applied:** §14 Future Work adds scheme-regex (`^[a-z][a-z0-9+.-]*$`) precondition for third-party plugin API.
15. **Challenge DC8.1-8.5 (CLARIFY) applied:** §13.3 names mocking boundary explicitly (fixtures file + `page.route` + spawn-cursor IPC mock); adds 7th E2E cell (all-disabled web-host); unit-test corpus extended with `&` in filename and Windows `\` path cases.
16. **Challenge DC9 (CLARIFY) applied:** §12 R6 rollback path documented — `git revert` of the impl commit restores allowlist; 1-way-door accepted.
17. **Challenge DC10 (CLARIFY) applied:** §14 Future Work entry for bridge-contract duplication revisit at 15 surfaces.
18. **Challenge DC5 (CLARIFY):** no spec change — PQ2 LOCKED stands; the observation that Cowork + Code share install state is accurate and already reflected by §6.4 scheme-deduplication. First-run confusion rate is a dogfood-loop question.

### Dismissed with evidence:

- None. Every investigated finding had merit.

### Decline mapped to escalations (user judgment required — presented in next /spec message):

- **DC1 + Audit M5 (combined) — MATERIAL:** Registry pattern vs hand-rolled switch. Layering seam (core importing from app) is a real architectural violation regardless of which path is chosen. Needs Andrew's call.
- **DC2 — MATERIAL:** Minimal prompt composer scope regression from story seed (PQ5). Story said "path, title, frontmatter, possibly excerpt"; spec dropped all but path per SQ1 DIRECTED. Asymmetry across targets when OK-MCP is absent.
- **DC4 — BLOCKING:** Claude Code `file=` probe asymmetry per research Finding 9 — the Epitaxy webview nav only composes `q=` + `folder=` (no `file=`). AC2 overstates atomic-file-attachment behavior.
- **DC6 — MATERIAL:** Dual-host parity I7 inflates Cursor web-host scope (new server endpoint + threat model ~300 LOC). Worth considering relaxing I7 for Cursor specifically.
- **DC11 — MATERIAL:** No observability + 1-week dogfood loop + XQ3 no-phone-home = silent failures of DC3 / DC4 won't be caught. Post-dispatch toast UX + local `~/.open-knowledge/stats.jsonl` are candidates for v0 scope.

**Artifacts updated:** SPEC.md (8 sections modified), evidence/codebase-surface-map.md.

**Next:** present escalations as numbered batch to Andrew; await decisions before finalizing per /spec skill Step 7 → Step 8.

## 2026-04-21 — Session 5: E4 + E5 absorbed (local-only posture); E1/E2/E3 re-asked

**User decisions (Andrew, batch 3 — partial):**

- **E4 DIRECTED: v0 is local-use-case only.** Server + browser + agents all on the same machine. Cross-machine `ok start` out of scope. Web-host Cursor row always disabled-with-tooltip ("Cursor handoff requires the desktop build"). `/api/handoff/open-folder` endpoint **NOT shipped** (cuts ~300 LOC + threat-model surface). I7 relaxed for Cursor specifically on web; preserved for Claude + Codex (anchor-click from browser dispatches on browser machine in local-use-case).
- **E5a + E5b both DIRECTED:** post-dispatch toast UX (`useHandoffDispatch.ts` hook, reuses existing sonner Toaster) + local `~/.open-knowledge/stats.jsonl` append-only counter (`telemetry.ts`). Both ship in v0. Diagnostic path for silent-failure modes (Cursor cold-start misfire, Claude Code file= asymmetry, vendor drift) now exists.

**E1, E2, E3 still pending** — re-asked in next /spec message. Blocking finalization until answered:
- **E1:** Registry layering fix (E1-a keep+fix / E1-b drop / E1-c move to app-layer).
- **E2:** Minimal prompt — keep-as-is (E2-a) vs add title (E2-b).
- **E3:** Claude Code `file=` handling (E3-a drop / E3-b keep+disclose / E3-c live-test).

**Artifacts updated:**

- SPEC.md: §2 Non-Goals (added cross-machine + web-Cursor entries), §5.1 (added `telemetry.ts` + `useHandoffDispatch.ts`; commented out `/api/handoff/open-folder`), §6.5 (Cursor web path → disabled with tooltip), §7.3 (added Cursor-web disabled tooltip shape), §8.2 (local-use-case framing + Cursor disabled), §9 Decision Log (3 new rows: E4-Local, E5a, E5b), §13.1 (added telemetry.test.ts coverage), §13.2 (`/api/handoff/open-folder` explicitly not shipped), §13.3 (8 cells now, cell 8 added for failure-path toast + stats), §14 (updated toast + stats rows from "Identified" to "Shipped in v0"; added "Web-host Cursor + cross-machine" as Identified Future Work), §15 (SCOPE updated for telemetry.ts; API endpoint count 2→1).
- Changelog updated.

**Spec status:** 3 of 5 audit-escalations resolved. 14 pure corrections + 2 DIRECTED escalations applied. 3 pending.

## 2026-04-21 — Session 6: E1-b, E2-a, E3-b absorbed; spec FINAL

**User decisions (Andrew, batch 4 — final):**

- **E1-b DIRECTED (supersedes SQ9):** drop the registry pattern. Pure-data `KNOWN_TARGETS` constant in `packages/app/src/lib/handoff/targets.ts` (no function fields); hand-rolled switch on `p.target` in `dispatch.ts` with TypeScript `never` exhaustiveness. Layering seam (core importing from app) disappears. Third-party plugin API stays Explored Future Work, designed later without v0 pre-commit. ~150 LOC simpler than the registry. Same one-commit pattern to add a 5th target.
- **E2-a DIRECTED:** keep minimal prompt as specced. Add AC-dogfood-1: ≤50% of dispatches should be followed by user adding >20 chars in target agent composer, measured over 7-day window via stats.jsonl (E5b) + qualitative feedback. Failure triggers SQ1 re-open in follow-up story.
- **E3-b DIRECTED:** keep `file=` in Claude Code URL for forward-compat (handler parses it); weaken AC2 to "folder-scoped open + prompt pre-fill; file-attachment verification deferred to implementation." Add STOP_IF gate: implementer live-tests Claude.app 1.2581.0+ before merging; if `file=` is ignored, implementer updates §6.2 + AC2 first. No ship with overclaimed behavior.

**Artifacts updated:**

- SPEC.md frontmatter: `status: "READY — audit complete, all escalations resolved, ready for /ship handoff"`, `baselineCommit: b924fa97`.
- §4 AC2 weakened per E3-b. AC-dogfood-1 added per E2-a.
- §5.1 module layout: `registry.ts` dropped; `KNOWN_TARGETS` moved to app-layer `targets.ts`.
- §6.1 types: `HandoffTargetDescriptor` retired; replaced by pure-data `TargetData` interface.
- §6.1.5 rewritten: "Known targets + dispatch" showing `KNOWN_TARGETS` data constant + `dispatch.ts` switch.
- §6.2 added Claude Code `file=` UNCERTAIN disclosure + live-test gate reference.
- §6.3 added E2-a dogfood success metric + 7-day re-open trigger.
- §6.6 allowlist drift-detector test updated to import `KNOWN_TARGETS` from app-layer (test-only cross-package boundary).
- §7.1 rewritten: "registry-driven rows" → "rendered from `KNOWN_TARGETS` data constant"; dispatch via switch + `never` exhaustiveness.
- §9 Decision Log: SQ9 marked RETIRED; E1-b / E2-a / E3-b added as DIRECTED.
- §14 Future Work: third-party plugin API reframed as "designed later without v0 pre-commit."
- §15 SCOPE: `targets.ts` added; STOP_IF expanded with Claude Code live-test gate + "no registry reappearance" guard; ASK_FIRST updated.
- §16 Next steps: replaced "proceed to audit" with "Ready for /ship" + decision-count summary + quality-bar checklist + critical implementation gates.
- Changelog updated.

**Mechanical adversarial checks (§8 /spec step 8):**

- ✅ No ASSUMED resolution status remains on load-bearing items. All 19 DIRECTED + 9 LOCKED + 1 DELEGATED have resolution status.
- ✅ No 1-way door decisions at LOW or MEDIUM confidence without explicit risk acceptance documented.
- ✅ Non-goal temporal tags: NOT NOW items (Zed/Windsurf/VS Code, MCP-install URL, handoff-registry, cross-machine `ok start`, embedding-aware UI, Cursor mode= non-agent, Codex originUrl=, web-host Cursor) are correctly categorized — none would cause rework if added later (additive to working v0).

**Quality bar checklist — ALL PASS** (see §16 for detail):

- Every In Scope item has an implementable path.
- 3P dependencies named (sonner, Electron IPC, shadcn dropdown-menu).
- Architectural viability validated against baseline commit `a1e74cb8` (evidence/codebase-surface-map.md).
- Integration feasibility confirmed for all boundaries.
- Acceptance criteria verifiable; tests in §13 map to each AC.
- Zero In Scope → Out of Scope dependencies.

**Spec status: FINAL.** Ready for /ship.

**Next:** Andrew reviews on GitHub; `/ship` handoff when ready to implement.
