# Evidence: D7 — Security & encoding (URL-scheme payloads, argv injection, prompt trust)

**Dimension:** URL length, encoding, argv-injection class, modern CVEs
**Date:** 2026-04-21
**Sources:** Microsoft Learn, Apple Developer Forums, Node.js docs, SecureFlag, Proofpoint, Huntress, Positive Security, Electron docs

---

## Key files / pages referenced

- https://learn.microsoft.com/en-us/archive/blogs/ieinternals/url-length-limits — Windows ShellExecute URL limit
- https://learn.microsoft.com/en-us/troubleshoot/windows-client/shell-experience/command-line-string-limitation — cmd.exe limit
- https://developer.apple.com/forums/thread/677912 — macOS LaunchServices URL limit (community)
- https://nodejs.org/api/child_process.html — `spawn` / `exec` semantics
- https://knowledge-base.secureflag.com/vulnerabilities/code_injection/os_command_injection_nodejs.html — argv injection patterns
- https://positive.security/blog/ms-officecmd-rce — CVE-2021-43905 `ms-officecmd:`
- https://www.huntress.com/threat-library/vulnerabilities/cve-2022-30190 — CVE-2022-30190 Follina `ms-msdt:`
- https://borncity.com/win/2022/06/02/searchnightmare-windows-10-search-ms-uri-handler-0-day-exploit-mit-office-2019/ — SearchNightmare `search-ms:`
- https://www.proofpoint.com/us/blog/threat-insight/cursorjack-weaponizing-deeplinks-exploit-cursor-ide — CVE-2025-54133 / CVE-2025-54136 (Cursor)
- https://github.com/anthropics/claude-code/issues/26197 — Claude Desktop Windows `&` escape bug
- https://cursor.com/docs/integrations/deeplinks — Cursor 8000-char cap

---

## Findings

### Finding: URL-scheme payload size — Windows 2081, macOS ~2000 undocumented, Linux generous, Cursor self-limits to 8000
**Confidence:** CONFIRMED (Windows), UNCERTAIN (macOS), INFERRED (Linux)
**Evidence:** Electron docs, Microsoft Learn, Cursor docs

| Platform | Limit | Confidence | Source |
|---|---|---|---|
| Windows ShellExecute | **2,081 chars** (INTERNET_MAX_URL_LENGTH → ~2083 truncation) | CONFIRMED | Electron docs + MS Learn IE URL limits |
| Windows cmd.exe line | ~8,191 chars (separate from URL limit) | CONFIRMED | MS Learn command-line-string-limitation |
| macOS LaunchServices | Not documented; community reports ~2000 practical | UNCERTAIN | Apple forums thread 677912 |
| Linux xdg-open | Bounded by argv `ARG_MAX` (~128KB); `.desktop` handlers may truncate | INFERRED | xdg-open manpage + community |
| Cursor `cursor://` | **8,000 chars post-encode** | CONFIRMED | cursor.com/docs/integrations/deeplinks |

**Recommendation for `openWithAgent`:** target a **2,000-char URL ceiling** for cross-platform portability. Prompts >1,500 chars (after URL encoding) should use a different transport (stdin pipe to CLI or file-based handoff).

### Finding: `encodeURIComponent` is the canonical encoder; `#`, `&`, and newlines are the gotchas
**Confidence:** CONFIRMED
**Evidence:** WHATWG URL spec + anthropics/claude-code#26197

- `encodeURIComponent` correctly percent-encodes `#` (→ `%23`), `&` (→ `%26`), `?`, `=`, space, and non-ASCII.
- `#` is a fragment delimiter — some apps strip everything after an unencoded `#`. Always let `encodeURIComponent` handle it.
- **Windows `cmd /c start <url>` interprets `&` as command separator.** Real bug in Claude Desktop's Windows deep-link handling (Issue #26197). **Use `shell.openExternal` (no shell) instead of routing through `cmd /c start`.**
- Some apps decode only once; double-encoding breaks them. Don't pre-encode; call `encodeURIComponent` exactly once.
- Newlines: `%0A` (LF) survives encoding. CRLF (`%0D%0A`) may be normalized by LaunchServices on macOS — prompts with explicit line endings should standardize on LF.

### Finding: Argv-injection hierarchy — `spawn(cmd, argv, { shell: false })` is injection-safe; `exec(...)` and `spawn(..., { shell: true })` are not
**Confidence:** CONFIRMED
**Evidence:** Node.js docs, SecureFlag OS command injection NodeJS

