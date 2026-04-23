---
title: "Multi-Actor Startup Order + Concurrent Scenarios for Electron + CLI Siblings (2026)"
description: "Full enumeration of startup-order permutations and transition edge cases for Electron applications sharing a project resource with CLI siblings, MCP subprocesses, and alternate UI servers. Surveys production patterns from VS Code, GitHub Desktop, JetBrains IDEs, Docker Desktop, Cursor, Obsidian, Logseq, and Figma, including collision-UX comparison, crash-orphaning mechanics, process-tree cleanup primitives (PR_SET_PDEATHSIG, Windows Job Objects), and idempotent-start patterns."
createdAt: 2026-04-17
updatedAt: 2026-04-17
subjects:
  - Electron
  - VS Code
  - JetBrains
  - Docker Desktop
  - Figma
  - Logseq
  - Obsidian
  - Cursor
  - GitHub Desktop
topics:
  - multi-actor startup order
  - concurrent process coordination
  - lock collision UX
  - crash orphaning
  - process revival
  - lockfile patterns
  - Electron lifecycle
---

# Multi-Actor Startup Order + Concurrent Scenarios for Electron + CLI Siblings (2026)

**Purpose:** Enumerate the full permutation space of startup order, crash transitions, and concurrent-actor collisions for an Electron-based system whose project resource is shared across four process shapes (Electron utility + standalone CLI server + MCP subprocess + alternate UI server). Survey how production Electron apps handle analogous scenarios so the reader can identify pattern precedents and spec gaps.

---

## Executive Summary

The four-actor model (Electron utility + standalone CLI + MCP subprocess + alternate UI server) is structurally more complex than any single-family pattern in the surveyed production Electron apps. The closest architectural analog is **VS Code's three-layer instance model** — IPC pipe for "is any instance running" + lockfile for diagnostic correlation + in-memory workspace registry for routing. The closest conceptual analog is **Docker Desktop's "one server, many clients"** — where CLI invocations don't contend with GUI for a lock because they speak the daemon's protocol.

Across the surveyed apps, five durable patterns emerge:

1. **Separate "is anyone running?" from "where is this resource open?"** VS Code's IPC-pipe-plus-registry is the clearest example; single-lockfile approaches (GitHub Desktop, Logseq) work for one-window apps and break for multi-workspace apps.
2. **Stale-lock recovery is mandatory, not optional.** SIGKILL and macOS-OOM leave no cleanup window; `will-quit` handlers are best-effort. Next-startup detection (`proper-lockfile` mtime-heartbeat, PID-alive probe, hostname check) is the only reliable cleanup path.
3. **User-mediated takeover is the universal industry default.** No surveyed app auto-kills a deadlocked peer; all show a dialog telling the user to close the other instance. Automation is architecturally risky (could destroy unsaved work).
4. **Process-tree cleanup on parent-crash is OS-dependent.** Windows Job Objects (`KILL_ON_JOB_CLOSE`) are strongest; Linux `PR_SET_PDEATHSIG` works with fork-race caveats; macOS has no equivalent and requires child-side stdin-EOF or heartbeat polling.
5. **Cross-machine sync (iCloud/Dropbox) defeats file-locking entirely.** flock/fcntl don't work over NFS/SMB; sync services produce "conflicted copy" files that pollute the lockfile namespace. Logseq's proposed hostname-per-file lock directory (one file per holder) is the cleanest available pattern.

**Key Findings:**

- **Startup-order permutations collapse into ~8 equivalence classes.** 24 raw permutations reduce to 8 by observing: `ok ui` never conflicts on `server.lock` (owns `ui.lock`), MCP subprocess is passive (reads lock, never acquires), Electron and CLI-server are symmetric on `server.lock`, and "after any is running" transitions are the same regardless of who's running.
- **Transition edges (a)-(j) from the prompt are mostly covered by known patterns but reveal spec gaps.** Cross-machine sync-service scenarios (edge h) and URL cold-start with no handler registered (edge j) have no cross-industry resolution — each app handles them bespoke or not at all.
- **Production collision-UX converges on three shapes.** (1) VS Code-style: route to existing window silently. (2) JetBrains-style: three-way dialog (New / Current / Ask). (3) Discord/Slack-style: hard refuse second instance. Choice depends on per-workspace state richness — AI-editor forks like Cursor chose (3) precisely to prevent AI-conversation bifurcation.
- **No surveyed app ships a self-reviving watchdog.** Crash recovery is user-mediated. `app.relaunch()` exists but has known reliability issues and requires crash-loop detection to avoid infinite restart.
- **macOS is the hardest platform for orphan prevention.** Absence of `PR_SET_PDEATHSIG` forces every child to self-monitor (stdin-EOF, kqueue, polling). MCP stdio subprocesses get this for free via the MCP protocol's stdin design; utility-process children do not.

