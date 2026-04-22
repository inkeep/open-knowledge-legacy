# Evidence: F5 — `claude-cli://` complete parameter surface (2026-04-21 follow-up)

**Dimension:** Material correction to D3 (Claude Code CLI). The CLI DOES register a prompt-bearing URL scheme (missed in passes 1+2). Full parameter set extracted from CLI source.
**Date:** 2026-04-21
**Sources:** code.claude.com/docs/en/settings (primary docs); `@anthropic-ai/claude-code@2.1.104` npm tarball — `cli.js` parser at line ~8439 (`$K5(q)`), Info.plist at ~8468, Linux `.desktop` at ~8475, `handleDeepLinkUri` at ~16795, `--handle-uri` argv dispatch at ~17011; CHANGELOG.md at anthropics/claude-code; local macOS probes

---

## Why this file exists

Pass 1 + 2 reported "Claude Code CLI has no URL scheme of its own" — citing Issue #26952 (which was about Claude *Desktop*, not the CLI). That was wrong. The user surfaced the finding by pointing to [code.claude.com/docs/en/settings](https://code.claude.com/docs/en/settings) where `disableDeepLinkRegistration` documents `claude-cli://open?q=` as the deep-link primitive. Pass 3 then asked: "what other parameters exist? can I set working directory?"

Answer: **`cwd` works** (confirmed in source), plus an undocumented `repo` param. No others. No path variants beyond `open`.

---

## The complete parameter surface

Extracted from `@anthropic-ai/claude-code@2.1.104` `cli.js` — parser function `$K5(q)`:

```js
// Reconstructed from the minified source
function $K5(url) {
  if (url.hostname !== "open")
    throw Error(`Unknown deep link action: "${url.hostname}"`);

  const cwd   = url.searchParams.get("cwd")  ?? undefined;
  const repo  = url.searchParams.get("repo") ?? undefined;
  const query = url.searchParams.get("q");

  // ... validation (length limits, absolute-path check, repo regex) ...

  return { query, cwd, repo };
}
```

### All three params, fully characterized

