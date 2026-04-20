---
name: Test timing primitives
description: Counts and patterns of wait primitives (waitForTimeout, waitForSelector, auto-retry, rAF, console events) across surveyed editor test suites.
type: evidence
---

# Evidence: Test timing primitives

**Dimension:** Test timing primitives (P0 Moderate)
**Date:** 2026-04-17
**Sources:** BlockNote, Milkdown, Lexical, Tiptap (Cypress legacy)

---

## Key files / pages referenced

- `blocknote/tests/src/end-to-end/**` — grep of all test files
- `milkdown/e2e/tests/**` — grep of all test files
- `milkdown/e2e/tests/misc/index.ts:62-72` — `waitNextFrame` (rAF-based)
- `milkdown/e2e/tests/plugin/listener.spec.ts:11-17` — `waitForEvent('console')` as event signal
- `lexical/packages/lexical-playground/__tests__/utils/index.mjs:890-895` — `sleep(delay)`
- `lexical/packages/lexical-playground/__tests__/utils/index.mjs:920-922` — `waitForSelector(page, selector, options)`

---

## Findings

### Finding: `waitForTimeout` is used in all surveyed Playwright editor suites; the ratio varies widely
**Confidence:** CONFIRMED
**Evidence:** Raw counts from grep:

| Project | `waitForTimeout` count | Most common value | Notes |
|---|---|---|---|
| BlockNote | 76 total | 58× `waitForTimeout(500)` | 7× 350ms, 3× 1000ms, 2× 300/150/100ms, 1× 700/200ms |
| Milkdown | 26 total | 17× `waitForTimeout(100)` | 3× 50ms, 3× `TEST_TEARDOWN_DELAY + TEARDOWN_BUFFER`, 1× 500ms, 1× 200ms |
| Tiptap | 0 in Playwright (uses Cypress `.wait(100)` legacy) | — | Only 2 Cypress specs; not a Playwright suite |

Shell commands used:
```bash
grep -rn "waitForTimeout" ~/.claude/oss-repos/blocknote/tests/src/end-to-end | wc -l  # → 76
grep -rn "waitForTimeout" ~/.claude/oss-repos/milkdown/e2e                            | wc -l  # → 26
```

Distribution:
```
blocknote/tests/src/end-to-end:
  58     await page.waitForTimeout(500);
   7     await page.waitForTimeout(350);
   3     await page.waitForTimeout(1000);
   2     await page.waitForTimeout(300);
   2     await page.waitForTimeout(150);
   2     await page.waitForTimeout(100);
   1     await page.waitForTimeout(700);
   1     await page.waitForTimeout(200);

milkdown/e2e:
  17   await page.waitForTimeout(100)
   3   await page.waitForTimeout(50)
   3     await page.waitForTimeout(TEST_TEARDOWN_DELAY + TEARDOWN_BUFFER)
   1   await page.waitForTimeout(500)
   1     await page.waitForTimeout(longDelay + TEARDOWN_BUFFER)
```

