---
title: "E2E Blocked QA Validation Options"
description: "Options analysis for validating 4 blocked Playwright E2E scenarios (QA-010/012/013/014) in a React 19.2 + HocuspocusProvider + Y.js CRDT editor. Covers routeWebSocket timing bugs, test-hook alternatives, Y.js awareness injection, and listener-attach race solutions."
createdAt: 2026-04-16
updatedAt: 2026-04-16
subjects:
  - Playwright
  - HocuspocusProvider
  - Y.js
  - React 19.2
topics:
  - E2E test validation
  - WebSocket interception
  - awareness injection
  - transition testing
---

# E2E Blocked QA Validation Options

**Purpose:** Identify the most practical path to validate each of 4 blocked QA scenarios from the page-render-optimization ship, given the constraints uncovered during the post-ship probe.

---

## Executive Summary

All 4 blocked scenarios are **validatable with targeted engineering** — none are fundamentally impossible. The blockers are specific and solvable:

**Key Findings:**
- **`routeWebSocket` failure was a timing bug, not a Playwright limitation.** Routes must be registered BEFORE `page.goto()` — documented in [Playwright docs](https://playwright.dev/docs/api/class-websocketroute) and reinforced by [issue #34045](https://github.com/microsoft/playwright/issues/34045) (context-reuse bug). Our probes registered routes AFTER `goto`, so they never intercepted.
- **QA-012/013 (tier escalation + 30s timeout):** Solvable via `context.routeWebSocket()` before `goto` + `page.clock`. The handler needs a toggle (let doc-a WS through, block doc-b's). Estimated: ~30 LOC test code.
- **QA-014 (pre-sync disconnect):** Solvable via same `context.routeWebSocket()` approach — close the WS in the handler after doc-a syncs. The listener-attach race identified in the probe is a separate concern (already solved by the warm-provider fast-path in `sync-promise.ts`). Estimated: ~20 LOC.
- **QA-010 (agent-driven nav):** Solvable via a `window.__test_injectAwareness` hook that programmatically injects a fake remote awareness state using `y-protocols/awareness.applyAwarenessUpdate`. No second peer process needed. Estimated: ~30 LOC hook + ~20 LOC test.

**Recommended approach for each:**

| Scenario | Recommended Option | Effort | Alternatives Considered |
|---|---|---|---|
| QA-012/013 | `context.routeWebSocket` before `goto` + `page.clock` | ~30 LOC | Test hook `__test_delaySyncMs` (simpler but less realistic) |
| QA-014 | `context.routeWebSocket` before `goto` + toggle | ~20 LOC | `__test_armPendingRejection` (already validates same error class, less realistic) |
| QA-010 | `window.__test_injectAwareness` hook | ~50 LOC | Spawn `agent-sim` subprocess (heavier, more realistic) |

---

## Research Rubric

| # | Dimension | Priority | Depth |
|---|---|---|---|
| 1 | Why `routeWebSocket` didn't intercept | P0 | Deep |
| 2 | Alternative WS blocking approaches | P0 | Deep |
| 3 | React 19 `isPending` testing patterns | P0 | Moderate |
| 4 | Y.js awareness injection | P0 | Moderate |
| 5 | Listener-attach race patterns | P1 | Moderate |

**Stance:** Options analysis

---

## Detailed Findings

### 1. Why `routeWebSocket` didn't intercept

**Finding:** The root cause is **timing** — `routeWebSocket` must be registered BEFORE `page.goto()`. Our probes registered routes AFTER the page loaded and doc-a synced, which is too late.

**Evidence:** [evidence/routewebsocket-timing.md](evidence/routewebsocket-timing.md)

Playwright's `routeWebSocket` works by injecting a JavaScript shim that patches the browser's native `WebSocket` constructor (analogous to `addInitScript`). The shim must be in place before the application code calls `new WebSocket()`. The Playwright docs state: *"Only WebSockets created after `routeWebSocket` was called will be routed."*

In our probe, the sequence was: `goto → openFromSidebar(doc-a) → waitForSync → routeWebSocket → openFromSidebar(doc-b)`. By the time `routeWebSocket` was called, doc-a's WS was already created and the Playwright shim missed it. But doc-b's WS should have been caught... unless the **context-reuse bug** ([issue #34045](https://github.com/microsoft/playwright/issues/34045)) also applied — this bug causes `routeWebSocket` to fail on subsequent WS connections within the same browser context.

**Fix:** Use `context.routeWebSocket()` (not `page.routeWebSocket()`) BEFORE creating the page. This registers the route at the context level, which applies to all pages and all WS connections from the start.

```typescript
const context = await browser.newContext();
let blockNewWS = false;
await context.routeWebSocket(/collab/, (ws) => {
  if (blockNewWS) return; // handler does nothing → WS hangs
  ws.connectToServer(); // passthrough to real server
});
const page = await context.newPage();
await page.goto(BASE);
```

**Decision triggers:**
- If the fix works (context-level route intercepts): QA-012/013/014 become solvable via this single mechanism.
- If the fix doesn't work (context-reuse bug still active in 1.59.1): fall back to test-hook approaches.

### 2. Alternative WS blocking approaches

**Finding:** When `routeWebSocket` fails, the most reliable alternative is test-hook injection — the pattern already used in this codebase (`__test_armPendingRejection`, `__test_closeActiveWebSocket`).

**Evidence:** [evidence/ws-blocking-alternatives.md](evidence/ws-blocking-alternatives.md)

| Approach | Works for WS? | Deterministic? | Effort |
|---|---|---|---|
| `context.routeWebSocket` before `goto` | Yes (if timing bug is resolved) | Yes | Low |
| `__test_delaySyncMs(docName, delayMs)` hook | Yes (simulates delay) | Yes | Low (~15 LOC) |
| CDP `Network.setBlockedURLs` | No — WS exits normal request pipeline | N/A | N/A |
| CDP `Network.emulateNetworkConditions` | No — doesn't affect WS ([#15364](https://github.com/microsoft/playwright/issues/15364)) | N/A | N/A |
| `context.setOffline(true)` | Partially — drops connections but non-deterministic | No | N/A |
| Service Worker interception | No — SW cannot intercept WS ([w3c/ServiceWorker#947](https://github.com/w3c/ServiceWorker/issues/947)) | N/A | N/A |
| External WS proxy | Yes | Yes | High (infrastructure) |

**Recommended:** Try `context.routeWebSocket` first. If it doesn't work in this Playwright version, add a `__test_delaySyncMs` hook:

```typescript
// In sync-promise.ts (DEV-only):
const testSyncDelays = new Map<string, number>();
export function __test_delaySyncMs(docName: string, delayMs: number) {
  testSyncDelays.set(docName, delayMs);
}

// In syncPromise creation, after warm-provider fast-path:
const delay = testSyncDelays.get(docName);
if (delay !== undefined) {
  testSyncDelays.delete(docName);
  // Wrap the real promise with a delay before resolving
  const realPromise = entry.promise;
  entry.promise = new Promise((resolve) => {
    setTimeout(() => realPromise.then(resolve), delay);
  });
}
```

### 3. React 19 `isPending` testing patterns

**Finding:** `isPending` from `useTransition()` is only observable in Playwright E2E — unit test frameworks (`act()`) flush everything before assertions can observe intermediate states. The existing `MutationObserver` pattern in `docs-open.e2e.ts` (F3/F13 tests) is the correct approach.

**Evidence:** [evidence/react-transition-testing.md](evidence/react-transition-testing.md)

Key insight: `page.clock` controls `setTimeout` and `performance.now` (which `NavigationPendingBar` uses for tier computation) but does NOT pause React's `MessageChannel`-based scheduler. So `page.clock.runFor(6000)` advances the bar's elapsed-time calculation without pausing React — exactly what we want for tier-escalation testing.

The correct test sequence for tier escalation:
1. Block doc-b's WS (via context route or test hook) so `syncPromise` stays pending
2. Navigate to doc-b — `startTransition` fires, `isPending=true`, bar mounts
3. `page.clock.runFor(6000)` — bar advances to tier 1 ("Loading doc...")
4. Assert `[data-slot="navigation-pending-bar"]` contains "Loading" text
5. Continue advancing through tiers

### 4. Y.js awareness injection from test harness

**Finding:** Y.js awareness states can be programmatically injected from Playwright via `page.evaluate()` using a DEV-only test hook. No second Y.js peer process needed.

**Evidence:** [evidence/awareness-injection.md](evidence/awareness-injection.md)

The `Awareness` class from `y-protocols` supports `applyAwarenessUpdate` which accepts encoded awareness state from any `clientID`. A throwaway `Y.Doc` with an explicitly-set `clientID` (the property is writable) can create a fake "remote" awareness state:

```typescript
// window.__test_injectAwareness hook (DEV-only in DocumentContext.tsx):
window.__test_injectAwareness = (clientId: number, state: object) => {
  const provider = pool?.getActive()?.provider;
  if (!provider?.awareness) return false;
  const Y = await import('yjs');
  const awareness = await import('y-protocols/awareness');
  const fakeDoc = new Y.Doc();
  fakeDoc.clientID = clientId; // writable property
  const fakeAwareness = new awareness.Awareness(fakeDoc);
  fakeAwareness.setLocalState(state);
  const update = awareness.encodeAwarenessUpdate(fakeAwareness, [clientId]);
  awareness.applyAwarenessUpdate(provider.awareness, update, 'test');
  fakeAwareness.destroy();
  fakeDoc.destroy();
  return true;
};
```

Then in a Playwright test:
```typescript
await page.evaluate(() => {
  window.__test_injectAwareness?.(42, {
    user: { name: 'FakeAgent' },
    focus: 'other-doc.md',
  });
});
// SystemDocSubscriber should observe the awareness change and navigate
```

**Note:** This hook needs to target the `__system__` provider specifically (not the active content provider) since `SystemDocSubscriber` watches `__system__` awareness. The hook implementation would need to pull the `__system__` provider from the pool.

### 5. Listener-attach race patterns

**Finding:** The race between provider event firing and `syncPromise` listener attachment is already solved in the codebase via the warm-provider fast-path (`if (provider.synced) return Promise.resolve()`). HocuspocusProvider does NOT replay `'synced'` or `'close'` events to late-attached listeners.

**Evidence:** [evidence/listener-race.md](evidence/listener-race.md)

The `armedRejections` mechanism in `sync-promise.ts` solves the test-specific variant of this race — it fires BEFORE the warm-provider check, guaranteeing the rejection lands regardless of localhost sync speed. The general pattern: **always check synchronous state (`provider.synced`) before attaching listeners** — this is what `sync-promise.ts:306-312` does.

No code change needed for this dimension — the existing solution is correct.

---

## Limitations & Open Questions

### Not fully confirmed
- Whether `context.routeWebSocket()` (vs `page.routeWebSocket()`) resolves the interception failure in Playwright 1.59.1 with our specific setup. A quick probe (~10 min) would confirm.

### Out of scope
- Production-grade WS proxy infrastructure (high-effort, low ROI for this use case).
- Upgrading Playwright to a version that fixes [issue #34045](https://github.com/microsoft/playwright/issues/34045) (targeted at 1.50 but may already be in 1.59.1).

---

## References

### Evidence Files
- [evidence/routewebsocket-timing.md](evidence/routewebsocket-timing.md) — Root cause analysis for routeWebSocket failure
- [evidence/ws-blocking-alternatives.md](evidence/ws-blocking-alternatives.md) — CDP, setOffline, service worker, test-hook approaches
- [evidence/react-transition-testing.md](evidence/react-transition-testing.md) — React 19 isPending patterns
- [evidence/awareness-injection.md](evidence/awareness-injection.md) — Y.js awareness injection patterns
- [evidence/listener-race.md](evidence/listener-race.md) — Listener-attach race and existing solution

### External Sources
- [Playwright WebSocketRoute API docs](https://playwright.dev/docs/api/class-websocketroute)
- [Issue #33085: WebSocket route glob+scheme mismatch](https://github.com/microsoft/playwright/issues/33085)
- [Issue #34045: routeWebSocket context-reuse bug](https://github.com/microsoft/playwright/issues/34045)
- [Issue #37048: routeWebSocket + Web Workers](https://github.com/microsoft/playwright/issues/37048)
- [PR #35193: routeWebSocket relative URL fix](https://github.com/microsoft/playwright/pull/35193)
- [Issue #15364: CDP throttling doesn't affect WS](https://github.com/microsoft/playwright/issues/15364)
- [w3c/ServiceWorker#947: WS not interceptable by SW](https://github.com/w3c/ServiceWorker/issues/947)
- [Y.js Awareness docs](https://docs.yjs.dev/api/about-awareness)
- [RTL React 19 Suspense issue #1375](https://github.com/testing-library/react-testing-library/issues/1375)

### Related Research
- [reports/agent-browser-vs-playwright-crdt-testing/](reports/agent-browser-vs-playwright-crdt-testing/) — Covers tool selection (Playwright wins) and mentions routeWebSocket capability
