---
name: page.clock + Y.js / Hocuspocus compatibility
description: Does Playwright's page.clock API (v1.45+) interfere with Y.js internal timers, Hocuspocus provider heartbeat, or y-prosemirror setTimeout deferred work? Targeted follow-up research commissioned 2026-04-17 after fanout surfaced page.clock as an unresolved architectural fork.
sources: playwright.dev/docs/clock, yjs@13.6.30 local source, @hocuspocus/provider local source, Playwright GitHub issues
collected_at: 2026-04-17
---

# `page.clock` × Y.js / Hocuspocus / y-prosemirror compatibility

Commissioned to resolve: should the parent spec commit to `page.clock.runFor(N)` as the debounce-advancement primitive, or stay with `waitForFunction(...)`?

---

## Key files / pages referenced

- [Playwright Clock API](https://playwright.dev/docs/clock) — official API surface
- [Playwright Clock class docs](https://playwright.dev/docs/api/class-clock) — method signatures
- [Playwright clock.md source](https://github.com/microsoft/playwright/blob/main/docs/src/clock.md) — docs source
- [Playwright issue #31772 — page.clock does not update the time within the service worker](https://github.com/microsoft/playwright/issues/31772) — scope limitation
- [Playwright issue #32486 — clock feature inside tests](https://github.com/microsoft/playwright/issues/32486) — feature request thread
- Local source: `node_modules/yjs/dist/yjs.cjs` (yjs@13.6.30)
- Local source: `node_modules/@hocuspocus/provider/dist/hocuspocus-provider.esm.js`

---

## Findings

### Finding 1: `page.clock.install()` overrides exactly this set of globals

**Confidence:** CONFIRMED (Playwright docs)
**Evidence:** From [clock docs](https://playwright.dev/docs/clock) — `page.clock.install()` overrides:

- `Date` constructor (and `Date.now()`)
- `setTimeout` / `clearTimeout`
- `setInterval` / `clearInterval`
- `requestAnimationFrame` / `cancelAnimationFrame`
- `requestIdleCallback` / `cancelIdleCallback`
- `performance` (including `performance.now()`)
- `Event.timeStamp`

**Critically, the docs do NOT mention:**

- `queueMicrotask` — NOT overridden
- `MessageChannel.postMessage` — NOT overridden (no documentation of override)
- WebSocket timers / heartbeats — NOT overridden; WebSocket messages flow in real time regardless of `page.clock` state
- `fetch` / `XMLHttpRequest` response timing — NOT overridden; network operations run in real time

**Implications:**
- The WebSocket layer (Hocuspocus protocol, Yjs sync messages) continues to run in real time even when `page.clock` is installed.
- Only JavaScript-side periodic checks (`setInterval`, `setTimeout`) are frozen.
- `queueMicrotask`-based scheduling (used by some Y.js internals) is not affected.

### Finding 2: Installation order matters — install AFTER critical page setup

**Confidence:** CONFIRMED
**Evidence:** From Playwright clock docs, best practice:

> "For best results, install the clock before navigating the page and set it to a time slightly before the intended test time. This ensures that all timers run normally during page loading, preventing the page from getting stuck."

Also from the docs:
> "If you call `install` at any point in your test, the call MUST occur before any other clock related calls... Calling these methods out of order will result in undefined behavior."

**Implications:**
- For CRDT tests, the "install before navigating" advice conflicts with our need for real-time WebSocket handshake during initial sync. The right pattern for CRDT tests: install clock AFTER `provider.synced === true`, not before `page.goto()`.
- Calling `install` repeatedly or after other clock methods has undefined behavior — install exactly once per test.

### Finding 3: Y.js internal timer inventory (yjs@13.6.30)

**Confidence:** CONFIRMED (direct source inspection)
**Evidence:** Grep of `node_modules/yjs/dist/yjs.cjs`:

| API | Count | Notes |
|---|---|---|
| `performance.now` | 13 | Used for awareness-meta timestamps, transaction timing, internal instrumentation |
| `setTimeout` | 2 | Likely `setTimeout(fn, 0)` deferred-work patterns (y-prosemirror's `setTimeout(..., 0)` is in a separate package — see Finding 4) |
| `setInterval` | 0 | Y.js core has no periodic timers |
| `queueMicrotask` | 0 in yjs core | Some y-* packages may use it independently |
| `requestAnimationFrame` | 0 in yjs core | — |

**Implications:**
- Under `page.clock.install()`, Y.js's `performance.now()` returns fake time. This affects awareness-meta `lastUpdated` timestamps.
- Hocuspocus compares `now - this.meta.get(this.clientID).lastUpdated` against `outdatedTimeout/2` — if one uses fake time and the other uses real time (because Hocuspocus also does `getUnixTime()` which MAY use `Date.now()` — also overridden), the comparison should stay consistent as long as BOTH clocks are on the same baseline.
- The `setTimeout(fn, 0)` usages in Y.js core ARE overridden — tests using `page.clock.runFor(0)` would flush them.

### Finding 4: y-prosemirror's `setTimeout(..., 0)` requirement (corroborated from fanout A)

**Confidence:** CONFIRMED (documented in fanout A evidence)
**Evidence:** From the parent report's fanout A research (`fanout/2026-04-17-follow-ups/crdt-readiness-signals-playwright/evidence/d3-post-typing-quiescence.md`): y-prosemirror's sync plugin defers work via `setTimeout(fn, 0)` (suggestions.test.js:57-66 of y-prosemirror), requiring a minimum 1-macrotask wait after ProseMirror dispatch.

**Implications:**
- Under `page.clock.install()`, advancing `clock.runFor(0)` or `clock.runFor(1)` fires the `setTimeout(..., 0)` callback — fake time is compatible.
- Tests using `waitForFunction` already tolerate this (the wait polls every macrotask); `page.clock` would make the wait deterministic.

### Finding 5: Hocuspocus provider internal timer inventory (@hocuspocus/provider)

**Confidence:** CONFIRMED (direct source inspection)
**Evidence:** Grep of `node_modules/@hocuspocus/provider/dist/hocuspocus-provider.esm.js`:

| Location (line) | API | Purpose | Scope |
|---|---|---|---|
| :812 | `setInterval` | Awareness heartbeat — re-broadcasts local state if `outdatedTimeout/2` has passed since last update | `y-protocols/awareness` module |
| :1172 | `setInterval` | Connection checker — `setInterval(this.checkConnection, messageReconnectTimeout / 10)`. Detects stale connections for reconnect logic. | HocuspocusProvider.constructor |
| :1790 | `setInterval` | Force-sync interval — `setInterval(this.forceSync, forceSyncInterval)`. Our config uses `forceSyncInterval: 5000`. Periodic defense against "synced event never fires" edge cases. | HocuspocusProviderWebsocket |
| :1398 | `setTimeout` | Reconnect-after-close delay — `setTimeout(() => this.connect(), this.configuration.delay)`. | onOpen failure path |

**Implications:**
- Under `page.clock.install()`:
  - **Awareness heartbeat frozen** — own awareness state won't re-broadcast periodically. Affects multi-client tests where Peer B's awareness of Peer A matters.
  - **Connection checker frozen** — if the WebSocket goes stale (silently dropped), the provider won't detect it. Tests that exercise disconnect/reconnect will fail.
  - **Force-sync frozen** — `forceSyncInterval: 5000` is the safety net for "synced event never fires." Disabled under fake time. This matters for our SPEC D8-style safety net.
  - **Reconnect-delay frozen** — `setTimeout` for reconnect delay doesn't fire unless the test advances the clock. Tests that cause disconnect then expect auto-reconnect will hang.

### Finding 6: WebSocket messages flow in real time under `page.clock`

**Confidence:** CONFIRMED (Playwright docs omission + mechanism reasoning)
**Evidence:** Playwright docs [clock page](https://playwright.dev/docs/clock) enumerates the overridden globals. WebSocket is not in the list. WebSocket is a browser-managed connection primitive — not a JavaScript timer — so `page.clock.install()` cannot intercept message delivery timing.

Corroborating: Playwright's [WebSocket docs](https://playwright.dev/docs/api/class-websocket) treat WebSockets as independent network events. `context.routeWebSocket` is the separate API for intercepting WebSocket traffic.

**Implications:**
- The Hocuspocus initial-sync protocol (sync step 1 → sync step 2 → update messages) runs in real time under `page.clock`.
- `provider.synced === true` fires on a real-time message arrival, not on fake-time progression.
- Y.js `update` events propagated via WebSocket fire in real time.
- Only the JavaScript-side *response to messages* (debounces, observers, state updates triggered BY messages) can be controlled via `page.clock`.

### Finding 7: Service-worker boundary ([#31772](https://github.com/microsoft/playwright/issues/31772))

**Confidence:** CONFIRMED
**Evidence:** Playwright issue #31772 documents that `page.clock` does NOT update time within service worker contexts. Time inside service workers continues to run in real time.

**Implications:**
- OK does not currently use service workers for the editor. If we add one (e.g., for offline sync), `page.clock` would not affect timer code running there.
- For the current spec's scope, this is a non-issue.

### Finding 8: Recommended usage pattern (synthesized)

**Confidence:** INFERRED (based on combined findings; not a single authoritative source)
**Evidence:** Findings 1-7 combined.

**Compatible use cases (`page.clock` OK):**

| Scenario | Why it works |
|---|---|
| Tests that type into the editor and wait for Observer A's 50ms debounce to settle | `setTimeout`/`performance.now` overrides flush the debounce via `clock.runFor(50)` |
| Tests that wait for typing-defer's 300ms timeout | Same mechanism |
| Tests that exercise chunked-paste rAF yields | `requestAnimationFrame` is overridden |
| Tests that verify slash-menu filter timing | If the filter debounces, fake-time advances deterministically |

**Incompatible use cases (must NOT use `page.clock` or scope it):**

| Scenario | Why it breaks |
|---|---|
| Connection drop + reconnect tests | Hocuspocus's reconnect-delay `setTimeout` and connection-checker `setInterval` are frozen |
| Tests that rely on `forceSync` interval firing | `setInterval` is frozen |
| Multi-client awareness propagation tests | Awareness heartbeat is frozen |
| Tests spanning Hocuspocus `messageReconnectTimeout` | The connection checker is frozen |
| Any test where "the provider has been idle for N seconds" matters | Hocuspocus internal idle detection is frozen |

**Recommended test structure:**

1. **Default for most tests:** Do not install `page.clock`. Use `waitForFunction(() => document.querySelector('[data-state="ready"]'))` against state changes. This is the primary G1 pattern per the parent report.

2. **Opt-in for debounce-sensitive tests:** A helper `installClockAfterSync(page)`:
   ```typescript
   async function installClockAfterSync(page: Page) {
     // Wait for provider sync on real time
     await page.waitForFunction(() => window.__activeProvider?.synced === true);
     // Only THEN install clock — connection-layer timers are already stable
     await page.clock.install();
   }
   ```
   Used in tests where the *subject* of the test is debounce or typing timing — the goal is deterministic advance, not a full provider lifecycle.

3. **Never use `page.clock` in tests that exercise connection lifecycle** — disconnect/reconnect, forceSync behavior, awareness outdated detection. These require real timer progression.

---

## Negative searches

- Searched for "yjs page.clock" / "hocuspocus page.clock" / "y-websocket page.clock": **NOT FOUND.** No community usage of `page.clock` with Y.js or Hocuspocus appears documented as of 2026-04-17. The spec would be pioneering this combination.
- Searched for `page.clock` + `queueMicrotask` interaction: **NOT FOUND** as a documented behavior. The omission from the override list is the strongest signal that it's not affected.
- Searched Hocuspocus issue tracker for "clock" / "fake time" / "deterministic": **NOT FOUND** — Hocuspocus has no documented position on fake-time testing.

---

## Gaps / follow-ups

- **Did not prototype `installClockAfterSync` in a real test.** Confidence is based on API docs + source inspection; a quick spike would elevate to CONFIRMED. Worth ~30 min in the spec's implementation phase.
- **Did not trace what happens on WebSocket re-open during installed clock.** If the connection flaps while `page.clock` is installed, the behavior is undefined in our synthesis — likely the reconnect-delay `setTimeout` doesn't fire until time is advanced. Tests should set up connection state before installing.
- **Playwright `page.clock` Java/Python/.NET bindings all document the same API surface** per the cross-reference in the search results. The Node bindings (what OK uses) match.
