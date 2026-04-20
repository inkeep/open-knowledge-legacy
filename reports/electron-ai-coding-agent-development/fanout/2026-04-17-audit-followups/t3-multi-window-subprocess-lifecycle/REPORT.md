---
title: "Multi-Window Electron Apps: Per-Window Subprocess Lifecycle + Crash Recovery (2026)"
description: "Evidence-based survey of how production Electron apps (VS Code, Logseq, Obsidian, GitHub Desktop, Cursor, Figma, Slack) handle per-window subprocess lifecycle, crash recovery, duplicate-open collisions, graceful shutdown ordering, lock-file exclusivity, and multi-window state restore. Synthesized into three architectural archetypes against which a 'one utilityProcess per BrowserWindow + file-based lock + runClean + collision-dialog' design is benchmarked."
createdAt: 2026-04-17
updatedAt: 2026-04-17
subjects:
  - Electron
  - VS Code
  - Obsidian
  - Logseq
  - GitHub Desktop
  - Cursor
  - Figma
  - Slack
  - utilityProcess
  - BrowserWindow
  - proper-lockfile
topics:
  - multi-window Electron
  - per-window subprocess lifecycle
  - crash recovery patterns
  - lock collision UX
  - graceful shutdown ordering
  - session restore
---

# Multi-Window Electron Apps: Per-Window Subprocess Lifecycle + Crash Recovery (2026)

**Purpose:** Ground the design of a multi-window Electron desktop app that runs one utilityProcess per BrowserWindow (one per project) in the observable patterns of production Electron apps. Specifically: crash recovery, lock collision UX, graceful shutdown ordering, and multi-window state restore.

---

## Executive Summary

Production Electron apps converge on a small set of patterns for per-window subprocess lifecycle but diverge on two axes: (a) whether they treat "one project = one subprocess" seriously (only VS Code does, via utilityProcess-backed extension hosts), and (b) how they handle duplicate-open of the same project (silently focus existing vs. permit concurrent vs. dialog).

**Three robust production patterns observed:**

1. **Lifecycle-bound utility process with graceful grace period, then force-kill.** VS Code's `WindowUtilityProcess` binds the utilityProcess to its owning `CodeWindow` and terminates on both `closed` AND `willLoad`. 6-second `windowLifecycleGraceTime`; after `exit`, a 1-second PID-liveness probe with `process.kill(pid, 0)` catches zombies — the `exit` event alone is NOT reliable ([VS Code Issue #194477](https://github.com/microsoft/vscode/issues/194477)).

2. **Budgeted auto-restart on crash with non-modal UX, escalating to modal prompt.** `ExtensionHostCrashTracker` enforces 3 crashes per 5-minute rolling window. Below budget: transient "Restarting…" toast + auto-restart. Above budget: modal Restart prompt. The budget prevents restart storms; the toast keeps users informed.

3. **Join-coordinated shutdown with per-subsystem drain promises, gated by `will-quit.preventDefault()`.** `fireOnWillShutdown` emits an event carrying `join(id, promise)`. `Promise.settled(joiners)` is the barrier. Real `app.quit()` fires after the barrier settles. A parallel `kill()` path exists with a 1-second budget before `app.exit()`.

**Where our "one utility per window + file-based lock + runClean + collision-dialog" design sits:**

- **Aligned with reference:** Per-window utility process, lifecycle-bound, grace-then-kill, join-pattern shutdown.
- **Novel but sound:** File-based per-project lock with `runClean` on boot — VS Code uses in-process identity tracking (they don't need a file lock because they're single-instance). Our approach matches `proper-lockfile` semantics and is the right choice for multi-instance.
- **Divergent:** Collision dialog — NONE of 9 surveyed apps show a confirmation dialog. All project-centric apps (VS Code, Cursor, Obsidian, GitHub Desktop) silently focus existing; Logseq permits concurrent. Our dialog is an explicit UX choice to surface.
- **Gaps in our design:** Budgeted auto-restart layer before the "Restart / Close Window" prompt. Post-exit PID-liveness probe. `will-quit.preventDefault()` as the drain gate (not `before-quit`, which fires too early).

