---
dimension: D2 — Provider sync signal exposure
date: 2026-04-16
sources: hocuspocus, outline, logseq, tiptap, tldraw, blocknote, y-prosemirror
---

# Evidence: D2 — How provider `synced` is exposed to tests

**Primary question:** How do CRDT editor projects expose "provider connected AND synced" to their E2E test code? Window globals? DOM attributes? Custom events? DEV-gated?

---

## Key files / pages referenced

- `hocuspocus/packages/provider/src/HocuspocusProvider.ts` — source of the `synced` event
- `hocuspocus/packages/provider/src/MessageReceiver.ts` — where `synced = true` is set
- `outline/app/scenes/Document/components/MultiplayerEditor.tsx` — application-layer sync tracking
- `logseq/src/main/frontend/components/rtc/indicator.cljs` — **production DOM element with test-id carrying CRDT tx counters**
- `tiptap/packages/extension-collaboration/src/collaboration.ts` — `onFirstRender` hook

---

## Findings

### Finding: Hocuspocus exposes `synced` as both a property AND an event
**Confidence:** CONFIRMED
**Evidence:** `hocuspocus/packages/provider/src/HocuspocusProvider.ts:104`, `:145`, `:194`

```ts
// Line 104 — configuration interface declares onSynced callback
onSynced: (data: onSyncedParameters) => void;

// Line 145 — public property default
isSynced = false;

// Line 194 — event listener binds config.onSynced to 'synced' event
this.on("synced", this.configuration.onSynced);
```

The property is set by `hocuspocus/packages/provider/src/MessageReceiver.ts:88-90`:

```ts
if (emitSynced && syncMessageType === messageYjsSyncStep2) {
  provider.synced = true;
}
```

**Implications:** HocuspocusProvider offers three equivalent consumption paths:
1. `provider.on('synced', handler)` — event-based (idiomatic for tests)
2. `provider.synced === true` — polling-friendly property
3. `new HocuspocusProvider({ onSynced() { ... } })` — constructor callback

The `synced = true` flip happens exactly when SyncStep2 is received — i.e., after the client has both sent its state vector and received the server's diff. This is a **semantic guarantee**: `synced=true` means the client has the server's current state.

---

### Finding: Tests can wait on `provider.on('synced', ...)` directly
**Confidence:** CONFIRMED
**Evidence:** `hocuspocus/tests/provider/onSynced.ts:9-13`, `:22-27`

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

**Implications:** Hocuspocus's own tests demonstrate the canonical pattern. For Playwright E2E tests that need to wait on provider sync from the browser side, the equivalent is `page.waitForFunction(() => window.__provider?.synced === true)` — but that requires the app to expose the provider on window.

---

### Finding: Outline's app-layer pattern — two-state sync (local + remote)
**Confidence:** CONFIRMED
**Evidence:** `outline/app/scenes/Document/components/MultiplayerEditor.tsx:64-65`, `:159-167`, `:256-260`

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

**Implications:** Outline distinguishes **two sync axes**: (1) IndexeddbPersistence has replayed local cached state, (2) HocuspocusProvider has received server state. Tests that want "editor is ready" need both. Outline does not ship E2E tests against this, but the pattern is reusable: a test-side `waitForFunction(() => window.__editorReady === true)` where `window.__editorReady` is set in the `useEffect` above would close the loop. Outline itself uses this only to drive application UX (hiding loaders).

---

### Finding: Logseq ships a hidden production DOM element carrying CRDT tx counters
**Confidence:** CONFIRMED
**Evidence:** `logseq/src/main/frontend/components/rtc/indicator.cljs:176`

```clojure
[:div.hidden {"data-testid" "rtc-tx"} (pr-str {:local-tx local-tx :remote-tx remote-tx})]
```

And from `logseq/clj-e2e/src/logseq/e2e/rtc.clj:9-12`:

```clojure
(defn get-rtc-tx
  []
  (let [loc (w/get-by-test-id "rtc-tx")]
    (edn/read-string (w/text-content loc))))
```

