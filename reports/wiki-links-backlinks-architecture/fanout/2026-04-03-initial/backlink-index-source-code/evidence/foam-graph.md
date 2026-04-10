# Foam — Graph & Backlink Source Code Evidence

## Graph Data Structure

### Dual adjacency lists: `links` (forward) and `backlinks` (reverse)
**File:** `packages/foam-vscode/src/core/model/graph.ts`

```typescript
// Line 9-13 — Connection type
export type Connection = {
  source: URI;
  target: URI;
  link: ResourceLink;
};

// Line 26-30 — Core maps on FoamGraph
public readonly links: Map<string, Connection[]> = new Map();      // forward: source -> connections[]
public readonly backlinks: Map<string, Connection[]> = new Map();  // reverse: target -> connections[]
```

### Placeholder tracking for unresolved targets
**File:** `packages/foam-vscode/src/core/model/graph.ts:22`
```typescript
public readonly placeholders: Map<string, URI> = new Map();
```

### ResourceLink type carries link metadata
**File:** `packages/foam-vscode/src/core/model/note.ts:5-11`
- Fields: `type: 'wikilink' | 'link'`, raw text, source range, embed flag, definition reference

### Resources stored in reversed-path TrieMap for fast slug lookup
**File:** `packages/foam-vscode/src/core/model/workspace.ts:9,24`
```typescript
import TrieMap from 'mnemonist/trie-map';
private _resources: TrieMap<string, Resource> = new TrieMap();
```

## Index Building

### Full scan at startup via Promise.all
**File:** `packages/foam-vscode/src/core/model/workspace.ts:494-505`
```typescript
// fromProviders does parallel fetch
Promise.all(files.map(f => workspace.fetchAndSet(f)))
```

### Graph.update() is a FULL REBUILD — clears all maps, re-walks all resources
**File:** `packages/foam-vscode/src/core/model/graph.ts:102-128`
```typescript
update() {
  this.backlinks.clear();
  this.links.clear();
  this.placeholders.clear();
  // ... iterates ALL resources
}
```

### Bidirectional population via connect()
**File:** `packages/foam-vscode/src/core/model/graph.ts:130-147`
```typescript
connect(source, target, link) {
  // pushes to both this.links.get(source.path) AND this.backlinks.get(target.path)
}
```

## Backlink Query

### O(1) map lookup
**File:** `packages/foam-vscode/src/core/model/graph.ts:68-70`
```typescript
public getBacklinks(uri: URI): Connection[] {
  return this.backlinks.get(uri.path) ?? [];
}
```

## Link Parsing

### Unified/remark pipeline with remark-wiki-link plugin
**File:** `packages/foam-vscode/src/core/services/markdown-parser.ts:49-52`
```typescript
const parser = unified()
  .use(markdownParse, { gfm: true })
  .use(frontmatterPlugin, ['yaml'])
  .use(wikiLinkPlugin, { aliasDivider: '|' });
```

### Wikilink regex decomposition
**File:** `packages/foam-vscode/src/core/services/markdown-link.ts:6-11`
```typescript
private static wikilinkRegex = new RegExp(/\[\[([^#|]+)?#?([^|]+)?\|?(.*)?\]\]/);
private static directLinkRegex = new RegExp(/\[(.*)\]\(<?([^#>]*?)(?:#([^>\s"'()]*))?(?:\s+(?:"[^"]*"|'[^']*'))?>?\)/);
```

## Performance

### LRU parser cache (10,000 entries, checksum-based, persisted to VS Code workspaceState)
**File:** `packages/foam-vscode/src/services/cache.ts:21-99`
- Max 10,000 entries, `updateAgeOnGet: true`, debounced 1s persistence
- Cache versioning (`CACHE_VERSION = 3`) for schema evolution

### Debounce support (lodash debounce, 500ms) — but NOT enabled by default
**File:** `packages/foam-vscode/src/core/model/graph.ts:89-91`
```typescript
debounceFor > 0 ? debounce(graph.update.bind(graph), 500) : graph.update.bind(graph)
```
Note: `bootstrap()` calls `fromWorkspace(workspace, true)` without debounce argument, so graph rebuilds synchronously on every workspace event.