| Pattern | Safety |
|---|---|
| `spawn(cmd, argv, { shell: false })` | **Safest.** argv passed directly to OS without shell interpretation. No metachar escaping needed. Example: `spawn("claude", ["-p", userPrompt])` is injection-proof regardless of `userPrompt` content. |
| `exec("claude -p " + userPrompt)` | **Unsafe.** Full shell. Any `;`, `&`, `|`, `$(...)`, backticks in `userPrompt` execute as shell. **Never do this with user input.** |
| `spawn(cmd, argv, { shell: true })` | **Unsafe.** Equivalent to `exec`. |
| `shell.openExternal(url)` | NOT subject to shell injection — calls OS APIs (`LSOpenCFURLRef` / `ShellExecuteExW` / `xdg-open`), not a shell. BUT the target app's URL parser may itself be vulnerable (see CVEs below). |

### Finding: Target app's URL parser is the real trust boundary — confirmed by modern CVEs
**Confidence:** CONFIRMED
**Evidence:** Proofpoint, Huntress, Positive Security, BornCity

| CVE | Scheme | Year | Impact |
|---|---|---|---|
| CVE-2021-43905 | `ms-officecmd:` | 2021 | Argv injection in Windows 10 Office UWP handler → drive-by RCE via malicious web page |
| CVE-2022-30190 "Follina" | `ms-msdt:` | 2022 | MSDT RCE via crafted URL in Office doc |
| SearchNightmare (no CVE) | `search-ms:` | 2022 | Windows Search URI handler abused with Office 2019 for RCE |
| **CVE-2025-54133** | `cursor://` | 2025 | Cursor deeplink allowed hiding command args from install dialog |
| **CVE-2025-54136** | `cursor://` (MCP install) | 2025 | Persistent-privilege MCP install via deeplink, survives restart |

**Class lesson:** An allowlist of outbound schemes is necessary but not sufficient. The target app's URL parser is the actual trust boundary. For `openWithAgent`:
- Treat `cursor://`, `claude://`, `vscode://`, etc. as "trusted enough because the user installed that app."
- Surface the full URL to the user before dispatching when the prompt exceeds N chars (the Cursor CVEs show that confirmation dialogs that don't display the full payload get weaponized).

### Finding: User-initiated launch of user-typed prompt is low risk; attacker-controlled prompts via a crafted link into our app are the meaningful threat
**Confidence:** INFERRED (from threat-model analysis)
**Evidence:** Combination of CursorJack Proofpoint analysis + Electron security guide

Trust boundaries:
- **User-authored prompt → user's Electron app → target agent**: low risk. The user is driving.
- **URL appears in OS event logs, shell history, recent-docs**: medium privacy risk. Prompts passed via URL are not secret.
- **Attacker-controlled prompt**: if an attacker can get our Electron app to call `openWithAgent(..., attackerPrompt)` — e.g., via a malicious MCP tool response or a clickjack scenario — the outbound allowlist mitigates, but the target app's parser is still the weakest link.

**Implication:** The `openknowledge://` scheme in this repo's `shell-allowlist.ts` is protection against malicious markdown inserting `ms-msdt:` / `search-ms:` / etc. into a link the user clicks. For `openWithAgent` specifically, we should add `cursor:`, `claude:`, `vscode:`, `codex:` (if it ever exists) to that allowlist — **and consider a user-confirm step in the middle when the prompt is long or the URL contains suspicious structure.**

---

## Negative searches (NOT FOUND)

- Searched for a canonical Apple docs page stating a LaunchServices URL max length → NOT FOUND. Community reports ~2000 is the only guidance.
- Searched for a `claude://` CVE specifically → NOT FOUND yet. `cursor://` has 2 assigned; Claude Desktop's deep-link surface is narrower, less attack surface to date.
- Searched for "Codex URL scheme CVE" → NOT FOUND. Codex does not register a URL scheme — no surface.

---

## Gaps / follow-ups

- **Policy question for `/spec`:** should `openWithAgent` surface a "Review URL before opening" dialog when prompt > 500 chars (or contains chars like `\n`, `<`, `>`)? Cursor CVEs suggest yes.
- **Verification of our allowlist:** do we need to add `cursor:`, `claude:`, `vscode:` to `packages/desktop/src/main/shell-allowlist.ts`? Currently only `openknowledge:` is there beyond the built-ins. Missing additions would cause `checkOutboundUrl` to return `{ ok: false, reason: "scheme-not-allowed: cursor:" }` for every agent invocation — blocker for v1.
- **Cursor deeplink CVE mitigation:** before dispatching a long `cursor://...prompt?text=...` URL, consider truncating and showing a "view full prompt" expando in our Electron UI. Protects the user from a malicious site that wrote the prompt into localStorage and triggers our app.
