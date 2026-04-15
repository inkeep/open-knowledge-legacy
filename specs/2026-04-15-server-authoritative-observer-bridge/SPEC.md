# Server-Authoritative Observer Bridge — Spec

**Status:** Ready for implementation (fresh-context ship recommended — estimated 3-4 days)
**Owner(s):** Nick Gomez
**Baseline commit:** head of `worktree-observer-a-char-level` at time of this spec (`005ff6c` or successor after ship close)
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
- **G7. Bounded server CPU cost.** At the target scale (<100 concurrent editors per doc; typical burst rate), server-side observer work is O(N-clients × edit-rate × serialize-cost). Measure in dev + stress — target <5% of server CPU for 10 concurrent clients. Reject the design if measured cost exceeds 20% at target scale. (The `crdt-observer-bridge-latency-analysis` report's parse/serialize cost model applies.)
- **G8. Rollout safety via feature flag.** `OBSERVER_AUTHORITY_MODE` env var (server-side) with values `'client'` (legacy; default until flip) and `'server'` (new). Client-side setupObservers gains a matching `serverAuthoritativeMode: boolean` option (default false; discovered from a server capability broadcast or config-injected). Ship lands with both modes coexisting; flip in a separate PR after validation.

## 3) Non-goals

- **[NEVER] NG1:** Eliminating the dual-CRDT model (Y.XmlFragment + Y.Text). That's a multi-week refactor (Yjs 14 unified YType per `reports/peritext-on-yjs-feasibility/`) with ecosystem-compatibility blockers (pre-release Yjs 14 vs. TipTap/Hocuspocus pins). Out of scope. Tracked as long-term: `projects/v0-launch/PROJECT.md` future-work entry to be added.
- **[NEVER] NG2:** Removing client-side observer firing for local-only paths. Client Observer B must still fire on local CodeMirror input (user typing in source mode) because the client owns the write to Y.Text for user-originated edits. Only the *cross-CRDT sync side* of each observer moves to the server.
- **[NEVER] NG3:** Re-litigating 2026-04-14 spec D1–D18 LOCKED decisions (Bug-A fix shape, Bug-B fix shape, `applyAgentMarkdownWrite` contract, AGENTS.md precedent #10 "XmlFragment authoritative"). This spec's server-authoritative pattern extends precedent #10 — the XmlFragment-authoritative contract now lives on the server, not the client.
- **[NEVER] NG4:** Introducing new CRDT types. D14 precedent (no new CRDT types without explicit spec decision) stands.
- **[NEVER] NG5:** Accessing Y.js internal Item structures. Public API only.
- **[NOT NOW] NG6:** Awareness-mode-locking as a product-UX-visible feature (source-mode exclusivity indicator per `reports/source-toggle-architecture/` Option I). Server-authority is the architecturally-correct-and-invisible-to-users answer; UX-mode-locking becomes a future product decision if collaborative source-mode editing proves problematic beyond what server-authority addresses.
- **[NOT NOW] NG7:** Optimizing server observer debounce beyond the client-ported 50ms. Advanced batching (e.g., adaptive debounce based on edit rate) is premature optimization.
- **[NOT NOW] NG8:** Multi-server deployments (horizontal scaling of Hocuspocus). Assumes single authoritative server per document — already the current deployment model.

## 4) Personas / consumers

- **P1: Two-or-more concurrent WYSIWYG users.** Two browser tabs on the same doc, typing simultaneously. Expects: both contributions end up in both XmlFragment and Y.Text on both clients, no duplication, no interleave. Today: 2-4% of fuzzer seeds show Y.Text duplicates. Post-refactor: 0% (verified via C1 test + Mutation E).
- **P2: Two-or-more concurrent source-mode users.** Two browser tabs editing the markdown source. Expects: both contributions end up in both representations, character-level CRDT co-editing preserved when editing the same paragraph. Today: structural race present (uncaught by fuzzer at 0.5% op frequency). Post-refactor: C2 test validates; fuzzer rebalance exercises at 15%.
- **P3: Mixed-mode collaborators.** Client A in WYSIWYG, Client B in source mode, concurrent. Expects: both contributions end up in both representations. Today: hidden race; post-refactor: C3 test validates.
- **P4: AI agent via MCP/API (V0-14 downstream).** Writes via `/api/agent-write*` or `/api/agent-patch`. Path unchanged — `applyAgentMarkdownWrite` still does the atomic server-side compose. Server observer sees the paired XmlFragment+Y.Text update and early-exits (already-in-sync check). No new bug surface. V0-14's per-agent UM (server-side) tracks `AGENT_WRITE_ORIGIN` Items on Y.Text exactly as today; undo still correct. Validated via C4 test (existing FR-4 harness re-used under new architecture).
- **P5: AI agent writing concurrently with human typing.** (C5 — new symmetric case.) Agent-write lands on server; concurrent user source-mode CodeMirror edits land on server. Expects: both preserved. Today: analogous to Bug-A on the source-mode side; post-refactor: C5 test validates.
- **P6: Observer pipeline developer.** Next person touching `observers.ts` or the new `server-observers.ts`. Inherits the new AGENTS.md precedent (TBD number, after #10): "Cross-CRDT sync is single-writer, server-side. Client observer callbacks for cross-sync are no-op on the write side; local-only observer firings (user source-mode edit → Y.Text → Observer B → XmlFragment) still run client-side because the client is the only writer for that local edit's CRDT."

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
4. **Under server-authoritative:** client Observer B's write path to XmlFragment is disabled when `serverAuthoritativeMode: true`. Server's Observer B (new) fires on Y.Text changes, parses the CRDT-merged Y.Text markdown, runs `updateYFragment` once server-side under `OBSERVER_SYNC_ORIGIN`.
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
- **Server unreachable while client types WYSIWYG.** Client-local XmlFragment updates, no Y.Text update (client no longer writes Y.Text under new mode). If client switches to source-mode during disconnect, Y.Text is stale relative to XmlFragment. **Acceptable trade-off** — source-mode is a secondary view, disconnect is transient. Mitigation: on mode switch, show a "Syncing..." indicator if disconnected. (Optional UX polish; not a correctness issue.) Alternative considered and rejected: fall back to client-authoritative mode when disconnected → reintroduces the multi-writer race when reconnected and multiple clients' buffered writes flush simultaneously. Worse.

## 6) Requirements

### Functional requirements

| Priority | ID | Requirement | Acceptance criteria |
|---|---|---|---|
| Must | FR-1 | `setupServerObservers({ doc, xmlFragment, ytext, mdManager, schema, scheduler })` module in `packages/server/src/server-observers.ts`. Mirrors the client-side observer bridge's write-side logic (Observer A: XmlFragment→Y.Text via `applyByPrefixSuffix`; Observer B: Y.Text→XmlFragment via `updateYFragment`). Runs on the server's copy of the Y.Doc. | Module exports `setupServerObservers(opts) => cleanup`. Attached via new `createServerObserverExtension()` wired in `standalone.ts` per-document at `onLoadDocument` time using `hocuspocus.openDirectConnection(documentName)` (pattern established by `__system__` doc pre-materialization at `standalone.ts:210, 825`). Per-document cleanup on document unload. |
| Must | FR-2 | New origin constant `OBSERVER_SYNC_ORIGIN: LocalTransactionOrigin = { source: 'local', skipStoreHooks: true, context: { origin: 'observer-sync' } }` exported from `packages/server/src/server-observers.ts`. Server observer writes use this origin exclusively. | Declared as `satisfies LocalTransactionOrigin`. Object reference (not string) per precedent #1. `skipStoreHooks: true` prevents observer → persistence → file-watcher → observer feedback loop (EC4 blocker resolution). Test: server observer write does NOT trigger persistence.onStoreDocument. |
| Must | FR-3 | Server Observer A baseline + debounce: per-document `lastSyncedXmlMd` string + 50ms debounce matching client-side semantics. Debounce implemented via injected `Scheduler` (2026-04-14 FR-15 abstraction; use `defaultScheduler` in production, `ManualScheduler` in tests). Baseline refresh follows the same conditional rule as the client Bug-B fix: refresh only when no local debounce is pending. | EC2/EC7 blocker resolution. Unit tests in `packages/server/src/server-observers.test.ts`: (a) rapid XmlFragment changes coalesce into one Y.Text write, (b) baseline-refresh conditional rule matches client behavior, (c) Path A vs. Path B dispatch matches client `observers.ts` logic when Y.Text is in-baseline vs. diverged. |
| Must | FR-4 | Server Observer B baseline + debounce: symmetric to FR-3, but per-document `lastSyncedYText` string + 50ms debounce for Y.Text→XmlFragment path. Debounce via same injected Scheduler. | Symmetric tests to FR-3. |
| Must | FR-5 | Origin-guard cross-checks in server observers. Server Observer A callback returns early if `transaction.origin === OBSERVER_SYNC_ORIGIN` OR `transaction.origin === AGENT_WRITE_ORIGIN` with `transaction.local` (already-paired-write) OR `transaction.origin === FILE_WATCHER_ORIGIN` with already-paired-write check. Symmetric for Observer B. | Table-test (one case per origin × direction combination). No infinite loop. No double-write under `applyAgentMarkdownWrite` (server Observer A sees XmlFragment already-matches-Y.Text → early-exit). |
| Must | FR-6 | `applyExternalChange` in `packages/server/src/external-change.ts` calls `setReconciledBase(docName, content)` after its atomic XmlFragment+Y.Text write, so persistence does not re-serialize and re-write the same content on next flush. | EC3 blocker resolution. Test: file-watcher-driven external change does NOT trigger a disk re-write within the persistence debounce window (measured via spy on `fs.writeFile` count). |
| Must | FR-7 | Client `setupObservers` gains a `serverAuthoritativeMode: boolean` option (default false for backward compat; true when feature-flagged on). When true: client Observer A's Y.Text-write path is no-op (baseline refresh only, keeping the Bug-B-aware conditional semantics for local reasoning); client Observer B's XmlFragment-write path is no-op (baseline refresh only). Local-only firings (user source-mode input → CodeMirror → Y.Text → Observer B → would-be XmlFragment-write) still fire but no-op the write; XmlFragment gets updated via server round-trip. | Client unit tests gain `serverAuthoritativeMode: true` variants of the existing Observer A/B tests, asserting no-op on write side. Bridge invariant still asserted post-convergence (via FR-11 watcher). |
| Must | FR-8 | Runtime feature-flag: `OBSERVER_AUTHORITY_MODE` env var on server (`'client'` \| `'server'`, default `'client'` at first landing). Server broadcasts its authority mode to connecting clients via the existing awareness channel (new `serverAuthorityMode` field on awareness state). Client reads awareness on connect, wires `setupObservers({ ..., serverAuthoritativeMode: mode === 'server' })`. On mode change mid-session: client emits a reload hint (out-of-scope for this spec to handle mid-session flips; assume flag flipping happens during maintenance windows). | Config schema extended in `packages/server/src/standalone.ts` config. Integration test for each mode. |
| Must | FR-9 | Migration for standalone/dev mode: Vite plugin's server-extension loader (`packages/app/src/server/hocuspocus-plugin.ts`) includes the new `createServerObserverExtension`. | Dev-server smoke test: start `bun run dev`, type in two browser tabs, no duplication in Y.Text. |
| Must | FR-10 | Fuzzer rebalance (supersedes 2026-04-14 spec's FR-17 D18 gate #3 plan): in `packages/app/tests/stress/bridge-convergence.fuzz.test.ts`, op distribution changes to `source-type: 15%`, `external-change: 8%`, `wysiwyg-type: 25%` (was 30%), `agent-write: 15%`, `agent-patch: 8%`, `sync-pause: 12%`, `sync-resume: 12%`, `wait: 5%`. D18 coverage gate #3 requires each write surface fires ≥1 time cumulatively per 25-seed run. | Cumulative op counter shows every surface ≥1 across seeds. At elevated `source-type`/`external-change` rates, existing seeds continue to pass post-refactor (proves symmetric fix, not just Observer A fix). |
| Should | FR-11 | New integration tests C1-C5 in `packages/app/tests/integration/`: `c1-concurrent-wysiwyg.test.ts` (2-3 clients WYSIWYG same-line), `c2-concurrent-source.test.ts` (2-3 clients source-mode same-paragraph), `c3-mixed-mode.test.ts` (A WYSIWYG + B source-mode), `c4-agent-plus-wysiwyg.test.ts` (re-use 2026-04-14 `bridge-convergence-regression.test.ts` harness under new architecture), `c5-agent-plus-source.test.ts` (new — agent-write + concurrent source-mode). Oracle: full-body content preservation (from 2026-04-14 hardening commit 4) + FR-11 bridge invariant watcher + FR-12 origin probe. | All 5 tests pass under server-authoritative mode. All 5 tests FAIL (as expected) under legacy mode for seeds that exercise multi-writer concurrency (validates the tests are load-bearing, not rubber-stamps). |
| Should | FR-12 | Mutation tests E + F (new, supersede 2026-04-14 spec's Mutation tests A-D as the validation gates for this spec): (E) revert server Observer B attachment → C2 + concurrent-source-mode fuzzer seeds fail with XmlFragment duplicates. (F) revert server Observer A's `skipStoreHooks: true` → persistence-feedback-loop detected as disk-write thrashing (measurable via `fs.writeFile` spy count >N per edit). | Both mutations catch at 100% on applicable seeds. Documented in `meta/mutation-validation.md`. |
| Should | FR-13 | AGENTS.md / CLAUDE.md precedent addition (new number, after #10 and #11 added by 2026-04-14 spec): "**Cross-CRDT sync is single-writer, server-side.** Bidirectional observer pairs between Y.XmlFragment and Y.Text must run exclusively on the server. Client-side observer callbacks for cross-CRDT sync are no-op on the write side. Local-only observer firings (user CodeMirror edit → Y.Text → Observer B) still fire client-side because the client is the only writer for that local edit's source CRDT — but they no-op the derived-CRDT write, which the server performs on next CRDT propagation. Why: client-side multi-writer bridges interleave at the CRDT protocol layer, producing duplication under concurrent edits (see `specs/2026-04-15-server-authoritative-observer-bridge/`). Applies to all dual-CRDT bridge work." | Precedent text committed in CLAUDE.md + AGENTS.md. Referenced by future observer-related work. |
| Could | FR-14 | Stress test: 5-10 clients × 30-60s of randomized mixed WYSIWYG+source edits → convergence + no duplicates + server CPU measurement < 5%. | Dedicated stress harness in `packages/app/tests/stress/server-authoritative-stress.test.ts`. Target scale met. |

### Non-functional requirements

| Area | Requirement | Acceptance |
|---|---|---|
| Performance | Server observer work per edit bounded by debounce (50ms coalescing). Additional ~50ms latency for cross-CRDT visibility (server round-trip). | Latency measured in C3 test; acceptable at <100ms total (current: ~50ms for local + 0ms for cross since client writes). Net: +50ms tolerable for cross-representation visibility. |
| Reliability | Server restart does not produce divergence. Persistence has atomic flush; on reload, XmlFragment and Y.Text load from canonical disk state. | Integration test: kill + restart server mid-edit burst → state converges on reconnect. |
| Security | No new network surface; all cross-CRDT sync goes through existing Hocuspocus WebSocket. No new auth boundary. | Unchanged from current architecture. |
| Operability | Metric: `server_observer_fires_total{direction=a|b}` counter added to `metrics.ts`. Dashboard panel: fires/sec per document to spot runaway loops. | Metrics endpoint updated. |
| Cost | Server CPU increase bounded to <5% at target scale. Memory increase bounded to O(documents × 2 × baseline-string-size) — typically <10KB per document. | Measured in dev + stress. |

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
  //  - Runs on BOTH transaction.local=true (server-local writes like applyAgentMarkdownWrite)
  //    AND transaction.local=false (remote-arrived updates from clients)
}
```

### 7b. Hocuspocus extension wiring

```ts
// packages/server/src/server-observer-extension.ts
export function createServerObserverExtension(opts: {
  mdManager: MarkdownManager;
  schema: Schema;
}): Extension {
  const cleanups = new Map<string, () => void>();
  return {
    async afterLoadDocument({ document, documentName }) {
      if (isSystemDoc(documentName)) return; // skip __system__
      const doc = document;
      const xmlFragment = doc.getXmlFragment('default');
      const ytext = doc.getText('source');
      const cleanup = setupServerObservers({
        doc, xmlFragment, ytext,
        mdManager: opts.mdManager,
        schema: opts.schema,
      });
      cleanups.set(documentName, cleanup);
    },
    async onDestroyDocument({ documentName }) {
      cleanups.get(documentName)?.();
      cleanups.delete(documentName);
    },
  };
}
```

Wired in `standalone.ts` alongside the existing `cc1Broadcaster`, `persistenceExtension`, `apiExtension`, `agentSessionManager`.

### 7c. Client observer gating

Extend `packages/app/src/editor/observers.ts` `SetupObserversOptions`:

```ts
export interface SetupObserversOptions {
  doc: Y.Doc;
  xmlFragment: Y.XmlFragment;
  ytext: Y.Text;
  mdManager: MarkdownManager;
  schema: Schema;
  scheduler?: Scheduler;
  serverAuthoritativeMode?: boolean; // new
}
```

When `serverAuthoritativeMode: true`:

- Observer A's `runObserverASync` still runs for baseline-refresh purposes (keeps `lastSyncedXmlMd` current for local reasoning about Path A vs. Path B decisions *if* this client ever exits server-authoritative mode mid-session — defensive). **But the `ytext.insert/delete` calls are gated behind `if (!serverAuthoritativeMode)`.**
- Observer B's `runObserverBSync` similarly: the `updateYFragment(...)` call is gated.
- The callbacks still fire (origin guards, baseline tracking intact).

Net client code change: ~2 conditional blocks per observer, ~20 LOC. Client code gets *simpler* in server-authoritative mode because the debounce juggling becomes irrelevant.

### 7d. Origin-guard truth table (updated)

| Transaction Origin | Server Observer A (tree→text) | Server Observer B (text→tree) |
|---|---|---|
| `OBSERVER_SYNC_ORIGIN` (server self-writes) | — (self) | SKIP |
| `AGENT_WRITE_ORIGIN` (applyAgentMarkdownWrite paired-write) | Sync (but early-exit: already-in-sync) | Sync (but early-exit: already-in-sync) |
| `FILE_WATCHER_ORIGIN` (applyExternalChange paired-write) | Sync (early-exit via setReconciledBase + already-in-sync) | Sync (early-exit) |
| `ROLLBACK_ORIGIN` (not in current use; future) | Sync | Sync |
| Remote-arrived (no origin / Yjs internal; `local=false`) | Sync | Sync |

Client observer truth table **unchanged** from 2026-04-14 spec; the only delta is the gate on the write side (FR-7).

### 7e. Rollout sequence

1. **Phase 1 (FR-1 through FR-6).** Land server-observer code + blockers behind `OBSERVER_AUTHORITY_MODE=client` default. Zero behavior change. Passes all existing tests.
2. **Phase 2 (FR-7 through FR-9).** Land client gating + feature-flag wiring + Vite-plugin migration. Still default client-mode.
3. **Phase 3 (FR-10 through FR-12).** Land fuzzer rebalance + C1-C5 integration tests + mutation tests E/F. Tests all pass under both modes during transition (write-path differences validated, read-path identical).
4. **Phase 4.** Flip `OBSERVER_AUTHORITY_MODE=server` in dev/staging. Run full `bun run check:full:parallel` + stress + fuzzer × 100 seeds. Observe server CPU metric.
5. **Phase 5.** Flip production. Monitor. Rollback via env var if needed (no code change required).
6. **Phase 6 (cleanup, follow-up PR).** Once stable for ≥2 weeks in production with no rollback needed, remove the `client` code path and the feature flag. Client-side Observer A/B write paths deleted. Net code reduction.

## 8) Current state (at spec time)

- **Branch `worktree-observer-a-char-level` head (pre-close):** `005ff6c` (FR-6 origin-laundering rigor from hardening commit 5). Commits 1-5 of post-ship hardening landed.
- **Legacy write paths still in place.** `observers.ts` Observer A writes Y.Text under `ORIGIN_TREE_TO_TEXT`; Observer B writes XmlFragment under `ORIGIN_TEXT_TO_TREE`. Both client-side. This spec changes the WHERE, not the origin semantics.
- **`applyAgentMarkdownWrite` at `agent-sessions.ts`** (FR-1 of 2026-04-14 spec) writes both sides atomically under `AGENT_WRITE_ORIGIN`. Compatible with the new architecture — server observer sees the paired write and early-exits.
- **`applyExternalChange` at `external-change.ts`** writes both sides atomically under `FILE_WATCHER_ORIGIN`. Needs minor extension: `setReconciledBase` call post-write (FR-6 of this spec; EC3).
- **Hocuspocus extension infrastructure.** `standalone.ts:210` already pre-materializes `__system__` via `openDirectConnection`. Same pattern used for new server-observer extension (per-document `openDirectConnection` at `afterLoadDocument`).
- **`ManualScheduler`** available in tests (`packages/app/tests/integration/test-harness.ts:578`) from 2026-04-14 FR-15. Server observer tests can reuse.
- **FR-11/FR-12 test primitives** (bridge invariant watcher, origin probe) from 2026-04-14 spec are client-side but work against any Y.Doc — reusable for server-observer tests with a server-side Y.Doc reference (or against a client's Y.Doc while a server runs the observers).

## 9) Decision log

| ID | Decision | Status | Rationale |
|---|---|---|---|
| SA-D1 | Observers run on server, not client, for cross-CRDT sync | LOCKED | Only single-writer design that preserves bidirectional observer API, supports unlimited concurrent clients, and matches Yjs community canonical "server-enforced locks" pattern. Evaluated and rejected: awareness leader-election (no consensus), per-paragraph IDs (not atomic), Y.Map replacement (loses char-level). See `evidence/rejected-alternatives.md`. |
| SA-D2 | Preserve bidirectional observer API (setupObservers stays) | LOCKED | User directive (2026-04-14 ship post-hardening consultation): "moving away from bidirectional observers is not an option." Constraint respected. |
| SA-D3 | New origin `OBSERVER_SYNC_ORIGIN` with `skipStoreHooks: true` | LOCKED | EC4 blocker; prevents persistence → file-watcher → observer feedback loop. `skipStoreHooks` precedent already in `FILE_WATCHER_ORIGIN`. |
| SA-D4 | Debounce = 50ms server-side, matching client | LOCKED | Coalesces rapid edit bursts. Same value as client `DEBOUNCE_MS`. No evidence a different value is needed server-side. |
| SA-D5 | Runtime feature flag via env var + awareness broadcast | LOCKED | Rollout safety. Mid-session flips are out-of-scope; maintenance-window flips only. |
| SA-D6 | Client gate keeps baseline-refresh, disables write | LOCKED | Defensive: if the mode is ever toggled mid-session (e.g., server restart in different mode), client baseline is still coherent for Path A vs. Path B decisions. Baseline-refresh is cheap. |
| SA-D7 | No new CRDT types | LOCKED | D14 precedent from prior specs. This is purely a relocation of logic. |
| SA-D8 | `applyExternalChange` gets `setReconciledBase` | LOCKED | EC3 blocker. Small-surface fix. Complements existing persistence-debounce reconciliation. |
| SA-D9 | Server Observer A/B use `afterLoadDocument`, not `onLoadDocument` | LOCKED | `afterLoadDocument` fires after persistence has loaded canonical state into the doc. Attaching observers earlier would see an empty doc and fire spurious "divergence" writes. |
| SA-D10 | Mutation E + Mutation F replace 2026-04-14 spec's Mutation A-D as this ship's validation gates | LOCKED | Mutations A-D validated the 2026-04-14 fixes (which are already landed). Mutations E/F validate THIS spec's fixes. Reusing A-D as regression gates is fine but not the core validation. |
| SA-D11 | Skip mid-session flag flips | LOCKED | Simplifies design. Flag changes require server restart. Rare in practice. |
| SA-D12 | Server observer attachment via `openDirectConnection`, not direct `document` access from the extension hook | LOCKED | `openDirectConnection` is the supported public API for server-side Y.Doc mutation that participates in CRDT propagation. Direct `document.getXmlFragment()` from a hook does not trigger broadcast to clients. Pattern already used for `__system__` at `standalone.ts:210`. |

## 10) Assumptions

- **A1.** Hocuspocus `afterLoadDocument` hook + `hocuspocus.openDirectConnection(documentName)` are stable public API and provide a Y.Doc reference that participates in CRDT broadcast. (Verified by `__system__` doc pattern in current code.)
- **A2.** Target scale remains <100 concurrent editors per document. Server CPU budget for observer work is <5%. If scale grows beyond this, revisit (may need per-document observer worker threads).
- **A3.** The `applyByPrefixSuffix` utility at `packages/core/src/utils/apply-by-prefix-suffix.ts` (from 2026-04-14 FR-2) is stable and usable server-side without modification.
- **A4.** `mdManager` (MarkdownManager) and `schema` (ProseMirror schema) are already available server-side (they are — persistence and agent-sessions import them).
- **A5.** Server observer debounces can use the same `Scheduler` abstraction (2026-04-14 FR-15) with `defaultScheduler` in production. `ManualScheduler` works for server-side tests (unit tests that mock the doc + observers without a running Hocuspocus server).
- **A6.** `FILE_WATCHER_ORIGIN`'s `skipStoreHooks: true` pattern (ref `external-change.ts:26`) is documented/stable as the Hocuspocus mechanism for "don't re-trigger persistence."

## 11) Risks and mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| R1. Server observer runtime cost exceeds budget at scale | MEDIUM | Measure in FR-14 stress test. Reject the design if >20% server CPU at 10 clients; fall back to client-mode + awareness-mode-locking (future UX spec). Metric shipped (FR-13 `server_observer_fires_total`) for production observability. |
| R2. Rollout flag-flip produces divergence in transition window | LOW | Mid-session flips explicitly out of scope (SA-D11). Maintenance-window flips only. If two clients are on different modes in the same doc simultaneously (during rollout), the one in client-mode still writes Y.Text → race returns. Mitigation: atomic flag flip, all clients reconnect. |
| R3. Latency regression in source-mode visibility of cross-representation changes | LOW-MEDIUM | ~50ms added latency for the server round-trip. Measured in C3 test. Acceptable; source-mode is secondary view. |
| R4. Server observer infinite loop under unexpected origin combination | LOW | Origin-guard truth table (SA-§7d) exhaustively enumerates. Table-tested (FR-5). Metric on fires-per-second would flag runaway loops. |
| R5. `afterLoadDocument` timing interacts with persistence load in unexpected ways | LOW | Existing `__system__` pattern demonstrates the hook works. Persistence `onLoadDocument` runs before `afterLoadDocument` per Hocuspocus docs — XmlFragment is populated before observer attaches. Covered by FR-1 unit tests (observer attached against pre-populated doc fires first-time early-exit). |
| R6. Server restart causes brief divergence window while observer re-attaches | LOW | Persistence loads canonical state atomically. Observer attaches post-load. Clients reconnect after server ready. Window is <1s and produces no divergence because XmlFragment and Y.Text on disk are canonical. |
| R7. The `serverAuthoritativeMode` client option is forgotten in a new `setupObservers` caller (e.g., a new surface that creates its own Y.Doc) | MEDIUM | Default `false` keeps legacy behavior, which is not broken in single-client scenarios (the race requires 2+ clients). Add a lint rule or JSDoc note pointing at this spec. Optional: require the option (non-default) in a follow-up after all callers migrated. |
| R8. Hocuspocus `openDirectConnection` per-document cost at scale (100+ docs concurrently) | LOW | Lazy — opened at `afterLoadDocument` only for docs with active connections. Closed at `onDestroyDocument`. Memory cost per open connection is small (one Y.Doc reference; already in memory for persistence). |

## 12) Future work / explicit non-inheritance from this spec

- **Remove the feature flag + legacy client write paths** in a follow-up PR once the server-authoritative mode is stable in production ≥2 weeks. Estimated ~100 LOC net deletion on the client side.
- **Y.js 14 unified YType migration** (long-term; `projects/v0-launch/PROJECT.md` future-work entry). Eliminates dual-CRDT model entirely. Superset of this spec's solution. Out of scope until ecosystem catches up.
- **Awareness-mode-locking UX polish** (`reports/source-toggle-architecture/` Option I). Optional product enhancement on top of server-authority. "One user in source mode at a time" as a UX affordance, not a correctness requirement. Post-V0.
- **Multi-server horizontal scaling.** Today, one Hocuspocus server is authoritative per document. If horizontally-scaled Hocuspocus is introduced, server-authority needs distributed-consensus primitives (Raft, etc.) or sticky-session routing. Out of scope.
- **Per-document observer worker threads** if R1 materializes at scale beyond 100 concurrent editors/doc.

## 13) Agent Constraints

**SCOPE (allowlist — code mutations allowed in these files ONLY):**
- `packages/server/src/server-observers.ts` (new)
- `packages/server/src/server-observer-extension.ts` (new)
- `packages/server/src/external-change.ts` (FR-6 `setReconciledBase` call)
- `packages/server/src/standalone.ts` (wire the extension)
- `packages/server/src/config/` or equivalent (feature-flag env var)
- `packages/app/src/editor/observers.ts` (FR-7 `serverAuthoritativeMode` option + gates)
- `packages/app/src/server/hocuspocus-plugin.ts` (FR-9 Vite plugin migration)
- `packages/app/src/editor/TiptapEditor.tsx` + `SourceEditor.tsx` (FR-8 awareness read → pass option)
- `packages/app/tests/integration/c1-*.test.ts` through `c5-*.test.ts` (new)
- `packages/app/tests/stress/bridge-convergence.fuzz.test.ts` (FR-10 rebalance)
- `packages/app/tests/stress/server-authoritative-stress.test.ts` (new; FR-14)
- `packages/server/src/server-observers.test.ts` (new)
- `packages/server/src/metrics.ts` (FR-13 counter)
- `CLAUDE.md` + `AGENTS.md` (FR-13 precedent addition)
- `./evidence/*.md`, `./meta/*.md` (spec artifacts)

**NOT-in-scope (may be modified incidentally, not as the spec's target):**
- `packages/app/src/editor/observers.test.ts` — expect new tests for `serverAuthoritativeMode: true` variants; do not rewrite the existing suite's assertions.
- Any `.test.ts` file for regression coverage — add tests, do not rewrite or delete existing ones.

**EXCLUDE (must not touch unless spec explicitly required):**
- `packages/core/src/markdown/` — the markdown pipeline is orthogonal.
- `packages/server/src/persistence.ts` internals (beyond `setReconciledBase` call from external-change).
- `packages/server/src/agent-sessions.ts` — `applyAgentMarkdownWrite` path is unchanged.
- `packages/server/src/file-watcher.ts` — the disk-watch path is unchanged.
- `packages/core/src/utils/apply-by-prefix-suffix.ts` — reuse, do not modify.

**STOP_IF:**
- The server observer fires produce observable throughput >10 fires/sec/doc in stress testing — indicates infinite loop or runaway; investigate before proceeding.
- The `bun run check` gate fails on any change. Do not land incomplete blockers.
- Any mutation to client observer write paths produces FAIL on single-client tests under `serverAuthoritativeMode: false` (legacy) — the gate must be a no-op in legacy mode.
- Server CPU measurement in FR-14 exceeds 20% at 10 concurrent clients — escalate; either the design needs optimization or the scale assumption is wrong.

**Handoff note:** This spec should be implemented in a fresh-context ship (`/ship specs/2026-04-15-server-authoritative-observer-bridge`). The 2026-04-14 ship's post-hardening commits 1-5 are prerequisite (they land the test infrastructure this spec's tests depend on: Scheduler DI, ItemOriginProbe `assertOnlyTrackedOrigins`, full-body content oracle, `AGENT_WRITE_ORIGIN` object migration). Commits 6-7 of that hardening series were deferred to this spec (fuzzer rebalance folded into FR-10; regression corpus folded into FR-11's test design).