**Key Findings:**
- VS Code's `utilityProcess.fork()` with `windowLifecycleBound: true, windowLifecycleGraceTime: 6000` directly validates our per-window utility design and provides reference values.
- The post-exit 1-second PID-liveness re-kill pattern is production necessity, not paranoia.
- Duplicate-open collision dialogs are absent from every surveyed Electron app; silent focus-existing is the convention.
- Budgeted auto-restart (3/5 min) before modal prompt is the industry-canonical crash recovery UX.
- File-based locks need more than just a PID — `{pid, hostname, port, startedAt, worktreeRoot}` minimum; mtime heartbeats for live staleness detection.

---

## Research Rubric

| Dimension | Priority | Purpose |
|---|---|---|
| D1 — VS Code workspace-process lifecycle | P0 (Deep) | Reference implementation for per-window utility + shutdown |
| D2 — Logseq multi-graph lifecycle | P0 (Deep) | Opposite-end pattern (concurrent multi-window same graph) |
| D3 — Obsidian multi-vault lifecycle | P0 (Deep) | Single-instance + path-keyed identity |
| D4 — Cursor multi-project lifecycle | P0 (Deep) | Inherited VS Code behavior |
| D5 — Collision-dialog UX survey | P0 (Deep) | 9-app comparison of duplicate-open UX |
| D6 — Crash recovery patterns | P0 (Deep) | utilityProcess exit → recovery UX |
| D7 — Graceful shutdown ordering | P1 (Moderate) | `before-quit` vs `will-quit`, join pattern |
| D8 — Lock-file patterns | P1 (Moderate) | proper-lockfile, mtime heartbeats, foreign-host |
| D9 — Multi-window state restore | P1 (Moderate) | Session restore on relaunch |

**Non-goals (out of scope):** Single-instance `app.requestSingleInstanceLock`; `electron-window-state` library (covered elsewhere); per-project YAML config semantics; 1P Open Knowledge implementation.

---

## Pattern Archetypes

Three distinct architectural styles emerged from the survey:

### Archetype A — VS Code / Process-Isolated Per-Window

**Model.** One utility process per BrowserWindow, bound to window lifecycle. In-process duplicate-open prevention (single-instance app). Budgeted auto-restart on utility-process crash. Join-coordinated shutdown. State restore eager (windows) + lazy (utilities).

**Represented by:** VS Code, Cursor (inherited).

**Trade-offs:** Process isolation prevents cross-window crash propagation. Higher memory footprint per window. Complex lifecycle coordination. Right choice when per-window computation is expensive or isolation is important.

### Archetype B — Logseq / Shared Process, Per-Window Renderer

**Model.** Whole-app single-instance. Multiple BrowserWindows share one main process. No utilityProcess. Concurrent multi-window-same-project permitted. Reference-counted teardown of shared resources.

**Represented by:** Logseq.

**Trade-offs:** Lower memory; simpler lifecycle. Renderer-side compute is subject to tab-discard/background-throttling. No crash isolation between windows. Right choice when all per-window work is cheap or shared state is central.

### Archetype C — Slack / Obsidian / Figma — Single-Document-Multi-Viewport

**Model.** One BrowserWindow per top-level container; sub-viewports (pop-outs, split tabs) within. Duplicate-open focuses existing. No concurrent multi-window support.

**Represented by:** Slack, Obsidian, Figma.

**Trade-offs:** Simplest mental model; matches single-tenant-per-machine apps. Poor fit for users who want side-by-side independent documents. Not applicable to our per-project-per-window requirement.

---

## Detailed Findings

### D1 — VS Code workspace-process lifecycle [P0]

**Finding:** VS Code's `UtilityProcess` (`src/vs/platform/utilityProcess/electron-main/utilityProcess.ts`) implements `WindowUtilityProcess` extending a base `UtilityProcess`. Configuration includes:

```ts
windowLifecycleBound: true,                 // tied to CodeWindow
windowLifecycleGraceTime: 6000,              // ms — extension-host grace
```

