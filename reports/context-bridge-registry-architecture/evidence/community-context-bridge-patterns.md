# Community Context Bridge Patterns

Evidence file for D2: React community patterns, npm packages, and editor ecosystem solutions for propagating React Context across portal/renderer boundaries.

---

## 1. React's Built-in Portal Context Propagation

**Claim:** React's `createPortal` preserves context propagation by design. Portaled content remains in the React component tree even though it renders to a different DOM node.

**Confidence:** HIGH (documented by React core team)

**Evidence:**
- [React docs: createPortal](https://react.dev/reference/react-dom/createPortal) -- "The JSX you render into a portal acts as a child node of the React component that renders it, and the child can access the context provided by the parent tree."
- [React legacy docs: Portals](https://legacy.reactjs.org/docs/portals.html) -- Events fired from inside a portal propagate to ancestors in the containing React tree, even if those elements are not ancestors in the DOM tree.

**Implication:** The TipTap context problem is NOT a limitation of React portals per se. It is a limitation of how TipTap's `ReactNodeViewRenderer` creates and manages its portal lifecycle -- specifically, the initialization order of sibling NodeViews means child NodeViews may mount before their parent's React provider renders.

---

## 2. The "Context Bridge" Pattern (Custom Renderers)

**Claim:** When a custom React renderer (e.g., PixiJS, react-three-fiber, react-native) creates a separate reconciler tree, React Context from the host tree is NOT automatically available. The community-standard solution is a "Context Bridge" component that consumes context in the host tree and re-provides it inside the custom renderer.

**Confidence:** HIGH (documented pattern, used in production by PixiJS React)

**Evidence:**
- [PixiJS React Context Bridge](https://react.pixijs.io/7.x/context-bridge/) -- Canonical implementation:
  ```tsx
  const ContextBridge = ({ children, Context, render }) => (
    <Context.Consumer>
      {(value) => render(
        <Context.Provider value={value}>{children}</Context.Provider>
      )}
    </Context.Consumer>
  );
  ```
- [PixiJS React GitHub: ContextBridge.mdx](https://github.com/inlet/react-pixi/blob/master/ContextBridge.mdx) -- "React's custom renderers cannot access parent contexts in child components. The workaround is to use a Context Bridge."

**Implication:** This pattern is DIRECTLY relevant to TipTap NodeViews. TipTap's `ReactNodeViewRenderer` uses a portal-based rendering system that disconnects NodeView React trees from each other. A Context Bridge that captures context above `EditorContent` and re-provides it inside each NodeView's portal would solve the parent-child context propagation problem. However, the PixiJS pattern bridges across ONE renderer boundary -- our problem requires bridging across MULTIPLE sibling portals that need to share context with each other (not just with the host tree).

---

## 3. npm Package: `react-context-bridge`

**Claim:** A published npm package exists for this pattern.

**Confidence:** MEDIUM (package exists but low adoption)

**Evidence:**
- [npm: react-context-bridge](https://www.npmjs.com/package/react-context-bridge) -- Package exists. The npm page returned a 403 when fetching details, suggesting it may be unpublished or very low traffic.

**Implication:** Not a viable dependency. The pattern is simple enough to implement inline. The PixiJS implementation is the de facto reference.

---

## 4. npm Package: `@radix-ui/react-portal`

**Claim:** Radix UI's Portal component uses React's `createPortal` and relies on React's built-in context propagation. It does NOT implement a custom context bridge.

**Confidence:** HIGH

**Evidence:**
- [Radix Portal docs](https://www.radix-ui.com/primitives/docs/utilities/portal) -- "Renders any React subtree outside of your App, appending to document.body by default."
- [npm: @radix-ui/react-portal](https://www.npmjs.com/package/@radix-ui/react-portal)

**Implication:** Radix compound components (Accordion, Tabs, Dialog) rely on React's tree-based context propagation. When Radix components are rendered inside TipTap NodeViews, the NodeView portal system breaks the React tree hierarchy between parent and child NodeViews, which is why `AccordionItem must be used within Accordion` errors occur (TipTap issue #6427).

---

## 5. npm Package: `@fluentui/react-portal-compat-context`

**Claim:** FluentUI ships a portal compatibility context specifically for bridging context between different versions of FluentUI rendered in portals.

**Confidence:** HIGH

**Evidence:**
- [npm: @fluentui/react-portal-compat-context](https://www.npmjs.com/package/@fluentui/react-portal-compat-context)
- [GitHub PR #22541](https://github.com/microsoft/fluentui/pull/22541) -- Implements portal compat for v8 and v0 components.
- Pattern: `PortalCompatContextProvider` provides a registration callback; `usePortalCompat()` consumes it. When a portal element is created, it is registered via the callback, enabling cross-version context sharing.

**Implication:** FluentUI's approach is a registry pattern -- portal elements register themselves with a central coordinator. This is architecturally similar to what we need: a central registry where parent NodeViews register their context, and child NodeViews look up their parent's context by walking the ProseMirror document tree.

---

## 6. npm Package: `use-context-selector`

**Claim:** `use-context-selector` (by Daishi Kato) provides selective context subscription AND a `BridgeProvider` for cross-root context propagation.

**Confidence:** HIGH

**Evidence:**
- [npm: use-context-selector](https://www.npmjs.com/package/use-context-selector)
- [GitHub: dai-shi/use-context-selector](https://github.com/dai-shi/use-context-selector) -- Provides `BridgeProvider` and `useBridgeValue` for bridging multiple React roots.

**Implication:** The `BridgeProvider` pattern is relevant but solves a different shape of the problem -- it bridges context between separate `createRoot()` calls (multiple React roots). TipTap NodeViews are portals within a single React root, so the problem is not cross-root but cross-portal initialization order.

---

## 7. React RFC: Cross-Renderer Portals (facebook/react#13332)

**Claim:** React has an open, unresolved feature request for cross-renderer portals that would enable context propagation across custom renderers (e.g., React DOM -> React Native). The feature has NOT been implemented.

**Confidence:** HIGH

**Evidence:**
- [GitHub: facebook/react#13332](https://github.com/facebook/react/issues/13332) -- Filed August 2018 by the React core team. Status: OPEN with no assignees.
- Key quote: "Nested renderers like react-art can't read the context of the outer renderers."
- Unresolved architectural question: "When renderers have incompatible Fiber implementations, whose implementation takes charge?"

**Implication:** React itself has no built-in solution for cross-renderer context. This validates that the Context Bridge pattern (consuming + re-providing) is the only viable approach. Our problem is simpler (same renderer, portals within one tree) but structurally equivalent in terms of context isolation.

---

## 8. Editor Ecosystem: MDXEditor (Lexical-based)

**Claim:** MDXEditor solves compound MDX components via `NestedLexicalEditor` -- a component that creates a nested Lexical editor instance inside a JSX component's slot. It does NOT use a context bridge pattern; instead it uses Lexical's native nested editor support.

**Confidence:** HIGH

**Evidence:**
- [MDXEditor JSX docs](https://mdxeditor.dev/editor/docs/jsx) -- "The jsxPlugin allows you to process and associate custom editors with the JSX components in your markdown source."
- [MDXEditor NestedLexicalEditor API](https://mdxeditor.dev/editor/api/functions/NestedLexicalEditor) -- Accepts `getContent` and `getUpdatedMdastNode` callbacks for bidirectional sync.
- [MDXEditor extending docs](https://mdxeditor.dev/editor/docs/extending-the-editor) -- Uses Gurx (graph-based reactive state management) instead of React Context for cross-component communication.

**Implication:** MDXEditor avoids the context bridge problem entirely by using Lexical's built-in nested editor model. Lexical creates nested `LexicalComposer` instances where each has its own state, but the parent coordinates via `rootEditor$` / `activeEditor$` signals. This is NOT portable to ProseMirror/TipTap -- ProseMirror does not have a native nested editor primitive (it has NodeViews with `contentDOM`, which is a different model).

---

## 9. Editor Ecosystem: Lexical (Facebook)

**Claim:** Lexical supports nested editors natively. Each nested editor is a separate `LexicalComposer` with its own state, coordinated by the parent through explicit state management (not React Context).

**Confidence:** MEDIUM (inferred from MDXEditor's usage; Lexical docs don't explicitly document compound component patterns)

**Evidence:**
- [Lexical docs](https://lexical.dev/) -- Plugin-based architecture with `LexicalComposer` as the root.
- MDXEditor's `NestedLexicalEditor` demonstrates the pattern in production.

**Implication:** Lexical's model is "nested independent editors" rather than "one editor with compound NodeViews that share context." This avoids the context bridge problem but at the cost of complexity in synchronizing state between editors.

---

## 10. Editor Ecosystem: Plate (Slate-based)

**Claim:** Plate uses Slate's recursive node model where nested blocks are first-class children. Context flows naturally through React's tree because Slate renders the entire document as a React tree (no portals, no NodeViews).

**Confidence:** MEDIUM

**Evidence:**
- [Plate docs](https://platejs.org/docs) -- Plugin components are rendered inline in the React tree.
- [Plate Plugin Components](https://platejs.org/docs/plugin-components) -- Components share a "composable interface, compatible with shadcn/ui."
- For compound plugins like `CodeBlockPlugin`, `override.components` configures sub-components (`code_block`, `code_line`, `code_syntax`).

**Implication:** Slate/Plate does not have the portal isolation problem because its rendering model keeps everything in one React tree. The tradeoff is performance: every node re-render bubbles through React's tree. ProseMirror's NodeView model provides better isolation but at the cost of context propagation.

---

## 11. Editor Ecosystem: BlockNote (TipTap/ProseMirror-based)

**Claim:** BlockNote (built on TipTap) supports nested blocks (Notion-style indentation) and custom blocks via React components. It does NOT appear to support compound component patterns (parent+child nodes sharing context).

**Confidence:** MEDIUM

**Evidence:**
- [BlockNote docs: Document Structure](https://www.blocknotejs.org/docs/editor-basics/document-structure) -- "Blocks can contain nested (child) blocks."
- [BlockNote docs: Custom Blocks](https://www.blocknotejs.org/docs/features/custom-schemas/custom-blocks) -- Custom blocks are defined with React render functions.
- [BlockNote GitHub](https://github.com/TypeCellOS/BlockNote) -- No issues or discussions about compound component context.

**Implication:** BlockNote inherits TipTap's portal-based NodeView architecture and likely has the same context propagation limitations. Its nesting model is structural (indent/outdent) rather than semantic (Tabs containing TabPanel).

---

## 12. Editor Ecosystem: TinaCMS

**Claim:** TinaCMS handles MDX components through a configuration-driven approach where component schemas are defined in the TinaCMS config, and a visual block selector renders editing UI. It does NOT use compound components with shared context in the editor.

**Confidence:** MEDIUM

**Evidence:**
- [TinaCMS MDX support](https://tina.io/blog/tina-supports-mdx) -- Components are configured via schema definitions with `fields` arrays.
- [TinaCMS blocks editing](https://tina.io/docs/editing/blocks) -- Visual block selector with component images.
- [TinaCMS issue #2580](https://github.com/tinacms/tinacms/issues/2580) -- "issues editing MDX file with single container components" -- indicates container/compound component support is incomplete.

**Implication:** TinaCMS sidesteps the compound component problem by treating each MDX component as an independent block with a flat props editor. No parent-child context sharing is needed because the editing UI is detached from the document structure.

---

## 13. Visual Builders: Plasmic

**Claim:** Plasmic solves compound components via `allowedComponents` slot constraints and `DataProvider` context propagation. It has a first-class compound component model.

**Confidence:** HIGH

**Evidence:**
- [Plasmic code components ref](https://docs.plasmic.app/learn/code-components-ref/) -- `allowedComponents` on slots constrains which children can be inserted (e.g., Menu only accepts MenuItem).
- [Plasmic Global Contexts](https://docs.plasmic.app/learn/global-contexts/) -- React Context providers registered as "global contexts" are available to all pages and components.
- Pattern: `parentComponentName` organizes components hierarchically in the Studio UI; `DataProvider` passes data via React Context to slot children.

**Implication:** Plasmic's approach is the closest to what we need architecturally. The key insight is that Plasmic uses a REGISTRY of component relationships (parent declares allowed children, children declare their parent) combined with React Context for runtime data flow. The slot/allowedComponents pattern enforces structural validity at design time, while DataProvider/React Context handles runtime state. However, Plasmic controls the entire rendering pipeline -- it does not need to work within ProseMirror's DOM ownership model.

---

## 14. Visual Builders: Storybook

**Claim:** Storybook handles context for isolated component rendering via decorators that wrap stories in providers. It does not solve the compound component context problem.

**Confidence:** HIGH

**Evidence:**
- [Storybook docs: Build pages](https://storybook.js.org/docs/writing-stories/build-pages-with-storybook) -- "Decorators can wrap stories in providers."
- [storybook-react-context addon](https://storybook.js.org/addons/storybook-react-context) -- Allows manipulating React context inside Storybook.
- [Storybook compound components discussion #25552](https://github.com/storybookjs/storybook/discussions/25552) -- Community discussion about compound component stories.

**Implication:** Not directly relevant to our problem. Storybook's decorator pattern is about providing context to isolated component stories, not about propagating context between components in a tree.

---

## 15. The "Portals with Context" Pattern (React Training)

**Claim:** The "portals with context" pattern uses a single React root with multiple DOM mount points, connected by a shared context provider. Components in different portal locations communicate through the shared context.

**Confidence:** HIGH

**Evidence:**
- [React Training: Portals with Context](https://reacttraining.com/blog/portals-with-context) -- Pattern: single React app with shared `AppState` context, multiple `createPortal` targets. Components in different DOM locations share state through context.

**Implication:** This pattern works when all portaled components are descendants of a single context provider. The TipTap problem is that NodeView portals are created dynamically and their initialization order is controlled by ProseMirror (not React), so a parent NodeView's provider may not exist when its child NodeViews mount.

---

## Summary: Pattern Taxonomy

| Pattern | How it works | Solves our problem? |
|---------|-------------|---------------------|
| React `createPortal` | Preserves context automatically | NO -- TipTap's issue is initialization order, not portal semantics |
| PixiJS Context Bridge | Consume + re-provide across renderer boundary | PARTIALLY -- bridges host-to-renderer, not sibling-to-sibling |
| FluentUI Portal Compat | Registration callback + central coordinator | YES (architecturally) -- registry pattern matches our need |
| `use-context-selector` BridgeProvider | Bridge context across separate React roots | NO -- our portals are in one root |
| Lexical nested editors | Independent editor instances, explicit state sync | DIFFERENT ARCHITECTURE -- not portable to ProseMirror |
| Slate/Plate inline rendering | Single React tree, no portals | AVOIDS THE PROBLEM -- but has performance tradeoffs |
| Plasmic registry + DataProvider | Component registry + React Context | YES (conceptually) -- registry + context is the right model |
| ProseMirror decorations | Decorations as context channel | PARTIALLY -- data-only, no React Context |

**The gap:** No existing package or pattern directly solves "propagate React Context between sibling NodeView portals in a ProseMirror/TipTap editor where initialization order is controlled by the document tree walker, not React." The closest prior art is FluentUI's portal-compat registry and Plasmic's component registry, both of which use a central coordinator that components register with and query from.
