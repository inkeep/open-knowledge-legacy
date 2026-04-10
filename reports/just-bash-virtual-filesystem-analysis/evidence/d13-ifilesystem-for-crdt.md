# Evidence: IFileSystem Backend for CRDT (YjsFileSystem Implementation)

**Dimension:** D13 — What does a YjsFileSystem need to implement? Which methods do key commands call? Minimal implementation? Performance?
**Date:** 2026-04-02
**Sources:** just-bash source code (IFileSystem, command implementations), Hocuspocus documentation, Yjs performance benchmarks

---

## Key sources referenced

- `src/fs/interface.ts` — IFileSystem (21 methods)
- `src/commands/cat/cat.ts` — readFile usage
- `src/commands/grep/grep.ts` — readFile + getAllPaths + stat usage
- `src/commands/ls/ls.ts` — readdir + stat usage
- `src/commands/find/find.ts` — readdir + stat + getAllPaths usage
- https://tiptap.dev/docs/hocuspocus/server/examples — DirectConnection API
- https://github.com/ueberdosis/hocuspocus/issues/832 — DirectConnection state issues
- https://github.com/dmonad/crdt-benchmarks — Yjs performance benchmarks

---

## Findings

### Finding: IFileSystem method usage by command — cat, grep, ls, find touch only 6 methods intensively
**Confidence:** CONFIRMED
**Evidence:** Source code analysis of each command's filesystem calls

| Command | IFileSystem Methods Used | Hot Path |
|---|---|---|
| `cat` | readFile, exists, stat (for -n line numbering) | readFile |
| `grep` | readFile (per file), getAllPaths (for glob), stat (isFile check), readdir (for -r) | readFile (batch of 50) |
| `ls` | readdir, stat (per entry), lstat (for -l), readlink (for symlinks) | readdir + stat |
| `find` | readdir (recursive), stat (per entry), getAllPaths (optimization) | readdir + stat (batch of 500) |
| `head/tail` | readFile, stat | readFile |
| `sed` | readFile, writeFile (for -i) | readFile + writeFile |
| `wc` | readFile | readFile |
| `diff` | readFile (both files) | readFile |
| `tree` | readdir (recursive), stat | readdir + stat |

The intensive methods are: `readFile`, `readdir`, `stat`, `getAllPaths`. Everything else is low-frequency.

### Finding: Minimal YjsFileSystem requires 8 real implementations + stubs
**Confidence:** INFERRED
**Evidence:** Command analysis mapped to IFileSystem methods

**Must implement (8 methods):**
1. `readFile(path)` — serialize Y.Doc content to markdown
2. `readFileBuffer(path)` — same as readFile but as Uint8Array
3. `exists(path)` — check doc key index
4. `stat(path)` — return {isFile, isDirectory, size, mtime} from doc metadata
5. `lstat(path)` — same as stat (no symlinks)
6. `readdir(path)` — return child keys under path prefix
7. `readdirWithFileTypes(path)` — return child keys with Dirent-like types
8. `getAllPaths()` — return full doc key inventory (synchronous)

**Must implement if writes are supported (3 more):**
9. `writeFile(path, content)` — apply Y.Doc update (parse markdown → CRDT ops)
10. `mkdir(path)` — create directory entry in doc index
11. `rm(path)` — remove doc from Y.Doc

**Can stub with EROFS/ENOTSUP (10 methods):**
12-21. `appendFile`, `chmod`, `symlink`, `link`, `readlink`, `utimes`, `cp`, `mv`, `resolvePath` (use path-utils), `realpath` (identity)

Note: `resolvePath()` is synchronous and pure path math — just-bash provides reusable path utilities.

### Finding: readFile on a Yjs backend requires Y.XmlFragment → markdown serialization
**Confidence:** CONFIRMED
**Evidence:** Structural analysis of Yjs + TipTap content storage

Yjs stores TipTap/ProseMirror content as Y.XmlFragment, not raw text. A readFile call must:
1. Get the Y.Doc for the requested path
2. Extract the Y.XmlFragment content
3. Serialize to markdown (using prosemirror-to-markdown or similar)
4. Return as string