---

## Research Rubric

Seven dimensions; D1-D4 are P0/Deep, D5-D7 are P1/Moderate. Scope is external/3P patterns in production Electron and similarly-architected apps; spec-gap callouts in the final section reference the prompt's four-actor model without implementing 1P code analysis.

| ID | Dimension | Priority |
|----|-----------|----------|
| D1 | Full startup-order enumeration (primitives, equivalence classes) | P0 Deep |
| D2 | Transition edge cases (crash, OOM, orphan, sync-service, deep-link) | P0 Deep |
| D3 | Production-app concurrent-actor patterns (8 apps) | P0 Deep |
| D4 | "Take over" / "Quit the other" UX | P0 Deep |
| D5 | Watchdog + revive patterns | P1 Moderate |
| D6 | Process-tree orphaning on crash (OS-level cleanup) | P1 Moderate |
| D7 | Idempotent start attempts (interrupted startup recovery) | P1 Moderate |

---

## Startup-Order Permutation Matrix

24 raw permutations collapse into 8 equivalence classes by applying three reductions: (1) `ok ui` holds a separate lock from `server.lock` so it doesn't conflict with Electron/CLI-server on the exclusive axis — it only reacts to who's in `server.lock`; (2) MCP subprocess is passive-reader (reads `server.lock`, never acquires) so it doesn't appear in the exclusive axis either; (3) within the exclusive axis (Electron vs. CLI-server), the two are symmetric — order B-then-A produces the same steady state as A-then-B with roles swapped.

Legend: `E` = Electron utility, `S` = CLI `ok start`, `M` = CLI `ok mcp`, `U` = CLI `ok ui`. `→` denotes "then starts."

| Class | Representative order | Expected steady state | Observable collision | Production analog |
|-------|---------------------|----------------------|---------------------|-------------------|
| **C1: Server-first, others attach** | E → M → U → (S refused) | E holds `server.lock`; M connects; U proxies to E; S fails with `ServerLockCollisionError` | None during C1; S refusal is explicit | VS Code: first instance holds IPC pipe; subsequent `code` CLI forwards args |
| **C2: Server-first, siblings (symmetric)** | S → M → U → (E refused) | S holds `server.lock`; M connects; U proxies; E refused | Same as C1 with roles swapped | VS Code: first instance wins regardless of whether it's GUI or CLI launch |
| **C3: UI-first, no server yet** | U → (nobody) | U holds `ui.lock` but `server.lock` empty; `/api/*` requests fail 503 | Graceful degradation until E or S starts | Reverse proxy with no upstream; nginx 502 until backend exists |
| **C4: UI-first, then server attaches** | U → E → M | U holds `ui.lock`; E takes `server.lock`; U reconfigures on next `/api/config`; M connects to E | U must re-read `server.lock` dynamically | Vercel edge → dynamic backend discovery |
| **C5: MCP-first (cold start with no server)** | M → (self-spawns S) → E? | M reads empty `server.lock`, decides to self-spawn `ok start` (S); if E starts later, E collides with M-spawned S | Potential collision if E starts while M-spawned S is still holding lock | Cold-start URL handler spawning a server subprocess |
| **C6: All four simultaneous (race)** | E + S launched in same millisecond | One wins `server.lock`, other exits; M and U attach to winner | Loser needs to exit cleanly, not retry | VS Code `EADDRINUSE` → client mode or exit |
| **C7: Crash + relaunch collision** | E (holding lock) crashes → user relaunches E → new E acquires stale lock | New E must detect stale lock (PID dead), take over cleanly | Stale lockfile recovery | VS Code: unlink-and-retry once on `ECONNREFUSED` |
| **C8: Cross-machine via sync (iCloud/Dropbox)** | Host A: E running. Host B: opens same project folder | Both hosts see `server.lock` on sync volume, each thinks they own it; sync service produces "conflicted copy" files | Undetectable without hostname discriminator | Logseq: hostname-per-file lock dir; proposal, not implemented |

### Notes on reductions

- **`ok ui` is NEVER blocked by `server.lock`.** It holds its own `ui.lock`. `ok ui` + `ok ui` is one collision; `ok ui` + `ok start` is none.
- **MCP subprocess is NEVER blocked by `server.lock`.** It reads, never writes. Many MCP subprocesses can coexist. MCP-spawns-server (C5) is the one exception — and that spawned `ok start` participates on the exclusive axis.
- **The "two Electron windows racing on the same project" edge** is an app-internal concern (`Map<contentDir, BrowserWindow>` collision), not a `server.lock` concern — Electron's `app.requestSingleInstanceLock()` plus an in-app workspace registry handles it before `server.lock` is ever touched.

