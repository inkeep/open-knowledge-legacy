# Evidence: D4 — Security + path-containment patterns

**Dimension:** Attack classes, CVE shortlist, path-containment pattern, IPC shape recommendation, consent UX for `shell.*` APIs in Electron.

**Date:** 2026-04-23
**Sources:** Electron docs, electron/electron security advisories, Doyensec, Cobalt, deepstrike, Benjamin Altpeter, muffin.ink (all web-fetched 2026-04-22/23).

---

## Attack-class table — `shell.openExternal(url)`

| Class | Platform | Mechanism | Confidence |
|---|---|---|---|
| Arbitrary protocol (`file:`, `smb:`, `javascript:`) | All | OS picks default handler by scheme; `file:///Applications/Calculator.app` launches binary on macOS | CONFIRMED |
| SMB/UNC drive-by | Windows | `\\attacker.com\share\procmon.exe` executes remote PE via SMB; dismissible warning dialog | CONFIRMED |
| `ms-msdt:` / `search-ms:` DDE-class | Windows | Prefilled diagnostic-tool parameters pull and run remote payloads | CONFIRMED |
| `.desktop` file execution | Linux (XFCE/xdg-open) | `file://...*.desktop` with `Exec=` line runs arbitrary command | CONFIRMED |
| `javascript:` URL | All | Historically executed in parent web context before Electron hardened scheme list | CONFIRMED (legacy) |
| NFS automount | macOS (pre-Catalina) | `file:/net/attacker/…` auto-mounted over NFS | CONFIRMED (mitigated) |

## Attack-class table — `shell.openPath(path)`

| Class | Mechanism | Confidence |
|---|---|---|
| Path traversal | Renderer supplies `../../../etc/passwd` or absolute path outside project root | CONFIRMED |
| Symlink following | Attacker plants symlink inside project root pointing to `/etc/…`; `path.resolve` alone does not dereference | CONFIRMED |
| Extension-sniff escalation | `.html` opens in default browser and gains `file://` origin (stored-XSS class); `.desktop` / `.scpt` / `.command` execute code | INFERRED (same OS handler table as openExternal) |
| TOCTOU | Validate path → attacker swaps symlink → `shell.openPath` follows new target | INFERRED (classic pattern; no Electron-specific CVE) |

---

## CVE & advisory shortlist

