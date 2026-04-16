# Design Challenge Findings

**Artifact:** specs/2026-04-16-page-render-optimization/SPEC.md
**Challenge date:** 2026-04-16
**Total findings:** 9 (3 H, 4 M, 2 L)

---

## High Severity

### [H] Finding 1: `forceSyncInterval: 200` per-client is folklore, not measured — and the cost budget is wrong

**Category:** DESIGN
**Source:** DC1, DC2
**Location:** §9 enforcement points, D8, F12, R4
**Issue:** The spec pins `forceSyncInterval: 200` (5 msg/sec per provider — not 2, see below) on every client provider as a "defense-in-depth" mitigation for `y-websocket#81` / `hocuspocus#183`. The only cited evidence is "community consensus from `hocuspocus#525`" — and re-reading that issue, the context is a user's *temporary workaround* for a NextJS-specific bug where "synced is never fires." It is not a recommended production default.
- `forceSyncInterval` forces the client to send a full Yjs `SyncStep1` message (containing its current state vector) every N ms. At `N=200`, that's **5 msgs/sec per provider**, not 2/sec as R4 states. With `MAX_POOL=10`, the worst case is 50 msgs/sec of sync chatter — per client — even when everything is already synced.
- For P2 (team member on remote Hocuspocus), this multiplies across every connected peer and raises server-side CPU/network load. Hocuspocus will also respond with `SyncStep2` diffs, amplifying traffic both ways.
- The edge cases this defends against (pre-sync never-fires) are covered by D7's 30s timeout with zero additional network cost. D8 is therefore primarily a latency-shaving hack for a bug class that already has a recovery path (retry UI).

**Current design:** "Client-side `forceSyncInterval: 200` on `HocuspocusProvider` mitigates the documented `synced`-never-fires edge cases."

**Alternative:**
1. **Don't set it, or set it much larger (e.g., 5000ms)** — the 30s timeout already handles the never-fires case. A 5s heartbeat gives 6 sync attempts before timeout without 25× the traffic.
2. **Set it only on cold-path providers** and unset once `hasSynced=true` — the edge cases only apply pre-first-sync; ongoing sync is handled by Hocuspocus's own awareness ping.

