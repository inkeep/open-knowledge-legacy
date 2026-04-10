# Outline — Backlink Database & Extraction Source Code Evidence

## Database Schema

### `relationships` table (migrated from `backlinks`)
**File:** `server/migrations/20190706213213-backlinks.js:3`
- Original `backlinks` table created July 2019

**File:** `server/migrations/20250601223331-migrate-backlink-to-relationship.js:8`
- Renamed to `relationships` with type ENUM (`backlink`, `similar`)

### Sequelize model
**File:** `server/models/Relationship.ts:14-17`
```typescript
export enum RelationshipType {
  Backlink = "backlink",
  Similar = "similar",
}
```

**File:** `server/models/Relationship.ts:19-51`
- Columns: `documentId` (target), `reverseDocumentId` (source), `userId`, `type`
- If Doc A links to Doc B: `documentId = B.id`, `reverseDocumentId = A.id`

### Access-controlled queries
**File:** `server/models/Relationship.ts:60-83`
- `findSourceDocumentIdsForUser()` — user-scoped backlink query
**File:** `server/models/Relationship.ts:92-106`
- `findSourceDocumentIdsInSharedTree()` — public share backlink filtering

## Link Extraction

### BacklinksProcessor (async queue processor)
**File:** `server/queues/processors/BacklinksProcessor.ts:9-13`
- Events: `documents.publish`, `documents.update`, `documents.delete`

**File:** `server/queues/processors/BacklinksProcessor.ts:24`
- Calls `DocumentHelper.parseDocumentIds(document)`

**File:** `server/queues/processors/BacklinksProcessor.ts:110-119`
- Stale backlink cleanup on update: `Relationship.destroy` with `Op.notIn`

### ProseMirror AST walking
**File:** `server/models/helpers/ProsemirrorHelper.tsx:148-184`
- Walks mention nodes (`MentionType.Document`) → extracts `node.attrs.modelId`
- Walks link marks → extracts href → `parseDocumentSlug()`

### URL slug parser
**File:** `shared/utils/parseDocumentSlug.ts:9-25`
- Parses `/doc/{slugified-title}-{urlId}` to extract stable identifier

## Link Resolution / Rename Stability

### Stable `urlId` — links survive renames
**File:** `server/models/Document.ts:500-502`
- `urlId` assigned once at creation, never changes

**File:** `server/models/Document.ts:431-441`
- URL: `/doc/{slugified-title}-{urlId}`

**File:** `server/models/Document.ts:790-794`
- Resolution: regex extracts `urlId` for lookup, ignoring title portion

## API

### `relationships.list` (POST)
**File:** `server/routes/api/relationships/relationships.ts:55-98`
- Filters: `type`, `documentId`, `reverseDocumentId`. Paginated.

### `documents.list` with `backlinkDocumentId` (POST, legacy)
**File:** `server/routes/api/documents/schema.ts:92-93`
**File:** `server/routes/api/documents/documents.ts:110-228`
- Returns all documents that link to specified document

### Frontend consumption
**File:** `app/stores/DocumentsStore.ts:260-291`
- `fetchRelationships(documentId)` partitions into `backlinks` and `similar` Maps

**File:** `app/scenes/Document/components/References.tsx:22-114`
- Tabbed UI: "Documents" (children) + "Backlinks" tabs
