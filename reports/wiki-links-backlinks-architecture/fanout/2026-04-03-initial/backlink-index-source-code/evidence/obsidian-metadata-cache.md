# Obsidian — MetadataCache & Backlink API Evidence

## MetadataCache Architecture

Obsidian is closed-source. Evidence is from public API types (obsidian.d.ts), official docs, and community documentation.

### Public API shape
**Source:** [obsidian.d.ts on GitHub](https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts)

```typescript
export class MetadataCache extends Events {
    resolvedLinks: Record<string, Record<string, number>>;
    unresolvedLinks: Record<string, Record<string, number>>;

    getFileCache(file: TFile): CachedMetadata | null;
    getCache(path: string): CachedMetadata | null;
    getFirstLinkpathDest(linkpath: string, sourcePath: string): TFile | null;
    fileToLinktext(file: TFile, sourcePath: string, omitMdExtension?: boolean): string;

    on(name: 'changed', callback: (file: TFile, data: string, cache: CachedMetadata) => any): EventRef;
    on(name: 'deleted', callback: (file: TFile, prevCache: CachedMetadata | null) => any): EventRef;
    on(name: 'resolve', callback: (file: TFile) => any): EventRef;
    on(name: 'resolved', callback: () => any): EventRef;
}
```

### Undocumented but widely used backlink method
**Source:** [Obsidian Forum: Get backlinks of a file](https://forum.obsidian.md/t/get-backlinks-of-a-file/81638)
```typescript
// Returns CustomArrayDict<Reference> — map from source paths to backlink reference arrays
getBacklinksForFile(file: TFile): CustomArrayDict<Reference>;
```
This iterates ALL files on every call — no precomputed reverse index.

## CachedMetadata Interface

**Source:** [obsidian.d.ts](https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts)

```typescript
export interface CachedMetadata {
    links?: LinkCache[];
    embeds?: EmbedCache[];
    tags?: TagCache[];
    headings?: HeadingCache[];
    sections?: SectionCache[];
    listItems?: ListItemCache[];
    frontmatter?: FrontMatterCache;
    frontmatterPosition?: Pos;
    frontmatterLinks?: FrontmatterLinkCache[];
    blocks?: Record<string, BlockCache>;
}

export interface ReferenceCache extends CacheItem {
    link: string;          // link target (e.g., "Note#Heading")
    original: string;      // raw text (e.g., "[[Note#Heading|alias]]")
    displayText?: string;
}

export interface LinkCache extends ReferenceCache {}
export interface EmbedCache extends ReferenceCache {}
```

## resolvedLinks / unresolvedLinks

**Source:** [Official docs: MetadataCache/resolvedLinks](https://docs.obsidian.md/Reference/TypeScript+API/MetadataCache/resolvedLinks)

Structure: `resolvedLinks[sourcePath][destPath] = linkCount`
- Outer key: source file path
- Inner key: destination file path
- Value: number of times source links to destination

**Backlink computation requires O(n) iteration:**
```typescript
for (const [sourcePath, links] of Object.entries(resolvedLinks)) {
    if (links[targetFile.path]) backlinks.push(sourcePath);
}
```

**Source:** [Forum: Store backlinks in metadataCache](https://forum.obsidian.md/t/store-backlinks-in-metadatacache/67000)
- Confirms no native reverse index
- `getBacklinksForFile` iterates all files on every call

## Index Building Behavior

### Startup
**Source:** [Forum: Reindexes vault on startup](https://forum.obsidian.md/t/reindexes-entire-vault-every-time-on-obsidian-startup/95724)
- Persisted in IndexedDB
- On subsequent startups: loads cache, incrementally re-indexes by mtime comparison

### Runtime — event sequence for single file change
1. `changed` — file's CachedMetadata updated
2. `resolve` — file's links resolved into resolvedLinks/unresolvedLinks
3. `resolved` — all pending resolutions complete (batched)

### File renames do NOT trigger `changed` events

## Performance Characteristics

**Source:** Community reports from Obsidian forums

| Vault Size | Full Reindex | With Cache |
|---|---|---|
| ~1,000 notes | ~1.5s | ~0.3s (with Dataview IndexedDB) |
| ~2,000 notes | seconds | sub-second |
| ~20,000 notes | ~15 minutes | fast incremental |
| ~50,000 notes + 40k attachments | ~27 minutes | ~3 min vault load |

**Source:** [Backlink Cache plugin](https://github.com/mnaoumov/obsidian-backlink-cache)
- Exists specifically to cache `getBacklinksForFile()` results
- Confirms O(n) per-call cost of native backlink computation
