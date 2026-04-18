---
dimension: D1 — Readiness signals after page load
date: 2026-04-16
sources: outline, blocknote, tldraw, tiptap, hocuspocus, y-prosemirror, y-tiptap, hedgedoc, affine, logseq
---

# Evidence: D1 — Readiness signals after page load

**Primary question:** After `page.goto()`, what do collaborative-editor E2E tests wait for to declare "editor is ready for input"?

---

## Key files / pages referenced

- `blocknote/tests/src/utils/editor.ts` — Playwright helper pattern
- `tldraw/apps/examples/e2e/shared-e2e.ts` — selector + `page.evaluate(editor.*)` readiness composite
- `hocuspocus/tests/utils/retryableAssertion.ts` — polling primitive
- `logseq/clj-e2e/src/logseq/e2e/assert.clj` — `assert-graph-loaded?` pattern
- `AFFiNE/tests/kit/src/...` — `waitForEditorLoad(page)` fixture (referenced)
- `hedgedoc/frontend/cypress/support/fill.ts` — Cypress chainer pattern

---

## Findings

### Finding: DOM element existence is the universal minimum
**Confidence:** CONFIRMED
**Evidence:** `blocknote/tests/src/utils/editor.ts:4-6` (see `~/.claude/oss-repos/blocknote/tests/src/utils/editor.ts`)

```ts
export async function focusOnEditor(page: Page) {
  await page.waitForSelector(EDITOR_SELECTOR);
  await page.click(EDITOR_SELECTOR);
}
```

Also `tldraw/apps/examples/e2e/shared-e2e.ts:44-52`:

```ts
export async function setupPage(page: PlaywrightTestArgs['page']) {
  await page.goto('http://localhost:5420/end-to-end')
  await page.waitForSelector('.tl-canvas')
  await page.evaluate(() => {
    editor.user.updateUserPreferences({ animationSpeed: 0 })
  })
  await page.mouse.move(50, 50)
  await page.locator('.tl-container').focus()
}
```

**Implications:** Every surveyed project uses some form of `waitForSelector(editor-root)` / `getByTestId(...)`.toBeVisible() as the first gate. None uses `waitUntil: 'networkidle'` alone as a readiness signal. However, **DOM existence is insufficient** for CRDT editors — an attached `.ProseMirror` or `.tl-canvas` element does not guarantee the provider has synced.

---

### Finding: BlockNote still uses `waitUntil: 'networkidle'` in places
**Confidence:** CONFIRMED
**Evidence:** `blocknote/tests/src/end-to-end/colors/colors.test.ts:16`

```ts
await page.goto(BASE_URL, { waitUntil: "networkidle" });
```

**Implications:** Despite Playwright marking `networkidle` as DISCOURAGED, BlockNote's current E2E tests still depend on it. No explicit provider-sync wait follows — the assumption is that network-quiescence + DOM attachment equals readiness. BlockNote's test infrastructure is Playwright-native but does NOT expose Yjs provider hooks at the E2E layer (see D2).

---

### Finding: tldraw exposes a global `editor` object on `window` for tests to call
**Confidence:** CONFIRMED
**Evidence:** `tldraw/apps/examples/e2e/shared-e2e.ts:46-49` (inside `page.evaluate`)

```ts
await page.evaluate(() => {
  editor.user.updateUserPreferences({ animationSpeed: 0 })
})
```

Also `hardResetEditor` at line 59-70:

```ts
export async function hardResetEditor(page: Page) {
  await page.evaluate(() => {
    editor.selectAll().deleteShapes(editor.getSelectedShapeIds())
    editor.setCurrentTool('select')
    editor.zoomToFit()
    editor.resetZoom()
  })
}
```

**Implications:** tldraw chose the "expose editor as global for tests" approach — the same architectural pattern used by many CRDT apps. Tests call through the editor's public API rather than simulating DOM events, which eliminates a large class of "typed input but transaction not settled" races. The editor is made available in the `/end-to-end` harness route only.

---

### Finding: Hocuspocus provides `retryableAssertion` as its test primitive
**Confidence:** CONFIRMED
**Evidence:** `hocuspocus/tests/utils/retryableAssertion.ts:5-18`

```ts
export const retryableAssertion = async (t: ExecutionContext, recoverableTry: (tt: ExecutionContext) => void) => {
  while (true) {
    const lastTry = await t.try(recoverableTry)
    if (lastTry.passed) {
      lastTry.commit()
      break
    }
    lastTry.discard()
    await sleep(100)
  }
}
```

**Implications:** Hocuspocus's own (AVA-based, non-browser) test suite uses polling at 100ms intervals with no upper bound. This is structurally equivalent to Playwright's `expect.poll()`. The primitive is used alongside `provider.on('synced')` (see D2) — the event-based signal for happy-path, the polling primitive for eventual-consistency assertions.

