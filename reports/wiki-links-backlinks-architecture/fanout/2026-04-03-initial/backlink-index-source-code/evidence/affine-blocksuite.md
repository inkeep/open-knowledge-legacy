# AFFiNE/BlockSuite — Link Architecture Source Code Evidence

## Backlink Feature: NOT PRESENT in BlockSuite

BlockSuite is the **editor framework** — it has mature forward-link support but NO backlink indexing, NO reverse-link tracking, NO graph data structure.

### Evidence of absence
- "backlink" only appears in `.vscode/settings.template.json:19` (spell-check dictionary)
- No `Index`, `Graph`, `ReverseLink`, `Backlink`, `InboundLink` classes in `packages/framework/` or `packages/affine/`
- `WorkspaceMeta` has no link-tracking fields
- `Workspace` has no graph or index API

## Forward Link Types (5 cross-document mechanisms)

### 1. Inline Reference (`AffineReference`)
**File:** `packages/affine/shared/src/types/index.ts:48-53`
```typescript
reference?: ({
  type: 'Subpage' | 'LinkedPage';
} & ReferenceInfo) | null;
```

**File:** `packages/affine/inlines/reference/src/utils.ts:4-21`
- `insertLinkedNode()` inserts `REFERENCE_NODE` (space char) with `{ reference: { type: 'LinkedPage', pageId: docId } }`

### 2. Embed Linked Doc Block (`affine:embed-linked-doc`)
**File:** `packages/affine/model/src/blocks/embed/linked-doc/linked-doc-model.ts:16-20`
- Props: `EmbedLinkedDocBlockProps = { style, caption, footnoteIdentifier } & ReferenceInfo`

### 3. Embed Synced Doc Block (`affine:embed-synced-doc`)
**File:** `packages/affine/model/src/blocks/embed/synced-doc/synced-doc-model.ts:12-22`
- Props: `{ style, caption, scale, preFoldHeight } & ReferenceInfo & GfxCompatibleProps`

### 4. Footnote Reference
**File:** `packages/affine/model/src/consts/doc.ts:8-10`
- `FootNoteReferenceTypes = ['doc', 'attachment', 'url']`

### 5. View conversion between link types
**File:** `packages/affine/blocks/embed-doc/src/embed-linked-doc-block/embed-linked-doc-block.ts:140-192`
- `convertToEmbed()` / `convertToInline()` — converts between inline ref, card, and embed views

## Core Data Structure: `ReferenceInfo`

**File:** `packages/affine/model/src/consts/doc.ts:52-59`
```typescript
export const ReferenceInfoSchema = z.object({
  pageId: z.string(),
  params: ReferenceParamsSchema.optional(),
}).merge(AliasInfoSchema);
```

**ReferenceParams** (line 38-48): deep-linking into blocks/elements/database rows/viewport positions
**AliasInfo** (line 21-28): custom display title/description overrides

## What a backlink implementation would need to scan

**File:** `packages/affine/shared/src/adapters/middlewares/replace-id.ts:47-85`
- Inline references: walk `ParagraphBlockModel`/`ListBlockModel` text deltas for `d.attributes?.reference?.pageId`
- Block references: walk `EmbedLinkedDocModel`/`EmbedSyncedDocModel` for `model.props.pageId`

This middleware (used during import) demonstrates the full scan pattern required to build a backlink index.
