# Evidence: Performance at Scale -- Watching 1000+ .md Files

**Dimension:** CPU/memory overhead, event delivery latency, filtering strategy
**Date:** 2026-04-07
**Sources:** @parcel/watcher source (FSEventsBackend.cc, DirTree, Debounce), README.md, FSEvents API documentation

---

## Key files referenced

- `@parcel/watcher/src/macos/FSEventsBackend.cc:206-263` -- FSEvents stream creation (single stream per directory)
- `@parcel/watcher/src/DirTree.hh` / `DirTree.cc` -- In-memory directory tree for mtime tracking
- `@parcel/watcher/src/Debounce.hh` -- 50ms/500ms debounce constants
- `@parcel/watcher/README.md:12` -- "tens of thousands of files can be watched or queried at once"
- `@parcel/watcher/src/Watcher.cc:218-241` -- isIgnored path/glob filtering
- `@parcel/watcher/src/binding.cc:165-191` -- Subscribe flow

---

## Findings

### Finding: @parcel/watcher uses a single FSEvents stream per watched directory (kernel-level efficiency)
**Confidence:** CONFIRMED
**Evidence:** FSEventsBackend.cc:206-263

```cpp
void FSEventsBackend::startStream(WatcherRef watcher, FSEventStreamEventId id) {
  CFAbsoluteTime latency = 0.001;
  CFStringRef fileWatchPath = CFStringCreateWithCString(NULL, watcher->mDir.c_str(), ...);
  CFArrayRef pathsToWatch = CFArrayCreate(NULL, (const void **)&fileWatchPath, 1, NULL);
  
  FSEventStreamRef stream = FSEventStreamCreate(
    NULL, &FSEventsCallback, &callbackInfo,
    pathsToWatch, id, latency,
    kFSEventStreamCreateFlagFileEvents  // File-level events (not just directory-level)
  );
  
  FSEventStreamSetExclusionPaths(stream, exclusions);
  FSEventStreamScheduleWithRunLoop(stream, mRunLoop, kCFRunLoopDefaultMode);
  FSEventStreamStart(stream);
}
```

One FSEvents stream watches the entire directory tree recursively. The kernel maintains the subscription -- @parcel/watcher does NOT poll or scan the filesystem. This is the same mechanism VS Code uses for file watching (VS Code switched to @parcel/watcher in v1.62).

**Implications:** Watching a directory with 1000 .md files has the same kernel overhead as watching a directory with 10 .md files. There's no per-file cost at the kernel level.

---

### Finding: In-memory DirTree adds ~100-200 bytes per tracked file
**Confidence:** INFERRED
**Evidence:** DirTree data structure analysis

The DirTree stores a `DirEntry` per file/directory:
```cpp
struct DirEntry {
  std::string path;     // Full path string
  uint64_t mtime;       // 8 bytes
  bool isDir;           // 1 byte
  // plus std::map overhead
};
```

For 1000 .md files with average path length of 80 characters:
- Path string: ~80 bytes per entry
- mtime + flags: ~16 bytes per entry
- Map overhead: ~48 bytes per entry (red-black tree node)
- Total per file: ~144 bytes
- Total for 1000 files: ~144 KB

For 10,000 files: ~1.4 MB. Negligible.

---

### Finding: CPU overhead for 1000 files is negligible -- dominated by event processing, not watching
**Confidence:** INFERRED
**Evidence:** Architecture analysis

The watching phase has zero CPU cost (kernel FSEvents subscription is passive). CPU is only consumed when events arrive:

1. **FSEvents callback processing:** O(n) where n = number of events in the batch. For each event: stat() call (syscall, ~0.1ms per file) + DirTree lookup + EventList update. Total for 10 events: ~1-2ms.

2. **Debounce thread:** Wakes every 50ms when events are active. Otherwise idle.

3. **JavaScript callback:** Receives the event array. For each .md file event: read file (~0.5ms), compute hash (~0.01ms), CRDT update (~1-5ms). Total for 10 simultaneous .md changes: ~15-55ms.

