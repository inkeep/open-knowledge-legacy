# Dendron — Backlink System Source Code Evidence

## Link Model

### `DLink` — unified link type for all relationships
**File:** `packages/common-all/src/types/foundation.ts:50-60`
```typescript
type DLink = {
  type: "ref" | "wiki" | "md" | "backlink" | "linkCandidate" | "frontmatterTag";
  from: DLoc;
  to?: DLoc;
  value: string;
  position?: Position;
  xvault?: boolean;
  sameFile?: boolean;
}
```

### `DLoc` — link endpoint location
**File:** `packages/common-all/src/types/foundation.ts:39-45`
- Fields: `fname?, id?, vaultName?, uri?, anchorHeader?`

### AST link types
**File:** `packages/unified/src/types.ts:36-62`
- `DendronASTTypes`: `WIKI_LINK`, `REF_LINK_V2`, `BLOCK_ANCHOR`, `HASHTAG`, `USERTAG`, `EXTENDED_IMAGE`

## Backlink Storage: NO Separate Index

### Backlinks stored in each note's `links: DLink[]` array
**File:** `packages/common-all/src/types/foundation.ts:148-151`
```typescript
// NoteProps
links: DLink[];  // "Node links (eg. backlinks, wikilinks, etc)"
```

### `BacklinkUtils.createFromDLink` — flips forward link to backlink
**File:** `packages/common-all/src/BacklinkUtils.ts:5-24`
```typescript
type BackLink = Omit<DLink, "type"> & { type: "backlink" };
// createFromDLink: takes forward link, returns DLink with type: "backlink"
```

### `addBacklinkInPlace` — mutation into target note's links array
**File:** `packages/common-all/src/BacklinkUtils.ts:31-44`
- Pushes backlink into `note.links` after duplicate check via `DLinkUtils.isEquivalent`

## Index Building

### Phase 1: per-vault note parsing with content hash caching
**File:** `packages/engine-server/src/drivers/file/storev2.ts:509-573`
- `initNotes()` iterates vaults, calls `_initNotes(vault)`, collects `notesWithLinks`

**File:** `packages/engine-server/src/drivers/file/noteParser.ts:412-479`
- `file2NoteWithCache` compares content SHA-256 hash against filesystem cache

### Link extraction from markdown AST
**File:** `packages/engine-server/src/utils/engineUtils.ts:94-152`
- `refreshNoteLinksAndAnchors` → `LinkUtils.findLinks`

**File:** `packages/unified/src/remark/utils.ts:527-554`
- `findLinksFromBody` — unified AST parse → walk for WIKI_LINK, REF_LINK_V2, HASHTAG, USERTAG

**File:** `packages/unified/src/remark/utils.ts:182-298`
- `getLinks` — visitor that collects links from AST nodes

### Phase 2: batch backlink computation at startup
**File:** `packages/engine-server/src/drivers/file/storev2.ts:584-645`
- `_addBacklinks`: builds `InMemoryNoteCache`, iterates all notes with links, resolves targets by fname, mutates targets' `links` arrays

**File:** `packages/engine-server/src/util/inMemoryNoteCache.ts:3-46`
- `InMemoryNoteCache` wraps `Map<string, NoteProps[]>` keyed by lowercased fname

### Incremental updates on note save
**File:** `packages/engine-server/src/drivers/file/storev2.ts:1418-1460`
- On `writeNote`: diffs old vs new links using `DLinkUtils.isEquivalent`
- Deleted links → `removeBacklink` on targets; Added links → `addBacklink` on targets

### Backlinks survive re-parsing via `hydrate`
**File:** `packages/common-all/src/dnode.ts:795-816`
- `NoteUtils.hydrate({ keepBackLinks: true })` preserves `type === "backlink"` entries from old note

## UI

### Backlinks panel (VS Code TreeDataProvider)
**File:** `packages/plugin-core/src/features/BacklinksTreeDataProvider.ts:263-276`
- Debounced at 250ms, listens to `onEngineNoteStateChanged` and `onDidChangeActiveTextEditor`

**File:** `packages/plugin-core/src/utils/md.ts:488-594`
- `findReferencesById`: reads `note.links.filter(link => link.type === "backlink")`, fetches source notes, matches forward links for positions