**Implications:** This is the most sophisticated pattern surfaced in the survey. Logseq ships a `display: none` (or `visibility: hidden`) div in **production code** (not DEV-gated) with `data-testid="rtc-tx"` whose text content is `{:local-tx N :remote-tx M}`. Tests read its text via `textContent` and parse it to get CRDT transaction counters. The same pattern lets tests verify:
1. Both counters equal → fully caught up
2. `local-tx` increased after a user edit → local transaction applied
3. `remote-tx` increased after remote peer edit → remote peer state received

This is strictly more information than a boolean `synced` flag — tests can verify precise convergence rather than just "some sync happened." Because it's in production DOM, there is no DEV-gate to worry about; the tradeoff is that a stray debug div ships to all users (hidden, ~30 bytes of DOM).

---

### Finding: Tiptap Collaboration exposes `onFirstRender` at the extension layer
**Confidence:** CONFIRMED
**Evidence:** `tiptap/packages/extension-collaboration/src/collaboration.ts:71`, `:216`

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

**Implications:** `onFirstRender` is a DIFFERENT signal from `provider.synced`. It fires when y-prosemirror finishes its initial CRDT-to-ProseMirror materialization — which may be after `provider.synced` if there's post-sync XmlFragment hydration work. For a "ready for keystroke input" signal, `onFirstRender` is a tighter bound than `provider.synced` — the former guarantees the PM schema has been applied, the latter only guarantees CRDT state exists. Neither is exposed to tests by default; an app would need to surface this via a window global or DOM attribute.

---

### Finding: y-prosemirror itself does not expose provider sync — it's not provider-aware
**Confidence:** CONFIRMED
**Evidence:** `y-prosemirror/tests/y-prosemirror.test.js:43-53`

```js
const setupTwoWaySync = (doc1, doc2) => {
  Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))
  Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2))
  doc1.on('update', (update) => {
    Y.applyUpdate(doc2, update)
  })
  doc2.on('update', (update) => {
    Y.applyUpdate(doc1, update)
  })
}
```

**Implications:** y-prosemirror works at the Y.Doc layer only; provider-level sync is an orthogonal concern. Tests that want "sync" on y-prosemirror use direct `Y.applyUpdate` with `Y.encodeStateAsUpdate` — an in-memory bridge without network. This is relevant to E2E test design because **the CRDT ready signal and the network ready signal are separate** and conflating them leads to incorrect waits.

---

### Finding: tldraw and BlockNote do NOT expose CRDT provider sync to tests
**Confidence:** CONFIRMED (negative)
**Evidence:** Searched `tldraw` and `blocknote` for `provider.on('synced`, `window.__provider`, `data-synced`, `hasSynced`, `isSynced` — NOT FOUND in test files.

tldraw uses a different sync stack (`@tldraw/sync-core` / `TLSyncRoom`) and exposes editor state via the `editor` global (D1). Its collaboration tests rely on the editor's public API, not the sync layer directly.

BlockNote's collaborative features exist (via `@blocknote/core` collaboration extension) but are not exercised in E2E tests — the test suite focuses on single-client block manipulation.

**Implications:** Two of the most popular Yjs-backed editors (by npm downloads) simply don't test collaborative scenarios at the E2E layer. This is a gap in the survey — not a recommendation. It does suggest that "wait for provider.synced" is not a solved-and-universal pattern; many projects avoid the problem by testing collaboration at lower layers (unit tests on CRDT state directly).

---

## Negative searches

- `window.__yDoc`, `window.__hocuspocus`, `window.__provider` across all repos: **NOT FOUND** in any test file. No surveyed project uses this naming convention for production-exposed test hooks.
- `DEV-gated` exposure (`if (process.env.NODE_ENV === 'development') window.X = ...`) in tiptap, blocknote, outline: **NOT FOUND** in tests or app code.
- DOM attribute `data-synced` / `data-provider-ready` / `data-doc-ready` across all repos: **NOT FOUND** except Logseq's `data-testid="rtc-tx"` (different semantics — see above).

---

## Gaps / follow-ups

- AFFiNE's internal provider sync signal not captured directly. The project uses `y-octo` (a Rust Yjs port); how y-octo exposes sync state to JS and whether AFFiNE's tests consume it is an open question.
- No surveyed project exposed a **composite** "all observer bridges quiesced" signal equivalent to what a dual-CRDT editor (XmlFragment ↔ Y.Text) would need. This is an unaddressed surface.
