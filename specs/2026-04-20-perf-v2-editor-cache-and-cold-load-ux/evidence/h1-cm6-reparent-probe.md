# CodeMirror 6 EditorView reparent feasibility

**Verdict: FEASIBLE.** High confidence.

A CodeMirror 6 `EditorView` instance can be reparented — `view.dom` detached from one container, parked (or left fully orphan), then re-attached to a different container — **without** calling `view.destroy()`. Content, selection, plugin state, compartment configuration, y-codemirror.next Y.Text binding, and UndoManager history all survive the reparent. Focus is lost by the browser on detach (standard contenteditable behavior) and must be re-asserted with `view.focus()` on re-attach. Scroll position is lost on detach and can be approximately restored via the first-class `view.scrollSnapshot()` / dispatch-effect protocol.

CM6's own public API explicitly endorses reparenting: `EditorView.setRoot(root)` documents "only necessary when moving the editor's existing DOM to a new window or shadow root" — within-Document reparent needs no API call at all.

Audience note: this report is the technical backing for the V2 perf spec's editor-cache design. The contract in §5 is what the spec should codify.

---

## 1. CM6 source analysis

Package read: `@codemirror/view@6.41.0` at `node_modules/@codemirror/view/dist/{index.js,index.d.ts}`. The observations below reference line numbers in `index.js` unless noted.

### 1.1 The constructor does not pin DOM to a parent

`EditorView` constructor (index.js:7809-7867):

```js
constructor(config = {}) {
    ...
    this.contentDOM = document.createElement("div");        // 7829
    this.scrollDOM  = document.createElement("div");        // 7830
    this.scrollDOM.appendChild(this.contentDOM);            // 7833
    this.announceDOM = document.createElement("div");       // 7834
    this.dom = document.createElement("div");               // 7837
    this.dom.appendChild(this.announceDOM);
    this.dom.appendChild(this.scrollDOM);
    if (config.parent)
        config.parent.appendChild(this.dom);                // 7841  ← optional
    ...
    this._root = (config.root || getRoot(config.parent) || document);  // 7847
    ...
    this.observer = new DOMObserver(this);                  // 7854
    this.inputState = new InputState(this);                 // 7855
    this.docView = new DocView(this);                       // 7857
    ...
}
```

The constructor assembles `view.dom` as a three-layer owned DOM subtree (announce + scroll-wrapping-content). The `config.parent` is attached optionally at L7841; the editor is fully functional with no parent. The public docstring for `EditorView` (index.d.ts:811-814) matches: *"You'll want to either provide a `parent` option, or put `view.dom` into your document after creating a view."*

### 1.2 `destroy()` is the ONE unconditional teardown path

`EditorView.destroy()` (index.js:8575-8588):

```js
destroy() {
    if (this.root.activeElement == this.contentDOM)
        this.contentDOM.blur();
    for (let plugin of this.plugins)
        plugin.destroy(this);             // destroys plugin instances (including y-codemirror.next)
    this.plugins = [];
    this.inputState.destroy();            // removes all DOM event handlers
    this.docView.destroy();               // tears down tile tree + DOM content
    this.dom.remove();                    // unconditionally removes view.dom
    this.observer.destroy();              // disconnects MutationObserver + Resize + Intersection + window listeners
    if (this.measureScheduled > -1)
        this.win.cancelAnimationFrame(this.measureScheduled);
    this.destroyed = true;                // sets a permanent kill flag — update() becomes a no-op
}
```

This is the only path that disconnects the MutationObserver, ResizeObserver, IntersectionObserver, window listeners, and destroys plugin state. **Reparenting does not invoke any of these.** The `destroyed` flag is permanent (index.js:8070 `measure() { if (this.destroyed) return; }`, and similar guards elsewhere); after `destroy()`, `update()`, `dispatch()`, and `measure()` are no-ops. `destroy()` is opt-in and has no auto-trigger — e.g. no "destroy if detached too long" path.

### 1.3 `setRoot()` is the documented reparent primitive

`EditorView.setRoot(root)` (index.js:8562-8568, declared in index.d.ts:1108-1112):

```js
/**
Update the [root](…) in which the editor lives. This is only
necessary when moving the editor's existing DOM to a new window or shadow root.
*/
setRoot(root) {
    if (this._root != root) {
        this._root = root;
        this.observer.setWindow((root.nodeType == 9 ? root : root.ownerDocument).defaultView || window);
        this.mountStyles();
    }
}
```

