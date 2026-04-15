# Codebase Current State: CodeMirror-in-ProseMirror Readiness

**Dimension:** Codebase Current State (D6, D7 context)
**Date:** 2026-04-14
**Sources:** packages/app/src/editor/SourceEditor.tsx, packages/core/src/extensions/raw-mdx-fallback.ts, packages/app/src/editor/TiptapEditor.tsx, packages/app/package.json, packages/app/src/editor/plugins/md-link-source.ts, packages/app/src/editor/plugins/wiki-link-source.ts, packages/app/src/editor/plugins/agent-flash-source.ts, packages/app/src/editor/extensions/shared.ts, packages/app/src/editor/extensions/RawMdxFallbackView.tsx, packages/app/src/editor/extensions/JsxComponentView.tsx, packages/core/src/extensions/jsx-component.ts, packages/core/src/extensions/jsx-inline.ts

---

## 1. Exact Dependency Versions

### packages/app/package.json

**CodeMirror stack:**
| Package | Version |
|---------|---------|
| `@codemirror/autocomplete` | `^6.20.1` |
| `@codemirror/lang-markdown` | `^6.5.0` |
| `@codemirror/merge` | `^6.12.1` |
| `@codemirror/state` | `^6.6.0` |
| `@codemirror/view` | `^6.41.0` |
| `codemirror` (basicSetup) | `^6.0.2` |
| `@uiw/codemirror-theme-basic` | `^4.25.9` |
| `y-codemirror.next` | `^0.3.5` |

**TipTap / ProseMirror stack:**
| Package | Version |
|---------|---------|
| `@tiptap/core` | `^3.22.3` |
| `@tiptap/pm` | `^3.22.3` |
| `@tiptap/react` | `^3.22.3` |
| `@tiptap/starter-kit` | `^3.22.3` |
| `@tiptap/extension-collaboration` | `^3.22.3` |
| `@tiptap/extension-collaboration-cursor` | `3.0.0` |
| `@tiptap/y-tiptap` | `^3.0.3` |
| `@tiptap/extension-image` | `^3.22.3` |
| `@tiptap/extension-link` | `^3.22.3` |
| `@tiptap/extension-table` | `^3.22.3` |
| `@tiptap/extension-drag-handle` | `3.22.3` |
| `@tiptap/extension-file-handler` | `^3.22.3` |
| `@tiptap/extension-placeholder` | `^3.22.3` |
| `@tiptap/suggestion` | `^3.22.3` |

**Collaboration / CRDT:**
| Package | Version |
|---------|---------|
| `yjs` | `^13.6.30` |
| `y-codemirror.next` | `^0.3.5` |
| `y-prosemirror` | `1.3.7` (patched) |

**Root-level overrides (package.json L47-49):**
```json
"overrides": {
  "@codemirror/state": "$@codemirror/state",
  "@codemirror/view": "$@codemirror/view"
}
```

These overrides hoist `@codemirror/state` and `@codemirror/view` to the root workspace versions, ensuring singleton instances. This is critical for nested CM scenarios -- without it, nested CM instances inside ProseMirror NodeViews could load duplicate `@codemirror/state` modules, causing `StateField`/`StateEffect` identity checks to fail silently.

**Patched dependencies (package.json L51-54):**
```json
"patchedDependencies": {
  "@handlewithcare/remark-prosemirror@0.1.5": "patches/@handlewithcare%2Fremark-prosemirror@0.1.5.patch",
  "y-prosemirror@1.3.7": "patches/y-prosemirror@1.3.7.patch"
}
```

---

## 2. SourceEditor.tsx -- Full CM6 Extension List and Lifecycle

**File:** `packages/app/src/editor/SourceEditor.tsx` (174 lines)

### 2.1 Extension composition (L60-76)

The full-document source editor creates `EditorState` with this extension array:

```typescript
const state = EditorState.create({
  doc: ytext.toString(),
  extensions: [
    basicSetup,
    markdown(),
    yCollab(ytext, provider.awareness),
    createAgentFlashSourceExtension(provider.document),
    createWikiLinkSourceExtension(),
    createMdLinkSourceExtension(),
    themeCompartment.of(resolvedTheme === 'dark' ? darkTheme : lightTheme),
    EditorView.lineWrapping,
    EditorView.theme({
      '&': {
        height: '100%',
      },
    }),
  ],
});
```