In a typical editing session, events arrive one at a time (user saves one file). Burst scenarios (git checkout, npm install) are handled by the 50ms batching.

---

### Finding: Filtering to only .md files should happen in the JavaScript callback, not at the watcher level
**Confidence:** CONFIRMED
**Evidence:** @parcel/watcher API analysis

The `ignore` option is EXCLUSIVE (ignore matching files), not INCLUSIVE (only watch matching files). There is no `include` option.

To watch only .md files, you'd need to ignore everything that's NOT .md:
```javascript
// This does NOT work -- ignore is for paths/globs to exclude
await watcher.subscribe(dir, cb, { ignore: ['!**/*.md'] }); // WRONG
```

The correct approach:
```javascript
// Watch the directory, filter in the callback
const subscription = await watcher.subscribe(contentDir, (err, events) => {
  if (err) { console.error(err); return; }
  
  const mdEvents = events.filter(e => e.path.endsWith('.md'));
  if (mdEvents.length === 0) return;
  
  for (const event of mdEvents) {
    processEvent(event);
  }
});
```

However, we CAN use ignore to exclude known non-content directories:
```javascript
await watcher.subscribe(contentDir, cb, {
  ignore: [
    '.git',
    'node_modules',
    '.DS_Store',
    '**/*.tmp',  // Ignore our temp files
  ]
});
```

The `.git` and `node_modules` exclusions are passed to FSEventStreamSetExclusionPaths at the kernel level, so those directories don't even generate events.

---

### Finding: Event delivery latency from file save to JS callback is 1-52ms on macOS
**Confidence:** INFERRED
**Evidence:** Combined analysis of FSEvents latency parameter (1ms), debounce timing (50ms/500ms)

Latency breakdown:
| Component | Latency | Notes |
|---|---|---|
| Kernel VFS detection | <1ms | File write completes -> VFS generates event |
| FSEvents delivery | ~1ms | Configured latency parameter |
| @parcel/watcher debounce | 0-50ms | 0 if >500ms since last event, up to 50ms if recent events |
| C++ -> JS via N-API TSFN | <1ms | Thread-safe function call |
| **Total** | **~2-52ms** | |

For the typical case (isolated file save, no recent events): ~2ms.
For burst case (rapid saves): up to ~52ms (batched with other events in the same 50ms window).

---

### Finding: @parcel/watcher's shared instance model means multiple subscribers share the same native watcher
**Confidence:** CONFIRMED
**Evidence:** Watcher.cc:18-33 (getShared)

```cpp
WatcherRef Watcher::getShared(std::string dir, ...) {
  WatcherRef watcher = std::make_shared<Watcher>(dir, ignorePaths, ignoreGlobs);
  auto found = getSharedWatchers().find(watcher);
  if (found != getSharedWatchers().end()) {
    return *found;  // Reuse existing watcher
  }
  getSharedWatchers().insert(watcher);
  return watcher;
}
```

If multiple Node.js modules call `subscribe()` on the same directory with the same ignore options, they share a single native FSEvents stream. Each subscriber gets its own callback, but the kernel overhead is not duplicated.

**Implications:** If the application already uses @parcel/watcher for other purposes (e.g., Vite's HMR), adding a second subscription for CRDT sync doesn't create a second kernel watcher.

---

## Gaps / follow-ups

* No published benchmarks exist for @parcel/watcher memory usage at 10K+ file scale. The 1.4MB estimate is theoretical.
* The DirTree is maintained even for ignored files within the watched directory subtree -- the actual memory footprint may be larger than the .md-file-only estimate if the content directory contains non-.md files.
* Under extreme burst conditions (e.g., git checkout affecting 500 .md files), the watcher batches all events into a single callback. Processing 500 file reads + CRDT updates sequentially could take 5-25 seconds. A queue with concurrency limiting (e.g., p-limit) would be needed.
