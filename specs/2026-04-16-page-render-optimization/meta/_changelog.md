# Spec changelog — page-render-optimization

Append-only. Most recent at top.

---

## 2026-04-16 · Session 1 — Step 2 complete (scaffold + worldmodel), Step 3 open (backlog)

**Worldmodel pass completed.** Subagent ran full channel harvest (codebase, `reports/`, OSS repos Outline/BlockNote/Hocuspocus, targeted web probes). Returned structured topology with several load-bearing corrections to prior-session artifacts.

**Factual corrections applied (silent edits):**
- `evidence/prior-session-trace.md` — prepended staleness notice; file preserved for historical context but deferred to `worldmodel-findings.md` where they conflict.
- SPEC.md §8 — rewrote to reflect that EditorSkeleton conditional, PresenceBar sync dot, and TanStack-Query-powered panels already exist. Baseline is partial-ad-hoc, not zero.
- SPEC.md §11 Q6 — partially resolved (forceSyncInterval verified not-set). Promoted the "should we add it?" half to new D8.
- SPEC.md §10 D1 — added verified maintainer quote from tiptap#5761 (gh CLI fetch confirmed closed 2025-04-18 by @janthurau: "re-create the editor and the provider (and the ydoc) if you pass it separately"). Changed resolution from DIRECTED to INVESTIGATING — reopened by Alt-A (`<Activity>`) option.
- SPEC.md §10 D2 — changed to INVESTIGATING, listing hand-rolled syncPromise vs `useSuspenseQuery` as forks.
- SPEC.md §10 D7 — changed to INVESTIGATING, expanded rationale to include `RECYCLE_DEBOUNCE_MS = 4000` collision and 7.4s-at-10KL sync data from `reports/crdt-observer-bridge-latency-analysis/REPORT.md`.
- SPEC.md §10 — added D8 (forceSyncInterval).
- SPEC.md §11 — added Q21 (Activity vs Suspense-gate), Q22 (TanStack Query convergence), Q23 (P3/P4 personas), Q24 (sync-dot desync), Q25 (setCurrentDocName race), Q26 (existing EditorSkeleton disposition).
- SPEC.md §12 A3 — updated confidence/criticality caveat.

**Evidence written:**
- `evidence/worldmodel-findings.md` (new) — full reification of worldmodel output with D-1 through D-9 divergences, Alt-A/Alt-B/Alt-C alternatives, 3P landscape, adjacent findings.

**New architectural tensions surfaced:**
1. `<Activity mode>` (React 19.2) offers a materially different answer to the remount problem — preserve-state-across-nav vs Suspense-gate-per-nav.
2. TanStack Query / `useSuspenseQuery` offers architectural convergence with existing async-loading patterns in the app.
3. Timeout budget (10s) collides with existing RECYCLE_DEBOUNCE (4s) and is borderline for 10KL docs (7.4s sync).

**Next:** Step 3 (backlog) — present decision batch to user for the forks above; extract remaining OQs via systematic probes; re-classify P0/P2 based on user answers.

---

## 2026-04-16 · Session 1 — Decision batch #1 (3 of 4 locked)

User answered decision batch:
- **#1 → C (hybrid):** `<Activity>` for pooled warm docs + Suspense-gated remount for cold loads. D1 resolution changed to LOCKED (pending TipTap 3.22 CHANGELOG spike).
- **#2 → "check ~/agents first":** dispatched Explore subagent on `~/agents` (agent-docs, agents-manage-ui) to surface `useSuspenseQuery` / Suspense / TanStack Query patterns. Decision pending.
- **#3 → C:** 30s hard timeout + escalating progress indicator (subtle strip → visible indicator → "taking longer than usual" → "Try again?"). D7 LOCKED.
- **#4 → sure:** Both P3 (agent-driven nav) and P4 (resume-from-idle) added as primary personas. §4 expanded.

SPEC.md surgical edits applied to §4 (personas), §10 (D1, D7), §11 (Q21, Q23 resolved; Q22 open pending investigation).

**Next:** wait for ~/agents Explore return → lock D2 → systematic OQ re-extraction → Step 4 (iterate).

---

## 2026-04-16 · Session 1 — Audit + Challenger findings disposition

Parallel /eng:audit (Auditor) + design-challenge-protocol (Challenger) subprocesses returned. Evaluated every finding via /eng:assess-findings protocol.

**Auditor findings (14 total, 3 H / 5 M / 6 L):**

