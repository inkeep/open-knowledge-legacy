---
investigation: "INV2 — Foam shortest-path resolution algorithm"
date: 2026-04-16
context: "Studying Foam's TrieMap-based identifier resolution for prior-art algorithm extraction"
files-read:
  - "/Users/edwingomezcuellar/.claude/oss-repos/foam/packages/foam-vscode/src/core/model/workspace.ts"
  - "/Users/edwingomezcuellar/.claude/oss-repos/foam/packages/foam-vscode/src/core/model/uri.ts"
  - "/Users/edwingomezcuellar/.claude/oss-repos/foam/packages/foam-vscode/src/core/model/note.ts"
  - "/Users/edwingomezcuellar/.claude/oss-repos/foam/packages/foam-vscode/src/core/utils/path.ts"
  - "/Users/edwingomezcuellar/.claude/oss-repos/foam/packages/foam-vscode/src/core/services/markdown-link.ts"
  - "/Users/edwingomezcuellar/.claude/oss-repos/foam/packages/foam-vscode/src/core/services/markdown-provider.ts"
  - "/Users/edwingomezcuellar/.claude/oss-repos/foam/packages/foam-vscode/src/core/services/attachment-provider.ts"
  - "/Users/edwingomezcuellar/.claude/oss-repos/foam/packages/foam-vscode/src/core/model/provider.ts"
  - "/Users/edwingomezcuellar/.claude/oss-repos/foam/packages/foam-vscode/src/core/model/workspace.test.ts"
---

## 1. Data Structure & Index Shape

### TrieMap Storage (`_resources`)
- **Type:** `TrieMap<string, Resource>` (from npm mnemonist/trie-map)
- **Keys:** Reversed, lowercased POSIX paths with normalized separators
- **Values:** `Resource` objects (URI, title, type, aliases, properties, sections, blocks, tags, links)
- **Location:** workspace.ts:24

**Key transformation (`getTrieIdentifier` method, workspace.ts:333–348):**
```typescript
private getTrieIdentifier(reference: URI | string): string {
  let path: string;
  if (reference instanceof URI) {
    path = (reference as URI).path;
  } else {
    path = reference as string;
  }
  
  let reversedPath = normalize(path).split('/').reverse().join('/');
  
  if (reversedPath.indexOf('/') < 0) {
    reversedPath = reversedPath + '/';
  }
  
  return reversedPath;
}
```

- Input path `/workspace/journal/note.md` normalizes to lowercase, splits to `['workspace', 'journal', 'note.md']`
- Reverses to `['note.md', 'journal', 'workspace']`, rejoins as `note.md/journal/workspace`
- If single token, appends `/` suffix for consistency
- **Normalization** applied: `normalize = (v: string) => v.toLocaleLowerCase()` (workspace.ts:508)

### Secondary Index: Directory Index (`_directoryIndex`)
- **Type:** `Map<string, URI>` — maps normalized directory paths to owner URIs
- **Values:** Only index/README files (any configured note extension)
- **Priority:** `['index', 'readme']` — index has priority
- **Location:** workspace.ts:31, managed by `_registerDirectoryIndex` / `_unregisterDirectoryIndex`

---

## 2. Resolution Algorithm: `getShortestIdentifier()`

### Static Method (workspace.ts:463–492)

**Signature:**
```typescript
static getShortestIdentifier(forPath: string, amongst: string[]): string
```

**Purpose:** Given a target file path and a list of competing paths, compute the minimal path suffix needed to uniquely identify the target.

**Algorithm (step-by-step):**

1. **Reverse tokenization:**
   - Split `forPath` by `/` and reverse → `needleTokens` (rightmost components first)
   - Do same for each `amongst` entry → `haystack` array of reversed token arrays

