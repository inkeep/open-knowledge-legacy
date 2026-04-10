---
title: PTE Editing Architecture — Block Object Rendering and Insert Flow
source: sanity monorepo (primary source)
files:
  - packages/sanity/src/core/form/inputs/PortableText/Compositor.tsx (lines 198-280)
  - packages/sanity/src/core/form/inputs/PortableText/toolbar/helpers.tsx (lines 162-192)
  - packages/sanity/src/core/form/inputs/PortableText/toolbar/Toolbar.tsx (lines 215-235)
  - packages/sanity/src/core/form/inputs/PortableText/object/BlockObject.tsx (lines 60-120)
  - packages/sanity/src/core/form/inputs/PortableText/object/modals/ObjectEditModal.tsx (lines 1-87)
confidence: high
dimension: D2
---

# PTE Editing Architecture

## Editor Engine

Sanity Studio's PTE wraps `@portabletext/editor` (v6.6.0), not Slate directly. The bridge between Sanity schemas and the PT editor is `@portabletext/sanity-bridge`.

```
PortableTextInput.tsx (main wrapper, props + state)
  → EditorProvider (@portabletext/editor)
    → Compositor.tsx (render dispatch: text blocks vs object blocks)
      → Editor.tsx (editable area + toolbar)
        → PortableTextEditable (@portabletext/editor)
```

## Block Type Dispatch (Compositor.tsx:269-280)

```typescript
const editorRenderBlock = useCallback(
  (blockProps: EditorBlockRenderProps) => {
    const {value: block} = blockProps
    const isTextBlock = block._type === schemaTypes.block.name
    if (isTextBlock) {
      return renderTextBlock(blockProps)   // → <TextBlock>
    }
    return renderObjectBlock(blockProps)    // → <BlockObject>
  },
  [schemaTypes.block.name, renderObjectBlock, renderTextBlock],
)
```

The compositor resolves the Sanity schema type from `schemaTypes.blockObjects`:
```typescript
const sanitySchemaType = schemaTypes.blockObjects.find(
  (type) => type.name === blockSchemaType.name,
)
```

## Insert Flow (Toolbar.tsx:215-235)

```typescript
handleInsertBlock = async (type: ObjectSchemaType) => {
  const initialValue = await resolveInitialValue(type)
  const path = PortableTextEditor.insertBlock(editor, type, initialValue)
  if (path) { onMemberOpen(path) }  // Opens edit modal immediately
}

handleInsertInline = async (type: ObjectSchemaType) => {
  const initialValue = await resolveInitialValue(type)
  const path = PortableTextEditor.insertChild(editor, type, initialValue)
  if (path) { onMemberOpen(path) }
}
```

## Insert Menu Items (helpers.tsx:162-192)

```typescript
export function getInsertMenuItems(types, disabled, onInsertBlock, onInsertInline) {
  const blockItems = types.blockObjects.map((type, i) => ({
    handle: () => onInsertBlock(type),
    icon: getInsertMenuIcon(type, BlockElementIcon),
    inline: false,
    key: `block-${i}`,
    type,
  }))
  const inlineItems = types.inlineObjects.map((type, i) => ({
    handle: () => onInsertInline(type),
    icon: getInsertMenuIcon(type, InlineElementIcon),
    inline: true,
    key: `inline-${i}`,
    type,
  }))
  return blockItems.concat(inlineItems).filter((item) => !item.type?.hidden)
}
```

## Edit Modal System (ObjectEditModal.tsx)

Custom blocks open in either a **dialog** or **popover** based on schema options:

```typescript
const schemaModalOption = _getModalOption(schemaType) // reads schemaType.options?.modal
const modalType = schemaModalOption?.type || defaultType  // 'dialog' or 'popover'
```

Three modal variants:
1. `PopoverEditDialog` — lightweight popover anchored to the block
2. `EnhancedObjectDialog` — nested navigation-enabled dialog
3. `DefaultEditDialog` — standard full dialog

The modal receives `{children}` containing the auto-generated form built from the object's schema fields.

## Key insight: Edit UI is auto-generated

When a user double-clicks a custom block in the editor:
1. The system reads the object's schema fields
2. Sanity's form system auto-generates input components for each field
3. The form is rendered inside a modal dialog
4. No manual form building is required — the schema drives the UI

## Source
- Repo: https://github.com/sanity-io/sanity
