# Server-Authoritative Observer Bridge — Spec

**Status:** Ready for implementation (fresh-context ship recommended — estimated 3-4 days)
**Owner(s):** Nick Gomez
**Baseline commit:** `3eb50c2` (post-merge of PR #146 on `main` — bridge-convergence-under-concurrent-writes + 5 hardening commits all landed; `applyAgentMarkdownWrite`, `applyByPrefixSuffix` (core), `attachBridgeInvariantWatcher`, `Scheduler` DI, FR-17 fuzzer all present)
**Builds on:** `specs/2026-04-14-bridge-convergence-under-concurrent-writes/SPEC.md` (D1–D18 LOCKED — do not re-litigate; this spec extends the bridge architecture, it does not replace it)
**Downstream consumers:** All multi-client concurrent-writer workflows (WYSIWYG and source-mode symmetric)
**Links:**
- Debug report: `/debug` Phase 5 report (in `2026-04-14-bridge-convergence-under-concurrent-writes` ship's post-hardening transcript — root-cause Observer A multi-writer RGA-interleave)
- Prior-art synthesis (existing reports, no new research needed):
  - `reports/crdt-observer-bridge-latency-analysis/REPORT.md` — "dual-structure pattern unique to Open Knowledge"
  - `reports/source-toggle-architecture/REPORT.md` — Option I evaluation; concurrent-mode problem unsolved industry-wide
  - `reports/peritext-on-yjs-feasibility/REPORT.md` — Yjs 14 unified YType (months-out ecosystem blocker)
  - `reports/automerge-prosemirror-migration-assessment/REPORT.md` — not-worth-migration baseline
- Evidence: `./evidence/`
  - `root-cause-multi-writer-rga-interleave.md`
  - `rejected-alternatives.md`

---

## 1) Problem statement (SCR)

**Situation.** The 2026-04-14 bridge-convergence ship closed Bug-A (server-side `syncTextToFragment` destroying concurrent client XmlFragment content) and Bug-B (client Observer A's remote-tx baseline refresh absorbing local changes). All 14 user stories shipped; 22/22 QA scenarios validated. Post-ship `/assess-findings` surfaced a 2-4% convergence-timeout flake rate in the FR-17 multi-client fuzzer at `packages/app/tests/stress/bridge-convergence.fuzz.test.ts`. Initial working assumption was infra flake.

**Complication.** `/debug` investigation during post-ship hardening (captured in failing-seed snapshot `/var/folders/.../T/bridge-conv-fuzz-1776234488341/snapshot.json`) proved the flake is a **real production race, not a test artifact**: multiple clients' Observer A instances fire concurrently, each reads its local pre-CRDT-convergence view of Y.Text, each computes a delta via `applyByPrefixSuffix` (delete + insert at prefix boundary), and those concurrent writes interleave at Y.Text's RGA CRDT layer. The failing snapshot shows `M7-bravo alpha alpha` duplicated in Y.Text and `M5-echo` split across an interleaved M7 insertion — character-level evidence of RGA interleave from 2+ client writers.

Attempted tactical fixes and why each was rejected:

- **Option E (Observer B remote-reconcile at `observers.ts:608`):** Rejected. Once Y.Text has duplicates from the multi-writer race, a reconcile that rebuilds XmlFragment from Y.Text propagates the duplicates INTO XmlFragment. Bridge invariant holds with duplicates on both sides — wrong content. Does not prevent the race.
- **Option A (awareness-based leader election):** Rejected after research. Yjs awareness is gossip-based, not consensus-based. Network partitions produce two "leaders" that each write Y.Text; when partitions heal, the same race returns. 30s disconnect detection window also leaves bridge-invariant-violated gaps. No prior art in the Yjs ecosystem for awareness-based write coordination; community canonical answer is "server-enforced locks via backend."
- **Option C (stable per-paragraph IDs in Y.Text):** Rejected. Scan-then-insert is not atomic; two clients both scan for absence and both insert — race persists. Also incompatible with CodeMirror's expectation of raw markdown in Y.Text (ID cruft visible to users).
- **Option 2 (replace Y.Text with Y.Map):** Rejected. Loses character-level CRDT co-editing in source mode (two users typing on the same paragraph would LWW-clobber instead of merging char-level). Regression vs. current product behavior.
- **Last-write-wins at CRDT primitive layer:** Rejected by Y.Text's CRDT type. Y.Text is a sequence CRDT (RGA), not a register CRDT (LWW-Register). `delete-all + insert-new-value` concurrent operations produce character-level interleave, not latest-wins. No native LWW-at-value primitive exists in Y.Text.

The race is also **symmetric**. An analogous bug exists on the source-mode side: multiple clients' Observer B instances parse different local pre-merge Y.Text views into different ProseMirror trees, and `updateYFragment` applies independent tree updates to Y.XmlFragment → potentially duplicated/corrupted tree structure. The current fuzzer's 0.5% `source-type` op frequency hides this case; it is structurally present in production.

Both races share one root cause: **each client runs its own copy of the observer, reads its own pre-merge view of the source CRDT, and writes the derived CRDT**. Multiple concurrent writers on the derived CRDT merge at the CRDT protocol layer — which is designed to preserve all writers' intents, producing duplication when the "intent" was actually "the canonical full content."

**Resolution.** Relocate both observers to the **server** — a single coordination point that sees the CRDT-merged state and performs exactly one write to each derived CRDT per observed change. Client observers become no-op for the write side; they only refresh their `lastSyncedXmlMd` baselines for local reasoning (e.g., client-side source-mode typing still fires Observer B locally → XmlFragment CRDT → server). LWW-at-server semantics replace the broken multi-writer-at-client pattern. Preserves:

- Bidirectional observer API (clients still have `setupObservers`, still listen to both sides)
- Character-level CRDT co-editing in both WYSIWYG and source-mode (direct user writes to either CRDT still use their native CRDT semantics)
- All 3 bridge invariants (bridge, baseline, item-preservation)
- PR #128's origin-laundering fix (server's observer writes under a new `OBSERVER_SYNC_ORIGIN` with `skipStoreHooks: true`)
- The agent-write path (unchanged — `applyAgentMarkdownWrite` still writes both sides atomically; server observer sees no-op divergence)

Matches the Yjs community canonical pattern ("server-enforced locks via backend") and the research report `source-toggle-architecture/REPORT.md`'s framing of the concurrent-mode problem: the correct fix is single-writer coordination, implemented either via awareness-mode-locking (product UX cost) or server-authority (latency cost). Under the constraint "bidirectional observers stay" (user directive from the 2026-04-14 ship's post-hardening consultation), server-authority is the only viable path.

## 2) Goals

- **G1. Eliminate the Observer A multi-writer race by design.** After the refactor, no seed in the FR-17 fuzzer produces Y.Text RGA interleave from concurrent client WYSIWYG edits. The 2-4% convergence-timeout flake rate drops to 0% across 100 seeds at default distribution and under the new Mutation E (server-observer-attachment reverted) test.
- **G2. Eliminate the symmetric Observer B multi-writer race (structurally present, not currently triggered at visible rate).** After the refactor, concurrent source-mode edits on 2+ clients never produce duplicate/interleaved paragraphs in Y.XmlFragment. Validated via new C2 integration test + fuzzer rebalance raising `source-type` to 15% + `external-change` to 8% (previously 0.5% each — coverage-theater; see `specs/2026-04-14-bridge-convergence-under-concurrent-writes/meta/audit-findings.md` on the D18 coverage gate).
- **G3. Preserve bidirectional observer API.** `packages/app/src/editor/observers.ts` keeps `setupObservers(...)` exported, callers unchanged, `ORIGIN_TREE_TO_TEXT` and `ORIGIN_TEXT_TO_TREE` origins remain for client-side local-only observer firings. Client code reduction is a bonus (no per-client debounce juggling, no client-side baseline tracking for the write path), not a breaking change.
- **G4. Preserve char-level CRDT co-editing in both modes.** Two users typing in the same paragraph in source-mode still co-edit at character granularity via Y.Text's native RGA. Two users typing in the same paragraph in WYSIWYG still co-edit via Y.XmlFragment's internal Y.XmlText CRDT. The refactor only changes cross-representation sync, not intra-representation typing.
- **G5. Preserve PR #128's Item-origin invariant (no new origin-laundering surface).** Server observer writes under a new typed `OBSERVER_SYNC_ORIGIN` object. Client Y.UndoManager consumers (if any — V0-14's per-agent UM is server-side only, so unaffected) see the same origin semantics as today. Bridge-cycle origin preservation still enforced by FR-12 probe helpers from 2026-04-14 spec, now extended to include `OBSERVER_SYNC_ORIGIN` in the tracked set.
- **G6. LWW-at-server semantics are a feature, not a surprise.** Document at AGENTS.md precedent level that cross-CRDT state convergence is a single-point-of-coordination operation. Two concurrent WYSIWYG edits compose via XmlFragment CRDT (as today); the server then serializes the resulting merged state to Y.Text in one transaction. "Last XmlFragment state to reach server wins for Y.Text." Symmetric for source-mode.
- **G7. Server observer is cost-neutral to the pre-refactor client observer at equivalent state + delta.** This is a relocation-of-logic refactor, not a compute-adding refactor. Target: per-fire cost within 10% of client observer per-fire cost for the same document state + delta (measurable by instrumenting both paths during stress tests; client cost is currently measurable from pre-refactor code). Fails acceptance if any per-fire timing exceeds 2× the pre-refactor client baseline on any seed under the same inputs. Sampled in C1-C9 stress tests + FR-10 fuzzer. If the regression ceiling is systematically exceeded at target product scale (2-5 concurrent editors per doc, typical 1-2K-line docs), incremental serialization in the markdown pipeline (currently NG9) becomes a required follow-on spec. No absolute-percentage CPU target (the prior "<5% at 10 clients" was unsubstantiated).

## 3) Non-goals

- **[NEVER] NG1:** Eliminating the dual-CRDT model (Y.XmlFragment + Y.Text). That's a multi-week refactor (Yjs 14 unified YType per `reports/peritext-on-yjs-feasibility/`) with ecosystem-compatibility blockers (pre-release Yjs 14 vs. TipTap/Hocuspocus pins). Out of scope. Tracked as long-term: `projects/v0-launch/PROJECT.md` future-work entry to be added.
- **[NEVER] NG2:** Removing client-side observer firing for local-only paths. Client Observer B must still fire on local CodeMirror input (user typing in source mode) because the client owns the write to Y.Text for user-originated edits. Only the *cross-CRDT sync side* of each observer moves to the server.
- **[NEVER] NG3:** Re-litigating 2026-04-14 spec D1–D18 LOCKED decisions (Bug-A fix shape, Bug-B fix shape, `applyAgentMarkdownWrite` contract, AGENTS.md precedent #10 "XmlFragment authoritative"). This spec's server-authoritative pattern extends precedent #10 — the XmlFragment-authoritative contract now lives on the server, not the client.
- **[NEVER] NG4:** Introducing new CRDT types. D14 precedent (no new CRDT types without explicit spec decision) stands.
- **[NEVER] NG5:** Accessing Y.js internal Item structures. Public API only.
- **[NOT NOW] NG6:** Awareness-mode-locking as a product-UX-visible feature (source-mode exclusivity indicator per `reports/source-toggle-architecture/` Option I). Server-authority is the architecturally-correct-and-invisible-to-users answer; UX-mode-locking becomes a future product decision if collaborative source-mode editing proves problematic beyond what server-authority addresses.
- **[NOT NOW] NG7:** Optimizing server observer debounce beyond the client-ported 50ms. Advanced batching (e.g., adaptive debounce based on edit rate) is premature optimization — don't pre-build the mitigation before measurement confirms the need. Trigger to revisit: G7's per-fire regression ceiling (2× pre-refactor client baseline) is systematically exceeded at target product scale.
- **[NOT NOW] NG8:** Multi-server deployments (horizontal scaling of Hocuspocus). Assumes single authoritative server per document — already the current deployment model.
- **[NOT NOW] NG9:** Markdown pipeline incremental serialization. `mdManager.serialize` serializes the full mdast tree each call — cost scales with document size. The server observer uses this as a black box. `remark-stringify` is not natively range-composable (block-level context — list nesting, heading levels, inter-block spacing — depends on siblings), so partial serialization would require reworking the markdown pipeline. Not in scope. If G7's acceptance criterion (per-fire regression ≤ 2× client baseline) is systematically exceeded at target scale, a separate spec addresses the markdown pipeline — that refactor affects persistence, file-watcher, agent-write, and every other serializer, not just the server observer.
- **[NEVER] NG10:** Feature flag for client-mode vs. server-mode coexistence. Rejected. This is a monorepo; client and server deploy atomically as one unit. A runtime flag would exist only to let the known-broken client-authoritative architecture coexist with its fix — precedent #7 ("Remove broken capabilities rather than shipping them") applies. Rollback is via git revert of the PR, not via flag toggle. Deleting the flag surface simplifies the spec (no handshake, no awareness broadcast, no gossip-window race to mitigate, no mid-session flip edge cases) and reduces scope. See SA-D5 (revised).

## 4) Personas / consumers

- **P1: Two-or-more concurrent WYSIWYG users.** Two browser tabs on the same doc, typing simultaneously. Expects: both contributions end up in both XmlFragment and Y.Text on both clients, no duplication, no interleave. Today: 2-4% of fuzzer seeds show Y.Text duplicates. Post-refactor: 0% (verified via C1 test + Mutation E).
- **P2: Two-or-more concurrent source-mode users.** Two browser tabs editing the markdown source. Expects: both contributions end up in both representations, character-level CRDT co-editing preserved when editing the same paragraph. Today: structural race present (uncaught by fuzzer at 0.5% op frequency). Post-refactor: C2 test validates; fuzzer rebalance exercises at 15%.
- **P3: Mixed-mode collaborators.** Client A in WYSIWYG, Client B in source mode, concurrent. Expects: both contributions end up in both representations. Today: hidden race; post-refactor: C3 test validates.
- **P4: AI agent via MCP/API (V0-14 downstream).** Writes via `/api/agent-write*` or `/api/agent-patch`. Path unchanged — `applyAgentMarkdownWrite` still does the atomic server-side compose. Server observer sees the paired XmlFragment+Y.Text update and early-exits (already-in-sync check). No new bug surface. V0-14's per-agent UM (server-side) tracks `AGENT_WRITE_ORIGIN` Items on Y.Text exactly as today; undo still correct. Validated via C4 test (existing FR-4 harness re-used under new architecture).
- **P5: AI agent writing concurrently with human typing.** (C5 — new symmetric case.) Agent-write lands on server; concurrent user source-mode CodeMirror edits land on server. Expects: both preserved. Today: analogous to Bug-A on the source-mode side; post-refactor: C5 test validates.
- **P6: Observer pipeline developer.** Next person touching `observers.ts` or the new `server-observers.ts`. Inherits the new AGENTS.md precedent #14 (FR-12): "Cross-CRDT sync is single-writer, server-side. Client observer cross-CRDT write paths are deleted (not gated). Local-only observer firings for user-originated direct writes to their source CRDT still run client-side because the client is the sole writer for that local edit; the server then mirrors to the derived CRDT."

## 5) User journeys

### Primary happy path — concurrent WYSIWYG (Bug-A'-prime, the uncaught race)

1. Client A and Client B both have the doc open in WYSIWYG. Client A types "Hello" at end of line 5; Client B types "World" at end of line 5.
2. Both clients' TipTap writes to their local Y.XmlFragment. CRDT tree sync propagates both edits to the server and peer.
3. Under legacy architecture: each client's Observer A fires on its own local XmlFragment change, reads its local pre-merge Y.Text, writes deltas → Y.Text RGA interleaves → duplicates.
4. **Under server-authoritative:** client observers do NOT write Y.Text. Server's Observer A (new) fires on XmlFragment changes (both `local=true` server-side edits like `applyAgentMarkdownWrite` AND `local=false` remote edits arriving from clients). Server sees the CRDT-merged XmlFragment (both "Hello" and "World" present), serializes, writes Y.Text once under `OBSERVER_SYNC_ORIGIN`.
5. Y.Text update propagates to both clients via CRDT. Client observer callbacks fire on the remote Y.Text change; client Observer B's code path for remote transactions is unchanged (early-exits; baseline refresh only). Client Observer A's code path for remote XmlFragment remains (baseline refresh only — per Bug-B fix in 2026-04-14 spec).
6. Both clients see the correct combined Y.Text on next CodeMirror render.
7. **Zero duplicates. LWW at server.** Server CPU cost per edit burst: one extra parse+serialize pass (bounded by debounce).

### Symmetric path — concurrent source-mode (C2 — new test class)

1. Client A and Client B both have the doc open in source mode. Both type at the end of the same paragraph concurrently.
2. Both clients' CodeMirror writes to their local Y.Text via `y-codemirror.next`. Y.Text's RGA CRDT handles concurrent char-level writes correctly (this is Y.Text's native strength).
3. Under legacy architecture: each client's Observer B fires on its own local Y.Text change, parses its local pre-merge markdown into a ProseMirror tree, calls `updateYFragment` on Y.XmlFragment → XmlFragment CRDT receives independent tree updates → potential duplication if the parses produced different tree structures.
4. **Under server-authoritative:** client Observer B's write path to XmlFragment is deleted (FR-7 — no flag; writes simply removed). Server's Observer B (new) fires on Y.Text changes, parses the CRDT-merged Y.Text markdown, runs `updateYFragment` once server-side under `OBSERVER_SYNC_ORIGIN`.
5. XmlFragment update propagates to both clients. Clients' TipTap renders the updated tree. Bridge invariant holds.
6. **Zero duplicates.** Char-level co-editing in the paragraph preserved (Y.Text RGA merged correctly before server Observer B ran).

### Mixed-mode path — C3

1. Client A in WYSIWYG, Client B in source-mode, concurrent edits.
2. Client A's edit propagates to server via XmlFragment CRDT. Client B's edit propagates to server via Y.Text CRDT.
3. Server's Observer A fires on the XmlFragment change → writes Y.Text (capturing A's edit into Y.Text). Server's Observer B fires on B's Y.Text change → writes XmlFragment (capturing B's edit into XmlFragment).
4. Origin guards prevent infinite loop: server Observer A writes under `OBSERVER_SYNC_ORIGIN`; server Observer B's callback skips `OBSERVER_SYNC_ORIGIN`-origin transactions. Symmetric for the other direction.
5. Both edits end up in both representations. Convergence.

### Agent + concurrent user (C4/C5)

Unchanged from 2026-04-14 spec's `P0-stress` test. Agent path goes through `applyAgentMarkdownWrite` which writes both sides atomically server-side under `AGENT_WRITE_ORIGIN`. Server observer sees the paired update and early-exits (already-in-sync). Concurrent user content preserved. Symmetric for agent + concurrent source-mode user (new C5 case).

### Failure-path journeys

- **Server restart mid-edit.** Server observers detach. New server loads doc from disk (persistence has the last-saved canonical state). Server observers attach fresh; first fire on-load compares XmlFragment vs. Y.Text, early-exits (in-sync from persistence). Clients reconnect; any local pending edits propagate via CRDT, server observers fire as normal. No divergence.
- **Client disconnects mid-edit.** Client's local CRDT state buffers unsent updates. On reconnect, CRDT sync propagates. Server observer fires. Convergence.
- **Server unreachable while client types WYSIWYG.** Client-local XmlFragment updates. Under server-authoritative, client does NOT write Y.Text locally. During disconnect, Y.Text receives no updates (server unreachable; client gated). **Mode-switch to source mode is blocked while disconnected** (FR-7a): the UI disables the source-mode toggle when `provider.status !== 'connected'` and shows a tooltip: "Source mode requires a live connection — your edits are saved and will appear when you reconnect." This prevents three failure modes that would otherwise occur: (a) user sees arbitrarily-stale Y.Text content that looks like their recent edits but isn't; (b) user edits stale content and that gets clobbered by server-authoritative Y.Text on reconnect; (c) user misunderstands the sync state. Alternatives evaluated and rejected: warning-banner-on-mode-switch (users don't read warnings, edit collisions still occur); hybrid local-display fallback (silent edit loss on reconnect when server overwrites local Y.Text — worst failure mode for an editor); fall-back to client-authoritative mode when disconnected (reintroduces multi-writer race on reconnect). Block-mode-switch is the only option that guarantees both correctness and no-silent-work-loss.

## 6) Requirements

### Functional requirements

| Priority | ID | Requirement | Acceptance criteria |
|---|---|---|---|
| Must | FR-1 | `setupServerObservers({ doc, xmlFragment, ytext, mdManager, schema, scheduler })` module in `packages/server/src/server-observers.ts`. Mirrors the client-side observer bridge's write-side logic (Observer A: XmlFragment→Y.Text via `applyByPrefixSuffix`; Observer B: Y.Text→XmlFragment via `updateYFragment`). Runs on the server's copy of the Y.Doc. Must also port the frontmatter sync logic from client Observer B (`observers.ts:500-513`): server Observer B reads `stripFrontmatter(md)` and writes `Y.Map('metadata').set('frontmatter', ...)`; server Observer A reads `Y.Map('metadata').get('frontmatter')` and prepends it when serializing XmlFragment→Y.Text. | Module exports `setupServerObservers(opts) => cleanup`. Attached via new `createServerObserverExtension()` wired in `standalone.ts` per-document at `afterLoadDocument` time (SA-D9). Per-document cleanup on `afterUnloadDocument`. See §7b for the `openDirectConnection` lifecycle pattern. |
| Must | FR-2 | New origin constant `OBSERVER_SYNC_ORIGIN: LocalTransactionOrigin = { source: 'local', skipStoreHooks: true, context: { origin: 'observer-sync' } }` exported from `packages/server/src/server-observers.ts`. Server observer writes use this origin exclusively. | Declared as `satisfies LocalTransactionOrigin`. Object reference (not string) per precedent #1. `skipStoreHooks: true` prevents observer → persistence → file-watcher → observer feedback loop (EC4 blocker resolution). Test: server observer write does NOT trigger persistence.onStoreDocument. |
| Must | FR-3 | Server Observer A baseline + debounce: per-document `lastSyncedXmlMd` string + 50ms debounce matching client-side semantics. Debounce implemented via injected `Scheduler` (2026-04-14 FR-15 abstraction; use `defaultScheduler` in production, `ManualScheduler` in tests). Baseline refresh follows the same conditional rule as the client Bug-B fix: refresh only when no local debounce is pending. | EC2/EC7 blocker resolution. Unit tests in `packages/server/src/server-observers.test.ts`: (a) rapid XmlFragment changes coalesce into one Y.Text write, (b) baseline-refresh conditional rule matches client behavior, (c) Path A vs. Path B dispatch matches client `observers.ts` logic when Y.Text is in-baseline vs. diverged. |
| Must | FR-4 | Server Observer B baseline + debounce: symmetric to FR-3, but per-document `lastSyncedYText` string + 50ms debounce for Y.Text→XmlFragment path. Debounce via same injected Scheduler. | Symmetric tests to FR-3. |
| Must | FR-5 | Origin-guard cross-checks in server observers. Server Observer A callback returns early if `transaction.origin === OBSERVER_SYNC_ORIGIN` OR `transaction.origin === AGENT_WRITE_ORIGIN` with `transaction.local` (already-paired-write) OR `transaction.origin === FILE_WATCHER_ORIGIN` with already-paired-write check. Symmetric for Observer B. | Table-test (one case per origin × direction combination). No infinite loop. No double-write under `applyAgentMarkdownWrite` (server Observer A sees XmlFragment already-matches-Y.Text → early-exit). |
| Must | FR-6 | `applyExternalChange` in `packages/server/src/external-change.ts` calls `setReconciledBase(docName, content)` after its atomic XmlFragment+Y.Text write, so persistence does not re-serialize and re-write the same content on next flush. | EC3 blocker resolution. Test: file-watcher-driven external change does NOT trigger a disk re-write within the persistence debounce window (measured via spy on `fs.writeFile` count). |
| Must | FR-7 | **Delete** client Observer A/B write paths in `packages/app/src/editor/observers.ts`. The `ytext.delete/insert` calls in Observer A's runObserverASync (Path A `applyIncrementalDiff` + Path B `applyUserDelta` result application) and the `updateYFragment` call in Observer B's runObserverBSync are removed entirely — not gated behind a flag. Client observer callbacks still fire to maintain `lastSyncedXmlMd` / `lastSyncedYText` baselines for local reasoning and to let the debounce-scheduling/typing-defer machinery continue to work, but the cross-CRDT write is simply no longer performed by the client. Local-only firings (user source-mode CodeMirror input → writes directly to Y.Text; the Y.Text tx triggers remote sync to server) still exist — they drive the direct CRDT writes that the server observer then mirrors. | Client `observers.test.ts` updated: every test that previously asserted "Observer A wrote to Y.Text on local XmlFragment edit" is inverted to assert "no client-origin ORIGIN_TREE_TO_TEXT / ORIGIN_TEXT_TO_TREE transactions appear for cross-CRDT sync." Bridge invariant still asserted via FR-11 watcher. Net client `observers.ts` LOC reduction ~200 (no write paths, no gate machinery). |
| Must | FR-7a | **Block mode-switch when disconnected.** UI in `packages/app/src/components/` (editor mode toggle component) disables the source-mode toggle when `provider.status !== 'connected'`. Tooltip: "Source mode requires a live connection — your edits are saved and will appear when you reconnect." Enabled again on provider reconnect. | Playwright E2E: simulate server disconnect, verify source-mode toggle disabled + tooltip shown; reconnect, verify toggle re-enabled. Unit test on the toggle component with mocked provider status. |
| Must | FR-8 | Migration for standalone/dev mode: Vite plugin's server-extension loader (`packages/app/src/server/hocuspocus-plugin.ts`) includes the new `createServerObserverExtension`. Atomic deploy — the same PR lands server extension + client write-path deletion + FR-7a UI change. No feature flag (see NG10, SA-D5). | Dev-server smoke test: start `bun run dev`, type in two browser tabs, no duplication in Y.Text. Smoke test: kill server, verify source-mode toggle disables; restart, verify toggle re-enables. |
| Must | FR-9 | Fuzzer rebalance (supersedes 2026-04-14 spec's FR-17 D18 gate #3 plan): in `packages/app/tests/stress/bridge-convergence.fuzz.test.ts`, op distribution changes to `source-type: 15%`, `external-change: 8%`, `wysiwyg-type: 25%` (was 30%), `agent-write: 15%`, `agent-patch: 8%`, `sync-pause: 12%`, `sync-resume: 12%`, `wait: 5%`. D18 coverage gate #3 requires each write surface fires ≥1 time cumulatively per 25-seed run. | Cumulative op counter shows every surface ≥1 across seeds. At elevated `source-type`/`external-change` rates, existing seeds continue to pass post-refactor (proves symmetric fix, not just Observer A fix). |
| Must | FR-10 | Nine new integration tests (C1–C9) in `packages/app/tests/integration/`: **C1** `c1-concurrent-wysiwyg.test.ts` (2-3 clients WYSIWYG same-line); **C2** `c2-concurrent-source.test.ts` (2-3 clients source-mode same-paragraph); **C3** `c3-mixed-mode.test.ts` (A WYSIWYG + B source-mode); **C4** `c4-agent-plus-wysiwyg.test.ts` (re-use 2026-04-14 `bridge-convergence-regression.test.ts` harness under new architecture); **C5** `c5-agent-plus-source.test.ts` (agent-write + concurrent source-mode); **C6** `c6-mode-switch-mid-debounce.test.ts` (client switches WYSIWYG→source while server has pending 50ms Observer A debounce — tests that the debounced Y.Text write doesn't race the client's subsequent direct source-mode writes); **C7** `c7-disconnect-reconnect-burst.test.ts` (multiple clients disconnect with local edits, reconnect simultaneously, buffered states merge at server, server observer fires on merged result — partition recovery); **C8** `c8-triple-concurrent.test.ts` (file-watcher external change + agent write + human WYSIWYG typing simultaneously — exercises the origin-guard truth table across all 3 origins); **C9** `c9-join-mid-debounce.test.ts` (new client joins while server observer has pending debounce — initial sync sees partial state, transient-state handling). All 9 are Must (greenfield: deterministic regression gates for every unique code path). Oracle per test: full-body content preservation + FR-11 invariant watcher + FR-12 origin probe. | C1-C9 all pass under the new architecture. C1-C5 FAIL (as expected) if FR-7 write-path deletion is reverted (validates the deletion is load-bearing, not decorative). C6 FAILS if server observer debounce doesn't respect mode-switch. C8 FAILS if any origin-guard row in §7d is wrong. |
| Must | FR-11 | Mutation tests E + F + G (supersede 2026-04-14 spec's Mutation tests A-D as this spec's validation gates): **(E)** revert server Observer B attachment → C2 + concurrent-source-mode fuzzer seeds fail with XmlFragment duplicates. **(F)** revert server Observer A's `skipStoreHooks: true` → persistence-feedback-loop detected as disk-write thrashing (measurable via `fs.writeFile` spy count >N per edit). **(G)** revert the FR-7 deletion of client Observer A/B write paths (restore the pre-spec behavior where `observers.ts` writes Y.Text / XmlFragment) → C1, C2, C3 all fail with multi-writer RGA interleave / concurrent-tree-update corruption. Validates that the client write-path deletion is load-bearing (most-likely regression path: someone "cleans up" and re-adds the writes). | All three mutations catch at 100% on applicable seeds. Documented in `meta/mutation-validation.md`. E and F validate server-side components; G validates the client-side deletion. Together they form a complete validation triangle. |
| Should | FR-12 | AGENTS.md / CLAUDE.md precedent addition (new precedent #14, after #11 "Minimize CRDT mutation in sync bridges", #12 "XmlFragment is authoritative", and #13 "Bridge invariants are auto-enforced" — all added by 2026-04-14 spec): "**Cross-CRDT sync is single-writer, server-side.** Bidirectional observer pairs between Y.XmlFragment and Y.Text must run exclusively on the server. Client-side observer callbacks for cross-CRDT sync do not write the derived CRDT — the write paths are removed, not gated (a flag would be ceremony in a monorepo with atomic client+server deploy). Local-only observer firings (user CodeMirror edit → writes Y.Text directly; user TipTap edit → writes Y.XmlFragment directly) still run client-side because the client is the sole writer for that local edit's source CRDT; the server then mirrors to the derived CRDT. Why: client-side multi-writer bridges interleave at the CRDT protocol layer, producing duplication under concurrent edits (see `specs/2026-04-15-server-authoritative-observer-bridge/`). Applies to all dual-CRDT bridge work." | Precedent text committed in CLAUDE.md + AGENTS.md. Referenced by future observer-related work. |
| Should | FR-13 | Stress test: 5-10 clients × 30-60s of randomized mixed WYSIWYG+source edits → convergence + no duplicates + per-fire timing instrumentation (for G7 acceptance: per-fire cost within 10% of pre-refactor client baseline, reject if any per-fire timing exceeds 2× baseline). | Dedicated stress harness in `packages/app/tests/stress/server-authoritative-stress.test.ts`. G7 budget acceptance met. |

### Non-functional requirements

| Area | Requirement | Acceptance |
|---|---|---|
| Performance | Full cross-CRDT-visibility path: (1) client write → source CRDT (local, ~0ms); (2) CRDT sync to server over WebSocket (~10-30ms network); (3) server observer debounce (0-50ms, worst-case trailing edge); (4) server compute delta + serialize + write derived CRDT (~5-25ms for small docs <1K lines, up to ~370ms for 10K-line docs per `crdt-observer-bridge-latency-analysis` report); (5) CRDT sync to client (~10-30ms); (6) render (~0ms). Total: 25ms best case (small doc, debounce already fired); 60-120ms typical case; 400-500ms worst case on large docs. The +50ms framing elsewhere in this spec refers to the debounce-added component only. | Latency measured in C3 test; target <150ms p95 for documents <2K lines. Documents >5K lines likely exceed 200ms p95 — acceptable given source-mode is a secondary view and large docs are rare in the target product shape. |
| Reliability | Server restart does not produce divergence. Persistence has atomic flush; on reload, XmlFragment and Y.Text load from canonical disk state. | Integration test: kill + restart server mid-edit burst → state converges on reconnect. |
| Security | No new network surface; all cross-CRDT sync goes through existing Hocuspocus WebSocket. No new auth boundary. | Unchanged from current architecture. |
| Operability | Metric: `server_observer_fires_total{direction=a|b}` counter added to `metrics.ts`. Dashboard panel: fires/sec per document to spot runaway loops. | Metrics endpoint updated. |
| Cost | Per-fire compute cost within 10% of pre-refactor client observer baseline at equivalent state + delta (G7). Memory: O(documents × 2 × baseline-string-size) — typically <10KB per document (`lastSyncedXmlMd` + `lastSyncedYText` per loaded doc). | Measured in dev + stress via timing instrumentation added as part of this spec. Absolute CPU-% targets deliberately omitted — they were unsubstantiated in the prior spec iteration. |

## 7) Proposed solution — design details

### 7a. Server observer module shape

```ts
// packages/server/src/server-observers.ts
export interface SetupServerObserversOpts {
  doc: Y.Doc;
  xmlFragment: Y.XmlFragment;
  ytext: Y.Text;
  mdManager: MarkdownManager;
  schema: Schema;
  scheduler?: Scheduler; // defaults to defaultScheduler
}

export const OBSERVER_SYNC_ORIGIN: LocalTransactionOrigin = {
  source: 'local',
  skipStoreHooks: true,
  context: { origin: 'observer-sync' },
};

export function setupServerObservers(opts: SetupServerObserversOpts): () => void {
  // Port client-side observers.ts structure, with these deltas:
  //  - Origin write: OBSERVER_SYNC_ORIGIN (not ORIGIN_TREE_TO_TEXT)
  //  - Guard list includes OBSERVER_SYNC_ORIGIN + AGENT_WRITE_ORIGIN + FILE_WATCHER_ORIGIN (already-paired checks)
  //  - No typing-defer (server never "types"; typing-defer was a client-specific UX concern)
  //  - No REMOTE_TREE_SYNC_GRACE_MS — the server's origin guard (OBSERVER_SYNC_ORIGIN
  //    self-skip) eliminates the cascade that the 150ms client grace window exists to
  //    prevent. Server Observer B never needs to wait for Server Observer A because
  //    cross-observer writes are origin-guarded, not timing-guarded.
  //  - Must port frontmatter sync (observers.ts:500-513): Observer B reads
  //    `stripFrontmatter(md)` and writes Y.Map('metadata').set('frontmatter', ...);
  //    Observer A reads Y.Map('metadata').get('frontmatter') and prepends on serialize.
  //  - Runs on BOTH transaction.local=true (server-local writes like applyAgentMarkdownWrite)
  //    AND transaction.local=false (remote-arrived updates from clients)
  //  - Correctness relies on the JavaScript single-threaded event loop for atomic
  //    read-compose-write sequencing (see A6). Node.js/Bun guarantee this today.
}
```

**Event-loop serialization guarantee for V0-14 and agent writes:** `applyAgentMarkdownWrite` runs as a synchronous `doc.transact()` block; server Observer A/B fire as subsequent `setTimeout` callbacks. No interleaving is possible — these are atomic event-loop tasks. V0-14's future `applyAgentUndo` inherits this guarantee; no defensive locking or sequencing needed.

### 7b. Hocuspocus extension wiring

Per SA-D12, use `openDirectConnection` to get the Y.Doc handle (consistent with `agent-sessions.ts`; provides connection-count lifecycle and explicit teardown via `DirectConnection.disconnect()`).

```ts
// packages/server/src/server-observer-extension.ts
type PerDocCleanup = {
  connection: Awaited<ReturnType<Hocuspocus['openDirectConnection']>>;
  unsubscribe: () => void;
};

export function createServerObserverExtension(opts: {
  hocuspocus: Hocuspocus;
  mdManager: MarkdownManager;
  schema: Schema;
}): Extension {
  const cleanups = new Map<string, PerDocCleanup>();
  return {
    async afterLoadDocument({ documentName }) {
      if (isSystemDoc(documentName)) return; // skip __system__
      const connection = await opts.hocuspocus.openDirectConnection(documentName);
      const doc = (connection as { document: Y.Doc }).document;
      const xmlFragment = doc.getXmlFragment('default');
      const ytext = doc.getText('source');
      const unsubscribe = setupServerObservers({
        doc, xmlFragment, ytext,
        mdManager: opts.mdManager,
        schema: opts.schema,
      });
      cleanups.set(documentName, { connection, unsubscribe });
    },
    async afterUnloadDocument({ documentName }) {
      const c = cleanups.get(documentName);
      if (!c) return;
      c.unsubscribe();
      await c.connection.disconnect();
      cleanups.delete(documentName);
    },
  };
}
```

Wired in `standalone.ts` via `configuration.extensions.push()` alongside the existing `persistence.extension`, `liveDerivedIndexExtension`, and `apiExtension`. `CC1Broadcaster` and `AgentSessionManager` are standalone classes, not Hocuspocus extensions — they are not in this group.

### 7c. Client observer — cross-CRDT write paths deleted (not gated)

`packages/app/src/editor/observers.ts` loses its cross-CRDT write paths entirely. No `serverAuthoritativeMode` flag — the writes are simply removed, because in a monorepo with atomic client+server deploy there is no "legacy mode" to coexist with (see NG10, SA-D5).

**Observer A `runObserverASync` changes:**
- Still fires on XmlFragment changes.
- Still maintains `lastSyncedXmlMd` (used for baseline-refresh reasoning and for the Bug-B conditional-refresh logic from 2026-04-14 spec — this logic remains client-side because it's about detecting when a REMOTE XmlFragment update should/shouldn't refresh the baseline, which is still relevant for future work even without the write path).
- **Delete:** the `doc.transact(() => { applyByPrefixSuffix(ytext, currentText, newText) }, ORIGIN_TREE_TO_TEXT)` call — the cross-CRDT write itself. Both Path A (`applyIncrementalDiff`) result-application and Path B (`applyUserDelta`) three-way merge result-application stop mutating Y.Text.
- Keep: the origin guards in the observer callback (so the callback doesn't fire on its own prior writes — vestigial under the new architecture but cheap and defensive).

**Observer B `runObserverBSync` changes:**
- Still fires on Y.Text changes.
- Still maintains `lastSyncedYText`.
- **Delete:** the `updateYFragment(doc, xmlFragment, pmNode, meta)` call under `ORIGIN_TEXT_TO_TREE` — the cross-CRDT write.
- Keep: the origin guards.

**Local-only observer firings remain:** when a user types in source-mode, CodeMirror writes Y.Text directly (this is the user's source-mode CRDT write, not an observer write). That Y.Text transaction propagates to the server via CRDT sync; the server's Observer B fires on the server-side Y.Text change and mirrors to Y.XmlFragment. Symmetric for WYSIWYG.

**Net client `observers.ts` LOC reduction:** approximately 200 lines (two transact-blocks plus their error handling + related scheduler management for the cross-CRDT write path). Client observer code simplifies significantly — the debounce juggling for the write side was the most complex part of the prior logic.

**Rollback story:** git revert of the PR. No flag; no toggle. Greenfield principle: don't ship a knob that lets the broken capability coexist with the fix.

### 7d. Origin-guard truth table (updated)

| Transaction Origin | Server Observer A (tree→text) | Server Observer B (text→tree) |
|---|---|---|
| `OBSERVER_SYNC_ORIGIN` (server self-writes) | — (self) | SKIP |
| `AGENT_WRITE_ORIGIN` (applyAgentMarkdownWrite paired-write) | Sync (but early-exit: already-in-sync) | Sync (but early-exit: already-in-sync) |
| `FILE_WATCHER_ORIGIN` (applyExternalChange paired-write) | Sync (early-exit via setReconciledBase + already-in-sync) | Sync (early-exit) |
| `ROLLBACK_ORIGIN` (not in current use; future) | Sync | Sync |
| Remote-arrived (no origin / Yjs internal; `local=false`) | Sync | Sync |

Client observer truth table **unchanged** from 2026-04-14 spec — except that the write paths under `ORIGIN_TREE_TO_TEXT` and `ORIGIN_TEXT_TO_TREE` no longer exist (FR-7 deletes them). The observer callback still fires and still respects origin guards for baseline-tracking purposes; it just doesn't write the derived CRDT anymore.

### 7e. Rollout sequence (atomic deploy)

This spec lands as **one atomic PR**. No feature flag, no staged rollout, no runtime mode switch (see NG10, SA-D5). The PR contains, as a single unit:

1. **Server-side additions:** `setupServerObservers` (FR-1) + `OBSERVER_SYNC_ORIGIN` (FR-2) + baseline/debounce machinery (FR-3, FR-4) + origin guards (FR-5) + `applyExternalChange` setReconciledBase fix (FR-6) + extension wired via `configuration.extensions.push()` (FR-8) + Vite-plugin migration.
2. **Client-side deletions:** Cross-CRDT write paths removed from `observers.ts` (FR-7).
3. **Client-side UI addition:** Source-mode toggle disabled when disconnected (FR-7a).
4. **Test additions:** C1-C9 (FR-10) + Mutation E/F/G (FR-11) + fuzzer rebalance (FR-9) + stress harness (FR-13).
5. **Docs:** AGENTS.md precedent #14 (FR-12), NG9/NG10, SA-D5/SA-D13, A7 assumption.

**Validation before merge:**
- `bun run check` green
- `bun run check:full:parallel` green (18 tasks)
- C1-C9 all pass
- Mutation E/F/G all catch
- FR-13 stress harness: per-fire timing p95 within 2× pre-refactor client baseline
- FR-9 fuzzer: 100 seeds at rebalanced distribution all pass

**Rollback:** git revert of the PR if any post-merge incident. Same operational primitives as any other PR; no bespoke rollback mechanism needed.

**What is NOT in this rollout:** Feature flag, awareness broadcast, connection handshake mode field, mid-session mode flip handling, client-mode coexistence semantics — all removed from the design (see NG10). This collapses the original 6-phase rollout into a single deploy unit. The original rollout's complexity was pure ceremony in a monorepo context.

## 8) Current state (at spec time)

- **Main baseline:** `3eb50c2` (merge of PR #146 — bridge-convergence-under-concurrent-writes + 5 hardening commits landed atomically on main).
- **Legacy write paths still in place.** `observers.ts` Observer A writes Y.Text under `ORIGIN_TREE_TO_TEXT`; Observer B writes XmlFragment under `ORIGIN_TEXT_TO_TREE`. Both client-side. **This spec deletes those write paths entirely** and relocates the logic to the server.
- **`applyAgentMarkdownWrite` at `agent-sessions.ts`** (FR-1 of 2026-04-14 spec) writes both sides atomically under `AGENT_WRITE_ORIGIN`. Compatible with the new architecture — server observer sees the paired write and early-exits.
- **`applyExternalChange` at `external-change.ts`** writes both sides atomically under `FILE_WATCHER_ORIGIN`. Needs minor extension: `setReconciledBase` call post-write (FR-6 of this spec; EC3).
- **Hocuspocus extension infrastructure.** `standalone.ts:845` pre-materializes `__system__` via `openDirectConnection` (variable declared at line 213; call at line 845). Same pattern used for new server-observer extension (per-document `openDirectConnection` at `afterLoadDocument`).
- **`ManualScheduler`** available in tests (interface at `packages/app/tests/integration/test-harness.ts:587`; factory `createManualScheduler()` at `test-harness.ts:601`) from 2026-04-14 FR-15. Server observer tests can reuse.
- **Test primitives from 2026-04-14 spec** (`attachBridgeInvariantWatcher`, `createItemOriginProbe` with `assertOnlyTrackedOrigins`, `getServerState`, `createTestClients` + `assertAllConverged`, `ManualScheduler` + `Scheduler.now()` clock unification, `ControllableWebSocket` for sync control) are all present on main and reusable by the C1-C9 tests in this spec. These test-harness additions are orthogonal to client- vs. server-authoritative; they work for both.

## 9) Decision log

| ID | Decision | Status | Rationale |
|---|---|---|---|
| SA-D1 | Observers run on server, not client, for cross-CRDT sync | LOCKED | Only single-writer design that preserves bidirectional observer API, supports unlimited concurrent clients, and matches Yjs community canonical "server-enforced locks" pattern. Evaluated and rejected: awareness leader-election (no consensus), per-paragraph IDs (not atomic), Y.Map replacement (loses char-level). See `evidence/rejected-alternatives.md`. |
| SA-D2 | Preserve bidirectional observer API (setupObservers stays) | LOCKED | User directive (2026-04-14 ship post-hardening consultation): "moving away from bidirectional observers is not an option." Constraint respected. |
| SA-D3 | New origin `OBSERVER_SYNC_ORIGIN` with `skipStoreHooks: true` | LOCKED | EC4 blocker; prevents persistence → file-watcher → observer feedback loop. `skipStoreHooks` precedent already in `FILE_WATCHER_ORIGIN`. |
| SA-D4 | Debounce = 50ms server-side, matching client | LOCKED | Coalesces rapid edit bursts. Same value as client `DEBOUNCE_MS`. No evidence a different value is needed server-side. |
| SA-D5 | **No runtime feature flag.** Atomic PR deploy; client write-path deletion + server observer landing + UI disconnect-block all in one unit. Rollback via git revert. | LOCKED (revised 2026-04-15 after audit — was "flag via env var + awareness broadcast") | The original flag existed to let broken and fixed architectures coexist during staged rollout. In a monorepo with atomic client+server deploy, there is no staged rollout — client and server ship from the same PR. Precedent #7: "Remove broken capabilities rather than shipping them." Deleting the flag eliminates: (a) gossip-window race during awareness convergence (challenger C-H1); (b) mid-session flip edge cases; (c) client-side mode-detection code; (d) handshake extension; (e) ceremony. Rollback via git revert is the same primitive used for every other PR. See NG10 for full rationale. |
| SA-D6 | Client observer cross-CRDT write paths **deleted, not gated.** Observer A/B callbacks still fire (baseline tracking, origin guards), but the `ytext.delete/insert` + `updateYFragment` calls are removed. | LOCKED (revised 2026-04-15 after audit — was "gated behind `if (!serverAuthoritativeMode)`") | Follows from SA-D5 (no flag). Without a flag, there's nothing to gate on. Deletion is cleaner and smaller than gating. ~200 LOC reduction in `observers.ts`. Baseline-refresh logic stays for potential future re-use (read-side reasoning about Path A/B dispatch) and because removing it changes origin-guard semantics in ways that aren't load-bearing but risk subtle breakage; keep defensively. |
| SA-D7 | No new CRDT types | LOCKED | D14 precedent from prior specs. This is purely a relocation of logic. |
| SA-D8 | `applyExternalChange` gets `setReconciledBase` | LOCKED | EC3 blocker. Small-surface fix. Complements existing persistence-debounce reconciliation. |
| SA-D9 | Server Observer A/B use `afterLoadDocument`, not `onLoadDocument` | LOCKED | `afterLoadDocument` fires after persistence has loaded canonical state into the doc. Attaching observers earlier would see an empty doc and fire spurious "divergence" writes. |
| SA-D10 | Mutations E + F + G are this ship's validation gates. E: revert server Observer B attachment. F: revert server Observer A's `skipStoreHooks: true`. G: revert FR-7 deletion of client write paths (restore pre-spec observer behavior). | LOCKED (revised 2026-04-15 — added G after audit) | Mutation G validates that the client write-path deletion is load-bearing, not decorative — the most likely regression path (someone "cleans up" and re-adds the writes). 30 min to implement. Completes validation triangle: E covers server attachment, F covers feedback loop, G covers client deletion. Without G, E and F could both pass while the original race returns at lower probability. |
| SA-D11 | ~~Skip mid-session flag flips~~ | REMOVED (revised 2026-04-15) | Obsolete under SA-D5 revision — no flag exists to flip mid-session. |
| SA-D12 | Server observer attachment via `openDirectConnection`, not direct `document` access from the extension hook | LOCKED (rationale revised 2026-04-15 after audit) | Rationale revised: the Hocuspocus `Document` class extends `Y.Doc`, so direct `document.getXmlFragment()` mutations from a hook DO propagate to connected clients via the standard `afterTransaction` → broadcast path (the original rationale claiming "direct access does not trigger broadcast" was incorrect). The correct reasons to use `openDirectConnection` are: (a) **connection-count lifecycle** — opening a DirectConnection increments the Document's connection count, preventing premature unloading if all browser clients disconnect momentarily; (b) **explicit teardown** — `DirectConnection.disconnect()` gives the extension a clean lifecycle boundary matching `afterUnloadDocument`; (c) **consistency with agent-write path** — `agent-sessions.ts` already uses this pattern, so server observers and agent writes share one mechanism. Pattern: `standalone.ts:845` (call) + `:213` (variable). §7b code sample must be updated to match: call `openDirectConnection(documentName)` in `afterLoadDocument`, store the `DirectConnection`, use `dc.document.getXmlFragment(...)`, call `dc.disconnect()` in `afterUnloadDocument`. |
| SA-D13 | Disconnect blocks mode-switch to source mode. UI disables source-mode toggle when `provider.status !== 'connected'`. | LOCKED (added 2026-04-15 after audit) | Under server-authoritative, during disconnect Y.Text receives no updates — not from server (disconnected) and not from client (write paths deleted per FR-7). User switching to source mode would see arbitrarily-stale content that looks like their recent edits but isn't. Alternatives evaluated (warning banner; hybrid local-display fallback; accept-the-trade-off) all fail at least one of: no-silent-stale-display / no-silent-edit-loss / no-confusion. Block-mode-switch is the only option meeting all three correctness criteria. Functionality cost (can't read source during disconnect) is bounded; edits are preserved in XmlFragment and appear on reconnect. See §5 failure-path journey for full rationale. |
| SA-D14 | Per-fire cost budget is substantiated-relative-to-baseline, not absolute. Target: server observer per-fire within 10% of pre-refactor client observer per-fire for same state + delta. Fail acceptance if >2× regression on any seed. | LOCKED (added 2026-04-15 after audit — revises the prior "aspirational 5%" position) | Original spec had G7 "<5% CPU at 10 clients" — an unsubstantiated guess. Challenger's napkin math from our own `crdt-observer-bridge-latency-analysis` report showed the number was wrong (10-50% at burst load). Replacing unsubstantiated absolute targets with a substantiated relative target: the refactor relocates existing logic, so equivalent cost is the correct expectation. Measurable (client baseline is instrumentable from pre-refactor code). Triggers markdown-pipeline-incremental-serialization (currently NG9) as required follow-on spec if systematically exceeded. |

## 10) Assumptions

- **A1.** Hocuspocus `afterLoadDocument` hook + `hocuspocus.openDirectConnection(documentName)` are stable public API and provide a Y.Doc reference that participates in CRDT broadcast. (Verified by `__system__` doc pattern in current code.)
- **A2.** Target product scale is 2-5 concurrent editors per document typical, up to ~20 stretch (Notion/Linear-style collaboration, not Google-Docs-replacement scale). At this scale, per-fire server observer cost within 10% of pre-refactor client observer cost (SA-D14) is achievable without pipeline rework. If product scale grows beyond 20+ concurrent editors per document, NG9 (markdown pipeline incremental serialization) becomes required follow-on work; NG8 (multi-server horizontal scaling) may also be revisited.
- **A3.** The `applyByPrefixSuffix` utility at `packages/core/src/utils/apply-by-prefix-suffix.ts` (from 2026-04-14 FR-2) is stable and usable server-side without modification.
- **A4.** `mdManager` (MarkdownManager) and `schema` (ProseMirror schema) are already available server-side (they are — persistence and agent-sessions import them).
- **A5.** Server observer debounces can use the same `Scheduler` abstraction (2026-04-14 FR-15) with `defaultScheduler` in production. `ManualScheduler` works for server-side tests (unit tests that mock the doc + observers without a running Hocuspocus server).
- **A6.** `FILE_WATCHER_ORIGIN`'s `skipStoreHooks: true` pattern (ref `external-change.ts:26`) is documented/stable as the Hocuspocus mechanism for "don't re-trigger persistence."
- **A7.** Server observer correctness requires single-threaded Y.Doc access per document. This is guaranteed today by Node.js/Bun's event loop (and by Hocuspocus's current in-process Document model). If Hocuspocus or the runtime introduces concurrent Y.Doc processing (worker threads with SharedArrayBuffer, parallel document workers), the multi-writer race returns at a lower level and server observers would need a per-document mutex. The read-compose-write sequence in `setupServerObservers` (read XmlFragment → compute delta → write Y.Text under OBSERVER_SYNC_ORIGIN) depends on no other task executing between the read and write.

## 11) Risks and mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| R1. Server observer per-fire cost exceeds substantiated budget (SA-D14: >2× pre-refactor client baseline) | MEDIUM | Timing instrumentation in FR-13 stress harness. Any per-fire exceeding 2× baseline fails acceptance pre-merge. If systematically exceeded at target scale (SA-D14 / A2), NG9 (markdown pipeline incremental serialization) is promoted from NOT NOW to a required follow-on spec. Metric shipped (`server_observer_fires_total`) for production observability. |
| R2. ~~Rollout flag-flip produces divergence in transition window~~ | — | **Obsolete** under SA-D5 revision — no flag exists. Atomic deploy means no transition window. |
| R3. Latency regression in source-mode visibility of cross-representation changes | LOW-MEDIUM | Full path is 25ms best / 60-120ms typical / 400-500ms worst on large docs (per NFR Performance). Measured in C3 test. Acceptable for a secondary view; source mode is not the primary editing surface. |
| R4. Server observer infinite loop under unexpected origin combination | LOW | Origin-guard truth table (§7d) exhaustively enumerates. Table-tested (FR-5). Metric on fires-per-second would flag runaway loops in production. |
| R5. `afterLoadDocument` timing interacts with persistence load in unexpected ways | LOW | Existing `__system__` pattern demonstrates the hook works. Persistence `onLoadDocument` runs before `afterLoadDocument` per Hocuspocus types — XmlFragment is populated before observer attaches. Covered by FR-1 unit tests (observer attached against pre-populated doc fires first-time early-exit). |
| R6. Server restart causes brief divergence window while observer re-attaches | LOW | Persistence loads canonical state atomically. Observer attaches post-load. Clients reconnect after server ready. Window is <1s and produces no divergence because XmlFragment and Y.Text on disk are canonical. |
| R7. Disconnect-block UX (FR-7a) disrupts users who frequently switch modes during network instability | LOW-MEDIUM | The mode-switch block surfaces disconnect state to the user explicitly (tooltip), which is better than silent stale-content display. Source mode is a secondary view; primary workflow (WYSIWYG editing) is unaffected during disconnect. If this proves disruptive, future work can add an offline-capable source-mode view (see Future Work). |
| R8. Hocuspocus `openDirectConnection` per-document cost at scale (100+ docs concurrently) | LOW | Lazy — opened at `afterLoadDocument` only for docs with active connections. Closed at `afterUnloadDocument` via `DirectConnection.disconnect()`. Memory cost per open connection is small (one Y.Doc reference; already in memory for persistence). |
| R9. Implementer re-adds client write paths ("cleanup" or copy-paste) producing silent multi-writer regression | MEDIUM | Mutation G (FR-11) validates the deletion is load-bearing — a failing test gate. AGENTS.md precedent #14 codifies the architectural rule. Code review should flag any `ytext.insert/delete` or `updateYFragment` call appearing in `observers.ts`. |

## 12) Future work / explicit non-inheritance from this spec

- **Markdown pipeline incremental serialization (NG9)** — triggered follow-on spec if SA-D14's per-fire budget is systematically exceeded at target scale. Affects `@inkeep/open-knowledge-core`'s markdown pipeline (persistence, file-watcher, agent-write, all serializers) — NOT a server-observer-only change.
- **Y.js 14 unified YType migration** — long-term (`projects/v0-launch/PROJECT.md` future-work entry). Eliminates dual-CRDT model entirely. Superset of this spec's solution. Out of scope until ecosystem catches up (pre-release Yjs 14 vs. TipTap/Hocuspocus pins).
- **Awareness-mode-locking UX polish** (`reports/source-toggle-architecture/` Option I). Optional product enhancement on top of server-authority — "one user in source mode at a time" as a UX affordance, not a correctness requirement. Post-V0 product decision.
- **Multi-server horizontal scaling.** Today, one Hocuspocus server is authoritative per document. If horizontally-scaled Hocuspocus is introduced, server-authority needs distributed-consensus primitives (Raft, etc.) or sticky-session routing. Out of scope.
- **Per-document observer worker threads** if SA-D14 budget exceeded at scales beyond A2 (20+ concurrent editors/doc).
- **Offline source-mode view** — if FR-7a (disconnect-blocks-mode-switch) proves disruptive, a read-only stale-but-labeled source-mode view during disconnect could be added. Would require careful design for edit-preservation on reconnect (C hybrid-fallback is rejected here because of silent edit loss; a future design would need to handle this explicitly — likely via a separate "draft" CRDT that merges cleanly on reconnect). Not currently a product requirement.

## 13) Agent Constraints

**SCOPE (allowlist — code mutations allowed in these files ONLY):**

*Server-side additions:*
- `packages/server/src/server-observers.ts` (new — FR-1/2/3/4/5)
- `packages/server/src/server-observer-extension.ts` (new — FR-8 wiring)
- `packages/server/src/server-observers.test.ts` (new — unit coverage)
- `packages/server/src/external-change.ts` (FR-6 `setReconciledBase` call)
- `packages/server/src/standalone.ts` (wire the extension via `configuration.extensions.push()`)
- `packages/server/src/metrics.ts` (FR-1/5 counter — `server_observer_fires_total`)

*Client-side deletions + UI additions:*
- `packages/app/src/editor/observers.ts` — **DELETE** the cross-CRDT write paths per FR-7 (the `ytext.delete/insert` under `ORIGIN_TREE_TO_TEXT` and the `updateYFragment` under `ORIGIN_TEXT_TO_TREE`). Keep baseline tracking + origin guards.
- `packages/app/src/editor/observers.test.ts` — update tests to assert NO cross-CRDT client write occurs on local edits; update any assertions that expected the deleted behavior.
- `packages/app/src/components/` — mode-toggle component gains disconnect-block (FR-7a). Exact file depends on existing structure; look for the WYSIWYG/source toggle and extend with provider-status check.
- `packages/app/src/server/hocuspocus-plugin.ts` (FR-8 Vite plugin migration)

*Test additions:*
- `packages/app/tests/integration/c1-*.test.ts` through `c9-*.test.ts` (all 9 new — FR-10)
- `packages/app/tests/stress/bridge-convergence.fuzz.test.ts` (FR-9 rebalance)
- `packages/app/tests/stress/server-authoritative-stress.test.ts` (new — FR-13)
- Playwright E2E for FR-7a disconnect-block (new or extension to existing `tests/stress/*.e2e.ts`)

*Documentation:*
- `CLAUDE.md` + `AGENTS.md` (FR-12 precedent #14 addition)
- `./evidence/*.md`, `./meta/*.md` (spec artifacts — add rejected-alternatives.md Option 8; update others as needed)

**NOT-in-scope (may be modified incidentally, not as the spec's target):**
- Other `.test.ts` files for regression coverage — add C-tests, do not rewrite or delete existing ones.

**EXCLUDE (must not touch unless spec explicitly required):**
- `packages/core/src/markdown/` — the markdown pipeline is orthogonal. **Explicitly out of scope** — NG9 triggers a separate spec if per-fire budget exceeded.
- `packages/server/src/persistence.ts` internals (beyond FR-6 / `setReconciledBase` interaction from external-change).
- `packages/server/src/agent-sessions.ts` — `applyAgentMarkdownWrite` path is unchanged. Server observer sees paired agent writes and early-exits.
- `packages/server/src/file-watcher.ts` — the disk-watch path is unchanged.
- `packages/core/src/utils/apply-by-prefix-suffix.ts` — reuse, do not modify.
- Any feature-flag/env-var configuration surface — **no flag exists in this design** (SA-D5, NG10).

**STOP_IF:**
- The server observer fires produce observable throughput >10 fires/sec/doc in stress testing — indicates infinite loop or runaway; investigate before proceeding.
- The `bun run check` gate fails on any change. Do not land incomplete blockers.
- Any removal of cross-CRDT write paths in `observers.ts` that breaks single-client tests — investigate before proceeding. Under FR-7, single-client tests should continue to pass because the server observer mirrors state in both modes; if they fail, the server observer wiring is incomplete.
- Per-fire server observer timing in FR-13 stress test exceeds 2× pre-refactor client baseline on any seed — escalate (design may need incremental serialize per NG9 or adaptive debounce per NG7).
- Mutation G (revert FR-7 write-path deletion) fails to catch a regression — indicates C1-C5 tests aren't load-bearing on the deletion.
- Any appearance of `OBSERVER_AUTHORITY_MODE` env var, `serverAuthoritativeMode` option, or awareness-based mode broadcast in the implementation — these are all explicitly rejected (NG10, SA-D5). Flag the architectural regression.

**Handoff note:** This spec should be implemented in a fresh-context ship (`/ship specs/2026-04-15-server-authoritative-observer-bridge`). The 2026-04-14 ship's post-hardening commits 1-5 are prerequisite (merged as PR #146 — `applyAgentMarkdownWrite`, `applyByPrefixSuffix` in core, `attachBridgeInvariantWatcher`, Scheduler DI with `now()` clock unification, FR-17 fuzzer with char-granular oracle, `assertOnlyTrackedOrigins`). Implementation lands as one atomic PR — no staged rollout, no flag flip.