2. **Greedy suffix elimination:**
   - Initialize `tokenIndex = 0` (position from right)
   - While `tokenIndex < needleTokens.length`:
     - For each hay item in reverse iteration: if its length ≤ `tokenIndex` OR token at position doesn't match, **remove it from haystack**
     - If `haystack` becomes empty, we've found the discriminator
     - Increment `tokenIndex`

3. **Termination & construction:**
   - When haystack empties, take the first `tokenIndex + 1` tokens from `needleTokens` (splice)
   - Filter empty tokens, reverse, rejoin with `/`
   - Return the shortest suffix (rightmost components)

### Example (from test, workspace.test.ts:136–142)

```
needle:   /project/car/todo
haystack: [/project/home/todo, /other/todo, /something/else]

Reversed:
  needle:  [todo, car, project]
  hay:     [[todo, home, project], [todo, other], [else, something]]

tokenIndex=0: all match on 'todo' → no eliminations, hay not empty
tokenIndex=1: needle[1]='car'
  - [todo, home, project][1]='home' ≠ 'car' → remove
  - [todo, other][1]='other' ≠ 'car' → remove
  - [else, something] length=2, enough tokens but [1]='something' ≠ 'car' → remove
  → hay is now empty, discriminator found at tokenIndex=1

Result: needle.splice(0, 2) = [todo, car]
  → reverse & join → car/todo
```

### Tiebreak Behavior: **UNRESOLVED**
- If multiple paths remain after reaching end of `needleTokens`, returns the full path
- Test case (workspace.test.ts:155–170): when no unique identifier exists, returns "best guess" (full path with directory context)
- **No documented tiebreak rule for true ambiguity** within Foam's code — seems a known edge case

---

## 3. Extension Handling

### Behavior in `listByIdentifier()` (workspace.ts:249–274)
1. Strips extension from input identifier → lowercase search key via `getTrieIdentifier()`
2. If original identifier lacks `.md` extension, also searches with extension appended
3. If multiple results, filters for exact **case matches** on basename
4. Returns results sorted by path

**Key observation:** Extensions ARE indexed in TrieMap (as part of reversed path tokens), but resolution applies **case-sensitive exact match filtering** as secondary tiebreaker.

### Extension Rules
- Input `photo` matches both `photo.png` and `photo.md` (via TrieMap.find() prefix search)
- Secondary filter for "exact case-matching basename" disambiguates
- **Case sensitivity:** Foam preserves case in filenames; `Note.md` ≠ `note.md` for identifier matching (workspace.test.ts:187–222)

---

## 4. Link Resolution Chain