---

## Transition Edge-Case Catalog

Each edge (a)-(j) from the prompt, with failure mode + production-pattern mitigation.

### (a) Electron crashes → user relaunches Electron via AI-tool MCP flow

**Flow:** Electron utility holding `server.lock` crashes (SIGKILL, OOM). User doesn't relaunch the GUI. AI tool invokes `ok mcp`; mcp reads stale `server.lock`, decides to self-spawn `ok start`. Then user relaunches Electron — new Electron's utility tries to acquire `server.lock` which `ok start` now holds.

**Failure mode:** Electron's utility refuses to start with `ServerLockCollisionError`, and the GUI-launched Electron window shows an error to the user who has no context (they just wanted to open their project).

**Mitigation pattern (from D1, VS Code):** Three-layer model. The OUTER Electron process (`app.requestSingleInstanceLock`) should check if a utility was already self-spawned for this project by anything else, and if so, attach to it rather than spawning a competing utility. If the existing `ok start` process was spawned BY an MCP client (discoverable via a tag in `server.lock`), the Electron app can legitimately take over — SIGTERM the `ok start`, take the lock.

**Design trade-off:** Takeover is safer here than in the VS Code case (D4) because the lock-holder is a headless server with no unsaved user state; all persistence has already been flushed through the `server.lock` holder's normal write cycle.

### (b) `ok start` idle-shutdown, then Electron launches

**Flow:** `ok start` running with no WS clients. Idle timer fires at 30 min → graceful shutdown → releases `server.lock`. User launches Electron → utility acquires `server.lock` cleanly.

**Failure mode:** None in the happy case. The risk is that the idle-shutdown window races with a just-arriving WS client — client connects to a server that's about to exit.

**Mitigation pattern:** Idle-shutdown sequences should be cancelable — if a new connection arrives during the shutdown grace period, abort the shutdown. VS Code's `onWillShutdown` supports `evt.join()` to extend the window. For CLI servers, use a "draining" state between "running" and "stopped" where existing connections complete but new ones are refused with a clear error code so clients retry after the lock is released.

### (c) `ok ui` alone (no server), then Electron launches

**Flow:** `ok ui` holding `ui.lock` but `server.lock` empty → returns 503 to `/api/*`. Electron launches, takes `server.lock`. Does `ok ui` reconfigure?

**Mitigation pattern:** `ok ui` reads `server.lock` on each `/api/config` request. This is the correct shape — the reverse-proxy pattern. Every request consults the current state; no cached backend URL to invalidate. Alternative pattern (watch `server.lock` for file-change events) adds complexity without semantic benefit, since dynamic re-read on request is equivalent for low-RPS dev-tool workloads.

### (d) Two Electron windows race on Cmd+Click + rapid double-click

**Flow:** User Cmd+clicks a project link, then double-clicks the dock icon. Both trigger "open project" paths simultaneously.

**Failure mode:** `Map<contentDir, BrowserWindow>` populated by the first click, second click finds entry, should focus existing. If the two clicks happen before the first has populated the map, both spawn windows.

**Mitigation pattern (from VS Code):** Synchronous pre-reservation. Before async window creation, atomically insert a sentinel into the map: `if (map.has(contentDir)) { focus(map.get(contentDir)); return; } map.set(contentDir, PLACEHOLDER); const win = await createWindow(); map.set(contentDir, win);`. VS Code's `windowsMainService` does the equivalent via synchronous `findWindowOnWorkspaceOrFolder` checks before any async path.

### (e) Electron main-process crash → orphaned utilities

**Flow:** Electron main process SIGKILL'd. Utility processes (the one holding `server.lock`) were spawned via `utilityProcess.fork` and inherit the main as parent.

**Failure mode (per D6):** On Windows, utilities orphan ~30% of the time. On macOS, children are re-parented to launchd and persist indefinitely. On Linux, `PR_SET_PDEATHSIG` (if set) delivers SIGTERM — but only if set post-fork with no race.

