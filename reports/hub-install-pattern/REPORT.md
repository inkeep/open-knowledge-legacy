# Hub install pattern — launchd LaunchAgent

**Date:** 2026-04-14
**Companion to:** `multi-project-topology-and-quickstart`, `multi-project-switching-landscape`

This report closes a gap in the multi-project reports: if the hub is supposed to be "the single place you go to see all your knowledge projects," how does it actually stay running without the user having to remember to start it? The landscape report punted on this — "run `open-knowledge hub` in a terminal" — which means the hub dies when you close the terminal. That's not a hub; that's a one-off.

The right answer, on macOS, is a per-user launchd LaunchAgent. The pattern is well-trodden by other local-first CLI tools that need a persistent background component, and one such tool in the same broader ecosystem uses exactly this shape. The relevant parts are captured below as a reusable reference for Open Knowledge.

## The pattern in one sentence

Install a user-level plist at `~/Library/LaunchAgents/com.<org>.<component>.plist` and load it with `launchctl bootstrap gui/$UID <plist>`. launchd then owns the process lifecycle: starts at login, restarts on crash, no sudo, no terminal, no cron.

## The plist template

Adapted to Open Knowledge:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.inkeep.open-knowledge-hub</string>

    <key>ProgramArguments</key>
    <array>
        <string>/absolute/path/to/bun</string>
        <string>run</string>
        <string>/absolute/path/to/packages/cli/dist/cli.mjs</string>
        <string>hub</string>
        <string>--foreground</string>
    </array>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>/Users/<me>/.open-knowledge/hub.log</string>

    <key>StandardErrorPath</key>
    <string>/Users/<me>/.open-knowledge/hub.log</string>

    <key>WorkingDirectory</key>
    <string>/Users/<me>/.open-knowledge</string>
</dict>
</plist>
```

Key fields:

| Key | Purpose |
|---|---|
| `Label` | Unique reverse-DNS ID. Used by `launchctl` to reference the job. |
| `ProgramArguments` | First element is the executable (an absolute path to `bun` or `node`); the rest are its argv. |
| `RunAtLoad` | Starts the process when the agent is loaded (at login, or on `bootstrap`). |
| `KeepAlive` | Restart the process if it dies. Can be an object for richer conditions, but boolean `true` covers the common case. |
| `StandardOutPath` / `StandardErrorPath` | Absolute paths — no `~` expansion. Both point at one log file, appended to by launchd. |
| `WorkingDirectory` | cwd of the spawned process. |

**Important:** launchd's plist parser does not expand `~` or environment variables. All paths must be resolved to absolute paths at install time. The install function takes `process.env.HOME` and the result of `process.argv[0]` (the bun/node binary) to interpolate them.

## The install flow

Minimum viable command shape:

```
open-knowledge hub install       # write plist + launchctl bootstrap
open-knowledge hub start         # launchctl kickstart (if loaded but stopped)
open-knowledge hub stop          # launchctl bootout (stops auto-restart)
open-knowledge hub uninstall     # bootout + delete plist
open-knowledge hub status        # is-loaded + is-running + port + log tail
open-knowledge hub logs          # tail of ~/.open-knowledge/hub.log
```

Install internals (one function, ~40 lines):

```ts
function installHubLaunchAgent(): void {
  if (process.platform !== 'darwin') {
    console.log('Auto-start is only supported on macOS today.');
    return;
  }

  const homeDir = process.env.HOME!;
  const launchAgentsDir = `${homeDir}/Library/LaunchAgents`;
  const plistDest = `${launchAgentsDir}/com.inkeep.open-knowledge-hub.plist`;

  const bunPath = process.argv[0];                      // absolute; from the invoking shell
  const scriptPath = require.resolve('@inkeep/open-knowledge/dist/cli.mjs');
  const workDir = `${homeDir}/.open-knowledge`;
  const logPath = `${workDir}/hub.log`;

  const plistContent = /* template above, interpolated */;

  mkdirSync(launchAgentsDir, { recursive: true });
  mkdirSync(workDir, { recursive: true });
  writeFileSync(plistDest, plistContent);

  const uid = execSync('id -u', { encoding: 'utf-8' }).trim();
  try { execSync(`launchctl bootout gui/${uid} ${plistDest} 2>/dev/null`); } catch {}
  execSync(`launchctl bootstrap gui/${uid} ${plistDest}`);

  console.log('✓ Hub installed. It will run at login and restart on crash.');
  console.log('  Open http://localhost:5100 to see your projects.');
}
```

The `bootout` before `bootstrap` is the safe-reload pattern: if the agent is already loaded, unload it first; then load the (possibly updated) plist. `2>/dev/null` suppresses the noise when it wasn't loaded to begin with.

## Uninstall must precede `stop`

A subtle gotcha: `open-knowledge hub stop` cannot just kill the process — launchd will immediately restart it because of `KeepAlive: true`. The correct sequence is:

```ts
function stopHub(): void {
  // 1. Unload the agent so launchd stops managing it.
  const plistPath = `${process.env.HOME}/Library/LaunchAgents/com.inkeep.open-knowledge-hub.plist`;
  if (existsSync(plistPath)) {
    const uid = execSync('id -u', { encoding: 'utf-8' }).trim();
    try { execSync(`launchctl bootout gui/${uid} ${plistPath} 2>/dev/null`); } catch {}
  }
  // 2. As a safety net, free the port if anything is still listening.
  try { execSync(`lsof -ti :5100 | xargs -r kill -9`); } catch {}
}
```

Uninstall is `stop` + delete plist.

## Why this specific pattern and not the alternatives

| Alternative | Why not |
|---|---|
| **Double-fork / nohup in a shell** | Survives terminal close but not login/logout. No restart on crash. Leaves zombies on OS-forced kills. |
| **`pm2` / `forever` / `supervisor`** | Adds a dependency. Users who already run pm2 for other things are the minority. Introduces its own lifecycle (pm2 has to be running first). |
| **`systemd --user`** | Correct on Linux. Doesn't exist on macOS. We need a per-OS strategy and launchd is the macOS half. |
| **Docker / container** | Heavyweight for a localhost HTTP server. Adds a dependency we don't otherwise need. |
| **Electron tray app** | Gives you the tray, but also gives you a ~150 MB bundle, an auto-updater, notarization, and an extra process per user. The plist + a web hub at a well-known port gets 90% of the benefit. |
| **Homebrew `services`** | Works, but requires Homebrew, and the plist-under-the-hood is the same. Installing via the CLI directly means no dependency on Homebrew. |

The launchd plist is the thinnest possible mechanism that satisfies: starts at login, restarts on crash, user-scoped (no sudo), no extra runtime, no bundle, works today on every macOS user's machine.

## Per-OS strategy

| OS | Mechanism | Status |
|---|---|---|
| macOS | launchd user LaunchAgent (`~/Library/LaunchAgents`, `launchctl bootstrap gui/$UID`) | Ship first |
| Linux | systemd user unit (`~/.config/systemd/user/open-knowledge-hub.service`, `systemctl --user enable --now`) | Ship second; similar complexity |
| Windows | Windows Task Scheduler at-login task, OR Windows Service via `sc.exe` | Ship when there's demand; document as manual for now |

The install command should detect platform and print a clear message on unsupported platforms rather than silently no-op:

```ts
if (process.platform !== 'darwin' && process.platform !== 'linux') {
  console.log('Auto-install not yet supported on this platform.');
  console.log('Run `open-knowledge hub start` manually in a terminal to use the hub.');
  return;
}
```

## What the hub itself is

Out of scope for this report but worth stating so the install target is concrete. The hub is:

- A process that listens on a well-known port (proposed `127.0.0.1:5100`, persisted in `~/.open-knowledge/hub.lock`).
- Serves the same React SPA bundle as per-project servers, with a project-picker route added.
- Reads `~/.open-knowledge/projects.json` (the registry, from the switching-landscape report) to know what projects exist.
- For each entry, reads `<path>/.open-knowledge/server.lock` + `isProcessAlive(pid)` to know whether it's live.
- Provides `GET /api/projects` for the SPA.
- Does NOT run a Hocuspocus collab server. The SPA, when opening a project, opens a WebSocket directly to that project's per-project Hocuspocus (which requires the CORS + Origin fixes in the one-UI-many-servers section of the topology report).

So the hub is a small, mostly read-only HTTP service. launchd-managed. Restarted on crash. Starts at login. Never owns project content directly.

## Integration with the rest of the install story

Fit into the existing quickstart without disrupting the single-project case:

```
# One-time machine setup (unchanged from current happy path)
bun install -g @inkeep/open-knowledge    # or npm

