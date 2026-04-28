# Evidence: D5 — What y-indexeddb does NOT solve (3P)

**Dimension:** Limitations of y-indexeddb as a persistence primitive. Cases where adoption leaves a gap that PR #311's server-side work continues to cover, or where additional (non-IDB) machinery is required.
**Date:** 2026-04-24
**Sources:** y-indexeddb source code (cloned), [MDN — Storage quotas](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria), [Yjs #479 — applyUpdate infinite loop](https://github.com/yjs/yjs/issues/479), [Yjs forum — multi-tab best practice](https://discuss.yjs.dev/t/best-practice-to-sync-across-tabs-windows/903), D2 findings.

---

## The six things y-indexeddb does NOT do

### 1. Does NOT prevent duplicate content from a restarted server (the core PR #311 bug)

**Confidence:** CONFIRMED (from D2 finding + OK codebase trace)

The bug PR #311 fixes is: server restart → fresh server clientID → `updateYFragment` produces items under new clientID → client's IDB-preserved items under old server clientID are NOT deduplicated against the new server's items → content duplicates.

y-indexeddb preserves CLIENT-side Y.Doc state across reload. It does NOT prevent the server's `updateYFragment` from generating duplicate-content items under a new clientID. The instance-ID rejection path is what cuts this; y-indexeddb alone is orthogonal to that mechanism.

**Implication:** Scenario A's "drop sidecar, adopt y-indexeddb" plan MUST retain the instance-ID defense from PR #311. Without instance-ID rejection, the bug returns even with y-indexeddb adopted.

### 2. Does NOT provide live cross-tab coordination

**Confidence:** CONFIRMED (y-indexeddb source code + Yjs forum)

y-indexeddb has no BroadcastChannel, SharedWorker, or `localStorage` storage-event listener. Two tabs on the same origin holding the same `docName` Y.Doc write to the same IDB database but do NOT notify each other.

From [Yjs forum best-practice thread](https://discuss.yjs.dev/t/best-practice-to-sync-across-tabs-windows/903): the canonical OSS pattern is to pair y-indexeddb with `y-protocols/broadcast-channel` (separate module) for cross-tab sync.

**Implication:**
- When Hocuspocus is available, it handles cross-tab sync via server round-trip. y-indexeddb + HocuspocusProvider is live-correct.
- When Hocuspocus is DOWN (during the restart window), two tabs editing offline would diverge. On server reconnect, both send their IDB-preserved state; server merges via Yjs CRDT → convergence. Not a correctness issue; just a UX hiccup.
- If OK ever wants to support "offline multi-tab on same device" as a first-class feature, would need y-broadcastchannel. Not required for PR #311's scope.

### 3. Does NOT handle quota-exceeded gracefully

**Confidence:** CONFIRMED ([MDN — storage quotas](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) + y-indexeddb source code)

y-indexeddb's `_storeUpdate` fires `idb.addAutoKey(updatesStore, update)` as a fire-and-forget Promise. No `.catch`, no `await`, no error propagation to the consuming app.

From MDN:
- **Chrome/Edge:** quota-exceeded → `QuotaExceededError` thrown synchronously by IDB API. y-indexeddb ignores it. Write silently dropped.
- **Firefox:** "10% of the user profile disk size" soft limit; at limit → failures without warning.
- **Safari:** most aggressive eviction; unused origins can be cleared after 7 days.
- **Worst case:** browser evicts ENTIRE origin's storage. Every IDB database for this site gone in one eviction event. User has no signal that this happened.

**Implication:** In production, silent IDB write failures mean the tab's IDB state lags behind the real Y.Doc state. On next hydration, the user loses any edits made after the quota was hit. PR #311's server-side sidecar (Scenario B) would catch this — server has its own copy. In Scenario A (IDB only), lost IDB = lost state.

**Mitigation options:**
- Hand-wrap `_storeUpdate` via monkeypatching to capture errors. Fragile (upstream could change).
- Fork y-indexeddb to add error callback. Small library (184 LOC); patching via patchedDependencies feasible.
- Check `navigator.storage.estimate()` periodically; warn user when approaching quota.
- Accept risk; ensure server-side persistence (markdown file + optional sidecar) remains authoritative.

PR #311 currently ships with markdown as authoritative (precedent #1). This protects against IDB failure. **Scenario A preserves that protection** — the server rebuilds from markdown on restart; client's IDB is optimization, not truth.

### 4. Does NOT schema-migrate

**Confidence:** CONFIRMED (y-indexeddb source code)

The IDB schema is fixed at creation: `updates` (auto-increment) + `custom` (kv). The `openDB(name, onUpgradeNeeded)` call passes a fixed migration fn. There is no version-field exposed; y-indexeddb uses its own internal version.

If OK wanted to ever add a new IDB store (e.g., for richer metadata, telemetry, version tags), would need:
- Fork y-indexeddb to expose upgrade handler.
- OR use a separate IDB database alongside y-indexeddb.
- OR use `provider.clearData()` + let Hocuspocus resync from scratch.

The `clearData()` path is acceptable for most migrations — worst case: user loses optimistic cache, server sync re-populates. Cost: one refetch.

**Implication:** Low risk for PR #311 scope. Becomes a consideration if y-indexeddb is extended for richer client state (conflict markers, sync telemetry, etc.).

### 5. Does NOT defend against Y.applyUpdate infinite loop on corrupt bytes

**Confidence:** CONFIRMED ([Yjs #479](https://github.com/yjs/yjs/issues/479))

If the IDB-stored binary update is corrupted (e.g., partial write due to browser crash during `addAutoKey`, bit-flip from disk corruption, tampering), `Y.applyUpdate(doc, corruptBytes)` can enter an infinite synchronous loop, blocking the main thread. Issue #479 is CLOSED but the user-facing behavior — browser tab frozen — persists.

y-indexeddb makes NO attempt to validate update bytes before applying. It calls `Y.applyUpdate` directly (y-indexeddb.js:22).

**Implication (in browser context):**
- A `Promise.race` + timeout does NOT help — `Y.applyUpdate` is synchronous; it blocks the event loop before any timer could fire. This is the exact reason PR #311's server-side sidecar does NOT wrap `applyUpdate` in a timeout (it doesn't help either; noted in `sidecar.ts` comments).
- Worker-thread isolation IS the only real defense — run IDB hydration in a Web Worker, timeout the worker if hydration exceeds a threshold.
- As of this research, **y-indexeddb does NOT isolate Y.applyUpdate**. The canonical pattern hydrates on the main thread.
- Recovery: user force-closes the tab, reopens; y-indexeddb rehydrates, hits the corrupt entry again, locks up again. **No recovery without manually clearing IDB via DevTools.**

**Severity assessment:** Low probability (corruption is rare in practice; no community reports of it happening in production with y-indexeddb). But high consequence if it does (user can't open their data without technical intervention). 

**Mitigation options:**
- Wrap `Y.applyUpdate` calls via worker thread for hydration (significant complexity).
- On first hydration failure (detected by page-reload-after-crash heuristic), offer user "clear local cache and refetch from server" button.
- Accept risk; document the manual recovery path.

PR #311 ships with markdown as authoritative, so server-side recovery is always "clear IDB via DevTools → reload → Hocuspocus syncs from markdown." This is a valid escape hatch even in Scenario A.

### 6. Does NOT prevent silent data loss on browser private/incognito mode

**Confidence:** CONFIRMED (browser behavior)

- **Chrome / Edge / Firefox incognito:** IDB available but data deleted when window closes. No warning.
- **Safari private browsing:** older versions threw `QuotaExceededError` immediately on any IDB write; newer versions allow ephemeral. y-indexeddb does not detect private mode.

**Implication:** Users in private browsing get a degraded offline experience but otherwise equivalent to Hocuspocus-only today. Not a regression. Not a blocker. Could display a banner: "Private browsing detected — local cache disabled."

---

## Combined implication for PR #311

Adopting y-indexeddb does NOT let us drop ANY of the following from PR #311:
- Server-instance-ID generation, broadcast, auth-token schema, `onAuthenticate` rejection (reason #1).
- Client-side provider-pool `authenticationFailed` handler + `recycleAllEntries` (reason #1).
- Markdown as source of truth (reasons #3, #5, #6).
- Test harness + 11-test suite (reason #1 at minimum; additional reasons #3, #5 if we want coverage for IDB degraded paths).

Scenario A saves LOC by dropping the SERVER-side sidecar specifically, not the instance-ID defense or markdown primacy. Those remain load-bearing.

---

## What the server-side sidecar provides that y-indexeddb canNOT substitute for

| Capability | Server-side sidecar (PR #311) | y-indexeddb (client) |
|-----------|-------------------------------|----------------------|
| Preserve Y.Doc binary across server restart on SERVER side | ✅ | ❌ |
| Preserve Y.Doc binary across client reload on CLIENT side | (not its job) | ✅ |
| Recovery when user opens a browser on a different device | ✅ (server has it) | ❌ (new device = empty IDB) |
| Recovery when user clears browser storage | ✅ (server has it) | ❌ |
| Works across all browsers + private mode equally | ✅ (Node fs) | ⚠️ (browser storage varies) |
| Size limit | Disk (practically unbounded) | Browser quota (bounded, evictable) |
| Failure mode on corruption | `applyUpdate` throws caught → delete sidecar → fall through to markdown. Server keeps working. | `applyUpdate` infinite-loops → tab hangs. Manual recovery required. |
| Failure mode on divergence (disk vs binary) | Strategy A: delete sidecar, fall through to markdown. Jupyter's open gap, CLOSED in PR #311. | (not applicable — client doesn't know disk) |

**Scenario A reduces durability-across-device/browser-session.** If the user edits on Chrome, then opens the same doc on Firefox 10 minutes later, the Firefox IDB is empty. Must refetch from server. Server has rebuilt from markdown → no duplication bug (instance-ID defense). But also no "instant restart" UX on Firefox's first visit.

**Scenario B (keep both) gives belt-and-suspenders** at the cost of two code paths + two storage places + two migration concerns. Evaluated in D7.

---

## Negative findings

- No evidence that y-indexeddb corrupts stored state under normal operation. Community reports of data loss trace to one of: (a) quota eviction, (b) default-init race (D2), (c) multi-tab writing without network provider. None are defects in y-indexeddb itself.
- No evidence of y-indexeddb being incompatible with HocuspocusProvider. Canonical pattern from tiptap-docs + OSS examples.
- y-indexeddb does NOT maintain any client-ID registry. The Y.Doc's clientID is preserved by Yjs's item-identity across applyUpdate calls (D2) — not by y-indexeddb specifically.

---

## Gaps / follow-ups

- Test coverage for reason #3 (quota exceeded): Bun test env with fake-indexeddb does NOT simulate quota failures. Need Playwright test with Chrome `navigator.storage.persist()` API to exercise quota realistically. Defer — not a blocker for PR #311 scope.
- Test coverage for reason #5 (applyUpdate infinite loop): similarly hard to test. Can stage corrupt bytes in fake-indexeddb and attempt hydration. Observable: test hangs. Requires explicit test-timeout instrumentation.
- Private-mode detection: `navigator.storage.estimate()` returns 0 or near-0 quota in some browsers' private mode. Could be used as a heuristic banner. Out of scope for this research.