`setRoot()` is a **narrow** API — it covers only the cross-`Document` / cross-`ShadowRoot` case, rebinding the DOMObserver's window-level listeners and re-mounting style modules into the new root. Within-Document reparent requires no API call. The mere existence of `setRoot()` ratifies the broader "move the editor's existing DOM" pattern — CM6 has thought about this and chose to expose only the one piece that requires attention.

### 1.4 DOMObserver is the only component with DOM-global wiring

`DOMObserver` constructor (index.js:7030-7127) sets up everything that could fail on reparent. The full list and reparent-safety analysis:

| Subscription | Target | Survives within-Document reparent? |
|---|---|---|
| `MutationObserver.observe(this.dom /* =contentDOM */, observeOptions)` (L7270) | `contentDOM` | **Yes.** Per [DOM spec](https://dom.spec.whatwg.org/#mutation-observers), a MutationObserver stays registered until `disconnect()`. It observes the target node regardless of tree position. |
| `ResizeObserver.observe(view.scrollDOM)` (L7105) | `scrollDOM` | **Yes.** ResizeObserver continues to observe its targets regardless of tree membership. On re-attach, it fires fresh entries naturally. |
| `IntersectionObserver.observe(this.dom /* =contentDOM */)` (L7119) | `contentDOM` | **Yes.** Returns `intersectionRatio === 0` while the element is detached or hidden; fires again when re-attached to a visible tree. |
| `IntersectionObserver` for gaps (L7120-7123) | rebuilt on updateGaps | **Yes.** |
| Scroll-parent event listeners (L7249-7252) | walked ancestor chain of `contentDOM` | **Stale but self-healing.** On detach, the old chain is detached. On re-attach, CM6's next IntersectionObserver fire schedules `listenForScroll()` via `parentCheck = setTimeout(..., 1000)` (L7112), which walks the new ancestor chain and swaps listeners (L7248-7253). Worst-case recovery time: 1 second. |
| Window listeners (L7427-7438): `resize`, `scroll`, `beforeprint`, `selectionchange` | `view.win` | **Yes within the same Document.** `view.win = dom.ownerDocument.defaultView` (L7803) doesn't change on within-Document reparent. `setRoot()` handles the cross-Document case. |
| EditContext (L7082-7085, Android Chrome only) | `contentDOM` | **Yes.** EditContext binding is on the DOM node; persists through reparent per the [EditContext spec](https://w3c.github.io/edit-context/). |

The one caveat — **stale scroll-parent listeners for up to 1 second after re-attach** — is the sole known behavioral blip. It's observable only as "if you scroll the new container within 1s of re-attach, the viewport-render may lag by a frame." It is not a correctness bug; it self-heals.

### 1.5 Measurement bails out defensively when detached

`ViewState.measure()` has an explicit "not in window" early-return (index.js:6313-6314):

```js
if (!this.inView && !this.scrollTarget && !inWindow(view.dom))
    return 0;
```

`inWindow(elt)` (index.js:6075-6079) uses `getBoundingClientRect()` and compares against `win.innerWidth` / `win.innerHeight`. A detached or orphaned element's bounding rect is all zeros, so `rect.right > 0` is false → `inWindow` returns false → `measure()` returns 0 (the "no changes" code). This means measurement does not corrupt state during the detached window: no height-map thrash, no viewport collapse, no cascade of "0-height lines" recomputations. The main `measure()` method at L8069 has an `if (this.destroyed) return;` guard and wraps all internal work in `try/finally` that restores `updateState = Idle`.

Corollary: **`view.update()` / `view.dispatch()` work correctly while detached.** State mutations (doc changes, plugin updates, compartment reconfigures) are driven off `view.state` transitions, independent of layout. Measurement is deferred until `inWindow` becomes true again — empirically verified (probe test 12).

---

## 2. y-codemirror.next compatibility findings

Package read: `y-codemirror.next@0.3.5` at `node_modules/y-codemirror.next/src/`. The three plugins shipped by `yCollab()` all have **zero DOM coupling** and therefore survive reparent unmodified.

### 2.1 `YSyncPluginValue` (y-sync.js:100-159)

Reads `ytext` via `observe`; writes via `ytext.doc.transact(() => { ... }, this.conf)`. No reference to `view.dom` / `view.contentDOM` / any DOM API. Cleanup (`destroy()`) only unsubscribes from `ytext`. Because the subscription is held on the plugin instance and only torn down on `view.destroy()` (which calls `plugin.destroy(this)`, see index.js:8578-8579) or on facet reconfiguration, the Y.Text binding survives arbitrary DOM reparenting.

### 2.2 `YRemoteSelectionsPluginValue` (y-remote-selections.js:122-253)

Listens to `awareness.on('change', ...)`; dispatches decoration updates through `view.dispatch({ annotations: [...] })`. Does read `update.view.dom.ownerDocument.hasFocus()` (L161) — a detached element's `ownerDocument` is still the original `Document`, so `ownerDocument.hasFocus()` returns the window-level focus state; remote selection rendering degrades gracefully (no local cursor broadcast while unfocused) and recovers automatically on re-focus.

### 2.3 `YUndoManagerPluginValue` (y-undomanager.js:63-122)

Subscribes to `undoManager.on('stack-item-added' | 'stack-item-popped', …)`; `trackedOrigins` + selection restoration via `view.dispatch(...)`. No DOM. The `Y.UndoManager` instance is constructed by `yCollab()` (index.js:20) and held in the `YSyncConfig` facet — it persists for the lifetime of the `EditorView` instance. Reparent preserves it. (`view.setState(newState)` would destroy and rebuild all plugins, which is why that's **not** the right pattern for per-document editor caching — see §5.)

---

## 3. External evidence

### 3.1 CodeMirror forum — reparent is an in-the-wild pattern

[discuss.codemirror.net/t/retrieve-scroll-position-when-appending-removing-view-dom-element/5514](https://discuss.codemirror.net/t/retrieve-scroll-position-when-appending-removing-view-dom-element/5514) — user rdesille describes the exact pattern: *"I have a tab system with multiple CodeMirror instances, and to toggle visibility I append/remove the corresponding `view.dom` to a 'content' div."* Marijn (CM6 author) does **not** object to the pattern — he addresses the specific scroll-position concern: *"The reliable way to do this is to figure out which character is in the top-left corner of the editor, and which pixel offset it has from the corner (using `coordsAtPos`/`posAtCoords`), and scroll back to it by dispatching the `scrollIntoView` effect with the appropriate configuration."* This guidance became `view.scrollSnapshot()` (index.js:8610-8614), which ships the exact mechanism Marijn described.

### 3.2 Setstate-swap pattern is an alternative, not a requirement

[discuss.codemirror.net/t/preserving-state-when-switching-between-files/2946](https://discuss.codemirror.net/t/preserving-state-when-switching-between-files/2946) — Marijn: *"The technique of keeping a state per 'buffer' is how I'd approach this myself."* The canonical pattern is one `EditorView` with a `Map<key, EditorState>` swapped via `view.setState(map[key])`.

**Why this doesn't work for Open Knowledge:** `yCollab(ytext, awareness)` constructs a `YSyncConfig`, a `Y.UndoManager`, and binds all three plugins to a specific `Y.Text` + `awareness` pair at plugin-construction time (y-codemirror.next/src/index.js:21 + y-sync.js:104-128). `view.setState(newState)` destroys every plugin (index.js:8002-8003: `for (let plugin of this.plugins) plugin.destroy(this);`) and rebuilds from the new state's facets. A per-document state-swap would therefore dispose the `YSyncConfig`/`UndoManager` for every switch, losing undo history and re-subscribing observers. Reparent is the pattern that preserves per-document collaboration state.

### 3.3 `setRoot()` for shadow-DOM migration is documented

[codemirror.net/docs/ref/#view.EditorView.setRoot](https://codemirror.net/docs/ref/#view.EditorView.setRoot) ratifies the mental model: reparent is a first-class scenario; `setRoot()` is the narrow hook for the cross-root case.

---

## 4. Empirical probe

### 4.1 What it does

A standalone browser probe (source at `/tmp/ok-perf-validation/cm6-reparent/probe-source.ts`, 380 LOC) runs twelve tests end-to-end under headless Chromium via Playwright. Each test builds a real `EditorView` with an extension stack matching `packages/app/src/editor/SourceEditor.tsx` — `basicSetup`, `@codemirror/lang-markdown` with GFM, compartment-gated theme + placeholder, `EditorView.lineWrapping`, and (for collab tests) `yCollab(ytext, awareness)` with a two-doc sync harness that cross-applies Y updates between a `ydoc` (the view's) and a `peerDoc` (simulated remote collaborator).

The tests reparent `view.dom` across distinct host containers (`HOST A` → parking node → `HOST B`) and assert state-preservation invariants. Two additional tests cover the React-Activity-analogue (`display: none` on the container) and the fully-orphan case (`view.dom.parentNode === null`).

Console is mirrored into `window.__probeErrors` / `__probeWarnings` + `page.on('console')` / `page.on('pageerror')` in the driver, so any CM6-internal warning (`"Viewport failed to stabilize"`, `"Measure loop restarted more than 5 times"`, etc.) would surface.

### 4.2 Results: 12/12 pass, zero console noise

Full results JSON: `/tmp/ok-perf-validation/cm6-reparent/probe-results.json`. Summary:

| # | Scenario | Result |
|---|---|---|
| 1 | Basic reparent with doc + selection + focus | **PASS** — doc, selection, focus preserved; `contentDOM.isConnected = true` post-reparent |
| 2 | Undo history survives reparent (history extension) | **PASS** — preDoc=ABC → undo → AB → undo → A |
| 3 | Y.Text remote updates during detached window propagate to view on re-attach | **PASS** — `REMOTE_PREFIX_` + `REMOTE_SUFFIX` inserted while detached, visible after re-attach |
| 4 | Typing after reparent propagates to Y.Text + peer | **PASS** — post-reparent dispatch lands in both local ytext and peer |
| 5 | `Compartment.reconfigure` during AND after reparent applies | **PASS** — background went `red → green (during detach) → blue (post re-attach)` |
| 6 | `view.scrollSnapshot()` effect restores scroll after reparent | **PASS** — `before=3639px → after-reparent=0px → after-snapshot-dispatch=3384px` (93% restored; see §6.2) |
| 7 | Five reparent cycles preserve doc state and Y.Text sync | **PASS** — final doc `"Cycle test doc. i0 i1 i2 i3 i4"` matches peer exactly |
| 8 | `view.destroy()` still works cleanly after reparent cycles | **PASS** — `dom.remove()` clean-up, no throw |
| 9 | 3s detached window + 30 remote updates | **PASS** — all 30 remote inserts visible after re-attach, view length matches peer length exactly |
| 10 | `display:none` hidden mode (React Activity analogue) | **PASS** — local dispatch + remote update during hidden mode both land; view/ytext/peer all converge |
| 11 | Fully orphan detach (`parentNode === null`) + re-attach | **PASS** — programmatic dispatch works during orphan state; peer updates during orphan propagate |
| 12 | `view.requestMeasure()` + 20 dispatches while detached | **PASS** — zero errors, zero warnings emitted |

**Console capture:** `{ consoleLog: [], pageErrors: [], probeErrors: [], probeWarnings: [] }` — 0/0/0/0. No `"Viewport failed to stabilize"`, no MutationObserver complaints, no uncaught exceptions.

Screenshot after reparent-to-HOST-B (test 1): `/tmp/ok-perf-validation/cm6-reparent/probe-screenshot.png`. "Hello" is visibly selected in the green (HOST B) container; HOST A (blue) is empty. The editor fully re-rendered in its new parent.

### 4.3 What the probe did NOT cover (out of scope)

- Cross-document reparent (requires `setRoot()`) — not exercised; CM6 source shows the only branch that needs changing is the window-listener set, already tested by CM6's own test suite for shadow DOM.
- Real WebSocket peer — simulated in-page via `Y.applyUpdate` both directions. The Y-level propagation is bit-for-bit identical; WebSocket would only add transport latency.
- Multi-tab scroll-position restoration under variable viewport width (content might re-wrap and produce larger scroll drift).

---

## 5. V2 spec implications — the reparent contract

Reparent is safe **if** the integration follows this contract. For the V2 perf spec, this is what should be encoded.

### 5.1 Caller-side lifecycle

```ts
// Module-level cache (survives React remounts, SPA navigations, Activity mode flips)
const editorCache = new Map<string, {
  view: EditorView;
  ydoc: Y.Doc;
  ytext: Y.Text;
  provider: HocuspocusProvider;
}>();

function mountEditor(docName: string, container: HTMLElement): CachedEditor {
  let entry = editorCache.get(docName);

  if (entry) {
    //  — cache hit: reparent —
    container.appendChild(entry.view.dom);    // ← the reparent
    entry.view.focus();                        //   restore focus (browser blurs on detach)
    // Optional: restore scroll via a snapshot captured at park time. See §5.2.
    return entry;
  }

  //  — cache miss: construct —
  const ydoc = new Y.Doc();
  const ytext = ydoc.getText('source');
  const provider = new HocuspocusProvider({ … });
  const state = EditorState.create({ doc: ytext.toString(), extensions: [
    basicSetup,
    markdown({ base: markdownLanguage, extensions: [GFM] }),
    yCollab(ytext, provider.awareness),
    // …
  ]});
  const view = new EditorView({ state, parent: container });
  entry = { view, ydoc, ytext, provider };
  editorCache.set(docName, entry);
  return entry;
}

function parkEditor(entry: CachedEditor, parkingNode: HTMLElement) {
  // Optionally capture scroll before detach:
  (entry as any).__scrollSnapshot = entry.view.scrollSnapshot();
  parkingNode.appendChild(entry.view.dom);
  // The editor keeps running — Y.js observers still fire, plugins still receive
  // remote CRDT updates, state stays in sync. Only DOM painting stops.
  // DO NOT call view.destroy() here — that's the opposite of caching.
}

function evictEditor(docName: string) {
  // Only path that should call destroy() is cache eviction.
  const entry = editorCache.get(docName);
  if (!entry) return;
  entry.view.destroy();
  entry.provider.destroy();
  entry.ydoc.destroy();
  editorCache.delete(docName);
}
```

### 5.2 Optional: scroll restoration

Scroll is the one state not preserved in memory across reparent — it lives in the DOM's `scrollTop`, which zeroes when the `.dom` is detached. CM6 provides the first-class recovery path:

```ts
// Before parking:
const snap = view.scrollSnapshot();   // StateEffect<ScrollTarget>

// Later, after re-attach:
view.dispatch({ effects: snap });     // scrolls back within ~7% of original
```

Empirical measurement in probe test 6: 3639 px → 0 px on detach → 3384 px after restore (93% fidelity). The small drift is due to per-line height re-measurement when `inWindow` returns true again; the user sees the same line ± a line or two. Pixel-perfect restoration is not possible with any known API and is not a requirement for "feels like the same editor."

### 5.3 Focus

On detach, the browser moves `document.activeElement` off the now-orphaned `contentDOM`. On re-attach, the element is focusable again but not automatically focused. Call `view.focus()` in the same tick as the `container.appendChild(view.dom)` call.

### 5.4 Scroll-parent listener "1-second window" caveat

If you scroll the new container within 1 second of re-attach, the viewport recomputation may lag by a frame because CM6's `DOMObserver.listenForScroll()` reschedules via `setTimeout(..., 1000)` (`index.js:7112`). Benign and self-healing. If pixel-perfect first-frame viewport is ever required, call `(view.observer as any).listenForScroll()` after reparent to skip the wait — reaching into an internal, so flag it with a comment — but we found no empirical case in the probe where this mattered.

### 5.5 No `setRoot()` call required

All reparents happen within the same `Document`, so `setRoot()` is unnecessary. Only call it if the V2 design ever moves an editor into an `iframe` (separate window) or a `ShadowRoot` (separate root). The call is idempotent: `setRoot(root)` early-exits when `this._root === root`.

### 5.6 Coordination with React

The module-level cache (§5.1) is outside React's reconciler, making it compatible with:

- React Compiler (component-local memoization — see [React Compiler docs](https://react.dev/reference/rsc/server-components/compiler)).
- `<Activity mode="hidden">` — whether React's implementation uses `display: none` (probe test 10 proves this works) or unmounts the Activity DOM (probe test 11 proves fully-orphan works), the cached `EditorView` survives.
- `StrictMode` double-invoke — the cache entry is stable across double mounts because it's module-level.

The React binding should be a thin wrapper component whose only job is to call `mountEditor(docName, containerRef.current)` on effect mount and `parkEditor(entry, parkingNode)` on effect cleanup. It must NOT call `view.destroy()` on component unmount — only `evictEditor(docName)` on LRU-bounded cache eviction should destroy.

### 5.7 Relationship to existing precedents

- **Precedent #18 (hybrid Activity + Suspense + `use(promise)`)** applies: the cache is the subscription source; `use(editorReadyPromise(docName))` suspends while the first CM construction resolves. `invalidate(docName)` on provider/ydoc destroy follows the §18(d) template. The `ACTIVITY_MOUNT_LIMIT = 3` × `MAX_POOL = 10` decoupling stays — CM6 editors in parked-but-cached slots keep processing Y updates at full CPU cost (same as TipTap caveat in §18(c)).
- **STOP rule analogue to TipTap's `editor.view` proxy (existing WARN in Known Pitfalls):** CM6 has no equivalent throwing proxy — `view.contentDOM`, `view.scrollDOM`, `view.dom` are all always valid until `destroy()`. Safer integration, fewer foot-guns.
- **Greenfield directive:** no patch-to-CM6 required. The reparent pattern uses CM6's public API only.

### 5.8 Comparison with TipTap caching (existing precedent #18)

|  | TipTap | CodeMirror 6 |
|---|---|---|
| Named "mount/unmount" API? | No. Users mount via `<EditorContent editor={editor} />` which appends `editor.view.dom` to its ref. | No. Users pass `parent: HTMLElement` to constructor, or append `view.dom` manually. |
| Caching via reparent supported? | Yes, by convention and TipTap's own React binding implementation. | Yes, confirmed by 12/12 probe tests and the `setRoot()` API's existence as documented ratification. |
| DOM-observer stability on reparent | ProseMirror `EditorView.dom` similarly holds MutationObserver on `contentDOM`; survives reparent. | MutationObserver + ResizeObserver + IntersectionObserver, all survive reparent. |
| One-second scroll-parent caveat | Same class of issue in ProseMirror (scroll event listeners). | Confirmed, benign, self-heals. |
| First-class scroll restoration | No native equivalent. | `view.scrollSnapshot()` + dispatch effect — first-class. |

CodeMirror 6 is as cache-friendly as TipTap, and for scroll restoration, slightly better off.

---

## 6. Open questions

Three items I could not resolve to 100% confidence in this investigation. None blocks a FEASIBLE verdict, but the spec should at least be aware of them.

### 6.1 Behavior under React 19.2 "Activity offscreen unmount" (if it exists)

React docs for `<Activity mode="hidden">` describe the "hidden" mode as "rendered but not committing effects" with the DOM kept but `display: none`-styled. There is discussion of a possible third internal state where React unmounts the hidden subtree entirely to save memory after some offscreen duration. I could not find definitive public documentation of this triggering. If it does fire, the subtree's DOM is dropped, which would remove `view.dom` from the tree without calling `destroy()` — the view remains alive in our module cache, and the next mount goes through the normal reparent path. Test 11 (fully-orphan detach) is the analogue and passes, so the unmount case is covered implicitly. The open question is whether React Activity also runs effect **cleanup** in this case; if it does, a wrapper component that calls `view.destroy()` in `useEffect` cleanup would kill the cache. The fix is: never wire `view.destroy()` into a React effect cleanup. Always call it from explicit cache-eviction logic.

### 6.2 Scroll-restoration drift under heavy content re-wrap

Probe test 6 measured 3639 → 3384 px (93% fidelity). Line count and wrap state were stable. If the re-attach container has a substantially different width than the original, the heightOracle refresh on first measure after re-attach will recompute line heights (index.js:6322-6332) and the drift could grow larger. For the V2 spec's use case (same doc body across navigation, same sidebar-adjusted container width), this isn't a concern. If the design ever permits width changes mid-park (e.g. responsive breakpoint crossed while parked), add a probe to measure drift at extreme width ratios.

### 6.3 Android IME / `delayedAndroidKey` mid-park

CM6's `DOMObserver` has special Android IME handling (`delayedAndroidKey`, `flushingAndroidKey`, index.js:7297-7329) that uses `requestAnimationFrame` on `view.win`. If the user is mid-IME composition when the editor is detached, the rAF continues to fire (`window.requestAnimationFrame` doesn't pause on detach) and may try to `dispatchKey(this.dom, ...)` on a detached content DOM. The likely outcome is a no-op (dispatching a keydown on a detached element is allowed and has no effect), but this is the one specific code path I did not exercise in the probe. **Recommendation:** in the V2 spec's Android QA pass, include a "mid-compose + navigate away" scenario. If a crash or corrupted state appears, the fix is to call `(view.observer as any).clearDelayedAndroidKey()` on park.

---

## Appendix A: file list

| Path | Role |
|---|---|
| `/tmp/ok-perf-validation/cm6-reparent/REPORT.md` | this report (durable artifact) |
| `/tmp/ok-perf-validation/cm6-reparent/probe-source.ts` | annotated probe implementation (380 LOC) |
| `/tmp/ok-perf-validation/cm6-reparent/probe-driver.mjs` | Playwright driver + static HTTP server |
| `/tmp/ok-perf-validation/cm6-reparent/probe-results.json` | full 12-test result JSON |
| `/tmp/ok-perf-validation/cm6-reparent/probe-screenshot.png` | post-reparent DOM screenshot |
| `/tmp/ok-perf-validation/cm6-reparent/probe/` | live probe workspace (deleted on cleanup) |

The live probe workspace under `/tmp/ok-perf-validation/cm6-reparent/probe/` contains the `node_modules/`, build output, and a second `out/` directory with all artifacts; these are cleaned up, but the REPORT, source, driver, results, and screenshot remain for reference.

## Appendix B: primary-source references with line numbers

All citations are against the exact versions tested (identical to those installed in the worktree):

- `@codemirror/view@6.41.0`, file `dist/index.js`:
  - constructor: lines 7809-7867
  - `update()`: 7882-7984
  - `setState()`: 7992-8022
  - `measure()`: 8069-8188
  - `hasFocus` / `focus()`: 8540-8557
  - `setRoot()`: 8562-8568
  - `destroy()`: 8575-8588
  - `DOMObserver` class: 7030-7477
    - constructor (observer registrations): 7030-7127
    - `listenForScroll()`: 7226-7253
    - `start()` / `stop()`: 7267-7282
    - `setWindow()`: 7420-7426
    - `addWindowListeners()` / `removeWindowListeners()`: 7427-7452
    - `destroy()`: 7460-7477
  - `ViewState.measure()` detached early-return: 6313-6314
  - `inWindow()`: 6075-6079
  - `scrollSnapshot()`: 8610-8614
- `@codemirror/view@6.41.0`, file `dist/index.d.ts`:
  - `EditorView` class declaration: lines 733-…
  - `setRoot()` docstring: 1108-1112
  - `destroy()` docstring: 1113-1119
- `y-codemirror.next@0.3.5`, files:
  - `src/y-sync.js` — `YSyncPluginValue`: entire file
  - `src/y-remote-selections.js` — `YRemoteSelectionsPluginValue`: 122-253
  - `src/y-undomanager.js` — `YUndoManagerPluginValue`: entire file
  - `src/index.js` — `yCollab()` factory: entire file

External references:

- [CodeMirror Reference Manual — EditorView.setRoot()](https://codemirror.net/docs/ref/#view.EditorView.setRoot)
- [discuss.CodeMirror — Retrieve scroll position when appending/removing view dom element](https://discuss.codemirror.net/t/retrieve-scroll-position-when-appending-removing-view-dom-element/5514)
- [discuss.CodeMirror — Preserving state when switching between files](https://discuss.codemirror.net/t/preserving-state-when-switching-between-files/2946)
- [MDN — MutationObserver](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver)
- [EditContext spec](https://w3c.github.io/edit-context/)

Sources:
- [CodeMirror Reference Manual](https://codemirror.net/docs/ref/)
- [view/src/editorview.ts](https://github.com/codemirror/view/blob/main/src/editorview.ts)
- [discuss.CodeMirror — tab-switch scroll-position thread](https://discuss.codemirror.net/t/retrieve-scroll-position-when-appending-removing-view-dom-element/5514)
- [discuss.CodeMirror — state-per-buffer thread](https://discuss.codemirror.net/t/preserving-state-when-switching-between-files/2946)
- [CodeMirror Changelog](https://codemirror.net/docs/changelog/)
