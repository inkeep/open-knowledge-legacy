# Evidence: D10 — Architectural seam archetypes

**Dimension:** The three classes of seam for plugging clone-from-GitHub into an on-device editor, with fit tests
**Date:** 2026-04-14
**Sources:** pattern analysis across VSCode, GitHub Desktop, Zed, gh CLI, Obsidian-Git

---

## The three archetypes

### Archetype A — CLI orchestrator (clone → init → start chain)

**Shape.** A command (CLI subcommand, empty-state button, menu item) invokes an orchestrator that chains:
1. Clone git repo into a target directory.
2. Run the editor's init scaffolding on the directory (if needed per D1 Q1).
3. Start the editor's server pointing at the directory.
4. Open the UI (browser, native window, VSCode webview, etc.) to the newly-started instance.

The orchestrator itself can be a pure CLI command; editor-side UI entry points invoke it via process spawn or equivalent IPC.

**Fit test (all must be Y):**
- Editor has a launch/start command that accepts a path argument.
- Init is idempotent on non-empty directories (crucial: cloned repos are non-empty, often contain config files the editor must preserve).
- Editor supports multiple instances against different paths (either sequentially or in parallel).

**Why it's usually right:**
- Zero server-level changes required.
- Clone is a long-running external operation; keeping it out of the server avoids coupling and race risks.
- Subprocess isolation means clone failures don't destabilize a running editor.
- Progress and error surfaces are concrete (stderr → UI stream).