| Param | Type | Status | Constraints | Source evidence |
|---|---|---|---|---|
| **`q`** | string | **CONFIRMED, documented** | Max **5,000 chars** (after decode). Multi-line via `%0A`. | [settings docs](https://code.claude.com/docs/en/settings); CHANGELOG v2.1.88 raised limit; v2.1.91 added multi-line |
| **`cwd`** | absolute path | **CONFIRMED, undocumented** | Must start `/` (macOS/Linux) or Windows drive letter. Max **4,096 chars**. No control characters. Validated by `handleDeepLinkUri`. | cli.js line ~8439 parser + ~16795 handler |
| **`repo`** | `owner/repo` string | **CONFIRMED, undocumented** | Regex `^[\w.-]+\/[\w.-]+$`. Fallback when `cwd` absent: resolves to local clone; if no clone found, drops to `$HOME`. | cli.js line ~8439 parser |

### Params that do NOT work

Full negative evidence from source search (zero occurrences in parser):

| Candidate | Result | Notes |
|---|---|---|
| `session` | NOT supported | `session=` only appears on the Desktop scheme `claude://resume?session=...`. Different scheme, different parser. |
| `model` | NOT supported | Not parsed. |
| `system` / `system-prompt` | NOT supported | Not parsed. |
| `permission-mode` | NOT supported | Not parsed. |
| `sandbox` | NOT supported | Not parsed. |
| `prompt` (Cursor/VS-Code naming) | NOT supported | Param name is **`q`**, not `prompt`. Cross-tool interop hazard. |

### Endpoint variants

Only `claude-cli://open?…` works. Parser throws on any other hostname:

```js
if (url.hostname !== "open") throw Error(`Unknown deep link action: "${url.hostname}"`);
```

- `claude-cli://resume?…` — **NOT supported** (resume is Desktop, not CLI).
- `claude-cli://new?…`, `claude-cli://chat?…`, etc. — **NOT supported**.

---

## Canonical `openWithAgent` shape for Claude Code CLI (finalized)

```ts
const url = `claude-cli://open?cwd=${encodeURIComponent(dir)}&q=${encodeURIComponent(prompt)}`;
shell.openExternal(url);
```

Preconditions:
- `dir` must be absolute (`/Users/.../project` — not `~/project` or relative).
- `prompt` ≤ 5,000 chars after encoding (URL-encoding inflates bytes).
- `claude-cli:` in `shell-allowlist.ts` allowlist.
- Claude Code CLI installed AND has been run at least once (registration happens on CLI startup).

Fallback when prompt > 5K: drop to `spawn("claude", ["-p", prompt], { cwd: dir })` for headless, or `spawn-terminal` for interactive TUI.

---

## Platform registration — how the OS learns `claude-cli://`

The CLI's `registerProtocolHandler` function runs at startup (gated by `disableDeepLinkRegistration` ≠ `"disable"`). Three different per-OS paths:

### macOS — separate `.app` bundle

Installs at **`~/Applications/Claude Code URL Handler.app/`** (user-local `~/Applications/`, NOT system `/Applications/`). Confirmed via Issue [#41015](https://github.com/anthropics/claude-code/issues/41015) complaint about the hardcoded install path. Bundle id: `com.anthropic.claude-code-url-handler`.

`Info.plist`:
```xml
<key>LSBackgroundOnly</key><true/>
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLName</key><string>Claude Code Deep Link</string>
    <key>CFBundleURLSchemes</key>
    <array><string>claude-cli</string></array>
  </dict>
</array>
```

`CFBundleExecutable` is a symlink to the real `claude` binary. Registration calls Launch Services `lsregister -R` on the bundle. **Auto-recreates every 24 hours** — deletion persists ≤ 86,400,000 ms.

### Linux — `.desktop` file

Writes `~/.local/share/applications/claude-code-url-handler.desktop`:
```
MimeType=x-scheme-handler/claude-cli;
Exec="<path-to-claude>" --handle-uri %u
```

Then runs `xdg-mime default claude-code-url-handler.desktop x-scheme-handler/claude-cli`. Respects `XDG_DATA_HOME`.

### Windows — registry

Writes user-level registry key:
```
HKEY_CURRENT_USER\Software\Classes\claude-cli
  (Default) = "URL:Claude Code URL Handler"
  URL Protocol = ""
  shell\open\command\(Default) = "<path-to-claude.exe>" --handle-uri "%1"
```

---

## Cold-launch behavior

When a URL fires and the CLI isn't currently running:
1. OS routes `claude-cli://open?…` to the registered handler.
2. Handler spawns `claude --handle-uri <url>`.
3. `claude` main detects `--handle-uri` in argv, calls `handleDeepLinkUri(url)`.
4. Handler parses via `$K5`, resolves `cwd` (or `repo` → local clone → `$HOME`), then calls `x25(process.execPath, { query, cwd, repo, lastFetchMs })`.
5. `x25` **opens a new terminal window** via the detected terminal emulator and runs `claude` there with prompt pre-filled + cwd set.
6. Fallback error when no terminal detected: `"Failed to open a terminal. Make sure a supported terminal emulator is installed."`

macOS-specific: `handleUrlSchemeLaunch` fires when the URL-Handler `.app` bundle itself is launched (detected via `__CFBundleIdentifier === "com.anthropic.claude-code-url-handler"`); waits up to 5s for a URL event via the native `url-handler-napi` package's `waitForUrlEvent()`.

---

## Version history

Traced via [anthropics/claude-code CHANGELOG.md](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md):

| Version | Change |
|---|---|
| ≤ 2.1.83 | First explicit changelog reference — `disableDeepLinkRegistration` setting added "to prevent `claude-cli://` protocol handler registration." Scheme predates this entry (shipped quietly). |
| ~2.1.84–90 | Linux: respect `XDG_DATA_HOME` in `.desktop` path. |
| ~2.1.86 | Deep links open "in your preferred terminal" instead of whichever was first. |
| ~2.1.88 | `q` limit raised to **5,000 chars**; added scroll-to-review warning for long pre-filled prompts. |
| ~2.1.90 | Fixed: `claude-cli://` deep links not opening on macOS. |
| 2.1.91 | Added multi-line prompt support (`%0A` no longer rejected). |
| 2.1.104 (stable) / 2.1.116+ (latest 2026-04-21) | Current. |

Scheme is **new within the past ~3–4 months** (early 2026). `cwd` and `repo` never appear in any changelog entry — they shipped silently. Confidence: medium on introduction date (can't pin first commit without full git log on private repo), high on current surface.

---

## Peer-scheme comparison

| Dimension | `claude-cli://open?q=&cwd=&repo=` | `claude://resume?session=&cwd=` | VS Code ext `vscode://anthropic.claude-code/open?prompt=&session=` | Cursor `cursor://anysphere.cursor-deeplink/prompt?text=` |
|---|---|---|---|---|
| Target | Claude Code CLI (TUI in new terminal) | Claude Desktop app | VS Code extension | Cursor app |
| Endpoint | `open` (only) | `resume` (observed), maybe others | `open` | `prompt`, `command`, `rule`, `mcp/install` |
| Prompt param | **`q`** | not supported | **`prompt`** | **`text`** |
| Working dir | **`cwd`** (absolute) | **`cwd`** (absolute) | implicit (workspace) | implicit (focused window) |
| Session resume | not supported | **`session`** | **`session`** | not supported |
| Repo shortcut | **`repo`** (owner/repo) | no | no | no |
| Prompt cap | **5,000** chars | — | — | **8,000** chars |
| User review before exec | New terminal, user sends manually | — | Pre-fills prompt field | "Never trigger automatic execution" |

**Interop hazard.** Three different prompt-param names across sister tools (`q` / `prompt` / `text`). The `openWithAgent` wrapper needs to map `prompt` → the right param per agent.

---

## Anthropic GitHub issues referencing the scheme

- [#29145](https://github.com/anthropics/claude-code/issues/29145) — "Add URI handler for opening new sessions programmatically" — **likely the tracking issue that produced `claude-cli://`**.
- [#41015](https://github.com/anthropics/claude-code/issues/41015) — "Allow configuring or disabling the URL Handler app install location" — documents the hardcoded `~/Applications/` install path + 24h auto-recreation (corporate IT blocker).
- [#26197](https://github.com/anthropics/claude-code/issues/26197) — `/desktop` Windows `&` cmd.exe escape bug (on the peer `claude://` scheme; illustrative of URL-handler edge cases).
- [#26952](https://github.com/anthropics/claude-code/issues/26952) — Claude Desktop custom-URL-scheme filter (the red-herring issue that misled pass 1).
- [#32687](https://github.com/anthropics/claude-code/issues/32687) — VS Code `vscode://anthropic.claude-code/open` URI handler missing from integration docs (same doc-gap pattern as `claude-cli://`).
- [#19023](https://github.com/anthropics/claude-code/issues/19023) — "URL parameters for Claude Code on the Web" (precursor advocacy; closed 2026-02-27).
- [#42000](https://github.com/anthropics/claude-code/issues/42000) — "Allow VS Code commands to accept a `prompt` parameter for extension-to-extension integration" (peer-feature request).

---

## Remaining UNCERTAINTY

- **Empirical confirmation of `cwd` + `repo` params.** Source-code-verified but not docs-stated — Anthropic could change/remove them. The `/spec` should include a runtime probe: try the URL with a known-existing dir; if it doesn't cd correctly, fall back to `cd && claude "<prompt>"` spawn.
- **Windows `cmd.exe` escape issue.** The peer-scheme `claude://` has a documented `&` escape bug (Issue #26197). The `claude-cli://` scheme likely has the same sensitivity when routed through `cmd /c start`. Use `shell.openExternal` (direct ShellExecute, no shell interpretation) to avoid.
- **Scheme coexistence with `Claude.exe` PATH shim on Windows.** Issue #25075 reports that Claude Desktop's installer hijacks the `claude` command. Does `claude-cli://` survive when Desktop is also installed? Likely yes (different URL scheme, different OS dispatch), but not verified.
- **Corporate IT policies.** Issue #41015 confirms the URL Handler `.app` install to `~/Applications/` is blocked in some managed macOS fleets. For those users, `claude-cli://` won't register — fall back to CLI spawn paths.

---

## Sources

- [code.claude.com/docs/en/settings — `disableDeepLinkRegistration`](https://code.claude.com/docs/en/settings) — accessed 2026-04-21 (primary docs; documents only `q`)
- [code.claude.com/docs/en/cli-reference — notable absence](https://code.claude.com/docs/en/cli-reference) — accessed 2026-04-21
- [code.claude.com/docs/en/desktop — no `claude-cli://` or analog](https://code.claude.com/docs/en/desktop) — accessed 2026-04-21
- [`@anthropic-ai/claude-code@2.1.104` on npm](https://www.npmjs.com/package/@anthropic-ai/claude-code) — minified `cli.js` parser + handler — accessed 2026-04-21
- [anthropics/claude-code CHANGELOG.md](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md) — accessed 2026-04-21
- [#29145 — URI handler tracking issue](https://github.com/anthropics/claude-code/issues/29145) — accessed 2026-04-21
- [#41015 — URL Handler install location](https://github.com/anthropics/claude-code/issues/41015) — accessed 2026-04-21
- [#26952 — Desktop scheme filter (scope clarifier)](https://github.com/anthropics/claude-code/issues/26952) — accessed 2026-04-21
- [#26197 — `/desktop` Windows cmd.exe bug](https://github.com/anthropics/claude-code/issues/26197) — accessed 2026-04-21
- [#32687 — VS Code URI handler doc gap](https://github.com/anthropics/claude-code/issues/32687) — accessed 2026-04-21
- [Cursor Deeplinks docs](https://cursor.com/docs/integrations/deeplinks) — accessed 2026-04-21
- [code.claude.com/docs/en/vs-code — VS Code URI](https://code.claude.com/docs/en/vs-code) — accessed 2026-04-21