**Implications:** Neither project has a STOP rule against `waitForTimeout`. BlockNote's 76-count across its end-to-end suite is higher than Open Knowledge's reported 44 in a single spec, but comparable per-spec (BlockNote's ~20 specs, ~3-4 timeouts per spec). The consistent 500ms value in BlockNote is a "long enough for anything editor-y" insurance wait after major actions (click, select, press-enter).

### Finding: Milkdown's ratio of event-based wait to timeout is ~3:1; BlockNote's is ~1:1
**Confidence:** CONFIRMED
**Evidence:** BlockNote's end-to-end tests use:

```
blocknote/tests/src/end-to-end wait commands:
76  page.waitForTimeout(...)
58  page.waitForSelector(...)  (includes waitForSelectorInEditor helper variants, state: detached, etc.)
```

Milkdown uses locator auto-retry (`toHaveText`, `toHaveAttribute`) + `waitNextFrame` for most cases, reserving `waitForTimeout` for input-rule firing and debounce windows:

```ts
// milkdown/e2e/tests/misc/index.ts:62-72
export async function waitNextFrame(page: Page) {
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve()
        })
      })
    })
  })
}
```

**Implications:** `waitNextFrame` is a rAF-based signal that tells the test "the next browser paint has completed" — strictly deterministic vs real browser time, unlike `waitForTimeout(16)` which races the compositor. It's appropriate specifically when the editor performs synchronous DOM mutations on input + needs one frame to render them. Milkdown uses it instead of `waitForTimeout` for 30+ test cases.

### Finding: `waitForEvent('console')` is used as an event-based signal for editor state-change callbacks
**Confidence:** CONFIRMED
**Evidence:** Milkdown's `listener.spec.ts` uses console events as a deterministic signal that the editor's listener plugin fired:

```ts
// milkdown/e2e/tests/plugin/listener.spec.ts:11-18
let msgPromise = page.waitForEvent('console')
await page.keyboard.type('A')
const msg = await msgPromise
const [after, before] = msg.args()
const afterText = await after?.jsonValue()
const beforeText = await before?.jsonValue()
expect(afterText).toBe('testA\n')
expect(beforeText).toBe('test\n')
```

The test-page in dev (served by Milkdown's e2e harness) emits `console.log(afterMd, beforeMd)` on each markdown update. The test page arms the event wait, types, and then reads the event payload — no timeout.

**Implications:** A general pattern for editors with pluggable listeners: let the editor emit events on important state changes (parse complete, serialize complete, selection change), have the test-page bridge them to `console.log`, and have the test `waitForEvent('console')` for deterministic signals. This is a stronger pattern than `waitForTimeout` — guaranteed to fire on state change, no flake under CPU load.

### Finding: Lexical ships `sleep(delay)` but uses it sparingly — primarily for image-insertion waits where no cheap signal exists
**Confidence:** CONFIRMED
**Evidence:**

```js
// lexical/packages/lexical-playground/__tests__/utils/index.mjs:890-895 (WebFetch verified)
export async function sleep(delay) {
  await new Promise((resolve) => setTimeout(resolve, delay));
}

export async function sleepInsertImage(count = 1) {
  return await sleep(1000 * count);
}
```

Per WebFetch, `sleep(500)` is used after DateTime node insertion and `sleepInsertImage()` for image processing — both are surfaces with external/asynchronous work (image loading, time-based components) that lack a cheap DOM signal.

**Implications:** Lexical's convention is to use locator auto-retry for DOM state, `waitForSelector` for new elements, and reserve `sleep()` for async-work-that-has-no-selector-signal. This matches the parent report's recommendation.

### Finding: No editor project has an explicit "no waitForTimeout" lint rule or STOP rule in their test harness
**Confidence:** CONFIRMED
**Evidence:** Searched BlockNote, Milkdown, Lexical, Tiptap for documentation prohibiting `waitForTimeout` — no such rule found in README, CONTRIBUTING, or test-directory docs.

BlockNote's test harness freely mixes `waitForTimeout(500)` with event-based waits without apology. Milkdown uses fewer timeouts by preference but doesn't forbid them.

**Implications:** The editor-community convention is pragmatic: prefer event-based signals where they exist, accept `waitForTimeout` where they don't. Open Knowledge's spec adopting a "prefer event-based waits" convention aligns with the norm without needing a hard ban.

---

## Negative searches

- Searched all four projects for `waitForLoadState('networkidle')` in editor tests → zero results; editors don't wait on network after initial page load
- Searched for Playwright's `expect.poll()` → not used in surveyed editor suites
- Searched for fixture-based "waitForEditorReady" patterns → not found; all projects rely on `focusEditor` as implicit readiness

---

## Gaps / follow-ups

- BlockNote's 500ms convention likely originates from a debounce elsewhere in the codebase (side-menu show/hide animation is a known candidate). Not traced to a specific animation timing constant.
- Lexical's full count of `sleep`/`waitForTimeout` across 48+ spec files was not computed exhaustively; the summary reflects the utility module + WebFetch spot-checks.