### Entry Point: `resolveLink()` (workspace.ts:400–409)
```typescript
public resolveLink(resource: Resource, link: ResourceLink): URI {
  for (const provider of this.providers) {
    if (provider.supports(resource.uri)) {
      return provider.resolveLink(this, resource, link);
    }
  }
  throw new Error(`Couldn't find provider for resource "${resource.uri.toString()}"`);
}
```

Delegates to provider-specific resolvers (MarkdownResourceProvider, AttachmentResourceProvider).

### Markdown Provider Flow (markdown-provider.ts:88–168)

**For wikilinks `[[target#section|alias]]`:**
1. Parse via `MarkdownLink.analyzeLink()` → extract target, section, blockId, alias
2. Call `workspace.find(target, resource.uri)` with source document as context
3. If not found, try directory index via `_resolveDirectoryByIdentifier()`
4. Fallback: return `URI.placeholder(target)` (creates a virtual URI for unresolved links)

**For markdown links `[alias](relative/path#section)`:**
1. Resolve relative paths via `resource.uri.getDirectory().joinPath(path)`
2. Call `workspace.find(path, resource.uri)`
3. Try `_resolveAsDirectory()` if target is a directory

### Attachment Provider (attachment-provider.ts)
- Matches on image extensions: `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`
- Creates synthetic `Resource` objects with `type: 'image'` or `'attachment'`
- **`resolveLink()` is unsupported** — throws error; attachments are resolved at parse time or via workspace lookup

---

## 5. Workspace Lookup: `find()` Method (workspace.ts:350–398)

### Identifier vs. Path Resolution
```typescript
public find(reference: URI | string, baseUri?: URI): Resource | null
```

**Case A: String identifier (no `/`, `./`, `../`)**
- Calls `listByIdentifier(reference)` → returns first match (after path sorting for determinism)
- **This is the "shortest-path" lookup** for basenames

**Case B: Absolute path**
1. Resolve to workspace root via `resolveUri()`
2. Look up in TrieMap via `getTrieIdentifier()`
3. If multi-root workspace, search remaining roots

**Case C: Relative path (`./ ../`)**
- Resolve against `baseUri.getDirectory()` or roots[0]
- Look up in TrieMap

### Priority in Multi-Root
- roots[0] is checked first; if not found, scan roots[1..n]
- **Deterministic:** Always roots[0] when ambiguous (workspace.test.ts:239–251)

---

## 6. Case Sensitivity & Normalization

### Normalization Rules (path.ts, uri.ts)
- All TrieMap keys use `toLocaleLowerCase()` (case-insensitive lookup)
- Filesystem paths converted to POSIX format (forward slashes, `/C:/` for Windows drives)
- **BUT:** Resource basenames preserve original case
- When `listByIdentifier()` finds multiple results, **exact case match is preferred** (workspace.ts:264–271)

### Implications for Asset Embed
- `photo.png` and `Photo.PNG` would collide in TrieMap lookup but be distinguished by case filter
- Shortest-path resolution uses reversed tokens, which are all lowercased before comparison
- **No case-sensitive shortest-path disambiguation documented**

---

## 7. Refresh & Mutation

### Index Update Triggers (workspace.ts:110–141)
- **`set(resource: Resource)`** — adds/updates resource, registers directory index
- **`delete(uri: URI)`** — removes from TrieMap and directory index
- **`clear()`** — wipes both indices

### Event Emission
- `onDidAdd`, `onDidUpdate`, `onDidDelete` emitted on all changes
- Consumers can rebuild if needed, but Foam doesn't re-compute identifiers on change

**Performance note:** getShortestIdentifier runs at read-time (when generating link identifiers), NOT on insert. O(n·m) on each call where n=competing files, m=path depth.

---

## 8. Unresolved Questions & Caveats

### UNRESOLVED from Code
1. **True ambiguity tiebreak:** When haystack isn't empty at end of needle tokens, Foam returns full path. No secondary tiebreak (alphabetical, filesystem order, etc.) is documented in code.
2. **Asset resolution specifics:** `AttachmentResourceProvider.resolveLink()` throws; unclear how embeds like `![[photo.png]]` route — likely via MarkdownResourceProvider's wikilink fallback to workspace.find().
3. **Case sensitivity in shortest-path:** Foam preserves case in filenames (test #1303 proves distinct `Note.md` vs `note.md`), but `getShortestIdentifier()` operates on lowercased tokens. **No documented rule for choosing between `Note` vs `note` if both exist.**

### Performance Implications
- TrieMap.find() is O(prefix length), but `getShortestIdentifier()` is O(n·m) worst-case (n competitors, m depth)
- Called on-demand, not cached
- For our embed resolution, at vault scale (<10k assets), negligible

---

## 9. Translation to TypeScript (Stdlib-based)

### Can we avoid TrieMap dependency?

**YES.** Foam uses TrieMap for **prefix-based lookups** (`this._resources.find(needle)`), but we can substitute:

```typescript
// Instead of TrieMap<string, Resource>:
// Use flat Map<string, Resource> with manual filtering

interface FileIndex {
  byReversedPath: Map<string, Resource>;  // key: "md/photo" (reversed, lowercase)
}

function find(basename: string, vault: FileIndex): Resource | null {
  // Iterate Map, filter by matching basename (prefix)
  for (const [key, resource] of vault.byReversedPath) {
    if (key.startsWith(basename.toLowerCase() + '/') ||
        key === basename.toLowerCase() + '/') {
      return resource;
    }
  }
  return null;
}
```

**Tradeoff:** O(n) linear scan per lookup vs. Trie's O(log n + prefix length). At <10k files, negligible; at 100k+, Trie wins.

### Simplified Module Signature

```typescript
// packages/core/src/utils/path-resolve.ts

export interface AssetIndexEntry {
  fullPath: string;  // e.g., "/workspace/assets/photo.png"
  basename: string;  // e.g., "photo.png"
  normalized: string; // lowercase reversed: "png/photo"
}

export interface AssetIndex {
  entries: Map<string, AssetIndexEntry>;  // key: normalized path
}

/**
 * Resolve an embed target (basename) from a source location.
 * Uses shortest-path tiebreaking: prefer closest ancestor match.
 */
export function resolveEmbed(
  basename: string,
  sourcePath: string,
  index: AssetIndex
): string | null {
  // 1. Find all matching basenames (case-insensitive)
  const matches = [...index.entries.values()].filter(
    e => e.basename.toLowerCase() === basename.toLowerCase()
  );
  
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0].fullPath;
  
  // 2. Shortest-path tiebreak: prefer closest to sourcePath directory
  const sourceDir = getDirectory(sourcePath);
  const scored = matches.map(m => ({
    entry: m,
    distance: computePathDistance(sourceDir, m.fullPath)
  }));
  
  scored.sort((a, b) => a.distance - b.distance);
  
  return scored[0].entry.fullPath;
}

/**
 * Compute minimal suffix needed to distinguish a path from competitors.
 * Implements Foam's getShortestIdentifier algorithm.
 */
export function getShortestSuffix(
  forPath: string,
  amongst: string[]
): string {
  const needleTokens = forPath.split('/').reverse();
  const haystack = amongst
    .filter(p => p !== forPath)
    .map(p => p.split('/').reverse());
  
  let tokenIndex = 0;
  while (tokenIndex < needleTokens.length) {
    for (let j = haystack.length - 1; j >= 0; j--) {
      if (
        haystack[j].length < tokenIndex ||
        needleTokens[tokenIndex] !== haystack[j][tokenIndex]
      ) {
        haystack.splice(j, 1);
      }
    }
    if (haystack.length === 0) {
      return needleTokens
        .slice(0, tokenIndex + 1)
        .reverse()
        .join('/');
    }
    tokenIndex++;
  }
  
  // Fallback: return full path
  return needleTokens.reverse().join('/');
}
```

---

## 10. Summary & Recommendations

### Algorithm Shape
Foam uses a **reverse-path TrieMap** to index files by lowercased, reversed tokens. Lookups are O(k·log n) where k=average path depth. The **shortest-path resolution** (`getShortestIdentifier`) is a greedy, suffix-based algorithm that iterates from rightmost path components, eliminating non-matching competitors until one winner remains.

### For Asset Embed (`resolveEmbed`)
1. **Index:** Store files in a simple Map by normalized (reversed, lowercased) path
2. **Lookup:** Find all matches by basename (case-insensitive)
3. **Tiebreak:** Use shortest-path algorithm (Foam's implementation) OR directional distance from source document
4. **Fallback:** Return null if ambiguous and no clear winner

### Dependency Status
- **TrieMap NOT required:** Stdlib `Map` with linear filtering handles <10k assets
- **No external deps needed for core algorithm**

### Gotchas for Port
1. Case sensitivity: Foam preserves filesystem case but uses lowercase keys; we must **do the same**
2. Path normalization: Always POSIX format (forward slashes, handle Windows)
3. Extensions: Part of the reversed token stream; `photo.md` and `photo` are distinct in the index
4. True ambiguity: Foam falls back to full path; we should document our tiebreak rule explicitly

