# Evidence: @parcel/watcher API and Internals

**Dimension:** @parcel/watcher API, event shape, FSEvents backend, coalescing window, filtering
**Date:** 2026-04-07
**Sources:** @parcel/watcher source code (GitHub parcel-bundler/watcher), index.d.ts, README.md, C++ backend sources

---

## Key files referenced

- `index.d.ts` -- TypeScript API surface (Event type, subscribe, Options)
- `src/Event.hh` -- C++ Event struct and EventList coalescing logic
- `src/Debounce.hh` / `src/Debounce.cc` -- Debounce timer constants and implementation
- `src/macos/FSEventsBackend.cc` -- macOS FSEvents integration
- `src/Watcher.cc` / `src/Watcher.hh` -- Watcher callback management and debounce triggering
- `src/Glob.hh` / `src/Glob.cc` -- Native glob-based ignore filtering
- `wrapper.js` -- Node.js wrapper that processes `ignore` option (paths vs globs via picomatch)
- `src/binding.cc` -- N-API binding exposing subscribe/unsubscribe/writeSnapshot/getEventsSince

---

## Findings

### Finding: Event shape is minimal -- path and type only, no content, no PID
**Confidence:** CONFIRMED
**Evidence:** index.d.ts

```typescript
export type EventType = 'create' | 'update' | 'delete';
export interface Event {
  path: FilePath;
  type: EventType;
}
export type SubscribeCallback = (err: Error | null, events: Event[]) => unknown;
```

No old content, no new content, no file handle, no PID, no inode. The callback receives a batch of events, not one at a time.

**Implications:** Cannot determine "who wrote this file" from the event. Cannot get file diffs from the watcher itself. Must read the file after the event to get content. Application-level write tracking is mandatory for feedback loop prevention.

---

### Finding: C++ EventList coalesces multiple operations on the same path into a single event
**Confidence:** CONFIRMED
**Evidence:** src/Event.hh:30-67

```cpp
void create(std::string path) {
  Event *event = internalUpdate(path);
  if (event->isDeleted) {
    // Assume update event when rapidly removed and created
    event->isDeleted = false;  // delete+create = update
  } else {
    event->isCreated = true;
  }
}
void remove(std::string path) {
  Event *event = internalUpdate(path);
  event->isDeleted = true;
}
std::vector<Event> getEvents() {
  // Filter out events where isCreated && isDeleted (create+delete = no-op)
  for(auto it = mEvents.begin(); it != mEvents.end(); ++it) {
    if (!(it->second.isCreated && it->second.isDeleted)) {
      eventsCloneVector.push_back(it->second);
    }
  }
}
```

Coalescing rules:
- create + delete = filtered out entirely (no event)
- delete + create = treated as update (not delete+create pair)
- Multiple updates = single update event
- The map is keyed by path, so rapid saves to the same file produce one event

**Implications:** Atomic writes (temp file + rename) are handled correctly. The rename produces a delete+create on the final path, which coalesces to an "update" event. The temp file's create+delete is filtered out entirely. This is exactly the right behavior for our use case.

---

### Finding: Debounce constants are MIN_WAIT_TIME=50ms, MAX_WAIT_TIME=500ms
**Confidence:** CONFIRMED
**Evidence:** src/Debounce.hh:9-10

```cpp
#define MIN_WAIT_TIME 50
#define MAX_WAIT_TIME 500
```

The debounce logic (Debounce.cc:70-87):
1. When an event arrives, check if `(now - lastTime) > MAX_WAIT_TIME` (500ms)
2. If yes: notify callbacks immediately (first event after idle period fires right away)
3. If no: wait MIN_WAIT_TIME (50ms) for more events to batch
4. After 50ms with no new events: fire the callback

This means:
- **First file change after 500ms+ of quiet: delivered immediately** (sub-ms from FSEvents callback to JS)
- **Rapid successive changes: batched with 50ms window**
- **Absolute maximum latency from first event in a burst: ~50ms** (MIN_WAIT_TIME)
- **If events keep coming faster than 50ms: they keep batching until a 50ms gap**

**Implications:** For a single Cursor save (one file write), the event fires immediately if it's been >500ms since the last event. For rapid auto-saves (e.g., Cursor saving every 100ms), events batch in 50ms windows, producing about 2 callbacks per second. The 50ms minimum latency is well within acceptable bounds for editor sync.

---

### Finding: FSEvents backend uses 0.001s (1ms) latency parameter
**Confidence:** CONFIRMED
**Evidence:** src/macos/FSEventsBackend.cc:209

```cpp
CFAbsoluteTime latency = 0.001;  // 1 millisecond
```

This is the FSEvents API `latency` parameter passed to `FSEventStreamCreate`. It controls how long FSEvents waits after hearing about an event from the kernel before delivering it. At 1ms, this is essentially "deliver immediately."

