---
dimension: D3 — Post-typing quiescence signals
date: 2026-04-16
sources: y-prosemirror, y-tiptap, tldraw, blocknote, hocuspocus, logseq, hedgedoc
---

# Evidence: D3 — What tests wait for after keyboard input

**Primary question:** After `page.keyboard.type(...)`, what do tests wait for to ensure the CRDT has processed the input AND all observer bridges have settled?

---

## Key files / pages referenced

- `y-prosemirror/tests/suggestions.test.js:57-66` — `safeDispatch` helper with explicit comment on deferred work
- `tldraw/apps/examples/e2e/tests/test-rich-text-toolbar.spec.ts:275-279` — sleep-after-type pattern
- `tldraw/apps/examples/e2e/tests/test-rich-text-toolbar.spec.ts:395-396` — "historically flaky without the sleep" comment
- `blocknote/tests/src/end-to-end/keyboardhandlers/keyboardhandlers.test.ts:403-405` — inputRule wait
- `hocuspocus/tests/provider/hasUnsyncedChanges.ts:25-39` — event-then-poll pattern
- `logseq/clj-e2e/src/logseq/e2e/util.clj:64-74` — `press-seq` + `exit-edit` settling

---

## Findings

### Finding: y-prosemirror explicitly documents post-dispatch `setTimeout(..., 0)` work
**Confidence:** CONFIRMED
**Evidence:** `y-prosemirror/tests/suggestions.test.js:57-66`

```js
/**
 * Dispatch a transaction to a ProseMirror view and wait a tick so that any
 * deferred sync-plugin follow-up work (e.g. adjustments scheduled via
 * `setTimeout(..., 0)`) has a chance to run before the test proceeds.
 * @param {EditorView} view
 * @param {import('prosemirror-state').Transaction} tr
 */
const safeDispatch = async (view, tr) => {
  view.dispatch(tr)
  await promise.wait(1)
}
```

**Implications:** This is direct, documented confirmation that y-prosemirror (and by extension, anything downstream of it) schedules sync-plugin work via `setTimeout(fn, 0)`. **After a ProseMirror dispatch, the CRDT has NOT finished reflecting the change until at least one macrotask tick has elapsed.** A 1ms wait is the minimum known-safe gap. In a Playwright context, this translates to either waiting for an observable effect (the next DOM update, the next y-doc `update` event) or an explicit microtask yield.

---

### Finding: Hocuspocus uses event-then-poll for post-mutation quiescence
**Confidence:** CONFIRMED
**Evidence:** `hocuspocus/tests/provider/hasUnsyncedChanges.ts:25-39`

```ts
const provider = newHocuspocusProvider(t, server, {
  awareness: undefined,
})
provider.document.getMap('test').set('foo', 'bar')
t.is(provider.hasUnsyncedChanges, true)
// changes are synced
await retryableAssertion(t, tt => {
  tt.is(provider.hasUnsyncedChanges, false)
})
```

And lines 72-86 for the event-first variant:

```ts
await new Promise((resolve, reject) => {
  provider.on('unsyncedChanges', () => {
    provider.off('unsyncedChanges')
    if (provider.hasUnsyncedChanges) {
      resolve('done')
    } else {
      reject()
    }
  })
})
await retryableAssertion(t, tt => {
  tt.is(provider.hasUnsyncedChanges, false)
})
```

**Implications:** The `hasUnsyncedChanges` property + `unsyncedChanges` event pair is Hocuspocus's post-mutation quiescence primitive. Pattern is:
1. Apply mutation → `hasUnsyncedChanges` goes `true` (may be observed via event)
2. Server ACKs via SyncStep → `hasUnsyncedChanges` goes `false`
3. Poll `hasUnsyncedChanges === false` to declare "mutation fully propagated"

Unlike `synced` (which is initial-sync only), `hasUnsyncedChanges` tracks the ongoing edit lifecycle and is the correct primitive for per-mutation settling.

---

### Finding: tldraw uses bare `sleep(N)` after typing, with comments acknowledging it
**Confidence:** CONFIRMED
**Evidence:** `tldraw/apps/examples/e2e/tests/test-rich-text-toolbar.spec.ts:275-279`

```ts
await page.keyboard.type(PARA1)
await sleep(200)
await page.keyboard.press('Enter')
await page.keyboard.type(PARA2)
await sleep(200)
```

And lines 395-396 with an explicit flakiness comment:

```ts
// historically this has been flaky without the sleep
await sleep(2000)
```

Also `sleepFrames` helper at `tldraw/apps/examples/e2e/shared-e2e.ts:161-163`:

```ts
export function sleepFrames(frames = 2): Promise<void> {
  return sleep(frames * (1000 / 60))
}
```

**Implications:** tldraw's tests document the problem rather than solve it structurally. `sleep(2000)` with "historically flaky without" is a common pattern that admits: we don't have a reliable quiescence signal, so we pad. Note this is the project that **did** solve readiness via the `window.editor` global (D1) — but typing-induced quiescence is still unsolved. The typed keyboard input reaches DOM → tldraw store → sync-core pipeline, and no observable "pipeline settled" signal is exposed.

