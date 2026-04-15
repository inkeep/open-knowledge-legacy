# TipTap / ProseMirror Prior Art: Nested NodeView Context

Evidence file for D5: TipTap-specific prior art, ProseMirror forum findings, and community solutions for propagating context between nested NodeViews.

---

## 1. TipTap's Portal Architecture (How NodeViews Render)

**Claim:** TipTap renders React NodeViews via a portal system managed by `ContentComponent`. Each NodeView gets its own `ReactRenderer` instance that creates a DOM element and registers with the editor's central `ContentComponent`. The `Portals` component then renders all NodeView portals using `useSyncExternalStore` for performance.

**Confidence:** HIGH

**Evidence:**
- [TipTap React Integration (DeepWiki)](https://deepwiki.com/ueberdosis/tiptap/4.1-react-integration) -- "React Node Views are rendered via a portal system managed by ContentComponent."
- [TipTap ReactRenderer.tsx source](https://github.com/ueberdosis/tiptap/blob/main/packages/react/src/ReactRenderer.tsx) -- `ReactRenderer` creates a DOM element, stores the component as `reactElement`, and registers with `editor.contentComponent.setRenderer(this.id, this)`. It does NOT use `createPortal` directly -- the portal creation happens in `EditorContent`'s `Portals` component.
- [useSyncExternalStore in TipTap](https://dev.to/ramunarasinga-11/usesyncexternalstore-usage-in-tiptap-source-code-3j3i) -- `useSyncExternalStore` is used in `EditorContent.tsx`, `useEditorState.ts`, and `useEditor.ts`. The `Portals` component uses it to efficiently re-render NodeView portals on state changes.
- [ReactPortal type analysis](https://medium.com/@ramunarasinga/reactportal-type-in-tiptap-source-code-fb1281eeaab8) -- `ContentComponent` interface: `getSnapshot()` returns `Record<string, ReactPortal>`. Each NodeView is a portal keyed by its renderer ID.

**Implication:** TipTap's architecture creates each NodeView as an INDEPENDENT portal. There is no parent-child relationship between NodeView portals in React's tree -- they are all siblings rendered by the `Portals` component. This means React Context from a parent NodeView's React component is NOT available to a child NodeView's React component, even though the ProseMirror document tree has a parent-child relationship.

---

## 2. TipTap Issue #6427: React Context Not Propagating in Nested Nodes

**Claim:** This is the canonical bug report for the context propagation problem. When a parent TipTap node provides a React Context and a child node consumes it, the child fails with a context-not-found error. The specific example uses Radix UI's Accordion.

**Confidence:** HIGH (open issue, confirmed by multiple reporters)

**Evidence:**
- [GitHub: ueberdosis/tiptap#6427](https://github.com/ueberdosis/tiptap/issues/6427) -- Filed with title "React Context Not Propagating Correctly in Nested Custom Tiptap Nodes"
- Error: `AccordionItem must be used within Accordion` -- Radix's context validation throws because the AccordionItem NodeView cannot find the Accordion context provider from the parent Accordion NodeView.
- Root cause analysis from the reporter: "Tiptap's node view rendering may initialize child node views before the parent node view, preventing proper React context propagation."
- Status: OPEN, no official fix or workaround from TipTap maintainers.

**Implication:** This is exactly our problem. The Accordion example maps directly to our Tabs/TabPanel compound component requirement. The issue confirms that:
1. TipTap's portal system does not preserve parent-child context relationships between NodeViews.
2. The initialization order (ProseMirror walks the document tree synchronously and creates all NodeViews before React renders any of them) means React providers in parent NodeViews are not available during child NodeView initialization.
3. No built-in solution exists in TipTap.

---

## 3. TipTap Issue #6547: Context Doesn't Work with Nested Elements in NodeViews

**Claim:** Follow-up bug report confirming the same problem. Notes that this is "quite critical" because many UI libraries (Radix, Chakra, MUI) use context for compound component patterns.

**Confidence:** HIGH

**Evidence:**
- [GitHub: ueberdosis/tiptap#6547](https://github.com/ueberdosis/tiptap/issues/6547) -- Filed with title "React context don't work with nested elements in NodeViews"
- Reporter's hypothesis: "Tiptap creates a portal with a wrapper and the component itself, and it, in turn, is not tied to the parent element in any way."
- Impact assessment: "This is quite critical because many UI libraries depend on this approach to customize nodes and marks."
- Status: OPEN as of July 2025, no response from TipTap maintainers.

**Implication:** The community recognizes this as a fundamental architectural limitation, not a bug that can be fixed with a simple patch. The "not tied to the parent element" observation confirms the flat portal architecture described in finding #1.

---

## 4. TipTap Issue #2986: Additional Props for ReactNodeViewRenderer

**Claim:** Long-standing request to pass additional props (including context values) to ReactNodeViewRenderer components. Partially addresses the context problem by allowing data injection from the extension definition.

**Confidence:** HIGH

**Evidence:**
- [GitHub: ueberdosis/tiptap#2986](https://github.com/ueberdosis/tiptap/issues/2986) -- "Allow ReactNodeViewRenderer to receive additional props to pass down to rendered component"

**Implication:** Even if additional props were supported, this would not solve compound component context because the parent-child relationship is dynamic (determined by document structure) and context values change at runtime. Static prop injection at extension registration time cannot replace React Context.

---

## 5. TipTap Issue #1747: Nested NodeView Content Not Rendering Until Focus

**Claim:** A related rendering issue where content of deeper NodeViews does not render until the editor gains focus.

**Confidence:** HIGH

**Evidence:**
- [GitHub: ueberdosis/tiptap#1747](https://github.com/ueberdosis/tiptap/issues/1747) -- "(React) Content of nested NodeViews will not render until focus"

**Implication:** Further evidence of initialization order problems with nested NodeViews. The rendering delay suggests that TipTap's portal system does not eagerly render nested content, which compounds the context propagation problem.

---

## 6. TipTap Issue #6328: ReactNodeViewRenderer Unusable in RSC

**Claim:** TipTap's ReactNodeViewRenderer uses class components and context patterns incompatible with React Server Components.

**Confidence:** HIGH

**Evidence:**
- [GitHub: ueberdosis/tiptap#6328](https://github.com/ueberdosis/tiptap/issues/6328) -- "React Server Components: ReactNodeViewRenderer is unusable in RSC due to class components & context usage"

**Implication:** TipTap's React integration layer is architecturally dated. Any solution we build should use modern React patterns (hooks, function components, `useSyncExternalStore`) rather than depending on TipTap's internal context system.

---

## 7. TipTap Discussion #3496: State Management with NodeViews

**Claim:** Community discussion about using external state management (Zustand) with NodeView components. The Zustand store is empty on first render, suggesting the same initialization order problem.

**Confidence:** MEDIUM (discussion unanswered)

**Evidence:**
- [GitHub: ueberdosis/tiptap#3496](https://github.com/ueberdosis/tiptap/discussions/3496) -- "working with react state management" -- Zustand state empty on first render in NodeView components.
- No solutions provided in the discussion.

**Implication:** External state managers (Zustand, Jotai) could bypass React Context entirely, but they face the same initialization timing issue. The root problem is that ProseMirror creates NodeViews synchronously and React renders them asynchronously -- state populated during React render is not available during ProseMirror initialization.

---

## 8. TipTap's Official Recommendation: Wrap EditorContent with Provider

**Claim:** TipTap's official recommendation for using React Context with NodeViews is to wrap the `EditorContent` component with the context provider. This makes the context available to ALL NodeViews, but does NOT solve parent-child context between NodeViews.

**Confidence:** HIGH

**Evidence:**
- [TipTap React NodeView docs](https://tiptap.dev/docs/editor/extensions/custom-extensions/node-views/react) -- "To use React context within a NodeView, you need to wrap the EditorContent component with the context provider."
- This pattern works for global context (theme, user, editor state) but does NOT work for compound component context where the provider is INSIDE a NodeView.

**Implication:** TipTap's recommendation solves a different problem (global context access from NodeViews). For compound components, the provider must be INSIDE the parent NodeView, not above `EditorContent`. TipTap has no solution for this case.

---

## 9. TipTap's Composable API (`<Tiptap>` component)

**Claim:** TipTap v3 introduced a declarative `<Tiptap>` component that acts as a root provider via `EditorContext`. This provides the editor instance to all child components but does NOT solve inter-NodeView context.

**Confidence:** HIGH

**Evidence:**
- [TipTap Composable API](https://tiptap.dev/docs/guides/react-composable-api) -- "`<Tiptap>` is the root provider that makes the editor instance available to all child components via React context."
- `useTiptap` hook for accessing the editor from any component in the tree.

**Implication:** The composable API confirms TipTap is moving toward a more React-idiomatic architecture, but the portal system for NodeViews remains unchanged. The `EditorContext` is a global context, not a per-NodeView context.

---

## 10. ProseMirror Forum: NodeView Context via Decorations

**Claim:** The ProseMirror community uses decorations as a channel to pass context information from plugins to NodeViews. The decoration's `spec` object carries arbitrary data that NodeViews receive in their `update(node, decorations)` method.

**Confidence:** HIGH (recommended by ProseMirror creator Marijn Haverbeke)

**Evidence:**
- [discuss.prosemirror.net: Setting up a NodeView that needs context](https://discuss.prosemirror.net/t/setting-up-a-nodeview-that-needs-context/843) -- Marijn: "the parent can get modified and your node view won't get an update call unless it itself was changed." Recommends deferring context-dependent logic or using decorations.
- [discuss.prosemirror.net: How can I communicate from a plugin to a custom nodeView?](https://discuss.prosemirror.net/t/how-can-i-communicate-from-a-plugin-to-a-custom-nodeview/952) -- Decorations with `spec` data are the recommended communication channel from plugins to NodeViews.

**Implication:** Decorations are a ProseMirror-native context channel that works synchronously during the render cycle. A plugin could compute compound component relationships from the document tree and apply decorations to child nodes indicating their parent's identity and state. The NodeView's `update()` method would receive these decorations and could use them to look up the parent's shared state from a central registry. This is a viable alternative to React Context for the data-flow aspect, though it cannot propagate React Context providers.

---

## 11. ProseMirror Forum: Nested NodeViews with Rich Text Fields

**Claim:** ProseMirror supports two patterns for nested content: (1) `contentDOM` for inline children managed by ProseMirror, and (2) nested ProseMirror instances for independent rich text fields within a NodeView.

**Confidence:** HIGH

**Evidence:**
- [discuss.prosemirror.net: NodeViews with nested, first class rich text fields](https://discuss.prosemirror.net/t/nodeviews-with-nested-first-class-rich-text-fields/3525) -- Two approaches discussed:
  1. `contentDOM`: ProseMirror manages children, context flows through the document tree
  2. Nested instances: Separate ProseMirror editors, transactions dispatched between inner and outer views
- [ProseMirror codemirror example](https://prosemirror.net/examples/codemirror/) -- Reference implementation for nested editors
- [ProseMirror footnote example](https://prosemirror.net/examples/footnote/) -- Small nested PM editors for contained content

**Implication:** For compound components like Tabs, the `contentDOM` approach is correct -- the TabPanel children should be managed by ProseMirror through the document tree, not as separate editor instances. This means the Tabs node defines `content: 'tabPanel+'` and uses `contentDOM` to let ProseMirror handle the children. The context propagation problem then becomes: how does the TabPanel NodeView know about its parent Tabs NodeView's state (active tab, etc.)?

---

## 12. ProseMirror Forum: Parent ViewDesc Resolution

**Claim:** Getting the parent NodeView from within a child NodeView is difficult because `getPos()` returns undefined during initialization, and there is no direct API to access the parent ViewDesc.

**Confidence:** HIGH

**Evidence:**
- [discuss.prosemirror.net: How to resolve parent ViewDesc in a custom NodeView generator?](https://discuss.prosemirror.net/t/how-to-resolve-parent-viewdesc-in-a-custom-nodeview-generator/549) -- "the descObj doesn't exist when the function is called (getPos returns undefined)"
- Workaround: recursive document search after initialization to find the parent node.

**Implication:** ProseMirror does not provide a native parent-child communication channel between NodeViews at initialization time. Any solution must be deferred until after initialization (via `update()` calls) or use a side channel (decorations, central registry, or React state management).

---

## 13. ProseMirror Forum: Plugin-to-NodeView Communication

**Claim:** The recommended pattern for plugin-to-NodeView communication is through decorations. The plugin computes state, stores it in decoration specs, and NodeViews receive it in their `update()` method.

**Confidence:** HIGH

**Evidence:**
- [discuss.prosemirror.net: How can I communicate from a plugin to a custom nodeView?](https://discuss.prosemirror.net/t/how-can-i-communicate-from-a-plugin-to-a-custom-nodeview/952) -- Decorations as communication channel. Key detail: decoration positions must align precisely with node boundaries or `update()` won't fire.

**Implication:** A TipTap plugin could maintain a map of compound component relationships (which TabPanels belong to which Tabs node) and communicate state changes via decorations. This avoids React Context entirely but requires a ProseMirror plugin to be the source of truth for compound component state.

---

## 14. No Community TipTap Extensions for Compound Components

**Claim:** No published TipTap extensions (tiptap-extension-*) implement compound component patterns like Tabs or Accordion.

**Confidence:** HIGH (exhaustive search)

**Evidence:**
- Web search for "tiptap-extension compound component accordion tabs nested" returned zero relevant packages.
- [TipTap Extensions docs](https://tiptap.dev/docs/editor/extensions/overview) -- Official extensions include Table (which has a parent-child structure: table > tableRow > tableCell) but no compound UI components.
- [TipTap Functionality extensions](https://tiptap.dev/docs/editor/extensions/functionality) -- No Tabs, Accordion, or similar compound components.

**Implication:** We are in uncharted territory for the TipTap ecosystem. The Table extension is the closest prior art -- it has a parent-child-grandchild node structure -- but it does not use React Context for inter-node communication (it uses ProseMirror's built-in table handling via prosemirror-tables).

---

## 15. TipTap's BubbleMenu/FloatingMenu: Do They Hit This Problem?

**Claim:** BubbleMenu and FloatingMenu are rendered as portals outside the editor DOM but do NOT face the context propagation problem because they are NOT NodeViews -- they are standalone React components that access the editor via `EditorContext`.

**Confidence:** HIGH

**Evidence:**
- [TipTap React Integration (DeepWiki)](https://deepwiki.com/ueberdosis/tiptap/4.1-react-integration) -- "Multiple menu instances avoid collisions through stable per-instance pluginKey generation."
- BubbleMenu and FloatingMenu use `tippy.js` for positioning and React portals for rendering, but they access the editor's global context, not per-node context.

**Implication:** Not relevant to our problem. Menus are global UI that interacts with the selection, not compound components that need parent-child context within the document structure.

---

## 16. TipTap Table Extension: Closest Structural Prior Art

**Claim:** TipTap's Table extension is the only built-in extension with a compound parent-child-grandchild structure (table > tableRow > tableCell > tableHeader). It does NOT use React Context between these nodes.

**Confidence:** HIGH

**Evidence:**
- Table uses `prosemirror-tables` which manages the parent-child relationship through ProseMirror's document model and schema constraints (`content: 'tableRow+'`).
- Cell merging, column/row operations, etc. are implemented via ProseMirror commands that operate on the document tree, not via React component communication.

**Implication:** The Table extension validates that compound structures work in ProseMirror/TipTap at the schema level. The missing piece is React-level state sharing (active tab, expanded accordion panel) which Table does not need because it has no interactive UI state beyond what's in the document.

---

## Summary: The Gap in TipTap

| Aspect | Status |
|--------|--------|
| Schema-level parent-child nodes | WORKS (Table proves it) |
| ContentDOM for managed children | WORKS (standard ProseMirror) |
| React Context from host to all NodeViews | WORKS (wrap EditorContent) |
| React Context from parent NodeView to child NodeView | BROKEN (issues #6427, #6547) |
| Inter-NodeView communication via decorations | POSSIBLE (ProseMirror pattern) |
| Published compound component extensions | NONE EXIST |
| Official TipTap fix planned | NO (issues unresponded) |

**The architectural root cause:** TipTap renders all NodeViews as flat sibling portals in the `Portals` component. The ProseMirror document tree has hierarchy, but the React rendering tree does not. This is a deliberate architectural choice (flat portals are simpler and more performant) but it prevents React Context propagation between parent and child NodeViews.

**Viable solution paths from prior art:**

1. **Registry pattern (FluentUI-inspired):** A central store (outside React) where parent NodeViews register their state and child NodeViews subscribe. The store is keyed by some identifier derivable from both parent and child (e.g., ProseMirror node position, or a stable ID attr).

2. **Decoration-based context (ProseMirror-native):** A plugin computes compound component relationships from the document tree and pushes state to child NodeViews via decoration specs. Works synchronously during ProseMirror's render cycle.

3. **Hybrid:** Registry for React state management + decorations for ProseMirror-level signaling. Parent NodeView registers state in the registry on mount/update. A ProseMirror plugin applies decorations to children indicating their parent's registry key. Child NodeView reads the registry key from its decoration and subscribes to the registry for React state.
