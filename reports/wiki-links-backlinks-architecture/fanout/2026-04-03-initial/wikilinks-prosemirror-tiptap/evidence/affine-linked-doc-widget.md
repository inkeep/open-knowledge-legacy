# Evidence: AFFiNE/BlockSuite Linked Doc Widget

**Source:** AFFiNE BlockSuite editor framework  
**Repo:** https://github.com/toeverything/blocksuite  
**Local path:** `/Users/edwingomezcuellar/.claude/oss-repos/blocksuite/`

## ID-Based Reference System

### Reference Data Structure

**File:** `packages/affine/model/src/consts/doc.ts`, lines 52-59

```typescript
export const ReferenceInfoSchema = z
  .object({
    pageId: z.string(),           // Document's unique ID
    params: ReferenceParamsSchema.optional(),
  })
  .merge(AliasInfoSchema);       // Optional title/description override
```

**Alias Schema** (lines 21-28): Optional `title` and `description` for custom display text.

### Inserting a Linked Page

**File:** `packages/affine/inlines/reference/src/utils.ts`, lines 4-21

```typescript
export function insertLinkedNode({ inlineEditor, docId }) {
  inlineEditor.insertText(inlineRange, REFERENCE_NODE, {
    reference: { type: 'LinkedPage', pageId: docId },
  });
}
```

Only the `pageId` (UUID) is stored. Display text is resolved at render time.

---

## `[[` Trigger: Bracket Conversion

**File:** `packages/affine/inlines/preset/src/keymap/bracket.ts`, lines 72-77

When user types `[` with text selected AND the character before selection is already `[`:
1. Detects `[[selected text]]` pattern
2. Calls `tryConvertToLinkedDoc()`
3. Creates new document with selected text as title
4. Deletes bracket syntax
5. Inserts `LinkedPage` reference node via `insertLinkedNode()`

### Trigger Keys

**File:** `packages/affine/widgets/linked-doc/src/config.ts`

All three trigger the same linked-doc popover: `['@', '[[', '<<']`

---

## Reactive Title Resolution

### Live Title Lookup

**File:** `packages/affine/shared/src/services/doc-display-meta-service.ts`, lines 155-184

```typescript
title(pageId: string, { title }: DocDisplayMetaParams = {}): ReadonlySignal<string> {
  const doc = this.std.workspace.getDoc(pageId);
  if (!doc) {
    return computed(() => title || 'Deleted doc');  // Missing target fallback
  }
  title$ = signal(doc.meta?.title || 'Untitled');
  // Subscribe to title changes for live updates
  const disposable = this.std.workspace.slots.docListUpdated.subscribe(() => {
    title$!.value = doc.meta?.title || 'Untitled';
  });
}
```

Title is NEVER stored in the link (unless aliased). It is always resolved from workspace metadata using `pageId`. The subscription to `docListUpdated` means **rename propagation is automatic**.

### Reference Node Metadata Resolution

**File:** `packages/affine/inlines/reference/src/reference-node/reference-node.ts`, lines 79-93

```typescript
private readonly _updateRefMeta = (doc: Store) => {
  const refAttribute = this.delta.attributes?.reference;
  const refMeta = doc.workspace.meta.docMetas.find(
    doc => doc.id === refAttribute.pageId
  );
  this.refMeta = refMeta ? { ...refMeta } : undefined;
};
```

---

## Missing Target Handling

### Inline References (Strikethrough)

**File:** `packages/affine/inlines/reference/src/reference-node/reference-node.ts`, lines 238-293

```typescript
const isDeleted = !refMeta;
const style = affineTextStyles(attributes, isDeleted ? {
  color: 'var(--affine-text-disable-color)',
  textDecoration: 'line-through',
  fill: 'var(--affine-text-disable-color)',
} : {});
```

### Card View (Deleted Banner)

**File:** `packages/affine/blocks/embed-doc/src/embed-linked-doc-block/embed-linked-doc-block.ts`, lines 326-383

Shows "This linked doc is deleted." message + `LinkedDocDeletedBanner` visual. CSS class `.deleted` triggers distinct styling.

### Icon for Deleted Docs

**File:** `packages/affine/shared/src/services/doc-display-meta-service.ts`, lines 98-106

```typescript
if (!doc) {
  return computed(() => DocDisplayMetaService.icons.deleted);
}
```

`DeleteIcon` shown for references to nonexistent documents.

---

## Import/Paste ID Remapping

**File:** `packages/affine/shared/src/adapters/middlewares/replace-id.ts`, lines 47-85

When content is imported/pasted, rewrites `pageId` in LinkedPage deltas to map old IDs to new IDs:
- Lines 47-85: Inline text deltas with `reference.pageId`
- Lines 108-127: Block-level `EmbedLinkedDocModel` and `EmbedSyncedDocModel` references
