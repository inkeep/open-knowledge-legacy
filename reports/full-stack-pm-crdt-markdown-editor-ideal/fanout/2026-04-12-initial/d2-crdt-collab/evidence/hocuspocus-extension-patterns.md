# Evidence: Hocuspocus Extension Patterns and Schema Constraints

## Source
- `node_modules/@hocuspocus/server/src/types.ts` — Extension interface
- `node_modules/@hocuspocus/server/src/Hocuspocus.ts` — Hook chain execution
- `node_modules/@hocuspocus/server/src/Document.ts` — Document class
- `packages/server/src/persistence.ts` — Project's persistence extension
- `packages/server/src/api-extension.ts` — Project's API extension

## Key Finding: Hocuspocus is Completely Schema-Agnostic

Hocuspocus is a generic Y.Doc collaboration server. It has **no awareness of ProseMirror, node types, marks, or any document schema**. All schema-specific logic lives in extensions.

### Extension Hook Lifecycle

Extensions implement optional hooks that fire in priority order:

```
Document Creation:
  onCreateDocument → onLoadDocument → afterLoadDocument

Client Connection:
  onUpgrade → onConnect → onAuthenticate → connected → beforeSync

Document Changes:
  beforeHandleMessage → onChange → onStoreDocument → afterStoreDocument

Awareness:
  onAwarenessUpdate

Disconnection:
  onDisconnect → beforeUnloadDocument → afterUnloadDocument

Server:
  onConfigure → onListen → onRequest → onDestroy
```

### Hook Chain Execution (Hocuspocus.ts lines 509-543)

Extensions are sorted by `priority` (higher = earlier). Hooks execute sequentially via promise chain. An extension can halt further processing by throwing `SkipFurtherHooksError`.

### Document Class (Document.ts)

```typescript
class Document extends Y.Doc {
  // Minimal scaffolding — just extends Y.Doc with:
  name: string      // Document identifier
  awareness: Awareness
  // No schema, no node types, no marks
}
```

### Where Schema Lives in This Project

Schema-specific logic is entirely in the persistence extension:

1. **`onLoadDocument`** (persistence.ts lines 311-369):
   - Reads markdown from disk
   - Parses via `MarkdownManager.parse()` → ProseMirror JSON
   - Converts to PM node via `schema.nodeFromJSON(json)`
   - Applies to `Y.XmlFragment('default')` via `updateYFragment()`

2. **`onStoreDocument`** (persistence.ts lines 371-430):
   - Reads `Y.XmlFragment('default')`
   - Converts via `yXmlFragmentToProsemirrorJSON()` → PM JSON
   - Serializes via `MarkdownManager.serialize()` → markdown text
   - Writes to disk

3. **Schema instance** (persistence.ts line 44):
   ```typescript
   const schema = getSchema(sharedExtensions)
   ```

### Available Official Extensions

| Extension | Schema Awareness | Purpose |
|-----------|-----------------|---------|
| `@hocuspocus/extension-database` | None | Generic persistence via callbacks |
| `@hocuspocus/extension-logger` | None | Console logging of hook calls |
| `@hocuspocus/extension-throttle` | None | Connection rate limiting |
| `@hocuspocus/extension-monitor` | None | Metrics/monitoring |
| `@hocuspocus/transformer` | **Yes** — imports y-prosemirror | `TiptapTransformer`: Y.Doc ↔ PM JSON |

### The Transformer (Schema-Aware)

`@hocuspocus/transformer` is the only official package that touches ProseMirror schema:

```typescript
// TiptapTransformer.fromYdoc(ydoc, field, extensions)
// TiptapTransformer.toYdoc(content, field, extensions)
```

It uses `getSchema()` from `@tiptap/core` and `yXmlFragmentToProsemirrorJSON` / `updateYFragment` from y-prosemirror. This is functionally identical to what the project's persistence extension does manually.

### Document Structure Conventions (Project-Specific)

The project establishes these conventions — Hocuspocus itself enforces none of them:

```
Y.Doc
├── Y.XmlFragment('default')  ← Root content (ProseMirror tree)
├── Y.Text('source')          ← Raw markdown (CodeMirror source mode)
├── Y.Map('metadata')         ← Frontmatter key-value pairs
└── Y.Map('activity')         ← Agent write attribution
```

### No Server-Side Schema Validation

Hocuspocus broadcasts all Y.Doc updates without validation. If a client sends an update that creates an invalid Y.XmlElement (wrong nodeName, bad attributes), the server will:
1. Accept the update
2. Broadcast it to all connected clients
3. Store it via `onStoreDocument`

Schema enforcement is client-side only (ProseMirror schema validation + y-prosemirror's destructive catch block).

## Implications

1. **Hocuspocus imposes zero schema constraints** — it's a pure Y.Doc relay
2. **Schema changes don't require server updates** — only client-side extensions and persistence serialization need updating
3. **The persistence extension is the schema-coupling point** — swapping parsers/serializers is the migration lever
4. **Server-side schema validation is possible** via a custom extension in `onChange` hook, but not built in
5. **Extension composition is sequential, not middleware-style** — order matters for hooks like `onLoadDocument`
