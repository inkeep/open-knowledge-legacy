# Context Bridge Registry Architecture

**Report for:** Component Blocks v2 spec — propagating React Context across TipTap NodeView portal boundaries for fumadocs/Radix compound components.

**Date:** 2026-04-14
**Versions:** React 19.2.x, @tiptap/react 3.22.3, @radix-ui/react-context 1.1.2, fumadocs-ui (latest)
**Confidence labels:** HIGH = code-verified or official docs, MEDIUM = inferred from evidence, LOW = educated guess

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Verified React Behavior](#2-verified-react-behavior)
3. [Prior Art Survey](#3-prior-art-survey)
4. [Radix Context Internals](#4-radix-context-internals)
5. [Alternative Architectures Ranked](#5-alternative-architectures-ranked)
6. [Recommended Architecture + Rationale](#6-recommended-architecture--rationale)
7. [Reference Implementation](#7-reference-implementation)
8. [Compound Component contextPublisher Specs](#8-compound-component-contextpublisher-specs)
9. [Testing Strategy](#9-testing-strategy)
10. [Risks + Mitigations](#10-risks--mitigations)
11. [Estimated Effort](#11-estimated-effort)
12. [Spec Amendments Recommended](#12-spec-amendments-recommended)
13. [What This Research Did NOT Cover](#13-what-this-research-did-not-cover)

---

## 1. Executive Summary

TipTap renders all React NodeViews as **flat sibling portals** under a single `<Portals>` fragment component (`EditorContent.tsx:25-35`). A `Record<string, ReactPortal>` store holds every NodeView; `Object.values(renderers)` renders them as siblings in the React tree. This means a parent NodeView's `<Context.Provider>` is invisible to child NodeViews — they are React siblings, not parent-child — even though the underlying ProseMirror document tree preserves the nesting.

This is a **known, unsolved upstream problem** (TipTap issues #6427, #6547 — both open, unresponded). React's own cross-renderer context propagation RFC (#13332, filed 2018 by Dan Abramov) remains unresolved. No React API — `useContext`, `use()`, `createPortal` — can subscribe to context from a specified tree location. The community has independently invented the same workaround pattern in PixiJS React, FluentUI portal-compat, react-babylonjs, and `@react-three/drei`: **consume context in the providing tree, pass it through an external channel, re-provide it in the consuming tree**.

We evaluated seven architectures (A–G). **Option A — Context Bridge Registry** — is the clear winner:

- **~150–250 LoC** of pure-JS store + React hooks + integration wiring
- **No upstream coupling**: does not modify TipTap, ProseMirror, Radix, or fumadocs
- **CRDT-safe**: purely render-time; zero CRDT mutations
- **React Compiler compatible**: uses `useSyncExternalStore` (the recommended external store hook)
- **Testable**: the store is pure JS — unit-testable without any editor infrastructure
- **Scales**: each compound component type declares its own `contextPublisher` in the descriptor

The mechanism: parent NodeViews call `publishContexts(nodeId, contexts)` at render time, writing `{ ContextObject, value }` entries to an external Map. Child NodeViews call `useAncestorContexts(editor, getPos)`, which walks up the ProseMirror document tree via `$pos.node(depth)`, finds ancestor nodes with published contexts, reads from the store, and wraps children in `<Context.Provider value={...}>` for each bridged context. The store uses `useSyncExternalStore` subscriptions for O(1) re-renders after initial O(depth) ancestor lookup.

Per-component analysis: fumadocs **Tabs** requires bridging 3 contexts (Radix `TabsProvider` + fumadocs styled `TabsContext` + fumadocs unstyled `TabsContext`). Fumadocs **Accordion** requires bridging 1–2 Radix contexts (plus Radix Collection hook for keyboard nav — see §10 Risks). Fumadocs **Files/Folder** requires **no bridge** (each Folder is self-contained with local state). Radix **Collapsible** requires no bridge (stateless container).

---

## 2. Verified React Behavior

### 2.1 Portal context inheritance is React-tree-based (HIGH)

React portals inherit context from their **React-tree parent**, not their DOM-tree parent. This is unchanged in React 18 and 19.

> "A portal only changes the physical placement of the DOM node. In every other way, the JSX you render into a portal acts as a child node of the React component that renders it." — [react.dev/reference/react-dom/createPortal](https://react.dev/reference/react-dom/createPortal)

**Evidence:** `evidence/react-portal-context-semantics.md` Finding 1.

### 2.2 React 19 introduced no portal context changes (HIGH)

React 19 changes to context (`<Context>` shorthand, `use()` hook) do not alter portal context resolution. `use()` walks up the React tree identically to `useContext()`.

> "use returns the context value for the context you passed. To determine the context value, React searches the component tree and finds the closest context provider above for that particular context." — [react.dev/reference/react/use](https://react.dev/reference/react/use)

**Evidence:** `evidence/react-portal-context-semantics.md` Findings 2, 3.

### 2.3 TipTap renders all NodeViews as flat siblings (HIGH)

The `Portals` component in `@tiptap/react/src/EditorContent.tsx:25-35`:

```tsx
const Portals: React.FC<{ contentComponent: ContentComponent }> = ({ contentComponent }) => {
  const renderers = useSyncExternalStore(
    contentComponent.subscribe, contentComponent.getSnapshot, contentComponent.getServerSnapshot,
  )
  return <>{Object.values(renderers)}</>
}
```

`renderers` is `Record<string, ReactPortal>` — a flat map. Every NodeView is a sibling of every other NodeView in the React tree:

```
<PureEditorContent>
  <div ref={editorContentRef} />     ← ProseMirror DOM
  <Portals>
    <Portal key="a"> ParentNodeView   ← has <Context.Provider>
    <Portal key="b"> ChildNodeView    ← CANNOT see parent's provider
  </Portals>
</PureEditorContent>
```

**Evidence:** `evidence/react-portal-context-semantics.md` Finding 4.

### 2.4 No React API exists for cross-tree context subscription (HIGH)

React provides no mechanism for a component to consume context from an arbitrary tree location. React RFC #13332 ("Support cross-renderer portals") has been open since 2018 with no resolution.

**Evidence:** `evidence/react-portal-context-semantics.md` Finding 8.

### 2.5 This is a known, open TipTap bug (HIGH)

- **Issue #6427** — "React Context Not Propagating Correctly in Nested Custom Tiptap Nodes" (2025-06-07, open)
- **Issue #6547** — "React context don't work with nested elements in NodeViews" (2025-07-xx, open)

Both are unresponded by TipTap maintainers. No fix shipped as of v3.22.3.

**Evidence:** `evidence/tiptap-nested-nodeview-context.md` Findings 2, 3.

---

## 3. Prior Art Survey

### 3.1 Ecosystem context bridge patterns

| Library/Pattern | Mechanism | Relevance |
|---|---|---|
| **PixiJS React** (`@pixi/react`) | `ContextBridge`: `<Context.Consumer>` reads in host tree → re-provides in custom renderer | HIGH — same two-phase read/write pattern we need |
| **FluentUI** (`@fluentui/react-portal-compat-context`) | Registration callback + central coordinator for cross-version portal contexts | HIGH — registry pattern matches our architecture |
| **`@react-three/drei`** `useContextBridge` | Wrapper component re-provides consumed context inside `<Canvas>` (separate reconciler) | MEDIUM — bridges renderer boundary, not portal boundary |
| **`use-context-selector`** (`dai-shi`) | `BridgeProvider` for cross-`createRoot` context | LOW — cross-root, not cross-portal |
| **Plasmic** | `allowedComponents` slot constraints + `DataProvider` context propagation | HIGH (conceptual) — registry + context model |
| **`react-context-bridge`** (npm) | `ContextListeners` captures, `ContextProviders` re-provides | LOW — low adoption, simple enough to inline |

**Common pattern:** All solutions follow two phases: (1) **Read**: consume context in the providing tree, (2) **Write**: pass value through external channel and re-provide via `<Context.Provider>` in consuming tree.

**Evidence:** `evidence/community-context-bridge-patterns.md` Findings 2, 5, 13.

### 3.2 Editor ecosystem comparison

| Editor | Architecture | How compound components work | Context bridge needed? |
|---|---|---|---|
| **TipTap** (ours) | ProseMirror + flat React portals | **BROKEN** — sibling portals can't share context | YES |
| **BlockNote** | TipTap-based | Same limitation inherited | YES (if they tried) |
| **MDXEditor** | Lexical + `NestedLexicalEditor` | Independent nested editor instances, Gurx reactive state | NO — sidesteps via nested editors |
| **Plate** | Slate — single React tree, no portals | Context flows naturally through React tree | NO — no portal isolation |
| **TinaCMS** | Detached schema-driven editor | Each component is a flat block with props editor | NO — no compound structure |

**Key insight:** No editor in the ProseMirror/TipTap ecosystem has shipped compound components with context propagation. Slate/Plate avoids the problem architecturally (one React tree). Lexical/MDXEditor sidesteps it (nested editor instances). We are first-movers in the TipTap space.

**Evidence:** `evidence/tiptap-nested-nodeview-context.md` Finding 14; `evidence/community-context-bridge-patterns.md` Findings 8–12.

### 3.3 ProseMirror-native prior art

ProseMirror's creator (Marijn Haverbeke) recommends **decorations** as the channel from plugins to NodeViews. The `spec` object on decorations carries arbitrary data; NodeViews receive it in `update(node, decorations)`. This is a synchronous, ProseMirror-native context channel — but it carries data, not React Context providers.

**Evidence:** `evidence/tiptap-nested-nodeview-context.md` Findings 10, 13.

---

## 4. Radix Context Internals

### 4.1 `createContextScope` is standard React.createContext (HIGH)

`@radix-ui/react-context` `createContextScope` (line 20) creates a React Context per call and stores them in a `defaultContexts` array. The `scope` prop allows overriding which Context instance to use (for component composition like Tabs-inside-Dialog). Without scope override, it falls back to the `BaseContext` created by `React.createContext`.

The Provider renders `<Context.Provider value={...}>`. The consumer hook calls `React.useContext(Context)`. **100% standard React Context** — no custom subscription mechanism.

**Evidence:** `evidence/radix-context-internals.md`.

### 4.2 Radix scope composition for compound parents

The `__scopeTabs` prop carries a scope object that maps to specific React Context instances. When Tabs is used inside Dialog (composition), the scope ensures Tabs' context doesn't collide with Dialog's. For our bridge, we need to capture and re-provide the **correct scope-specific Context objects**, not just raw values.

### 4.3 Radix Collection hook — dual mechanism (HIGH)

`@radix-ui/react-collection` uses **both** React Context (for `itemMap` registration) **and** DOM queries (for ordering):

- Legacy: `querySelectorAll('[data-radix-collection-item]')` for DOM ordering
- V2: `OrderedDict` + `compareDocumentPosition` + `MutationObserver`

If Context is bridged, DOM ordering works natively because TipTap preserves DOM nesting via `contentDOM`.

**Evidence:** `evidence/radix-collection-hook-portal-behavior.md` Finding 1.

### 4.4 Per-component context inventory

| Component | Contexts to bridge | Collection hook? | Bridge complexity |
|---|---|---|---|
| **fumadocs Tabs** | 3: Radix `TabsProvider` + fumadocs styled `TabsContext` + fumadocs unstyled `TabsContext` | No | Medium |
| **fumadocs Accordion** | 1–2: Radix `AccordionRoot` + `AccordionItem` contexts | Yes (for keyboard nav) | Medium |
| **fumadocs Files/Folder** | 0 (each Folder is self-contained) | No | None |
| **Radix Collapsible** | 1 (local per Folder) | No | None |

**Evidence:** `evidence/radix-collection-hook-portal-behavior.md` Summary table.

---

## 5. Alternative Architectures Ranked

Seven architectures evaluated. Full comparison matrix in `evidence/alternative-architectures-comparison.md`.

| Rank | Architecture | LoC | CRDT safe? | Fumadocs compat? | Maintenance | Verdict |
|---|---|---|---|---|---|---|
| **1** | **A: Context Bridge Registry** | ~150–250 | Full | Yes | Low | **RECOMMENDED** |
| 2 | D: Global store + root Provider | ~100–150 | Full | Partial | Low | Converges on A with worse properties |
| 3 | E: PM plugin state | ~200–300 | Full | Partial | Medium | Unnecessary complexity vs A |
| 4 | C: Fork @tiptap/react | ~500+ | Full | Yes | Very High | Correct but unmaintainable |
| 5 | B: In-tree render | ~300–500 | Poor | No | High | Breaks CRDT model |
| 6 | G: Polling | ~100–200 | Full | Fragile | Low | Wrong pattern |
| 7 | F: Imperative refs | N/A | N/A | No | N/A | Infeasible |

**Why A wins over D:** Option D provides all contexts at the editor root, creating unnecessary re-render scope. As compound types grow, the root Provider becomes an expanding list of wrappers. Once you add per-instance keying (required for multiple Tabs instances), you've reinvented Option A with worse ergonomics. (MEDIUM confidence — architectural inference.)

**Why A wins over E:** PM plugin state is immutable per transaction. Bridging PM plugin state to React re-renders requires a separate subscription mechanism, effectively reinventing Option A's store. Plus O(n) doc walk per transaction is wasteful. (MEDIUM confidence — architectural inference.)

**Why B, C, F, G are eliminated:** B breaks `contentDOM`/CRDT model. C requires tracking every @tiptap/react release. F requires rewriting fumadocs/Radix to use refs. G is the wrong paradigm (polling vs. push). (HIGH confidence — all confirmed.)

**Evidence:** `evidence/alternative-architectures-comparison.md`.

---

## 6. Recommended Architecture + Rationale

### Context Bridge Registry (Option A)

**Mechanism:**

```
1. Parent NodeView renders → calls publishContexts(nodeId, contexts[])
   - Writes { ContextObject, value } entries to external Map store
   - nodeId is a stable PM node attr (editor-scoped incrementing ID)

2. Child NodeView renders → calls useAncestorContexts(editor, getPos)
   - Resolves $pos via editor.state.doc.resolve(getPos())
   - Walks $pos.node(depth) for depth = pos.depth-1 down to 0
   - For each ancestor, checks if store has entries for that node's ID
   - Wraps children in <Context.Provider value={bridgedValue}> per context

3. Store emits change events → useSyncExternalStore triggers re-renders

4. Parent unmounts → calls unpublishContexts(nodeId) in useEffect cleanup
```

**Why this wins:**

1. **Clean separation of concerns**: ProseMirror owns document structure, React owns rendering, the bridge is a thin coordination layer (~150–250 LoC)
2. **No upstream coupling**: does not modify TipTap, ProseMirror, Radix, or fumadocs source
3. **CRDT-safe**: purely render-time operation; never mutates Y.Doc or CRDT state
4. **React Compiler compatible**: `useSyncExternalStore` is the React team's recommended external store hook
5. **Testable**: the store is pure JS — unit-testable without editor infrastructure
6. **Scales**: each compound component type declares `contextPublisher` / `contextConsumer` in its descriptor
7. **Precedent**: same pattern used by PixiJS React, FluentUI portal-compat, react-babylonjs, `@react-three/drei`

**Node identity strategy:** Each `jsxComponent` node gets a stable `bridgeId` attr — an editor-scoped incrementing integer assigned at node creation. This survives CRDT operations (attrs are preserved through Y.XmlElement identity). The bridge store is keyed by `bridgeId`, not by PM position (positions shift during edits).

---

## 7. Reference Implementation

~250 lines of TypeScript. Three files: store, hooks, integration.

### 7.1 `context-bridge-store.ts` — Pure JS store (~60 LoC)

```typescript
/**
 * Context Bridge Store
 *
 * An external store (Map + event emitter) that holds React Context values
 * published by parent NodeViews, keyed by stable bridge ID.
 *
 * useSyncExternalStore-compatible: subscribe + getSnapshot pattern.
 */

type ContextEntry = {
  context: React.Context<any>
  value: any
}

type BridgeStore = {
  /** Parent NodeView publishes its context values */
  publish(bridgeId: string, entries: ContextEntry[]): void
  /** Parent NodeView cleans up on unmount */
  unpublish(bridgeId: string): void
  /** Read all entries for a given bridgeId */
  get(bridgeId: string): ContextEntry[] | undefined
  /** useSyncExternalStore-compatible subscribe */
  subscribe(callback: () => void): () => void
  /** useSyncExternalStore-compatible getSnapshot */
  getSnapshot(): number
}

function createContextBridgeStore(): BridgeStore {
  const entries = new Map<string, ContextEntry[]>()
  const listeners = new Set<() => void>()
  let version = 0

  function notify() {
    version++
    listeners.forEach(fn => fn())
  }

  return {
    publish(bridgeId, newEntries) {
      entries.set(bridgeId, newEntries)
      notify()
    },
    unpublish(bridgeId) {
      if (entries.delete(bridgeId)) notify()
    },
    get(bridgeId) {
      return entries.get(bridgeId)
    },
    subscribe(callback) {
      listeners.add(callback)
      return () => listeners.delete(callback)
    },
    getSnapshot() {
      return version
    },
  }
}
```

### 7.2 `use-context-bridge.ts` — React hooks (~100 LoC)

```typescript
import { use, useEffect, useSyncExternalStore, type ReactNode } from 'react'
import type { Editor } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'

/**
 * usePublishContexts — called by parent NodeView components.
 *
 * Publishes an array of { context, value } entries to the bridge store,
 * keyed by the node's stable bridgeId attr.
 */
function usePublishContexts(
  store: BridgeStore,
  bridgeId: string | undefined,
  entries: ContextEntry[],
): void {
  // Publish on every render (entries may have changed)
  if (bridgeId) {
    store.publish(bridgeId, entries)
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (bridgeId) store.unpublish(bridgeId)
    }
  }, [store, bridgeId])
}

/**
 * useAncestorContexts — called by child NodeView components.
 *
 * Walks up the ProseMirror document tree to find ancestor nodes that
 * have published contexts. Returns an array of ContextEntry[] to be
 * re-provided as <Context.Provider> wrappers.
 */
function useAncestorContexts(
  store: BridgeStore,
  editor: Editor,
  getPos: () => number | undefined,
): ContextEntry[] {
  // Subscribe to store changes (triggers re-render on publish/unpublish)
  useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)

  const pos = getPos()
  if (pos === undefined) return []

  const $pos = editor.state.doc.resolve(pos)
  const collected: ContextEntry[] = []

  // Walk from immediate parent to root
  for (let depth = $pos.depth - 1; depth >= 0; depth--) {
    const ancestorNode: PmNode = $pos.node(depth)
    const ancestorBridgeId = ancestorNode.attrs.bridgeId as string | undefined
    if (!ancestorBridgeId) continue

    const ancestorEntries = store.get(ancestorBridgeId)
    if (ancestorEntries) {
      // Prepend (innermost ancestor first for correct nesting order)
      collected.unshift(...ancestorEntries)
    }
  }

  return collected
}

/**
 * ContextBridgeProvider — wraps children in bridged context providers.
 *
 * Used by child NodeViews to re-provide ancestor contexts.
 */
function ContextBridgeProvider({
  entries,
  children,
}: {
  entries: ContextEntry[]
  children: ReactNode
}) {
  let result = children
  // Wrap from outermost to innermost
  for (const { context, value } of entries) {
    result = <context.Provider value={value}>{result}</context.Provider>
  }
  return result
}
```

### 7.3 Integration in `JsxComponentView.tsx` (~90 LoC additions)

```typescript
// In the NodeView component for jsxComponent blocks:

function JsxComponentNodeView({ node, editor, getPos }: NodeViewProps) {
  const descriptor = getDescriptor(node.attrs.name)
  const bridgeId = node.attrs.bridgeId as string | undefined
  const store = useContextBridgeStore(editor) // editor-scoped singleton

  // --- Parent side: publish contexts if this node is a compound parent ---
  if (descriptor?.contextPublisher && bridgeId) {
    const Component = descriptor.component
    // The contextPublisher function returns the ContextEntry[] to publish.
    // It receives the current node and rendered component props.
    const entriesToPublish = descriptor.contextPublisher(node, editor)
    usePublishContexts(store, bridgeId, entriesToPublish)
  }

  // --- Child side: consume ancestor contexts ---
  const ancestorEntries = useAncestorContexts(store, editor, getPos)

  // Render: wrap in bridged providers, then render component
  return (
    <NodeViewWrapper>
      <ContextBridgeProvider entries={ancestorEntries}>
        <Component {...primitiveProps}>
          <NodeViewContent />
        </Component>
      </ContextBridgeProvider>
    </NodeViewWrapper>
  )
}
```

### 7.4 Store lifecycle

The store is created once per editor instance (stored on the editor object or via a WeakMap keyed by editor). It is destroyed when the editor is destroyed. No global state — multiple editors on the same page each have their own store.

```typescript
const bridgeStores = new WeakMap<Editor, BridgeStore>()

function useContextBridgeStore(editor: Editor): BridgeStore {
  let store = bridgeStores.get(editor)
  if (!store) {
    store = createContextBridgeStore()
    bridgeStores.set(editor, store)
  }
  return store
}
```

---

## 8. Compound Component contextPublisher Specs

Each compound component that needs context bridging declares a `contextPublisher` function in its descriptor. This function returns the `ContextEntry[]` that the parent should publish.

### 8.1 fumadocs Tabs

Tabs requires bridging 3 contexts:

```typescript
// Descriptor for <Tabs>
{
  name: 'Tabs',
  contextPublisher(node, editor) {
    // 1. Radix TabsProvider context (from createContextScope)
    //    Value: { baseId, value, onValueChange, orientation, dir, activationMode }
    //    Captured via scope-aware hook or by rendering the Radix Tabs root
    //
    // 2. fumadocs styled TabsContext
    //    Value: { items: string[] | undefined, collection: string[] }
    //    The collection is a mutable array — bridging passes the same reference
    //
    // 3. fumadocs unstyled TabsContext
    //    Value: { valueToIdMap: Map<string, string> }
    //
    // All three are captured from the parent <Tabs> component's render tree
    // and published to the store.
    return [
      { context: RadixTabsContext, value: radixTabsValue },
      { context: FumadocsStyledTabsContext, value: styledValue },
      { context: FumadocsUnstyledTabsContext, value: unstyledValue },
    ]
  },
}
```

**Implementation note:** The `contextPublisher` doesn't compute these values itself. The pattern is: the parent `<Tabs>` component renders the real fumadocs `<Tabs>` root (which sets up all 3 providers), and a **capture component** inside that tree reads the context values and calls `usePublishContexts`. See §10 Risks for the capture pattern.

### 8.2 fumadocs Accordion

Accordion requires bridging 1–2 Radix contexts:

```typescript
{
  name: 'Accordions',
  contextPublisher(node, editor) {
    return [
      { context: RadixAccordionContext, value: accordionRootValue },
      // If AccordionItem context is needed per-item:
      // { context: RadixAccordionItemContext, value: itemValue },
    ]
  },
}
```

**Caveat:** Radix Accordion uses the Collection hook for keyboard navigation. If we bridge the Collection context, `querySelectorAll` ordering will work (DOM nesting preserved by `contentDOM`). If Collection context bridging proves too complex, keyboard navigation between AccordionItems across NodeView boundaries may degrade gracefully (mouse interaction still works).

### 8.3 Components NOT needing contextPublisher

- `Files` / `Folder` — each Folder is self-contained (`useState` + Radix Collapsible, local scope)
- `Callout`, `Card`, `Steps` — no compound parent-child context
- All inline components (`Icon`, `Badge`, etc.) — no compound structure

---

## 9. Testing Strategy

### 9.1 Unit tests — pure store (no editor needed)

```typescript
// context-bridge-store.test.ts
import { createContextBridgeStore } from './context-bridge-store'
import { createContext } from 'react'

const TestCtx = createContext('default')

test('publish → get returns entries', () => {
  const store = createContextBridgeStore()
  store.publish('node-1', [{ context: TestCtx, value: 'hello' }])
  expect(store.get('node-1')).toEqual([{ context: TestCtx, value: 'hello' }])
})

test('unpublish → get returns undefined', () => {
  const store = createContextBridgeStore()
  store.publish('node-1', [{ context: TestCtx, value: 'hello' }])
  store.unpublish('node-1')
  expect(store.get('node-1')).toBeUndefined()
})

test('subscribe fires on publish', () => {
  const store = createContextBridgeStore()
  const callback = vi.fn()
  store.subscribe(callback)
  store.publish('node-1', [{ context: TestCtx, value: 'hello' }])
  expect(callback).toHaveBeenCalledOnce()
})

test('getSnapshot increments on publish/unpublish', () => {
  const store = createContextBridgeStore()
  const v1 = store.getSnapshot()
  store.publish('node-1', [{ context: TestCtx, value: 'hello' }])
  expect(store.getSnapshot()).toBe(v1 + 1)
})
```

### 9.2 Integration test — ancestor walk

```typescript
// Requires a real ProseMirror doc to test $pos.node(depth) walk.
// Use the existing Tier 1 integration harness (test-harness.ts).

test('child NodeView receives ancestor context via bridge', async () => {
  const server = await createTestServer()
  try {
    const client = await createTestClient(server.port)
    // Insert <Tabs><Tab>content</Tab></Tabs> via agent-write
    await agentWriteMd(server.port, '<Tabs>\n<Tab>Hello</Tab>\n</Tabs>')
    await wait(500)
    // Verify the child Tab's useAncestorContexts finds the Tabs context
    // (This requires rendering in a browser — Playwright test)
  } finally {
    client.cleanup()
    await server.cleanup()
  }
})
```

### 9.3 Playwright E2E — visual compound component

```typescript
// Verify that <Tabs> with <Tab> children renders correctly in WYSIWYG,
// tab switching works, and context bridge maintains state across user edits.

test('Tabs compound component renders and switches', async ({ page }) => {
  // 1. Load editor with Tabs content
  // 2. Verify all Tab panels render (context bridge working)
  // 3. Click second tab trigger
  // 4. Verify panel switches (context.onValueChange bridged)
  // 5. Type in the active panel
  // 6. Switch back — content preserved
})
```

### 9.4 Stress test — rapid parent/child creation and deletion

Test that `publish` / `unpublish` lifecycle handles rapid insertions and deletions without memory leaks or stale subscriptions. Use the existing fuzz harness patterns.

---

## 10. Risks + Mitigations

### R1: Radix scoped context object capture (MEDIUM risk)

**Risk:** Radix `createContextScope` creates unique Context instances. The `__scopeTabs` prop carries scope objects that resolve to specific React Context references. If we capture the wrong Context object, `useContext` returns the default value instead of the bridged value.

**Mitigation:** The capture component renders inside the real fumadocs/Radix component tree and uses `use()` / `useContext()` to read the live context value and its associated Context object. We capture what React actually provides, not what we think the Context object should be.

**Fallback:** If scope-aware capture proves too brittle, we can use the `__scopeTabs` prop forwarding pattern — pass the scope prop through the bridge and let the child re-provide using the same scope.

### R2: Parent unmount before child (LOW risk)

**Risk:** During rapid document edits, a parent NodeView may unmount (calling `unpublish`) before its child NodeViews unmount. During this brief window, children see `undefined` from the store.

**Mitigation:**
1. `ContextBridgeProvider` falls through to React's default context values when entries are empty — fumadocs/Radix components throw ("must be used within..."), which is caught by `ComponentErrorBoundary` (FR-19 in the spec).
2. The window is typically < 1 frame (React batches unmounts).
3. If needed, add a `grace` timeout (50ms) before `unpublish` takes effect.

### R3: Radix Accordion Collection hook (MEDIUM risk)

**Risk:** Radix Accordion uses `@radix-ui/react-collection` for keyboard navigation between AccordionItems. Collection uses both React Context (for `itemMap`) and DOM queries (`querySelectorAll`). Bridging Collection context is more complex than bridging simple value contexts.

**Mitigation:**
1. Bridge the Collection context alongside the Accordion context — DOM ordering will work because `contentDOM` preserves DOM nesting.
2. If Collection bridging proves too complex in the first iteration, ship Accordion with mouse-only interaction (keyboard nav between items degrades). This is an acceptable P1 deferral — the component still renders and functions correctly.

### R4: Performance under deep nesting (LOW risk)

**Risk:** `useAncestorContexts` walks from the child's position to the document root — O(depth). With 10+ levels of nesting, this could be slow.

**Mitigation:**
1. Typical compound component nesting is 2–3 levels (Tabs > Tab). 10+ levels is pathological.
2. The walk happens once per render (not per frame). `useSyncExternalStore` ensures subsequent updates are O(1).
3. If profiling shows issues, add a `maxDepth` parameter (default 5) to limit the walk.

### R5: `getPos()` returns undefined during initialization (LOW risk)

**Risk:** ProseMirror's `getPos()` can return `undefined` before the NodeView is fully mounted. `useAncestorContexts` depends on `getPos()`.

**Mitigation:** Guard on `pos === undefined` and return empty entries. The component renders once without bridged context (using defaults), then re-renders when the store notifies (parent publishes). React's batching makes this transparent.

### R6: fumadocs `useCollectionIndex` mutable-array pattern (LOW risk)

**Risk:** fumadocs pushes to a mutable `collection` array during render. This works because the array reference is shared via Context. If bridging creates a copy instead of passing the reference, indices break.

**Mitigation:** The bridge passes the exact same Context value object — including the mutable array reference. `ContextBridgeProvider` wraps with `<Context.Provider value={originalValue}>`, not a clone.

---

## 11. Estimated Effort

| Component | Scope | Size |
|---|---|---|
| `context-bridge-store.ts` | Pure JS store (Map + emitter) | ~60 LoC |
| `use-context-bridge.ts` | React hooks (publish, consume, provider) | ~100 LoC |
| Integration in `JsxComponentView.tsx` | Wire bridge to NodeView lifecycle | ~90 LoC |
| `bridgeId` attr on `jsxComponent` schema | Schema attr + node creation wiring | ~20 LoC |
| Tabs `contextPublisher` | Capture 3 contexts from fumadocs Tabs | ~40 LoC |
| Accordion `contextPublisher` | Capture Radix Accordion contexts | ~30 LoC |
| Unit tests (store) | Pure JS tests | ~80 LoC |
| Integration tests (ancestor walk) | PM doc + store | ~60 LoC |
| Playwright test (visual compound) | E2E compound component rendering | ~80 LoC |
| **Total** | | **~560 LoC** |

The core bridge (~250 LoC) is a one-time investment. Each additional compound component type adds ~30–40 LoC for its `contextPublisher`.

---

## 12. Spec Amendments Recommended

Based on this research, the Component Blocks v2 spec (`specs/2026-04-14-component-blocks-v2/SPEC.md`) should be amended with:

### 12.1 New FR: Context Bridge

> **FR-CB1:** Parent `jsxComponent` NodeViews that represent compound component roots (Tabs, Accordion) MUST publish their React Context values to an external bridge store. Child `jsxComponent` NodeViews MUST consume ancestor contexts from the bridge store and re-provide them via `<Context.Provider>` wrappers.

### 12.2 New schema attr: `bridgeId`

> The `jsxComponent` node type gains a `bridgeId: string` attr (default: `''`). Assigned at node creation via editor-scoped incrementing counter. Used as the key in the context bridge store. Preserved through CRDT operations (attrs are stable on Y.XmlElement identity).

### 12.3 Descriptor extension: `contextPublisher`

> Component descriptors MAY include a `contextPublisher` field — a function that returns an array of `{ context: React.Context<T>, value: T }` entries to be published to the bridge store. If present, the NodeView component calls `usePublishContexts` at render time.

### 12.4 Descriptor extension: `contextConsumer`

> Component descriptors MAY include a `contextConsumer: boolean` field (default: `true` for all components). When true, the NodeView wraps its render output in `<ContextBridgeProvider>` which re-provides any ancestor-published contexts.

### 12.5 Interaction with ComponentErrorBoundary (FR-19)

> `ComponentErrorBoundary` catches errors from fumadocs/Radix components that throw when context is missing (e.g., "TabsContent must be used within Tabs"). This handles the brief window during parent unmount and acts as a safety net for context bridge failures.

### 12.6 New NG: NG12 or similar

> **NG-CB:** Keyboard navigation within Radix Accordion across NodeView boundaries may not function in the initial implementation. Mouse interaction and all visual rendering is unaffected. This is a known limitation of the Radix Collection hook dual-mechanism (Context + DOM query) across portal boundaries.

---

## 13. What This Research Did NOT Cover

1. **Actual implementation of context capture for Radix scoped contexts.** The `__scopeTabs` prop and `createContextScope` internals need hands-on prototyping to confirm the capture pattern works. The theory is sound but the implementation has edge cases (scope composition, multiple scope depths).

2. **React Compiler interaction.** The bridge uses `useSyncExternalStore` (compiler-safe) and standard hooks, but the `ContextBridgeProvider` component dynamically wraps children in N providers — React Compiler's memoization behavior with dynamic provider chains needs validation.

3. **Server-side rendering (SSR).** The bridge is client-only. If SSR/SSG is ever needed for the editor (unlikely — it's a collaborative editor), the `getServerSnapshot` path needs design.

4. **Performance profiling under real compound component load.** The O(depth) ancestor walk and store subscription overhead need measurement with real fumadocs components, not just theoretical analysis.

5. **Radix Accordion Collection hook bridging.** Whether `@radix-ui/react-collection`'s `itemMap` context can be bridged across portals while preserving `querySelectorAll` ordering needs prototyping. The theory says yes (DOM nesting preserved by `contentDOM`) but edge cases with `MutationObserver` in the v2 Collection may surface.

6. **Multiple instances of the same compound type.** E.g., two `<Tabs>` blocks in the same document. The `bridgeId` keying strategy handles this (each instance gets a unique ID), but testing with multiple simultaneous instances is needed.

7. **Hot module replacement (HMR).** During development, HMR replaces React components but not the bridge store. Stale entries from unmounted components that didn't run cleanup may accumulate. Need to verify that the WeakMap-per-editor pattern handles this.

8. **Non-fumadocs compound components.** The architecture is generic (any React Context can be bridged), but only fumadocs Tabs, Accordion, and Files/Folder were analyzed. Future compound components (custom user components, Radix Dialog inside NodeViews, etc.) may surface new context patterns.

---

## Evidence Files

| File | Dimensions | Key findings |
|---|---|---|
| `evidence/react-portal-context-semantics.md` | D1, D3, D4 | 10 findings: React portal behavior, TipTap flat portal model, no cross-tree context API |
| `evidence/radix-context-internals.md` | D7, D8 | Radix createContextScope internals, scope composition system |
| `evidence/radix-collection-hook-portal-behavior.md` | D10, D13 | 7 findings: Collection dual mechanism, per-component bridge complexity |
| `evidence/fumadocs-compound-components.md` | D9, D11 | 3-layer Tabs context, Accordion passthrough, Files no bridge |
| `evidence/community-context-bridge-patterns.md` | D2 | 15 findings: PixiJS, FluentUI, Plasmic, editor ecosystem comparison |
| `evidence/tiptap-nested-nodeview-context.md` | D5 | 16 findings: TipTap issues, ProseMirror forum, no existing solutions |
| `evidence/alternative-architectures-comparison.md` | D6 | Options A–G ranked comparison matrix |