**Mitigation patterns (by platform):**
- **Windows:** Assign utilities to a Job Object with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`. Kernel-guaranteed cascade.
- **Linux:** Utility sets `prctl(PR_SET_PDEATHSIG, SIGTERM)` at startup. Checks `getppid() == 1` at startup and self-exits if already orphaned (fork-race protection).
- **macOS:** Utility monitors stdin-EOF (if spawned with inherited stdin pipe) or poll-based `kill(ppid, 0)` heartbeat. No kernel-level solution exists.

### (f) OS-triggered OOM kill

**Flow:** Utility process SIGKILL'd by OOM killer. No cleanup window at all.

**Mitigation pattern:** Stale-lock detection at the next startup. Options: (1) `proper-lockfile`-style mtime-heartbeat — utility touches lock every 5s; readers consider stale after 10s. (2) PID + hostname in lock; next acquirer checks `kill(pid, 0)` and hostname match.

**Edge:** During the 5-10s stale window, a new acquirer correctly blocks. This is acceptable latency for a dev tool.

### (g) `ok ui`'s 12-hour safety-net self-shutdown while Electron is running

**Flow:** `ok ui` has a 12-hour self-shutdown timer. User's browser tab is open. After 12 hours, `ok ui` exits. Browser tab gets ENOCONN on next reload.

**Mitigation pattern:** This is a fail-safe-by-design behavior, not a bug. Two enhancements from the surveyed field:
- **User-visible state:** A small indicator in the proxied page ("UI server exited — relaunch with `ok ui`") so the user understands the failure mode.
- **Liveness extension:** Each incoming request refreshes a "last activity" timer; the 12-hour shutdown only fires after 12 hours of actual idleness. VS Code's `--wait` flag uses analogous marker-file idleness detection.

### (h) Cross-machine scenarios (iCloud/Dropbox sync)

**Flow:** Project directory on iCloud Drive. Machine A opens project in Electron. Machine B opens project in Electron. Both think they own `server.lock`.

**Failure mode (per D2):** flock/fcntl don't work over sync services. `server.lock` on machine A is written; sync service pushes to cloud; machine B sees it but may have already written its own (conflicted-copy trigger). Two writers produce two "conflicted copy" files; neither machine blocks.

**Mitigation pattern (Logseq's proposal, not implemented there):** Replace single-lockfile semantics with a lock-directory that contains one file per holder, named `<hostname>-<instance-uuid>.lock`. On startup, machine B sees machine A's file, enters READ-ONLY mode, surfaces a dialog: "This project is already open on MacBook-Pro. Proceed in read-only?" with a "I know better" override.

**Irreducible gap:** Even this pattern has a race window equal to the sync-service's propagation delay. No client-side protocol closes the race fully for sync-services that aren't strongly consistent.

### (i) User kills `ok start` while MCP has WS connection

**Flow:** `ok start` holding `server.lock` is killed (`pkill ok-start`). MCP subprocess was connected over WebSocket — WS connection drops.

**Mitigation pattern:** Standard WebSocket client-side reconnection with exponential backoff — exactly how `HocuspocusProvider` works. After N failed reconnects (e.g., 60 seconds), surface error to the calling agent. The MCP protocol (stdio) does not die just because WS died — the MCP-client-to-MCP-subprocess channel is separate from MCP-subprocess-to-Hocuspocus.

**Subtle behavior:** If MCP was the one that self-spawned `ok start` (C5), and `ok start` dies, MCP should NOT automatically re-spawn (otherwise killing it is futile). The spawn policy is "spawn-once per MCP session"; if the spawned server dies, fall back to disk-only mode.

### (j) URL opened with no handler registered

**Flow:** User clicks `openknowledge://...` URL. No Electron app registered for the scheme (first-time user, or user hasn't launched Electron yet so `setAsDefaultProtocolClient` never fired).

**Failure mode (per D2):** OS shows "no app for this protocol" dialog. `ok start` + `ok ui` have no way to intercept — they're not installed as OS-level protocol handlers.

**Mitigation pattern:** The Electron installer must register the protocol at install time (before first launch). Fallback: the same URL pattern is also servable by an HTTP endpoint (e.g., `https://openknowledge.example/goto?ref=...`) so non-desktop users follow a web-to-install flow. No way to register a CLI-only protocol handler on macOS/Windows without a packaged `.app`/`.exe` bundle.

---

## Production-App Collision UX Comparison Table

| App | Second-launch behavior | Dialog wording | Options presented | Multi-window-same-workspace? | Cross-machine lock |
|-----|------------------------|----------------|-------------------|------------------------------|---------------------|
| **VS Code** | Forward args to first instance, focus existing window with that workspace, exit second | "Another instance of Visual Studio Code is running but not responding" (10s timeout dialog) | "Close" only (no auto-kill) | No (first-match wins) | Not supported |
| **Cursor** | Focus existing window silently; no args forwarding documented | No dialog (silent focus) | None | No (explicitly refused) | Not supported |
| **JetBrains IDEs** | Three-way dialog on second project open | Setting: "Open project in: New window / Current window / Ask" | "This Window" (closes current), "New Window", "Cancel", "Don't ask again" checkbox | Yes (via New Window) | Not supported |
| **GitHub Desktop** | Focus existing window, forward args | No dialog | None | N/A (single-repo at a time) | Not supported |
| **Docker Desktop** | CLI (docker) is a client, not a second instance; GUI single-instance enforced | "Only one Docker daemon per host" (doc, not runtime) | Server-side enforcement, not UI-mediated | N/A (no "workspace" concept) | Via Docker Context multi-host |
| **Figma Desktop** | Allows multiple windows of same file; cursors hidable | N/A (permitted by design) | Drag tab out to new window | Yes — server-side CRDT makes concurrency a non-issue | N/A (canonical state is server) |
| **Logseq** | Single-instance lock; second launch refused silently (app.quit) | No dialog | None; users find app doesn't open | Not yet; community-requested | Proposed hostname-lock but not implemented |
| **Obsidian** | Single-instance per-vault; second launch of same vault refused silently | No dialog | None | Via symlink workaround (unsupported) | Not supported |
| **Slack / Discord** | Strict single-instance; second launch focuses first | No dialog | None; workspaces are in-app tabs | No | N/A (canonical state is server) |

