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

## 2026-04-13 — Audit + Design Challenge + Assessment (session 1, Andrew)

**Audit run:** 11 findings (2 High, 6 Medium, 3 Low) written to `meta/audit-findings.md`.
**Design challenge run:** 7 findings (2 High, 3 Medium, 2 Low) written to `meta/design-challenge.md`.
**Assessment:** `evidence/AUDIT-assessment-2026-04-13.md` — per-finding verdict + routing.

**Applied as pure corrections (11 findings → spec updates):**
- Audit H1: `__system__` bootstrap gap → §9 "Server-side bootstrap" block; §6 requirement row; §13 Next actions item 7; D8 rationale updated. `hocuspocus.openDirectConnection('__system__')` MUST fire before broadcaster enables.
- Audit M1: Seq recovery clarified in §9 — regression, late-arrival, in-flight coalesce protocol explicit.
- Audit M2 → D14 LOCKED: ProviderPool `pinned` flag; pin does not count toward `maxSize`.
- Audit M3: Cross-cutting skip surface centralized behind single `isSystemDoc()` helper — persistence, file-watcher, content-filter, reconciliation, backlink-index, agent-sessions, external-change, frontmatter cache ALL routed through it. §9 block + §16 SCOPE expanded accordingly (was 10 files, now 15).
- Audit M4: Layer-1 test path corrected from non-existent `packages/server/tests/integration/` to existing Tier-1 harness at `packages/app/tests/integration/cc1-broadcast.test.ts`.
- Audit M5 → D13 LOCKED: `__system__` reserved name policy. `ContentFilter` rejects `__system__.md`; `POST /api/create-page` returns 400.
- Audit M6: D12 phrasing tightened — in-memory but O(N) iteration, ~1-2 ms/1k files. Re-open trigger widened to include `resync × clients × list_size`.
- Audit L1/L2/L3: Hocuspocus citation framed as "public API"; SCOPE adds `main.tsx`, EXCLUDE adds TiptapEditor/observers/cli/docs.
- Design L6: §9 "Contract addendum" added — `v: 1` field, kebab-case flat namespace, malformed-payload policy (log+skip), explicit no-per-channel-auth.
- Design L7: §9 ETag rejection reframed honestly — CC1 constraint is primary reason, not freestanding technical argument.

**Reopened (5 items → consolidated user-facing batch):**
- Audit H2 + Design M3: 100 ms coalesce window unverified on Linux; slow-arrival bursts bypass resync sentinel.
- Design H1: `__system__` as cross-cutting leak. M3 correction centralizes skip via helper, but user should decide whether that's enough vs. reopening 3c (thin server-wide broadcast primitive).
- Design H2: Hybrid vs. pure-signal contract. Response size unmeasured; three of four client paths re-fetch anyway. Could measure `/api/documents` gzipped and reopen D7.
- Design M4: `update` exclusion breaks CC1-inheritance promise for V0-3 (backlinks need content-update signals).
- Design M5: Add narrow V0-2 Playwright test for sidebar DOM patch path (~30 lines) vs. rely on L1 + manual smoke until V0-4.

**Assumptions verified/archived:** A4, A5 promoted HIGH + verified by D14/D8 skip-surface work. A6 demoted LOW and flagged as ACTIVE (part of the reopen).

**Dismissed:** Audit L2 (citation tolerance).

## 2026-04-13 — All reopens resolved; spec finalized (session 1, Andrew)

**User direction:** fast path — all recommended answers.

**Load-bearing measurement captured:** `evidence/api-documents-size.md` — walked this repo's 1,807 `.md` files, serialized to `/api/documents` shape, measured **26 KB gzipped** (orig estimate 100 KB × 10 clients was 4× too conservative). This pivoted D7.

**Reopens resolved:**
- **R1 → D7 pivoted: pure signal.** `{v:1, ch, seq}` payload. Every signal → refetch canonical REST endpoint. Matches CC1 charter literally. Smallest possible inheritance surface for V0-3/V0-11. Extensible via `v:2` if V0-4 optimistic UI ever needs per-event info.
- **R2 → D9 rewritten: channel semantics owned by emitter.** `ch:'files'` fires on create/delete/rename. V0-3's `ch:'backlinks'` will fire from `persistence.ts` backlink-index update path (which naturally triggers on content-update). Contract stays flat; no `update` forced onto `ch:'files'`.
- **R3 → D10 simplified: trailing-edge debounce.** 100 ms, no threshold, no sentinel. Works uniformly on macOS FSEvents and Linux inotify. 200-file `git checkout` over 800 ms → exactly 1 signal. Eliminates audit H2 / challenge M3 failure mode.
- **R4 → D8 kept (accept option 4a).** `isSystemDoc()` helper makes skip mechanical across 8 subsystems. 3c (thin server-wide broadcast primitive) deferred — reopen if CC1 hits ≥5 channels.
- **R5 → D11 expanded.** V0-2 owns one narrow Playwright test (`cc1-sidebar.e2e.ts`, ~30 LOC) for sidebar DOM patch path. V0-4 owns the full L2 matrix for its added surface.

**Cascades applied:**
- §9 system design rewritten: new data-flow diagram (trailing-edge debounce, pure signal), new payload shape (`CC1Signal`), simplified sequence discipline (seq for dedup/observability, not gating), simplified coalescing text.
- §9 Alternatives considered rewritten: A (pure signal) is now the chosen design; former hybrid rejection reframed as "B" option rejected; 3c honestly framed as deferred not impossible.
- §6 Functional requirements rewritten: 14 rows (13 Must, 2 Should) — pure-signal semantics, debounce, Playwright, skip surface, bootstrap.
- §10 D7, D9, D10, D11 rationale + evidence + implications updated.
- §11 all reopens marked resolved with traceability.
- §12 A6 resolved (D10 rework made it moot).
- §13 Next actions: now 8 items (added L2 Playwright).
- §16 SCOPE already reflected the expanded file list from audit corrections.

**Status pivoted to Approved.** Ready for /ship.