**Trade-off:** Option 1 might push cold-load p95 up by a few hundred ms in the edge-case branch (rare — most cold loads don't hit #81/#183). Option 2 preserves fast recovery but adds one lifecycle transition. Both dramatically reduce steady-state WebSocket traffic.

**Status:** CHALLENGED
**Suggested resolution:** Empirically verify on a remote Hocuspocus (not localhost) whether 200ms actually changes cold-load p95 vs. 5000ms or unset, before baking it into the code. The current rationale is "community said 200" — the spec's own standard elsewhere (stress-test evidence, napkin math) is higher. R4's "negligible" conclusion is based on incorrect arithmetic.

---

### [H] Finding 2: 10× mounted TipTap instances in memory is under-counted — not just MB, but CPU/event-loop contention

**Category:** DESIGN
**Source:** DC1, DC2
**Location:** D1, DX8, R5, non-functional requirements ("Memory")
**Issue:** DX8's "300MB ceiling" treats memory as the only scaling axis. But each hidden `<Activity>` editor also keeps:
- A live `HocuspocusProvider` WebSocket connection (A8 confirms — provider is NOT destroyed when Activity hides).
- A Y.Doc receiving remote updates (peers can edit while you view a different doc).
- ProseMirror plugins including Collaboration, CollaborationCursor, observers bidirectionally bridging XmlFragment ↔ Y.Text.
- `setupObservers` wiring (established once post-sync, persists for provider lifetime — see `provider-pool.ts:136-154`).

When 10 docs are pooled and remote peers are active, the hidden editors run observers on every transaction. With CLAUDE.md's precedent #11-13 (bridge invariants, debounced observer A at 50ms, observer B parse at 300ms), this is nontrivial CPU work happening for 9 docs the user isn't looking at. Per `reports/crdt-observer-bridge-latency-analysis/REPORT.md`, observer cost scales with doc size and edit rate.

React 19.2 Activity docs ([react.dev/reference/react/Activity](https://react.dev/reference/react/Activity)) state that hidden mode "unmounts effects" — but observers set up inside `provider-pool.ts:setupObservers` are NOT inside React effects; they're direct Yjs event listeners. React Activity will NOT pause them. The bridge keeps running for every hidden pooled doc.

Additionally: the "Memory leak research" surfaced that React may add automatic LRU state destruction in a future version. Until then, an active agent writing rapidly to doc A (via the REST API) causes observer work on doc A's hidden Activity even if user is viewing doc B.

**Current design:** "Up to 10 TipTap + CodeMirror editor instances in memory (bounded by MAX_POOL = 10). Per-editor overhead ~10-30 MB... Ceiling ~300 MB additional over baseline. Acceptable for desktop local-first target (P1/P2)."

**Alternative:**
1. **Pool 2-3 editors via Activity (last-3-visited), not 10.** MAX_POOL=10 is a provider-pool concern; that's separate from the Activity cap. Warm-path value is highest for recent switches; cold-path via Suspense for older entries is fine.
2. **Decouple Activity-mounted-editor count from ProviderPool size.** Keep 10 providers warm (sync state preserved) but only 2-3 mounted editors. Transition between Activity-mounted and not via a fast Suspense read from the already-warm provider.

**Trade-off:** Alt 1 trades some warm-switch UX (4th-oldest doc becomes cold) for dramatically better steady-state CPU/memory. For 99% of user patterns (tab between 2-3 recent docs), G5 is fully preserved.

**Status:** CHALLENGED
**Suggested resolution:** Revisit DX8 with an explicit separation of concerns: (1) provider warmth (how many providers stay connected/synced), (2) editor warmth (how many editors are DOM-mounted). The spec conflates these. Also consider that "10 editors × 30MB" is the floor, not the ceiling — real TipTap instances with collab extensions at doc sizes we see in production can be 50-80MB each, pushing ceiling closer to 800MB.

---

### [H] Finding 3: Problem framing is internally contradictory — §1 says "silent blank gap," §8 says EditorSkeleton already exists

**Category:** DC3 (framing validity)
**Source:** DC3
**Location:** §1 Complication #2, §8 "Partial loading UI already exists"
**Issue:** The Situation-Complication-Resolution framing rests on three co-occurring failures. But Complication #2 ("Silent blank gap") is contradicted by the spec's own §8 and `evidence/worldmodel-findings.md#D-1`:
- §1: "The new editor mounts against an empty Y.Doc while WebSocket initial sync is in flight... An `EditorSkeleton` is rendered conditionally on `syncState === 'connecting'`, but it does not preserve previous content during nav — it flashes in during the sync gap, itself a form of flicker."
- §8: "Partial loading UI already exists (baseline is NOT zero)... `EditorSkeleton` is rendered conditionally at `EditorArea.tsx:159-161`."
- Worldmodel D-7: "Baseline state is NOT zero... Spec framing as 'from nothing to everything' is misleading. Should be 'from partial-ad-hoc to unified-architectural-pattern.'"

The real complication is NOT "silent blank gap" — it's "the existing skeleton flashes in, which is its own form of flicker." That is a *far narrower* problem and admits a *far simpler* solution: just keep the previous doc's content rendered during `syncState === 'connecting'`, using either a ref-captured snapshot or a simple "render previous docName until new one synced" pattern. No Activity, no Suspense, no module-level promise cache.

If you removed Complication #1 (white flash from `key` remount) and Complication #3 (silent error), Complication #2 on its own would not justify the full hybrid architecture. The intersection reasoning for Resolution depends on #1 + #3 being load-bearing. #1 is fixable by removing the composite `key` (a one-line change). #3 is fixable by a Suspense + ErrorBoundary wrapper alone (no Activity needed).

**Current design:** Hybrid Activity + Suspense + `use(promise)` + ErrorBoundary + transition + progress bar + forceSyncInterval — a 7-primitive composition.

**Alternative (simpler baseline to compare against):**
1. Remove the composite `key={${activeDocName}-${isNewDoc}}` → stop unnecessary remount on draft→saved flip (addresses #1).
2. Change the `syncState === 'connecting' ? <EditorSkeleton />` ternary to render the last-known-synced doc's editor frozen (read-only) until new one syncs (addresses #2 without Activity).
3. Wrap in `<ErrorBoundary>` with 30s timeout and retry button (addresses #3).
4. Add a thin progress strip driven by `useTransition` on `openDocument` (addresses G3).

This achieves G1, G2, G3, G4, G6 without Activity, without module-level promise cache, without `use()`. It loses G5 (scroll/focus preservation across navigation) for non-current-doc — but only the current doc was ever "warm" under the current model anyway, and users' mental model of "tabs" is specifically about currently-visible tab state.

**Trade-off:** Gains G5 for the current-displayed doc round-trip (A → B → A), but not for arbitrary multi-doc alt-tab. Given P1's journey 6 ("User develops a pattern of alt-tabbing between docs as if they were browser tabs") — this pattern is aspirational, not measured. No evidence the user currently does this. Foreclosing G5's *fullest* form for >3 docs at cost of dramatic simplicity seems favorable.

**Status:** CHALLENGED
**Suggested resolution:** Explicitly distinguish "minimum viable fix" (addresses §1 complications 1+2+3) from "ambitious state-preservation UX" (adds G5 for arbitrary alt-tab). The spec conflates them. Present as two options:
- **Option A (tight):** Suspense + ErrorBoundary + transition + progress bar. ~300 LOC. No Activity.
- **Option B (spec's current):** Hybrid with Activity. ~800 LOC. 10× memory. More novel React 19.2 surface.

The spec's Decision Log rejected "pure Suspense-gated remount" in one line: "always-remount loses state preservation UX." That rejection rationale undersells what "state preservation" means in practice and doesn't measure whether users need it beyond the current doc.

---

## Medium Severity

### [M] Finding 4: Tier boundaries (5/15/25/30s) are cited as "GitHub/Vercel/Linear convention" but no evidence file exists

**Category:** DESIGN
**Source:** DC2
**Location:** D7, F9, §5 (journey failure path)
**Issue:** D7's rationale cites "GitHub/Vercel/Linear convention" for escalating tier boundaries, but neither evidence file contains any observation of what those platforms actually do. [Vercel `react-transition-progress`](https://github.com/vercel/react-transition-progress) is mentioned but that library has no tier escalation — it's a single smoothly-animated bar. GitHub's navigation progress is also a single bar with no tier text.

The specific numbers 5/15/25/30 appear to be fabricated. A reasonable tier scheme exists (Google's response-time research: <100ms instant, <1s "still responsive," <10s "attention limit"), but it doesn't match D7's numbers.

F9 turns these into a test assertion — bounded-time acceptance criteria on a UI pattern the spec cannot justify.

**Current design:** "0-5s subtle; 5-15s visible; 15-25s 'taking longer'; 25-30s 'Try again?' prompt; 30s reject."

**Alternative:** Two tiers is sufficient and matches established UX research:
- 0-1s: no indicator (below attention threshold — matches React docs on avoiding unnecessary fallback flashes).
- 1-10s: subtle strip, growing intensity or just static.
- >10s: "Taking longer than usual — Try again?" (combined copy + button, no intermediate "taking longer" without retry affordance).
- 30s: hard error boundary.

**Trade-off:** Loses one tier boundary. Gains implementation simplicity (fewer states, simpler NavigationPendingBar state machine, fewer test assertions).

**Status:** CHALLENGED
**Suggested resolution:** Either cite specific prior-art with evidence (screenshot or source citation from Linear/GitHub/Vercel's actual loading UX) or relax F9 to DELEGATED with guidance, rather than LOCKED 4-tier assertion. The precision of 5/15/25 is over-constrained without evidence.

---

### [M] Finding 5: `syncPromise` ends up reimplementing TanStack Query's lifecycle badly

**Category:** DC1 (simpler alternative)
**Source:** DC1
**Location:** D2, §9 syncPromise primitive, F15
**Issue:** The spec rejects `useSuspenseQuery` on TkDodo's argument: "use() is for one-time data reads at render time; TanStack Query is for complex cache management, invalidation policies, retries." But the design of `sync-promise.ts` creeps right into what it dismissed:
- Module-level `Map<docName, {...}>` — that's a cache.
- Timeout (30s) with explicit reject — that's retry policy (specifically, no-retry, but it's a policy).
- Cache invalidation on provider destroy/recycle — that's invalidation.
- `invalidate(docName)` from retry button — that's manual invalidation.
- Stable promise refs via module-level state — that's observer/subscription deduplication.

This is ~100-150 LOC of cache+lifecycle code. `useSuspenseQuery` with `staleTime: Infinity, gcTime: Infinity, retry: false` and `queryClient.invalidateQueries(['sync', docName])` on retry/destroy is ~20 LOC of wiring and ships the same semantics with community-maintained correctness.

TkDodo's actual position (verified via the cited blog post) is nuanced: `use()` is appropriate when you have a stable promise from SOMEWHERE; the question is what produces that stable promise. Hand-rolled module state is one option; queryClient is another. TkDodo does not argue against using queryClient to PRODUCE the stable promise — he argues against putting `use()` inside components that create the promise at render time.

**Current design:** Hand-rolled module-level cache; "D2 LOCKED, No 1-way door."

**Alternative:** `useSuspenseQuery({ queryKey: ['sync', docName], queryFn: () => promisifySynced(pool.getOrCreate(docName)), staleTime: Infinity, gcTime: Infinity, retry: false })`. Invalidation via `queryClient.invalidateQueries`. Destroy/recycle events fire invalidations.

**Trade-off:** Adds one TanStack Query dependency to the "core state" bucket, which worldmodel D-5 argued was a deliberate separation. But worldmodel D-5 explicitly labels itself "observation, not prescription." The separation may be observational (they haven't needed it yet) rather than principled.

**Status:** CHALLENGED
**Suggested resolution:** Build both in a quick spike and compare LOC + test surface + edge-case handling. The spec's current rationale ("semantic mismatch") doesn't engage with the concrete implementation overlap. A ~100 LOC cache module with its own tests is a maintenance item; `useSuspenseQuery` ships it pre-tested.

---

### [M] Finding 6: F7 (agent-driven nav) is not testable without an agent

**Category:** DC2 (stakeholder gap)
**Source:** DC2
**Location:** F7, P3 persona, journey §5
**Issue:** F7 says "Playwright (or unit test on openDocument): trigger nav via AgentFocusBroadcaster pathway." But `AgentFocusBroadcaster` is driven by CC1 push-over-awareness from the server. Simulating "an agent navigates" in Playwright requires one of:
1. Directly invoking the client-side AgentFocusBroadcaster handler with a fake payload (bypasses the actual pathway; effectively a unit test).
2. Sending a signal from the test harness server side via the CC1 `__system__` broadcast (requires test-mode server hooks that don't exist).
3. Spawning a real MCP agent (heavyweight, orthogonal).

The acceptance criterion as written conflates "trigger nav through the agent pathway" with "prove the UX is equivalent." Only the unit test path is viable, and that's not really testing the agent pathway — it's testing `openDocument`.

The `pinnedDoc` suppression test is even harder — it requires asserting "agent request logged but no nav." What logging? DX6 says dev bracket logs and prod console.warn — not an observable UI affordance. Testing "a log line was emitted" is brittle.

**Current design:** P3 listed as primary persona with F7 as Playwright-asserted requirement.

**Alternative:**
1. Demote F7 to unit test on `openDocument` with the transition option, explicitly verifying that the same code path handles both user-originated and programmatic navigations.
2. Test `pinnedDoc` via a user-facing UI affordance (if one exists) — not a log line.
3. Or drop P3 as a primary persona with its own acceptance criterion; the Activity + Suspense architecture treats all navigations identically by construction, which makes P3 a derived guarantee, not a separate test target.

**Trade-off:** Reduces test surface by one E2E. Gains accuracy — F7 as written doesn't actually test what it claims.

**Status:** CHALLENGED
**Suggested resolution:** Rewrite F7's acceptance criterion to match what's testable. "Programmatic `openDocument({transition:true})` call exhibits same pending/continuity behavior as user nav" is a unit test; "Agent focus triggers nav UX" is not verifiable without infrastructure that doesn't exist.

---

### [M] Finding 7: F14 precedent is under-specified — broad vs narrow scoping is load-bearing

**Category:** DC2 (stakeholder gap)
**Source:** DC2
**Location:** F14, G6
**Issue:** F14 says "CLAUDE.md contains a new Architectural precedent #14 describing hybrid Activity+Suspense for subscription-source async primitives." But the spec never defines what counts as "subscription-source async." The risk:
- **Narrow read** (intended): only Yjs/Hocuspocus-style subscribe-once-per-lifecycle. Clean guidance; future authors know when it applies.
- **Broad read** (plausible on a cold read of CLAUDE.md): any async loading in the app. Future authors start using module-level promise caches everywhere, diverging from the "TanStack Query for peripheral" pattern the worldmodel D-5 identified.

G6 then cascades: "The pattern is reusable by future async surfaces (graph panel, AI suggestions, MCP agent status)" — but graph panel and AI suggestions are fetch/refetch data, not subscription-source. If F14 is interpreted narrowly, G6's examples contradict it. If broadly, it overwrites the deliberate core/peripheral split.

**Current design:** F14 Should requirement, G6 supports, not specified which scope.

**Alternative:** Lock the narrow scope in the precedent text: "Applies to async primitives that are SUBSCRIPTION-SOURCE (one-time subscribe-to-event resolution; provider lifecycle-scoped; not fetch/refetch). For HTTP fetch/refetch, continue using TanStack Query." Remove graph panel / AI suggestions from G6's example list — they're fetch/refetch.

**Trade-off:** Loses "future reusable pattern" breadth. Gains coherence with the deliberate core/peripheral split.

**Status:** CHALLENGED
**Suggested resolution:** Specify F14's precedent scope precisely before implementation. This is a 1-way door (precedent-setting) but spec treats it as DELEGATED. Should be LOCKED with scope text.

---

## Low Severity

### [L] Finding 8: R3 "infinite suspend loop" risk is real but mitigation is incomplete

**Category:** DC2
**Source:** DC2
**Location:** R3
**Issue:** R3 says module-level cache ensures stable promise ref under React Compiler. True for the Map itself. But if a promise is *rejected* and then `invalidate(docName)` fires, the next render creates a new promise, which may resolve asynchronously — during which React re-runs the component tree. Without explicit idempotence guards, the retry button could create multiple in-flight promises if clicked rapidly (debounced or not).

The spec's mitigation ("unit test with remount simulation") doesn't address rapid-click retry scenarios. F5 tests "trigger timeout + click Try again" (single click). Not "click Try again 10× in 100ms."

**Alternative:** In `sync-promise.ts`, ensure:
- `invalidate(docName)` is idempotent.
- Creating a promise while one is pending no-ops (return existing).
- `resolve`/`reject` check identity of the promise they're resolving.

**Trade-off:** ~10 LOC more in the cache. No user-visible change for the single-click path.

**Status:** CHALLENGED
**Suggested resolution:** Add a unit test for rapid retry-click and ensure idempotence guards explicit.

---

### [L] Finding 9: "30s hard timeout" with escalation creates a weird UX at 25s

**Category:** DC2
**Source:** DC2
**Location:** D7, F9, journey §5
**Issue:** At 25s the UI shows "Try again?" prompt with a button. User clicks it (why? they've been waiting) — the spec says this immediately invalidates and retries. But invalidating at 25s throws away 25s of sync progress that may be 1s from completing. There's no "keep waiting" option.

Alternatively if user doesn't click, at 30s the boundary fires and they see the ErrorBoundary UI anyway.

**Alternative:** At 25s show two buttons: "Still working — wait" (dismisses the prompt, extends timeout to 60s) and "Try again" (invalidate + retry). Matches user's actual mental model ("I can see it's trying; give it more time OR start over").

**Trade-off:** One more button. Better UX in the "just needs a few more seconds" case.

**Status:** CHALLENGED
**Suggested resolution:** Consider adding a "keep waiting" affordance at tier 4. Low priority.

---

## Confirmed Design Choices (summary)

Decisions that held up under challenge:

**DC1 (simpler alternative):**
- D3 (startTransition wrapping) — directly warranted by React docs; no simpler alternative gives G2's content-continuity guarantee.
- D4 (react-error-boundary) — library choice confirmed by cross-repo precedent and concrete API fit; ~2kb; LOCKED is appropriate.
- DX3 (manual-only retry) — clearly simpler than auto-retry-with-backoff; the spec's rationale holds.
- DX7 (__system__ exclusion) — required by CLAUDE.md precedent; no alternative.

**DC2 (stakeholder gap):**
- A1-A10 assumptions — all confirmed or verifiable; good hygiene.
- DX5 (a11y attrs) — concrete, precedented from BacklinksPanel; low risk.
- P4 (post-wake reconnect) — well-covered by existing `PageListContext` and provider-pool semantics.

**DC3 (framing validity):**
- The "agent-native" positioning aligns with repo precedent.
- NG1 (SSR) and NG2 (hot-swap ydoc) are well-grounded rejections with cited maintainer evidence.

Sources:
- [React 19.2 release](https://react.dev/blog/2025/10/01/react-19-2)
- [React Activity docs](https://react.dev/reference/react/Activity)
- [Hocuspocus #525 forceSyncInterval](https://github.com/ueberdosis/hocuspocus/issues/525)
- [TkDodo React 19 and Suspense](https://tkdodo.eu/blog/react-19-and-suspense-a-drama-in-3-acts)
- [TanStack Query useSuspenseQuery limitations](https://github.com/TanStack/query/discussions/6327)
