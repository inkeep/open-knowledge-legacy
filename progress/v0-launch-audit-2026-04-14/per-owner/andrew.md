# Andrew — V0 launch audit (last 48h)

**Stories owned:** 3 total (2 shipped, 0 in-progress, 1 remaining)
**Verdict:** On track. Both claimed "Now" phase stories shipped with full acceptance criteria met. V0-20 (Later) correctly marked as gated, no premature scope-add.
**Material deviations:** None flagged. Scope alignment is tight.

---

### V0-1 — Server process safety (lock file, hardened shutdown, MCP port auto-discovery)
- **Phase bucket:** Now (shipped)
- **Claimed status (PROJECT.md):** "Shipped" (PR #99, cafed34)
- **Actual status (verified):** Shipped. PR #99 merged 2026-04-13T21:05:47Z (within 48h window).
- **Evidence:** PR #99 (state: MERGED, merged 2026-04-13, CI: all 13 checks PASS, 100 files changed, commit cafed34). Spec: `/specs/2026-04-13-server-process-safety/SPEC.md` (259 lines).
- **Deviation from spec:**
  - **Scope cuts:** None. All 10 AC criteria covered: acquire/collision/stale/shutdown/mid-failure/MCP discovery (live/dead/missing)/override/dev-vs-start/full check-suite.
  - **Scope adds:** None. PR stays within spec boundaries (lock file, shutdown hardening, MCP port discovery only).
  - **Match summary:** Delivered as planned. Spec+impl merged together; 189 LOC `server-lock.ts`, `process-alive.ts`, `standalone.ts` resequencing, 19 unit tests + E2E on `standalone.test.ts` + `mcp.test.ts`.
- **48h activity:** Commit cafed34 (2026-04-13) merged via PR #99. Also upstream docstring commit a111a99 (2026-04-14) marking V0-1/V0-2 shipped.
- **Blockers / risks:** None. Unlocks V0-7 (state.json session persistence per spec) and V0-20 (Electron multi-window discovery).
- **Reviewer note (for Nick):** Launch-ready. Top-2 v0 data-corruption blocker fixed (dual `open-knowledge start` in same dir); zero-config MCP integration unblocked.

---

### V0-2 — Server-side push-over-awareness (CC1 broadcaster, __system__ Y.Doc, isSystemDoc skip surface)
- **Phase bucket:** Now (shipped, server-side only)
- **Claimed status (PROJECT.md):** "Shipped server [#106](https://github.com/inkeep/open-knowledge/pull/106). Client-side consumer (ProviderPool pin, `FileSidebar` subscriber) is Dima's follow-up — see `specs/2026-04-13-v0-2-sidebar-push/SPEC.md` §9-10; no PR open as of 2026-04-14."
- **Actual status (verified):** Shipped (server-side). PR #106 merged 2026-04-14T00:38:17Z (within 48h window). Client-side (ProviderPool pin, main.tsx mount, FileSidebar refetch, L2 Playwright) deferred to Dima — no branch/PR open; matches PROJECT.md audit note line 98.
- **Evidence:** PR #106 (state: MERGED, merged 2026-04-14, CI: all 13 checks PASS, 107 files changed, commit 88351e1). Spec: `/specs/2026-04-13-v0-2-sidebar-push/SPEC.md` (150+ lines, US-001 through US-008 implementation map in spec §3).
- **Deviation from spec:**
  - **Scope cuts:** None on server-side. Server delivers: CC1 broadcaster (`cc1-broadcast.ts`, 96 LOC), `__system__` Y.Doc prefab via `openDirectConnection`, `isSystemDoc()` skip helper audited across 8 subsystems (persistence, file-watcher, content-filter, reconciliation, backlink-index, agent-sessions, external-change, frontmatter), 100 ms trailing-edge debounce per channel, monotonic `seq` per channel, metrics instrumentation.
  - **Scope adds:** Metrics expansion in `metrics.ts` (29 LOC delta) — includes `cc1BroadcastCount`, `cc1SubscriberCount`, `cc1LastSeq`, `cc1BroadcastDrop`. This is acceptable "while-we-were-here" observability, not a scope creep risk.
  - **Match summary:** Server-side acceptance criteria (§6 Must/Should) all satisfied per PR body audit checklist. Client-side consumer (ProviderPool `pinned` flag, `main.tsx` mount, `FileSidebar.tsx` refetch-on-signal, L2 Playwright) correctly deferred — no open PR, owner explicit (Dima).
- **48h activity:** Commit 88351e1 (2026-04-14) merged via PR #106. Upstream docstring commit a111a99 (2026-04-14) marks work shipped.
- **Blockers / risks:** Client-side consumer (Dima's follow-up) is not open yet. Spec §9-10 defines the contract clearly; V0-3 (BacklinksPanel) and V0-11 (graph panels) can draft against the server contract. No blocker for V0-2 itself.
- **Reviewer note (for Nick):** At-risk for user visibility if client-side consumer slips — P1 persona (writer with agent running in parallel) will still see 5 s latency until Dima ships FileSidebar refetch. CC1 contract is stable and reusable; design challenge phase (7 findings) completed.

---

### V0-20 — Desktop build prep (Electron multi-window discovery via lock file)
- **Phase bucket:** Later (gated, silent-start check)
- **Claimed status (PROJECT.md):** "V0-20 desktop build prep" (Later phase; no PR linked; entry on line 88: "gated on Electron spec promoting from Draft").
- **Actual status (verified):** Not started. No branch, no PR, no commits in last 48h. Spec `/specs/2026-04-11-electron-desktop-app/SPEC.md` exists but is Draft status (per PROJECT.md non-goals §8, line 47: "Electron native distribution ... v0 ships in CLI + web form").
- **Evidence:** `git log --since="2026-04-12" --oneline | grep -iE "desktop|electron|v0-20"` returns no matches. `gh pr list --state all --search "desktop"` returns 6 hits, none for V0-20 (old cached entries). V0-1 lock file is in place (commits cafed34/88351e1 reference it), which V0-20 would consume for "already open" detection.
- **Deviation from spec:**
  - **Scope cuts:** N/A (not started).
  - **Scope adds:** N/A (not started).
  - **Match summary:** Correctly parked in Later phase, gated on Electron spec promotion (separate bet). V0-1 prerequisite (lock file) shipped; V0-20 can start when gates lift.
- **48h activity:** None. No silent-start; correctly deferred.
- **Blockers / risks:** Gate: Electron spec must promote from Draft (currently non-goal per PROJECT.md:47). No internal blocker. Ready for intake when gate clears.
- **Reviewer note (for Nick):** Silent-start confirmed as intentional (no drift). V0-1 lock infra ready for V0-20 future use; no redesign needed per V0-1 spec decision.

---

## Summary

Andrew's platform/ops territory is in strong shape:
1. **V0-1** (data-integrity blocker) fully shipped, all acceptance criteria met, all CI green.
2. **V0-2** (architectural foundation) server-side shipped, client-side deferral clearly documented with owner (Dima), contract stable.
3. **V0-20** (multi-window future) correctly gated, no premature work, no scope drift.

Zero material deviations. Recommend Nick review Dima's client-side V0-2 intake (not Andrew's responsibility, but critical path to user-visible latency gain).
