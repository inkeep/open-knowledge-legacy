# Evidence: Filesystem Concurrency & Agent Interaction Analysis

## Obsidian's File Watching Mechanism

### How It Works
- Obsidian monitors the vault directory using Node.js `fs.watch` with platform-native APIs: FSEvents (macOS), inotify (Linux), ReadDirectoryChangesW (Windows)
- **Local filesystems:** Detection is near-instant (sub-second), with **~2-second debounce window** to batch rapid modifications
- **Cloud-synced vaults (iCloud, Dropbox, OneDrive):** Automatically switches to **polling mode** with **30-second default interval** — agents writing to cloud-synced vaults face significantly delayed detection
- A periodic backstop poll catches events `fs.watch` may have missed
- `cachedRead()` vs `read()`: When file watcher notifies of external change, `cachedRead()` invalidates cache and returns fresh data. Until notification arrives, returns stale cached version.
- Source: https://docs.obsidian.md/Plugins/Vault
- Source: https://forum.obsidian.md/t/expand-the-file-watcher-capability-to-the-whole-vault-instead-of-just-the-root/174

### MetadataCache Update Pipeline
- Source: https://docs.obsidian.md/Reference/TypeScript+API/MetadataCache
- MetadataCache extends Events class
- Events: `changed`, `deleted`, `resolve`, `resolved`
- `changed`: Fired when file is indexed and updated cache is available
- **NOT fired on rename** (performance optimization) — must use vault rename event
- `resolved`: Fired when ALL files have been resolved after modification batch
- Plugins register: `app.metadataCache.on('changed', callback)`

### External Change Pickup
- Source: https://forum.obsidian.md/t/monitoring-for-external-changes/51660
- External edits to a file **open in Obsidian** may not display until file is closed/reopened
- New files created externally generally appear in file explorer
- Android: Known issues with not detecting external file changes
- Desktop: Generally reliable but with edge cases

## Conflict Resolution

### Obsidian Sync Conflict Handling
- Source: https://deepwiki.com/obsidianmd/obsidian-help/2.3-filters-and-views
- **Markdown files:** Automatic 3-way merge via Google's diff-match-patch algorithm
- **Non-markdown files:** "Last modified wins" (most recent timestamp)
- **JSON settings:** Key-level merge (local keys applied over remote)
- When auto-merge fails: creates conflict file, user must manually merge

### File Recovery Core Plugin
- Built-in "File Recovery" plugin creates periodic snapshots
- Can restore previous versions of notes
- Acts as safety net for external modification disasters

## Auto-Save Timing & Race Conditions
- Obsidian auto-saves **~2 seconds after the start of user input**, then every 2 seconds during continuous editing
- If an external process writes to the same file during this window, a real race condition exists
- Obsidian attempts automatic merging via **Google's diff-match-patch** three-way merge algorithm
- When merge succeeds: editor updates in place with notification "has been modified externally, merging changes automatically"
- When merge fails: content may be **silently lost or replaced**
- Source: https://forum.obsidian.md/t/disable-auto-save-or-change-frequency/14230
- Source: https://forum.obsidian.md/t/race-condition-with-two-async-calls/33394

## Vault API Safe Write Methods
- `vault.process(file, fn)` — Atomic read-modify-write. Reads current content, passes to callback, writes result. Avoids race condition of separate read-then-write calls.
- `fileManager.processFrontMatter(file, fn)` — Atomic frontmatter modification. **Caveat: destroys all formatting** (comments, custom quote styles, complex YAML).
- These methods are only available to Obsidian plugins, not to external filesystem writers or REST API consumers.
- **CRITICAL BUG:** Neither `vault.process` nor `vault.modify` work if called within 2 seconds of a file being edited in the editor, due to `requestSave` debounce event. Even REST API-based writes (which use these internally) can **silently fail** during active editing. No official fix. Source: https://forum.obsidian.md/t/vault-process-and-vault-modify-dont-work-when-there-is-a-requestsave-debounce-event/107862