### Key observations

- **Collision UX converges on 3 shapes:** silent focus-existing (VS Code, Cursor, GitHub Desktop, Slack/Discord), three-way dialog (JetBrains), hard refuse (Logseq, Obsidian). Figma/Docker sidestep the question by moving canonical state to a server.
- **None offer auto-takeover.** All defer to the user; the hardest cases (VS Code 10s not-responding) surface a modal that tells the user to close the other instance but doesn't do it for them.
- **Cross-machine lock is universally missing.** No surveyed production app solves the iCloud/Dropbox case; Logseq has the only documented proposal (hostname-per-file), and it's open, not shipped.
- **"Per-workspace state richness" predicts policy.** Apps with rich per-workspace state (AI conversations in Cursor, undo history in VS Code) prefer silent focus-existing. Apps with trivial per-workspace state (repo paths in GitHub Desktop, vault paths in Obsidian) can safely refuse. Apps with server-side canonical state (Figma, Slack) don't need any policy.

---

## Detailed Findings

### D1 — Full startup-order enumeration [P0]

**Finding:** VS Code's `claimInstance` is the reference pattern: a three-layer model where IPC pipe EADDRINUSE is the authoritative single-instance primitive, the lockfile is a diagnostic PID record, and an in-memory workspace-window registry handles "is this workspace already open somewhere?"

Source references (verified):
- `microsoft/vscode:src/vs/code/electron-main/main.ts:129-156` — `claimInstance` + lockfile write
- `microsoft/vscode:src/vs/platform/windows/electron-main/windowsFinder.ts:44-59` — `findWindowOnWorkspaceOrFolder`

**Evidence:** [evidence/d1-startup-order-primitives.md](evidence/d1-startup-order-primitives.md)

**Confidence:** CONFIRMED.

**Implications:**
- A single lockfile conflates two questions ("is anyone running?" vs. "where is resource X?"). Multi-workspace apps need both layers.
- The one-shot unlink-and-retry pattern for stale IPC handles (Linux/macOS only — Windows pipes auto-cleanup) is the canonical stale-lock recovery. Infinite retry is unsafe; no retry is user-hostile.
- On Windows, `AllowSetForegroundWindow` is a mandatory handshake for "focus the existing instance from a second launch" — SetForegroundWindow silently no-ops otherwise.

**Decision triggers (when this matters):**
- If your app has multiple concurrent workspaces per instance, the three-layer model is necessary; single-lockfile will produce "second window opens alongside first" bugs.
- If your app is single-workspace (GitHub Desktop, Logseq), `app.requestSingleInstanceLock` + `second-instance` event + `focus()` is sufficient.

### D2 — Transition edge cases [P0]

**Finding:** Every edge case reduces to one of four canonical failure modes: (1) crash leaves stale state, (2) OS kills without cleanup window, (3) concurrent-writer hazard via shared filesystem, (4) process-tree orphaning on parent death.

**Evidence:** [evidence/d2-transition-edges.md](evidence/d2-transition-edges.md)

**Confidence:** CONFIRMED.

**Implications:**
- `will-quit`/`before-quit` cleanup is best-effort only. SIGKILL and macOS-OOM leave no cleanup window. Design must assume "lockfile exists but holder is dead" is routine, not exceptional.
- mtime-heartbeat (`proper-lockfile`) is the industry-standard staleness primitive for local filesystems. Hostname + PID is the complementary primitive for cross-machine.
- Electron's `requestSingleInstanceLock` has a known Windows race ([electron/electron#35680](https://github.com/electron/electron/issues/35680)) where both instances claim the lock. Production-grade apps layer IPC-pipe EADDRINUSE on top for reliability.

**Remaining uncertainty:**
- Electron's `utilityProcess` behavior under macOS OOM-kill of the parent is not publicly documented.

### D3 — Production-app collision UX [P0]

**Finding:** Nine surveyed apps span three distinct policies (silent focus, three-way dialog, hard refuse). Selection correlates with per-workspace-state richness: rich per-workspace state → silent focus (avoid state bifurcation); trivial per-workspace state → hard refuse (cleaner semantics).

