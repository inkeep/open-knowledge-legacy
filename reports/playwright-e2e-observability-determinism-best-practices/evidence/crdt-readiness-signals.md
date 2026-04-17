---
dimension: Follow-up A — CRDT readiness signals
date: 2026-04-17
sources:
  - github.com/logseq/logseq
  - github.com/ueberdosis/hocuspocus
  - github.com/yjs/y-prosemirror
  - github.com/ueberdosis/tiptap
  - github.com/TypeCellOS/BlockNote
  - github.com/tldraw/tldraw
  - github.com/outline/outline
  - github.com/hedgedoc/hedgedoc
  - github.com/toeverything/AFFiNE
---

# Evidence: CRDT readiness signals in Playwright/Cypress E2E tests

**Primary question:** How do collaborative-editor OSS projects using Yjs, Hocuspocus, and adjacent CRDT stacks signal "editor is ready for test input" and "test-visible mutation has propagated"? Primary-source code only, with file:line citations.

---

## Project inventory

| Project | Editor stack | E2E framework | Test location | Multi-peer E2E? |
|---|---|---|---|---|
| [BlockNote](https://github.com/TypeCellOS/BlockNote) | Tiptap + Yjs (opt-in) | Playwright | `tests/src/end-to-end/` | No |
| [Outline](https://github.com/outline/outline) | ProseMirror + Yjs + Hocuspocus | None (unit tests only) | — | No |
| [tldraw](https://github.com/tldraw/tldraw) | Custom store + `@tldraw/sync-core` | Playwright | `apps/examples/e2e/`, `apps/dotcom/client/e2e/` | No |
| [Tiptap](https://github.com/ueberdosis/tiptap) | ProseMirror + (optional) Yjs | Cypress | `tests/cypress/integration/` | No |
| [Hocuspocus](https://github.com/ueberdosis/hocuspocus) | Yjs server + provider | AVA (not browser) | `tests/provider/`, `tests/server/` | Yes (in-process) |
| [y-prosemirror](https://github.com/yjs/y-prosemirror) | PM ↔ Yjs bridge | lib0/testing + JSDOM | `tests/` | Yes (in-memory) |
| [HedgeDoc](https://github.com/hedgedoc/hedgedoc) | CodeMirror + Yjs (2.x) | Cypress | `frontend/cypress/e2e/` | No |
| [AFFiNE](https://github.com/toeverything/AFFiNE) | BlockSuite + y-octo | Playwright | `tests/affine-local/e2e/` | Not in surveyed files |
| [Logseq](https://github.com/logseq/logseq) | Custom + CRDT (RTC worker) | Clojure + Playwright (Wally) | `clj-e2e/` | **Yes — counter-based convergence** |

---

## Findings

### Finding: Logseq ships a hidden production DOM element carrying CRDT transaction counters

**Confidence:** CONFIRMED
**Evidence:** Production code at `src/main/frontend/components/rtc/indicator.cljs:176`:

```clojure
[:div.hidden {"data-testid" "rtc-tx"} (pr-str {:local-tx local-tx :remote-tx remote-tx})]
```

Test consumer at `clj-e2e/src/logseq/e2e/rtc.clj:9-12`:

```clojure
(defn get-rtc-tx
  []
  (let [loc (w/get-by-test-id "rtc-tx")]
    (edn/read-string (w/text-content loc))))
```

The cross-peer convergence macro at `clj-e2e/src/logseq/e2e/rtc.clj:14-37`:

```clojure
(defmacro with-wait-tx-updated
  "exec body, then wait for the rtc-tx update."
  [& body]
  `(let [m# (get-rtc-tx)
         local-tx# (or (:local-tx m#) 0)
         remote-tx# (or (:remote-tx m#) 0)
         tx# (max local-tx# remote-tx#)]
     ~@body
     (loop [i# 15]
       (when (zero? i#) (throw (ex-info "wait-tx-updated failed" ...)))
       (util/wait-timeout 500)
       (w/wait-for "button.cloud.on.idle" {:timeout 35000})
       (util/wait-timeout 1000)
       (let [new-m# (get-rtc-tx)
             new-local-tx# (or (:local-tx new-m#) 0)
             new-remote-tx# (or (:remote-tx new-m#) 0)]
         (if (and (= new-local-tx# new-remote-tx#)
                  (> new-local-tx# tx#))
           {:local-tx new-local-tx# :remote-tx new-remote-tx#}
           (recur (dec i#)))))))
```

**Properties:**
- Not DEV-gated — ships in production DOM. Tradeoff: ~30 bytes of hidden DOM for all users.
- Carries structured counters, not a boolean — enables "mutation converged" (counters equal and increased) vs. just "some sync happened."
- Framework-agnostic: any test runner reading `textContent` via `getByTestId` works.
- Decoupled from provider identity — doesn't require exposing the Y.Doc or provider object.

---

### Finding: Hocuspocus exposes `synced` as three equivalent consumption paths

**Confidence:** CONFIRMED
**Evidence:** `packages/provider/src/HocuspocusProvider.ts`:

```ts
// Line 104 — configuration interface declares onSynced callback
onSynced: (data: onSyncedParameters) => void;

// Line 145 — public property default
isSynced = false;

// Line 194 — event listener binds config.onSynced to 'synced' event
this.on("synced", this.configuration.onSynced);
```

The property is set at `packages/provider/src/MessageReceiver.ts:88-90`:

```ts
if (emitSynced && syncMessageType === messageYjsSyncStep2) {
  provider.synced = true;
}
```

Consumption patterns from `tests/provider/onSynced.ts:9-13, 22-27`:

```ts
// Pattern A — via constructor callback
newHocuspocusProvider(t, server, {
  onSynced() {
    t.pass()
    resolve('done')
  },
})

// Pattern B — via event listener
const provider = newHocuspocusProvider(t, server)
provider.on('synced', () => {
  t.pass()
  resolve('done')
})
```

**Semantic guarantee:** `synced=true` flips exactly when SyncStep2 is received (the client has the server's current state). Does NOT guarantee the ProseMirror schema has been applied downstream.

---

### Finding: Hocuspocus `hasUnsyncedChanges` + `unsyncedChanges` event pair covers post-mutation quiescence

**Confidence:** CONFIRMED
**Evidence:** `tests/provider/hasUnsyncedChanges.ts:25-39, 72-86`:

```ts
// Event-then-poll variant
const provider = newHocuspocusProvider(t, server, {
  awareness: undefined,
})
provider.document.getMap('test').set('foo', 'bar')
t.is(provider.hasUnsyncedChanges, true)
await retryableAssertion(t, tt => {
  tt.is(provider.hasUnsyncedChanges, false)
})
```

```ts
// Listen for flip, then poll for idle
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

**Key distinction from `synced`:** `hasUnsyncedChanges` tracks the ongoing edit lifecycle, not just initial load. For per-mutation settling, this is the correct primitive.

Hocuspocus test primitive at `tests/utils/retryableAssertion.ts:5-18`:

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

Structurally equivalent to Playwright's `expect.poll()` with 100ms polling.

---

### Finding: Outline distinguishes two sync axes at the application layer

**Confidence:** CONFIRMED
**Evidence:** `app/scenes/Document/components/MultiplayerEditor.tsx:64-65, 159-167, 256-260`:

```ts
const [isLocalSynced, setLocalSynced] = useState(false);
const [isRemoteSynced, setRemoteSynced] = useState(false);

localProvider.on("synced", () =>
  setLocalSynced(!!ydoc.get("default")._start)
);
provider.on("synced", () => {
  presence.touch(documentId, currentUser.id, false);
  setRemoteSynced(true);
  retryCount.current = 0;
});

useEffect(() => {
  if (isLocalSynced && isRemoteSynced) {
    void onSynced?.();
  }
}, [onSynced, isLocalSynced, isRemoteSynced]);
```

**Two sync axes:** (1) IndexeddbPersistence replayed local cached state, (2) HocuspocusProvider received server state. Outline does not ship E2E tests, but the pattern is reusable — a `window.__editorReady = true` set in the `useEffect` would expose it to Playwright.

---

### Finding: Tiptap Collaboration extension exposes `onFirstRender` — distinct from `provider.synced`

**Confidence:** CONFIRMED
**Evidence:** `packages/extension-collaboration/src/collaboration.ts:71, 216`:

```ts
/**
 * Fired when the content from Yjs is initially rendered to Tiptap.
 */
onFirstRender?: () => void

// ...later wired into ySyncPlugin...
const ySyncPluginOptions: YSyncOpts = {
  ...this.options.ySyncOptions,
  onFirstRender: this.options.onFirstRender,
}
```

**Semantic distinction:**
- `provider.synced`: client has the server's CRDT state (may precede render).
- `onFirstRender`: y-prosemirror has finished materializing CRDT → PM.

For "ready for keystroke input" on Tiptap, `onFirstRender` is the tighter bound. Neither is exposed to tests by default; each requires the app to surface it via a window global or DOM attribute.

---

### Finding: y-prosemirror documents a mandatory post-dispatch macrotask wait

**Confidence:** CONFIRMED
**Evidence:** `tests/suggestions.test.js:57-66`:

```js
/**
 * Dispatch a transaction to a ProseMirror view and wait a tick so that any
 * deferred sync-plugin follow-up work (e.g. adjustments scheduled via
 * `setTimeout(..., 0)`) has a chance to run before the test proceeds.
 */
const safeDispatch = async (view, tr) => {
  view.dispatch(tr)
  await promise.wait(1)
}
```

**Implication:** At least one macrotask tick must elapse after any ProseMirror transaction before y-prosemirror's CRDT state reflects the change. This is documented only in the test file — not in y-prosemirror's README or sync-plugin source.

---

### Finding: tldraw exposes `window.editor` for tests but does not address per-edit quiescence

**Confidence:** CONFIRMED
**Evidence:** `apps/examples/e2e/shared-e2e.ts:44-52, 59-70`:

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

export async function hardResetEditor(page: Page) {
  await page.evaluate(() => {
    editor.selectAll().deleteShapes(editor.getSelectedShapeIds())
    editor.setCurrentTool('select')
    editor.zoomToFit()
    editor.resetZoom()
  })
}
```

**Quiescence is still unsolved** — `apps/examples/e2e/tests/test-rich-text-toolbar.spec.ts:395-396, 499-500`:

```ts
// historically this has been flaky without the sleep
await sleep(2000)
```

(Identical comment at two separate locations in the same file.) This admits the failure mode without identifying the root cause.

---

### Finding: BlockNote still uses discouraged `waitUntil: 'networkidle'` in places

**Confidence:** CONFIRMED
**Evidence:** `tests/src/end-to-end/colors/colors.test.ts:16`:

```ts
await page.goto(BASE_URL, { waitUntil: "networkidle" });
```

BlockNote's editor-ready helper at `tests/src/utils/editor.ts:4-6`:

```ts
export async function focusOnEditor(page: Page) {
  await page.waitForSelector(EDITOR_SELECTOR);
  await page.click(EDITOR_SELECTOR);
}
```

DOM-element existence only. No provider-sync check exists in BlockNote's E2E infrastructure.

---

### Finding: HedgeDoc bypasses keystroke simulation entirely

**Confidence:** CONFIRMED
**Evidence:** `frontend/cypress/e2e/documentTitle.spec.ts:8-11`:

```ts
cy.visitTestNote()
cy.setCodemirrorContent('# Title')
cy.title().should('eq', 'Title')
```

HedgeDoc's custom `cy.setCodemirrorContent` command writes directly to CodeMirror's state via the editor's public API — no typing simulation, no input events, no composition. This sidesteps the post-typing quiescence problem by skipping the keystroke pipeline entirely. Tradeoff: doesn't test the keystroke → input-rule → CRDT pipeline end-to-end.

---

### Finding: AFFiNE centralizes editor-ready waiting in a named fixture

**Confidence:** CONFIRMED (via GitHub repo read)
**Evidence:** `tests/affine-local/e2e/open-affine.spec.ts:12-15`:

```ts
await waitForEditorLoad(page)
await page.getByTestId('workspace-name').click()
await expect(localDemoTipsItem).toBeVisible()
```

The internal implementation of `waitForEditorLoad` (in `tests/kit/src/`) was not captured in this pass — DOM-only vs provider-aware vs composite remains unknown. The pattern itself is worth noting: centralizing editor-ready semantics in a single named helper.

---

## Negative searches

- `window.__provider`, `window.__hocuspocus`, `window.__yDoc` across all surveyed test files: **NOT FOUND**. No project uses this naming convention for production-exposed test hooks.
- `data-synced` / `data-provider-ready` / `data-doc-ready` DOM-attribute conventions: **NOT FOUND**. Logseq's `data-testid="rtc-tx"` is structurally different (carries state via text content, not a boolean flag).
- DEV-gated exposure (`if (process.env.NODE_ENV === 'development') window.X = ...`) in any surveyed test file: **NOT FOUND**.
- Written contributor guidance about preferred wait patterns for CRDT tests in any CONTRIBUTING / README: **NOT FOUND**.

---

## Gaps / follow-ups

- AFFiNE's `waitForEditorLoad` internal implementation.
- y-octo (AFFiNE's Rust Yjs port) JS-side sync exposure.
- Semantic model of Logseq's `local-tx` / `remote-tx` counters inferable from context but not traced to the RTC worker source.
