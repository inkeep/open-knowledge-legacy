# pr23-rebase Worktree Status — Container Component Handling

**Location:** `/Users/edwingomezcuellar/projects/open-knowledge/.claude/worktrees/pr23-rebase/`

## What exists

### JsxComponentView.tsx (extensions/JsxComponentView.tsx)
Registry-driven React NodeView for `jsxComponentEditable` nodes:
- Looks up component in `componentMap` (line 139: `const RenderedComponent = componentMap[componentName]`)
- Renders `<RenderedComponent {...primitiveProps}><NodeViewContent className="component-children" /></RenderedComponent>` (lines 181-183)
- `ComponentErrorBoundary` wraps the render — crashes show error UI instead of breaking the editor
- `PropPanel` shown when selected — mousedown isolation prevents PM deselection
- `UnregisteredFallback` for components not in manifest
- Button wrapper with `onClick` → `setNodeSelection(getPos())` for non-atom node selection

### JsxComponentVoidView.tsx (extensions/JsxComponentVoidView.tsx)
Fallback for unregistered components — raw JSX display via `UnregisteredFallback`.

### componentMap.ts (components/componentMap.ts)
Imports ALL fumadocs P0 components directly:
```typescript
import { Accordion, Accordions } from 'fumadocs-ui/components/accordion';
import { Banner } from 'fumadocs-ui/components/banner';
import { Callout } from 'fumadocs-ui/components/callout';
import { Card, Cards } from 'fumadocs-ui/components/card';
import { File, Files, Folder } from 'fumadocs-ui/components/files';
import { ImageZoom } from 'fumadocs-ui/components/image-zoom';
import { InlineTOC } from 'fumadocs-ui/components/inline-toc';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import { TypeTable } from 'fumadocs-ui/components/type-table';
```

Also includes `@inkeep/docskit/mdx` components (CodeGroup, Frame, Video) and local components (Audio, Mermaid).

### jsx-component.ts (extensions/jsx-component.ts)
Extends core `jsxComponentEditable` and `jsxComponentVoid` with React NodeView renderers via `ReactNodeViewRenderer`.

### Tests found
- `ComponentToolbar.test.ts` — toolbar badge rendering
- `PropPanel.test.ts` — prop panel rendering
- `component-items.test.ts` — slash command items for components
- **NO tests for container component rendering behavior**
- **NO tests for fumadocs context requirements**
- **NO tests for CSS styling in editor**

## What does NOT exist

1. **No container-specific handling.** JsxComponentView renders ALL components identically: `<Component {...primitiveProps}><NodeViewContent /></Component>`. No special cases for Tabs, Accordion, etc.
2. **No context provider shims.** No `FrameworkProvider` wrapping. No Radix context providers.
3. **No fumadocs CSS imports.** `globals.css` has zero fumadocs references.
4. **No tab-switching, accordion-toggling, or any interactive behavior.** The editor just renders the component with its props and children.
5. **No tests verifying container components actually render correctly.** The error boundary catches crashes but nobody has verified what renders.

## Architecture pattern

The pr23-rebase implementation follows the spec's §9.7 pattern:
```
NodeViewWrapper
├── button (selection target)
│   └── ComponentToolbar (name badge)
├── ComponentErrorBoundary
│   └── RenderedComponent {...primitiveProps}
│       └── NodeViewContent (PM children placeholder)
└── PropPanel (when selected)
```

This is a **one-size-fits-all** approach. It works for:
- ✅ Leaf components (Callout, Banner) — children are inline content
- ✅ Simple containers (Steps, Cards, Files) — children pass through
- ⚠️ Context-dependent containers (Tabs, Accordion) — context chain works through NodeViewWrapper BUT children structure matters

## Key observation

The `NodeViewContent` renders ALL children of the PM node as a single block. For containers like `<Tabs>`, the Tabs component receives NodeViewContent which contains ALL tab panels as its children. The Tab components inside NodeViewContent call `useTabContext()` and it should work because Tabs wraps them via React context.

**BUT:** The ProseMirror node model means the children are `jsxComponentEditable` nodes (Tab, Accordion, etc.), each with their own NodeViewWrapper. So the actual DOM tree is:

```
<Tabs items={[...]}>        ← from JsxComponentView
  <NodeViewContent>          ← PM children placeholder
    <NodeViewWrapper>        ← first child's NodeView
      <Tab value="...">     ← actual Tab component
        <NodeViewContent>   ← Tab's children
          ...content...
        </NodeViewContent>
      </Tab>
    </NodeViewWrapper>
    <NodeViewWrapper>        ← second child's NodeView
      <Tab value="...">
        <NodeViewContent>
          ...content...
        </NodeViewContent>
      </Tab>
    </NodeViewWrapper>
  </NodeViewContent>
</Tabs>
```

This is actually the CORRECT nesting! Tab components receive TabsContext through the React tree, regardless of intervening DOM wrappers.

## Confidence: HIGH (on what exists), HIGH (on what's missing)