When set, the utility terminates on both `codeWindow.onDidDestroyWindow` AND `codeWindow.onWillLoad`. On `exit` event fire, a 1-second liveness probe runs:

```ts
// See https://github.com/microsoft/vscode/issues/194477
setTimeout(() => {
  try {
    process.kill(pid, 0);  // throws if process doesn't exist
    // Still alive — SIGTERM
    process.kill(pid, 'SIGTERM');
  } catch {
    // Already gone — OK
  }
}, 1000);
```

Duplicate-open handling: `findWindowOnWorkspaceOrFolder` (`windowsMainService.ts`) checks existing windows by workspace-identity BEFORE creating a new one. On match: silent focus; no dialog.

Crash recovery: `ExtensionHostCrashTracker` enforces 3 crashes per 5-minute rolling window. Below budget: transient "Restarting…" toast + auto-restart. Above budget: modal Restart prompt.

Shutdown: `lifecycleMainService.ts` uses `app.on('will-quit')` + `e.preventDefault()` to gate. Fires `onWillShutdown` event with `join(id, promise)` callback. `Promises.settled(joiners)` is the barrier. Real `app.quit()` fires after. Parallel `kill()` path: 1-second race vs destroy all windows + `app.exit(code)` fallback.

**Evidence:** [evidence/d1-vscode-lifecycle.md](evidence/d1-vscode-lifecycle.md)

**Confidence:** CONFIRMED.

**Decision triggers:**
- 6s grace × N windows at shutdown can accumulate. A max-shutdown cap (e.g., 20s total) prevents OS-level "Application did not quit" prompts.
- In-process collision check (single-instance) works for VS Code; file-lock is the correct alternative for multi-instance.
- The post-exit PID-liveness probe is non-obvious but production-necessary. Implement it.

### D2 — Logseq multi-graph lifecycle [P0]

**Finding:** Logseq permits concurrent multi-window-same-graph explicitly. No per-graph lock file. No utilityProcess; all compute runs in-renderer. A graph→windows reverse index enables reference-counted teardown of shared resources.

**Evidence:** [evidence/d2-logseq-multi-graph.md](evidence/d2-logseq-multi-graph.md)

**Confidence:** CONFIRMED.

**Implications:**
- Logseq demonstrates that "concurrent multi-window same project" is a viable UX — their users don't complain about data corruption (their graph storage is Datascript in-memory + IndexedDB with CRDT semantics, which tolerates concurrent writers).
- For our Hocuspocus-based design where only ONE server can own the shadow repo + file watcher per contentDir, Logseq's model doesn't apply — we need exclusivity.

### D3 — Obsidian multi-vault lifecycle [P0]

**Finding:** Single-instance enforced at app level. Vault identity is path-keyed (`.obsidian/` marker directory). Silent-focus-existing on duplicate open. No documented vault-lock file — relies on OS filesystem semantics + whole-app single-instance.

Community-reported pathology: symlink/bind-mount workaround defeats identity check (users deliberately symlink the same vault to two paths to open simultaneously). Crash UX is thin — forum reports describe stuck IndexedDB states with no documented recovery flow.

**Evidence:** [evidence/d3-obsidian-multi-vault.md](evidence/d3-obsidian-multi-vault.md)

**Confidence:** CONFIRMED (single-instance + path-keying); INFERRED (crash UX thinness — based on forum reports, not source).

**Implications:**
- Path-keying identity via realpath (which we already do for file-watcher) handles the symlink workaround — resolving `.open-knowledge/` to its canonical path catches alias attempts.
- Obsidian's weak crash UX is a counterexample of what NOT to do — we should design explicit crash recovery from day 0.

### D4 — Cursor multi-project lifecycle [P0]

