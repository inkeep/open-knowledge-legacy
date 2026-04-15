# Alternative Architectures for Context Propagation Across NodeView Portals

**Date:** 2026-04-14
**Scope:** React Context propagation from parent TipTap NodeViews to child NodeViews rendered as sibling React portals, enabling fumadocs/Radix compound components (Tabs, Accordion, Collapsible) in WYSIWYG editing.
**Stack:** TipTap 3.22.3, React 19.2.5, Radix UI 1.4.3, fumadocs-ui, Y.js CRDT, React Compiler enabled (`babel-plugin-react-compiler@0.0.0-experimental-a8e64ef-20260402`).

---

## Key files referenced

- `node_modules/@tiptap/react/src/EditorContent.tsx` -- portal rendering architecture (`<Portals>`, `ContentComponent`)
- `node_modules/@tiptap/react/src/ReactRenderer.tsx` -- portal creation via `createPortal`
- `node_modules/@tiptap/react/src/ReactNodeViewRenderer.tsx` -- `ReactNodeView` class, mount/update/destroy lifecycle
- `node_modules/@tiptap/react/src/useReactNodeView.ts` -- `ReactNodeViewContext` (drag+content-ref only)
- `node_modules/@tiptap/react/src/Editor.ts` -- `ContentComponent` type definition
- `node_modules/@radix-ui/react-context/dist/index.mjs` -- Radix `createContextScope`
- `node_modules/@radix-ui/react-tabs/dist/index.js` -- Radix Tabs with `TabsProvider`/`useTabsContext`
- `node_modules/fumadocs-ui/dist/components/tabs.js` -- fumadocs `TabsContext`, `useTabContext()` throws
- `node_modules/fumadocs-ui/dist/components/tabs.unstyled.js` -- fumadocs unstyled Tabs wrapping Radix
- `node_modules/fumadocs-ui/dist/components/accordion.js` -- fumadocs Accordion wrapping Radix `AccordionPrimitive`
- `packages/app/src/editor/extensions/JsxComponentView.tsx` -- current JSX component NodeView
- `specs/2026-04-14-component-blocks-v2/SPEC.md` -- Component Blocks v2 spec

---

## Ranked Comparison Summary

| Rank | Option | Architecture | Est. LoC | Maintenance | Upstream Risk | CRDT Compat | Testability | Performance |
|------|--------|-------------|-------:|-------------|---------------|-------------|-------------|-------------|
| 1 | **A** | Context Bridge Registry | 250-350 | Low | **None** | Excellent | Excellent | O(depth) per mount |
| 2 | **D** | Global Store + Top-Level Provider | 150-200 | Low | None | Good | Good | O(1) read, O(n) notify |
| 3 | **E** | PM Plugin State Context Map | 200-300 | Medium | Low | Good | Good | O(n) per transaction |
| 4 | **C** | Fork @tiptap/react Portal Model | 400-600 | **Critical** | **Critical** | Good | Medium | O(n) re-mount risk |
| 5 | **B** | Render Children In-Tree | 300-500 | High | Medium | **Poor** | Medium | Varies |
| 6 | **G** | Polling Context Values | 100-150 | Low | None | Good | Good | **O(depth) per interval** |
| 7 | **F** | Imperative Ref-Based | 100-150 | Low | None | Good | Good | **Infeasible** |

**Recommendation: Option A (Context Bridge Registry)** with Option D as an acceptable alternative for simpler use cases.

---

## The Portal Problem: Root Cause Analysis

### TipTap's Rendering Architecture (verified from source: `@tiptap/react@3.22.3`)

TipTap renders every React NodeView via `ReactDOM.createPortal()`. The chain is:

1. **`ReactNodeView.mount()`** (`ReactNodeViewRenderer.tsx:144-231`) creates a `ReactRenderer` instance, passing the React component. Each NodeView creates its own DOM element (`document.createElement(as)`) and wraps the component in a `<ReactNodeViewContext.Provider>` (which only provides `onDragStart` and `nodeViewContentRef` -- not user context).
2. **`ReactRenderer.render()`** (`ReactRenderer.tsx:204-235`) stores `this.reactElement = <Component {...props} />` and calls `editor.contentComponent.setRenderer(this.id, this)`.
3. **`ContentComponent.setRenderer()`** (`EditorContent.tsx:65-69`) creates `ReactDOM.createPortal(renderer.reactElement, renderer.element, id)` and stores it in a **flat** `renderers: Record<string, ReactPortal>` map.
4. **`<Portals>`** (`EditorContent.tsx:25-35`) renders ALL portals as flat siblings: `<>{Object.values(renderers)}</>` via `useSyncExternalStore`.

