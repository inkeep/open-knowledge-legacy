---
id: e04
title: Block Editing UI - Form Auto-Generation and Collapsible/Drawer Pattern
source: packages/richtext-lexical/src/features/blocks/client/component/BlockContent.tsx
lines: 95-140
type: source-code
dimension: D2
confidence: high
---

# Block Editing UI Architecture

## BlockContent Component (lines 95-140)

The core rendering decision: if a custom `Block` component is provided via `admin.components.Block`, render that; otherwise, auto-generate the form.

```typescript
export const BlockContent: React.FC<BlockContentProps> = (props) => {
  const { Collapsible, ...contextProps } = props
  const { BlockDrawer, CustomBlock, errorCount, formSchema } = contextProps
  const hasSubmitted = useFormSubmitted()
  const fieldHasErrors = hasSubmitted && errorCount > 0
  const isEditable = useLexicalEditable()

  return CustomBlock ? (
    // Custom block component gets full context via React context
    <BlockComponentContext value={{ ...contextProps, BlockCollapsible: CollapsibleWithErrorProps }}>
      {CustomBlock}
      <BlockDrawer />
    </BlockComponentContext>
  ) : (
    // Auto-generated form from block schema
    <CollapsibleWithErrorProps>
      <RenderFields
        fields={formSchema}
        forceRender={true}
        parentIndexPath=""
        parentPath={''}
        parentSchemaPath=""
        permissions={true}
        readOnly={!isEditable}
      />
    </CollapsibleWithErrorProps>
  )
}
```

## Editing Experience

1. **Collapsible in-editor**: Blocks render as collapsible sections directly in the editor. The header shows the block type pill, block name, error count, and edit/remove buttons.
2. **Drawer for detailed editing**: Clicking "Edit" opens a right-side drawer with the full block form.
3. **Auto-generated forms**: `RenderFields` from `@payloadcms/ui` automatically generates form fields from the block schema — text inputs, selects, relationships, uploads, nested rich text editors, etc.
4. **Custom block override**: Developers can provide a custom React component via `admin.components.Block` that receives all block context via `useBlockComponentContext()`.
5. **Error tracking**: Validation errors bubble up and show an error count badge in the collapsible header.

## Block Insertion (client/plugin/index.tsx, lines 51-76)

```typescript
editor.registerCommand<InsertBlockPayload>(
  INSERT_BLOCK_COMMAND,
  (payload: InsertBlockPayload) => {
    editor.update(() => {
      const selection = $getSelection() || $getPreviousSelection()
      if ($isRangeSelection(selection)) {
        const blockNode = $createBlockNode(payload)
        const { focus } = selection
        const focusNode = focus.getNode()
        $insertNodeToNearestRoot(blockNode)
        // Remove empty paragraph if cursor was in one
        if ($isParagraphNode(focusNode) && !focusNode.__first) {
          focusNode.remove()
        }
      }
    })
    return true
  },
  COMMAND_PRIORITY_EDITOR,
)
```

Blocks are inserted via slash menu (`/`) or toolbar dropdown, dispatching `INSERT_BLOCK_COMMAND`.
