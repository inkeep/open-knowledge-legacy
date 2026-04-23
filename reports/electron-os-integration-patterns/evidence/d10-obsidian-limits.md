# Evidence: D10 — Obsidian's `shell.openPath` limits (Path C 2026-04-23)

**Dimension:** What limits does Obsidian (closed-source) put on what gets passed to `shell.openPath` when the user left-clicks a file? Extension block? Vault-containment? User consent? Plugin sandbox?

**Date:** 2026-04-23
**Sources:** Obsidian official changelog, forum threads, community plugins (via GitHub + DeepWiki), CVE databases. Closed-source behavior reconstructed from behavioral reports + plugin source.

---

## Summary (source-level verified via Obsidian 1.12.7 bundle inspection — 2026-04-23)

Corrected from earlier agent-inferred claims. All findings below are CONFIRMED from the main-process bundle (`Obsidian.app/Contents/Resources/obsidian.asar → main.js`) unless otherwise labeled.

- **There is NO generic "every click → confirmation dialog" behavior.** Local non-executable files (PDF, zip, docx, csv, images, etc.) open silently via `shell.openPath` — same as pre-1.12.2 for these cases.
- **Two conditional warnings** gate the `shell.openPath` call:
  1. **Remote-file warning** — fires on UNC paths (`\\server\share\…`). Dialog: *"Remote file warning — This file is located on a remote server, and may be dangerous. Are you sure you want to open it?"* Buttons: Open this file / Cancel. Cancel is the default.
  2. **Executable-file warning** — fires when the file's extension (or magic bytes for extensionless chmod+x) is in a platform-specific exec list. Dialog: *"Run executable file? — This link points to an executable file. Running it could harm your computer."* Buttons: Run File / Cancel. Cancel is the default.
- **Executable extension list (exact, from source)** — platform-dependent:
  - **Windows (Y branch):** `.exe`, `.bat`, `.cmd`, `.ps1`, `.com`, `.msi`, `.vbs`, `.js`, `.jse`, `.wsf`, `.wsh`
  - **macOS + Linux:** `.sh`, `.command`, `.csh`, `.ksh`, `.bash`, `.zsh`, `.fish`, `.desktop`, `.action`, `.workflow`
  - **Any platform:** extensionless files with chmod+x AND either `#!` shebang header OR specific binary magic (ELF/Mach-O INFERRED) — Vt() reads 4 bytes and branches.
- **Warn-not-block.** Both dialogs default to Cancel but the user can proceed. No hard block anywhere.
- **No realpath / vault-containment check.** Source has no prefix-match against vault root. Relies on link-resolver behavior + UNC detection only.
- **Platform branching in `oe(path)`:** macOS + Windows → `shell.openPath(path)`; Linux → `shell.openExternal(pathToFileURL(path).href)` (OpenURI portal compatibility).
- **Plugin bypass CONFIRMED at source level.** `BrowserWindow.webPreferences` is `contextIsolation: false, nodeIntegration: true, nodeIntegrationInWorker: true`. Plugins can `require('electron').shell.openPath` directly — bypasses Obsidian's `oe()` chain entirely. The 1.12.2 warnings apply only to Obsidian's core click-to-open flow.

**Posture:** warn-on-narrow-danger (exec + remote), silent for the common case. NOT per-click. NOT per-extension. NOT configurable (no "don't ask" checkbox).

---

---

## Findings

### Finding: No published extension blocklist; warn-only for executables as of 1.12.2

