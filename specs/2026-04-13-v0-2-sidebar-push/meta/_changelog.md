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