**Finding:** Inherits VS Code lifecycle unchanged. Silent focus on duplicate open. User community actively requests multi-window-same-project capability (public forum threads requesting the capability we're specifying for Open Knowledge).

**Evidence:** [evidence/d4-cursor-multi-project.md](evidence/d4-cursor-multi-project.md)

**Confidence:** CONFIRMED (VS Code inheritance); INFERRED (community demand — forum evidence only).

**Implications:**
- Our explicit multi-window-per-project support is a differentiator against VS Code and Cursor.
- But it also means we're walking a less-trodden path — fewer precedents for the edge cases.

### D5 — Collision-dialog UX survey [P0]

**Comparative table:**

| App | Multi-window same project? | Collision dialog? | Default behavior |
| --- | --- | --- | --- |
| VS Code | No | No | Silent focus existing |
| Cursor | No | No | Silent focus existing |
| Obsidian | No | No | Silent focus (path-keyed) |
| GitHub Desktop | No (single-instance) | No | Single-instance focus |
| Logseq | **Yes** | No | Opens new window without complaint |
| Figma | Split tab within window | No | Split Tab View option |
| Slack | Per-channel pop-out | No | Single-instance + pop-outs |
| Notion | No (inferred) | No | Single-instance focus |
| Linear | No (inferred) | No | Single-instance focus |

**Finding:** Zero of 9 surveyed apps present a confirmation dialog. Our proposed dialog is deliberately divergent.

**Evidence:** [evidence/d5-collision-ux-survey.md](evidence/d5-collision-ux-survey.md)

**Confidence:** CONFIRMED (via observed behavior + source code where accessible).

**Implications:**
- Trade-off: explicit-user-agency (our dialog) vs muscle-memory with VS Code convention (silent focus).
- **Alternative worth considering:** silent focus for same-machine duplicates, dialog ONLY for "held by another machine" (genuinely novel situation — the lock's `hostname` field catches this).
- If we keep the dialog, it's a deliberate product differentiator that signals "this project is a first-class entity with ownership semantics" — appropriate for Open Knowledge's data-ownership positioning.

### D6 — Crash recovery patterns [P0]

**Comparative table:**

| App | Subprocess | Detection | Recovery | User surface |
| --- | --- | --- | --- | --- |
| VS Code local ext-host | utilityProcess | `exit` + `child-process-gone` | Stop all (no default auto-restart for local) | Log only |
| VS Code remote ext-host | remote worker | Protocol disconnect | Auto-restart 3x/5min → modal | Toast → prompt |
| GitHub Desktop main | main process | `uncaughtException` | `app.relaunch() + quit()` | Dedicated CrashWindow |
| GH Desktop renderer | renderer | main handler | Same | CrashWindow |
| Logseq | none | N/A | N/A | White screen |
| Obsidian | unclear | unclear | unclear | Stuck states reported |
| **Our design (as-specified)** | utilityProcess | `on('exit')` | Restart / Close prompt | Modal |

**Finding:** We skip the budgeted auto-restart rung. Add 1-2 silent respawns + toast before modal. Post-exit PID-liveness probe is required. Launch-failed crashes (`reason: 'launch-failed'`) should NOT auto-respawn (deterministic; will loop).

**Evidence:** [evidence/d6-crash-recovery-patterns.md](evidence/d6-crash-recovery-patterns.md)

**Confidence:** CONFIRMED.

**Implications:**
- Add crash-recovery rung: auto-restart (1-2 attempts) with toast → modal prompt.
- Discriminate crash reasons: `reason: 'launch-failed'` skips auto-restart.
- Post-exit PID-liveness probe: 1-second timeout after `exit` event, `process.kill(pid, 0)` → SIGTERM if alive.

### D7 — Graceful shutdown ordering [P1]

**Finding:** Use `will-quit.preventDefault()` (not `before-quit`) as the drain gate. `before-quit` fires too early — BrowserWindows still open.

Join pattern:
```ts
app.on('will-quit', (e) => {
  e.preventDefault();  // gate
  const joiners: Promise<void>[] = [];
  fireOnWillShutdown({
    join: (_id: string, p: Promise<void>) => { joiners.push(p); },
  });
  Promises.settled(joiners).then(() => app.exit(0));
});
```

Per-window drain: `Promise.race([exitEvent, timeout(6000)])` → fallback to `kill()` (SIGTERM). VS Code does NOT escalate to SIGKILL; relies on OS reaping (the 1-second app.exit fallback hits before SIGKILL would be needed).

**Evidence:** [evidence/d7-graceful-shutdown-ordering.md](evidence/d7-graceful-shutdown-ordering.md)

**Confidence:** CONFIRMED.

**Implications:**
- Switch our spec's `before-quit` reference to `will-quit.preventDefault()`.
- Formalize the join pattern — each utility process registers a drain promise via main's `onWillShutdown` event.

### D8 — Lock-file patterns [P1]

**Finding:** `proper-lockfile` uses `mkdir` (atomic across all filesystems, including NFS), NOT `O_EXCL` — the latter is not atomic on NFS. Stale detection via mtime heartbeats (10s default stale threshold; heartbeat every 5s). `onCompromised` callback fires if mid-hold lock is lost (e.g., another process stole it).

Metadata fields we already have match best practice: `{pid, hostname, port, startedAt, worktreeRoot}`. Foreign-host gate essential for network-synced content dirs (iCloud, Dropbox, Google Drive) where two machines may both open the same synced folder.

Our existing `server.lock` uses `O_EXCL` — matches the single-host case but may fail silently on NFS. Worth noting as a limitation (we don't support network-mounted contentDirs explicitly anyway).

Could add mtime heartbeat for runtime-staleness detection — currently we only check staleness on `acquireServerLock` call. A heartbeat would let `SystemDocSubscriber`-like consumers detect "my server died mid-session" without waiting for the next lock-acquire attempt.

**Evidence:** [evidence/d8-lockfile-patterns.md](evidence/d8-lockfile-patterns.md)

**Confidence:** CONFIRMED (proper-lockfile behavior); INFERRED (mtime heartbeat benefit for our design).

**Implications:**
- Our existing `server.lock` design matches best practice. No change needed for v0.
- `mtime heartbeat` is a nice-to-have for future robustness; not required for v0.
- Document foreign-host semantics explicitly — if a user syncs `.open-knowledge/` across machines via iCloud/Dropbox, both machines seeing an alive-foreign-host lock should refuse to start with a clear error.

### D9 — Multi-window state restore [P1]

**Finding:** VS Code persists `windowsState` manifest (workspace identity + geometry). Restores windows eagerly on relaunch; utility processes lazily (driven by renderer init — utility spawn deferred until renderer loads). User setting `window.restoreWindows` controls policy (`all`/`folders`/`one`/`none`). No "recovery mode" path for crash-triggered relaunch — same manifest, same restore; risk of doom loop if state itself caused crash.

**Evidence:** [evidence/d9-multi-window-state-restore.md](evidence/d9-multi-window-state-restore.md)

**Confidence:** CONFIRMED (manifest-based restore); INFERRED (doom-loop risk — no primary evidence of VS Code mitigating this).

**Implications:**
- Our `runClean` on boot handles the subprocess side — kills stale locks so new utility spawns can proceed.
- Consider lazy utility spawn: on app relaunch, restore BrowserWindows from state but defer utility spawn until renderer actually loads. Reduces startup time if user doesn't click the window.
- Consider "safe mode" for crash-loop detection — if last 3 launches crashed, show recovery UI that lets user skip auto-restore.

---

## Our Design vs Landscape — Explicit Comparison

| Design element | Our design (as-specified) | VS Code reference | Action |
| --- | --- | --- | --- |
| Per-window subprocess | 1 utility per BrowserWindow | Same (`WindowUtilityProcess`) | ✓ Aligned |
| Lifecycle binding | Manual main-process tracking | `windowLifecycleBound: true, graceTime: 6000` | ✓ **Use Electron API flags directly** |
| Post-exit verification | Not specified | 1s PID-liveness + SIGTERM | ✗ **Add this** |
| Project lock | File-based (`server.lock`) | In-process (single-instance) | ~ Different mechanism, same goal |
| Duplicate-open UX | Dialog | Silent focus | ✗ **Divergent** (consider silent-focus-same-machine + dialog-foreign-host-only) |
| Crash recovery | Prompt only | Auto-restart 3/5min → prompt | ~ **Add auto-restart layer** |
| Shutdown gate | `before-quit` | `will-quit.preventDefault()` | ✗ **Use will-quit** |
| Shutdown coordination | Manual IPC fan-out | Join + `Promises.settled` | ~ **Formalize as join** |
| Force-kill fallback | Unspecified | 1s race + `app.exit()` | ✗ **Define budget** |
| State restore | Eager all | Eager windows + lazy utilities | ✓ Adopt lazy |
| runClean on boot | Prune stale locks | (no analog) | ✓ Novel but sound |

---

## Limitations & Open Questions

### Dimensions Not Fully Covered
- Signal-Desktop not inspected (not in cached OSS repos at audit time).
- Cursor, Obsidian, Notion, Linear internals closed — behavioral evidence only.
- VS Code "safe mode" on crash-loops for window-restore (not extensions) not traced.
- `proper-lockfile` behavior on iCloud/Dropbox not empirically tested — inferred from docs.

### Out of Scope (per Rubric)
- Single-instance vs multi-instance `app.requestSingleInstanceLock` (well-documented elsewhere).
- `electron-window-state` library (covered in prior OQ-G narrower report).
- Per-project YAML config semantics (1P Open Knowledge concern).

---

## References

### Evidence Files
- [evidence/d1-vscode-lifecycle.md](evidence/d1-vscode-lifecycle.md) — VS Code `WindowUtilityProcess`, grace-then-kill, PID-liveness probe
- [evidence/d2-logseq-multi-graph.md](evidence/d2-logseq-multi-graph.md) — Logseq concurrent multi-window same graph
- [evidence/d3-obsidian-multi-vault.md](evidence/d3-obsidian-multi-vault.md) — Obsidian path-keyed single-instance
- [evidence/d4-cursor-multi-project.md](evidence/d4-cursor-multi-project.md) — Cursor inherited VS Code
- [evidence/d5-collision-ux-survey.md](evidence/d5-collision-ux-survey.md) — 9-app comparative collision UX
- [evidence/d6-crash-recovery-patterns.md](evidence/d6-crash-recovery-patterns.md) — utilityProcess crash recovery patterns
- [evidence/d7-graceful-shutdown-ordering.md](evidence/d7-graceful-shutdown-ordering.md) — `will-quit` + join pattern
- [evidence/d8-lockfile-patterns.md](evidence/d8-lockfile-patterns.md) — proper-lockfile, mtime heartbeats
- [evidence/d9-multi-window-state-restore.md](evidence/d9-multi-window-state-restore.md) — session restore semantics

### External Sources
- [Electron utilityProcess docs](https://www.electronjs.org/docs/latest/api/utility-process)
- [VS Code utilityProcess source](https://github.com/microsoft/vscode/blob/main/src/vs/platform/utilityProcess/electron-main/utilityProcess.ts)
- [VS Code lifecycleMainService](https://github.com/microsoft/vscode/blob/main/src/vs/platform/lifecycle/electron-main/lifecycleMainService.ts)
- [VS Code Issue #194477 — exit event unreliable](https://github.com/microsoft/vscode/issues/194477)
- [proper-lockfile GitHub](https://github.com/moxystudio/node-proper-lockfile)
- [Logseq desktop source](https://github.com/logseq/logseq/tree/master/src/electron)
- [Obsidian community forum — multi-vault symlink workaround](https://forum.obsidian.md/search?q=symlink+vault)
- [Cursor community forum — multi-window requests](https://forum.cursor.com)

### Related Research
- [reports/electron-ai-coding-agent-development/fanout/2026-04-15-oq-narrowers/oq-f-utilityprocess-vs-childprocess/](../../2026-04-15-oq-narrowers/oq-f-utilityprocess-vs-childprocess/) — utilityProcess vs child_process.fork
- [reports/electron-ai-coding-agent-development/fanout/2026-04-15-oq-narrowers/oq-g-window-state-persistence/](../../2026-04-15-oq-narrowers/oq-g-window-state-persistence/) — Window state persistence shape
- [reports/electron-ai-coding-agent-development/fanout/2026-04-15-followup-round-2/fu1-utility-process-hot-reload/](../../2026-04-15-followup-round-2/fu1-utility-process-hot-reload/) — Utility-process hot-reload