**Extension breakdown:**
1. `basicSetup` -- from `codemirror` package; bundles line numbers, highlight, bracket matching, folding, autocomplete, history, search, etc.
2. `markdown()` -- from `@codemirror/lang-markdown`; provides syntax highlighting and language support.
3. `yCollab(ytext, provider.awareness)` -- from `y-codemirror.next`; binds CM6 to a Y.Text instance with awareness (cursor sharing). This is the CRDT collaboration binding.
4. `createAgentFlashSourceExtension(provider.document)` -- custom; StateField + ViewPlugin pattern for agent-write flash decorations.
5. `createWikiLinkSourceExtension()` -- custom; ViewPlugin decorations + language data autocomplete + click handler + theme.
6. `createMdLinkSourceExtension()` -- custom; ViewPlugin decorations + click handler + theme.
7. `themeCompartment.of(...)` -- Compartment-based theme switching.
8. `EditorView.lineWrapping` -- soft line wrap.
9. Inline `EditorView.theme` for height sizing.

### 2.2 Theme compartment pattern (L2, L39, L104-108)

```typescript
import { Compartment } from '@codemirror/state';

const themeCompartment = new Compartment();

// On theme change (separate useEffect):
useEffect(() => {
  if (!viewRef.current) return;
  viewRef.current.dispatch({
    effects: themeCompartment.reconfigure(
      resolvedTheme === 'dark' ? darkTheme : lightTheme
    ),
  });
}, [resolvedTheme]);
```

The `Compartment` is module-scoped (L39), shared across all `SourceEditor` instances. The theme values are `basicDarkInit` and `basicLightInit` from `@uiw/codemirror-theme-basic` with custom background overrides (L10-22):

```typescript
const darkTheme = basicDarkInit({
  settings: {
    background: 'var(--background)',
    gutterBackground: 'var(--background)',
  },
});
```

**Reuse consideration:** For nested CM in NodeViews, each instance needs its own `Compartment` -- the module-scoped singleton pattern will NOT work when multiple CM instances exist simultaneously. Each NodeView factory call must create a fresh `Compartment`.

### 2.3 yCollab binding (L27, L65)

```typescript
import { yCollab } from 'y-codemirror.next';

yCollab(ytext, provider.awareness)
```

`yCollab` binds a `Y.Text` instance to a CM6 editor, providing:
- Two-way sync between CM document and Y.Text
- Collaborative cursor/selection rendering via awareness
- Undo/redo integration with Y.UndoManager

**Reuse consideration for nested CM:** Each nested CM editor would need its own Y.Text binding. In the current architecture, a single `Y.Text('source')` represents the entire document. For component blocks, two approaches exist:
- (a) Each component block's CM binds to a slice/sub-range of the same Y.Text -- requires custom position mapping (yCollab does not support this natively).
- (b) Each component block uses an independent Y.Text or nested Y.XmlText -- requires new CRDT topology.
- (c) The nested CM does NOT use yCollab at all -- treats the PM node's text content as truth, syncs changes back via PM transactions. This is the CodeMirror-in-ProseMirror prior art pattern (prosemirror.net example).

### 2.4 Lifecycle and DOM event forwarding (L79-101)

```typescript
const view = new EditorView({
  state,
  parent: containerRef.current,
});
viewRef.current = view;

// Mirror TiptapEditor DOM listeners for Observer B typing-defer
const mark = () => markUserTyping(provider.document);
const dom = view.contentDOM;
dom.addEventListener('keydown', mark);
dom.addEventListener('paste', mark);
dom.addEventListener('drop', mark);
dom.addEventListener('cut', mark);

return () => {
  dom.removeEventListener('keydown', mark);
  dom.removeEventListener('paste', mark);
  dom.removeEventListener('drop', mark);
  dom.removeEventListener('cut', mark);
  view.destroy();
  viewRef.current = null;
};
```