## Mitigation Tools
- **obsidian-drift** (https://github.com/ryanbbrown/obsidian-drift) — Purpose-built for detecting external modifications from coding agents. Uses CodeMirror 6 transaction monitoring for real-time detection, provides side-by-side diff with selective accept/reject, edit protection warning before overwriting files with pending diffs.
- **File Recovery core plugin** — Snapshots every 5 minutes, kept 7 days. Only `.md` and `.canvas`. Last resort, not primary safety.
- **Git on vault** — Single most recommended safety measure. Every change tracked and reversible.

## Documented Data Loss Cases
1. **Cloud sync conflicts:** iCloud Drive modifies files while Obsidian writes. macOS updates silently change iCloud settings to "Optimize Mac Storage," causing Obsidian to detect external modifications. Forum report: entire document content deleted except title. Source: https://forum.obsidian.md/t/intermittent-data-loss-for-current-document/90170
2. **Plugin-triggered loops:** Templater's `processFrontMatter` hook triggers "modified externally" notification and causes content erasure when running while editor saves. Source: https://github.com/SilentVoid13/Templater/issues/1341
3. **Dual-editor conflicts:** Running Obsidian and Logseq on same vault simultaneously causes words disappearing, entire documents emptied. Source: https://discuss.logseq.com/t/conflict-with-obsidian-content-of-a-document-erased/2623
4. **EBUSY errors:** External processes holding file locks cause `EBUSY: resource busy` errors. Source: https://forum.obsidian.md/t/error-ebusy-but-its-still-saving/69139
5. **"Modified externally" text erasure:** Bug report where constant "modified externally" messages erase text while user is typing. Source: https://forum.obsidian.md/t/bug-modified-externally-message-constantly-appears-erasing-my-text/26090

## Agent Write Patterns — Failure Mode Analysis

### Scenario 1: Agent writes file while user has it open in editor
- **Behavior:** Obsidian's file watcher detects the change
- **Risk:** If user has unsaved edits, Obsidian may overwrite the agent's changes on save, OR may prompt about external changes (behavior varies by platform)
- **Data loss potential:** MEDIUM — user's in-memory edits may conflict with disk state

### Scenario 2: Agent modifies frontmatter while Properties view is open
- **Behavior:** Properties panel reads from parsed cache, external change updates cache
- **Risk:** If user is editing a property, the panel may not refresh until focus changes
- **Data loss potential:** LOW — frontmatter is typically saved atomically

### Scenario 3: Agent creates 100 files rapidly
- **Behavior:** File watcher receives burst of events, MetadataCache queues processing
- **Risk:** Cache may lag behind disk state; plugins relying on cache may see stale data
- **Data loss potential:** NONE — files are created correctly on disk; UI may take seconds to catch up
- Source: MetadataCache `resolved` event fires once all files are indexed

### Scenario 4: Agent renames file
- **Behavior:** If agent renames via filesystem (mv), Obsidian sees delete + create
- **Risk:** Wikilinks `[[OldName]]` are NOT automatically updated (only Obsidian's internal rename command updates links)
- **Data loss potential:** NONE, but **link breakage is guaranteed** for filesystem renames
- Obsidian's rename via Vault API DOES update links automatically

### Scenario 5: Agent deletes file
- **Behavior:** Obsidian detects deletion, removes from cache
- **Risk:** If file was open, editor may show stale content
- **Data loss potential:** HIGH if user expected the file to exist (no Obsidian trash for external deletes — file goes directly to OS trash or is permanently deleted)

### Scenario 6: Partial/crashed write
- **Behavior:** If agent crashes mid-write, file may be truncated or corrupted
- **Risk:** Obsidian reads whatever is on disk — corrupted frontmatter breaks metadata parsing
- **Data loss potential:** HIGH for the affected file
- **Mitigation:** Write to temp file, then atomic rename (not all MCP servers do this)

## MCP Server Access Patterns

### Direct Filesystem Servers (mcpvault, obsidian-mcp-pro, StevenStavrakis)
- Read/write directly to vault folder
- No coordination with Obsidian's internal state
- Fastest access, but highest conflict risk
- **Atomic writes:** Not documented for any direct-filesystem server

### REST API Bridge Servers (cyanheads, MarkusPfundstein, aaronsb/semantic)
- Go through obsidian-local-rest-api plugin
- Plugin writes via Obsidian's Vault API — respects internal state
- Cache stays in sync because writes go through Obsidian
- **Trade-off:** Requires Obsidian to be running, adds latency, but safer

### Native Plugin Servers (aaronsb/mcp-plugin, obsidian-mcp-tools)
- Run inside Obsidian process
- Full access to Vault API and MetadataCache
- Safest for concurrent access — uses same write path as user edits
- **Trade-off:** Requires Obsidian to be running, limited to Obsidian's event loop

## Key Findings for Karpathy Workflow

1. **File creation is safe** — Obsidian handles new files well, even in bursts
2. **File modification is risky** — If file is open in editor, conflicts possible
3. **File rename via filesystem breaks links** — Must use Obsidian API for link-safe renames
4. **REST API servers are safer** than direct filesystem for writes
5. **No MCP server implements optimistic locking** — no "check if file changed since I read it"
6. **No MCP server supports atomic write-with-rename pattern**
7. **The safest workflow:** Agent creates NEW files (wiki articles) rather than modifying existing ones. This is compatible with the Karpathy workflow where LLM output is compiled into new wiki pages.
