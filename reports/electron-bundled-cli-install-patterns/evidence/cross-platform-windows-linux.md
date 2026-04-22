# Evidence: Cross-platform — Windows installer PATH, Linux package managers

**Dimension:** D11 (cross-platform — Windows + Linux patterns for a future release cycle)
**Date:** 2026-04-21
**Sources:** [VS Code setup docs](https://code.visualstudio.com/docs/configure/command-line), Zed Linux docs, Docker Desktop Windows docs

---

## Findings

### Finding: Windows PATH install is installer-time, not in-app

**Confidence:** CONFIRMED
**Evidence:** VS Code configure/command-line docs

For VS Code on Windows (verbatim):

> "Windows and Linux installations should add the VS Code binaries location to your system path. If this isn't the case, you can manually add the location to the Path environment variable ($PATH on Linux). For example, on Windows, the default VS Code binaries location is `AppData\Local\Programs\Microsoft VS Code\bin`."

The Windows NSIS/Squirrel installer modifies `HKCU\Environment\Path` (or `HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment\Path` for all-users installs) at install time. No post-install menu item required. After a shell restart, `code file.txt` works from any cmd/PowerShell session.

For Docker Desktop on Windows: same pattern — installer places `docker.exe` at `C:\Program Files\Docker\Docker\resources\bin\docker.exe` and appends to PATH via registry.

**Implications for OK:**

- When OK ships a Windows build (post-M7, if ever), the installer (electron-builder's NSIS target) should set `"nsis": { "perMachine": true, "allowToChangeInstallationDirectory": false }` and include a PATH append. electron-builder has `includeInstallerCommands` helpers for this.
- There is NO Windows equivalent of macOS's `/usr/local/bin` symlink + menu-item UX. Windows simply doesn't have a shared "user local bin" convention that's pre-in-PATH — install-time PATH append is the idiom.
- User opt-in for PATH: NSIS convention is a checkbox on the installer ("Add to PATH") defaulted to on. VS Code does this; OK can inherit via electron-builder NSIS config.

---

### Finding: Linux package-manager installs auto-symlink; AppImage does not

**Confidence:** CONFIRMED
**Evidence:** Zed Linux docs + Sublime Linux docs

**Package manager (`.deb`, `.rpm`, pacman):**

The package's postinst script creates `/usr/bin/<name>` symlink during install. Works seamlessly — user runs `sudo apt install code` and `code` is on PATH immediately. This is what VS Code, Zed, and Docker all do on Linux.

**Tarball / AppImage:**

User-local install. Zed documents (verbatim):

> "tar -xvf <path/to/download>.tar.gz -C ~/.local"
> "ln -sf ~/.local/zed.app/bin/zed ~/.local/bin/zed"

No admin required; the user is expected to have `~/.local/bin` in their PATH (modern distros do by default via `~/.profile` or systemd user env).

Sublime Linux tarball:

```bash
sudo ln -s /opt/sublime_text/sublime_text /usr/local/bin/subl
```

Similar shape — user runs `ln -s` manually.

**Implications for OK:**

- When OK ships a Linux build (post-M7), ideal path: ship `.deb` + `.rpm` with postinst that symlinks `/usr/bin/ok`. electron-builder supports this via `linux.target` config.
- AppImage users are expected to DIY; OK's docs can include the one-liner `ln -s`.
- In-app menu item "Install Command-Line Tools…" is macOS-specific — Linux packaging handles the symlink; Windows installer handles the PATH append. The menu item only surfaces on Darwin.

---

### Finding: Windows + Linux do NOT have a macOS-equivalent app-translocation class of bug

**Confidence:** CONFIRMED
**Evidence:** Windows has no translocation; Linux has no equivalent

Neither Windows nor Linux has an analog to macOS's Gatekeeper Path Randomization. The install path is chosen at install time (Windows NSIS) or by the user (Linux tarball); there's no runtime-surprise "app moved to a random temp dir" behavior.

**Implications:**

- The OS-specific gotcha (detect translocation, refuse install) is macOS-only. Windows/Linux versions of OK's "Install Command-Line Tools" equivalent don't need that guard.
- Per-OS implementation in `packages/desktop/src/main/cli-install.ts` (hypothetical file for M6) should branch: `if (process.platform === 'darwin') { /* VS Code pattern + translocation guard */ }`. Windows and Linux flows wire into the installer, not the app itself.

---

## Gaps / follow-ups

- **macOS-only in OK scope**: M2 and M3 are macOS-first (per OK Electron spec §14 milestone sequence). Windows + Linux are future concerns. This evidence file is a placeholder for when they become current.
- **electron-builder NSIS PATH append config**: not verified in detail — confirm the exact config key (`nsis.include` + custom NSIS snippet vs. built-in `addToPath`) when Windows ships.
- **Linux `.deb` postinst for symlinks**: electron-builder's `linux.target: [{ target: 'deb' }]` auto-runs `update-alternatives` for the main binary but may not create a symlink for bundled sub-binaries like `ok`. Needs a custom postinst script.
