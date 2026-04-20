# Evidence: D4 — Production App Shapes

**Dimension:** D4 (P0 Deep) — Production-app URL scheme shapes and hardening
**Date:** 2026-04-17
**Sources:** microsoft/vscode source, logseq/logseq source, Obsidian Help, Cursor docs, Figma Help, community research

---

## Key files / pages referenced

- `microsoft/vscode/src/vs/platform/url/electron-main/electronUrlListener.ts` — VS Code URL handler
- `logseq/logseq/src/electron/electron/url.cljs` — Logseq URL handler (Clojure)
- https://help.obsidian.md/Extending+Obsidian/Obsidian+URI — Obsidian URI spec
- https://cursor.com/docs/integrations/deeplinks — Cursor deeplinks
- https://cursor.com/docs/context/mcp/install-links — Cursor MCP install-links format
- https://help.figma.com/hc/en-us/articles/360039824334 — Figma desktop-app links
- https://deepwiki.com/rinadelph/123/5-cursor-deeplink — Cursor JWT validation

---

## Findings

### Finding: VS Code — `vscode://` + `vscode-insiders://`
**Confidence:** CONFIRMED
**Evidence:** `electronUrlListener.ts` source, https://code.visualstudio.com/api/advanced-topics/remote-extensions

- **URL shape:** `vscode://<publisher>.<extension-name>/<path>?<query>`. Extensions register handlers via `vscode.window.registerUriHandler`.
- **Trigger semantics:** Opens a window if none (cold-start). Focuses existing window if one exists. OAuth flows use the scheme to return tokens to running VS Code.
- **Insider channel:** Separate `vscode-insiders://` scheme — different executables get different schemes to avoid collisions. `productService.urlProtocol` is a per-build-variant config value.
- **Hardening:** `--` sentinel in Windows args, URI parse with try/catch (drop on failure), portable mode skips registration (to preserve OAuth flow state), embedded apps skip registration (handled at install time).
- **Cold-start queueing:** `ElectronURLListener` accepts `initialProtocolUrls` from constructor, retries delivery up to 10 times at 500ms intervals if no window is ready.

### Finding: Cursor — `cursor://` with JWT-signed payloads
**Confidence:** CONFIRMED
**Evidence:** https://cursor.com/docs/integrations/deeplinks, https://cursor.com/docs/context/mcp/install-links, https://deepwiki.com/rinadelph/123/5-cursor-deeplink

- **URL shape (MCP install):** `cursor://anysphere.cursor-deeplink/mcp/install?name=$NAME&config=$BASE64_ENCODED_CONFIG`
- **URL shape (prompt/rule sharing):** `cursor://` deep links for sharing prompts, commands, rules
- **Hardening:** "The cursor-deeplink system uses JSON Web Tokens (JWT) for authenticating and validating URI requests" — Cursor signs deep-link payloads with JWT, validates on receipt. Prevents tampering and replay of deep links (e.g. an MCP install link cannot be modified by an intermediary to inject a different server URL).
- **Notable pattern:** Base64-encoded config blob as a URL parameter — avoids URL-encoding issues with complex structured payloads.

### Finding: Obsidian — `obsidian://` with action-based dispatch
**Confidence:** CONFIRMED
**Evidence:** https://help.obsidian.md/Extending+Obsidian/Obsidian+URI, community tutorials

- **URL shapes:**
  - `obsidian://open?vault=<vault>&file=<path>` — open a file
  - `obsidian://new?vault=<vault>&name=<title>&content=<body>` — create a file
  - `obsidian://search?vault=<vault>&query=<q>` — search within vault
  - `obsidian://daily?vault=<vault>` — open today's daily note
  - `obsidian://hook-get-address` — inter-process hook
- **Action dispatch:** The URL's "action" is encoded in the host portion (`open`, `new`, `search`, `daily`, `hook-get-address`). The Advanced URI community plugin extends this pattern with more actions.
- **Hardening:** Fixed allowlist of actions. Unknown hosts are ignored. The `vault` parameter disambiguates across multiple installed vaults — required by the open action. Path parameters are scoped to the named vault directory (path-traversal scrubbing implicit in the vault-relative resolution).

### Finding: Logseq — `logseq://` with graph identifiers
**Confidence:** CONFIRMED
**Evidence:** `logseq/logseq/src/electron/electron/url.cljs`

- **URL shapes:**
  - `logseq://graph/<identifier>?page=<name>&block-id=<uuid>`
  - `logseq://x-callback-url/quickCapture?content=<text>&url=<u>&title=<t>`
  - `logseq://x-callback-url/invokeCommand?action=<a>&payload=<p>`
  - `logseq://new-window/<identifier>`
  - `logseq://handbook/<path>`
