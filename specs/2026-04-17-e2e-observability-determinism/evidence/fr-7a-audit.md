# fr-7a-disconnect-source-mode.e2e.ts — audit under retries=2 + failOnFlakyTests

**Audit date:** 2026-04-17
**Audit scope:** every test in `packages/app/tests/stress/fr-7a-disconnect-source-mode.e2e.ts`
**Audit driver:** US-015 / Phase 5 challenger 1.5 — file is timing-sensitive
(disconnect simulation via `__activeProvider.disconnect()`) but not in the
#188/#185/QA-022/S6/F11 flake set. The new CI regime (retries=2 +
failOnFlakyTests=true) could surface latent flakes.

## Test inventory + timing contracts

### `connected state: source toggle is interactive` (line 60)

- **Synchronization:** none beyond `beforeEach`'s `waitForProvider(page)` and
  `waitForSelector('.ProseMirror')`.
- **Assertions:** `expect(visualToggle(page)).toBeEnabled()` +
  `expect(sourceToggle(page)).toBeEnabled()` — Playwright auto-retries each
  `toBeEnabled` with the default 5s timeout.
- **Timing risk:** none. Both signals are immediate post-sync.

### `disconnected state: source toggle becomes disabled` (line 66)

- **Synchronization:** `await page.evaluate(() => window.__activeProvider?.disconnect())`
  fires synchronously; the React state propagation through `useSyncStatus` →
  `EditorHeader` re-render is bounded by React commit cycle.
- **Assertions:** `expect(sourceToggle(page)).toBeDisabled({ timeout: 15_000 })`
  + `expect(visualToggle(page)).toBeEnabled()`.
- **Timing risk:** none. The 15s timeout covers any reasonable React commit
  + re-render window. `expect.poll`-style waiting absorbs jitter.

### `reconnect re-enables source toggle without page reload` (line 89)

- **Synchronization:** disconnect → `toBeDisabled` → connect → `toBeEnabled`.
- **Assertions:** `toBeDisabled({ timeout: 15_000 })` + `toBeEnabled({ timeout: 30_000 })`.
- **Timing risk:** Reconnect is the slowest path here — Hocuspocus client
  must re-establish WebSocket + complete initial sync before status flips
  to 'connected'. The 30s timeout is generous; under healthy CI it
  consistently completes in <1s (observed: 736ms in the audit run).

### `disconnected state: tooltip text matches spec` (line 108)

- **Synchronization:** disconnect → `toBeDisabled` → hover wrapper → wait
  for tooltip with text match.
- **Assertions:** `toBeVisible({ timeout: 5_000 })` for tooltip — Radix's
  default `delayDuration` is 700ms, so 5s gives 7x headroom.
- **Timing risk:** none. The tooltip wrapper uses the documented
  `<span tabIndex={0}>` pattern (per EditorHeader.tsx:94-107) so hover
  always fires.

## Banned-pattern scan

| Pattern | Count |
| --- | --- |
| `page.waitForTimeout(` | 0 |
| `waitUntil: 'networkidle'` | 0 |
| `new Promise(resolve => setTimeout(resolve,` | 0 |
| `page.pause(` | 0 |

The file's docstring header mentions `page.routeWebSocket` as the
disconnect strategy, but the actual implementation uses
`window.__activeProvider.disconnect()` (see commented rationale at
line 67-76 — `context.setOffline(true)` doesn't close existing
WebSockets on Chromium, so direct provider disconnect is the reliable
path). The docstring is slightly misleading but the implementation is
sound.

## Stress verification under the new CI regime

```
VITE_PORT=22439 bunx playwright test tests/stress/fr-7a-disconnect-source-mode.e2e.ts \
  --repeat-each=5 --workers=4 --reporter=list
```

Result: **20 passed (11.1s)** — no flakes, no retries needed.

## Conclusion

**Audited clean.** The file's timing assumptions are explicitly bounded
(15s / 30s / 5s) with `expect.poll`-style waiting absorbing variance. No
hidden timing reliance, no patterns that would fail flaky under
`retries: 2 + failOnFlakyTests: true`.

The single annotation worth carrying forward: the docstring's
`page.routeWebSocket` reference does not match the actual disconnect
mechanism. A follow-up tidy could correct the docstring, but it's not
load-bearing for stability — out of US-015 scope per greenfield
discipline ("no kitchen-sinking in touched files").