The `markUserTyping` call is critical for Observer B's typing-defer behavior. For nested CM in NodeViews, the same `markUserTyping` forwarding would be needed to prevent Observer B from running `updateYFragment` while a user is editing inside a component block's CM instance.

### 2.5 Awareness mode management (L46-54)

```typescript
useEffect(() => {
  const awareness = provider.awareness;
  if (!awareness) return;
  awareness.setLocalStateField('mode', 'source');
  return () => {
    awareness.setLocalStateField('mode', 'wysiwyg');
  };
}, [provider]);
```

Sets awareness mode to `'source'` on mount, reverts to `'wysiwyg'` on unmount. Nested CM editors inside WYSIWYG would NOT set this -- they are sub-editors within the WYSIWYG surface, not a mode switch.

---

## 3. rawMdxFallback PM Node Definition (Core)

**File:** `packages/core/src/extensions/raw-mdx-fallback.ts` (90 lines)

### 3.1 Node spec

```typescript
export const RawMdxFallback = Node.create({
  name: 'rawMdxFallback',
  group: 'block',
  atom: false,
  content: 'text*',
  isolating: true,
  selectable: true,
  defining: true,
  priority: 60,
```

**Key properties:**
- `atom: false` -- NOT an atom node. Content is stored in ProseMirror's content model (not in attrs).
- `content: 'text*'` -- accepts zero or more text nodes as children. This is the "opaque-but-content-bearing" pattern from architectural precedent #10.
- `isolating: true` -- cursor cannot escape into surrounding context via arrow keys.
- `selectable: true` -- can be selected as a whole node.
- `defining: true` -- defines its own editing context.
- `priority: 60` -- above default (50), shared with jsxInline and jsxComponent.

### 3.2 Attributes

```typescript
addAttributes() {
  return {
    reason: { default: '' },
    originalSpan: { default: { start: 0, end: 0 } },
  };
}
```

- `reason` -- why the parse failed (e.g., "mdx-jsx-flow parse error").
- `originalSpan` -- character offsets in the source document where this block appeared. Used for source-mode navigation (click raw block in WYSIWYG, jump to offset in CM).

### 3.3 Core NodeView (vanilla DOM, L62-89)

```typescript
addNodeView() {
  return ({ HTMLAttributes }) => {
    const dom = document.createElement('div');
    dom.setAttribute('data-raw-mdx-fallback', '');
    dom.setAttribute('data-raw-badge', 'raw');
    dom.setAttribute('contenteditable', 'false');
    dom.classList.add('raw-mdx-fallback');

    const contentDOM = document.createElement('pre');
    contentDOM.classList.add('raw-mdx-fallback-content');
    contentDOM.setAttribute('contenteditable', 'false');
    dom.appendChild(contentDOM);

    return {
      dom,
      contentDOM,
      ignoreMutation: () => true,
    };
  };
}
```

**Pattern analysis:**
- Returns `{ dom, contentDOM, ignoreMutation }` -- standard ProseMirror NodeView shape.
- `contentDOM` is the element where PM renders the node's children (`text*`).
- `ignoreMutation: () => true` -- tells PM to ignore all DOM mutations within this view. This is essential: PM should not try to interpret changes inside the contentDOM.
- `contenteditable: 'false'` on both wrapper and inner `<pre>` -- double defense against WYSIWYG editing.

**This is the exact shape that would be replaced by a CodeMirror editor.** Instead of a `<pre>` with `contenteditable: false`, the nested CM scenario replaces `contentDOM` with a CM6 `EditorView` mounted into `dom`. The `ignoreMutation: () => true` would remain, since PM should not try to parse CM's DOM mutations.

---

## 4. App-Side NodeView Pattern (React)

### 4.1 Extension swap pattern (shared.ts, L23-29)

**File:** `packages/app/src/editor/extensions/shared.ts`

```typescript
export const sharedExtensions = [
  ...coreExtensions.map((ext) => {
    if (ext.name === 'jsxComponent') return JsxComponent;
    if (ext.name === 'rawMdxFallback') return RawMdxFallback;
    if (ext.name === 'wikiLink') return WikiLink;
    if (ext.name === 'link') return InternalLink;
    return ext;
  }),
  SlashCommand,
  FileHandler.configure({ /* ... */ }),
  HeadingAnchors,
  BlockDragHandle,
  BlockMover,
  Placeholder.configure({ /* ... */ }),
];
```