**Confidence:** CONFIRMED (changelog + forum)
**Evidence:**
- [Obsidian 1.12.2 Desktop (Early access) release notes](https://obsidian.md/changelog/2026-02-18-desktop-v1.12.2/) — "a warning when attempting to open an executable file"
- [Forum: No warnings when clicking on executable files](https://forum.obsidian.md/t/no-warnings-when-clicking-on-executable-files/83532) (2024) — `.py` and `.c` files executed silently before 1.12.2; moderator response "we'll revisit"; no fix until ~20 months later

Obsidian does not publish the executable-extension list. Based on the changelog phrasing + the 1.12.3 follow-up fix that exempts *folders* (e.g. `.snippets/`), the check appears to be **extension-based** (likely a short allowlist of `.exe`, `.bat`, `.cmd`, `.sh`, `.app`, `.scpt`, `.ps1`-class), not byte-sniffed. `.html` is INFERRED not on the warning list — no forum/changelog mention.

**Implication:** pre-1.12.2 Obsidian was the baseline "trust the OS" posture; post-1.12.2 adds a soft UX gate for exec-class but nothing for `.html` (stored-XSS class) or arbitrary `file:` targets.

### Finding: 1.12.2's "confirmation dialog" is TWO conditional warnings, not a generic per-click prompt

**Confidence:** CONFIRMED (source-code inspection of Obsidian 1.12.7's main.js, 2026-04-23)
**Evidence:** `/Applications/Obsidian.app/Contents/Resources/obsidian.asar → main.js`, extracted via `@electron/asar`.

The changelog language *"Opening files in an external application now shows a confirmation dialog for added safety"* was misleading. There is no blanket dialog. Only two narrow conditional warnings:

```js
// Simplified reconstruction from minified source (main.js)
// S = URL scheme, m = file path, e = BrowserWindow

if (S !== "file") return shell.openExternal(r);  // URL → shell.openExternal (6 sites in main)

// File path branch:
if (ft(m) || (Y && !/^[a-z]:/i.test(m))) {  // UNC path OR Windows non-drive-letter path
  const response = await dialog.showMessageBox(e, {
    message: `This file is located on a remote server, and may be dangerous.\nAre you sure you want to open it?\n\nLocation: ` + truncate(m, 200),
    type: "warning",
    buttons: ["Open this file", "Cancel"],
    defaultId: 1, cancelId: 1,
    title: "Remote file warning"
  });
  if (response.response !== 0) return;  // Cancelled
}

if (await Vt(m)) {  // File is an executable per platform-specific extension list (see below)
  const response = await dialog.showMessageBox(e, {
    message: `This link points to an executable file. Running it could harm your computer.\n\nFile: ` + truncate(m, 200),
    type: "warning",
    buttons: ["Run File", "Cancel"],
    defaultId: 1, cancelId: 1,
    title: "Run executable file?"
  });
  if (response.response !== 0) return;  // Cancelled
}

// Both checks passed → actually open
console.log("Opening file: " + m);
oe(m);

function oe(e) {
  !Y && !U 
    ? shell.openExternal(pathToFileURL(e).href)  // Linux — uses openExternal with file:// URL
    : shell.openPath(e);                          // macOS + Windows — direct openPath
}
```

**The Vt() executable predicate, reconstructed from source:**

```js
async function Vt(c) {
  const stat = await fs.stat(c);
  if (stat.isDirectory()) return false;
  const ext = path.extname(c).toLowerCase();
  
  if (Y /* Windows */) {
    return [".exe", ".bat", ".cmd", ".ps1", ".com", ".msi", ".vbs", ".js", ".jse", ".wsf", ".wsh"].includes(ext);
  }
  
  // macOS + Linux
  if ([".sh", ".command", ".csh", ".ksh", ".bash", ".zsh", ".fish", ".desktop", ".action", ".workflow"].includes(ext)) {
    return true;
  }
  
  // No extension + chmod +x → check shebang or binary magic
  if (!ext && (stat.mode & 0o111) !== 0) {
    const buf = Buffer.alloc(4);
    const fd = await fs.open(c, "r");
    await fd.read(buf, 0, 4, 0);
    await fd.close();
    if (buf.toString("ascii", 0, 2) === "#!" || /* binary magic check */) return true;
  }
  return false;
}
```

**The ft() remote-file predicate:**

```js
function ft(c) {
  return typeof c === "string" && /^[\\\/]{2,}[^\\\/]+[\\\/]+[^\\\/]+/.test(c);
  // Matches UNC paths: \\server\share\... or //server/share/...
}
```

**What this actually means:**

| File type | Dialog? |
|---|---|
| Local PDF, zip, docx, xlsx, txt, csv, images, any non-executable-non-remote | **ZERO dialog** — silent `shell.openPath` |
| Executable (`.exe`, `.sh`, `.desktop`, …) | "Run executable file?" warning |
| File on remote UNC path (`\\server\share\foo.pdf`) | "Remote file warning" |
| Executable AND remote | Both dialogs chained (remote first, then exec) |

**Comparison to Joplin — now sharp-edged:**

- Joplin: *every* open of every extension outside its safe-list goes through a confirmation dialog with "Always open .X files" checkbox (`bridge.ts:406-428`). First-time-per-extension gate.
- Obsidian: only executables + UNC paths get any dialog. PDFs/zips/docs/everything-else open silently. No "always allow" checkbox — the decision is per-click only for the narrow exec+remote cases.

Joplin is strictly more conservative than Obsidian for common opaque types. Obsidian is more UX-permissive (silent for the common case) but blocks exec-class files that Joplin would dialog-prompt for.

### Finding: Obsidian runs BrowserWindow with contextIsolation:false + nodeIntegration:true

**Confidence:** CONFIRMED (source inspection)
**Evidence:** main.js, webPreferences block:

```js
webPreferences: {
  contextIsolation: false,
  nodeIntegration: true,
  nodeIntegrationInWorker: true,
  spellcheck: true,
  webviewTag: true,
  affinity: "main-window"
}
```

**Implications:**
- Plugins (which run in the same renderer) can `require('electron').shell.openPath(path)` directly without going through Obsidian's `oe()` chain. They bypass both the remote-file and executable warnings. **Plugin bypass is architectural, not a gap to be closed.**
- Obsidian explicitly opts out of the Electron security baseline (`contextIsolation: true` + `nodeIntegration: false` + `sandbox: true`) that every other surveyed OSS app (VSCode, AFFiNE, Joplin, Standard Notes) uses. The trade-off is plugin ergonomics (direct Electron API access) vs. stronger XSS-to-RCE defense.

### Finding: Vault containment is implicit via indexer, not explicit realpath check

**Confidence:** UNCERTAIN (negative evidence — no forum report of escape, but no documented guard either)

Obsidian only shows files it has indexed inside the vault. "Open in default app" is reachable via right-click on an indexed file or via `[[wikilink]]` / `[markdown](link)`. No public forum reports of crafting a link to open `/etc/passwd` or similar. However:

- Relative-path links outside the vault *do* resolve and open (forum reports on linking-outside-vault patterns)
- No documented explicit `realpath`-vs-vault check in the official docs or plugin API guidance

**Implication:** the vault-boundary enforcement is effectively behavioral (indexer-based + UI-reachability) rather than a security primitive. An attacker-controlled link with a fully-qualified `file:///etc/passwd` target has not been publicly demonstrated to be blocked.

### Finding: "Detect all file extensions" is UX, not security

**Confidence:** CONFIRMED
**Evidence:** [Forum: hidden folders/dotfiles](https://forum.obsidian.md/t/hidden-folders-dotfiles-not-showing-in-file-explorer-despite-detect-all-file-types-being-enabled/106685)

Settings → Files & Links → "Detect all file extensions":
- **OFF:** non-`.md` / non-image files invisible in file explorer. Doesn't prevent clicks via `[[wikilink]]` — behavioral obfuscation, not enforcement.
- **ON:** dotfiles like `.env`, `.git-credentials` become visible/editable/deletable — explicit security concern flagged in forum threads.

**"Open in default app" is a core plugin** (Settings → Core plugins). Disabling removes the right-click entry entirely — effectively blocking core delegation. (Still doesn't block third-party plugins that shell out.)

### Finding: No CVE directly targets Obsidian's `shell.openPath`

**Confidence:** CONFIRMED
**Evidence:** [Obsidian CVE list (cvedetails)](https://www.cvedetails.com/vulnerability-list/vendor_id-25830/Obsidian.html), [CVE-2023-27035](https://nvd.nist.gov/vuln/detail/CVE-2023-27035)

The published Obsidian CVEs (CVE-2023-2110, CVE-2023-27035, pre-0.12.12 non-http URL handling, 0.14/0.15 `obsidian://hook-get-address` RCE, pre-1.2.2 camera/mic APIs) are all about `app://` local-file disclosure, URL scheme handling, or embedded-webpage privilege escalation — **not `shell.openPath` misuse**.

The 2024 "no warnings on .py/.c" forum report was treated as a UX/safety gap, not filed as a CVE, and sat unfixed until 1.12.2 (Feb 2026). Long fix latency suggests Obsidian's internal threat model did not prioritize this class — extension warnings are UX safety, not security hardening.

### Finding: Plugins bypass the 1.12.2 safeguards entirely

**Confidence:** CONFIRMED
**Evidence:** [phibr0/obsidian-open-with](https://github.com/phibr0/obsidian-open-with) source — uses raw Electron `shell` without validation; [DeepWiki plugin docs](https://deepwiki.com/obsidianmd/obsidian-plugin-docs/6.2-plugin-submission-guidelines)

- Obsidian's plugin sandbox does **not** wrap `shell.*` at the API layer. Plugins that `require('electron').shell` get the raw module.
- Obsidian developer docs emphasize `normalizePath()` for cross-platform correctness, not security.
- Third-party plugins (`obsidian-open-with`, image-context-menu extensions) pass user-configured paths straight through without realpath / extension / containment checks.
- The 1.12.2 executable warning + confirmation dialog apply **only to the core "Open in default app" command**. A plugin's IPC to main that calls `shell.openPath` bypasses both.

**Implication:** Obsidian's security model for `shell.openPath` is layered: core command has (new) consent UX, plugins have none. For a threat model that includes malicious plugins, Obsidian's guarantees are weak. For the more common case (trusted plugins + malicious link), core is warn-only.

---

## Corrected narrative — what Obsidian actually does (vs what the initial research claimed)

Earlier D9 research in `editor-asset-embed-patterns-across-universe/` claimed Obsidian "opens a blank/degraded preview pane" for opaque types on left-click. **That claim is wrong.** Evidence-safe corrected view:

- **Pre-1.12.2 (before Feb 2026):** left-click on unsupported type → silent `shell.openPath` to OS default. No warning, no confirmation. CONFIRMED via forum #83532 including zip auto-unzip on macOS and `.py`/`.c` silent execution.
- **Post-1.12.2 (Feb 2026+):** a confirmation dialog appears for external-app opens and a separate warning appears for executables. **The exact gating mechanism of the dialog (per-click vs per-file-type vs configurable) is undocumented and unverified in this research.** Reasonably inferred (not confirmed) that the dialog is per-click-at-minimum since there's no mention of a one-time acknowledgment in the changelog; but this could be wrong.
- **Either era:** the in-app PDF viewer and image/video/audio inline render are separate from the `openPath` path — those are renderable types that never reach the OS delegation layer. This is INFERRED from the architecture (Obsidian inline-renders these) rather than explicitly documented.

The correction in `editor-asset-embed-patterns-across-universe/evidence/d9-click-behavior.md` is the authoritative statement for editor-report readers; this evidence file owns the closer Obsidian-limits investigation.

---

## Sources

**Obsidian-specific:**
- [Obsidian Changelog](https://obsidian.md/changelog/)
- [Obsidian 1.12.2 Desktop (Early access) release notes](https://obsidian.md/changelog/2026-02-18-desktop-v1.12.2/) — warning added
- [Forum: No warnings when clicking on executable files](https://forum.obsidian.md/t/no-warnings-when-clicking-on-executable-files/83532) — pre-1.12.2 silent delegation
- [Forum: Opening attachments in external program freezes interface](https://forum.obsidian.md/t/opening-attachments-in-external-program-freezes-interface/24195)
- [Forum: Attachment file types that cannot be viewed](https://forum.obsidian.md/t/attachment-file-types-that-cannot-be-viewed-in-obsidian-are-not-listed-in-the-attachments-folder-in-obsidian/108663)
- [Forum: Detect all file types / dotfiles security concern](https://forum.obsidian.md/t/hidden-folders-dotfiles-not-showing-in-file-explorer-despite-detect-all-file-types-being-enabled/106685)
- [Obsidian Help: Symbolic links and junctions](https://help.obsidian.md/Files+and+folders/Symbolic+links+and+junctions)

**CVE databases:**
- [CVE-2023-27035 (NVD)](https://nvd.nist.gov/vuln/detail/CVE-2023-27035) — Canvas embed, not `shell.openPath`
- [Obsidian CVE list (cvedetails)](https://www.cvedetails.com/vulnerability-list/vendor_id-25830/Obsidian.html)

**Plugin evidence:**
- [phibr0/obsidian-open-with](https://github.com/phibr0/obsidian-open-with) — plugin that wraps `shell.openPath` without validation
- [Obsidian Plugin Submission Guidelines (DeepWiki)](https://deepwiki.com/obsidianmd/obsidian-plugin-docs/6.2-plugin-submission-guidelines) — `normalizePath()` for cross-platform correctness only

---

## Gaps / follow-ups

- Exact executable-extension list in Obsidian 1.12.2+ not published — would require disassembly or behavioral testing to enumerate.
- Pre-1.12.2 → 1.12.2 migration — whether enterprise Obsidian deployments have been updated. Irrelevant to OK but worth knowing if OK's threat model includes "our users are running the same Electron patterns Obsidian shipped in Feb 2026."
