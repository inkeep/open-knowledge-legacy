# Evidence: IFileSystem Custom Backend Implementability

**Dimension:** D2 — Could we implement IFileSystem backed by Yjs, git, Orama?
**Date:** 2026-04-02
**Sources:** github.com/vercel-labs/just-bash `src/fs/interface.ts`, Mintlify ChromaFs blog post

---

## Key files referenced

- `src/fs/interface.ts` — Complete IFileSystem interface (21 methods)
- `src/fs/in-memory-fs/in-memory-fs.ts` — Reference implementation
- `src/types.ts` — CommandContext showing how fs is consumed
- `src/commands/grep/grep.ts` — How grep uses the filesystem
- `src/commands/find/find.ts` — How find uses the filesystem

---

## Findings

### Finding: IFileSystem is explicitly designed for custom backends
**Confidence:** CONFIRMED
**Evidence:** `src/fs/interface.ts` lines 114-115

```typescript
/**
 * Abstract filesystem interface that can be implemented by different backends.
 * This allows BashEnv to work with:
 * - InMemoryFs (in-memory, default)
 * - Real filesystem (via node:fs)
 * - Custom implementations (e.g., remote storage, browser IndexedDB)
 */
```

The interface is the sole contract between commands and storage. Commands never access `node:fs` directly — they receive `ctx.fs: IFileSystem` via CommandContext.

### Finding: Mintlify ChromaFs proves custom backend viability at production scale
**Confidence:** CONFIRMED
**Evidence:** https://www.mintlify.com/blog/how-we-built-a-virtual-filesystem-for-our-assistant

Mintlify implemented IFileSystem backed by their Chroma vector database. Key implementation details:
- `readFile` → fetches chunks matching page slug, sorts by chunk_index, joins into full page
- `readdir` → queries in-memory structures built from `__path_tree__` gzipped JSON at startup
- `exists` → checks the in-memory Set<string> of all file paths
- `stat` → returns file/directory metadata from in-memory structures
- All write methods throw EROFS (read-only)
- Grep is intercepted: coarse filter via Chroma query → fine filter via in-memory regex on bulkPrefetched results cached in Redis
- Performance: p90 session creation ~100ms, supports 30,000+ daily conversations

### Finding: Minimum viable IFileSystem requires ~12 of 21 methods
**Confidence:** INFERRED
**Evidence:** Analysis of command implementations in just-bash

For a read-heavy knowledge base backend, the critical methods are:
1. `readFile` — cat, grep, sed all read files
2. `readFileBuffer` — binary file operations
3. `exists` — test/if checks, redirection guards
4. `stat` — file type checks (isFile/isDirectory), size, mtime
5. `readdir` — ls, find directory traversal
6. `readdirWithFileTypes` (optional) — performance optimization for find
7. `resolvePath` — all commands resolve relative paths
8. `getAllPaths` — glob expansion, find optimization
9. `mkdir` — can throw EROFS for read-only
10. `writeFile` — can throw EROFS for read-only
11. `rm` — can throw EROFS for read-only
12. `realpath` — pwd -P, cd -P

Methods that can be stubbed for a read-only KB: `appendFile`, `chmod`, `symlink`, `link`, `readlink`, `lstat`, `utimes`, `cp`, `mv`.

### Finding: getAllPaths() is the key integration point for glob/find performance
**Confidence:** CONFIRMED
**Evidence:** `src/fs/interface.ts` line 209

```typescript
getAllPaths(): string[];
```

This synchronous method returns all known paths. It's used for glob expansion. For a Yjs/Orama backend, this would need to return the full path inventory. Mintlify's ChromaFs builds this from a `__path_tree__` manifest at startup.

### Finding: A Yjs-backed IFileSystem would map document keys to virtual paths
**Confidence:** INFERRED
**Evidence:** Structural analysis of IFileSystem + Yjs Y.Doc capabilities

Mapping:
- `readFile(path)` → Find Y.Doc subdoc for path, return Y.XmlFragment as markdown
- `readdir(path)` → Return child keys under path prefix in the doc key hierarchy
- `stat(path)` → Return {isFile, isDirectory, size, mtime} from doc metadata
- `writeFile(path, content)` → Apply Y.Doc update (CRDT merge, not overwrite)
- `getAllPaths()` → Return all doc keys from Y.Doc state

Challenges:
- Y.Doc stores rich text (ProseMirror/TipTap schema), not raw markdown — serialization needed on read
- Yjs is branch-unaware — git branch awareness would need a branch→Y.Doc mapping layer
- Content would need markdown serialization from CRDT state on every readFile call

### Finding: An Orama-backed grep would intercept at the command level, not the filesystem level
**Confidence:** INFERRED
**Evidence:** Mintlify's ChromaFs grep implementation pattern

ChromaFs does NOT implement grep via IFileSystem — it intercepts the grep command itself, parses flags with yargs-parser, translates to Chroma queries. This is because IFileSystem's `readFile` returns file content, but grep needs search-indexed content. The optimization is at the command layer, not the filesystem abstraction.

For OpenKB: Orama search could back a custom grep command via `defineCommand("grep", ...)` or by intercepting the search path. The IFileSystem `readFile` would still return full document content for cat/head/tail.

---

## Gaps / follow-ups

* Exact Yjs serialization overhead for readFile (ProseMirror → markdown) not measured
* How ChromaFs handles file metadata (mtime, mode, size) for stat() not documented
