---
title: M4 — `openknowledge://` URL scheme (macOS) end-to-end
description: Close M4's DOD in the Electron app — register the custom URL scheme, handle macOS cold-start delivery via the queue-then-flush pattern, parse and validate URLs, route deep-links to the correct BrowserWindow. Unblocks M6's MCP previewUrl feature.
tags: [spec, desktop, electron, m4, url-scheme, deep-linking]
status: Draft — 2026-04-21
---

# M4 — `openknowledge://` URL scheme (macOS) end-to-end

**Milestone:** M4 of the [Electron desktop app](../2026-04-11-electron-desktop-app/SPEC.md) (§14). Parent spec is authoritative for all D-numbered decisions — this spec scopes the implementation PR that closes M4's DOD.

**Author:** Andrew (2026-04-21)
**Status:** Draft — not yet implemented.
**Depends on:** M2 (signed-DMG scaffolding, **shipped** PR #245). Packaged-build smoke requires a signed DMG; dev-mode smoke does not.
**Blocks:** M6 (MCP-returned previewUrl uses `openknowledge://` per D43 — M6 cannot complete the Claude-Desktop-E2E smoke without this scheme working).
**Parallelizable with:** M3 (auto-update, in flight on another workstream) and M5 (keyring packaged E2E). No shared files; no shared decisions.

---

## 1) Problem statement

The parent Electron spec LOCKED D43 (`openknowledge://` URL scheme for deep-linking + MCP previewUrl) and D46 (protocol registration + `--` sentinel CVE-2018-1000006 mitigation + macOS queue-then-flush) on 2026-04-17. M2 shipped the signed-DMG scaffolding. What's missing:

- **Runtime handler.** `packages/desktop/electron-builder.yml` already declares `protocols: [{ name: 'Open Knowledge URL', schemes: [openknowledge], role: Editor }]` — so macOS emits `CFBundleURLTypes` into the packaged `Info.plist`. But nothing in `packages/desktop/src/main/` registers the `open-url` handler, parses incoming URLs, or routes them to a BrowserWindow.
- **Cold-start timing.** [electron/electron#32600](https://github.com/electron/electron/issues/32600) confirms that `open-url` on macOS can fire BEFORE `app.whenReady()`. D46 specifies the VS Code `ElectronURLListener` queue-then-flush pattern (10 × 500ms retries). Not yet implemented.
- **MCP handshake.** Per D43, the server-side MCP `preview-url.ts` helper detects Electron origin via `OK_ELECTRON_PROTOCOL_HOST=1` (set at utility fork) → returns `openknowledge://open?project=<realpath>&doc=<docName>` instead of `http://localhost:3000/<doc>`. The env var is not yet set anywhere.

Without this milestone, M6's end-to-end "open Claude Desktop → Claude clicks the returned previewUrl → OK.app focuses the project + doc" flow cannot work.

## 2) Goals

- **G1.** Clicking `openknowledge://open?project=<path>&doc=<docName>` from any surface (Terminal `open`, macOS hyperlink, another app's delegation) routes the user to the right BrowserWindow for the named project, with the renderer navigated to the named doc. Works in both **cold-start** (app not running) and **warm** (app already running) cases.
- **G2.** The macOS cold-start race (`open-url` fires before `whenReady`) is neutralized via the D46 queue-then-flush pattern. Zero lost URLs in Playwright smoke testing under `_electron.launch({ args: [url] })`.
- **G3.** URL validation is layered — malformed URLs silent-drop, path-traversal in `project` query param rejected, unknown hosts (anything other than `open`) silent-drop. No attack surface grows.
- **G4.** `OK_ELECTRON_PROTOCOL_HOST=1` is set at utility-process fork time so `preview-url.ts` (server package) emits the `openknowledge://` URL shape for MCP consumers when the server runs inside Electron. CLI / bunx consumers continue to receive `http://localhost:<port>/...`.
- **G5.** `shell.openExternal` scheme allowlist (`https`, `http`, `mailto`, `openknowledge`) is enforced at the preload boundary per D47 — a renderer attempt to `window.okDesktop.openExternal('file:///etc/passwd')` or similar is rejected.

## 3) Non-goals

- **[NEVER] NG1.** Windows `setAsDefaultProtocolClient` runtime registration. Per D51 (macOS-only v0), Windows is deferred. The D43/D46 Windows branches are specified but guarded with `process.platform === 'win32'` no-ops. Re-enter scope when the parent spec's D51 promote trigger fires.
- **[NEVER] NG2.** Linux `x-scheme-handler/openknowledge` MimeType registration. Same rationale as NG1.
- **[NOT NOW] NG3.** Non-project-scoped URLs (e.g., `openknowledge://settings`, `openknowledge://help`). Only the `open` host is implemented — `project` + `doc` query params are the full payload. Future actions can land additively without breaking this release.
- **[NOT NOW] NG4.** Deep links carrying authenticated payloads (signed JWTs, OAuth callbacks). If we ship GitHub Device Flow via a URL callback later (currently PR #166 uses stdin/browser polling), that's a separate milestone. Silent-drop malformed stays the correctness floor until then.
- **[NEVER] NG5.** Changing the `openknowledge://` URL shape after this milestone merges without a corrigendum in the D43 decision entry. The shape is part of the MCP contract M6 depends on.

## 4) Scope

One PR. New files + surgical edits to existing desktop main/preload code.

| File | Change |
|---|---|
| `packages/desktop/src/main/url-scheme.ts` | **NEW** — `registerProtocolHandler()`, `parseOpenKnowledgeUrl()`, `queueUrlDelivery()`, `flushQueuedUrls()`. Pure-functional URL parsing exported for unit tests. |
| `packages/desktop/src/main/url-scheme.test.ts` | **NEW** — Bun unit tests for `parseOpenKnowledgeUrl` (valid + malformed + path-traversal fixtures). |
| `packages/desktop/src/main/index.ts` | Wire `app.on('will-finish-launching')` to call `registerProtocolHandler(deps)` BEFORE `app.whenReady()`. Pass `openProject()` + `focusWindowForProject()` from window-manager as deps so URL parsing layer stays pure. |
| `packages/desktop/src/main/window-manager.ts` | Add `focusWindowForProject(projectPath): BrowserWindow \| null` — returns existing window if the project is already open, null otherwise. Existing `createProjectWindow` is the find-or-spawn complement. |
| `packages/desktop/src/utility/server-entry.ts` | Set `process.env.OK_ELECTRON_PROTOCOL_HOST = '1'` BEFORE calling `bootServer(...)`. This is the flag `preview-url.ts` reads. |
| `packages/server/src/mcp/tools/preview-url.ts` (OR wherever the helper lives today) | Add env-var check: `if (process.env.OK_ELECTRON_PROTOCOL_HOST === '1') return openknowledgeUrl(...)`. Fallback to existing HTTP URL. |
| `packages/desktop/src/shared/shell-allowlist.ts` | Already exists (per D47 implementation). Verify `openknowledge` is in the list; add if missing. |
| `packages/desktop/tests/smoke/deep-link.e2e.ts` | **NEW** — Playwright smoke: `_electron.launch({ args: ['openknowledge://open?project=/tmp/test&doc=a.md'] })` → assert the renderer navigates to `a.md` in the right window. Cold-start delivery case. |
| `packages/desktop/README.md` | New "Deep linking" section documenting the URL shape + `open openknowledge://...` terminal command for manual smoke. |

**No changes to** `electron-builder.yml` (protocols already declared at M1).

## 5) Acceptance criteria

| # | Criterion | Verification |
|---|---|---|
| AC1 | `parseOpenKnowledgeUrl('openknowledge://open?project=/abs/path&doc=foo.md')` returns `{ host: 'open', project: '/abs/path', doc: 'foo.md' }`. `parseOpenKnowledgeUrl('openknowledge://open?project=../../etc/passwd&doc=x')` returns `null` (path-traversal rejected). `parseOpenKnowledgeUrl('openknowledge://delete?...')` returns `null` (unknown host). | Unit tests in `url-scheme.test.ts`. |
| AC2 | `registerProtocolHandler()` attaches `app.on('open-url', ...)` inside `app.on('will-finish-launching')`, NOT `whenReady()`. The listener queues URLs received before `whenReady` fires; `flushQueuedUrls()` drains the queue after the first window is ready, with 10 × 500 ms retries if no window exists yet. | Code inspection + Playwright cold-start smoke (AC7). |
| AC3 | Cold-start case: `open -a "Open Knowledge" --args openknowledge://open?project=/tmp/proj&doc=a.md` (when app is not running) → OK launches → BrowserWindow opens scoped to `/tmp/proj` → renderer navigates to `a.md` → window is focused. | Manual smoke via terminal. |
| AC4 | Warm case: app already open with `/tmp/proj` window → same URL fires → existing window focused + renderer navigates. Does NOT spawn duplicate window. | Manual smoke via terminal. |
| AC5 | Warm case, different project: app open with `/tmp/projA` → `openknowledge://open?project=/tmp/projB&doc=x.md` → **new** window spawned for `/tmp/projB` (D24: every project pick spawns a new window). | Manual smoke via terminal. |
| AC6 | Malformed URL (`openknowledge://open?doc=a.md` — missing `project`): silent-drop. No error dialog, no window spawned, a single `console.warn('[url-scheme] dropped malformed URL', ...)` log line. | Manual smoke. |
| AC7 | Playwright smoke `deep-link.e2e.ts` runs under `bunx playwright test`: `_electron.launch({ args: ['openknowledge://open?project=<tmp>&doc=<doc>'] })` → assert renderer URL hash ends with `<doc>` within 5 s. Proves the queue-then-flush pattern works. | `bunx playwright test packages/desktop/tests/smoke/deep-link.e2e.ts`. |
| AC8 | Utility-process fork sets `OK_ELECTRON_PROTOCOL_HOST=1`. MCP `preview-url.ts` (or equivalent) reads that env var: when set, returns `openknowledge://open?project=<realpath>&doc=<name>`; when unset (CLI/bunx), returns `http://localhost:<port>/...`. | Unit test on the helper + manual verification via `echo $OK_ELECTRON_PROTOCOL_HOST` in utility logs. |
| AC9 | `shell-allowlist.ts` allowlist includes `openknowledge`; a call via preload to `openExternal('openknowledge://open?project=/tmp&doc=x')` succeeds; `openExternal('file:///etc/passwd')` is rejected with a console error. | Preload test + manual renderer smoke. |
| AC10 | `bun run check` (canonical quality gate) green. `bunx playwright test packages/desktop/` (scoped to desktop) green. | CI gate. |

## 6) Design notes

### 6.1 URL parsing

Use `new URL(input)` (WHATWG-compliant parser). `parseOpenKnowledgeUrl` returns `null` on any of:

- `url.protocol !== 'openknowledge:'`
- `url.hostname !== 'open'`
- `url.searchParams.get('project')` is missing, empty, or contains `..` segments after `path.resolve()` normalization
- `url.searchParams.get('doc')` is missing, empty, or contains `..` segments

Path-traversal check: `path.resolve(project)` MUST equal the original input when normalized via `path.normalize()`. Anything resolving outside a realistic user directory (`/`, `/etc/`) is not validated here — window-manager's existing `openProject()` already validates project paths exist and are trust-registered.

### 6.2 Queue-then-flush

Pattern per [VS Code's `ElectronURLListener`](https://github.com/microsoft/vscode/blob/main/src/vs/platform/url/electron-main/electronUrlListener.ts):

```ts
const urlQueue: string[] = [];
let flushed = false;

app.on('will-finish-launching', () => {
  app.on('open-url', (event, url) => {
    event.preventDefault();
    if (flushed) routeUrl(url);
    else urlQueue.push(url);
  });
});

app.whenReady().then(async () => {
  for (let attempt = 0; attempt < 10 && urlQueue.length > 0; attempt++) {
    if (deps.anyWindowReady()) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  flushed = true;
  while (urlQueue.length > 0) routeUrl(urlQueue.shift()!);
});
```

`routeUrl(url)` calls `parseOpenKnowledgeUrl(url)` → if valid, `focusWindowForProject(project) ?? createProjectWindow(project)` → `window.webContents.send('ok:deep-link', { doc })`. Renderer already handles `ok:deep-link` via the existing IPC channel map (`packages/desktop/src/shared/ipc-events.ts` per the parent spec — verify during implementation).

### 6.3 Envvar propagation for MCP handshake

`packages/desktop/src/utility/server-entry.ts` runs inside `utilityProcess.fork`. Set the env var in the main process's `utilityProcess.fork({ env: { ...process.env, OK_ELECTRON_PROTOCOL_HOST: '1' } })` call — inheritance is explicit so a bunx/CLI invocation of the same server never accidentally sets it.

## 7) Known gaps / open questions

- **OQ-1.** The server-side `preview-url.ts` helper's exact current shape is not verified. If it already supports origin-switching via a different mechanism (config flag, constructor arg), use that instead of a new env var.
- **OQ-2.** Playwright's `_electron.launch({ args: [url] })` cold-start behavior on signed DMGs is not empirically verified. The parent spec's D46 LOCKED the queue-then-flush design based on VS Code's reference; our Playwright smoke will be the first same-repo validation.
- **OQ-3.** macOS URL delegation when the app is killed mid-launch (user fires two URLs in rapid succession during cold-start). Intended behavior: both URLs queue, flush-loop drains both. Verify during smoke.

## 8) Implementation sequence

1. Implement `url-scheme.ts` (pure functions) + unit tests. No Electron bindings at module top — same pattern as `menu.ts`.
2. Add `focusWindowForProject` to `window-manager.ts`.
3. Wire `registerProtocolHandler()` in `index.ts` inside `will-finish-launching`.
4. Set `OK_ELECTRON_PROTOCOL_HOST=1` in the utility fork env.
5. Add env-var check to `preview-url.ts` on the server side.
6. Playwright smoke.
7. README deep-linking section.
8. `bun run check` → push → request review.

## 9) Agent constraints

- **SCOPE:** URL scheme handling only. Touch `packages/desktop/` + the one `preview-url.ts` helper. Do NOT edit MCP tool implementations, auth flows, or unrelated renderer code.
- **EXCLUDE:** `electron-builder.yml` (already correct). Windows/Linux branches (D51 NOT NOW).
- **STOP_IF:** The signed-DMG Playwright smoke can't load the app because `_electron.launch` doesn't support custom URL scheme args on macOS (unverified). Fall back to `execSync('open "openknowledge://..."')` based smoke and document.
- **ASK_FIRST:** Any change to the `openknowledge://` URL shape (host, query param names). This is part of the M6 MCP contract.

---

## 10) Decision log

None in this spec — M4's decisions (D43, D46, D47, D51) were LOCKED in the parent spec on 2026-04-17. This spec implements them.

## 11) References

- [Parent: specs/2026-04-11-electron-desktop-app/SPEC.md](../2026-04-11-electron-desktop-app/SPEC.md) — D43 (URL scheme + MCP previewUrl), D46 (protocol registration + `--` sentinel + queue-then-flush), D47 (shell.openExternal allowlist), §14 M4 DOD.
- [reports/deep-linking-ai-desktop-apps-2026/REPORT.md](../../reports/deep-linking-ai-desktop-apps-2026/REPORT.md) — T4 research on URL-scheme patterns + CVE-2018-1000006 + VS Code queue-then-flush reference.
- [VS Code `ElectronURLListener`](https://github.com/microsoft/vscode/blob/main/src/vs/platform/url/electron-main/electronUrlListener.ts) — reference implementation for queue-then-flush.
- [electron/electron#32600](https://github.com/electron/electron/issues/32600) — cold-start `open-url` timing bug tracker.
