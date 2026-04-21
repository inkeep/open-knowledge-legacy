---
title: "CM6 Reparent-Without-Destroy — Canonical Contract"
description: "The V2 spec's contract for CodeMirror 6 editor caching via DOM reparenting. Codifies the behavior H1 empirically validated (12/12 probe tests). Candidate for promotion to CLAUDE.md precedent #18(h) at V2 ship time."
createdAt: 2026-04-20
updatedAt: 2026-04-20
status: normative
source: evidence/h1-cm6-reparent-probe.md §5
applies_to: packages/app/src/editor/SourceEditor.tsx + any future nested-CM editor (CB-v2 §9.14 Precedent #24)
---

# CM6 Reparent-Without-Destroy — Canonical Contract

**Purpose.** Promote §5 of the H1 CM6 reparent probe to a standalone normative artifact so it survives summarization and is reusable for future CM-in-PM patterns (CB-v2 §9.14 Precedent #24 and any future nested-editor use). Candidate for promotion to CLAUDE.md precedent #18(h) at V2 ship time.

**Verdict context** (HIGH confidence from H1 probe 12/12 tests + Marijn Haverbeke endorsement at discuss.codemirror.net/t/retrieve-scroll-position-when-appending-removing-view-dom-element/5514):

A CodeMirror 6 `EditorView` instance CAN be reparented — `view.dom` detached from one container, parked (or left fully orphan), then re-attached to a different container — WITHOUT calling `view.destroy()`. Content, selection, plugin state, compartment configuration, y-codemirror.next Y.Text binding, and UndoManager history all survive the reparent. Focus is lost by the browser on detach (standard contenteditable behavior) and must be re-asserted with `view.focus()` on re-attach. Scroll position is lost on detach and can be approximately restored via the first-class `view.scrollSnapshot()` / dispatch-effect protocol.

CM6's own public API explicitly endorses reparenting: `EditorView.setRoot(root)` documents "only necessary when moving the editor's existing DOM to a new window or shadow root" — within-Document reparent needs no API call at all.

---

## 1. Caller-side lifecycle (normative)

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
    // Optional: restore scroll via a snapshot captured at park time. See §2.
    return entry;
  }

  //  — cache miss: construct —
  const ydoc = new Y.Doc();
  const ytext = ydoc.getText('source');
  const provider = new HocuspocusProvider({ /* ... */ });
  const state = EditorState.create({ doc: ytext.toString(), extensions: [
    basicSetup,
    markdown({ base: markdownLanguage, extensions: [GFM] }),
    yCollab(ytext, provider.awareness),
    // ...
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

## 2. Optional: scroll restoration

Scroll is the one state not preserved in memory across reparent — it lives in the DOM's `scrollTop`, which zeroes when the `.dom` is detached. CM6 provides the first-class recovery path:

```ts
// Before parking:
const snap = view.scrollSnapshot();   // StateEffect<ScrollTarget>

// Later, after re-attach:
view.dispatch({ effects: snap });     // scrolls back within ~7% of original
```

Empirical measurement in H1 probe test 6: 3639 px → 0 px on detach → 3384 px after restore (93% fidelity). The small drift is due to per-line height re-measurement when `inWindow` returns true again; the user sees the same line ± a line or two. Pixel-perfect restoration is not possible with any known API and is not a requirement for "feels like the same editor."

## 3. Focus

On detach, the browser moves `document.activeElement` off the now-orphaned `contentDOM`. On re-attach, the element is focusable again but not automatically focused. Call `view.focus()` in the same tick as the `container.appendChild(view.dom)` call.

## 4. Scroll-parent listener "1-second window" caveat

If you scroll the new container within 1 second of re-attach, the viewport recomputation may lag by a frame because CM6's `DOMObserver.listenForScroll()` reschedules via `setTimeout(..., 1000)` (index.js:7112). Benign and self-healing. If pixel-perfect first-frame viewport is ever required, call `(view.observer as any).listenForScroll()` after reparent to skip the wait — reaching into an internal, so flag it with a comment — but we found no empirical case in the probe where this mattered.

## 5. No `setRoot()` call required

All reparents happen within the same `Document`, so `setRoot()` is unnecessary. Only call it if the V2 design ever moves an editor into an `iframe` (separate window) or a `ShadowRoot` (separate root). The call is idempotent: `setRoot(root)` early-exits when `this._root === root`.

## 6. Coordination with React

The module-level cache (§1) is outside React's reconciler, making it compatible with:

- React Compiler (component-local memoization only)
- `<Activity mode="hidden">` — whether React's implementation uses `display: none` (H1 test 10 proves this works) or unmounts the Activity DOM (H1 test 11 proves fully-orphan works), the cached `EditorView` survives.
- `StrictMode` double-invoke — the cache entry is stable across double mounts because it's module-level.

The React binding should be a thin wrapper component whose only job is to call `mountEditor(docName, containerRef.current)` on effect mount and `parkEditor(entry, parkingNode)` on effect cleanup. It must NOT call `view.destroy()` on component unmount — only `evictEditor(docName)` on LRU-bounded cache eviction should destroy.

## 7. What survives reparent (empirically validated)

| Dimension | Survives? | Recovery path if no |
|---|---|---|
| Document content | YES | — |
| Selection | YES | — |
| Undo history | YES | — |
| Compartment (theme etc.) configuration | YES | — |
| y-codemirror.next Y.Text binding | YES | — |
| y-codemirror.next YRemoteSelectionsPluginValue | YES | — |
| Y.UndoManager history | YES | — |
| DOM focus | NO | Call `view.focus()` on re-attach |
| Scroll position | NO | `view.scrollSnapshot()` before park; dispatch effect after re-attach (~93% fidelity) |
| Scroll-parent listeners | Stale 1s | Self-healing via IntersectionObserver fire + `listenForScroll` re-walk |

## 8. DOM-global subscriptions (all survive)

Per H1 §1.4 source analysis:

- `MutationObserver.observe(contentDOM, observeOptions)` — survives reparent (per DOM spec)
- `ResizeObserver.observe(view.scrollDOM)` — survives reparent
- `IntersectionObserver.observe(contentDOM)` — returns 0 while detached, fires on re-attach
- Scroll-parent listeners — stale 1s, self-healing
- Window listeners (`resize`, `scroll`, `beforeprint`, `selectionchange`) — tied to `view.win`, unchanged for within-Document reparent
- EditContext (Android Chrome) — persists per EditContext spec

## 9. Why this works (architectural basis)

Per H1 §1.3 `EditorView.setRoot(root)` source read: CM6's ONLY Document-global assumption is captured via `setRoot()`, which rebinds DOMObserver's window-level listeners and re-mounts style modules. Within-Document, no API call is needed because the Document is the same. MutationObserver, ResizeObserver, IntersectionObserver all persist their subscriptions through DOM tree position changes per W3C specs.

y-codemirror.next (per H1 §2) has ZERO DOM coupling in its three plugins. Subscribes to `ytext.observe`; dispatches `view.dispatch({annotations})`. Neither path reads `view.dom` / `view.contentDOM` / any DOM API. Safe to reparent unconditionally.

## 10. Comparison with TipTap

Per H1 §5.8:

|  | TipTap | CodeMirror 6 |
|---|---|---|
| Named "mount/unmount" API? | `Editor.mount()` / `Editor.unmount()` (TipTap 3.22+) | No. Users pass `parent: HTMLElement` to constructor, or append `view.dom` manually. |
| Caching via reparent supported? | YES (per H1 analysis + TipTap source) | YES (H1 12/12 tests) |
| DOM-observer stability on reparent | ProseMirror `EditorView.dom` similarly holds MutationObserver on `contentDOM`; survives reparent | MutationObserver + ResizeObserver + IntersectionObserver, all survive reparent |
| First-class scroll restoration | No native equivalent | `view.scrollSnapshot()` + dispatch effect — first-class |
| Throwing proxy pitfall | Yes (`editor.view` is a throwing proxy before ProseMirror mount completes — per CLAUDE.md WARN rule) | No. `view.contentDOM`, `view.scrollDOM`, `view.dom` are always valid until `destroy()`. **Safer integration, fewer foot-guns.** |

## 11. Candidate precedent #18(g) text

Per Auditor audit §S10, existing CLAUDE.md precedent #18 has sub-rules (a)-(f). This is **#18(g)**, not #18(h). Rewritten to match existing #18 sub-rule format (concise, bold prefix, ~300 chars, pointer to full artifact).

Proposed addition to CLAUDE.md at V2 ship:

> **(g) — CodeMirror 6 caching via reparent-without-destroy.** Module-level `Map<docName, {view, ydoc, ytext, provider}>` with `parkEditor()` detaching `view.dom` to a parking node (NOT calling `view.destroy()`) and `mountEditor()` re-attaching + calling `view.focus()` + optional `scrollSnapshot()` dispatch. Only `evictEditor()` on LRU eviction calls `view.destroy()`. Observers (Mutation/Resize/Intersection/EditContext) survive within-Document reparent per W3C specs. y-codemirror.next's 3 plugins have zero DOM coupling. Cross-Document (iframe/ShadowRoot) requires `EditorView.setRoot()`; within-Document does not. Empirical: 12/12 probe tests. Full contract at `specs/2026-04-20-perf-v2-editor-cache-and-cold-load-ux/evidence/cm6-reparent-contract.md`.
