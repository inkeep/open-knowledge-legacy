# SPEC: U1.2 Component Slash Insert + Prop Panel

**Status:** Final
**Created:** 2026-04-09
**Scope:** Enhancement
**Primary story:** `STORIES.md` U1.2
**Related prior art:** `specs/2026-04-08-typed-component-nodes/SPEC.md`
**Target area:** `init_spike/`

## 1. Problem statement

The spike editor can render a `jsxComponent` block, but the current path is still a prototype:

- insertion requires raw fenced JSX content; there is no slash-command entry point
- the node stores one opaque `content` string and the node view only recognizes a Callout-shaped regex
- there is no visual prop editor, so changing a component means hand-editing JSX in source mode

This blocks the first real component-authoring workflow. A knowledge worker should be able to insert a built-in component from WYSIWYG mode and adjust its supported props without leaving the visual editor.

## 2. Goal

Ship the first usable component authoring loop for built-in MDX-like components in `init_spike`:

- type `/` in WYSIWYG mode and choose a built-in component
- insert one of: `Callout`, `Tabs`, `CodeGroup`, `Steps`, `Accordion`, `Card`, `Embed`
- click the inserted block to open a visual prop panel
- change supported primitive props in the panel and see both the preview and serialized markdown update

## 3. Non-goals

- replacing the current fenced `jsx-component` on-disk format with raw JSX
- implementing typed ProseMirror attributes or inline rich-text child editing
- auto-discovering project components from TypeScript files
- enforcing structural rules such as `Tab` only inside `Tabs`
- full fumadocs parity for every prop and every nested child shape

## 4. Product requirements

### 4.1 Supported components

The slash menu must offer these built-ins:

- `Callout`
- `Tabs`
- `CodeGroup`
- `Steps`
- `Accordion`
- `Card`
- `Embed`

Each item needs:

- a human label
- a default inserted template
- a preview renderer
- a prop schema for the visual panel

### 4.2 Editing behavior

- Selecting or clicking a component block opens its prop panel.
- The panel only exposes supported primitive props: string, boolean, number, enum.
- Props that are not yet safely editable in the spike remain fixed in the template and are not shown as controls.
- Changing a prop updates:
  - the rendered component preview
  - the node's serialized fenced JSX content
  - source mode output after observer sync

### 4.3 UX baseline

- Slash menu is keyboard navigable.
- Inserted components use meaningful starter content so the preview is immediately legible.
- Unknown or malformed component content still falls back to the existing raw-code display instead of corrupting the document.

## 5. Technical design

### 5.1 Stay on the current atom-node model

For this story, keep `jsxComponent` as an atom node with a single `content` attribute. This is the lowest-risk path because:

- observer sync and fenced-code serialization already work
- the existing tests are built around `jsx-component` fences
- the story requires insertion and prop editing, not the broader Layer 2/3 architecture

The prop panel will parse the stored JSX string into a registry-backed model, then serialize back to the same string after edits.

### 5.2 Add a local built-in component registry

Introduce a registry module for the spike editor that defines, per component:

- `name`
- `displayName`
- `searchTerms`
- `defaultTemplate()`
- `parse(raw)`
- `serialize(model)`
- `preview(model)`
- `propDefs`

This replaces the hardcoded `Callout` regex path in `JsxComponentView.tsx`.

### 5.3 Add a slash-command surface to the editor shell

There is no existing slash-command extension in `init_spike`, so this work includes a small editor-local implementation that:

- detects `/` commands in the WYSIWYG editor
- shows a filtered list of component items
- inserts the selected component via `insertJsxComponent`

The initial implementation can be editor-local and component-only; it does not need to become a general command palette yet.

### 5.4 Add a visual prop panel inside the node view

The `JsxComponentView` should render:

- the component preview
- a lightweight inspector panel when the block is selected

The panel can be inline beneath the preview rather than a floating side sheet. That keeps the spike implementation simple while still satisfying the visual editing requirement.

### 5.5 Supported props in this spike

The panel must support the primitive props that make each built-in usable in the spike:

- `Callout`: `type`
- `Tabs`: container label props if present; otherwise no editable props and a clear empty-state message
- `CodeGroup`: title/label props if present
- `Steps`: currently no editable primitive props is acceptable
- `Accordion`: item title if represented as a primitive prop in the default template
- `Card`: `title`, `href`
- `Embed`: `src`, `title`

If a component currently has no safe primitive prop in the spike representation, it still must be insertable through slash command. The panel should clearly state that no editable props are exposed yet rather than pretending the block is broken.

## 6. Acceptance criteria

### AC1. Slash insertion

- Typing `/callout`, `/tabs`, `/codegroup`, `/steps`, `/accordion`, `/card`, or `/embed` in WYSIWYG mode shows the matching command.
- Choosing a command inserts the corresponding component block at the cursor.

### AC2. Visual prop editing

- Clicking an inserted `Callout` opens a panel with a `type` control.
- Changing `type` updates the preview styling and the serialized JSX content.
- At least one non-Callout component demonstrates the same round-trip for a string prop.

### AC3. Serialization and source mode

- After editing props in WYSIWYG mode, source mode reflects the updated fenced JSX.
- Existing `jsx-component` round-trip behavior remains intact for unknown content.

### AC4. Regression safety

- Existing observer-sync behavior for `jsx-component` blocks still passes.
- Existing markdown serialization tests for fence sizing still pass.

## 7. Test plan

- unit tests for the component registry parse/serialize behavior
- unit tests for slash command item generation and insertion templates
- node-view tests for prop panel state changes if practical
- end-to-end coverage for:
  - insert Callout via slash menu
  - change Callout `type` via panel
  - verify source mode shows updated fenced JSX

## 8. Open questions resolved for this ship run

- **Raw JSX vs fenced `jsx-component`:** keep fenced format for this story
- **Full typed-node architecture vs minimal enhancement:** use the minimal enhancement
- **Panel placement:** inline panel in the node view is sufficient
- **Component inventory:** ship the seven components named in U1.2, even if some expose zero editable primitive props in this first cut