- **Dispatch:** Host-based routing (`x-callback-url`, `graph`, `new-window`, `handbook`). Known limitation: "URL scheme works on Desktop (Electron) only, and requires that Logseq should be OPEN and the target graph should be LINKED beforehand" — cold-start delivery when graph not yet registered produces an error notification (see logseq#5051, logseq#9562).
- **Hardening:** Graph-identifier validation before opening (unknown graph → `graph-identifier-error-handler` surfaces a user notification, does not crash).

### Finding: GitHub Desktop — `x-github-client://`
**Confidence:** CONFIRMED (URL shape); UNCERTAIN (hardening specifics)
**Evidence:** desktop/desktop#3852, various community references

- **URL shape:** `x-github-client://openRepo?url=<repo-url>&branch=<branch>&pr=<number>&filepath=<path>`
- GitHub Desktop was listed among apps affected by CVE-2018-1000006 before the Electron-level fix. The specific hardening GitHub Desktop added is not documented in the public issue thread; the CVE fix at the Electron version level was the primary mitigation.

### Finding: Figma — `figma://` desktop-app redirect pattern
**Confidence:** CONFIRMED
**Evidence:** https://help.figma.com/hc/en-us/articles/360039824334

- **URL shape:** `figma://file/<file-id>/<file-name>` — a direct translation of `https://www.figma.com/file/...` URLs with the scheme swapped. Figma's web interface can be configured to auto-redirect browser clicks to the `figma://` scheme when the desktop app is installed.
- **Trigger:** Opens file in existing desktop-app window (focuses it) or launches and navigates on cold-start.
- **Hardening specifics:** Not publicly documented.

### Finding: Slack — `slack://` (closed-source, patched for CVE-2018-1000006 in v3.0.3+)
**Confidence:** CONFIRMED (URL shape and CVE status); NOT FOUND (implementation details)
**Evidence:** https://www.cvedetails.com/vendor/22135/Slack.html, Electron security blog

- **URL shape:** `slack://channel?team=<team-id>&id=<channel-id>`, `slack://app?team=...&id=...`
- **Trigger:** Focuses running app; launches and navigates on cold-start.
- **CVE exposure:** Slack was publicly named as affected by CVE-2018-1000006; Slack for desktop became secure starting from version 3.0.3+. Post-2018 implementation details are closed-source.

### Finding: Discord — `discord://` (closed-source)
**Confidence:** CONFIRMED (URL shape)
**Evidence:** Various community refs

- **URL shape:** `discord://discord.com/channels/<server-id>/<channel-id>/<message-id>` — mirror of web URL with scheme swapped.
- Discord's implementation details are not public. Discord had a 2022 one-click exploit disclosed that involved RCE via Electron, though the vector was primarily XSS-to-RCE inside the renderer rather than deep-link argv injection (per malwarebytes.com coverage).

### Finding: Notion, Linear — scheme existence confirmed, implementation closed
**Confidence:** CONFIRMED (existence); NOT FOUND (details)

- **Notion** — `notion://` — redirects to deep-linked page. Closed-source. No public implementation details.
- **Linear** — `linear://` — opens issues and views. Closed-source. No public implementation details. (Linear's primary integration pattern is URL-matching in the browser extension rather than protocol-scheme deep-linking.)

---

## Reference App Patterns Summary Table

| App | Scheme | Trigger semantic | Hardening | Source availability |
|---|---|---|---|---|
| VS Code | `vscode://`, `vscode-insiders://` | Focus existing window, queue URLs if none; cold-start via argv on Windows/Linux | `--` sentinel, URI parse try/catch, portable-mode skip, retry loop with 10×500ms | Open (microsoft/vscode) |
| Cursor | `cursor://` | Focus existing window | JWT-signed payloads, base64-encoded config blob | Closed; docs public |
| Obsidian | `obsidian://` | Focus existing window, action dispatch in host | Fixed action allowlist, vault-scoped file params | Closed; URI spec public |
| Logseq | `logseq://` | Focus existing window; cold-start requires graph pre-linked | Host-based dispatcher, graph-identifier validation with user-visible error | Open (logseq/logseq) |
| GitHub Desktop | `x-github-client://` | Focus existing window | Affected by CVE-2018-1000006; fixed at Electron level | Open (desktop/desktop) |
| Figma | `figma://` | Open file in desktop app | Not publicly documented | Closed |
| Slack | `slack://` | Navigate to channel/team | Patched CVE-2018-1000006 in v3.0.3+ | Closed |
| Discord | `discord://` | Navigate to channel/message | Post-2022 hardening; unclear deep-link specifics | Closed |
| Notion | `notion://` | Navigate to page | Not publicly documented | Closed |
| Linear | `linear://` | Navigate to issue | Not publicly documented | Closed |

---

## Cross-cutting patterns observed

1. **Host as action verb.** Obsidian (`open`, `new`, `search`), Logseq (`graph`, `x-callback-url`, `new-window`), VS Code (`<publisher>.<extension>`) all use the URL host for dispatch rather than the first path segment. This matches RFC 3986 URI semantics and makes the URL look natural (`app://action?params`).
2. **Query-string parameters > path segments.** Every production app surveyed uses `?key=value` for payload rather than positional path segments. This sidesteps URL-encoding ambiguity on Windows (per Microsoft's guidance: non-encoded spaces in paths can break argv parsing).
3. **Explicit disambiguator parameter (vault / graph / team).** Any app with multiple workspaces requires the URL to specify which workspace. Obsidian rejects `obsidian://open?file=...` without a `vault` — prevents ambiguity when multiple vaults are open.
4. **Focus existing window over opening new.** All surveyed apps default to focusing an existing instance rather than spawning new windows. This matches user expectation (click-link-go-there) and sidesteps multi-window synchronization.
5. **URL parse failures silent-drop.** VS Code, Obsidian, Logseq all silently ignore unparseable URLs rather than surfacing an error — reduces the UX impact of malformed/attacker URLs.
6. **Payload signing (Cursor) is rare but growing.** Cursor is notable for JWT-signed deep links. Most apps trust URL parameters once parsed; Cursor's approach defeats link tampering for high-integrity operations (installing MCP servers).

## Gaps / follow-ups

- Comparison of how each app handles the "multiple projects open" case — does opening a URL for project B while project A has focus switch the focused project, open a new window, or prompt the user?
- Whether any production app exposes deep-link telemetry (which URLs are received) for user debugging.
