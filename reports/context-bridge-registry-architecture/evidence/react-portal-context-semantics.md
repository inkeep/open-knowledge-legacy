# React Portal + Context Semantics Verification

Evidence file for context-bridge-registry-architecture research.
Investigated 2026-04-14.

## Project versions

| Dependency | Version | Source |
|---|---|---|
| react | ^19.2.5 | `packages/app/package.json:63` |
| react-dom | ^19.2.5 | `packages/app/package.json:64` |
| @tiptap/react | 3.22.3 | `node_modules/@tiptap/react/package.json:4` |
| @tiptap/core | ^3.22.3 | `packages/app/package.json:39` |

---

## Finding 1: React portals inherit context from React-tree parent, not DOM-tree parent

**Claim:** A component rendered via `createPortal` sees context from its React-tree ancestor, regardless of where the DOM node lives.

**Confidence:** CONFIRMED

**Evidence (React docs, react.dev/reference/react-dom/createPortal):**

> "A portal only changes the physical placement of the DOM node. In every other way, the JSX you render into a portal acts as a child node of the React component that renders it. For example, the child can access the context provided by the parent tree..."

**Evidence (legacy React docs, legacy.reactjs.org/docs/portals.html):**

> "Features like context work exactly the same regardless of whether the child is a portal, as the portal still exists in the React tree regardless of position in the DOM tree."

**Evidence (event bubbling confirmation, same source):**

> "An event fired from inside a portal will propagate to ancestors in the containing React tree, even if those elements are not ancestors in the DOM tree."

**Implication:** The portal API itself does not break context. The problem is upstream of `createPortal` -- it depends on *where in the React tree* the portal is rendered.

---

## Finding 2: React 19 did not change portal context inheritance

**Claim:** React 19 introduced no changes to how `createPortal` interacts with context.

**Confidence:** CONFIRMED

**Evidence:** The React 19 release blog (react.dev/blog/2024/12/05/react-19) contains zero mentions of `createPortal`, portals, or context inheritance changes for portals. The two context-related changes in React 19 are:

1. `<Context>` as a provider shorthand (replaces `<Context.Provider>`).
2. `use()` can read context conditionally (after early returns).

Neither changes the fundamental rule: context resolution walks up the React component tree from the consuming component to find the nearest provider.

**Evidence (React 19.2, released 2025-10-01):** No portal-context changes in the 19.2 changelog either.

**Implication:** Our project runs React 19.2.x. Portal context behavior is identical to React 18.

---

## Finding 3: `use()` (React 19) does not change context resolution across portals

**Claim:** React 19's `use()` hook resolves context identically to `useContext()` -- upward through the React tree.

**Confidence:** CONFIRMED

**Evidence (react.dev/reference/react/use):**

> "use returns the context value for the context you passed. To determine the context value, React searches the component tree and finds the closest context provider above for that particular context."

> "Like useContext, use(context) always looks for the closest context provider *above* the component that calls it. It searches upwards and does not consider context providers in the component from which you're calling use(context)."

**Implication:** `use()` offers no mechanism to subscribe to a context from a *specified* React-tree location. There is no React API -- hook, component, or otherwise -- that lets a component say "give me the context from *that* subtree over there."

---

## Finding 4: TipTap renders ALL NodeView portals as flat siblings under `<Portals>`

**Claim:** TipTap's `<Portals>` component renders all NodeView portals as siblings in a flat `<>...</>` fragment. A child NodeView does NOT see its parent NodeView's React context, even though the PM nodes are nested in the document tree.

**Confidence:** CONFIRMED

**Evidence (EditorContent.tsx, @tiptap/react 3.22.3):**

Line 25-35 -- the `Portals` component:
```tsx
const Portals: React.FC<{ contentComponent: ContentComponent }> = ({ contentComponent }) => {
  const renderers = useSyncExternalStore(
    contentComponent.subscribe,
    contentComponent.getSnapshot,
    contentComponent.getServerSnapshot,
  )
  // This allows us to directly render the portals without any additional wrapper
  return <>{Object.values(renderers)}</>
}
```

Line 44 -- the renderer store type:
```tsx
let renderers: Record<string, React.ReactPortal> = {}
```

Line 65-70 -- how portals are created (in `setRenderer`):
```tsx
setRenderer(id: string, renderer: ReactRenderer) {
  renderers = {
    ...renderers,
    [id]: ReactDOM.createPortal(renderer.reactElement, renderer.element, id),
  }
  subscribers.forEach(subscriber => subscriber())
}
```

Line 168-178 -- where `<Portals>` is mounted:
```tsx
render() {
  const { editor, innerRef, ...rest } = this.props
  return (
    <>
      <div ref={mergeRefs(innerRef, this.editorContentRef)} {...rest} />
      {editor?.contentComponent && <Portals contentComponent={editor.contentComponent} />}
    </>
  )
}
```

