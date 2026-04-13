# V0-2 Sidebar Push — Spec Changelog

Append-only process log. Decisions, scope changes, evidence captures, and audit findings.

---

## 2026-04-13 — Intake + Scaffold (session 1, Andrew)

- **Worktree:** `.claude/worktrees/spec-v0-2-sidebar-push` on branch `spec/v0-2-sidebar-push`, based on `origin/main` at `f8915cd`.
- **Created:** `SPEC.md` (Draft, Intake state), `evidence/`, `meta/_changelog.md`.
- **Source-of-truth pointers captured:**
  - `projects/v0-launch/PROJECT.md:480-499` (V0-2 entry)
  - `projects/v0-launch/PROJECT.md:991-992` (CC1 cross-cutting concern definition)
  - `projects/v0-launch/PROJECT.md:1038` (RH2 — sidebar redesign rabbit-hole guardrail)
  - `specs/2026-04-11-sidebar-realtime-updates/SPEC.md` (predecessor draft, 6 OQs — to triage in Backlog)
  - `packages/app/src/components/FileSidebar.tsx:144` (5 s polling — the thing being removed)
  - `packages/server/src/file-watcher.ts:33-45` (DiskEvent taxonomy)

- **Intake decisions captured (D1-D5 in §10):**
  - D1 LOCKED — reuse Hocuspocus transport; no new endpoint (CC1 constraint)
  - D2 LOCKED — V0-2 defines the CC1 contract; V0-3/V0-11 consume
  - D3 DIRECTED — no background polling fallback; single re-fetch on reconnect only
  - D4 LOCKED — sidebar UX redesign out (RH2)
  - D5 DIRECTED — optimistic UI deferred to V0-4

- **Open questions Q1-Q9 enumerated** (§11). Q1, Q2, Q3, Q7 await user direction; Q3, Q4, Q5, Q6, Q8, Q9 require Iterate-phase investigation.

- **Tensions surfaced in Intake (require user resolution):**
  - Seed says "push payload is small (path + event kind)" but CC1 (PROJECT.md:992) says "signal-then-fetch (not push-the-data)." → Q2 (judgment-call 2 in Intake response)
  - Sidebar is vault-scoped; Hocuspocus awareness/stateless are per-Y.Doc. Transport candidates: system-doc / per-doc broadcast / protocol extension. → Q3 (judgment-call 3)
  - Predecessor spec lists 6 OQs but project tracker says "5 OQs (TQ2)". OQ4/OQ5 candidates for demotion to Future Work / quick-verify. → Q6, judgment-call 4

- **PR opened pre-iteration** at user request to surface intake state for collaborator weigh-in (Andrew + Dima + Mike are stakeholders).

## 2026-04-13 — Q1 resolved (session 1, Andrew)

- **Q1 → D6 LOCKED.** SCR framing stays dual (staleness + architectural fragmentation, equal weight) per user direction. Alternatives β/γ/δ/ε rejected: each misrepresents the bet by collapsing to a single lens. §1 unchanged; Q1 marked closed in §11; D6 added to decision log.

## 2026-04-13 — Q2/Q3/Q6/Q7 resolved + Q4/Q5/Q8/Q9 cascade-closed (session 1, Andrew)

**User answers:** Q2=C (hybrid), Q3=3a (`__system__` Y.Doc), Q6=drop OQ5 to Noted, Q7=Layer 2 to V0-4.

**Code verification performed before answering:**
- `packages/server/src/api-extension.ts:405-426` — `handleDocumentList` reads in-memory file index; no readdirSync. Confirms A1.
- `node_modules/@hocuspocus/server/src/Document.ts:238` — `Document.broadcastStateless(payload: string, filter?)` is public; iterates connections and calls `sendStateless`. Confirms A2.
- `node_modules/@hocuspocus/provider/src/HocuspocusProvider.ts:334` + `:198` — client `sendStateless` / `onStateless` event hook.
- `packages/app/src/editor/provider-pool.ts:42-54` — ProviderPool accepts arbitrary docName; supports adding `__system__` without refactor.

**Decisions locked:**
- D7 LOCKED — contract semantics = hybrid (typed event + re-fetch on gap/reconnect/resync sentinel)
- D8 LOCKED — transport = dedicated `__system__` Y.Doc
- D9 DIRECTED — broadcast kinds = create/delete/rename only
- D10 DIRECTED — 100 ms coalescing window + resync sentinel on >5 events/window
- D11 LOCKED — L1 integration to V0-2, L2 Playwright to V0-4
- D12 LOCKED — OQ5 dropped to Future Work Noted

**Byproduct closures:**
- Q4 closed by D9
- Q5 closed by D10
- Q8 closed by D8 (`broadcastStateless` delivers once per connection)
- Q9 closed by D8 (`__system__` opens independently of content docs)

**Cascaded updates:**
- §6 Functional requirements table filled (12 rows: 8 Must, 3 Should, 1 Could)
- §9 System design rewritten with concrete payload shape (CC1 contract v1), coalescing protocol, seq discipline, alternatives considered & rejected
- §12 Assumptions A1-A3 verified + archived; A4-A6 added (pool pinning, persistence skip gating, coalesce-window sufficiency)
- §13 In Scope populated (owners split, next actions 1-6, rollout considerations)
- §14 Risks rewritten around actual decisions
- §15 Future Work — Identified (V0-3/V0-11 inherit contract), Noted (update/mtime, tag, OQ5, protocol-ext)
- §16 Agent constraints — concrete SCOPE file list, EXCLUDE set, STOP_IF/ASK_FIRST tripwires

**Status:** All P0 open questions closed. Spec ready for audit (Step 6).
