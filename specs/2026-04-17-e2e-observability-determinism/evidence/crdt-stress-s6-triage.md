---
name: crdt-stress-s6-triage
description: Empirical narrowing of crdt-stress S6 flake — reproduces locally, generic 404 that filter misses
sources:
  - packages/app/tests/stress/crdt-stress.e2e.ts:21-120
  - local run bfotmqtjh (2026-04-17)
---

# crdt-stress S6 triage

## Repro (deterministic, local)

```bash
cd packages/app
VITE_PORT=<any> bunx playwright test tests/stress/crdt-stress.e2e.ts --reporter=list -g "S6"
```

**Result: 1 failed / 1 attempt.** Reproduces locally on the first run. Not parallelism-dependent.

## Failure signature

```
Error: expect(received).toEqual(expected)

- Array []
+ Array [
+   Object {
+     "text": "Failed to load resource: the server responded with a status of 404 (Not Found)",
+     "type": "error",
+   },
+ ]
```

## Root cause narrowing

The test installs `page.on('console', ...)` + `page.on('pageerror', ...)` collectors at line 24-25. Line 110-119 filters out "benign" errors:
- favicon
- HMR
- [vite]
- WebSocket
- ws://
- "can't establish a connection"

The failing error — `"Failed to load resource: the server responded with a status of 404 (Not Found)"` — does **NOT** match any filter pattern. The **URL that 404'd is not in the error text** — Playwright's console message `text()` is just the generic Chrome DevTools message, and the URL lives in `message.location()` (which the test doesn't capture).

So we don't know yet **which** URL 404'd, only that some resource fetched by the page returned 404.

## Candidate sources of the 404

- **`/api/test-reset` racing with doc creation.** The test sequence is: create-page via `/api/create-page` → navigate → `/api/test-reset` → type → etc. If `/api/create-page` returns before the file-watcher index picks it up, a subsequent documents fetch could 404. (Low confidence — would typically be filtered as WebSocket race.)
- **Metadata fetch for the per-test doc.** The sidebar fetches document metadata; if `GET /api/metadata/<test-crdtstress-*>` is called before the doc lands on disk, 404.
- **Source map fetch from @vitejs or React DevTools.** Some browsers fetch `.map` files for uncompiled code; a missing .map → 404. Usually filtered by `[vite]` or similar but not always.
- **URL-based navigation to a non-existent doc.** If the test's hash navigation targets a URL whose document doesn't exist at that moment, the app may trigger a fetch that 404s.

## Fix paths (ranked)

### F1 (most robust): Capture URL in error logger + widen filter by URL pattern

Change the logger:
```typescript
page.on('console', (m) => {
  const loc = m.location();
  logs.push({
    type: m.type(),
    text: m.text(),
    url: loc.url,
    line: loc.lineNumber,
  });
});
```

Then filter by URL pattern (e.g., `!e.url?.includes('/favicon.svg')`, `!e.url?.includes('.map')`, `!e.url?.endsWith('.ts')`). Log the URLs on failure so we KNOW what's 404ing.

### F2 (workaround): Widen filter to match the generic 404 text

Add `!e.text.includes('Failed to load resource')` to the filter. Masks the issue but doesn't diagnose.

### F3 (root-cause fix): Eliminate the 404 at its source

If the 404 is from a metadata fetch during test-reset, fix the app-side timing or the `/api/test-reset` sequencing so no intermediate state is fetched in a way that 404s.

## Recommended approach

F1 + F3. Enhance the logger to capture URLs (F1) to diagnose; once the URL is known, fix the root cause (F3) or add a precise URL-based filter (F1's extension). **Avoid F2** — it masks the signal.

## Cross-reference to spec

- **Cluster 7 (§11 Q26/Q27):** Q26 "root cause" narrowed to "unknown 404, needs logger enhancement to diagnose". Q27 "fix location" — F1 is test-infra (logger), F3 may be server-side. User already approved server-side changes per §5c.
- **US-20 (§6b):** Refine to: (a) enhance logger in `crdt-stress.e2e.ts` to capture URL; (b) identify which URL 404s; (c) fix root cause (server-side fetch timing or client-side fetch prevention).

## Impact scope

First pass (logger enhancement): ~5 LoC in crdt-stress.e2e.ts.
Second pass (root cause fix): unknown until URL is identified — could be server API endpoint timing, or client-side fetch deduplication.
