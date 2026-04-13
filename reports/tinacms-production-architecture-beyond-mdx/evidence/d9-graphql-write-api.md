Dimension: D9 — Typed GraphQL Write API Depth
Date: 2026-04-13
Sources: TinaCMS monorepo (packages/@tinacms/graphql/), GraphQL schema generation, resolver implementation, database write path

## Key Files Referenced

- `packages/@tinacms/graphql/src/builder/index.ts` — GraphQL schema builder, mutation generation, InputObjectTypeDefinitions
- `packages/@tinacms/graphql/src/resolver/index.ts` — Mutation resolver, validation pipeline, field matching
- `packages/@tinacms/graphql/src/database/index.ts` — Database write path, bridge.put integration
- `packages/@tinacms/mdx/src/stringify/index.ts` — serializeMDX (Plate AST → markdown), throws on string input
- `packages/@tinacms/graphql/src/resolver/media.ts` — Media mutations (separate from content)

## Findings

### Complete mutation surface [Confidence: HIGH]

TinaCMS exposes 7 content mutations:

**5 generic (collection-agnostic):**
1. `addPendingDocument(collection, relativePath, template)` — creates placeholder for Editorial Workflow
2. `createDocument(collection, relativePath, params)` — creates new content file
3. `updateDocument(collection, relativePath, params)` — updates existing content file
4. `deleteDocument(collection, relativePath)` — deletes content file
5. `createFolder(collection, relativePath)` — creates directory

**2 per collection (auto-generated from schema):**
1. `create<CollectionName>(relativePath, params)` — typed create with collection-specific input
2. `update<CollectionName>(relativePath, params)` — typed update with collection-specific input

There is no per-collection delete mutation — deletion only via the generic `deleteDocument`.

### No batch, move, or rename mutations [Confidence: HIGH]

There is no multi-document mutation. Each mutation operates on exactly one document. To update 10 documents, an agent must make 10 separate GraphQL requests.

There is no explicit move or rename mutation. Document rename is achieved by calling `updateDocument` with a new `relativePath` in the params. This creates a new file and does not delete the old one — the agent must issue a separate `deleteDocument` call to complete the rename.

### Fully typed schema-generated input types [Confidence: HIGH]

The GraphQL schema builder generates `InputObjectTypeDefinition` types for every collection's fields. These are not freeform JSON — they are strongly typed:

```graphql
input PostMutation {
  title: String
  body: PostBodyMutation  # rich-text input type
  tags: [String]
  author: PostAuthorMutation  # reference input
}
```

Each field type (string, number, boolean, datetime, image, reference, rich-text, object) has a corresponding input type with appropriate scalar types. Template-polymorphic fields generate union input types with template discriminators.

### Multi-layer validation pipeline [Confidence: HIGH]

Mutations pass through multiple validation layers before reaching the filesystem:

1. **GraphQL type enforcement** — schema-level type checking rejects wrong types at the GraphQL layer
2. **Yup `assertShape`** — runtime shape validation on the resolved params object
3. **Collection name validation** — confirms the target collection exists in the schema
4. **Path traversal security** — rejects `../` and absolute paths in `relativePath`
5. **Glob matching** — confirms the file path matches the collection's configured file patterns
6. **Field name matching** — each field in params must correspond to a field in the schema definition
7. **Existence checks** — create fails if file exists; update fails if file doesn't exist

### Rich-text requires Plate AST JSON [Confidence: HIGH]

Rich-text fields (markdown/MDX body content) must be provided as Plate AST JSON, not as raw markdown strings. The `serializeMDX` function explicitly throws when it receives a string instead of a Plate AST object:

```ts
if (typeof value === 'string') {
  throw new Error('Expected Plate AST, received string');
}
```

This means agents writing rich-text content must:
1. Construct a valid Plate AST tree (with correct node types, children arrays, text leaves)
2. Handle template-specific node types for MDX components
3. Know the exact Plate node schema for each rich-text construct (headings, lists, code blocks, etc.)

This is a significant friction point for programmatic access — constructing Plate AST is substantially harder than writing raw markdown.

### Nested MDX components with rich-text children writable [Confidence: HIGH]

The typed input system supports nested MDX components:
```graphql
input HeroMutation {
  heading: String
  body: HeroBodyMutation  # rich-text, can contain other components
}
```

Rich-text children within MDX components are writable via the same Plate AST mechanism. The nesting depth is limited only by the schema definition, not by any API constraint.

### Errors are plain text strings, no error codes [Confidence: HIGH]

All mutation errors are thrown as plain JavaScript Error objects with string messages. There are no structured error codes, no error categories, no machine-readable error taxonomy. Examples:

- `"Document does not exist at path posts/foo.md"`
- `"Collection 'stuff' not found"`
- `"Path traversal detected in relativePath"`

An agent must pattern-match on error message strings to determine the failure type. Error messages are not guaranteed stable across versions — they are developer-facing debug strings, not API contracts.

### No dry-run or validate-only mode [Confidence: HIGH]

There is no way to validate a mutation without executing it. No `dryRun: true` parameter, no `validateOnly` flag, no separate validation endpoint. To check if a mutation would succeed, you must run it — and handle the side effects (file creation, git commit via bridge.put).

### No concurrency control at API layer [Confidence: HIGH]

Mutations go through `Database.put → Bridge.put` with no version tokens, ETags, or compare-and-swap semantics. Two concurrent `updateDocument` calls for the same file both succeed — last writer wins, silently. This matches the D3/D8 findings: concurrency control is absent at every layer.

### Document rename only via generic updateDocument [Confidence: MODERATE]

The per-collection `update<CollectionName>` mutation does not support path changes — it operates on a fixed `relativePath`. Only the generic `updateDocument` mutation accepts `relativePath` as a mutable param for rename. This means per-collection typed mutations (the "nice" API) cannot rename documents.

## Negative Searches

- No `batchCreate`, `batchUpdate`, `bulkWrite`, or `transactional` mutations
- No `dryRun`, `validateOnly`, `preview`, or `simulate` parameters on any mutation
- No `version`, `etag`, `expectedVersion`, `ifMatch` parameters on any mutation
- No structured error codes (`ERROR_NOT_FOUND`, `ERROR_VALIDATION`, etc.)
- No mutation for moving a document between collections
- No webhook or event system for mutation notifications

## Gaps

- Whether Tina Cloud's API layer adds any additional mutations beyond what's in the OSS GraphQL schema — unlikely but cannot confirm without cloud API access
- Rate limiting behavior on the GraphQL mutation endpoint (Tina Cloud may apply limits; self-hosted has none)
- Whether the Plate AST input format is documented anywhere for agent consumers — no dedicated documentation found; agents must reverse-engineer from schema introspection or source code
