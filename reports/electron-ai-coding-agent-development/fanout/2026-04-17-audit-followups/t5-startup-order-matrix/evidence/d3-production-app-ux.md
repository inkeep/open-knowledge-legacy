# Evidence: D3 — Production-App Collision UX

**Dimension:** D3 — How production apps handle analogous concurrent-actor scenarios
**Date:** 2026-04-17
**Sources:** VS Code source + docs, JetBrains docs, Cursor forum, Obsidian forum, Logseq forum, Docker docs, Figma docs, Dropbox help

---

## Key files / pages referenced

- [JetBrains: Open, move, close projects](https://www.jetbrains.com/help/idea/open-close-and-move-projects.html) — "Ask / New window / Current window" tri-state setting
- [VS Code: Command Line Interface](https://code.visualstudio.com/docs/configure/command-line) — `-r` / `-n` flags, default CLI behavior
- [Cursor forum: Multiple windows for same project](https://forum.cursor.com/t/multiple-cursor-windows-for-same-project/111734) — focuses existing window
- [Obsidian: Multiple windows of the same vault](https://forum.obsidian.md/t/multiple-windows-of-the-same-vault-repost/51258) — symlink workaround
- [Logseq: Multiple instances/windows](https://discuss.logseq.com/t/multiple-instances-windows/28664) — multi-graph support, concurrency risks
- [Docker daemon docs](https://docs.docker.com/engine/daemon/troubleshoot/) — "Only one Docker daemon per host"
- [Figma: multi-window desktop](https://help.figma.com/hc/en-us/articles/5601429983767) — multiple tabs of same file, server-side sync
- [VS Code PR #13255](https://github.com/microsoft/vscode/pull/13255) — `AllowSetForegroundWindow` for Windows focus transfer
- [Old New Thing: foreground activation permission](https://devblogs.microsoft.com/oldnewthing/20090220-00/?p=19083) — Windows foreground-stealing rules

---

## Findings

### Finding: JetBrains IDEs offer a tri-state setting: "New window / Current window / Ask" with remember-my-choice
**Confidence:** CONFIRMED
**Evidence:** [JetBrains docs](https://www.jetbrains.com/help/idea/open-close-and-move-projects.html)

```text
By default, when you launch the second or any subsequent project, the IDE asks you how you want to open it: in a new window or in the same window.

Settings | Appearance & Behavior | System Settings — "Open project in":
- New window — each project opens separately
- Current window — the existing project closes before the new one opens
- Ask — displays a dialog allowing the user to choose
```

Dialog (per community reports): two buttons — "This Window" and "New Window" — plus a "Remember, don't ask again" checkbox. The dialog treats "this window" as destructive (closes the currently-open project in that window).

**Implications:** Three-way decisions require three-way UI. The trap is treating this as a boolean — "New or reuse?" — which silently destroys state when the user means "open alongside, not replace."

### Finding: VS Code's CLI default is "open in new window"; `-r` opts into reuse, `-n` forces new
**Confidence:** CONFIRMED
**Evidence:** [VS Code CLI docs](https://code.visualstudio.com/docs/configure/command-line) + `window.openFoldersInNewWindow` setting

```text
-n, --new-window — Force to open a new window
-r, --reuse-window — Force to open a file or folder in an already opened window
Default: open new window unless window.openFoldersInNewWindow setting overrides
```

But the runtime behavior is more nuanced: `findWindowOnWorkspaceOrFolder` (see D1 evidence) silently routes to an existing window if the requested folder is already open there — regardless of `-n`/`-r`.

**Implications:** CLI flags are suggestions; the in-memory workspace registry has final say for the "same workspace requested twice" case. This is the right default — duplicating a workspace silently would create two-writer file corruption.

### Finding: Cursor diverges from VS Code — always focuses existing, does not support multi-window-same-project
**Confidence:** CONFIRMED
**Evidence:** [Cursor forum #111734](https://forum.cursor.com/t/multiple-cursor-windows-for-same-project/111734)

```text
When I try to open a second Cursor window with the same project, it just focuses back to the existing window.
```

Community workaround: "create separate agent tabs within a single window or open multiple independent copies of Cursor on the same codebase." The "multiple copies" workaround implies bypassing single-instance (separate install or binary relaunch with different user-data dir).

**Implications:** For AI-editor forks of VS Code, the safer default is "focus existing, never duplicate" — the AI conversation state would otherwise bifurcate across windows with no reconciliation. This matters when the "app" has more per-workspace state than VS Code (conversations, agent contexts).

### Finding: Obsidian uses path-keyed single-instance; symlink workaround is common
**Confidence:** CONFIRMED
**Evidence:** [Obsidian forum](https://forum.obsidian.md/t/multiple-windows-of-the-same-vault-repost/51258), [forum.obsidian.md/t/opening-the-same-vault-in-multiple-instances-with-bind-mounts-linux/43836](https://forum.obsidian.md/t/opening-the-same-vault-in-multiple-instances-with-bind-mounts-linux/43836)

User-submitted workarounds:
- macOS/Linux: `ln -s /path/to/vault /path/to/vault-clone`, open the symlink as a new vault.
- Windows: `mklink /J` (directory junction).
- Linux: `bwrap` with bind mounts.

Obsidian treats vaults by path; two paths = two vaults, even if they resolve to the same inode. No lock detection, no warning.

**Implications:** Path-keyed single-instance is insufficient when the underlying data is shared. Users routinely circumvent it (symlinks), and the app has no mechanism to detect or warn about concurrent writers to the same inode.

### Finding: Logseq documents multi-machine conflict risk but no built-in cross-machine lock
**Confidence:** CONFIRMED
**Evidence:** [Logseq issue #3386](https://github.com/logseq/logseq/issues/3386)

```text
Running two instances of Logseq on the same graph synced via services like Dropbox or iCloud Drive is currently problematic and may lead to blank pages and many files in backup directories.
```

Proposed but not yet implemented: hostname-based lock directory, read-only mode with user-override button.

**Implications:** Production apps acknowledge this failure mode without fixing it at the code level. The mitigation falls on user UX (in-app warning, "I know better" escape hatch) rather than cross-machine file-locking (which can't work reliably over sync services — see D2).

### Finding: Docker Desktop mandates single-daemon with CLI/GUI sharing the same socket
**Confidence:** CONFIRMED
**Evidence:** [Docker daemon troubleshooting](https://docs.docker.com/engine/daemon/troubleshoot/)

```text
Use Docker Desktop or Docker CE, not both. If you get multiple process IDs, that means you have multiple Docker daemons running, which is most likely by accident. You should run only one Docker daemon.
```

Docker's coexistence model: CLI (`docker`) is a client; GUI (Docker Desktop) is the daemon host. Both route to `unix:///var/run/docker.sock` (or the Docker Desktop VM's socket via context). The *daemon* is single-instance; the *clients* are unlimited.

**Implications:** "One server, many clients" is the stablest concurrent-actor model. The client/server split means CLI invocations don't contend for the server's lock — they speak the protocol. Any app modeled as "shared-resource server + thin CLI clients" avoids CLI-vs-GUI collision by design.

### Finding: Figma Desktop allows multi-window-same-file; concurrency handled server-side
**Confidence:** CONFIRMED
**Evidence:** [Figma Desktop guide](https://help.figma.com/hc/en-us/articles/5601429983767)

```text
In the desktop app you can open multiple windows with the same file (and hide multiplayer cursors) to have simultaneous access to several pages, or locations within it.
```

Figma's architecture makes concurrency non-issue: every edit is a CRDT op sent to server, clients observe via subscribe. Two local windows are equivalent to two different users — no file-lock semantics at all.

**Implications:** Collaborative-server architecture eliminates the "multi-writer lock" problem entirely. When the canonical state is on a server (or in a CRDT), local desktop clients become read/write cache peers, not state owners. The lock question becomes "am I the server?" (trivially one per project) rather than "am I the only writer?" (which doesn't compose).

### Finding: GitHub Desktop's single-instance model: first-wins, second-instance forwards args + focuses first
**Confidence:** CONFIRMED
**Evidence:** `desktop/desktop/app/src/main-process/main.ts:170-198` (see D1 evidence)

**Implications:** For single-window apps, this is the minimum-viable pattern. No need for workspace routing, IPC pipe, or in-memory registry.

### Finding: Slack/Discord use strict single-instance with no "open multiple workspaces" per-instance support
**Confidence:** INFERRED (from user-forum patterns; closed-source apps)
**Evidence:** Community discussions on running multiple Slack/Discord instances — all workarounds require separate user-data directories or bespoke binaries.

Both apps present "multiple workspaces" as in-app tabs (Slack sidebar) rather than per-instance. Second binary launch is refused; user routed to existing instance.

**Implications:** For chat/messaging apps, concurrency is fully in-app (tabs/channels within one window). Multi-window is a pop-out UI pattern, not a multi-instance pattern. Open Knowledge's four-actor model is more structurally complex than a messaging app.

### Finding: Windows foreground-focus requires explicit permission transfer (`AllowSetForegroundWindow`)
**Confidence:** CONFIRMED
**Evidence:** [Old New Thing](https://devblogs.microsoft.com/oldnewthing/20090220-00/?p=19083), [VS Code PR #13255](https://github.com/microsoft/vscode/pull/13255)

```text
When a second instance of VS Code is started on Windows, it performs these actions: Get the PID of the original instance via IPC, call AllowSetForegroundWindow to allow the original instance to use SetForegroundWindow, and then send the start IPC to the original instance and exit.
```

Without this dance, the first instance's attempt to raise itself silently no-ops (Windows assumes foreground-stealing).

**Implications:** "Focus the existing window" is a nontrivial cross-platform operation. macOS and Linux are permissive; Windows requires the second instance to transfer the foreground-activation right before exiting.

### Finding: VS Code shows 10s "not responding" dialog, never auto-kills the deadlocked first instance
**Confidence:** CONFIRMED
**Evidence:** `vscode/src/vs/code/electron-main/main.ts:376-384` (see D1)

**Implications:** No production app in the surveyed set offers "take over the lock from a deadlocked peer" automatically. All require user action (kill via Task Manager / Activity Monitor, then relaunch). See D4.

---

## Negative searches (for NOT FOUND)

- **Signal Desktop collision UX:** No public source access (Signal-Desktop not in oss-repos cache locally; repo available on GitHub but full behavior requires reading source). Known to use `app.requestSingleInstanceLock` + `second-instance` focus based on community reports.
- **Cursor specific divergences from VS Code in main.ts single-instance handling:** Cursor is closed-source fork; observable behavior ("focus existing") verified, but underlying code changes from VS Code not inspectable.
- **Docker Desktop explicit lockfile location:** Not publicly documented — socket-based mutual exclusion, not file-lock based.

---

## Gaps / follow-ups

- JetBrains dialog exact button wording ("This Window" / "New Window" / Cancel) sourced from community reports, not official doc screenshots.
- Figma Desktop's Electron process model (main vs. renderer vs. utility) not deeply documented — behavior inferred from server-side architecture.