**Evidence:** [evidence/d3-production-app-ux.md](evidence/d3-production-app-ux.md)

**Confidence:** CONFIRMED.

**Implications:**
- For an AI-editor-style product (rich per-workspace conversation state), silent focus-existing is the safer default. Cursor's explicit refusal of multi-window-same-project confirms this.
- Server-backed architectures (Figma, Docker, Slack) sidestep the question entirely — a powerful architectural simplification.
- Docker Desktop's "CLI is a client; GUI is a daemon host" is the cleanest pattern for CLI+GUI coexistence. If CLI invocations route through the GUI's server (not the filesystem directly), they stop being competing-writer processes and become clients.

### D4 — Take-over / quit-the-other UX [P0]

**Finding:** No production Electron app in the survey offers auto-takeover. VS Code's "not responding" dialog (10s timeout) surfaces the failure but requires user action. Logseq's proposed read-only mode with explicit "I know better" override is the most sophisticated user-mediated pattern.

**Evidence:** [evidence/d4-takeover-ux.md](evidence/d4-takeover-ux.md)

**Confidence:** CONFIRMED.

**Implications:**
- Auto-takeover carries data-loss risk (the "stuck" first instance may have unsaved state). User-mediated is the industry default for a reason.
- Writing the PID to the lockfile is a trivial change that meaningfully improves diagnosability — even if the app never reads the PID, users can correlate with Activity Monitor / Task Manager.
- Read-only mode as an intermediate state (Logseq proposal) is underused; it allows the second instance to be useful without data-corruption risk.

### D5 — Watchdog + revive patterns [P1]

**Finding:** No surveyed Electron app ships a supervisor-restart watchdog. `app.relaunch()` on `uncaughtException` is the most aggressive pattern observed, and it requires crash-loop detection (>3 crashes in <30s → stop relaunching) to avoid infinite restart storms.

**Evidence:** [evidence/d5-7-watchdog-orphaning-idempotency.md](evidence/d5-7-watchdog-orphaning-idempotency.md)

**Confidence:** CONFIRMED.

