---
id: e03
title: Lexical Node Implementation (DecoratorBlockNode)
source: packages/richtext-lexical/src/features/blocks/server/nodes/BlocksNode.tsx
lines: 1-160
type: source-code
dimension: D2
confidence: high
---

# Block Lexical Node Implementation

## Server Node Class (lines 39-141)

```typescript
export class ServerBlockNode extends DecoratorBlockNode {
  __cacheBuster: number
  __fields: BlockFields

  constructor({ cacheBuster, fields, format, key }) {
    super(format, key)
    this.__fields = fields
    this.__cacheBuster = cacheBuster || 0
  }

  static override getType(): string { return 'block' }

  static override importJSON(serializedNode: SerializedBlockNode): ServerBlockNode {
    if (serializedNode.version === 1) {
      // Version migration: v1 had fields wrapped in unnecessary `data` property
      serializedNode = {
        ...serializedNode,
        fields: { ...(serializedNode as any).fields.data },
        version: 2,
      }
    }
    const node = $createServerBlockNode(serializedNode.fields)
    node.setFormat(serializedNode.format)
    return node
  }

  override exportJSON(): SerializedBlockNode {
    return {
      ...super.exportJSON(),
      type: 'block',
      fields: this.getFields(),
      version: 2,
    }
  }

  setFields(fields: BlockFields, preventFormStateUpdate?: boolean): void {
    const writable = this.getWritable()
    writable.__fields = fields
    if (!preventFormStateUpdate) {
      writable.__cacheBuster++  // Triggers form re-render
    }
  }
}
```

## Client Node Class (client/nodes/BlocksNode.tsx, lines 16-70)

```typescript
export class BlockNode extends ServerBlockNode {
  override decorate(_editor: LexicalEditor, config: EditorConfig): JSX.Element {
    return (
      <BlockComponent
        cacheBuster={this.getCacheBuster()}
        className={config.theme.block ?? 'LexicalEditorTheme__block'}
        formData={this.getFields()}
        nodeKey={this.getKey()}
      />
    )
  }
}
```

## Key Architectural Patterns

1. **DecoratorBlockNode base**: Blocks extend Lexical's `DecoratorBlockNode`, which renders via React components (`decorate()` method) rather than DOM manipulation.
2. **Server/Client split**: The server node stores data and handles serialization. The client node adds the `decorate()` method that renders the React UI.
3. **Cache buster pattern**: `__cacheBuster` counter is incremented on `setFields()` to force React re-renders when block data changes.
4. **Version migration**: `importJSON` handles v1→v2 migration inline, allowing safe schema evolution.
5. **BSON ObjectID for block IDs**: Uses `bson-objectid` to generate unique block instance IDs.