- **CVE-2020-25019** — Jitsi Meet Electron < 2.3.0. Arbitrary URL from third-party server routed to `shell.openExternal`; `smb:` + `.desktop` achieved RCE on Linux. Fix: HTTP(S) allowlist. ([writeup](https://benjamin-altpeter.de/jitsi-meet-electron-rce-shell-openexternal/))
- **CVE-2020-16608** — Electron app XSS → `shell.openExternal` pivot to RCE ([Medium](https://sghosh2402.medium.com/cve-2020-16608-8cdad9f4d9b4)).
- **CVE-2017-12581** — OS Command Injection class in Electron ([Snyk](https://security.snyk.io/vuln/SNYK-JS-ELECTRON-6016330)).
- **CVE-2026-34777** — iframe origin passed to `session.setPermissionRequestHandler` was top-level instead of iframe; affects `openExternal` permission decisions ([GitLab](https://advisories.gitlab.com/pkg/npm/electron/CVE-2026-34777/)).
- **Bananatron / muffin.ink (2024-2025)** — walking survey of shipped Electron apps still exposing unsafe `openExternal` after Doyensec's 2017 warning. CONFIRMED pattern persistence.

No CVE in this search was scoped specifically to `shell.openPath` — the class is characterised in security reviews but has not produced a tracked Electron-core CVE. Boundary between `openExternal` and `openPath` is thin in real-world exploits (both reach the OS handler table).

---

## Electron docs' security-checklist posture

CONFIRMED from [electron/tutorial/security](https://www.electronjs.org/docs/latest/tutorial/security):

- **`openExternal` recipe:** `if (isSafeForExternalOpen(url)) shell.openExternal(url)` — parse URL, check scheme against allowlist (`https:` only is conservative default; Jitsi's fix), then host-allowlist if applicable.
- **IPC sender validation:** "Validate the sender of all IPC messages" — check `event.senderFrame` (URL, origin) against an allowlist before acting; return `null` on mismatch. Access `senderFrame` properties **synchronously** — it may point to a different page once the task yields.
- **Baseline:** `contextIsolation: true` (default ≥ 12) + `nodeIntegration: false` (default ≥ 5) + `sandbox: true`. Both must be on; `nodeIntegration: false` alone is insufficient without context isolation.
- **NO specific validation recipe for `shell.openPath`** in official docs (CONFIRMED absence). That gap is filled by community research which converges on: resolve to canonical path, prefix-check an allowed root, allowlist extensions.
- **Fuses** ([docs](https://www.electronjs.org/docs/latest/tutorial/fuses)): `runAsNode`, `nodeOptions`, `nodeCliInspect`, `loadBrowserProcessSpecificV8Snapshot` — flip all off in packaged builds to kill `ELECTRON_RUN_AS_NODE` / `NODE_OPTIONS` / `--inspect` escape hatches that renderer-compromise chains use.

---

## Path-containment sketch (pattern, not production)

```ts
// PATTERN — illustrative. Audit, adapt, test before shipping.
import { realpath } from 'node:fs/promises';
import * as path from 'node:path';
import { shell } from 'electron';

const ALLOWED_ROOTS: readonly string[] = [/* canonical realpath'd roots */];
const ALLOWED_EXTS = new Set(['.png','.jpg','.jpeg','.gif','.webp','.svg','.pdf','.mp4','.mp3']);

async function openProjectAsset(requestedPath: string): Promise<void> {
  // 1. Reject absolute + traversal early — cheap, informative error.
  //    Defends: naive "../../../etc/passwd" before any disk I/O.
  if (path.isAbsolute(requestedPath) || requestedPath.includes('\0')) throw new Error('invalid path');

  // 2. Resolve against a SINGLE trusted root (main-process state, not IPC payload).
  //    Defends: renderer supplying its own "root" to sidestep the check.
  const root = ALLOWED_ROOTS[0];
  const joined = path.resolve(root, requestedPath);

  // 3. Canonicalise — follows symlinks, resolves '.'/'..', normalises case on mac/win.
  //    Defends: symlink-escape (attacker plants link inside root pointing out).
  //    `realpath` throws ENOENT on missing target → fail closed.
  const canonical = await realpath(joined);

  // 4. Prefix-check AFTER realpath, with trailing separator to reject sibling-prefix.
  //    Defends: "/projects/foo-evil/" matching root "/projects/foo".
  const rootCanonical = await realpath(root);
  const rootWithSep = rootCanonical.endsWith(path.sep) ? rootCanonical : rootCanonical + path.sep;
  if (canonical !== rootCanonical && !canonical.startsWith(rootWithSep)) throw new Error('outside root');

  // 5. Extension allowlist — defends: `.html` (stored-XSS via default browser),
  //    `.desktop`/`.scpt`/`.command`/`.exe`/`.bat` (arbitrary code via OS handler).
  if (!ALLOWED_EXTS.has(path.extname(canonical).toLowerCase())) throw new Error('extension not allowed');

  // 6. Hand off AFTER all checks — no re-resolution inside shell.openPath.
  //    (Residual TOCTOU: symlink could be swapped between realpath and openPath.
  //     For stronger guarantees, `open()` with O_NOFOLLOW then copy to trusted
  //     tempdir and openPath that. Most apps accept the TOCTOU window.)
  const err = await shell.openPath(canonical);
  if (err) throw new Error(err);
}
```

**Defence rationale inline.** Known residual: step 6 TOCTOU gap. Apps needing hard isolation (O_NOFOLLOW + fd-based handoff, or copy-to-tempdir) layer that on; Electron's `shell.openPath` takes a string, so full TOCTOU closure requires a wrapper.

## `shell.openExternal` URL sketch

```ts
// PATTERN.
function isSafeForExternalOpen(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (!['https:', 'http:', 'mailto:'].includes(u.protocol)) return false;
  if (u.username || u.password) return false; // block `https://paypal.com@evil` phishing
  return true;
}
```

OK's desktop repo already encodes this pattern — `packages/desktop/src/main/shell-allowlist.ts` (D47: `https | http | mailto | openknowledge`). Matches Jitsi 2.3.0 fix + Electron docs recommendation.

---

## IPC shape recommendation

### Renderer → main request

```ts
// preload.ts — contextBridge exposes a NAMED operation, not a raw path.
contextBridge.exposeInMainWorld('ok', {
  openAsset: (projectRelative: string) => ipcRenderer.invoke('ok:open-asset', projectRelative),
});

// main.ts
ipcMain.handle('ok:open-asset', async (e, projectRelative: unknown) => {
  // A. Origin check — SYNCHRONOUS, before any await.
  if (!isTrustedFrame(e.senderFrame)) return { ok: false, error: 'untrusted-sender' };
  // B. Type-guard — renderer is untrusted.
  if (typeof projectRelative !== 'string' || projectRelative.length > 4096)
    return { ok: false, error: 'bad-payload' };
  // C. Resolve + validate using main-process roots (steps 1-5 above).
  // D. Call shell.openPath on the canonical path.
});
```

**Key decisions (CONFIRMED from Electron docs + Doyensec):**

- **Renderer sends a project-relative string, not an absolute path and not a file handle.** Renderer must not dictate the trust root; main owns it.
- **`ipcMain.handle` over `ipcMain.on`** when renderer expects a reply — `handle` returns a promise to the specific invoker and rejects cleanly. `on` + `webContents.send` is coarser and easier to misuse.
- **Named channels (`'ok:open-asset'`), not generic `'exec'` / `'invoke'`.** Doyensec's preload-subversion research (2019) targets over-broad IPC surfaces; granular channels shrink the XSS-to-RCE pivot space.
- **`contextBridge.exposeInMainWorld` with minimal verb set.** Never expose `ipcRenderer.invoke` directly; never expose `shell` or `require`.
- **Synchronous `senderFrame` access.** Late access may return `null` or a different frame per Electron's own docs.
- **`sandbox: true`** on every `BrowserWindow`. Sandboxed renderer cannot use `shell.*` even if `require` leaks.

---

## Consent UX patterns

INFERRED from Electron docs + muffin.ink survey + common patterns in VS Code / Slack / Discord / Obsidian:

- **`openExternal` on user-click of a rendered link:** one-time "Open in your default browser?" modal on first click of a given host, remember per-host or per-session.
- **`openPath` on project-local asset** (e.g. "Show in Finder"): generally no per-click prompt if the path has been through containment. The containment IS the consent model.
- **"Reveal in Finder" vs "Open with default app"** are distinct verbs. Revealing is strictly safer (no handler dispatch). Offer Reveal first, Open behind an extra click for risky extensions.
- **User-gesture laundering:** Electron does not natively forward the "this came from a user click" signal across IPC. Anything that crosses `ipcRenderer.invoke` has already been laundered of its user-activation bit. Treat every IPC-arriving `openPath` request as renderer-initiated for threat-model purposes.
- **Executable extensions** (`.exe`, `.bat`, `.app`, `.desktop`, `.command`, `.scpt`, `.sh`, `.ps1`) should NEVER round-trip through `openPath` from an IPC path — blocklist at the extension step. If UX needs them, require `dialog.showOpenDialog` which never takes a renderer-supplied path.

---

## Sources

- [Electron Security Checklist](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron Fuses](https://www.electronjs.org/docs/latest/tutorial/fuses)
- [shell API reference](https://www.electronjs.org/docs/latest/api/shell)
- [ipcMain](https://www.electronjs.org/docs/latest/api/ipc-main)
- [Electron security advisories index](https://github.com/electron/electron/security/advisories)
- [Doyensec — Electron APIs Misuse (2021)](https://blog.doyensec.com/2021/02/16/electron-apis-misuse.html)
- [Doyensec — Subverting Electron Apps via Insecure Preload (2019)](https://blog.doyensec.com/2019/04/03/subverting-electron-apps-via-insecure-preload.html)
- [Doyensec — Modern Alchemy: XSS into RCE (2017)](https://blog.doyensec.com/2017/08/03/electron-framework-security.html)
- [Electronegativity OPEN_EXTERNAL_JS_CHECK](https://github.com/doyensec/electronegativity/wiki/OPEN_EXTERNAL_JS_CHECK)
- [Benjamin Altpeter — Many paths to RCE via openExternal](https://benjamin-altpeter.de/shell-openexternal-dangers/)
- [Benjamin Altpeter — CVE-2020-25019 Jitsi writeup](https://benjamin-altpeter.de/jitsi-meet-electron-rce-shell-openexternal/)
- [Cobalt — Common Misconfigurations in Electron Apps Part 1](https://www.cobalt.io/blog/common-misconfigurations-electron-apps-part-1)
- [deepstrike — Penetration Testing Electron Applications](https://deepstrike.io/blog/penetration-testing-of-electron-based-applications)
- [muffin.ink — Bananatron: state of Electron app security](https://muffin.ink/blog/bananatron/)
- [Electron CVE list (cvedetails)](https://www.cvedetails.com/vulnerability-list/vendor_id-17824/product_id-44696/Electronjs-Electron.html)
- [CVE-2026-34777 — iframe origin to permission handler](https://advisories.gitlab.com/pkg/npm/electron/CVE-2026-34777/)
