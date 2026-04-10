# Evidence: Source Code Architecture

**Dimension:** D1 — Source code architecture (IFileSystem, InMemoryFs, OverlayFs, ReadWriteFs, MountableFs, commands, exec/shell)
**Date:** 2026-04-02
**Sources:** github.com/vercel-labs/just-bash (cloned at commit d6a5ff0, v2.14.0)

---

## Key files referenced

- `src/fs/interface.ts` — IFileSystem interface definition (21 methods, 292 lines)
- `src/fs/in-memory-fs/in-memory-fs.ts` — InMemoryFs implementation (~550 lines)
- `src/fs/overlay-fs/overlay-fs.ts` — OverlayFs copy-on-write implementation (~600 lines)
- `src/fs/read-write-fs/read-write-fs.ts` — ReadWriteFs direct-disk implementation
- `src/fs/mountable-fs/mountable-fs.ts` — MountableFs multi-mount composition
- `src/Bash.ts` — Main Bash class, exec() entry point
- `src/ast/types.ts` — AST node types for the parser
- `src/interpreter/pipeline-execution.ts` — Pipeline (pipe) execution
- `src/commands/registry.ts` — Command registry with lazy loading
- `src/commands/grep/grep.ts` — grep implementation
- `src/commands/rg/rg.ts` — ripgrep implementation
- `src/commands/cat/cat.ts` — cat implementation
- `src/commands/sed/sed.ts` — sed implementation (671 lines)
- `src/commands/find/find.ts` — find implementation
- `src/types.ts` — CommandContext, Command, ExecResult types
- `src/custom-commands.ts` — defineCommand API
- `src/index.ts` — public exports
- `src/browser.ts` — browser-compatible entry (excludes OverlayFs, ReadWriteFs)
- `package.json` — v2.14.0, Apache-2.0, 15 dependencies

---

## Findings

### Finding: IFileSystem interface has 21 methods covering full POSIX filesystem semantics
**Confidence:** CONFIRMED
**Evidence:** `src/fs/interface.ts` lines 116-262

The interface requires:
1. `readFile(path, options?)` → `Promise<string>`
2. `readFileBuffer(path)` → `Promise<Uint8Array>`
3. `writeFile(path, content, options?)` → `Promise<void>`
4. `appendFile(path, content, options?)` → `Promise<void>`
5. `exists(path)` → `Promise<boolean>`
6. `stat(path)` → `Promise<FsStat>`
7. `mkdir(path, options?)` → `Promise<void>`
8. `readdir(path)` → `Promise<string[]>`
9. `readdirWithFileTypes?(path)` → `Promise<DirentEntry[]>` (optional)
10. `rm(path, options?)` → `Promise<void>`
11. `cp(src, dest, options?)` → `Promise<void>`
12. `mv(src, dest)` → `Promise<void>`
13. `resolvePath(base, path)` → `string`
14. `getAllPaths()` → `string[]`
15. `chmod(path, mode)` → `Promise<void>`
16. `symlink(target, linkPath)` → `Promise<void>`
17. `link(existingPath, newPath)` → `Promise<void>`
18. `readlink(path)` → `Promise<string>`
19. `lstat(path)` → `Promise<FsStat>`
20. `realpath(path)` → `Promise<string>`
21. `utimes(path, atime, mtime)` → `Promise<void>`

All methods are async (Promise-based) except `resolvePath()` and `getAllPaths()` which are synchronous.

Comment in interface.ts: "Note: Sync methods are not supported and must not be added."

### Finding: InMemoryFs stores files in a flat Map<string, FsEntry>
**Confidence:** CONFIRMED
**Evidence:** `src/fs/in-memory-fs/in-memory-fs.ts` line 70

```typescript
export class InMemoryFs implements IFileSystem {
  private data: Map<string, FsEntry> = new Map();
```

FsEntry is a discriminated union: `FileEntry | LazyFileEntry | DirectoryEntry | SymlinkEntry`. File content is stored as `Uint8Array` internally (converted from string on write via TextEncoder). The Map keys are normalized absolute paths. Lazy files call their provider function on first read and replace the entry with a materialized FileEntry.

### Finding: OverlayFs uses memory Map + deleted Set for copy-on-write
**Confidence:** CONFIRMED
**Evidence:** `src/fs/overlay-fs/overlay-fs.ts` lines 122-123

```typescript
private readonly memory: Map<string, MemoryEntry> = new Map();
private readonly deleted: Set<string> = new Set();
```

Read path: check deleted set → check memory layer → fall back to real filesystem.
Write path: write to memory layer, remove from deleted set.
Delete path: add to deleted set, remove from memory layer.

Security: symlinks blocked by default, all real-FS access goes through `resolveRealPath_()` / `resolveRealPathParent_()` gates. O_NOFOLLOW used for TOCTOU defense.

### Finding: MountableFs delegates to mounted filesystems based on path prefix matching
**Confidence:** CONFIRMED
**Evidence:** `src/fs/mountable-fs/mountable-fs.ts` lines 63-98

```typescript
export class MountableFs implements IFileSystem {
  private baseFs: IFileSystem;
  private mounts: Map<string, MountEntry> = new Map();
```

Routing logic: for each operation, resolve path → find longest-prefix mount → delegate to mounted filesystem with path remapped relative to mount point. Falls back to baseFs for unmounted paths.

### Finding: Shell execution follows a full AST-based pipeline
**Confidence:** CONFIRMED
**Evidence:** `src/Bash.ts` lines 1-9, `src/ast/types.ts`

Architecture: `Input → Lexer → Parser → AST → Interpreter → Output`

The AST includes: ScriptNode, StatementNode, PipelineNode, CommandNode (SimpleCommand, If, For, While, Case, etc.). Pipeline execution connects commands via stdin/stdout chaining. Each exec() call gets isolated shell state; the filesystem is shared.

### Finding: 100+ commands implemented with lazy loading and batched parallel I/O
**Confidence:** CONFIRMED
**Evidence:** `src/commands/registry.ts` (98 command names in CommandName type), grep processes files in parallel batches of 50, find uses batch size 500

grep: Full flag support (-i, -n, -v, -c, -l, -L, -r, -w, -x, -E, -P, -F, -o, -h, -q, -m, -A, -B, -C, --include, --exclude, --exclude-dir). Uses shared search-engine module. Supports basic, extended, perl, and fixed-string regex modes.

rg (ripgrep): Additional features over grep — smart case, --type filtering, --glob, --hidden, --json output, --multiline, --vimgrep, --column, --heading, --replace, --stats, --follow symlinks, .gitignore respect.

sed: Full stream editor (671 lines) with s/d/p/a/i/c/h/H/g/G/x/n/N/y/=/l/b/t/T commands, -i in-place editing, -E extended regex.

### Finding: Package has 15 runtime dependencies, 18.8MB unpacked
**Confidence:** CONFIRMED
**Evidence:** `npm view just-bash` output

Dependencies: diff, minimatch, sprintf-js, turndown, sql.js, quickjs-emscripten, re2js, fast-xml-parser, file-type, ini, modern-tar, papaparse, yaml, smol-toml, compressjs. Optional: @mongodb-js/zstd, node-liblzma.

86 published versions. 314 commits since 2025-12-23. Latest commit 2026-03-19.

---

## Gaps / follow-ups

* Exact bundle size after tree-shaking (esbuild minified output) not measured
* Performance benchmarks for grep/find on large filesystems not tested
