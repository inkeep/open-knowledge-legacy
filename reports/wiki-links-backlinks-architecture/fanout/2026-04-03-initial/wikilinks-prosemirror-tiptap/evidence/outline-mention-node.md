# Evidence: Outline's Mention Node & Link Resolution

**Source:** Outline wiki editor  
**Repo:** https://github.com/outline/outline  
**Local path:** `/Users/edwingomezcuellar/.claude/oss-repos/outline/`

## ID-Based Link Resolution

Outline stores document references as ProseMirror mention nodes with a UUID `modelId`.

### Node Schema

**File:** `shared/editor/nodes/Mention.tsx`, lines 46-65

Attributes:
- `type` — `"user"`, `"document"`, `"collection"`, etc. (from `shared/types.ts`, line 100)
- `modelId` — UUID of referenced entity
- `label` — cached display text (creation-time snapshot)
- `id` — unique per-instance UUID
- `href` — optional URL

### URL Construction from ID

**File:** `shared/editor/nodes/Mention.tsx`, lines 96-108

```typescript
href:
  node.attrs.type === MentionType.Document
    ? `${env.URL}/doc/${node.attrs.modelId}`
    : node.attrs.type === MentionType.Collection
      ? `${env.URL}/collection/${node.attrs.modelId}`
      : node.attrs.href,
```

### Markdown Serialization

**File:** `shared/editor/nodes/Mention.tsx`, lines 314-328

```typescript
if (mType === MentionType.Document) {
  state.write(`[${label}](/doc/${mId})`);
}
```

Documents serialize as standard markdown links with `/doc/{uuid}` URLs.

---

## Render-Time Resolution (Hybrid: ID + Cached Label)

**File:** `shared/editor/components/Mentions.tsx`, lines 95-131

```typescript
const doc = documents.get(node.attrs.modelId);
// Display: doc?.title || node.attrs.label  (fallback to cached label)
```

### Prefetch on Mount

**File:** `shared/editor/components/Mentions.tsx`, lines 104-108

```typescript
React.useEffect(() => {
  if (modelId) {
    void documents.prefetchDocument(modelId);
  }
}, [modelId, documents]);
```

---

## Backlink Tracking

**File:** `server/queues/processors/BacklinksProcessor.ts`, lines 8-143

Maintains a `Relationship` table tracking document-to-document links.

### On Document Update

1. Calls `DocumentHelper.parseDocumentIds(document)` to extract all referenced IDs
2. Creates/deletes `Relationship` records of type `Backlink`
3. On document deletion (lines 123-138): destroys all backlink relationships

### Document ID Extraction

**File:** `server/models/helpers/ProsemirrorHelper.tsx`, lines 148-178

Extracts document references from two sources:
1. Mention nodes: `node.attrs.modelId` where `type === MentionType.Document`
2. Regular links: `parseDocumentSlug(mark.attrs.href)` from `/doc/{slug}` URLs

---

## Suggestion System (Internal Link Autocomplete)

**File:** `app/editor/extensions/Suggestion.ts`, lines 21-28

Trigger regex construction:
```typescript
this.openRegex = new RegExp(
  `(?:^|\\s|\\()${escapeRegExp(this.options.trigger)}([query_chars]+)?$`, "u"
);
```

**File:** `shared/editor/plugins/SuggestionsMenuPlugin.ts`, lines 60-116

Detection via `handleKeyDown`:
1. Gets text before cursor: `$from.parent.textBetween(max(0, parentOffset - MAX_MATCH), parentOffset)`
2. Runs `openRegex` against it
3. If match length ≤ 2 (just trigger chars): `state.open = true`
4. Updates `state.query = match[1]`
5. Uses `setTimeout` for reliable post-keystroke detection

### Popup Positioning

**File:** `app/editor/components/SuggestionsMenu.tsx`, lines 99-117

```typescript
const caretRect = React.useMemo(() => {
  const { selection } = view.state;
  const fromPos = view.coordsAtPos(selection.from);
  const toPos = view.coordsAtPos(selection.to, -1);
  return new DOMRect(left, top, right - left, bottom - top);
}, [props.isActive, view]);
```

Uses `view.coordsAtPos()` with Radix `PopoverAnchor` via virtual ref.

---

## Missing Target Handling

When `documents.get(node.attrs.modelId)` returns undefined:
- Falls back to cached `label` text
- Shows generic document icon
- Link navigates to `/doc/{id}` which 404s at application level
- No special "broken link" indicator