# One-time hub install (new, optional)
open-knowledge hub install               # writes plist + loads it
# → "Hub installed. Open http://localhost:5100"

# Per-project (unchanged)
cd ~/work/project-a
open-knowledge init
open-knowledge start                     # foreground, same as today
```

The hub is **additive**: users who only use one project never need to install it. Users with multiple projects install it once and never think about it again. The plist respects the user's running projects but does not touch them.

## Bounded risks

- **Upgrades.** If the user runs `bun install -g @inkeep/open-knowledge@new` and the binary location changes, the plist's absolute path may become stale. Mitigation: on `open-knowledge hub install`, the install function re-resolves and re-writes the plist. Document that `hub install` is idempotent and should be re-run after major CLI upgrades. Alternative: make the plist invoke `npx @inkeep/open-knowledge hub --foreground` instead of an absolute path, paying a cold-start cost per launch in exchange for path-stability. Recommend absolute paths for speed, re-run on upgrade.
- **Orphaned plist after CLI uninstall.** If the user `bun uninstall -g @inkeep/open-knowledge` without first running `hub uninstall`, the plist sits in `~/Library/LaunchAgents/` pointing at a vanished binary. launchd logs errors and rate-limits restart attempts. Mitigation: hook uninstall detection is unreliable; document "`hub uninstall` first" and add a self-check on `hub status` that verifies the binary still exists.
- **Port collisions on 5100.** Same class of bug as the onboarding-audit F4. The hub should auto-fall-back to a free port on EADDRINUSE and write the real port to `hub.lock`. This is the only place where launchd-managed port flexibility matters — at-login starts are non-interactive, so hard-failing on collision is especially user-hostile.
- **Quarantined binaries.** On macOS Gatekeeper, a bun binary not from a signed installer may trigger warnings on first launchd-managed launch. Since the user installed via `bun install -g` (user action), the quarantine flag shouldn't be set, but worth testing before shipping.

## What to add to PR #138 and what to defer

**Add to PR #138 as reports only:** this report and a cross-reference to it from `multi-project-topology-and-quickstart/REPORT.md` §2.5 (the "decoupled frontend" subsection, which currently says "costs: CORS setup, loses 'just open localhost:5173' simplicity, adds a hub-install step to the happy path" — this report makes the hub-install step concrete).

**Defer to implementation stories:**
- The actual `open-knowledge hub` command
- The plist template codified in `packages/cli/src/commands/hub.ts`
- The `install` / `uninstall` / `start` / `stop` / `status` / `logs` subcommands
- systemd-user parity for Linux
- The hub SPA route in `packages/app`
- CORS enablement in `packages/server/src/api-extension.ts`

None of those are blocked by this report; this report is the reference for how the install half works when someone picks up the story.
