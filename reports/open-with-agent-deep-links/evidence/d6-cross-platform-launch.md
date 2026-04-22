# Evidence: D6 — Cross-platform launch mechanics

**Dimension:** macOS `open`, Windows `start` / `wt.exe`, Linux `xdg-open` / terminal fragmentation
**Date:** 2026-04-21
**Sources:** Apple, Microsoft Learn, freedesktop, Arch man pages, VS Code source

---

## Key files / pages referenced

- https://developer.apple.com/documentation/coreservices/launch_services — Apple LaunchServices
- https://brettterpstra.com/2014/08/06/shell-tricks-the-os-x-open-command/ — macOS `open` cookbook
- https://discussions.apple.com/thread/2010509 — `open -a --args` community thread
- https://learn.microsoft.com/en-us/windows/terminal/command-line-arguments — Windows Terminal CLI
- https://learn.microsoft.com/en-us/windows/win32/sysinfo/hkey-classes-root-key — HKCR registration
- https://learn.microsoft.com/en-us/troubleshoot/windows-client/shell-experience/command-line-string-limitation — cmd.exe 8191 limit
- https://man.archlinux.org/man/xdg-open.1.en — xdg-open manpage
- https://lists.freedesktop.org/archives/xdg/2018-August/014088.html — GNOME terminal-picker limbo
- https://github.com/Vladimir-csp/xdg-terminal-exec — XDG Default Terminal Execution Specification (proposed)
- https://github.com/microsoft/vscode — external-terminal-service reference (per-platform hand-rolled)

---

## Findings

### Finding: macOS — `open` / `open -a` / `open -n` / `open -b`, `--args` is unreliable
**Confidence:** CONFIRMED
**Evidence:** Apple docs, brettterpstra.com

```
open <url>                     # LaunchServices default-handler lookup (same path shell.openExternal uses)
open -a "App Name" <path>      # open specific app with file arg
open -a "App Name" --args a b  # pass raw args; target app must explicitly read them (many ignore)
open -n                        # force new instance
open -b <bundle-id>            # launch by bundle identifier
```

- LaunchServices registration: `Info.plist` → `CFBundleURLTypes` declares URL schemes the app claims. OS indexes at install/first-launch.
- `open -a ... --args`: **many apps ignore these args.** Unreliable for prompt passthrough.
- Fine-grained control: `osascript -e 'tell application "Foo" to activate'` then AppleScript events — heavy, but the only way to drive apps without URL schemes.

**Pattern for macOS CLI-in-terminal launch:**
Write a temporary `.command` script containing `cd <dir> && <cmd> "<prompt>"`, `chmod +x`, then `open <script>` — the user's default terminal opens. More reliable than `open -a Terminal --args` for complex arg passing.

### Finding: Windows — `start`, PowerShell `Start-Process`, `wt.exe` for Windows Terminal, HKCU > HKLM for registration
**Confidence:** CONFIRMED
**Evidence:** Microsoft Learn (Windows Terminal CLI, HKCR, command-line limits)

```
start <url>                           # cmd.exe builtin, routes through ShellExecute
start "" "<exe>" <args>               # the empty "" is positional window-title arg; forgetting it treats arg as title
Start-Process <exe> -ArgumentList @('a','b')   # PowerShell — handles quoting for you
wt.exe -p "PowerShell" -d "C:\path" powershell.exe -NoExit -Command "claude -p 'prompt'"
wt.exe new-tab | split-pane
```

- `wt.exe` (Windows Terminal) — first-class CLI: supports `-p <profile>`, `-d <cwd>`, `new-tab`, `split-pane`, `-w <window-id>`.
- Registry URL-scheme registration: `HKCU\Software\Classes\<scheme>\shell\open\command` (user-level, no admin) wins over `HKLM\Software\Classes\...` (system-level, admin required). User-level is the modern default.
- cmd.exe overall command line limit: ~8191 chars.

**Pattern for Windows CLI-in-terminal launch:**
```
spawn("wt.exe", ["-d", cwd, "powershell", "-NoExit", "-Command", `${cmd} '${prompt.replace(/'/g, "''")}'`])
// fallback if wt.exe absent:
spawn("cmd", ["/c", "start", "cmd", "/k", `cd /d ${cwd} && ${cmd}`])
```

### Finding: Linux — `xdg-open` + `.desktop` files + fragmented terminal picker; `$TERMINAL` is de-facto-unofficial
**Confidence:** CONFIRMED (fragmentation), MEDIUM (best practice)
**Evidence:** Arch manpage, freedesktop.org, Vladimir-csp/xdg-terminal-exec

```
xdg-open <url>              # freedesktop URL/MIME handler
xdg-open <file>             # opens default app for MIME type
```

`.desktop` entry examples:
- `MimeType=x-scheme-handler/myscheme;` — register for a URL scheme
- `Terminal=true` — launch in terminal (DE-dependent behavior)
- Registration: `~/.local/share/applications/` (per-user) or `/usr/share/applications/` (system).

**Terminal launch fragmentation is real.** No standard. Candidate chain (priority):
1. Debian/Ubuntu: `x-terminal-emulator` (Debian `update-alternatives`)
2. GNOME: `gnome-terminal -- <cmd>`
3. KDE: `konsole -e <cmd>`
4. XFCE: `xfce4-terminal -e <cmd>`
5. Fallback: `xterm -e <cmd>`
- `$TERMINAL` env var is a de-facto but unofficial convention.
- Emerging [XDG Default Terminal Execution Specification](https://github.com/Vladimir-csp/xdg-terminal-exec) exists but is NOT widely adopted as of 2026-04.
- GNOME is "in a state of limbo" re terminal selection (freedesktop mailing list).

### Finding: No stable cross-platform npm package for "spawn CLI in user's default terminal"
**Confidence:** MEDIUM (negative)
**Evidence:** npm registry search

- `electron-terminal-open`: last published 9 years ago. Stale.
- `open-terminal`: last published 5 years ago. Stale.
- `x-terminal-emulator`: Debian alias only; not cross-platform.

**Prevailing pattern: hand-rolled per-platform.** VS Code's `external-terminal-service` is a solid reference — they maintain per-OS logic in TypeScript.

### Finding: The "write a temp script, then `open`/`start` it" pattern is most reliable for complex arg passing
**Confidence:** MEDIUM
**Evidence:** Community consensus (Stack Overflow, VS Code source)

For macOS especially, `open --args` is flaky. Writing a short `.command` (macOS), `.ps1` / `.bat` (Windows), or `.sh` (Linux) to a tempdir, then opening it with the OS default handler, gives predictable arg quoting without shell interpolation risks.

---

## Negative searches (NOT FOUND)

- Searched for a "single cross-platform command to spawn CLI in default terminal" → no stable package / no standard OS primitive. Hand-rolled.
- Searched for `xdg-terminal-exec` standard adoption → proposed but not shipped in major distros as of 2026-04.

---

## Gaps / follow-ups

- **Reference implementation to port:** VS Code's `src/vs/workbench/services/externalTerminal/` is maintained cross-platform terminal-spawn logic — appropriate to study and port for our wrapper.
- **Windows Terminal absence fallback:** Not all Windows users have `wt.exe`. Probe before using; fall back to `cmd /c start cmd /k`.
- **Linux default-terminal detection:** consider a chain with `$TERMINAL` first, then `x-terminal-emulator`, then probe for `gnome-terminal`/`konsole`/`xfce4-terminal`/`xterm`. Document the order in the `/spec`.