**Analysis:** The `renderers` object is a flat `Record<string, React.ReactPortal>`. When `Object.values(renderers)` is rendered inside `<>...</>`, every portal is a direct child of the `<Portals>` fragment. The React tree looks like:

```
<PureEditorContent>
  <div ref={editorContentRef} />    ← ProseMirror DOM
  <Portals>
    <Portal key="a">  ← parent NodeView component
    <Portal key="b">  ← child NodeView component (SIBLING, not nested)
    <Portal key="c">  ← another NodeView
  </Portals>
</PureEditorContent>
```

Even though PM node B is a descendant of PM node A in the document, their React components are siblings in the React tree. A `<Context.Provider>` rendered inside portal A is NOT an ancestor of portal B's component.

**Implication:** This is the root cause. A parent NodeView's context provider is invisible to child NodeViews. Any context-based parent-child communication between NodeViews requires an external mechanism.

---

## Finding 5: TipTap's own internal contexts are NOT affected (they wrap EditorContent)

**Claim:** TipTap provides `EditorContext` and `TiptapContext` above `<EditorContent>`, which means all NodeView portals CAN access them because `<Portals>` is rendered inside `<PureEditorContent>`, which sits inside the provider.

**Confidence:** CONFIRMED

**Evidence (Context.tsx lines 36-60, Tiptap.tsx lines 141-159):**

```tsx
// Context.tsx
function EditorProvider({ children, ... }: EditorProviderProps) {
  return (
    <EditorContext.Provider value={contextValue}>
      <EditorConsumer>
        {({ editor }) => <EditorContent editor={editor} {...editorContainerProps} />}
      </EditorConsumer>
      {children}
    </EditorContext.Provider>
  )
}

// Tiptap.tsx
function TiptapWrapper({ editor, ... }: TiptapWrapperProps) {
  return (
    <EditorContext.Provider value={legacyContextValue}>
      <TiptapContext.Provider value={tiptapContextValue}>
        {children}
      </TiptapContext.Provider>
    </EditorContext.Provider>
  )
}
```

**Analysis:** `EditorContext.Provider` wraps `<EditorContent>`, which contains `<Portals>`. Since all portals are React-tree children of `<Portals>`, and `<Portals>` is a React-tree descendant of `EditorContext.Provider`, all NodeView components CAN call `useCurrentEditor()` or `useTiptap()`.

**Implication:** The "wrap the whole editor" pattern works for editor-global context. It does NOT solve per-NodeView context (parent NodeView providing context to child NodeView). This confirms the approach we need: a registry-based context bridge external to the portal tree.

---

## Finding 6: ReactNodeViewContext is per-portal, not inherited

**Claim:** Each NodeView portal wraps its component in a `ReactNodeViewContext.Provider` with portal-local values. This context is scoped to the individual portal and does not chain.

**Confidence:** CONFIRMED

**Evidence (ReactNodeViewRenderer.tsx lines 178-188):**

```tsx
const context = { onDragStart, nodeViewContentRef }
const Component = this.component
const ReactNodeViewProvider: NamedExoticComponent<ReactNodeViewProps<T>> = memo(componentProps => {
  return (
    <ReactNodeViewContext.Provider value={context}>
      {createElement(Component, componentProps)}
    </ReactNodeViewContext.Provider>
  )
})
```

**Evidence (useReactNodeView.ts lines 14-22):**

```tsx
export const ReactNodeViewContext = createContext<ReactNodeViewContextProps>({
  onDragStart: () => { /* no-op */ },
  nodeViewContentChildren: undefined,
  nodeViewContentRef: () => { /* no-op */ },
})
```

**Analysis:** Each portal has its own `ReactNodeViewContext.Provider`. A child NodeView's `useReactNodeView()` sees its own provider, not its parent NodeView's. The context carries `onDragStart` and `nodeViewContentRef` -- both are per-NodeView concerns, not hierarchical.

**Implication:** TipTap's existing context model is explicitly flat. There is no built-in mechanism for parent-to-child NodeView context propagation.

---

## Finding 7: This is a known, open bug in TipTap v3

**Claim:** The React context propagation failure in nested NodeViews is a recognized, unresolved issue in the TipTap project.

**Confidence:** CONFIRMED

**Evidence:**

- **Issue #6427** ("React Context Not Propagating Correctly in Nested Custom Tiptap Nodes", opened 2025-06-07): Reports that "During plugin initialization, child node components fail to access the parent node's context, resulting in errors." Example: Radix UI Accordion generating "AccordionItem must be used within Accordion."
  - URL: https://github.com/ueberdosis/tiptap/issues/6427

- **Issue #6547** ("React context don't work with nested elements in NodeViews", opened later, references #6427): States "Tiptap creates a portal with a wrapper and the component itself, and it, in turn, is not tied to the parent element in any way." Calls it "quite critical since it prevents integration with many UI libraries."
  - URL: https://github.com/ueberdosis/tiptap/issues/6547