This serialization runs on every readFile call. During grep of 50 files (one batch), this means 50 concurrent serializations. Estimated overhead per serialization:
- Yjs state access: < 1ms (in-memory CRDT state)
- ProseMirror → markdown: 1-5ms per document (depending on document size)
- Total for 50-file grep batch: 50-250ms

Compare to ChromaFs: chunk reassembly from pre-rendered strings takes ~1-2ms per file.

### Finding: getAllPaths() must be synchronous — cannot query Y.Doc asynchronously
**Confidence:** CONFIRMED
**Evidence:** `src/fs/interface.ts` line 209 — `getAllPaths(): string[]`

This is one of only two synchronous methods on IFileSystem (the other is `resolvePath`). It must return all paths immediately.

Implementation strategy: maintain an in-memory Set<string> of all document paths, updated via Yjs change observers. This is identical to ChromaFs's __path_tree__ approach but backed by Yjs awareness rather than a gzipped manifest.

```typescript
class YjsFileSystem implements IFileSystem {
  private pathIndex: Set<string> = new Set();
  
  constructor(ydoc: Y.Doc) {
    // Build initial index from Y.Doc state
    for (const key of ydoc.share.keys()) {
      this.pathIndex.add(this.keyToPath(key));
    }
    // Update on changes
    ydoc.on('afterTransaction', () => this.rebuildIndex());
  }
  
  getAllPaths(): string[] {
    return Array.from(this.pathIndex);
  }
}
```

### Finding: Hocuspocus DirectConnection has known issues with concurrent WebSocket connections
**Confidence:** CONFIRMED
**Evidence:** https://github.com/ueberdosis/hocuspocus/issues/832

Issue #832 documents that DirectConnection can cause "document state corruption" when WebSocket connections are established during the debounce period after a DirectConnection closes. This means server-side Y.Doc access via DirectConnection needs careful lifecycle management to avoid conflicting with live editing sessions.

For an MCP server reading Y.Doc content: the connection should be long-lived (opened when the MCP session starts, closed when it ends) rather than per-request, to avoid the debounce timing issue.

### Finding: Yjs document parsing takes ~20ms for a full conference paper — reasonable for individual reads
**Confidence:** CONFIRMED
**Evidence:** Yjs CRDT benchmarks (https://github.com/dmonad/crdt-benchmarks)

Kevin Jahns (Yjs author) reports: "Parsing the editing trace of a complete conference paper takes approximately 20 ms." For typical KB documents (shorter than a conference paper), parse time would be 5-15ms.

However, this is parse time for the CRDT editing trace, not markdown serialization. The full pipeline (CRDT state → ProseMirror doc → markdown string) adds serialization overhead on top.

### Finding: The materialized view strategy (from D2) remains the recommended approach
**Confidence:** INFERRED
**Evidence:** Performance analysis combining serialization cost + grep batch patterns

If each readFile requires 5-20ms of serialization, and grep processes 50 files per batch:
- Worst case: 50 * 20ms = 1000ms per batch (serial)
- With Promise.all: ~50-100ms per batch (parallel, CPU-bound)
- For a 500-file KB with recursive grep: 10 batches * 50-100ms = 500ms-1s

This is acceptable for interactive use but slower than ChromaFs (which uses pre-rendered chunks).

A materialized markdown cache (updated via Yjs observers) would:
- Serialize once on document change, not on every read
- readFile returns cached markdown (~1ms)
- grep over 500 files: ~50-100ms total (I/O-bound, not serialization-bound)

This matches the ChromaFs pattern and is recommended for read-heavy KB workloads.

---

## Gaps / follow-ups

* Actual Y.XmlFragment → markdown serialization latency not benchmarked
* Whether TipTap provides an efficient server-side serialization API (without full editor initialization)
* Memory overhead of maintaining both Yjs CRDT state AND markdown cache simultaneously