The actual delivery latency is dominated by:
1. Kernel detecting the file change (~immediate for VFS operations)
2. FSEvents 1ms latency parameter
3. @parcel/watcher C++ debounce (50ms MIN_WAIT or immediate if >500ms idle)
4. N-API thread-safe function call to JavaScript (~<1ms)

Total: ~1-52ms depending on whether there were recent events.

---

### Finding: FSEvents mtime deduplication prevents spurious events
**Confidence:** CONFIRMED
**Evidence:** src/macos/FSEventsBackend.cc:124-146

```cpp
// For unambiguous modify events:
uint64_t mtime = CONVERT_TIME(file.st_mtimespec);
DirEntry *entry = state->tree->find(paths[i]);
if (entry && mtime == entry->mtime && file.st_mtimespec.tv_nsec != 0) {
  continue;  // Skip if mtime hasn't changed
}
```

The watcher maintains an in-memory DirTree with mtime for each known file. If an FSEvents notification arrives but the file's mtime hasn't changed (nanosecond precision), the event is silently dropped. This prevents phantom events from things like directory metadata changes.

**Implications:** If the filesystem has nanosecond mtime precision, writes that happen faster than nanosecond resolution could theoretically be missed. In practice, macOS APFS has nanosecond mtime, so this is not a concern for human-speed or auto-save-speed writes.

---

### Finding: Glob-based filtering happens at the C++ level (native performance)
**Confidence:** CONFIRMED
**Evidence:** wrapper.js:6-36, src/Glob.cc, src/Watcher.cc:218-241, src/binding.cc:13-54

The `ignore` option is split into two categories by wrapper.js:
- **Paths** (non-glob strings): passed as `ignorePaths`, checked via string prefix matching in C++
- **Globs** (detected by `is-glob`): converted to regex by `picomatch.makeRe()`, passed as `ignoreGlobs`, matched via `std::regex_match` in C++

```javascript
// wrapper.js
for (const value of ignore) {
  if (isGlob(value)) {
    const regex = picomatch.makeRe(value, { dot: true });
    opts.ignoreGlobs.push(regex.source);
  } else {
    opts.ignorePaths.push(path.resolve(dir, value));
  }
}
```

Path filtering in C++ (Watcher.cc:218-241):
- First checks exact path or prefix matches against `mIgnorePaths`
- Then converts to relative path and runs glob regex matching

FSEvents-level exclusion:
```cpp
// FSEventsBackend.cc:236-245
FSEventStreamSetExclusionPaths(stream, exclusions);
```
Path-based exclusions are also set at the FSEvents API level via `FSEventStreamSetExclusionPaths`, so the kernel itself can skip entire directory trees.

**Implications:** We CAN filter to only .md files at the watcher level using a glob like `!**/*.md` in the ignore list (ignoring everything that's NOT .md). However, @parcel/watcher's ignore is exclusive (ignore matching files), not inclusive (only watch matching files). To watch only .md files, we'd need to ignore everything else, which is impractical. Better approach: watch the content directory and filter in the callback.

---

### Finding: FSEvents handles atomic writes (temp+rename) correctly
**Confidence:** CONFIRMED
**Evidence:** src/Event.hh:36-39 (delete+create coalescing) and src/macos/FSEventsBackend.cc:69-182

When a file is written via temp+rename:
1. `tmp.md.tmp` is created -- FSEvents fires with kFSEventStreamEventFlagItemCreated
2. Content is written to `tmp.md.tmp` -- FSEvents fires with kFSEventStreamEventFlagItemModified  
3. `tmp.md.tmp` is renamed to `test.md` -- FSEvents fires kFSEventStreamEventFlagItemRenamed for both paths

Due to event coalescing:
- `tmp.md.tmp`: create + rename(delete) = create+delete = filtered out entirely
- `test.md`: if it existed before, the rename overwrites it. FSEvents fires with both kFSEventStreamEventFlagItemRenamed and potentially kFSEventStreamEventFlagItemModified. The ambiguous flags path (line 147-181) calls `stat()` to determine the file's current state and emits an update event.

The EventList deduplication ensures only ONE event per path per batch.

**Implications:** The current persistence layer's atomic write pattern (writeFile to `.tmp` then rename) is fully compatible with @parcel/watcher. The watcher will report a single `update` event for the target .md file.

---

## Negative searches

* Searched: "content" or "data" or "diff" in Event struct -- NOT FOUND. Events carry no content payload.
* Searched: configurable debounce/latency at the JavaScript API level -- NOT FOUND. The 50ms/500ms constants are hardcoded in C++ headers. No JS-level configuration.

---

## Gaps / follow-ups

* The 50ms MIN_WAIT_TIME is not configurable. If sub-50ms event delivery is needed, this would require a fork or upstream contribution.
* FSEventsSetExclusionPaths only works for path-based exclusions, not glob patterns. Glob filtering happens after the event reaches user-space C++.