---

### Finding: Logseq uses `assert-graph-loaded?` + custom "cloud idle" button state
**Confidence:** CONFIRMED
**Evidence:** `logseq/clj-e2e/src/logseq/e2e/assert.clj:40-43`

```clojure
(defn assert-graph-loaded?
  []
  (assert-is-visible (w/get-by-test-id "page title")))
```

Combined with `logseq/clj-e2e/src/logseq/e2e/graph.clj:23,88`:

```clojure
(def ^:private cloud-ready-indicator "button.cloud.on.idle")
(w/wait-for cloud-ready-indicator {:timeout 20000})
```

**Implications:** Logseq's readiness is **two-tiered**: (1) graph/page DOM rendered, (2) production UI element (`button.cloud.on.idle`) shows cloud is caught up. Notably, the cloud-ready state uses a CSS class on a visible button element — this is production code doubling as a test signal, not DEV-only instrumentation. The button is visible to end users as the sync indicator and **the same element** provides test readiness. See D2 for the parallel `rtc-tx` hidden div pattern.

---

### Finding: AFFiNE uses a named fixture `waitForEditorLoad(page)`
**Confidence:** CONFIRMED (via subagent web research)
**Evidence:** `AFFiNE/tests/affine-local/e2e/open-affine.spec.ts:12-15` (from `github.com/toeverything/AFFiNE/tree/canary/tests`)

```ts
await waitForEditorLoad(page)
await page.getByTestId('workspace-name').click()
await expect(localDemoTipsItem).toBeVisible()
```

**Implications:** AFFiNE centralizes editor-ready waiting in a named fixture. Internal implementation of `waitForEditorLoad` not captured in this research pass — but the fact that it's a named, shared helper (not inline per-test logic) is the pattern worth noting: **editor-ready becomes a test concept with a single definition**. AFFiNE's test kit (`tests/kit/src/`) also centralizes page object fixtures.

---

### Finding: Tiptap demos use a naive polling `waitUntilElementExists`
**Confidence:** CONFIRMED
**Evidence:** `tiptap/demos/setup/helper.ts:1-8`

```ts
const waitUntilElementExists = (selector: any, callback: (element: Element) => void) => {
  const element = document.querySelector(selector)
  if (element) {
    return callback(element)
  }
  setTimeout(() => waitUntilElementExists(selector, callback), 500)
}
```

**Implications:** Tiptap's own demo harness uses a 500ms-poll setTimeout loop rather than Playwright primitives. This helper runs **in-page** (document.querySelector) not from the test runner. Tiptap's Cypress tests (`tests/cypress/`) are relatively lightweight and do NOT contain multi-peer collaboration E2E coverage — Tiptap defers collaboration testing to y-prosemirror / y-tiptap / Hocuspocus downstream.

---

### Finding: HedgeDoc relies on Cypress's implicit 15s command timeout
**Confidence:** CONFIRMED
**Evidence:** `hedgedoc/frontend/cypress.config.ts:8` + `hedgedoc/frontend/cypress/e2e/documentTitle.spec.ts:8-11`

```ts
// cypress.config.ts
defaultCommandTimeout: 15000
```

```ts
// documentTitle.spec.ts
cy.visitTestNote()
cy.setCodemirrorContent('# Title')
cy.title().should('eq', 'Title')
```

**Implications:** HedgeDoc relies on Cypress's "retry every 100ms for up to 15 seconds" built-in behavior rather than explicit readiness signals. Tests do not expose or wait for a CRDT provider `synced` event. The `cy.setCodemirrorContent()` helper writes directly to the CodeMirror state, bypassing keystroke simulation entirely — a different approach to the quiescence problem (see D3).

---

## Negative searches

- Searched for `waitUntil: 'load'` in blocknote/tldraw/hedgedoc: tldraw uses `waitForLoadState('domcontentloaded')` (`tldraw/apps/dotcom/client/e2e/fixtures/HomePage.ts:26`) — a valid alternative to networkidle.
- Searched for `window.__provider`, `window.__hocuspocus`, `window.__ydoc` in blocknote tests: **NOT FOUND**. BlockNote does not use a window-global test hook for provider sync status.
- Searched for `data-synced` DOM attribute in all projects: NOT FOUND except for Logseq's `data-testid="rtc-tx"` (see D2, different purpose — carries CRDT tx count not a boolean flag).

---

## Gaps / follow-ups

- AFFiNE's `waitForEditorLoad` implementation not fetched directly — worth a follow-up to see whether it polls provider.synced, DOM-only, or a composite.
- Outline was found to NOT ship E2E tests in its OSS repo — only unit tests. Outline's `MultiplayerEditor.tsx:159-167` does expose `provider.on('synced')` at the application layer with state hooks (`isLocalSynced`, `isRemoteSynced`), but this is app-side, not test-side.
