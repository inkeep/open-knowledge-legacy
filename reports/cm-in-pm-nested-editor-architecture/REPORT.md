# CodeMirror 6 in ProseMirror NodeView: Nested Editor Architecture

**Report ID:** `cm-in-pm-nested-editor-architecture`
**Date:** 2026-04-14
**Consumer:** Component Blocks v2 spec (§9, NG3 revisit)
**Scope:** Architectural blueprint for embedding CodeMirror 6 inside a ProseMirror NodeView for the `rawMdxFallback` node, with forward-compatibility to per-block MDX editing in component blocks.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architectural Diagram](#2-architectural-diagram)
3. [Reference Implementation](#3-reference-implementation)
4. [Sync Lifecycle Trace](#4-sync-lifecycle-trace)
5. [Selection + Focus Contract](#5-selection--focus-contract)
6. [Keybinding Contract](#6-keybinding-contract)
7. [Extension / Theme Factory Design](#7-extension--theme-factory-design)
8. [Y-codemirror.next Evaluation](#8-y-codemirrortnext-evaluation)
9. [Lazy-Init Strategy](#9-lazy-init-strategy)
10. [Test Plan](#10-test-plan)
11. [Estimated Effort](#11-estimated-effort)
12. [Risks and Mitigations](#12-risks-and-mitigations)
13. [What This Research Did NOT Cover](#13-what-this-research-did-not-cover)
14. [Spec Additions Recommended](#14-spec-additions-recommended)

---

## 1. Executive Summary

This report provides a code-level architectural blueprint for embedding a CodeMirror 6 editor instance inside a ProseMirror NodeView, targeting the `rawMdxFallback` node from the tolerant-parsing spec (#136) and forward-compatible with per-block MDX code editing in Component Blocks v2.

**Core architectural decision: direct PM dispatch (HIGH confidence).** The nested CodeMirror does NOT use `y-codemirror.next` for CRDT sync. Instead, it follows the canonical ProseMirror tutorial pattern: CM changes are forwarded to ProseMirror as transactions via `tr.replaceWith()` / `tr.delete()`, and PM-side changes flow back via the NodeView's `update(node)` method. A single `updating` boolean prevents feedback loops. y-prosemirror owns the CRDT layer; CM is a view-only editing facade. This avoids the dual-observer conflict risk where both y-codemirror.next and y-prosemirror observe the same `Y.XmlText` simultaneously — an uncharted integration with no production precedent.

**Reuse story is strong.** The existing `SourceEditor.tsx` CM6 setup (theme compartment, `markdown()` language, wiki-link/md-link decorations, agent flash) is decomposable into a shared `createNestedCMExtensions()` factory. Each nested instance gets its own `Compartment` for theme switching. The `basicSetup` bundle (history, bracket matching, search) works unmodified. The only extensions that do NOT transfer are `yCollab` (CRDT binding — replaced by PM dispatch) and awareness mode management (nested editors are within WYSIWYG, not a separate mode).

**The `rawMdxFallback` node shape is ideal.** Its `atom: false, content: 'text*', isolating: true` schema is structurally identical to the PM tutorial's `code_block` — the exact shape the nested-CM pattern was designed for. No schema changes are required. The existing `ignoreMutation: () => true` policy, `contenteditable: false` on the wrapper, and `selectable: true` all align with the nested editor requirements.

**Prior art is thin but sufficient.** The ProseMirror official tutorial (prosemirror.net/examples/codemirror/) is the canonical reference. Every production implementation examined (Emergence Engineering's `prosemirror-codemirror-block`, Remirror's CodeMirror6 extension) follows the same pattern: `updating` flag, `computeChange()` character diff, `stopEvent() => true`, `getPos() + 1` offset, `Selection.near()` for boundary escape. No production implementation combines this with y-prosemirror CRDT — our implementation is novel in that specific combination, but the individual components are proven.

---

## 2. Architectural Diagram

```
┌─────────────────────────────────────────────────────────┐
│  TipTap / ProseMirror  (outer editor)                   │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │  rawMdxFallback NodeView                          │  │
│  │  ┌─────────────────────────────────────────────┐  │  │
│  │  │  dom: div.raw-mdx-fallback                  │  │  │
│  │  │  ┌───────────────────────────────────────┐  │  │  │
│  │  │  │  Chrome: badge, reason tooltip, border│  │  │  │
│  │  │  └───────────────────────────────────────┘  │  │  │
│  │  │  ┌───────────────────────────────────────┐  │  │  │
│  │  │  │  CodeMirror 6 EditorView              │  │  │  │
│  │  │  │  ┌─────────────────────────────────┐  │  │  │  │
│  │  │  │  │  Extensions:                    │  │  │  │  │
│  │  │  │  │  - markdown() lang              │  │  │  │  │
│  │  │  │  │  - wikiLink decorations         │  │  │  │  │
│  │  │  │  │  - mdLink decorations           │  │  │  │  │
│  │  │  │  │  - themeCompartment (per-inst)  │  │  │  │  │
│  │  │  │  │  - lineWrapping                 │  │  │  │  │
│  │  │  │  │  - updateListener → forwardUpdate│ │  │  │  │
│  │  │  │  └─────────────────────────────────┘  │  │  │  │
│  │  │  └───────────────────────────────────────┘  │  │  │
│  │  │  ignoreMutation: () => true                 │  │  │
│  │  │  stopEvent: () => true                      │  │  │
│  │  └─────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  ┌─────────────────────────────────────────────────────┐│
│  │  y-prosemirror sync plugin (ySyncPlugin)            ││
│  │  Maps: Y.XmlElement('rawMdxFallback')               ││
│  │        └── Y.XmlText (text content)                 ││
│  └─────────────────────────────────────────────────────┘│
└────────────────────────┬────────────────────────────────┘
                         │
     Sync direction: CM → PM transaction → y-prosemirror → CRDT
     Reverse:        CRDT → y-prosemirror → PM → NodeView.update() → CM
```

### Data flow (single keystroke in nested CM)

```
User types in CM
  → CM EditorView dispatches CM transaction
  → updateListener fires (CM ViewUpdate)
  → forwardUpdate() checks this.updating === false
  → Computes PM offset: getPos() + 1
  → Dispatches PM transaction: tr.replaceWith(from, to, pmTextNode)
  → PM applies transaction
    → y-prosemirror observes PM transaction
      → Mutates Y.XmlText inside Y.XmlElement('rawMdxFallback')
        → Y.Doc transaction propagates to peers
    → Observer A fires (XmlFragment → Y.Text)
      → Diffs markdown, patches Y.Text('source')
  → NodeView.update(newNode) fires
  → this.updating = true (suppress forwardUpdate)
  → computeChange() finds diff between CM doc and newNode.textContent
  → If diff exists: CM.dispatch({changes: ...})
  → this.updating = false
```

---

## 3. Reference Implementation

~350 lines. Two files: a vanilla NodeView class and a React wrapper that bridges TipTap's `ReactNodeViewRenderer` lifecycle.

### 3.1 Core NodeView class (`RawMdxFallbackCMView`)

```typescript
// packages/app/src/editor/extensions/RawMdxFallbackCMView.ts

import { EditorState as CMState } from '@codemirror/state';
import { EditorView as CMView, keymap as cmKeymap } from '@codemirror/view';
import { defaultKeymap } from '@codemirror/commands';
import type { Node as PmNode } from '@tiptap/pm/model';
import { Selection, TextSelection } from '@tiptap/pm/state';
import type { EditorView as PmView } from '@tiptap/pm/view';
import { undo, redo } from '@tiptap/pm/history';
import { createNestedCMExtensions } from './nested-cm-extensions';
import { markUserTyping } from '../observers';
import type * as Y from 'yjs';

/**
 * Embeds a CodeMirror 6 editor inside a ProseMirror NodeView for
 * rawMdxFallback nodes. Follows the canonical PM tutorial pattern:
 * CM → PM transaction dispatch, PM → CM via update(node).
 *
 * Does NOT use y-codemirror.next. y-prosemirror owns CRDT sync.
 */
export class RawMdxFallbackCMView {
  dom: HTMLElement;
  cm: CMView;
  node: PmNode;
  view: PmView;
  getPos: () => number | undefined;
  updating = false;
  private ydoc: Y.Doc;

  constructor(
    node: PmNode,
    view: PmView,
    getPos: () => number | undefined,
    ydoc: Y.Doc,
    resolvedTheme: string,
  ) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;
    this.ydoc = ydoc;

    // Chrome wrapper
    this.dom = document.createElement('div');
    this.dom.classList.add('raw-mdx-fallback');
    this.dom.setAttribute('data-raw-mdx-fallback', '');
    this.dom.setAttribute('data-raw-badge', 'raw');

    if (node.attrs.reason) {
      this.dom.setAttribute('data-reason', node.attrs.reason as string);
    }

    // Badge element
    const badge = document.createElement('span');
    badge.className = 'raw-mdx-fallback-badge';
    badge.textContent = 'raw';
    badge.title = `${(node.attrs.reason as string) || 'Parse failed'} — editing inline`;
    this.dom.appendChild(badge);

    // Reason tooltip (visible on hover)
    if (node.attrs.reason) {
      const reason = document.createElement('span');
      reason.className = 'raw-mdx-fallback-reason';
      reason.textContent = node.attrs.reason as string;
      this.dom.appendChild(reason);
    }

    // Create CM editor
    const startState = CMState.create({
      doc: this.node.textContent,
      extensions: [
        ...createNestedCMExtensions(ydoc, resolvedTheme),
        cmKeymap.of([
          ...this.codeMirrorKeymap(),
          ...defaultKeymap,
        ]),
        CMView.updateListener.of((update) => this.forwardUpdate(update)),
      ],
    });

    this.cm = new CMView({
      state: startState,
      parent: this.dom,
    });

    // Forward typing signals so Observer B defers
    const mark = () => markUserTyping(this.ydoc);
    const contentDOM = this.cm.contentDOM;
    contentDOM.addEventListener('keydown', mark);
    contentDOM.addEventListener('paste', mark);
    contentDOM.addEventListener('drop', mark);
    contentDOM.addEventListener('cut', mark);
  }

  /**
   * CM → PM: Forward document changes as PM transactions.
   * Skipped when `this.updating` is true (PM → CM path active).
   */
  forwardUpdate(update: { docChanged: boolean; state: CMState; changes: any }) {
    if (this.updating || !update.docChanged) return;

    const pos = this.getPos();
    if (pos === undefined) return;
    const offset = pos + 1; // +1 for node opening token
    const { state } = this.view;

    let tr = state.tr;
    update.changes.iterChanges(
      (fromA: number, toA: number, _fromB: number, _toB: number, text: any) => {
        if (text.length) {
          tr.replaceWith(
            tr.mapping.map(offset + fromA),
            tr.mapping.map(offset + toA),
            text.length ? state.schema.text(text.toString()) : [],
          );
        } else {
          tr.delete(
            tr.mapping.map(offset + fromA),
            tr.mapping.map(offset + toA),
          );
        }
      },
    );

    // Map CM selection to PM selection
    const cmSel = update.state.selection.main;
    const pmAnchor = tr.mapping.map(offset + cmSel.anchor);
    const pmHead = tr.mapping.map(offset + cmSel.head);
    tr.setSelection(TextSelection.create(tr.doc, pmAnchor, pmHead));

    this.view.dispatch(tr);
  }

  /**
   * PM → CM: Apply external changes (CRDT, undo, peer edits).
   * Uses character-by-character diff to produce minimal CM changes.
   */
  update(node: PmNode): boolean {
    if (node.type.name !== this.node.type.name) return false;
    this.node = node;

    const change = computeChange(this.cm.state.doc.toString(), node.textContent);
    if (change) {
      this.updating = true;
      this.cm.dispatch({
        changes: {
          from: change.from,
          to: change.to,
          insert: change.text,
        },
      });
      this.updating = false;
    }
    return true;
  }

  /**
   * CM keybindings that delegate to PM or handle boundary escape.
   */
  codeMirrorKeymap() {
    const view = this.view;
    return [
      { key: 'ArrowUp', run: () => this.maybeEscape('line', -1) },
      { key: 'ArrowLeft', run: () => this.maybeEscape('char', -1) },
      { key: 'ArrowDown', run: () => this.maybeEscape('line', 1) },
      { key: 'ArrowRight', run: () => this.maybeEscape('char', 1) },
      {
        key: 'Mod-z',
        run: () => {
          undo(view.state, view.dispatch);
          return true;
        },
      },
      {
        key: 'Mod-y',
        run: () => {
          redo(view.state, view.dispatch);
          return true;
        },
        mac: 'Mod-Shift-z',
      },
      {
        key: 'Mod-Shift-z',
        run: () => {
          redo(view.state, view.dispatch);
          return true;
        },
      },
    ];
  }

  /**
   * Boundary escape: move focus from CM back to PM when cursor is at
   * the edge of the CM document and user presses an arrow key.
   */
  maybeEscape(unit: 'line' | 'char', dir: -1 | 1): boolean {
    const { state } = this.cm;
    const { main } = state.selection;

    // Don't escape if selection is non-empty
    if (!main.empty) return false;

    // For line-level movement, check if we're on the first/last line
    if (unit === 'line') {
      const line = state.doc.lineAt(main.head);
      if (dir < 0 ? line.from > 0 : line.to < state.doc.length) return false;
    } else {
      if (dir < 0 ? main.from > 0 : main.to < state.doc.length) return false;
    }

    // Calculate target position in outer PM doc
    const pos = this.getPos();
    if (pos === undefined) return false;
    const targetPos = pos + (dir < 0 ? 0 : this.node.nodeSize);
    const pmState = this.view.state;
    const selection = Selection.near(pmState.doc.resolve(targetPos), dir);
    this.view.dispatch(pmState.tr.setSelection(selection).scrollIntoView());
    this.view.focus();
    return true;
  }

  /** All events inside CM are handled by CM, not PM. */
  stopEvent(): boolean {
    return true;
  }

  /** PM should not interpret CM's DOM mutations. */
  ignoreMutation(): boolean {
    return true;
  }

  /** Prevent PM from setting contentDOM — CM manages its own DOM. */
  get contentDOM(): null {
    return null;
  }

  selectNode() {
    this.cm.focus();
  }

  deselectNode() {
    // No-op; CM keeps its visual state
  }

  destroy() {
    this.cm.destroy();
  }
}

/**
 * Character-by-character diff to produce minimal CM change spec.
 * Standard pattern from PM tutorial + Remirror + Emergence Engineering.
 */
function computeChange(
  oldVal: string,
  newVal: string,
): { from: number; to: number; text: string } | null {
  if (oldVal === newVal) return null;

  let start = 0;
  let oldEnd = oldVal.length;
  let newEnd = newVal.length;

  while (start < oldEnd && oldVal.charCodeAt(start) === newVal.charCodeAt(start)) {
    start++;
  }
  while (
    oldEnd > start &&
    newEnd > start &&
    oldVal.charCodeAt(oldEnd - 1) === newVal.charCodeAt(newEnd - 1)
  ) {
    oldEnd--;
    newEnd--;
  }

  return { from: start, to: oldEnd, text: newVal.slice(start, newEnd) };
}
```

### 3.2 Extension factory (`createNestedCMExtensions`)

```typescript
// packages/app/src/editor/extensions/nested-cm-extensions.ts

import { Compartment } from '@codemirror/state';
import { EditorView, drawSelection, lineNumbers } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { bracketMatching } from '@codemirror/language';
import { closeBrackets } from '@codemirror/autocomplete';
import { highlightSelectionMatches } from '@codemirror/search';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { basicDarkInit, basicLightInit } from '@uiw/codemirror-theme-basic';
import type * as Y from 'yjs';
import { createWikiLinkSourceExtension } from '../plugins/wiki-link-source';
import { createMdLinkSourceExtension } from '../plugins/md-link-source';
import type { Extension } from '@codemirror/state';

const darkTheme = basicDarkInit({
  settings: {
    background: 'var(--background)',
    gutterBackground: 'var(--background)',
  },
});

const lightTheme = basicLightInit({
  settings: {
    background: 'var(--background)',
    gutterBackground: 'var(--background)',
  },
});

/**
 * Creates the CM extension array for a nested CM instance inside a PM NodeView.
 *
 * Notable omissions vs SourceEditor.tsx:
 * - No yCollab — CRDT sync is via PM transactions, not direct Y.Text binding
 * - No basicSetup — cherry-pick instead (no history — undo delegates to PM)
 * - No awareness mode management — nested editors are within WYSIWYG
 *
 * Returns [extensions, themeCompartment] so the caller can reconfigure theme.
 */
export function createNestedCMExtensions(
  _ydoc: Y.Doc,
  resolvedTheme: string,
): Extension[] {
  // Per-instance compartment — NOT module-scoped like SourceEditor's
  const themeCompartment = new Compartment();

  return [
    // Language + highlighting
    markdown(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),

    // Editing aids (cherry-picked from basicSetup — excludes history)
    drawSelection(),
    bracketMatching(),
    closeBrackets(),
    highlightSelectionMatches(),

    // Custom decorations (stateless — safe to share across instances)
    createWikiLinkSourceExtension(),
    createMdLinkSourceExtension(),

    // Theme (per-instance compartment)
    themeCompartment.of(resolvedTheme === 'dark' ? darkTheme : lightTheme),

    // Layout
    EditorView.lineWrapping,
    EditorView.theme({
      '&': { minHeight: '2em' },
      '&.cm-focused': { outline: 'none' },
      '.cm-scroller': { overflow: 'auto' },
    }),
  ];
}

export { darkTheme, lightTheme };
```

### 3.3 TipTap extension swap (app-level)

```typescript
// packages/app/src/editor/extensions/raw-mdx-fallback.ts (modified)

import { RawMdxFallback as BaseRawMdxFallback } from '@inkeep/open-knowledge-core';
import { RawMdxFallbackCMView } from './RawMdxFallbackCMView';

export const RawMdxFallback = BaseRawMdxFallback.extend({
  addNodeView() {
    return ({ node, editor, getPos }) => {
      // Access Y.Doc from the collaboration extension
      const ydoc = editor.storage.collaboration?.document;
      // Read current theme (could be injected via editor storage or DOM query)
      const resolvedTheme = document.documentElement.classList.contains('dark')
        ? 'dark'
        : 'light';

      return new RawMdxFallbackCMView(
        node,
        editor.view,
        getPos,
        ydoc,
        resolvedTheme,
      );
    };
  },
});
```

**Implementation note:** The reference implementation above is a structural sketch. Production code will need:
- Theme change observation (MutationObserver on `document.documentElement` class list, or a shared event)
- Line numbers toggle (optional — rawMdxFallback blocks are typically short)
- `contentDOM` returning `null` means PM does not manage children — the CM view is the sole owner of the text rendering. This is deliberate: PM's text content is the source of truth, but CM renders it.

---

## 4. Sync Lifecycle Trace

### 4.1 User types in nested CM (local keystroke)

```
t=0    User presses 'x' in CM at offset 5
t=0    CM dispatches internal transaction (doc: insert 'x' at 5)
t=0    updateListener fires → forwardUpdate(update)
t=0      this.updating === false → proceed
t=0      getPos() returns 42 (rawMdxFallback node starts at PM offset 42)
t=0      offset = 42 + 1 = 43 (skip node opening token)
t=0      update.changes.iterChanges → fromA=5, toA=5, text='x'
t=0      tr.replaceWith(43+5=48, 48, schema.text('x'))
t=0      view.dispatch(tr)
t=1    PM applies transaction
t=1      y-prosemirror observes PM change
t=1        Mutates Y.XmlText inside Y.XmlElement('rawMdxFallback')
t=1        Y.Doc transaction origin: ySyncPluginKey
t=1      NodeView.update(newNode) fires
t=1        this.updating = true
t=1        computeChange(oldDoc, newNode.textContent) → null (already applied)
t=1        this.updating = false
t=2    Observer A fires (XmlFragment changed)
t=2      Serializes XmlFragment → markdown
t=2      Diffs against Y.Text('source')
t=2      Patches Y.Text with origin 'sync-from-tree'
t=3    Persistence debounce timer starts (2000ms)
```

### 4.2 Remote peer edits same rawMdxFallback

```
t=0    Remote Y.Doc update arrives via WebSocket
t=0    y-prosemirror reconstructs PM transaction from CRDT delta
t=0      Updates rawMdxFallback node's text content in XmlFragment
t=0      Dispatches PM transaction with ySyncPluginKey meta
t=1    NodeView.update(newNode) fires
t=1      this.updating = true
t=1      computeChange(cmDoc, newNode.textContent) → {from: 5, to: 5, text: 'x'}
t=1      cm.dispatch({changes: {from: 5, to: 5, insert: 'x'}})
t=1      this.updating = false
t=1    CM updateListener fires → forwardUpdate()
t=1      this.updating === false BUT no doc change after computeChange identity → exits
```

**Critical correctness point:** When `update(node)` fires, it applies a CM change that triggers the `updateListener`. However, `forwardUpdate` only proceeds if `update.docChanged === true`. The CM dispatch from `update()` DOES change the CM doc, so `docChanged` is true. But by this point, the PM transaction has already been applied. The `updating` flag prevents re-dispatch. Sequence:

1. `update(node)` sets `this.updating = true`
2. `cm.dispatch({changes})` triggers `updateListener`
3. `forwardUpdate` sees `this.updating === true` → returns immediately
4. `update(node)` sets `this.updating = false`

### 4.3 Undo (Cmd-Z in nested CM)

```
t=0    User presses Cmd-Z while CM is focused
t=0    CM keymap intercepts → calls undo(view.state, view.dispatch)
t=0    PM undo reverses the last PM transaction
t=0      rawMdxFallback node's text content changes
t=0    NodeView.update(newNode) fires
t=0      computeChange() finds diff → CM applies change
```

Undo is unified with PM's history because all CM edits were forwarded as PM transactions. No per-block undo stack exists — this is the correct behavior for WYSIWYG-integrated editing.

### 4.4 Observer A interaction (XmlFragment → Y.Text bridge)

Observer A serializes the XmlFragment (which includes the rawMdxFallback node's text content) and patches Y.Text('source'). This fires on every XmlFragment change, including those from nested CM edits. The `markUserTyping()` calls on the CM's `contentDOM` ensure Observer B (Y.Text → XmlFragment) is deferred during active editing, preventing circular updates.

---

## 5. Selection + Focus Contract

### 5.1 Focus acquisition

| Trigger | Behavior |
|---------|----------|
| Click inside CM | CM gets browser focus. PM loses focus. `stopEvent() => true` prevents PM from intercepting. |
| Tab from PM block above | Not supported in v1. User must click. (Complexity: PM doesn't know to hand off Tab to a NodeView.) |
| `selectNode()` called by PM | `this.cm.focus()` — places cursor at CM position 0. Fires when node is selected (e.g., via mouse click on the node boundary). |
| Arrow-down from PM block above | Enters CM via outer-editor `arrowHandler` keymap (§6.3). |

### 5.2 Focus release (boundary escape)

| Trigger | Behavior |
|---------|----------|
| ArrowUp at first line of CM | `maybeEscape('line', -1)` → PM focus at `getPos()` (before node) |
| ArrowDown at last line of CM | `maybeEscape('line', 1)` → PM focus at `getPos() + node.nodeSize` (after node) |
| ArrowLeft at position 0 | `maybeEscape('char', -1)` → PM focus before node |
| ArrowRight at end of doc | `maybeEscape('char', 1)` → PM focus after node |
| Escape key | Not handled in v1. Could map to deselect + move PM focus after node. |

### 5.3 Selection state invariant

**Exactly one editor holds focus at any time.** When CM has focus, PM's selection should be a `NodeSelection` of the rawMdxFallback node (so PM knows "selection is inside this NodeView"). When PM has focus elsewhere, CM has no visible cursor.

**Confidence:** HIGH — this is the standard behavior from `stopEvent() => true` + the tutorial pattern.

### 5.4 Multi-instance focus

When multiple rawMdxFallback blocks exist in the same document, only one CM instance can have focus. Browser focus semantics enforce this — `cm.focus()` blurs the previously focused element. No additional coordination is needed.

---

## 6. Keybinding Contract

### 6.1 Keys handled by CM (stopEvent prevents PM from seeing them)

| Key | CM Behavior |
|-----|-------------|
| All printable characters | Normal text insertion into CM |
| Backspace / Delete | CM text deletion |
| Tab | CM indentation (from `defaultKeymap`) |
| Shift-Tab | CM dedent |
| Ctrl/Cmd-D | CM select word (from `defaultKeymap`) |
| Ctrl/Cmd-A | CM select all (within this CM instance) |
| Ctrl/Cmd-F | CM search (from `basicSetup` if included, or omit for nested) |

### 6.2 Keys delegated to PM from CM keymap

| Key | Delegation |
|-----|------------|
| Cmd-Z / Ctrl-Z | `undo(view.state, view.dispatch)` — PM history |
| Cmd-Y / Cmd-Shift-Z | `redo(view.state, view.dispatch)` — PM history |
| ArrowUp (at boundary) | `maybeEscape('line', -1)` → PM focus |
| ArrowDown (at boundary) | `maybeEscape('line', 1)` → PM focus |
| ArrowLeft (at position 0) | `maybeEscape('char', -1)` → PM focus |
| ArrowRight (at end) | `maybeEscape('char', 1)` → PM focus |

### 6.3 Outer PM keymap additions (arrow entry into CM)

An `arrowHandler` keymap on the outer PM editor enables arrow-key entry into nested CM blocks. This is the PM tutorial's `arrowHandler` pattern adapted for rawMdxFallback:

```typescript
function arrowHandler(dir: 'up' | 'down' | 'left' | 'right') {
  return (state: PMState, dispatch?: (tr: Transaction) => void, view?: PmView) => {
    if (!view) return false;
    if (state.selection.empty && view.endOfTextblock(dir)) {
      const side = dir === 'up' || dir === 'left' ? -1 : 1;
      const $head = state.selection.$head;
      const nextPos = Selection.near(
        state.doc.resolve(side > 0 ? $head.after() : $head.before()),
        side,
      );
      if (nextPos.$head?.parent.type.name === 'rawMdxFallback') {
        if (dispatch) dispatch(state.tr.setSelection(nextPos));
        return true;
      }
    }
    return false;
  };
}
```

**Confidence:** HIGH — this is the exact pattern from the PM tutorial.

### 6.4 Keys intentionally NOT handled

| Key | Rationale |
|-----|-----------|
| Enter (to split block) | rawMdxFallback is a single block. Enter inserts a newline within CM. Splitting would require creating two rawMdxFallback nodes — not meaningful. |
| Backspace at position 0 | Does NOT delete the rawMdxFallback node. Content must be intentionally deleted (select node in PM + delete). Matches `code_block` behavior. |
| Escape | Not mapped in v1. Could be added to exit CM focus. |

---

## 7. Extension / Theme Factory Design

### 7.1 Extension reuse matrix

| Extension | SourceEditor | Nested CM | Reuse? | Notes |
|-----------|:---:|:---:|:---:|-------|
| `basicSetup` | Yes | **Partial** | Cherry-pick | Exclude `history()` — undo delegates to PM. Include bracket matching, selection, search. |
| `markdown()` | Yes | Yes | Direct | Same language support for MDX/markdown content. |
| `yCollab(ytext, awareness)` | Yes | **No** | — | Replaced by PM dispatch pattern. |
| `createWikiLinkSourceExtension()` | Yes | Yes | Direct | Stateless decorations + autocomplete. |
| `createMdLinkSourceExtension()` | Yes | Yes | Direct | Stateless decorations + click handler. |
| `createAgentFlashSourceExtension(doc)` | Yes | **Adapted** | Fork | Per-block targeting needed (flash only if this block was edited). |
| `themeCompartment.of(...)` | Singleton | Per-instance | New `Compartment()` per NodeView | Module-scoped singleton causes cross-instance reconfigure conflicts. |
| `EditorView.lineWrapping` | Yes | Yes | Direct | |
| `EditorView.theme({height})` | `100%` | `minHeight: 2em` | Adapted | Nested editors shouldn't fill viewport. |
| Awareness mode (`source`/`wysiwyg`) | Yes | **No** | — | Nested editors are within WYSIWYG surface. |

### 7.2 Theme hot-swap

Each nested CM needs its own `Compartment` for theme switching. Theme changes are detected via a shared mechanism:

**Option A (recommended): MutationObserver on `<html>` class.** The `next-themes` library toggles `.dark` on `document.documentElement`. A single `MutationObserver` dispatches a custom event; each NodeView listens and reconfigures its compartment.

```typescript
// Singleton observer (registered once at app mount)
const observer = new MutationObserver(() => {
  const isDark = document.documentElement.classList.contains('dark');
  window.dispatchEvent(new CustomEvent('theme-change', { detail: { isDark } }));
});
observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
```

**Option B: TipTap editor storage.** Store resolved theme in `editor.storage.theme` and check it in `update()`. Simpler but requires the outer editor to propagate theme changes.

**Confidence:** HIGH for Option A — no coupling to TipTap lifecycle.

### 7.3 Factory signature

```typescript
function createNestedCMExtensions(
  ydoc: Y.Doc,
  resolvedTheme: string,
): Extension[]
```

Returns a flat `Extension[]`. The `Compartment` is captured in the closure — the caller does not need to manage it. Theme changes flow through the DOM event mechanism described above.

**Forward compatibility:** When Component Blocks v2 introduces typed component descriptors, the factory can accept an optional `language: LanguageSupport` parameter to swap `markdown()` for JSX/TSX/Python syntax highlighting per-block.

---

## 8. Y-codemirror.next Evaluation

### 8.1 Technical feasibility: CONFIRMED

`Y.XmlText extends Y.Text` (confirmed at `yjs/src/types/YXmlText.js:11`). y-codemirror.next's `yCollab(ytext, awareness)` uses only the `Y.Text` API surface: `observe()`, `toDelta()`, `applyDelta()`. No XML-specific APIs. Passing a `Y.XmlText` from inside a y-prosemirror-managed node is type-safe and the binding initializes correctly.

### 8.2 Critical risk: DUAL-OBSERVER CONFLICT

If y-codemirror.next binds to the same `Y.XmlText` that y-prosemirror also manages:

1. **Both observe the same Y.XmlText** — y-codemirror.next via `ytext.observe()`, y-prosemirror via `observeDeep()` on the parent XmlFragment.
2. **Different transaction origins** — y-codemirror.next uses `YSyncConfig` instance (reference equality), y-prosemirror uses `ySyncPluginKey`.
3. **No cross-origin guard** — y-prosemirror does not filter on y-codemirror.next's origin, and vice versa.
4. **Double-write risk**: User types in CM → y-codemirror.next writes to Y.XmlText → y-prosemirror sees Y.XmlText change → dispatches PM transaction → PM NodeView update fires → could trigger another CM update → y-codemirror.next observer fires again.

The loop prevention mechanisms are independent and origin-unaware of each other. Whether the changes converge (idempotent no-op) or diverge (infinite loop / content duplication) is **uncharted territory** with no production precedent.

### 8.3 Recommendation: DO NOT USE y-codemirror.next for nested CM

**Confidence:** HIGH

**Use the direct PM dispatch pattern instead.** Reasons:

1. **Proven pattern** — the PM tutorial is the canonical reference; every production implementation uses it.
2. **Single source of truth** — y-prosemirror owns the Y.XmlText; CM is a view-only facade that dispatches PM transactions.
3. **Simpler mental model** — CM → PM transaction → y-prosemirror → CRDT. One direction, one owner.
4. **Origin discipline** — fits cleanly into the existing typed-transaction-origin architecture (precedent #1).
5. **No dual-observer risk** — avoids uncharted territory.

**Cost:** Loss of y-codemirror.next's collaborative cursor rendering within the nested CM. **Mitigation:** rawMdxFallback is a degraded/error state — collaborative cursors are low-value here. If needed later, a lightweight CM decoration plugin that reads from awareness state directly (without y-codemirror.next) is feasible.

---

## 9. Lazy-Init Strategy

### 9.1 Problem

A document with 20+ rawMdxFallback blocks would create 20+ CM instances on load. Each CM `EditorView` allocates DOM, parses extensions, creates state fields, and computes decorations. This is wasteful for blocks off-screen.

### 9.2 Recommended approach: Intersection Observer

**Confidence:** MEDIUM (perf benefit is hypothesis until measured)

```typescript
class RawMdxFallbackCMView {
  private cmInitialized = false;
  private observer: IntersectionObserver | null = null;

  constructor(node, view, getPos, ydoc, resolvedTheme) {
    // ... create dom, badge, reason chrome ...

    // Render static fallback immediately
    this.renderStaticFallback(node);

    // Defer CM creation until visible
    this.observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !this.cmInitialized) {
          this.initCM(node, ydoc, resolvedTheme);
          this.observer?.disconnect();
          this.observer = null;
        }
      },
      { rootMargin: '200px' }, // 200px lookahead
    );
    this.observer.observe(this.dom);
  }

  renderStaticFallback(node: PmNode) {
    const pre = document.createElement('pre');
    pre.className = 'raw-mdx-fallback-content';
    pre.textContent = node.textContent;
    pre.style.contentEditable = 'false';
    this.dom.appendChild(pre);
  }

  initCM(node: PmNode, ydoc: Y.Doc, resolvedTheme: string) {
    // Remove static fallback
    const pre = this.dom.querySelector('pre.raw-mdx-fallback-content');
    if (pre) this.dom.removeChild(pre);

    // Create CM (same as constructor in non-lazy path)
    // ...
    this.cmInitialized = true;
  }

  update(node: PmNode): boolean {
    this.node = node;
    if (!this.cmInitialized) {
      // Update static fallback
      const pre = this.dom.querySelector('pre');
      if (pre) pre.textContent = node.textContent;
      return true;
    }
    // ... normal CM update path ...
  }
}
```

### 9.3 Threshold analysis

| Metric | Per-instance cost (estimated) | At 20 blocks |
|--------|---:|---:|
| CM EditorView DOM nodes | ~50-100 | 1000-2000 |
| CM state computation | ~2-5ms | 40-100ms |
| Memory (state + decorations) | ~50-100KB | 1-2MB |

With lazy init + 200px lookahead, only visible blocks (typically 3-5) incur CM cost. The static `<pre>` fallback is nearly free.

### 9.4 Click-to-edit alternative

For the simplest v1 implementation, the NodeView could render the current static `<pre>` by default and mount CM only on click/focus. This avoids the IntersectionObserver complexity at the cost of a brief mount delay (~5-10ms) when the user clicks to edit.

**Recommended for v1:** Click-to-edit. Graduate to IntersectionObserver if performance profiling shows the mount delay is perceptible.

---

## 10. Test Plan

### 10.1 Unit tests (Layer A — `bun test`)

| Test | File | What it verifies |
|------|------|------------------|
| `computeChange` correctness | `RawMdxFallbackCMView.test.ts` | Minimal diff for insert, delete, replace, identical, empty |
| `forwardUpdate` offset math | `RawMdxFallbackCMView.test.ts` | `getPos() + 1` produces correct PM positions for each CM change |
| `update(node)` applies changes | `RawMdxFallbackCMView.test.ts` | PM → CM sync with computeChange on external update |
| `updating` flag prevents loop | `RawMdxFallbackCMView.test.ts` | forwardUpdate is no-op when updating === true |
| `maybeEscape` boundary logic | `RawMdxFallbackCMView.test.ts` | Returns false mid-doc, true at boundaries |

### 10.2 Integration tests (bridge matrix)

| Test | File | What it verifies |
|------|------|------------------|
| CM edit → Y.Text sync | `bridge-matrix.test.ts` | Nested CM keystroke reaches Y.Text('source') via PM → Observer A |
| Remote CRDT → CM update | `bridge-matrix.test.ts` | Peer edit of rawMdxFallback content appears in CM via y-prosemirror → PM → NodeView.update |
| Agent write to rawMdxFallback | `bridge-matrix.test.ts` | Agent API writes to rawMdxFallback → CM reflects change |
| Undo/redo from nested CM | `bridge-matrix.test.ts` | Cmd-Z in CM invokes PM undo; text reverts in CM |
| Bridge invariant after nested CM edit | `bridge-matrix.test.ts` | `ytext === serialize(fragment)` holds after CM edit settles |

### 10.3 Fidelity tests

| Test | File | What it verifies |
|------|------|------------------|
| rawMdxFallback round-trip with nested edit | `fidelity/` | Edit text in rawMdxFallback via CM, serialize, re-parse: content unchanged |
| I5 (Layer A === Layer B) with nested CM | `fidelity/` | mdManager path and Y.Doc path produce same output for rawMdxFallback content |

### 10.4 Playwright E2E (Layer C)

| Test | File | What it verifies |
|------|------|------------------|
| Click rawMdxFallback → CM appears | `e2e/` | NodeView transitions from static to CM on interaction |
| Type in CM → source mode reflects | `e2e/` | Typed characters appear in source view's Y.Text |
| ArrowUp at line 1 → PM focus above | `e2e/` | Focus escapes CM to previous PM block |
| ArrowDown at last line → PM focus below | `e2e/` | Focus escapes CM to next PM block |
| Theme toggle updates nested CM | `e2e/` | Dark → light → dark: CM theme reconfigures |
| Undo in nested CM | `e2e/` | Cmd-Z reverses last edit in CM |

### 10.5 Stress test extension

| Test | File | What it verifies |
|------|------|------------------|
| Rapid keystroke burst in CM | `stress/` | 50 keystrokes at 20ms interval: bridge invariant holds, no duplicate content |
| Multi-client CM edit | `stress/` | Two clients editing same rawMdxFallback: content converges |

---

## 11. Estimated Effort

| Phase | Deliverable | Complexity |
|-------|-------------|:---:|
| 1 | `RawMdxFallbackCMView` class (§3.1) | Core implementation: forwardUpdate, update, maybeEscape, computeChange, lifecycle |
| 2 | `createNestedCMExtensions` factory (§3.2) | Extension composition: extract from SourceEditor, per-instance Compartment |
| 3 | Extension swap in app-level shared.ts (§3.3) | Wiring: replace ReactNodeViewRenderer with vanilla NodeView factory |
| 4 | Theme change observation | DOM MutationObserver → per-instance compartment reconfigure |
| 5 | Outer PM arrowHandler keymap (§6.3) | PM keymap plugin for arrow-key entry |
| 6 | Unit tests (§10.1) | computeChange, forwardUpdate offset, update, maybeEscape |
| 7 | Integration tests (§10.2) | Bridge matrix additions: CM→Y.Text, remote→CM, undo |
| 8 | Playwright E2E (§10.4) | Click-to-edit, type, escape, theme, undo |

**Dependencies:** None outside existing packages. All CM6 and PM dependencies are already in `packages/app/package.json`. No new npm packages required.

**Risk factor:** Phase 7 (integration tests) is the most likely to surface surprises — the interaction between nested CM dispatch and Observer A's debounce timing may require tuning.

---

## 12. Risks and Mitigations

### R1: Observer A debounce timing with nested CM edits

**Risk (MEDIUM):** Observer A debounces XmlFragment changes by 50ms. Rapid keystrokes in nested CM generate PM transactions that trigger Observer A. If debounce coalesces changes incorrectly, the Y.Text patch may produce incorrect diffs.

**Mitigation:** `markUserTyping()` is already called on the CM's `contentDOM` events (§3.1). Observer A's `lastSyncedXmlMd` baseline refresh logic handles rapid transaction sequences. Integration test (§10.2) will verify.

### R2: `getPos()` returning `undefined`

**Risk (LOW):** TipTap's `getPos()` can return `undefined` if the node has been removed from the document between the CM event and the PM dispatch. The reference implementation guards against this (`if (pos === undefined) return`).

**Mitigation:** Guard check in `forwardUpdate()`. CM changes are silently dropped if the node was removed — this is correct behavior (the user was editing a node that no longer exists).

### R3: CM selection sync in `forwardUpdate`

**Risk (MEDIUM):** The PM tutorial's `forwardUpdate` creates a `TextSelection` from CM's selection state. If the PM transaction includes multiple changes (e.g., a paste with multiple ranges), `tr.mapping.map()` must be applied correctly.

**Mitigation:** The reference implementation maps selection positions through `tr.mapping` after all changes are applied. The known bug (prosemirror.net forum — creating TextSelection before applying changes) is avoided.

**Confidence:** HIGH — the fix is documented and applied.

### R4: Performance with many concurrent nested CM instances

**Risk (LOW for v1, MEDIUM for v2):** rawMdxFallback blocks are degraded-state nodes — documents typically have 0-5. However, Component Blocks v2 could have 10-20+ per-block editors.

**Mitigation:** Lazy-init strategy (§9) with click-to-edit in v1, IntersectionObserver in v2.

### R5: `ignoreMutation` and PM DOM observer

**Risk (LOW):** `ignoreMutation: () => true` tells PM to ignore all DOM changes within the NodeView. This is required because CM manages its own DOM. If `ignoreMutation` fails to fire (e.g., PM version change), PM would interpret CM keystrokes as content edits, causing duplication.

**Mitigation:** Defensive test in Playwright: verify no DOM-observer-induced duplication when typing in nested CM. This is the same pattern used by every prior art implementation.

### R6: Content mismatch between CM doc and PM node

**Risk (LOW):** If `update(node)` is not called reliably (e.g., a PM transaction that modifies the rawMdxFallback node is not reflected to the NodeView), CM and PM diverge.

**Mitigation:** PM's NodeView contract guarantees `update(node)` is called for every transaction that modifies the node. TipTap's `ReactNodeViewRenderer` may swallow some updates — the reference implementation uses a vanilla NodeView (not React) to avoid this risk.

**Confidence:** HIGH for vanilla NodeView; MEDIUM if using ReactNodeViewRenderer.

### R7: Interaction with y-prosemirror patch

**Risk (LOW):** The y-prosemirror patch replaces destructive-delete with rawMdxFallback substitution on schema-throw. Nested CM within rawMdxFallback nodes is architecturally orthogonal — the patch fires during CRDT-to-PM materialization, which happens before NodeViews are created.

**Mitigation:** No action needed. The patch does not affect NodeView lifecycle.

---

## 13. What This Research Did NOT Cover

### 13.1 Not investigated

| Topic | Why excluded | What investigation would look like |
|-------|-------------|-----------------------------------|
| **React NodeViewRenderer vs vanilla NodeView** | Scope limited to architectural pattern. React wrapper adds lifecycle complexity (useEffect, ref management) that can be evaluated during implementation. | Build both, measure mount latency and update reliability. |
| **Per-block collaborative cursors** | Low value for rawMdxFallback (degraded state). Deferred to Component Blocks v2. | Build lightweight CM decoration plugin that reads awareness state directly (without y-codemirror.next). |
| **Accessibility (screen reader)** | CM6 has built-in ARIA support. Nested-editor screen reader behavior needs hands-on testing. | NVDA/VoiceOver testing with focus transitions between PM and nested CM. |
| **Mobile / touch editing** | CM6 has limited mobile support. Touch interactions inside nested NodeViews are complex. | Test on iOS Safari + Android Chrome. |
| **JSX/TSX language support** | rawMdxFallback uses markdown. Component Blocks v2 may need JSX highlighting. | `@codemirror/lang-javascript` with JSX flag. |
| **Diff view within nested CM** | `@codemirror/merge` is in the dependency tree but not evaluated for per-block diff. | Evaluate merge view within a NodeView. |
| **Server-side rendering** | CM6 is browser-only. NodeViews are browser-only. Not relevant for server rendering. | N/A |
| **Performance benchmarks** | No empirical measurement of CM mount time, memory, or transaction latency. | Profile with Chrome DevTools for 5/10/20 block scenarios. |

### 13.2 Gaps in evidence

| Gap | Impact | Resolution |
|-----|--------|------------|
| No production deployment of CM-in-PM with y-prosemirror CRDT | The combination is novel. Individual components are proven, but integration may surface unexpected behavior. | Thorough integration testing (§10.2). |
| `forwardUpdate` paste behavior | The PM forum documents a paste-related bug. The fix is applied in the reference implementation but not tested. | Playwright paste test in nested CM. |
| `NodeView.update()` reliability with TipTap | TipTap's `useEditor` hook may batch or skip NodeView updates in some edge cases. | Use vanilla NodeView for safety; test update reliability in integration. |

---

## 14. Spec Additions Recommended

The following additions are recommended for the Component Blocks v2 spec based on this research.

### 14.1 New architectural precedent

> **Precedent #12: Direct PM dispatch for nested editors.** Embedded editor instances (CodeMirror, Monaco, etc.) within ProseMirror NodeViews use the direct PM transaction dispatch pattern, never direct CRDT bindings (y-codemirror.next, y-monaco, etc.) on shared Y types. CM → PM transaction → y-prosemirror → CRDT. One owner per Y type. This avoids dual-observer conflicts where two CRDT bindings observe the same Y type with independent origin guards.

### 14.2 FR additions (functional requirements)

| ID | Requirement | Rationale |
|----|-------------|-----------|
| FR-30 | rawMdxFallback NodeView MUST embed a CodeMirror 6 editor for inline editing of raw MDX source | NG3 revisit — per-block code editing |
| FR-31 | Nested CM undo/redo MUST delegate to PM history (no per-block undo stack) | Unified undo across the document |
| FR-32 | Nested CM MUST forward `markUserTyping()` to prevent Observer B conflicts | Observer bridge safety |
| FR-33 | Each nested CM MUST create its own `Compartment` for theme switching | Module-scoped singleton causes cross-instance conflicts |
| FR-34 | `stopEvent() => true` and `ignoreMutation() => true` on all nested-CM NodeViews | Prevent PM DOM observer interference |

### 14.3 NG3 revision

Current NG3 text:
> Per-block code editing (editing component JSX source inline in WYSIWYG). Revisit: authoring workflow demands it.

Proposed revision:
> ~~Per-block code editing~~ **Addressed by FR-30–FR-34.** rawMdxFallback embeds a nested CodeMirror 6 instance for inline MDX editing within WYSIWYG. Forward-compatible with per-block JSX editing in Component Blocks v2 via the `createNestedCMExtensions` factory pattern.

### 14.4 New section: §9.X Nested Editor Architecture

Recommended spec section covering:
- Direct PM dispatch pattern (no y-codemirror.next)
- `RawMdxFallbackCMView` lifecycle (create → update → destroy)
- Extension factory reuse from SourceEditor
- Lazy-init strategy (click-to-edit in v1, IntersectionObserver in v2)
- Theme hot-swap via per-instance Compartment
- Outer PM arrowHandler keymap for entry/exit

---

## Evidence Files

| File | Dimension | Contents |
|------|-----------|----------|
| [`evidence/prior-art-survey.md`](evidence/prior-art-survey.md) | D10 | ProseMirror tutorial, MDXEditor (Lexical), BlockNote (Shiki), Tiptap (Lowlight), community repos |
| [`evidence/y-codemirror-nested-binding.md`](evidence/y-codemirror-nested-binding.md) | D7 | Y.XmlText extends Y.Text, dual-observer risk analysis, direct PM dispatch recommendation |
| [`evidence/codebase-current-state.md`](evidence/codebase-current-state.md) | D6/D7 | Full dependency versions, SourceEditor extension list, rawMdxFallback schema, reusability matrix |

---

## Confidence Summary

| Section | Key Recommendation | Confidence |
|---------|-------------------|:---:|
| §1 | Direct PM dispatch over y-codemirror.next | HIGH |
| §3 | Reference implementation structure | HIGH |
| §4 | Sync lifecycle correctness | HIGH |
| §5 | Focus/selection contract | HIGH |
| §6 | Keybinding delegation | HIGH |
| §7 | Extension factory reuse | HIGH |
| §8 | y-codemirror.next rejection | HIGH |
| §9 | Lazy-init via click-to-edit (v1) | MEDIUM |
| §10 | Test plan completeness | MEDIUM |
| §12 | Risk identification | MEDIUM |
