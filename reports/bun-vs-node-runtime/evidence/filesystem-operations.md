# Evidence: File System Operations (D4)

**Dimension:** File watching, read/write performance, git operations in Bun vs Node.js
**Date:** 2026-04-03
**Sources:** Bun documentation, benchmarks, GitHub issues

---

## Key files / pages referenced

- [Bun file watching docs](https://bun.com/docs/guides/read-file/watch) -- Built-in watch API
- [Bun.watch discussion](https://github.com/oven-sh/bun/discussions/1571) -- Feature request for dedicated watcher
- [Node fs.watch in Bun](https://bun.com/reference/node/fs/watch) -- Compatibility layer
- [Bun file operations guide](https://oneuptime.com/blog/post/2026-01-31-bun-file-operations/view) -- Read/write patterns

---

## Findings

### Finding: Bun provides built-in file watching via fs.watch (Node-compatible)
**Confidence:** CONFIRMED
**Evidence:** [Bun docs](https://bun.com/docs/guides/read-file/watch)

Bun supports Node's fs.watch API with both callback and async iterator patterns:
```javascript
import { watch } from "fs";
const watcher = watch("./src", { recursive: true }, (event, filename) => { ... });
```

Also supports `for await...of` pattern via node:fs/promises.

A dedicated Bun.watch API has been discussed (GitHub discussion #1571) but is not yet implemented.

**Implications:** For file watching, Bun's built-in fs.watch is sufficient for basic use cases. However, it lacks the reliability guarantees of @parcel/watcher (which uses OS-native APIs like FSEvents on macOS). For production file watching, chokidar (pure JS, uses fs.watch internally) or resolving the @parcel/watcher prebuild issue is needed.

### Finding: Bun file I/O is 2-3x faster than Node.js
**Confidence:** CONFIRMED
**Evidence:** Multiple benchmark sources

- Bun's file I/O operations are reported as 3x faster for reading and writing
- Bun.write() is optimized at the Zig level with minimal syscalls
- Bun.file() returns a lazy file handle that doesn't read until needed

Caveat: No append mode in Bun.write() -- must use node:fs appendFile() for append operations.

**Implications:** For the auto-persistence pipeline (writing git objects, saving document state), Bun's faster file I/O provides marginal improvement. The bottleneck is isomorphic-git's JavaScript-level processing, not raw I/O.

### Finding: Bun's --watch and --hot modes are mature for development
**Confidence:** CONFIRMED
**Evidence:** [Bun docs](https://bun.com/docs/runtime/http/websockets)

- `bun --watch` restarts the process on file changes
- `bun --hot` does hot module reloading without process restart, preserving WebSocket connections and HTTP server state

**Implications:** For development of the knowledge platform itself, Bun's built-in hot reload is valuable. For the file watching feature of the product (detecting external file changes), the standard fs.watch API is used regardless.

### Finding: @parcel/watcher has Bun compatibility issues but workarounds exist
**Confidence:** CONFIRMED
**Evidence:** [Bun Issue #19282](https://github.com/oven-sh/bun/issues/19282)

Issues:
1. Prebuilt binaries not found (postinstall scripts not running)
2. detect-libc returns function instead of string

Workaround: Add to trustedDependencies in package.json.
Alternative: Use Bun's built-in fs.watch or chokidar (pure JS).

**Implications:** @parcel/watcher can work but requires configuration. For a product distributed via npx, this adds friction. Using fs.watch or chokidar avoids the issue entirely.

### Finding: isomorphic-git file operations work in Bun
**Confidence:** INFERRED
**Evidence:** isomorphic-git uses the `fs` parameter (pluggable filesystem). Bun's node:fs implementation is compatible.

isomorphic-git accepts a pluggable `fs` module. In Node.js, you pass `require('fs')`. In Bun, the equivalent works because Bun implements the Node fs API. Local git operations (add, commit, status, log, branch) don't involve networking and rely only on file system operations.

**Implications:** Local git operations (the primary use case for auto-persistence) should work without issues.

---

## Gaps / follow-ups

* Bun's fs.watch reliability on macOS for large directories not benchmarked against @parcel/watcher
* isomorphic-git + Bun fs not explicitly smoke-tested in community reports