**Weaknesses:**
- Not a first-class "live" action — the running editor can't "switch to a cloned repo" without a new process (but see Archetype C for solving that elegantly).
- Subprocess spawn adds ~100–500ms per clone operation on modern hardware; irrelevant for clone-and-open UX, would matter if clone were in a hot path (it isn't).

**Prior art:**
- `gh repo clone` — pure CLI orchestrator (no editor handoff, but the clone+auth pattern is canonical).
- VSCode's `--folder-uri` argument handling — starting VSCode with a folder path triggers the whole open-folder flow, which is what an A-style orchestrator invokes post-clone.

### Archetype B — In-server hot-swap endpoint

**Shape.** A running editor server receives a request (HTTP POST, IPC message, internal command) like `openRepo(url)`:
1. Server executes clone into a new target directory.
2. Server reconfigures its internal state to point at the new directory — swapping content-dir, reinitializing persistence scopes, restarting file watcher, tearing down old document state, rebuilding new document state.
3. Connected clients receive a "content changed" signal and reload their UI against the new content.

**Fit test (all must be Y):**
- Server factory exposes a `reconfigure(newContentDir)` method (not just `start` / `destroy`).
- Persistence layer can switch active scope without cross-contamination (e.g., previous project's documents don't leak into new project's session).
- In-memory document/session state has a defined teardown that's safe to invoke mid-lifecycle.
- File watcher supports stop-and-restart cleanly.
- Connected clients handle the "content dir changed" message gracefully (not "the WebSocket disconnected"; a semantic app-level signal).
- Locks and ownership contracts release/reacquire cleanly without race windows.

**Why it's usually wrong:**
- Most editor servers are designed as one-server-per-content-dir. The content-dir is closed over at construction by many subsystems: file watcher, persistence driver, filter rules, document namespace, lock file, index cache, shadow-repo handle, etc. Reconfiguration requires reinitializing each, while connected clients hold live sessions against the old state.
- Teardown ordering tends to be tuned for process exit (shutdown phases 1..N, lock released last), not live swap. Live-swap reordering creates race windows and orphaned state.
- Cross-project contamination is a class of bug that's easy to introduce and hard to detect — cached filter rules, persisted auth state, module-global write-trackers, in-flight batch operations.

**When it might be right:**
- Single-window editor products where users strongly prefer "same window, different project" over spawning new windows.
- Editors architected from day one with content-dir as a mutable state (rare; requires specific design intent).

**Prior art:**
- None common in the on-device editor ecosystem studied. More common in server-side CMS architectures (different constraints: different security model, different session model, no long-lived CRDT state).

### Archetype C — Multi-process launcher (detect-or-spawn)

**Shape.** A launcher (CLI binary, tray app, or editor component that exists outside the server lifecycle):
1. Reads a lock file (or equivalent registry) at the target directory to check if an editor server is already running there.
2. If a live server exists: opens the UI (browser, native window) pointed at the existing server's published URL/port.
3. If no server exists: spawns a new server instance targeting that directory, waits for it to publish its port/URL, then opens the UI.

For clone: Archetype A does the actual clone; Archetype C is what the launcher does after clone (or at any subsequent "open this project" operation).

**Fit test (all must be Y):**
- Server uses a lock file (or equivalent) to enforce one-instance-per-content-dir. Lock file publishes enough metadata (port, URL, PID) for a launcher to connect.
- Architecture supports multiple server instances running simultaneously against different directories. (Common — shared-nothing server designs handle this naturally.)
- Clean lock handling for dead-process cases (stale lock detection, PID liveness check).

**Why it shines for multi-project workflows:**
- Each project is isolated in its own server process. Crashes don't cross-contaminate.
- Users can have multiple projects open simultaneously in different browser tabs/windows.
- No "switch project" context loss — projects are parallel, not exclusive.
- Composes with Archetype A: A handles new-clone flow, C handles "open this project I cloned yesterday."

**Weaknesses:**
- Process proliferation on heavy-switching workflows (N projects = N server processes).
- "Spawn server, wait for port, open browser" has platform-specific sequencing (child_process on Unix, CreateProcess on Windows).
- Multiple processes compete for resources (CPU, memory, file handles) on resource-constrained machines.

**Prior art:**
- VSCode's folder-open behavior (opens existing window if that folder is already open, else new window).
- macOS application launcher (`open -a` style) with document-based apps.
- GitHub Desktop does NOT do this — it's single-window, single-server, and handles multi-repo via an internal list (a form of in-server state, not process separation).

---

## Decision tree

```
Start: Q4 from D1 methodology — does your server expose a reconfigure hook?

├─ YES → Additional fit test: do your persistence, watcher, document state,
│        and lock contracts all support swap cleanly?
│        ├─ YES + single-window UX preferred → Archetype B
│        └─ NO (hot-swap would be fragile) → Archetype A (or A+C)
│
└─ NO → Archetype A for initial clone
        ├─ Users work on one project at a time → A alone suffices
        └─ Users work on multiple projects in parallel → A + C
                (A does initial clone, C does every subsequent open)
```

**Default when uncertain:** Archetype A. It composes cleanly with C, requires no server changes, and is rollback-safe.

---

## Cross-archetype requirements

Regardless of archetype chosen:

1. **Target path must be predictable.** The clone's output directory is the same thing the editor's "open folder" flow accepts as input. No path transformation at the boundary.

2. **Post-clone init is idempotent.** If the cloned repo already contains the editor's project-local metadata (e.g., it IS an editor project being shared), init must preserve it, not overwrite it. The init command's `writeIfMissing` semantics are mandatory, not optional.

3. **Trust check fires on first boot.** D8's trust model applies regardless of which archetype delivered the clone — the editor must treat a freshly-cloned dir as untrusted until explicitly trusted.

4. **Failure modes are recoverable.** Clone can fail mid-stream (network drop, auth failure, disk full, invalid URL). The orchestrator must leave the filesystem in a sensible state (no partial clone hanging around) and surface a clear error to the user.

---

## Why in-server hot-swap fails the common case

Concrete failure modes that show up when forcing Archetype B onto a codebase that wasn't designed for it:

- **Cross-project document leaks.** Persistence layer holds open documents keyed by docName. Swap content dir; new dir has a document with the same name; client reconnects; server serves a stale document from the old dir's namespace.
- **File watcher ghost events.** Old watcher is stopped but event queue still has pending events; they fire against the new content dir; new dir sees "change" for a file that doesn't exist there.
- **Lock race windows.** Release lock on old dir → another process acquires it before you can acquire the lock on the new dir → you're now blocked.
- **Orphaned WebSocket sessions.** Clients connected to the old dir's server keep their WebSockets open across the swap; their updates flow into the new dir's CRDT state, creating divergence.
- **Module-global state.** Write-tracker, metrics counters, in-flight batch operations — all scoped "one server instance" because that was the design contract. Swap violates the contract without warning.

These aren't hypothetical — they're the class of bugs that shows up in week 2 of forcing hot-swap onto a one-server-per-dir architecture. The fix is architectural: don't force it.

---

## Gaps / follow-ups

- Hybrid archetype: what if an editor has a "launcher + running server" pair where the launcher can spawn/kill multiple server instances and the UI consumes any of them? This is a specific shape of Archetype C with more orchestration sophistication. Worth naming if any editor adopts it.
- Performance numbers for "subprocess spawn per clone" on common laptop hardware in 2026. Would quantify the A vs B trade-off more precisely.