| Finding | Severity | Disposition | Cascade |
|---|---|---|---|
| A1: 7.4s sync-latency cited incorrectly (was observer-bridge propagation, not WebSocket sync) | H | **Accepted — decision-implicating.** Decision (D7 30s timeout) stands; rationale rewritten to argue from first principles. | D7 revised; Q34 added to §11. |
| A2: §9 code snippet regressed dual-editor concurrent-mount pattern | H | **Accepted — pure correction.** §9 snippet revised to mount both SourceEditor+TiptapEditor with CSS hide/show. | §9, Q35. |
| A3: Fabricated claim about FileTree.tsx startTransition | H | **Accepted — pure correction.** Verified 0 startTransition in packages/app/src. Claim deleted from §8. | §8, Q36. |
| A4: `hocuspocus#525` "consensus" framing overstated | M | **Accepted.** D8 now says "ONE reported workaround (not community consensus)." | D8. |
| A5: `y-websocket#81` and `hocuspocus#183` are CLOSED, not active | M | **Accepted.** §1 reframed as "historical workarounds." | §1. |
| A6: §9 props (`entry.ytext`, `docName`) don't exist on actual components | M | **Accepted.** §9 snippet uses correct props: `provider`, `ytext={entry.provider.document.getText('source')}`. | §9. |
| A7: DX7 `__system__` filter is render-layer only, not admission | M | **Accepted — decision-implicating.** DX7 revised to filter at both ProviderPool.open() and EditorActivityPool render. | DX7, Q37. |
| A8: F1 state-preservation claim needs MAX_POOL boundary call-out | M | **Accepted.** F1 now mentions ACTIVITY_MOUNT_LIMIT (DX9) and falls-back behavior. | F1. |
| A9-A14 | L | Polish; defer or accept inline. | — |

**Challenger findings (9 total, 3 H / 4 M / 2 L):**

| Finding | Severity | Disposition | Cascade |
|---|---|---|---|
| C1: `forceSyncInterval: 200` miscount — 5 msgs/sec, not 2; 100 msgs/sec steady-state across 10 providers, meaningful for P2 | H | **Accepted — decision-implicating.** Revised from 200ms → 5000ms. Cuts chatter 25×; still catches sync-never-fires edge within 5s (well below D7 30s timeout). | D8 revised; Q38. |
| C2: D1 10× Activity-mounted editors under-counts cost — `setupObservers` Y.js bridges run under Activity hidden mode (NOT React effects), so hidden editors with pooled providers waste CPU on remote writes | H | **Accepted — decision-implicating.** New DX9 added: ACTIVITY_MOUNT_LIMIT = 3. Decouples Activity-mount count (3) from pool size (10). Bounds observer CPU at 3× regardless of pool growth. | D1 revised; DX9 new; DX8 revised; R11 added; Q39. |
| C3: Problem framing contradicts self (skeleton exists but §1 says "silent blank"); simpler "no Activity, pure Suspense-gate" alternative rejection is one-liner | H | **Partial accept.** §1 wording tightened to "skeleton-replaces-content" (more precise). D1 rationale expanded: the simpler alternative abandons G5 (state preservation across nav); engaged on first-principles UX grounds, not one-liner. | §1 revised; D1 rationale expanded; Q40. |
| C4: Tier boundaries (5/15/25/30s) cited as convention without evidence | M | **Accepted.** D7 rationale clarifies these are design choices modeled on GitHub/Vercel patterns; revisit when NG8 telemetry lands. | D7. |
| C5: syncPromise reimplements TanStack Query lifecycle at ~150 LOC; D2 rejection could be revisited | M | **Evaluated — stand.** TkDodo's positioning is definitive for one-shot subscription-source reads. TanStack Query would need staleTime:Infinity+retry:0+refetchOnMount:false etc. — configuring a library to disable its features is a smell. D2 rationale is sufficient. | No change. |
| C6: F7 (agent-driven nav) not Playwright-testable without MCP | M | **Accepted.** F7 restructured as unit test on `DocumentContext.openDocument` + `AgentFocusBroadcaster` integration (not E2E). | F7. |
| C7: F14 precedent scope ambiguity (narrow vs broad) is load-bearing for G6 | M | **Accepted.** F14 explicitly scopes to "subscription-source async primitives (single-event resolution, lifecycle-tied invalidation)" — not "all async loading." | F14. |
| C8: R3 retry idempotence not explicitly guarded | L | Noted — React transition semantics coalesce rapid retry clicks; syncPromise cache invalidation is idempotent on a per-docName basis. No code change needed. | — |
| C9: 25s "Try again?" lacks "keep waiting" | L | Noted — user can ignore the prompt and continue waiting until 30s. Adding explicit "keep waiting" button adds UX complexity without clear benefit. | — |

**Summary impact:** 2 new decisions locked (DX9, revised DX7). 1 decision revised with new parameter (D8 → 5000ms). 3 rationales rewritten (D1, D7, DX8). 1 new risk (R11). 4 F-requirements sharpened (F1, F7, F14, §9 code). 7 new OQs added to §11 for audit trail (Q34-Q40). No architectural reopening.