**Critical implication:** Every NodeView portal is a direct child of the `<Portals>` component. A parent NodeView (e.g., Tabs) and its child NodeView (e.g., Tab) are **React-tree siblings**, not parent-child. React Context flows through the React tree, not the DOM tree. Therefore, a `TabsContext.Provider` rendered inside the Tabs NodeView is invisible to the Tab NodeView's React subtree.

```
React Tree (actual):               DOM Tree (visual):
<PureEditorContent>                 <div class="ProseMirror">
  <div ref={editorContentRef} />      <div class="node-jsxComponent">  (Tabs)
  <Portals>                              <div class="node-jsxComponent">  (Tab1)
    Portal(id=Tabs)  -- sibling --       <div class="node-jsxComponent">  (Tab2)
    Portal(id=Tab1)  -- sibling --       </div>
    Portal(id=Tab2)  -- sibling --     </div>
  </Portals>                          </div>
</PureEditorContent>
```

### Extension point analysis: Is there a hook to modify portal creation?

**Claim:** No. **Confidence:** HIGH.
**Evidence:** The `ContentComponent` interface (`Editor.ts:10-16`) exposes only `setRenderer`, `removeRenderer`, `subscribe`, `getSnapshot`, `getServerSnapshot`. The `setRenderer` call site (`ReactRenderer.tsx:234`) is inside the renderer class with no callback hook or event emission. The `getInstance()` factory (`EditorContent.tsx:42-84`) is a closure with no extension API. The `ReactNodeView` class extends TipTap's `NodeView` base but the `mount()` method has no pre/post hooks for modifying portal creation behavior.

The `ReactNodeViewRendererOptions` (`ReactNodeViewRenderer.tsx:20-52`) offers `update`, `as`, `className`, and `attrs` options -- none of which control portal mounting behavior.

### What fumadocs/Radix Compound Components Require

**fumadocs `<Tabs>`** (`fumadocs-ui/dist/components/tabs.js:7-13`):
- Creates `TabsContext = createContext(null)` at module scope.
- `useTabContext()` reads it and throws `'You must wrap your component in <Tabs>'` if null.
- `<Tab>` calls `useTabContext()` to resolve its value from the parent's `items` collection.
- The unstyled layer (`tabs.unstyled.js:16`) creates its OWN `TabsContext` + wraps Radix `Primitive.Tabs`.
- **Three nested contexts** total for Tabs: Radix `TabsProvider` (via `createContextScope`), fumadocs unstyled `TabsContext`, fumadocs styled `TabsContext`.

**fumadocs `<Accordion>`** (`fumadocs-ui/dist/components/accordion.js:10-28`):
- Thin wrapper around `AccordionPrimitive.Root` from `@radix-ui/react-accordion`.
- Radix Accordion uses `createContextScope('Accordion', ...)` internally.
- `AccordionPrimitive.Item` requires the Accordion context scope or throws.

**Radix context mechanism** (`@radix-ui/react-context/dist/index.mjs:20-55`):
- `createContextScope(scopeName, deps)` returns `[createContext, composeContextScopes]`.
- Each `createContext` call creates a unique React Context object.
- Scope contexts are passed via `__scope*` props (e.g., `__scopeTabs`).
- This means Radix context objects are created at module-load time and are **unique references** -- you cannot substitute a different Context object.

**Pattern:** All three layers (Radix primitives, fumadocs unstyled, fumadocs styled) use React Context internally. The child component MUST be a React-tree descendant of the parent provider component.

### TipTap 3.x Status