**Implications:**
- Desktop-app philosophy differs from SRE philosophy. Desktop users expect visible crashes (so they can report / reset state); SRE expects invisible self-healing. Applying SRE patterns to desktop apps creates "why is my app doing weird things silently" UX.
- `app.relaunch()` is not guaranteed to work ([electron/electron#31726](https://github.com/electron/electron/issues/31726)); pair with crash reporting so failed relaunches don't silently orphan the user.

### D6 — Process-tree orphaning [P1]

**Finding:** OS primitives for parent-death-triggered child cleanup vary by platform: Windows (Job Objects, strongest), Linux (PR_SET_PDEATHSIG, race-prone), macOS (no kernel primitive, child must self-monitor). Electron's `utilityProcess` does not integrate with these by default.

**Evidence:** [evidence/d5-7-watchdog-orphaning-idempotency.md](evidence/d5-7-watchdog-orphaning-idempotency.md)

**Confidence:** CONFIRMED.

**Implications:**
- For cross-platform robustness, design every long-lived child process to self-detect parent death. macOS is the binding constraint; solutions that work there (stdin-EOF, kqueue NOTE_EXIT, poll kill(ppid, 0)) work everywhere.
- MCP stdio subprocesses get parent-death detection for free because the stdio protocol closes stdin on parent exit. Utility processes spawned over IPC do not — they need explicit monitoring.
- Windows Job Objects with `KILL_ON_JOB_CLOSE` are worth the native-addon complexity for any app that spawns many children — they're the only kernel-guaranteed cascade on Windows.

### D7 — Idempotent start attempts [P1]

**Finding:** Canonical split-brain failure is "lock acquired, port bind fails, process exits without cleanup." VS Code routes lockfile cleanup through `onWillShutdown` with `.catch(() => {})` to ensure cleanup attempts happen regardless of exit cause, but SIGKILL still leaves stale state.

**Evidence:** [evidence/d5-7-watchdog-orphaning-idempotency.md](evidence/d5-7-watchdog-orphaning-idempotency.md)

**Confidence:** CONFIRMED.

**Implications:**
- Next-startup stale-detection is the only reliable cleanup path. Shutdown-hook cleanup is good hygiene but cannot be the primary mechanism.
- Acquire-resources-in-reverse-cleanup-order is a classic transactionality trick but VS Code doesn't strictly follow it — proving that "acquire order" matters less than "cleanup path works from any state."

---

## Spec Gaps Identified

The prompt's primary question asks which edges the spec doesn't cover. Based on the patterns surveyed, these are the gaps most likely to surface in production if not addressed:

### Gap 1: Cross-machine lock is unsolved (edge h)
**Severity:** High for users on iCloud/Dropbox-synced directories; none for local-only projects.
**Observed production solution:** None shipped. Logseq's hostname-per-file proposal is the cleanest pattern available.
**Risk item:** The current spec's `server.lock` (single file with PID/hostname) is necessary but not sufficient for cross-machine. Without hostname-discriminated lock-directory + user-facing dialog + read-only mode, cross-machine users will experience data corruption silently.

### Gap 2: MCP-spawns-server orphaning (edges a, e, C5)
**Severity:** Medium — affects users whose AI tool died mid-session.
**Observed production solution:** MCP stdio subprocesses should self-exit on stdin-EOF (standard MCP transport behavior). Any `ok start` spawned by MCP should inherit stdin or otherwise detect MCP-parent death.
**Risk item:** If `ok mcp` self-spawns `ok start` and then `ok mcp` dies, the `ok start` persists (holds `server.lock`) until next restart — blocks the Electron app from starting. Needs parent-death detection on the spawned server.

### Gap 3: Takeover semantics for "stuck first instance" (edge a, D4)
**Severity:** Low-Medium.
**Observed production solution:** User-mediated only. 10s dialog in VS Code; silent refuse elsewhere.
**Risk item:** The spec should state the policy explicitly — does "new Electron launches while orphaned `ok start` holds lock" result in (a) clear error with PID identifying what to kill, (b) silent takeover (risky), or (c) read-only mode? The JetBrains + Logseq read-only pattern deserves serious consideration here because `ok start` is headless and its "unsaved state" is minimal.

### Gap 4: 12-hour safety-net self-shutdown UX (edge g)
**Severity:** Low — affects users with very long uninterrupted sessions.
**Observed production solution:** VS Code's `--wait` marker-file idleness is the analogous pattern.
**Risk item:** 12-hour shutdown is fail-safe-by-design, but without (a) indicator in the proxied UI and (b) liveness-extension on activity, users will experience apparent amnesia ("I had my tab open, why did it break?") with no error-path breadcrumbs.

### Gap 5: URL cold-start with no handler registered (edge j)
**Severity:** Low — affects first-time users only.
**Observed production solution:** Register protocol at install time; fall back to web URL for non-desktop users.
**Risk item:** If the spec assumes `openknowledge://...` URLs always reach the app, first-time users get "no app for this protocol" with no recovery path. A web-landing fallback URL should be the canonical shareable form; desktop URLs are an enrichment.

### Gap 6: Process-tree cleanup on Electron-main crash (edge e, D6)
**Severity:** Medium-High on macOS; Medium on Windows; Low on Linux.
**Observed production solution:** Platform-specific — Job Objects (Windows), `PR_SET_PDEATHSIG` (Linux), stdin-EOF/polling (macOS).
**Risk item:** The current design's `server.lock` stale-recovery handles the state-cleanup side; but orphaned utility processes (the one previously holding `server.lock`) may still be running when new Electron starts. Next Electron sees stale `server.lock`, claims it, starts new utility — old utility is still running, still holding a port, may even still be responding to HTTP requests. Without OS-level cleanup or explicit "kill process in PID field of stale lock if alive," two servers can coexist briefly.

### Gap 7: "What holds `server.lock`?" diagnosis UX
**Severity:** Low — quality-of-life.
**Observed production solution:** VS Code writes PID to `code.lock` — diagnostic, self-documenting.
**Risk item:** When `ServerLockCollisionError` surfaces to a user, the error message should include: PID, hostname, process name guess (Electron? ok start? who spawned it?), started-at timestamp, worktreeRoot. This is cheap to include and dramatically speeds user diagnosis. Matches the VS Code "running as administrator" specific error — name the failure precisely.

---

## Limitations & Open Questions

### Dimensions Not Fully Covered
- **Electron `utilityProcess` orphaning specifics on macOS OOM-kill:** Would require experimental verification. Best available signal is the general pattern of utility processes behaving like `child_process.fork` children on POSIX.
- **Signal Desktop, Discord internal implementation details:** Closed-source or not available in local OSS cache. Behavior inferred from user-forum patterns; not verified at code level.
- **Cursor's divergences from VS Code in main.ts:** Cursor is closed-source. Observable behavior ("focus existing, refuse multi-window-same-project") is confirmed; underlying code changes from VS Code not inspectable.

### Out of Scope (per Rubric Non-Goals)
- Single-instance mechanics at the `app.requestSingleInstanceLock` level (well-documented in Electron docs; not this report's focus).
- Library recommendations (factual survey only).
- 1P Open Knowledge implementation details.

---

## References

### Evidence Files
- [evidence/d1-startup-order-primitives.md](evidence/d1-startup-order-primitives.md) — VS Code `claimInstance`, GitHub Desktop / Logseq primitive patterns, Electron deep-link cold-start
- [evidence/d2-transition-edges.md](evidence/d2-transition-edges.md) — `will-quit` timing, SIGKILL scenarios, `proper-lockfile`, hostname locks, orphaning on Windows
- [evidence/d3-production-app-ux.md](evidence/d3-production-app-ux.md) — JetBrains tri-state, Cursor refusal, Docker Desktop client/server, Figma server-canonical
- [evidence/d4-takeover-ux.md](evidence/d4-takeover-ux.md) — no-auto-takeover observation, VS Code admin-EPERM dialog, Logseq read-only override
- [evidence/d5-7-watchdog-orphaning-idempotency.md](evidence/d5-7-watchdog-orphaning-idempotency.md) — `app.relaunch` patterns, Job Objects, `PR_SET_PDEATHSIG`, macOS lacking equivalent

### External Sources
- [VS Code main.ts source](https://github.com/microsoft/vscode/blob/main/src/vs/code/electron-main/main.ts) — three-layer instance model
- [VS Code windowsMainService.ts](https://github.com/microsoft/vscode/blob/main/src/vs/platform/windows/electron-main/windowsMainService.ts) — workspace-window routing
- [GitHub Desktop main.ts](https://github.com/desktop/desktop/blob/development/app/src/main-process/main.ts) — single-instance + focus pattern
- [Logseq core.cljs](https://github.com/logseq/logseq/blob/master/src/electron/electron/core.cljs) — Electron single-instance usage
- [logseq/logseq#3386](https://github.com/logseq/logseq/issues/3386) — hostname-based cross-machine lock proposal
- [electron/electron#5620](https://github.com/electron/electron/issues/5620) — release single-instance lock before exit
- [electron/electron#35680](https://github.com/electron/electron/issues/35680) — Windows lock returns true twice bug
- [electron/electron#24447](https://github.com/electron/electron/issues/24447) — cross-user lock blindness
- [electron/electron#27201](https://github.com/electron/electron/issues/27201) — `will-quit` async termination
- [electron/electron#49261](https://github.com/electron/electron/issues/49261) — macOS SIGKILL without crash reports
- [electron/electron#6120](https://github.com/electron/electron/issues/6120) — orphaned processes on Windows
- [electron/electron#34808](https://github.com/electron/electron/issues/34808) — `unref()` + Electron exit
- [Electron Deep Links](https://www.electronjs.org/docs/latest/tutorial/launch-app-from-url-in-another-app) — cold vs warm start
- [Electron app API](https://www.electronjs.org/docs/latest/api/app) — lifecycle events
- [Electron utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process) — Chromium Services API
- [JetBrains — Open, close, move projects](https://www.jetbrains.com/help/idea/open-close-and-move-projects.html) — "Ask / New window / Current window"
- [VS Code CLI docs](https://code.visualstudio.com/docs/configure/command-line) — `-r` / `-n` flags
- [Cursor forum #111734](https://forum.cursor.com/t/multiple-cursor-windows-for-same-project/111734) — multi-window refusal
- [Obsidian — Multiple windows of same vault](https://forum.obsidian.md/t/multiple-windows-of-the-same-vault-repost/51258) — symlink workaround
- [Docker daemon troubleshooting](https://docs.docker.com/engine/daemon/troubleshoot/) — single-daemon policy
- [Figma Desktop guide](https://help.figma.com/hc/en-us/articles/5601429983767) — multi-window-same-file
- [Old New Thing — foreground activation](https://devblogs.microsoft.com/oldnewthing/20090220-00/?p=19083) — Windows SetForegroundWindow permission model
- [VS Code PR #13255](https://github.com/microsoft/vscode/pull/13255) — `AllowSetForegroundWindow` integration
- [proper-lockfile](https://www.npmjs.com/package/proper-lockfile) — mtime-heartbeat staleness
- [man7 prctl(PR_SET_PDEATHSIG)](https://man7.org/linux/man-pages/man2/pr_set_pdeathsig.2const.html) — Linux parent-death signal
- [anthropics/claude-code#33947](https://github.com/anthropics/claude-code/issues/33947) — MCP subprocess orphan PPID=1

### Related Research
- [T1 — @napi-rs/keyring in utilityProcess + Keychain UX](../t1-keyring-utility-process/REPORT.md)
- [T2 — Preload bridge patterns](../t2-preload-bridge-patterns/REPORT.md)
- [T3 — Multi-window subprocess lifecycle](../t3-multi-window-subprocess-lifecycle/REPORT.md)
- [T4 — Deep-linking / URL schemes](../t4-deeplinking-url-schemes/REPORT.md)