The pattern: core defines the schema-only extension, app extends it with `ReactNodeViewRenderer` (or vanilla NodeView). The `.extend()` call preserves schema + attributes + markdown handlers, replacing only the `addNodeView()` method.

### 4.2 RawMdxFallback app extension (raw-mdx-fallback.ts, L11-15)

**File:** `packages/app/src/editor/extensions/raw-mdx-fallback.ts`

```typescript
import { RawMdxFallback as BaseRawMdxFallback } from '@inkeep/open-knowledge-core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { RawMdxFallbackView } from './RawMdxFallbackView';

export const RawMdxFallback = BaseRawMdxFallback.extend({
  addNodeView() {
    return ReactNodeViewRenderer(RawMdxFallbackView);
  },
});
```

### 4.3 RawMdxFallbackView React component (RawMdxFallbackView.tsx)

**File:** `packages/app/src/editor/extensions/RawMdxFallbackView.tsx` (66 lines)

```typescript
export function RawMdxFallbackView({ node }: NodeViewProps) {
  const reason = (node.attrs.reason as string) || 'Parse failed';
  const originalSpan = node.attrs.originalSpan as { start: number; end: number };
  const hasSpan = originalSpan.start !== 0 || originalSpan.end !== 0;

  return (
    <NodeViewWrapper
      className="raw-mdx-fallback-wrapper relative my-2 rounded border border-dashed ..."
      contentEditable={false}
      onClick={handleClick}
      ...
    >
      <span className="absolute top-1 right-1 ...">raw</span>
      <pre className="whitespace-pre-wrap font-mono text-xs ...">
        {node.textContent}
      </pre>
    </NodeViewWrapper>
  );
}
```

Renders `node.textContent` inside a `<pre>` tag. The click handler dispatches `RAW_MDX_NAV_EVENT` to switch to source mode and scroll CM to the relevant offset.

**This is the component that would be replaced with a CM-in-PM NodeView.** Instead of rendering `{node.textContent}` in a static `<pre>`, it would mount a CM6 `EditorView` whose document is initialized from `node.textContent`, with changes dispatched back as PM transactions.

### 4.4 JsxComponent NodeView pattern (JsxComponentView.tsx)

**File:** `packages/app/src/editor/extensions/JsxComponentView.tsx` (37 lines)

```typescript
export function JsxComponentView({ node }: NodeViewProps) {
  const content = (node.attrs.content as string) || '';
  const parsed = parseJsxContent(content);
  return (
    <NodeViewWrapper className="jsx-component-wrapper" contentEditable={false}>
      {parsed.component === 'Callout' ? (
        <Callout type={parsed.type}>{parsed.children}</Callout>
      ) : (
        <div className="bg-muted dark:bg-muted/40 p-3 px-4 rounded-md font-mono text-[13px]">
          <strong>&lt;{parsed.component}&gt;</strong>
          <pre className="mt-2 whitespace-pre-wrap">{content}</pre>
        </div>
      )}
    </NodeViewWrapper>
  );
}
```