**Claim:** TipTap 3.x does NOT change the portal model. **Confidence:** HIGH.
**Evidence:** Source inspection of `@tiptap/react@3.22.3` (this project's installed version) confirms the identical `createPortal` -> flat `<Portals>` rendering architecture. The v3 release page (https://tiptap.dev/tiptap-editor-v3) lists JSX support, MarkViews, and Floating UI migration but does not mention portal model changes. GitHub issues [#6427](https://github.com/ueberdosis/tiptap/issues/6427) (closed without fix) and [#6547](https://github.com/ueberdosis/tiptap/issues/6547) (open, Jul 2025, assigned to @bdbch) confirm this is a known unresolved limitation in v3. No PR or branch addresses it.

### Existing Solutions in the Ecosystem

**`@handlewithcare/react-prosemirror` v2** (NYT fork): Solves this by **rewriting ProseMirror's rendering engine in React** -- all NodeViews become actual React-tree children of their parent NodeViews. This eliminates portals entirely. However, it replaces TipTap's entire React integration layer. Incompatible with `@tiptap/react`. This project depends on `@handlewithcare/remark-prosemirror` (a different, unrelated package from the same org).

**`@prosemirror-adapter/react`** (Milkdown/ProseKit): Uses portals but constructs them so "child node view components were always rendered as children of their parent's node view components." This also requires replacing TipTap's renderer.

**No existing TipTap plugin** provides NodeView context sharing. The TipTap FAQ suggests wrapping `EditorContent` in a provider, which only works for editor-level context (available to ALL NodeViews), not for parent-to-child NodeView context.

---

## Detailed Architecture Analysis

### Option A: Context Bridge Registry

#### How it works

A standalone registry (Map) keyed by ProseMirror node identity stores context values published by ancestor NodeViews. Descendant NodeViews walk the PM doc tree (via `getPos()` and `editor.state.doc.resolve()`) to find their nearest ancestor of a given type, look up the ancestor's context values from the registry, and re-provide them in their own React subtree via `<Context.Provider>`.

**Detailed mechanism:**

```typescript
// 1. Registry: Map<string, ContextEntry[]>
//    Key: stable node identifier (e.g., `${nodeType}-${pos}` refreshed on update)
//    Value: array of { context: React.Context<T>, value: T } entries

// 2. Parent NodeView (e.g., Tabs) on mount/update:
//    - Computes its React context values from PM node attrs
//    - Publishes: registry.publish(nodeKey, [
//        { context: TabsContext, value: { activeTab, setActiveTab, items } },
//        { context: RadixTabsScope, value: scopeValue },
//      ])
//    - Cleanup on unmount: registry.unpublish(nodeKey)

// 3. Child NodeView (e.g., Tab) on mount/update:
//    - Resolves $pos via editor.state.doc.resolve(getPos())
//    - Walks $pos.node(depth) from depth=0 to $pos.depth
//    - For each ancestor that has a registry entry, collects context values
//    - Wraps its own render in nested <Context.Provider value={...}>

// 4. useSyncExternalStore subscription ensures child re-renders when parent updates

// 5. useAncestorContexts(editor, getPos) hook encapsulates steps 3-4
// 6. usePublishContexts(nodeKey, entries) hook encapsulates step 2
```

**Key design choice:** The registry is external to both React and ProseMirror state. It is a plain JavaScript Map updated imperatively. React components subscribe to it via a `useSyncExternalStore`-compatible interface.

#### Implementation cost

~250-350 LoC total:
- `context-bridge-registry.ts`: Registry class with publish/subscribe/lookup (~80 LoC)
- `useAncestorContexts.ts`: Hook that walks PM tree and reads registry (~60 LoC)
- `usePublishContexts.ts`: Hook for parent NodeViews to publish (~40 LoC)
- Integration in each compound NodeView pair (Tabs/Tab, Accordion/AccordionItem, etc.): ~15-20 LoC per pair
- Type definitions: ~30 LoC

#### Architectural cleanliness

**Excellent.** Clean separation of concerns:
- ProseMirror owns the document tree structure (ancestor resolution via `$pos.node(depth)`).
- The registry is a pure data structure (no React dependency, no PM dependency in the core).
- React components consume the bridge via hooks (standard React pattern).
- Each NodeView is self-contained: parent publishes, child subscribes.

Does NOT require modifying TipTap internals, forking packages, or changing the portal model. Composes with the existing `ReactNodeViewRenderer` as-is.

Aligns with Architectural Precedent #4 ("Shared computation, per-surface rendering"): the bridge computes WHAT context to propagate (shared), each NodeView renders it (per-surface). Aligns with Precedent #2 ("Generic primitives over specific ones"): `useAncestorContexts(contextName)` serves any compound component, not just Tabs.

#### Maintenance burden

**Low.** No upstream fork. No dependency on TipTap internals beyond the stable `getPos()` and `editor.state.doc` APIs (both PM-level, not TipTap-specific). If TipTap changes its portal model in the future (e.g., to fix #6547 natively), the registry becomes unnecessary but does not break.

#### Risk of breaking on upstream changes

**Minimal.** The registry depends on:
- `getPos()` returning a number (PM API, stable since PM 1.0; TipTap v3 made it `number | undefined`, already handled)
- `doc.resolve(pos)` and `$pos.node(depth)` (PM API, stable since PM 1.0)
- React Context API (stable since React 16.3)

None of these are fragile.

#### Composition with CRDT primitives

**Excellent.** The registry is purely a rendering concern. It does not touch Y.Doc, Y.XmlFragment, Y.Text, or any CRDT state. Context values are derived from PM node attrs (which come from CRDT state via y-prosemirror), not stored in CRDT. The origin-guard truth table is unaffected. Observer A/B are unaffected. The source-dirty observer is unaffected.

When a collaborative edit changes a parent node's attrs (e.g., changing the active tab), the PM transaction triggers `ReactNodeView.update()`, which causes the parent component to re-publish to the registry, which triggers child subscribers to re-render with new context values. This follows the existing TipTap update flow -- no new transaction type, no new origin.

#### Testability

**Excellent.** The registry is a pure JavaScript class -- unit-testable without React or PM:
```typescript
const registry = new ContextBridgeRegistry()
registry.publish('tabs-42', [{ context: TabsContext, value: { activeTab: 'first' } }])
expect(registry.lookup('tabs-42')).toEqual([{ context: TabsContext, value: { activeTab: 'first' } }])
```

The `useAncestorContexts` hook can be tested with a mock editor state (PM doc with resolved positions). No browser DOM required for the core logic. Integration tests can use the existing `test-harness.ts` infrastructure.

#### Performance

**O(depth) per NodeView mount/update** for the ancestor walk. ProseMirror doc tree depth is typically 5-15 levels for nested components. The walk is a simple loop over `$pos.node(i)` -- each iteration is a pointer dereference, not a tree search. For a document with 100 component NodeViews, each 10 levels deep, total work per transaction is ~1000 pointer dereferences -- negligible (~0.01ms).

The registry itself is O(1) lookup (Map). Publishing is O(1). Subscriber notification is O(k) where k is the number of children subscribed to a given parent -- typically 2-10 for compound components.

**Re-render behavior:** Only children of the changed parent re-render. Other NodeViews are unaffected. This is optimal -- it matches what would happen with native React Context propagation if the portals were nested.

#### Risks specific to this option

1. **Radix scoped contexts.** Radix `createContextScope` creates unique Context objects per scope. The bridge must capture the exact Context object references from the parent NodeView's render and re-provide them in the child. This requires the parent's `contextPublisher` function to return the actual Context objects, not reconstructed ones.

2. **Cleanup ordering.** If a parent NodeView unmounts before its children (e.g., during a rapid transaction that replaces the parent), children briefly have stale registry entries. Mitigation: children treat missing registry entry as "use default" (matches React Context default behavior).

3. **Position-based keying instability.** Node positions change on every insertion/deletion above the node. The registry key must be refreshed on each `ReactNodeView.update()` call (which already provides the new position). An alternative keying strategy: use a stable ID attr on the PM node (e.g., `componentId: crypto.randomUUID()` set on insertion), which survives position changes. Trade-off: adds an attr to the schema (but `default` makes it schema-add-only safe per Precedent #9).

---

### Option B: Render Children In-Tree, Bypass PM contentDOM

#### How it works

The parent NodeView does NOT use ProseMirror's `contentDOM` mechanism for child content. Instead, it manually reads `node.content`, iterates over children, and renders each as a React component directly in its own React subtree. Children are React-tree children of the parent, so Context flows naturally.

#### Implementation cost

~300-500 LoC per compound component type. Each parent must manually:
- Read `node.content` and map children to React elements
- Handle selection, decorations, and cursor placement for children
- Sync child edits back to ProseMirror state
- Implement child lifecycle (creation, update, deletion)

#### Architectural cleanliness

**Poor.** Bypasses ProseMirror's core content management. `contentDOM` is how PM knows where to render child nodes, manage their lifecycle, apply decorations, and handle selection. Without it, PM treats the node as a leaf.

#### Maintenance burden

**High.** Every compound component needs its own child-rendering logic. PM's node lifecycle must be manually re-implemented for children.

#### Risk of breaking on upstream changes

**Medium.** PM's `NodeView` contract expects `contentDOM` for non-leaf nodes. TipTap extensions that operate on nested content (collaboration-cursor decorations, drag-handle) would not work inside these components.

#### Composition with CRDT primitives

**Poor -- this is the critical failure.** `y-prosemirror`'s `updateYFragment` (`sync-plugin.js:1145-1298`) traverses `contentDOM` to sync Y.XmlFragment with the PM DOM. Without `contentDOM`, child nodes are invisible to the CRDT sync layer. The dual-representation bridge (Observer A/B) relies on PM's content model. Manually-rendered children bypass this model entirely.

This violates Architectural Precedent #10: "Any PM node that stores user-editable raw content AND needs to be opaque in WYSIWYG MUST use `atom: false, content: 'text*'` (or equivalent content expression) -- never `atom: true` with raw-content-in-attrs." Option B is equivalent to putting children in attrs (they're React state, not PM content).

#### Testability

**Medium.** Requires full editor setup. Cannot test child rendering in isolation from PM.

#### Performance

For small compound components (2-5 tabs), acceptable. For large ones (20+ accordion items), the parent re-renders ALL children on any prop change -- no granular updates. PM's native `contentDOM` approach only updates changed children via `NodeView.update()`.

**Verdict:** Eliminated. Incompatible with CRDT collaborative editing model.

---

### Option C: Fork @tiptap/react to Change Portal Model

#### How it works

Modify `EditorContent.tsx` and `ReactRenderer.tsx` so that child NodeView portals are mounted inside their parent NodeView's React tree rather than as siblings under `<Portals>`. Requires:

1. When creating a portal for a child NodeView, identify its parent NodeView in the PM tree.
2. Store portals in a tree-shaped structure instead of a flat map.
3. Parent NodeView renders a `<ChildPortals parentId={this.id} />` component that pulls its children's portals from the tree.

#### Implementation cost

~400-600 LoC as a `bun patch`:
- Modify `EditorContent.tsx`: tree-shaped renderer storage, parent-id resolution (~150 LoC)
- Modify `ReactNodeViewRenderer.tsx`: parent-id computation on mount via PM tree (~50 LoC)
- Modify `ReactRenderer.tsx`: parent-id propagation, tree insertion (~30 LoC)
- New `ChildPortals` component (~40 LoC)
- Patch file maintenance, test coverage (~200+ LoC)

#### Architectural cleanliness

**Good conceptually, poor practically.** The architecture is correct -- this IS what `@handlewithcare/react-prosemirror` v2 does (reimplementing PM's renderer in React so NodeViews are native React children). But doing it as a patch to `@tiptap/react` creates an unstable hybrid.

#### Maintenance burden

**Critical.** Every `@tiptap/react` update requires re-verifying and potentially re-porting the patch. TipTap v3 has been releasing rapidly (3.22.x patch versions, multiple per month). The patch touches the core rendering path -- the three most central files in `@tiptap/react`: `EditorContent.tsx`, `ReactRenderer.tsx`, `ReactNodeViewRenderer.tsx`.

The project already maintains one patch (`y-prosemirror@1.3.7.patch`), documented as requiring re-porting on upgrades (CLAUDE.md: "Version-agnostic; upgrades re-port the patch and re-run the Q6 verification test"). Adding a second to a more volatile package significantly compounds maintenance burden.

#### Risk of breaking on upstream changes

**Critical.** TipTap issue #6547 is assigned to maintainer @bdbch. If TipTap fixes the portal model natively, their fix will likely conflict with this patch (they'd touch the same files). Any refactor of the portal rendering system invalidates the patch. The `<Portals>` component, `ContentComponent` interface, and `ReactRenderer` class have all changed between TipTap major versions.

#### Composition with CRDT primitives

**Good.** The CRDT layer is unaffected because the change is purely at the React rendering level. PM's `contentDOM` is still used. y-prosemirror sync is unaffected. Observer A/B are unaffected.

#### Testability

**Medium.** Requires a full TipTap editor to verify the patched rendering. The tree-shaped portal logic can be partially unit-tested, but lifecycle integration (mount, update, destroy, selection, undo) requires E2E verification against the patched code.

#### Performance

**O(n) re-mount risk.** When a parent NodeView updates (new position, new decorations), its position in the React tree may change, which could cause React to unmount and remount all child portals. This is the same problem that `@handlewithcare/react-prosemirror` v1 had -- explicitly cited in the author's blog post as motivation for v2's full rewrite. Whether this actually triggers depends on React's reconciliation heuristics and key stability.

**Verdict:** Unacceptable maintenance burden. Patching TipTap's most volatile code path creates a permanent maintenance tax.

---

### Option D: Wrap Editor in Top-Level Provider + Global Store

#### How it works

A global store (plain Map + `useSyncExternalStore`, or Zustand/Jotai) holds context values published by ancestor NodeViews. A single `<ComponentContextProvider>` at the editor root wraps `EditorContent` and provides access to the store. All NodeViews read from the global store to find their ancestor's context values and re-provide them locally.

```typescript
// Store: Map<nodeKey, { contexts: Array<{ ctx: React.Context, value: unknown }> }>
// Parent NodeView writes to store on render
// Child NodeView reads from store via hook, resolves ancestor via PM tree walk
// Single Provider wraps EditorContent, subscribes to store
```

#### Implementation cost

~150-200 LoC:
- Store module (Map + subscribe/notify) (~40 LoC)
- Provider component wrapping EditorContent (~20 LoC)
- `useComponentContext` hook for NodeViews (~50 LoC, includes PM tree walk for ancestor resolution)
- Integration per compound component (~15 LoC per pair)

#### Architectural cleanliness

**Good, with a caveat.** Clean separation: store is external, React consumes via hook, PM provides tree structure. The caveat: the store is global (editor-scoped) but holds per-subtree state. For this project's use case (~5-10 compound component types), the abstraction leak is not practically meaningful. For a hypothetical future with 50+ compound types, the global store becomes a performance bottleneck (see Performance below).

#### Maintenance burden

**Low.** No fork. No patch. Pure application-level code. A plain Map + `useSyncExternalStore` adds zero dependencies.

#### Risk of breaking on upstream changes

**None.** The store is application code. The PM tree walk uses stable PM APIs. The Context provider is at the editor root (outside TipTap internals).

#### Composition with CRDT primitives

**Good.** Same as Option A: purely a rendering concern. Does not touch CRDT state. The store is keyed by PM position (which changes on every content-modifying transaction), so the hook must re-resolve ancestor positions on each render. This is already how TipTap's `getPos()` works -- `ReactNodeView.update()` provides a fresh `getPos` callback on position changes.

#### Testability

**Good.** Store is unit-testable. Hook requires a mock editor state. The top-level provider is testable with React Testing Library.

#### Performance

**O(1) read** from store (Map lookup). **O(n) notify** when a parent updates -- naive `useSyncExternalStore` notifies ALL subscribers of the store, not just children of the changed parent. For a document with 50 independent compound components, updating one Tab's active state would trigger 50 subscriber checks.

**Mitigation:** Selector-based subscription (like Zustand's `useStore(store, selector)` or a custom `useSyncExternalStore` with snapshot comparison) reduces this to O(k) where k is children of the changed parent. With selectors, Option D matches Option A's performance.

**Comparison with Option A:** Option A's registry is already keyed per-parent, so subscriber notification is inherently scoped to children of the changed parent. Option D requires explicit selector logic to achieve the same scoping. Both converge on the same performance profile with proper implementation.

---

### Option E: Stack-Based Context via PM Plugin State

#### How it works

A ProseMirror plugin walks the document tree on each doc-changing transaction and populates a shared context map. The plugin state maps each node position to the accumulated context from its ancestors. NodeViews read from the plugin state.

```typescript
const contextPlugin = new Plugin({
  state: {
    init(_, state) { return buildContextMap(state.doc) },
    apply(tr, oldMap, _, newState) {
      if (!tr.docChanged) return oldMap
      return buildContextMap(newState.doc)
    }
  }
})

// buildContextMap depth-first walks the doc:
// - When entering a compound-parent node, pushes its context onto a stack
// - Records the current stack for each position
// - When exiting, pops

// NodeView reads: contextPlugin.getState(editor.state).get(getPos())
```

#### Implementation cost

~200-300 LoC:
- Plugin definition with tree walker (~100 LoC)
- `buildContextMap` function (~80 LoC)
- `usePluginContext` React hook (~40 LoC)
- Registration of context-providing node types (~30 LoC)

#### Architectural cleanliness

**Good in the PM idiom, but mismatches the concern.** PM plugins are designed for editor state (selection, decorations, input rules). Using plugin state for React Context values conflates two layers:
- PM plugin state is immutable per transaction and recomputed on `apply`.
- React Context values are reactive and push-based.

The bridge from immutable PM plugin state to reactive React rendering requires an additional subscription mechanism (`useSyncExternalStore` on editor state updates), effectively reinventing Option A's store with PM plugin overhead.

#### Maintenance burden

**Medium.** The tree walker must know which node types are compound-component parents. Adding a new compound type requires updating the walker's dispatch table. The walker runs on every doc-changing transaction.

#### Risk of breaking on upstream changes

**Low.** PM Plugin API is the most stable API in ProseMirror (unchanged since PM 1.0). TipTap's plugin integration is stable.

#### Composition with CRDT primitives

**Good.** The plugin state is derived from PM state, which is derived from CRDT state via y-prosemirror. The derivation chain is: Y.Doc -> PM transaction -> Plugin state -> Context map. This composes correctly with Observer A/B because the plugin's `apply` runs after every transaction. The context map is always consistent with the current document state.

#### Testability

**Good.** The `buildContextMap` function is a pure function from PM doc -> Map. Unit-testable with a constructed PM doc (no browser DOM). The React hook requires a mock editor state.

#### Performance

**O(n) per doc-changing transaction** for the full tree walk, where n is the number of nodes in the document. For a 1000-node document, each keystroke triggers a ~1000-node walk. Each visit is a type check + optional context push -- fast in absolute terms (~0.1ms). But it runs on EVERY doc-changing transaction (including per-keystroke during typing).

**Incremental optimization possibility:** Use `tr.mapping` to identify changed ranges and only rebuild the context map for affected subtrees. Reduces average-case to O(k) where k is the size of the changed subtree. Adds ~40 LoC of mapping logic.

**Comparison with Option A:** Option A walks O(depth) only when a specific NodeView renders (lazy), not on every transaction (eager). For a 1000-node document where only one Tab is being clicked, Option A does one O(10) walk; Option E does one O(1000) walk. Option A is strictly more efficient.

**Verdict:** Viable but unnecessary. Option A achieves the same result with better performance characteristics and cleaner layer separation.

---

### Option F: Imperative Ref-Based Pattern

#### How it works

Parent NodeView exposes a ref (via `editor.storage` or a shared registry). Child NodeView uses `getPos()` to find its parent's position, queries the parent's ref to read context values imperatively.

#### The fatal flaw

**This option is infeasible.** fumadocs and Radix compound components (Tabs, Accordion, Collapsible) use React Context internally via `createContextScope` and `createContext`. The child component (`TabsContent`, `AccordionItem`) calls `useContext()` to read from its parent's provider. You cannot make `useContext()` read from an imperative ref instead of a Context provider without modifying the fumadocs/Radix source code.

Even wrapping fumadocs components in adapters that translate ref values into Context values would implement Option A with extra indirection.

**Confidence:** HIGH. Verified by source inspection of `fumadocs-ui/dist/components/tabs.js:8-12` (`useTabContext` throws if context is null) and `@radix-ui/react-tabs/dist/index.js:63` (`useTabsContext` from `createContextScope`).

**Verdict:** Eliminated. Infeasible without forking fumadocs and Radix.

---

### Option G: Polling Context Values from Ancestors

#### How it works

Each descendant NodeView polls editor state on an interval (e.g., 100ms) to find its ancestor and compute context values.

#### Why this is wrong

1. **Stale state.** 100ms polling means context values lag by up to 100ms. For interactive UX (clicking a tab, expanding an accordion), users see the old state for one poll cycle before the child updates.

2. **Wasteful.** 60 ancestor walks/second per child NodeView when nothing has changed. For 50 compound children, 3000 tree walks/second.

3. **Anti-pattern.** React and ProseMirror are both push-based reactive systems. Using timer-based polling when reactive alternatives exist is architecturally inappropriate.

**Comparison with Option A:** Option A updates context values synchronously within the React render cycle triggered by the PM transaction. No stale state. No wasteful polling. Strictly superior on every dimension except trivial implementation simplicity (~100 LoC difference).

**Confidence:** HIGH. This is a well-known anti-pattern.

**Verdict:** Eliminated. Dominated by Option A.

---

## Cross-Cutting Analysis

### Interaction with React Compiler

React Compiler is enabled (`babel-plugin-react-compiler@0.0.0-experimental-a8e64ef-20260402`). CLAUDE.md prohibits `forwardRef`, `memo`, `useMemo`, `useCallback`.

**Options A and D** are fully compatible. `useSyncExternalStore` is the React team's recommended pattern for external stores. Custom hooks `useAncestorContexts` and `usePublishContexts` follow standard hook conventions.

**Option E** is compatible -- `getState()` on a PM plugin is a plain function call.

### Interaction with Y.js Undo/Redo

Context bridge values (active tab, expanded accordion) are **ephemeral UI state derived from PM attrs**, not stored independently in CRDT. Undo/redo correctly reverts the PM attr, which triggers the parent NodeView to re-publish to the bridge, which updates children. No special handling needed for any viable option.

### Interaction with Observer A/B Bridge

None of the viable options (A, D, E) modify Observer A or Observer B. The context bridge operates after PM transactions settle. It does not generate transactions, does not modify Y.Text or Y.XmlFragment, and does not interact with the origin-guard truth table.

### Multi-Client Collaborative Editing

When Client 1 clicks Tab 2, the `activeTab` attr changes on the Tabs PM node. CRDT sync delivers this to Client 2 as a remote transaction. Client 2's `ReactNodeView.update()` fires, the Tabs component re-publishes to the bridge, and child Tab NodeViews re-render with the new active tab. This works correctly for all viable options.

**Edge case:** Two clients simultaneously click different tabs. CRDT resolves via LWW on the attr. The bridge on each client reflects the resolved value after merge. No special handling needed.

### Interaction with Component Blocks v2 Spec

The spec (FR-9, FR-10, FR-11) defines a descriptor registry that dispatches NodeView rendering based on component name. The context bridge registry is orthogonal to the descriptor registry:
- **Descriptor registry:** maps component name -> rendering configuration (props, children, visual).
- **Context bridge registry:** maps PM tree position -> React context values.

A compound component descriptor (e.g., Tabs) would declare both its rendering config AND its `contextPublisher` function. The bridge registry is a generic primitive consumed by the compound component layer, not a per-component solution.

---

## Recommendation

### Primary: Option A (Context Bridge Registry)

**Rationale:**

1. **Zero upstream coupling.** Does not fork, patch, or modify any dependency. The only existing patch (`y-prosemirror@1.3.7.patch`) is documented as high-maintenance; adding a second to more volatile `@tiptap/react` would compound risk.

2. **Surgically scoped.** ~250-350 LoC, self-contained module with clear responsibilities: publish, lookup, subscribe. Purely additive -- does not modify any existing code path.

3. **Composable with all existing primitives.** CRDT bridge, observers, source-dirty tracking, origin guards, UndoManager, descriptor registry -- none affected.

4. **Testable in isolation.** Registry is a pure data structure. Ancestor-walk hook testable with mock PM doc. No browser DOM for core logic.

5. **Forward-compatible.** If TipTap fixes #6547 natively, the bridge becomes unnecessary but does not break. Removable in a single PR.

6. **Matches architectural precedents.** Precedent #4 (shared computation, per-surface rendering). Precedent #2 (generic primitives over specific ones). Precedent #9 (schema is add-only -- stable ID attr for registry keying follows this).

### Acceptable alternative: Option D (Global Store + Top-Level Provider)

If implementation simplicity is prioritized, Option D achieves the same outcome with ~100 fewer LoC. The trade-off: slightly worse re-render scoping (global notify vs. per-parent notify) and a mild abstraction leak (global store for local concerns). For ~5-10 compound types, this difference is negligible. With selector-based subscription, performance matches Option A.

### Eliminated options with confidence levels

| Option | Verdict | Confidence | Reason |
|--------|---------|------------|--------|
| B | Eliminated | HIGH | Incompatible with CRDT -- bypasses `contentDOM`, breaks y-prosemirror sync |
| C | Eliminated | HIGH | Unacceptable maintenance -- patches TipTap's most volatile rendering code |
| F | Eliminated | HIGH | Infeasible -- Radix/fumadocs require React Context, not imperative refs |
| G | Eliminated | HIGH | Anti-pattern -- polling in a reactive system, dominated by Option A |
| E | Viable but unnecessary | MEDIUM | Reinvents Option A with worse layer separation and O(n) per-transaction cost |

---

## Gaps / follow-ups

1. **Radix scoped contexts.** The `__scopeTabs` prop carries unique Context object references from `createContextScope`. The bridge must capture and re-provide the exact same Context objects. Needs a proof-of-concept to verify Radix's scope mechanism works when the Provider is in a different portal than where it was originally created.

2. **Cleanup ordering.** If a PM transaction replaces a parent node (new Y.XmlElement from CRDT merge), the parent NodeView destroys before children. Children briefly have a stale registry entry. The bridge should handle this gracefully (return defaults, not throw).

3. **Registry key stability.** Position-based keys (`tabs-42`) change on every content insertion above. Two strategies: (a) refresh key on every `ReactNodeView.update()` (simple, works because update provides new position), or (b) use a stable UUID attr on the PM node. Strategy (a) is simpler; strategy (b) is more robust under rapid concurrent edits.

4. **Performance profiling under heavy nesting.** A pathological case: 10 levels of nested compound components (Tabs containing Accordion containing Tabs containing...). Each child walks O(10) ancestors. With 100 leaf NodeViews, that is 1000 pointer dereferences per transaction -- almost certainly negligible, but should be verified empirically.

5. **fumadocs `useCollectionIndex()` hook.** fumadocs Tabs uses a collection-based ordering pattern (`tabs.js:45-58`) that relies on render order to determine tab index. In a portal-based rendering model, render order may differ from DOM order. The bridge must ensure that `useCollectionIndex()` resolves correctly, or the Tab component must use explicit `value` props (bypassing the collection mechanism).

---

## Sources

- [TipTap Issue #6427: React Context Not Propagating in Nested NodeViews](https://github.com/ueberdosis/tiptap/issues/6427) -- closed without fix
- [TipTap Issue #6547: React context don't work with nested elements in NodeViews](https://github.com/ueberdosis/tiptap/issues/6547) -- open, assigned @bdbch, unresolved as of 2026-04-14
- [TipTap v3 Announcement](https://tiptap.dev/tiptap-editor-v3) -- no portal model changes
- [TipTap React NodeView Docs](https://tiptap.dev/docs/editor/extensions/custom-extensions/node-views/react)
- [TipTap FAQ](https://tiptap.dev/docs/guides/faq) -- suggests wrapping EditorContent (editor-level only)
- [NYT react-prosemirror](https://github.com/nytimes/react-prosemirror) -- solves via full renderer rewrite to `@handlewithcare/react-prosemirror`
- [Why I rebuilt ProseMirror's renderer in React](https://smoores.dev/post/why_i_rebuilt_prosemirror_view/) -- context propagation as key motivation for v2 rewrite
- [@prosemirror-adapter/react](https://github.com/prosekit/prosemirror-adapter) -- alternative nested-portal approach
- [TipTap v3 Roadmap Discussion](https://github.com/ueberdosis/tiptap/discussions/5793)
- Source inspection: `@tiptap/react@3.22.3` (`EditorContent.tsx:25-84`, `ReactNodeViewRenderer.tsx:54-445`, `ReactRenderer.tsx:147-281`, `useReactNodeView.ts`, `Editor.ts`)
- Source inspection: `fumadocs-ui` (`tabs.js:1-65`, `tabs.unstyled.js:1-89`, `accordion.js:1-46`)
- Source inspection: `@radix-ui/react-tabs/dist/index.js:59-100`, `@radix-ui/react-context/dist/index.mjs:20-55`