---

### Finding: BlockNote waits for the effect of typing, not a settling signal
**Confidence:** CONFIRMED
**Evidence:** `blocknote/tests/src/end-to-end/keyboardhandlers/keyboardhandlers.test.ts:403-405`

```ts
await page.keyboard.type("[ ] My task");
await page.waitForTimeout(500);
```

`blocknote/tests/src/end-to-end/slashmenu/slashmenu.test.ts:42-43`:

```ts
await executeSlashCommand(page, "h1");
await page.keyboard.type("This is a H1");
await waitForSelectorInEditor(page, H_ONE_BLOCK_SELECTOR);
```

**Implications:** BlockNote's two patterns: (1) bare `waitForTimeout(500)` when the effect is syntactic (input rule triggering block conversion) — essentially hope-based; (2) `waitForSelectorInEditor(selector)` when the effect materializes a new DOM element. Pattern (2) is the cleaner Playwright-idiomatic approach: wait for the observable consequence, not the underlying state.

**Count of `waitForTimeout` in BlockNote E2E tests:** 84 occurrences (subagent survey). This is the modal "quiescence" strategy — explicit time padding, not signal-driven.

---

### Finding: Logseq's `press-seq` takes an explicit per-keystroke delay
**Confidence:** CONFIRMED
**Evidence:** `logseq/clj-e2e/src/logseq/e2e/util.clj:64-68`

```clojure
(defn press-seq
  [text & {:keys [delay] :or {delay 0}}]
  (let [input-node (w/-query "*:focus")]
    (.pressSequentially input-node text
                        (.setDelay (Locator$PressSequentiallyOptions.) delay))))
```

And `exit-edit` settles via mode assertion (`util.clj:70-74`):

```clojure
(defn exit-edit
  []
  (when (get-editor)
    (k/esc))
  (assert/assert-non-editor-mode))
```

**Implications:** Logseq uses Playwright's native `pressSequentially(..., delay)` — which inserts a fixed delay between keystrokes (default 0). This keeps the inputs realistic rate-wise but doesn't solve post-typing quiescence — for that, Logseq uses `exit-edit` (which escapes then asserts non-editor-mode is active). The mode-state assertion functions as the quiescence signal: "edit has been fully committed and the editor has left edit mode." This is a clean pattern — a state-machine-driven quiescence rather than time-based.

---

### Finding: y-tiptap uses variable `promise.wait(10)` / `promise.wait(50)` after transactions
**Confidence:** CONFIRMED
**Evidence:** `y-tiptap/tests/y-tiptap.test.js` (grep results; multiple occurrences at lines 456, 468, 516, 545, 573, 603)

Patterns: `await promise.wait(10)` for small mutations, `await promise.wait(50)` for larger ones.

**Implications:** y-tiptap's tests work below the Playwright/browser layer (lib0/testing + JSDOM). The waits are smaller here because:
- No browser event-loop overhead
- No persistence layer
- No network

This is useful for calibration: **the pure CRDT settling window is well under 10ms** in this environment. Longer waits in Playwright/E2E tests reflect the cost of DOM rendering, persistence debounce, and network roundtrips — not CRDT state settling itself.

---

### Finding: HedgeDoc bypasses keystroke simulation entirely via `cy.setCodemirrorContent`
**Confidence:** CONFIRMED
**Evidence:** `hedgedoc/frontend/cypress/e2e/documentTitle.spec.ts:8-11`

```ts
cy.visitTestNote()
cy.setCodemirrorContent('# Title')
cy.title().should('eq', 'Title')
```

**Implications:** HedgeDoc's custom Cypress command writes directly to CodeMirror's state via the editor's public API — no typing simulation, no input events, no composition. This is the most aggressive approach to the quiescence problem: sidestep it entirely by using a higher-level API that is synchronous (or returns a promise) at the point of mutation. The tradeoff: doesn't test the keystroke → editor input rule → CRDT pipeline end-to-end, only tests "CodeMirror state → downstream behavior."

---

## Negative searches

- `afterTransaction`, `awaitTransaction`, `onTransaction` wait patterns in Playwright E2E tests: **NOT FOUND**. No surveyed project exposes a "wait for next Y.Doc `afterTransaction` event" primitive to tests.
- Debounce-aware waits (`waitForDebounce(300)`, `awaitTypingDefer`) in any repo: **NOT FOUND**. No project surveyed implements a typing-defer-aware quiescence signal in tests.

---

## Gaps / follow-ups

- No surveyed project exposes a composite "all observers quiesced" signal suitable for a dual-CRDT editor. The closest patterns are: (a) Logseq's mode-state assertion, (b) Hocuspocus's `hasUnsyncedChanges`, (c) HedgeDoc's API-based bypass.
- The y-prosemirror comment about `setTimeout(..., 0)` deferred work is confined to the test file; it is not documented in the y-prosemirror README or the sync-plugin source. This is load-bearing knowledge that future integrators need to rediscover.