**Important difference from rawMdxFallback:** JsxComponent uses `atom: true` with content stored in `attrs.content` (a string). This means every content change triggers a full Y.XmlElement delete+reinsert via `equalYTypePNode` in y-prosemirror (per architectural precedent #10). This is the pattern that rawMdxFallback deliberately avoids by using `content: 'text*'`.

---

## 5. TiptapEditor.tsx -- Extension and NodeView Composition

**File:** `packages/app/src/editor/TiptapEditor.tsx` (420 lines)

### 5.1 Extension list (L104-133)

```typescript
const editor = useEditor({
  extensions: [
    ...sharedExtensions,
    Collaboration.configure({
      document: provider.document,
    }),
    Extension.create({
      name: 'imageUploadDecoration',
      addProseMirrorPlugins() {
        return [uploadDecorationPlugin];
      },
    }),
    Extension.create({
      name: 'collaborationCursor',
      addProseMirrorPlugins() {
        const awareness = provider.awareness;
        return [
          yCursorPlugin(awareness, {
            cursorBuilder: renderCursor,
          }),
        ];
      },
    }),
  ],
});
```

Key observation: `Collaboration.configure({ document: provider.document })` binds TipTap to the Y.Doc. This uses `@tiptap/extension-collaboration` which internally uses `ySyncPlugin` from `@tiptap/y-tiptap` (their fork of y-prosemirror). The cursor plugin is explicitly `yCursorPlugin` from `@tiptap/y-tiptap`, not from `y-prosemirror`, to avoid `ySyncPluginKey` mismatch (L116 comment).

**Reuse consideration:** Nested CM editors do NOT need `Collaboration` or `yCursorPlugin` -- they are sub-editors whose content flows through the parent PM node. Collaboration for the outer document handles the CRDT sync.

### 5.2 User typing detection (L145-158)

```typescript
useEffect(() => {
  if (!editor) return;
  const dom = editor.view.dom;
  const mark = () => markUserTyping(provider.document);
  dom.addEventListener('keydown', mark);
  dom.addEventListener('paste', mark);
  dom.addEventListener('drop', mark);
  dom.addEventListener('cut', mark);
  return () => { /* removeEventListeners */ };
}, [editor, provider.document]);
```

Same `markUserTyping` pattern as SourceEditor. For nested CM, the CM instance's `contentDOM` would need the same listeners forwarded.

---

## 6. CM Plugin Factory Patterns

### 6.1 md-link-source.ts -- ViewPlugin + theme + event handler pattern

**File:** `packages/app/src/editor/plugins/md-link-source.ts` (123 lines)

Factory function returns an array of three extensions:

```typescript
export function createMdLinkSourceExtension(): Extension {
  return [mdLinkDecorations, mdLinkClickHandler, mdLinkTheme];
}
```

**Component 1: ViewPlugin for decorations (L57-70)**

```typescript
const mdLinkDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);
```

**Component 2: DOM event handler (L74-100)**

```typescript
const mdLinkClickHandler = EditorView.domEventHandlers({
  mousedown(event: MouseEvent, view: EditorView) {
    if (!event.ctrlKey && !event.metaKey) return false;
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    // ... match link at position, navigate
  },
});
```

**Component 3: Theme (L104-113)**

```typescript
const mdLinkTheme = EditorView.theme({
  '.cm-md-internal-link': {
    color: 'oklch(52.7% 0.154 228.4)',
    fontWeight: '500',
  },
  // ...
});
```

**Reuse analysis:** These are pure stateless extensions that depend only on the CM document content. They are fully reusable in a nested CM scenario. Link navigation (Cmd+click) would need context about the current document, which is already resolved from `window.location.hash` -- this works regardless of whether CM is the full-document editor or a nested NodeView.

### 6.2 wiki-link-source.ts -- ViewPlugin + language data autocomplete + event handler

**File:** `packages/app/src/editor/plugins/wiki-link-source.ts` (243 lines)

Factory function returns four extensions:

```typescript
export function createWikiLinkSourceExtension(): Extension {
  return [
    wikiLinkDecorations,
    wikiLinkClickHandler,
    wikiLinkTheme,
    markdownLanguage.data.of({ autocomplete: wikiLinkCompletionSource }),
  ];
}
```

The autocomplete integration (L241) uses `markdownLanguage.data.of()` to inject a completion source into the markdown language's autocompletion data. This requires the `markdown()` language extension to be active.

**Reuse analysis:** Decorations and click handler are fully reusable. The autocomplete source depends on `markdownLanguage.data` -- if the nested CM uses `markdown()` language support, this works as-is. If the nested CM uses a different language (e.g., JSX/TSX), the completion source would need to be registered via a different language's data, or via standalone `autocompletion({ override: [...] })`.

Module-level TTL caches for page/heading data (`pagesCache`, `headingsCache`) are singletons -- shared safely across all CM instances.

### 6.3 agent-flash-source.ts -- StateField + StateEffect + ViewPlugin pattern

**File:** `packages/app/src/editor/plugins/agent-flash-source.ts` (159 lines)

Factory function takes a `Y.Doc` parameter and returns two extensions:

```typescript
export function createAgentFlashSourceExtension(doc: Y.Doc): Extension {
  const activityMap = doc.getMap('activity');

  const flashViewPlugin = ViewPlugin.define((view) => {
    // ... observes activityMap, dispatches StateEffects
    return {
      update(_update: ViewUpdate) { /* no-op */ },
      destroy() { /* cleanup observers */ },
    };
  });

  return [flashField, flashViewPlugin];
}
```

**StateEffect/StateField pattern (L27-61):**

```typescript
const addFlash = StateEffect.define<{ from: number; to: number }>();
const removeFlash = StateEffect.define<null>();

const flashField = StateField.define<DecorationSet>({
  create() { return Decoration.none; },
  update(decorations, tr) {
    decorations = decorations.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(addFlash)) {
        // Add line decorations
      } else if (effect.is(removeFlash)) {
        decorations = Decoration.none;
      }
    }
    return decorations;
  },
  provide: (f) => EditorView.decorations.from(f),
});
```

**Important:** `StateEffect.define()` creates identity-based effect types. The `addFlash` and `removeFlash` effects are module-scoped singletons. The `flashField` is also module-scoped. Multiple CM instances sharing the same `flashField` reference is fine -- CM6 creates per-instance state from the field's `create()` function. The `StateEffect` identity check (`effect.is(addFlash)`) works because all instances reference the same `addFlash` object.

**Reuse analysis:** The ViewPlugin captures `doc.getMap('activity')` in a closure. For nested CM in NodeViews, the `Y.Doc` reference would be the same document (component blocks are part of the same collaborative document). The flash behavior (highlighting all lines when any agent writes) may not be desirable per-component-block -- a more targeted flash based on whether the specific block was modified would be needed. However, the StateField/StateEffect infrastructure is directly reusable.

**Lifecycle management (L138-156):** The ViewPlugin's `destroy()` method cleans up Y.Map observers and timeouts. This is critical for NodeView CM instances -- they may be created and destroyed frequently as the user scrolls or the document changes. The existing cleanup pattern is robust.

---

## 7. Existing Node Shapes Relevant to CM-in-PM

### 7.1 rawMdxFallback (block-level, content-bearing)

| Property | Value | Impact on nested CM |
|----------|-------|---------------------|
| `atom` | `false` | PM manages text children -- CM edits must be reflected as PM transactions |
| `content` | `'text*'` | Text content is PM-managed, not in attrs |
| `isolating` | `true` | Arrow keys cannot escape -- good for nested editor containment |
| `selectable` | `true` | Node can be selected as a whole -- needed for delete/backspace behavior |
| `defining` | `true` | Structural role in document -- content within defines a distinct context |
| `contenteditable` | `false` (via NodeView) | WYSIWYG editing blocked -- nested CM would handle input instead |

### 7.2 jsxInline (inline, content-bearing)

```typescript
name: 'jsxInline',
group: 'inline',
inline: true,
atom: false,
content: 'inline*',
isolating: true,
selectable: true,
```

Same content-bearing pattern but inline. `content: 'inline*'` accepts inline content (emphasis, strong, etc.) -- a richer content model than `text*`.

### 7.3 jsxComponent (block-level, atom)

```typescript
name: 'jsxComponent',
group: 'block',
atom: true,
isolating: true,
```

**Content stored in `attrs.content`** (string). This is the anti-pattern for CM-in-PM: every keystroke in a nested CM would trigger an attr change, causing `equalYTypePNode` to delete+reinsert the entire Y.XmlElement. If component blocks evolve from this node type, they MUST migrate to a content-bearing shape (`atom: false, content: 'text*'` or richer) before adding CM editors.

---

## 8. Reusability Analysis for Nested CM Scenario

### 8.1 Directly reusable

| Component | Location | Notes |
|-----------|----------|-------|
| `basicSetup` | `codemirror` | Includes history, search, bracket matching -- all useful in component blocks |
| `markdown()` | `@codemirror/lang-markdown` | If the block content is markdown/MDX |
| `createMdLinkSourceExtension()` | `plugins/md-link-source.ts` | Stateless decoration + click handler |
| `createWikiLinkSourceExtension()` | `plugins/wiki-link-source.ts` | With `markdown()` language active |
| Theme setup (`basicDarkInit`/`basicLightInit`) | `SourceEditor.tsx` | CSS variable-based, adapts to container |
| `EditorView.lineWrapping` | CM6 built-in | Standard soft wrap |
| `StateField`/`StateEffect` pattern | `agent-flash-source.ts` | Infrastructure pattern reusable for any per-block decoration |

### 8.2 Requires adaptation

| Component | Issue | Adaptation needed |
|-----------|-------|-------------------|
| `yCollab(ytext, awareness)` | Binds to whole-document Y.Text | Either skip entirely (use PM transactions as source of truth) or create per-block Y.Text instances |
| `themeCompartment` | Module-scoped singleton | Each NodeView needs its own `Compartment` instance |
| `createAgentFlashSourceExtension(doc)` | Flashes ALL lines on any agent write | Need per-block targeting based on which component was edited |
| `markUserTyping` forwarding | Currently on SourceEditor's root `contentDOM` | Must be added to each nested CM's `contentDOM` |

### 8.3 Not applicable to nested CM

| Component | Reason |
|-----------|--------|
| `Collaboration.configure()` | Nested CM does not bind to Y.Doc directly |
| `yCursorPlugin` / awareness mode | Cursors are managed by the outer ProseMirror |
| Outline/heading navigation hooks | Block-level editors don't have document headings |

### 8.4 Critical architectural decision: CM-PM data flow

The existing codebase uses two distinct patterns for NodeView content:

**Pattern A (rawMdxFallback, jsxInline):** Content is in PM's content model (`content: 'text*'` or `content: 'inline*'`). NodeView provides `contentDOM` where PM renders children. `ignoreMutation: () => true` prevents PM from interpreting DOM changes.

**Pattern B (jsxComponent):** Content is in `attrs.content` (string). Node is `atom: true`. Every attr change = full CRDT node replacement.

For CM-in-PM, Pattern A is the correct foundation. The CM editor reads from and writes to the PM node's text content via PM transactions. The flow:

1. CM `EditorView` is mounted into the NodeView's `dom` (NOT `contentDOM` -- the CM manages its own DOM).
2. CM document is initialized from `node.textContent`.
3. User edits in CM dispatch PM `TextSelection` + `ReplaceStep` transactions via `getPos()`.
4. PM updates flow back to CM via the NodeView's `update(node)` callback (if content changed from outside).
5. `ignoreMutation: () => true` prevents PM from treating CM's DOM changes as user input.

This matches the canonical prosemirror.net CodeMirror-in-ProseMirror example and is consistent with the existing `rawMdxFallback` NodeView shape.

---

## 9. Key Integration Points and Risks

### 9.1 Observer bridge interaction

Nested CM edits that produce PM transactions will trigger Observer A (XmlFragment -> Y.Text) as normal WYSIWYG edits. The `markUserTyping` forwarding is essential to prevent Observer B from running `updateYFragment` concurrently.

### 9.2 y-prosemirror patch

The patched `y-prosemirror@1.3.7` replaces destructive-delete on schema-throw with `rawMdxFallback` substitution. Nested CM nodes with `content: 'text*'` (matching rawMdxFallback's shape) are safe under this patch -- `schema.node()` will succeed because the content expression is satisfied.

### 9.3 Module deduplication

Root-level `overrides` for `@codemirror/state` and `@codemirror/view` ensure singleton instances across the workspace. This is load-bearing for nested CM: `StateField.define()` returns an object whose identity is used for lookups in `EditorState`. If a NodeView's CM instance uses a different `@codemirror/state` module than the extensions, `StateField` identity checks fail silently (fields appear as `undefined`). The existing overrides already solve this.

### 9.4 React Compiler

The codebase uses `babel-plugin-react-compiler` (experimental, L87 of app package.json). NodeView components rendered via `ReactNodeViewRenderer` must be compatible with the compiler. The existing `RawMdxFallbackView` and `JsxComponentView` use only basic React (no refs, no hooks) -- a CM-hosting NodeView would use `useRef` for the CM instance and `useEffect` for lifecycle, which are compiler-safe.