**Implication:** TipTap is aware of the problem and has not shipped a fix as of v3.22.3. Any solution we build is not duplicating existing TipTap work -- it fills a gap they've acknowledged but not addressed. Our solution should be compatible with a future TipTap fix (i.e., registry-based, not monkey-patching internals).

---

## Finding 8: No React API exists to subscribe to context from a specified tree location

**Claim:** React provides no mechanism -- hook, component, or experimental API -- for a component to consume context from an arbitrary tree location rather than its own ancestor chain.

**Confidence:** CONFIRMED

**Evidence:**

1. `useContext()` / `use()`: Both walk upward from the calling component. No parameter to specify a different tree location.

2. `createPortal()`: Determines which React-tree parent a component lives under. Once the portal is created, the component's context resolution is fixed to its React-tree ancestors.

3. React RFCs (github.com/reactjs/rfcs): No RFC proposing cross-tree context subscription exists. Searched "context bridge," "context forwarding," "portal context" -- no results.

4. React Issue #13332 ("Support cross-renderer portals", opened by Dan Abramov, 2018): Acknowledges that nested renderers cannot read outer renderer context. Filed "for future reference" -- no resolution as of 2026-04-14.
   - Exact quote: "With this approach, nested renderers like react-art can't read the context of the outer renderers."
   - Exact quote: "But it's not super clear how this should work because renderers can bundle incompatible Fiber implementations. Whose implementation takes charge?"
   - URL: https://github.com/facebook/react/issues/13332

**Implication:** A context bridge / registry is the only viable pattern. This is not a temporary workaround for a missing React feature -- it addresses a fundamental architectural boundary that the React team has acknowledged but not solved in 8 years.

---

## Finding 9: Existing context-bridge patterns in the ecosystem

**Claim:** Multiple libraries have independently invented context-bridge patterns for the same class of problem (separate React render trees needing shared context).

**Confidence:** CONFIRMED

**Evidence:**

| Library | Pattern | Mechanism |
|---|---|---|
| `@react-three/drei` `useContextBridge` | Bridge contexts into `<Canvas>` (separate react-reconciler) | Returns a wrapper component that re-provides consumed context values inside the secondary renderer. Must enumerate contexts statically. |
| `react-context-bridge` (npm) | Bridge contexts between `createRoot` renderers | `ContextListeners` captures values in primary tree; `ContextProviders` re-provides them in secondary tree. |
| `react-babylonjs` | Context bridge for Babylon.js canvas | Same pattern as drei -- wrapper component reads then re-provides. |
| `@pixi/react` | Context bridge for PixiJS | Same pattern. |

**Common pattern:** All solutions follow the same two-phase approach:
1. **Read phase:** A component in the providing tree consumes the context value via `useContext()`.
2. **Write phase:** That value is passed (via props, state, or external store) to a component in the consuming tree, which renders a `<Context.Provider value={bridgedValue}>`.

**Implication:** The pattern is well-established. Our use case differs in one key way: in drei/pixi/babylonjs, the bridge crosses a *renderer* boundary (react-dom to react-three-fiber). In our case, the bridge crosses a *portal* boundary within the same renderer. This is simpler -- we don't need to reconcile fiber implementations. We just need a registry that maps ProseMirror node positions to context values, readable by sibling portals.

---

## Finding 10: NYT react-prosemirror has related but distinct issues

**Claim:** The NYT react-prosemirror library (an alternative to TipTap's React integration) also uses portals for NodeViews and has documented issues with controlled components inside portals.

**Confidence:** CONFIRMED

**Evidence (github.com/nytimes/react-prosemirror/issues/69):**

The issue describes cursor-reset behavior in controlled inputs inside NodeView portals. The root cause is a render-cycle timing mismatch: "extra React render cycle happening after the useEditorEventCallback is called, but before the corresponding update to the ProseMirror document arrives at the Node's attrs."

**Implication:** This is a different symptom (render timing, not context loss) but confirms the fundamental tension: React portals + ProseMirror NodeViews create a split between the PM document hierarchy and the React component hierarchy. Any architectural solution should account for both context propagation AND render-cycle timing.

---

## Summary: The structural problem

```
ProseMirror document tree:           React component tree:

doc                                  <EditorContent>
  paragraph                            <div ref={editorDOM}>
  jsxComponent (parent)               <Portals>
    paragraph                           <Portal> ParentNodeView   ← has context provider
    jsxComponent (child)                <Portal> ChildNodeView    ← CANNOT see parent's context
      paragraph                         <Portal> AnotherNodeView
```

The left tree is hierarchical. The right tree is flat. Context flows through the right tree. There is no React-native mechanism to bridge them. A registry (keyed by PM node position or identity) that parent NodeViews write to and child NodeViews read from is the standard solution, independently invented by drei, pixi, babylonjs, and react-context-bridge.
