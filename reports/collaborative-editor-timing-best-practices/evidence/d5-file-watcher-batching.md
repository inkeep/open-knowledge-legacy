# Evidence: File Watcher Event Batching

**Dimension:** D5 — File watcher event batching in build tools and editors
**Date:** 2026-04-16
**Sources:** chokidar/parcel-watcher source, Webpack/Vite docs, VS Code wiki, nodemon docs

---

## Production file watcher values

| Tool | Default Batch/Debounce | Rename Detection | Notes |
|------|----------------------|------------------|-------|
| chokidar | None (immediate) | None (100ms atomic for same-file) | awaitWriteFinish: 2000ms stability |
| @parcel/watcher | 500ms (hardcoded C++) | Yes (inode-based, coalesced) | Events coalesced per file |
| VS Code | Inherits parcel (500ms) + own coalescing | Via parcel | Falls back to 5s polling |
| Webpack 5 | 200ms aggregateTimeout | N/A | Trailing-edge debounce |
| Vite | None (delegates to chokidar) | None | Immediate HMR |
| nodemon | 1,000ms | N/A | Restart delay |
| esbuild | 0ms (immediate) | N/A | Optional debounce config |
| fabiospampinato/watcher | 300ms debounce | 1,250ms renameTimeout | Most configurable |

## Rename detection windows

- chokidar atomic: 100ms (same-file delete+re-add)
- fabiospampinato/watcher: 1,250ms (cross-directory rename correlation)
- General guidance: 100ms-1250ms range, with 50ms as minimum for OS event delivery

Sources: chokidar README, @parcel/watcher source (Debounce.cc), VS Code File Watcher wiki, Webpack docs