**Next:** commit post-audit revisions → Phase 1 exit (ship-init-state.sh) → Phase 2 (/decompose).

---

## 2026-04-16 · Session 1 — D2 + D4 locked (cross-repo audit)

`~/agents` Explore subagent returned. Two attempts: first one misdirected to OK itself (findings still useful — revealed `PageListContext.tsx:41-83` as the existing core-state hand-rolled precedent). Second attempt with explicit path `/Users/edwingomezcuellar/agents` returned the actual cross-repo findings:

- **`useSuspenseQuery` is 0 uses in both OK AND `~/agents`.** Library available, deliberately opted out of in both codebases.
- **Inkeep org pattern:** TanStack Query for HTTP peripheral fetches; Suspense for RSC/routing; `startTransition` for non-urgent state updates; `react-error-boundary@^6.0.0` for error catching; hand-rolled primitives for semantics that don't fit.
- **PageListContext precedent stands:** hand-rolled promise + `use()` on context is the consistent choice for core-state async in OK.

Decisions locked:
- **D2 = hand-rolled** `syncPromise + use(promise)` via DocumentBoundary + DocumentContext (mirrors PageListContext pattern).
- **D4 = `react-error-boundary@^6.0.0`** (matches `~/agents/agents-manage-ui` version).

Q22 resolved. Evidence file extended with §D-5a.

**Next:** systematic OQ re-extraction (walk-through + tensions + negative-space probes), then re-classify priority, then present the refined backlog for user review before Step 4 (iterate).

---

## 2026-04-16 · Session 1 — D2 rationale corrected after user pushback

User pushed back: "I think we may just not have known about it. Don't take prior art as prescriptive. I just want evidence-based in-depth analysis of what is best."

Re-evaluated D2 on semantic merits independent of prior-art convention:

- Web research on TkDodo's [React 19 and Suspense — A Drama in 3 Acts](https://tkdodo.eu/blog/react-19-and-suspense-a-drama-in-3-acts) confirmed: `use()` is the canonical React 19 primitive for "one-time data reads at render time"; TanStack Query is for "cache management, invalidation policies, retries, pagination, mutations."
- syncPromise semantics (wait for one `synced` event, resolve once, never refetch, invalidate on provider lifecycle) map exactly to `use()`'s designed purpose.
- `useSuspenseQuery` would require `{staleTime: Infinity, gcTime: Infinity, retry: 0, refetchOnMount: false}` — configuring a library to disable its main features.

**Conclusion:** same outcome (hand-rolled), new reasoning (semantic fit, not Inkeep convention). D2 decision log entry rewritten; Alternative F rationale rewritten; worldmodel-findings.md D-5a section re-positioned as "consistency context, non-decisive."

**Lesson persisted for future decisions:** cross-repo / org-convention data is context, not prescription. Architecture decisions rest on semantic/technical merits.

---

## 2026-04-16 · Session 1 — Intake + scaffold

---

## 2026-04-16 · Session 1 — Intake + scaffold

**Context.** Spec branched from `spec/github-sync` after a render-optimization research spike. Worktree `.claude/worktrees/page-render-optimization` created on branch `spec/page-render-optimization` tracking `origin/main@06da1ff`.

**Intake (Step 1).** Reframed user-provided technical seed in SCR form. Stress-tested with 5 probes; all 5 cleared (demand real, status quo costs concrete, wedge = full arch under greenfield directive, observation first-hand from user, future-fit increasing).

**User answers to framing questions:**
- Q1 (SCR accept): implicit accept via "feel free to proceed" signal.
- Q2 (personas): implicit accept of default (P1 solo dev + P2 team member IN; agents OUT; mobile noted-not-code-surface).
- Q3a (source editor in scope): implicit accept (DX1).
- Q3b (diff preview): implicit accept OUT → Future Work Identified (DX2).
- Q4 (research depth): **"feel free to do path c or inline /research"** — per-item decision, bias toward /research for load-bearing, inline for confirmatory.

**Decisions locked (DIRECTED status):** D1-D7, DX1, DX2, DX3.

**Artifacts created:**
- `specs/2026-04-16-page-render-optimization/SPEC.md` (scaffolded with §1-§16, fleshed through §12; §13 through §16 await iteration).
- `evidence/prior-session-trace.md` (reification of Explore-agent findings from predecessor session).
- `evidence/architecture-research-findings.md` (reification of web-search findings from predecessor session).
- `meta/_changelog.md` (this file).

**Open Questions extracted (first pass):** Q1-Q20. Systematic re-extraction pending in Step 4.

**Next:** Step 2 completes with /worldmodel dispatch. Step 3 (backlog) begins after worldmodel returns.
