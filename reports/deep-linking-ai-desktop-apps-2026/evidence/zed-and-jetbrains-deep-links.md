# Evidence: Zed Editor and JetBrains IDE Family — URL Schemes and Deep Links

**Dimension:** Extension of D3 (editor category) — Zed + JetBrains family
**Date:** 2026-04-16
**Sources:** github.com/zed-industries/zed (source code), zed.dev/docs, deepwiki.com (zed mirror), junie.jetbrains.com/docs, jetbrains.com help docs, JetBrains YouTrack, GitHub PRs, community blog / Medium articles

**Investigator note:** Neither Zed nor any JetBrains IDE is installed on this machine. All evidence below is from published source code, official docs, YouTrack issues, and merged GitHub PRs — no binary inspection. When findings rest on community reverse-engineering (e.g., `jetbrains-url-schemes` repo), that is flagged explicitly.

---

## Key sources

### Zed
- Source of truth for URL parsing: `crates/zed/src/zed/open_listener.rs` — [GitHub main](https://github.com/zed-industries/zed/blob/main/crates/zed/src/zed/open_listener.rs), raw file fetched 2026-04-16
- [zed.dev/docs/reference/cli](https://zed.dev/docs/reference/cli) — CLI flag reference
- [zed.dev/docs/remote-development](https://zed.dev/docs/remote-development) — documents `zed://ssh/...` link format
- [zed.dev/docs/all-actions](https://zed.dev/docs/all-actions) — `dev::OpenUrlPrompt`, `agent::NewThread`, `agent::NewExternalAgentThread`
- [zed.dev/docs/ai/external-agents](https://zed.dev/docs/ai/external-agents) — external agent launch (Claude/Codex/Gemini CLI via ACP)
- PR [zed-industries/zed#34862](https://github.com/zed-industries/zed/pull/34862) — "zed: Add support for `zed://agent` links" (merged 2025-07-22, maxdeviant)
- PR [zed-industries/zed#47959](https://github.com/zed-industries/zed/pull/47959) — "agent: Support initial prompt via `zed://agent` URL schema" (merged 2026-01-29, smitbarmase)
- Issue [zed-industries/zed#8482](https://github.com/zed-industries/zed/issues/8482) — "Support open file via URL" (LocatorJS compat request)
- [deepwiki.com/zed-industries/zed/8.2-acp-protocol-and-connection](https://deepwiki.com/zed-industries/zed/8.2-acp-protocol-and-connection) — ACP architecture notes
- [deepwiki.com/zed-industries/zed/12.6-message-editor-and-context](https://deepwiki.com/zed-industries/zed/12.6-message-editor-and-context) — `zed://agent/symbol`, `zed://agent/thread`, `zed://agent/diagnostics` as mention URIs

### JetBrains
- [jetbrains.com/help/toolbox-app/jetbrainsd.html](https://www.jetbrains.com/help/toolbox-app/jetbrainsd.html) — `jetbrainsd` daemon intercepts `jetbrains://`
- YouTrack [TBX-3965](https://youtrack.jetbrains.com/issue/TBX-3965) — "Documentation for Toolbox Reference URL Scheme" (open, no public docs)
- YouTrack [IDEA-65879](https://youtrack.jetbrains.com/issue/IDEA-65879) — "idea protocol handler to open files directly from a URL"
- [github.com/alanhe421/jetbrains-url-schemes](https://github.com/alanhe421/jetbrains-url-schemes) — community reverse-engineered catalog
- [medium.com/@alanhe421/understanding-jetbrains-url-scheme](https://medium.com/@alanhe421/understanding-jetbrains-url-scheme-4e315cd7cc63) — accompanying blog post
- [github.com/aik099/PhpStormProtocol](https://github.com/aik099/PhpStormProtocol) — historical record: native `phpstorm://` and `idea://` arrived in PhpStorm 8 EAP 138.190+
- [stefaanlippens.net/pycharm-protocol-handler.html](https://www.stefaanlippens.net/pycharm-protocol-handler.html) — `pycharm://open?file={f}&line={n}` format
- [junie.jetbrains.com/docs/parameters.html](https://junie.jetbrains.com/docs/parameters.html) — Junie CLI flag reference (includes `--acp`)
- [blog.jetbrains.com/junie/2026/04/junie-cli-inside-your-jb-ide/](https://blog.jetbrains.com/junie/2026/04/junie-cli-inside-your-jb-ide/) — Junie↔IDE integration announcement
- [github.com/JetBrains/mcp-jetbrains](https://github.com/JetBrains/mcp-jetbrains) — MCP bridge (deprecated; folded into 2025.2 IDEs, port `6365`)

---

## Part 1: Zed Editor

### Finding Z1: Zed registers `zed://` (and two neighboring schemes)
**Confidence:** CONFIRMED — source code
**Evidence:** `crates/zed/src/zed/open_listener.rs`, `OpenRequest::parse()` match chain (fetched raw from GitHub main, 2026-04-16). The parser recognizes three distinct schemes plus passthrough for `file://` and `ssh://`:

- `zed://` — primary scheme (documented below)
- `zed-cli://` — internal handshake from the bundled `zed` CLI binary to the desktop app (`OpenRequestKind::CliConnection(connect_to_cli(server_name)?)`)
- `zed-dock-action://` — dock menu action dispatch (`OpenRequestKind::DockMenuAction { index }`)
- `file://` and `ssh://` — accepted directly (not URL-scheme style, passed to `parse_file_path` / `parse_ssh_file_path`)

Protocol-client registration call site was not located in this pass, but Zed's `open_listener` runs on the main process and the `OpenRequest::parse()` function is reached by whichever OS mechanism (macOS `Info.plist` URL types, Linux `.desktop` MimeType, Windows registry) delivers the URL. Zed is Rust (not Electron), so there's no `setAsDefaultProtocolClient` — on macOS, scheme registration is via `Info.plist`'s `CFBundleURLTypes`.

### Finding Z2: Full `zed://` URL surface (enumerated from the parser)
**Confidence:** CONFIRMED — match arms read from `open_listener.rs`
**Evidence:** Every recognized `zed://*` prefix, verbatim from the Rust source:

| URL | Handler / `OpenRequestKind` | Source match arm |
|---|---|---|
| `zed://file<path>` | `parse_file_path(file)` | `url.strip_prefix("zed://file")` |
| `zed://ssh<path>` | rewritten to `ssh:/<path>`, then `parse_ssh_file_path` | `url.strip_prefix("zed://ssh")` |
| `zed://extension/<id>` | `OpenRequestKind::Extension { extension_id }` | `url.strip_prefix("zed://extension/")` |
| `zed://agent/shared/<uuid>` | `OpenRequestKind::SharedAgentThread { session_id }` (UUID validated) | `url.strip_prefix("zed://agent/shared/")` |
| `zed://agent` or `zed://agent?prompt=<text>` | `OpenRequestKind::AgentPanel { external_source_prompt }` | `url.strip_prefix("zed://agent")` |
| `zed://schemas/<path>` | `OpenRequestKind::BuiltinJsonSchema { schema_path }` | `url.strip_prefix("zed://schemas/")` |
| `zed://settings` / `zed://settings/` | `OpenRequestKind::Setting { setting_path: None }` | exact string match |
| `zed://settings/<path>` | `OpenRequestKind::Setting { setting_path: Some(..) }` | `url.strip_prefix("zed://settings/")` |
| `zed://git/clone?repo=<url>` | `parse_git_clone_url(..)` | `url.strip_prefix("zed://git/clone")` |
| `zed://git/commit/<sha>?repo=<url>` | `parse_git_commit_url(..)` | `url.strip_prefix("zed://git/commit/")` |
| Zed channel links (`https://zed.dev/channel/...`) | `parse_zed_link(&url, cx)` → `ZedLink::Channel` / `ZedLink::ChannelNotes` | fallthrough |

Unrecognized URLs log `log::error!("unhandled url: {}", url)` and are dropped. No `zed://open?file=...` — that specific shape is NOT supported; `zed://file<path>` is the file-open variant.

### Finding Z3: `zed://agent?prompt=<text>` is a first-class prompt-seeding deep link (shipped 2026-01)
**Confidence:** CONFIRMED — PR #47959 diff + PR #34862 precursor
**Evidence:** PR #34862 ([merged 2025-07-22](https://github.com/zed-industries/zed/pull/34862)) added the bare `zed://agent` route to open the Agent Panel. PR #47959 ([merged 2026-01-29](https://github.com/zed-industries/zed/pull/47959), description quoted verbatim) extended it:

> "Adds `zed://agent?prompt=<url_encoded_text>` URL support to open the Agent Panel with a pre-filled prompt."

The parser code, verbatim from `open_listener.rs` (as of 2026-04-16 `main`):

```rust
fn parse_agent_url(&mut self, agent_path: &str) {
    let external_source_prompt = agent_path.strip_prefix('?')
        .and_then(|query| {
            url::form_urlencoded::parse(query.as_bytes())
                .find_map(|(key, value)| (key == "prompt").then_some(value))
                .and_then(|prompt| ExternalSourcePrompt::new(prompt.as_ref()))
        });
    self.kind = Some(OpenRequestKind::AgentPanel { external_source_prompt });
}
```

Dispatch flow (from PR #47959 diff, `crates/zed/src/main.rs`):

```rust
OpenRequestKind::AgentPanel { initial_prompt } => {
    // ...workspace update...
    panel.update(cx, |panel, cx| {
        panel.new_external_thread_with_text(initial_prompt, window, cx);
    });
}
```

The prompt is wrapped in `ExternalAgentInitialContent::Text(String)` (new enum introduced in `crates/agent_ui/src/agent_ui.rs`):

```rust
pub enum ExternalAgentInitialContent {
    ThreadSummary(acp_thread::AgentSessionInfo),
    Text(String),
}
```

**This is directly analogous to Codex's `codex://new?prompt=` pattern** (see `codex-desktop-deep-links.md` Finding 2-3). Of the editor-class apps surveyed, only Codex Desktop, Zed, Cursor, and Claude Desktop expose a documented prompt-seeding URL entry point; Zed is the only OSS one among them.

### Finding Z4: `zed://agent/<...>` paths have a second, non-launching meaning — in-conversation mention URIs
**Confidence:** CONFIRMED — documented architecturally
**Evidence:** [DeepWiki "Message Editor and Context"](https://deepwiki.com/zed-industries/zed/12.6-message-editor-and-context) documents that ACP uses `zed://agent/...` URIs as **context references inside agent conversations**, not as external deep-links:

- `zed://agent/symbol/<name>?path=...#L10-20` — symbol reference
- `zed://agent/thread/<session_id>` — thread reference
- `zed://agent/diagnostics?include_errors=true` — diagnostics context
- `zed://agent/git-diff?base_ref=main` — git diff context

These are parsed by `MentionUri::parse` (internal type), not by `OpenRequest::parse`. A URL like `zed://agent/thread/abc` passed to the OS URL handler would NOT currently resolve — only `zed://agent/shared/<uuid>` is matched by the outer dispatcher. There is a namespace collision risk: the internal `MentionUri` scheme and the external `OpenRequest` scheme share the `zed://agent/` prefix but handle different subpaths. Relevant for agents reasoning about "what does this Zed URL do if I click it?"

### Finding Z5: `zed://ssh/[user@]host[:port]/<path>` is the documented remote-project deep link
**Confidence:** CONFIRMED — both docs and source
**Evidence:** [zed.dev/docs/remote-development](https://zed.dev/docs/remote-development): "use a link of the format: `zed://ssh/[<user>@]<host>[:<port>]/<path>`". Source-side, `url.strip_prefix("zed://ssh")` prepends `ssh:/` and forwards to `parse_ssh_file_path`. This is the rough analog to JetBrains Gateway's `jetbrains-gateway://` but simpler (no separate Gateway app).

### Finding Z6: `zed` CLI does NOT accept any agent/prompt flag — CLI bridge is file/dir only
**Confidence:** CONFIRMED — [CLI reference](https://zed.dev/docs/reference/cli) fetched 2026-04-16
**Evidence:** The documented flag set:

- `-w, --wait`, `-n, --new`, `-a, --add`, `-r, --reuse`
- `--diff <OLD> <NEW>`
- `--foreground`, `--user-data-dir <DIR>`
- `-v, --version`, `--uninstall`, `--zed <PATH>`
- `--stable`, `--preview`, `--nightly` (macOS channel select)

Positional args: files, directories, and `file:line:column` grammar. The docs note "The CLI can open `zed://`, `http://`, and `https://` URLs" — so agent-prompt deep linking is achieved by passing `zed://agent?prompt=...` AS a positional arg to `zed`, NOT via a dedicated flag. Example: `zed "zed://agent?prompt=explain%20this"`.

The `zed-cli://` scheme (from Z1) is purely internal IPC — the CLI writes a named-pipe-style handshake URL to the OS and the desktop app picks it up.

### Finding Z7: External agents (Claude/Codex/Gemini CLI via ACP) have NO dedicated URL scheme for prompt seeding
**Confidence:** CONFIRMED
**Evidence:** [zed.dev/docs/ai/external-agents](https://zed.dev/docs/ai/external-agents). External agents are launched via:
- `agent::NewExternalAgentThread` action (keyboard/command palette)
- `keymap.json` entries, e.g., `"cmd-alt-c": ["agent::NewExternalAgentThread", { "agent": { "custom": { "name": "claude-acp" } } }]`

No URL-scheme path currently exists to say "open Zed + start a Claude-Agent ACP session + preload prompt X." The nearest available capability is `zed://agent?prompt=X`, which opens the generic Agent Panel; the user (or a keymap) then chooses which agent to route the thread to. A URL parameter like `?agent=claude-acp` would be a natural extension — not present as of the commit read on 2026-04-16.

### Finding Z8: Issue #8482 ("open file via URL") — LocatorJS-compatible shape NOT adopted
**Confidence:** CONFIRMED
**Evidence:** Issue [zed-industries/zed#8482](https://github.com/zed-industries/zed/issues/8482) requests VS Code / WebStorm compatibility:

- VS Code: `vscode://file${projectPath}${filePath}:${line}:${column}`
- WebStorm: `webstorm://open?file=${projectPath}${filePath}&line=${line}&column=${column}`

Zed shipped `zed://file<path>` (path-concatenation style, closer to VS Code) but did NOT adopt the `?file=&line=&column=` query-param shape. Consequence: tools like LocatorJS that pre-fabricate `webstorm://open?file=...` URLs cannot target Zed without a dedicated Zed entry.

---

## Part 2: JetBrains IDE family

### Finding J1: `jetbrains://` is the canonical Toolbox-era scheme; routes are NOT publicly documented
**Confidence:** CONFIRMED scheme exists; UNCERTAIN on full surface (YouTrack TBX-3965 open)
**Evidence:** [jetbrains.com/help/toolbox-app/jetbrainsd.html](https://www.jetbrains.com/help/toolbox-app/jetbrainsd.html) (fetched 2026-04-16): "The [jetbrainsd] daemon receives URI from the system, forwards it to the Toolbox App, where the standard logic is applied." Examples given include "SSH, OAuth callback, and so on" — **no exhaustive list**.

YouTrack [TBX-3965](https://youtrack.jetbrains.com/issue/TBX-3965) is titled "Documentation for Toolbox Reference URL Scheme" and remains open (i.e., users have been asking JetBrains to publish the canonical schema for years; still unpublished as of the search date).

### Finding J2: Community-reverse-engineered `jetbrains://` routes (via Toolbox browser extension)
**Confidence:** UNCERTAIN — community source; not official docs
**Evidence:** [github.com/alanhe421/jetbrains-url-schemes](https://github.com/alanhe421/jetbrains-url-schemes) + [accompanying Medium post](https://medium.com/@alanhe421/understanding-jetbrains-url-scheme-4e315cd7cc63). The author reverse-engineered these from the [JetBrains Toolbox browser extension](https://github.com/JetBrains/toolbox-browser-extension) source:

| URL template | Behavior |
|---|---|
| `jetbrains://${toolTag}/checkout/git?checkout.repo=${cloneUrl}&idea.required.plugins.id=Git4Idea` | Clone a repo, open in the named IDE |
| `jetbrains://${toolTag}/navigate/reference?project=${project}&path=${filePath}:${lineIndex}:${columnIndex}` | Navigate to file at line:col inside a project that Toolbox already knows about |

Tool tags documented: `idea` (IntelliJ IDEA), `appcode` (AppCode, discontinued), `clion`, `pycharm`, `php-storm` (note hyphen), `rubymine`, `web-storm`, `rd` (Rider), `goland`, `rustrover`. Android Studio and DataGrip are not in this list — unknown whether they have tool tags.

**Caveat:** No route is published for `jetbrains://<tool>/open?file=<abs-path>` (i.e., open an arbitrary file by absolute path without knowing the project context). The Medium post calls this out explicitly: "A drawback of this solution is that it doesn't provide functionality to open a specific file directly."

### Finding J3: Per-product `idea://`, `pycharm://`, `phpstorm://`, `webstorm://` schemes exist natively but are under-documented
**Confidence:** CONFIRMED exist; UNCERTAIN on exact query params per product
**Evidence:**
- [aik099/PhpStormProtocol README](https://github.com/aik099/PhpStormProtocol): "Built-in `idea://` and `phpstorm://` protocols are supported in PhpStorm 8 EAP 138.190+" — historical marker that native per-product schemes arrived in 2014
- Community-documented formats (fetched 2026-04-16):
  - `idea://open?file=<absolute-path>&line=<n>` ([community thread summary](https://intellij-support.jetbrains.com/hc/en-us/community/posts/115000064404); JetBrains staff quote found via search: "right now there is not any specific URL handler inside the IntelliJ Platform on which you can count on")
  - `phpstorm://open?file=%f&line=%l` — cross-platform PhpStorm 8+ form
  - `phpstorm://open?url=file://%f&line=%l` — pre-PhpStorm-8 form (URL-encoded file path)
  - `pycharm://open?file={f}&line={n}` ([stefaanlippens.net](https://www.stefaanlippens.net/pycharm-protocol-handler.html))
- WebStorm: Third-party [Webstorm-URL-Handler](https://github.com/TheAlyxGreen/Webstorm-URL-Handler) exists (HTTP listener, not native), suggesting the native `webstorm://` is known-limited. JetBrains issue [IDEA-65879](https://youtrack.jetbrains.com/issue/IDEA-65879) ("idea protocol handler to open files directly from a URL") is the long-standing request.

**Practical rule:** `<product>://open?file=<abs-path>&line=<n>` works for IntelliJ, PyCharm, PhpStorm, RubyMine, WebStorm, GoLand, RustRover, CLion, and Rider when the respective IDE is running OR can be auto-launched by the OS — but the documentation for this is distributed across community blog posts, not JetBrains' help pages. This is a fragile contract.

### Finding J4: `jetbrains-gateway://` exists but parameters are undocumented
**Confidence:** CONFIRMED scheme; UNCERTAIN params
**Evidence:** [jetbrains.com/help/idea/remote-development-a.html](https://www.jetbrains.com/help/idea/remote-development-a.html) + [Coder docs integration](https://coder.com/docs/user-guides/workspace-access/jetbrains/gateway). The `remote-dev-server.sh run` command with `--ssh-link-host <host> --ssh-link-user <user> --ssh-link-port <port>` generates two link forms:

- `https://code-with-me.jetbrains.com/remoteDev#idePath=...` — HTTPS gateway that redirects into the Gateway app
- `jetbrains-gateway://connect?...` (exact param names NOT in JetBrains docs; inferred from Coder's wrapper code)

YouTrack [GTW-713](https://youtrack.jetbrains.com/issue/GTW-713/JetBrains-Gateway-no-application-or-handler-for-URL-scheme) documents historical breakage: the `jetbrains-gateway://` scheme was not always registered by the Gateway installer, requiring manual OS-level registration.

### Finding J5: JetBrains AI Assistant has NO URL-scheme deep link for chat prompts
**Confidence:** CONFIRMED (negative) — exhaustive search 2026-04-16
**Evidence:** Searched [jetbrains.com/help/ai-assistant/ai-chat.html](https://www.jetbrains.com/help/ai-assistant/ai-chat.html), [chat-mode.html](https://www.jetbrains.com/help/ai-assistant/chat-mode.html), [about-ai-assistant.html](https://www.jetbrains.com/help/ai-assistant/about-ai-assistant.html), and community forums. No `idea://ai`, `idea://chat`, `jetbrains://ai/chat?prompt=`, or similar documented. AI Assistant chat is accessible via the chat tool window (`/docs`, `/web` slash commands documented), IDE actions, and context menu — no external URL entry point.

### Finding J6: Junie (JetBrains' autonomous agent) has NO direct URL scheme — uses ACP + running-IDE detection
**Confidence:** CONFIRMED — [parameters.html](https://junie.jetbrains.com/docs/parameters.html) + [CLI-IDE blog post](https://blog.jetbrains.com/junie/2026/04/junie-cli-inside-your-jb-ide/)
**Evidence:** The Junie CLI ([`junie` command](https://junie.jetbrains.com/docs/junie-cli.html)) is invoked via terminal, not URL. Relevant flags:

- `--task <text>` — task description (alternative to positional argument); this is the prompt-seeding mechanism
- `--project, -p <path>` — project directory
- `--session-id <id>` — resume a previous session
- `--acp` — **"Enable Agent Client Protocol (ACP) mode for IDE/editor integrations"**
- `--review`, `--merge`, `--rebase` — start specialized tasks
- `--input-format {text,json}`, `--output-format {text,json}` — pipe/script friendly

Zero URL-scheme flags. The April 2026 announcement ["Junie CLI Now Connects to Your JetBrains IDE"](https://blog.jetbrains.com/junie/2026/04/junie-cli-inside-your-jb-ide/) describes the integration as: "No manual setup is required – Junie CLI detects your running IDE automatically... install the integration plugin. One click, and you're connected." The transport layer is **not publicly documented** — but the presence of `--acp` on the CLI strongly suggests Junie-in-IDE talks to Junie CLI over the same ACP the CLI uses to be an ACP server for Zed/external editors. This is an indirect but important parallel to Zed's external-agent model.

**Practical implication for deep-linking:** To "open IDE + seed Junie prompt from external source," the documented path is `junie --task "prompt text" --project /path/to/project` from a terminal, which then auto-detects and connects to the running IDE. A URL-scheme version does not exist. If you need to deep-link from a browser or another app, you'd need a custom wrapper (e.g., register your own scheme that shells out to `junie --task`).

### Finding J7: `JetBrains/mcp-jetbrains` MCP bridge — folded into IDE in 2025.2, listens on port `6365`
**Confidence:** CONFIRMED (deprecated-but-authoritative README)
**Evidence:** [github.com/JetBrains/mcp-jetbrains](https://github.com/JetBrains/mcp-jetbrains) README notes: "The core functionality has been integrated into all IntelliJ-based IDEs since version 2025.2." The repo shows `http://host.docker.internal:6365/api/mcp/list_tools` as an example URL — a localhost HTTP MCP endpoint, not a URL scheme. Installation is via `npx -y @jetbrains/mcp-proxy` in Claude Desktop / VS Code config.

This is an ambient-agent-integration pattern (MCP server inside the IDE, external agents discover via localhost HTTP) — qualitatively different from URL-scheme deep-linking but worth noting as JetBrains' preferred agent-handoff surface circa 2026.

### Finding J8: No unified per-IDE CLI — each product ships its own launcher with the same flag shape
**Confidence:** CONFIRMED indirectly
**Evidence:** JetBrains IDEs ship Unix launchers named after the product (`idea`, `webstorm`, `pycharm`, `rustrover`, `goland`, `clion`, `rubymine`, `phpstorm`). Flag shape is consistent (e.g., `idea /path/to/project`, `idea diff file1 file2`, `idea format <files>`, `idea inspect <project> <inspection-profile> <output>`). **No AI/chat/prompt flags documented on any product CLI** — the only agent-aware CLI in the JetBrains ecosystem is the separate `junie` tool.

---

## Comparison table

| Product | URL scheme(s) | Prompt seeding via URL? | AI chat deep-link? | Workspace/project param? | CLI-to-app bridge? |
|---|---|---|---|---|---|
| Zed | `zed://` (file, ssh, extension, agent, agent/shared, schemas, settings, git/clone, git/commit); `zed-cli://` (internal); `zed-dock-action://` | **YES — `zed://agent?prompt=<text>`** (PR #47959, 2026-01) | Same: `zed://agent?prompt=` opens generic Agent Panel; no per-agent variant | No explicit `?workspace=`; file/ssh paths carry project implicitly | `zed` CLI accepts `zed://...` URLs as positional args |
| IntelliJ (+ WebStorm, PyCharm, PhpStorm, RubyMine, GoLand, RustRover, CLion, Rider) | `<product>://open?file=&line=` (per-product, native since PhpStorm 8 EAP 2014); `jetbrains://` (Toolbox-era umbrella); `jetbrains-gateway://` (Remote Dev) | No | No | `jetbrains://<tool>/navigate/reference?project=<name>&path=...` carries project | Per-product Unix launchers (`idea`, `webstorm`, etc.); no URL-scheme flag on the CLI |
| JetBrains AI Assistant | n/a (uses host IDE's scheme) | **No** | **No** | n/a | n/a |
| Junie (JetBrains autonomous agent) | **None** | **No (use `junie --task`)** | No | `junie --project <path>` | `junie` CLI auto-detects running IDE, installs plugin, connects (transport undocumented; `--acp` flag strongly implies ACP) |
| Android Studio | Likely `idea://` (built on IntelliJ Platform) — not verified in this pass | Unknown | No | Unknown | `studio` CLI |
| DataGrip | Likely `idea://` / `datagrip://` — not verified | Unknown | No | Unknown | `datagrip` CLI |

---

## Architectural observations (OK-relevance)

1. **Zed's `zed://agent?prompt=` is the only OSS precedent for an editor-class app that exposes a typed, single-query-param URL entry point dedicated to agent prompt seeding.** The struct shape — `AgentPanel { external_source_prompt: Option<ExternalSourcePrompt> }` with a dedicated `ExternalSourcePrompt::new` constructor — mirrors Codex Desktop's `{ kind: "newThread", prompt, originUrl, path }` route shape at a concept level. Both separate "the URL said X" from "the panel UI receives X" through an intermediate typed value.
2. **Zed intentionally NOT implementing LocatorJS-compatible `?file=&line=&column=` is a finding.** The path-concatenation `zed://file<path>` matches VS Code's shape but not WebStorm's. A cross-IDE "open-in-editor" link server (e.g., React DevTools) has to emit the shape that matches the target editor.
3. **The `zed://agent/symbol/...` mention URIs (internal) vs. `zed://agent/shared/<uuid>` (OS-reachable) collision inside the same prefix is a caution tale.** Any design that uses the same URL-scheme prefix for two different audiences (in-conversation references vs. OS deep links) risks confusion when those URLs escape their intended boundary. OK-relevance: if OK reuses a scheme prefix for both internal doc-embedding and external deep-links, the dispatch layer needs one authoritative router, not two.
4. **JetBrains' URL-scheme story is a cautionary inverse.** The `jetbrains://` routes are real and actively used (Toolbox browser extension emits them in production), but after 7+ years of the TBX-3965 doc request sitting open, users still can't cite an official schema. Community catalogs (alanhe421/jetbrains-url-schemes) are the de-facto reference. For OK, "ship a documented URL contract on day one and maintain it" looks more valuable than this pattern of "it works if you reverse-engineer the browser extension."
5. **Junie's absence of a URL scheme despite being first-party agent tooling is signal, not noise.** JetBrains chose ACP (Agent Client Protocol, a local IPC protocol pioneered by Zed) over a URL scheme for CLI↔IDE prompt passing. The `--task` flag is their prompt-seeding mechanism; the "deep-link" equivalent is `junie --task "..." --project .`. This suggests URL schemes are losing ground to local-IPC-plus-CLI-wrapper in agent-tooling prior art circa 2026.
6. **Scheme space per IDE family.** Zed uses a single `zed://` with path-based dispatch. JetBrains uses `<product>://` per IDE PLUS the `jetbrains://<toolTag>/` umbrella PLUS `jetbrains-gateway://` PLUS the tangle of `idea://`, `phpstorm://`, `pycharm://` natives. Zed's model is cleaner for deep-link authors — one scheme, one parser. OK should emulate Zed's unified-scheme model, not JetBrains' product-per-scheme model.

---

## Negative searches (NOT FOUND)

- **Zed:** No `zed://assistant/...`, no `zed://chat/...`, no `zed://open?file=...&line=...` (VS Code / WebStorm shape), no `zed://project/...`, no `zed://workspace/...`, no `?agent=claude-acp` parameter on `zed://agent`. Searched: `open_listener.rs` exhaustively + PR list.
- **Zed:** No `zed --prompt` / `zed --agent` / `zed chat` CLI subcommand. Searched: [zed.dev/docs/reference/cli](https://zed.dev/docs/reference/cli).
- **JetBrains:** No `idea://ai/...`, no `idea://chat?prompt=...`, no `jetbrains://ai/...`, no documented `junie://` scheme. Searched: AI Assistant docs, Junie docs, Junie GitHub README, JetBrains blog.
- **JetBrains:** No public, JetBrains-authored documentation of the full `jetbrains://` route surface as of 2026-04-16 (TBX-3965 still open).
- **JetBrains:** No `--prompt`, `--chat`, or `--ai` flag on `idea`, `webstorm`, `pycharm`, or equivalents. The Junie CLI is the only JetBrains agent CLI with a `--task` flag.
- **Per-IDE protocol normalization:** No JetBrains doc page enumerates which of IntelliJ / WebStorm / PyCharm / GoLand / RustRover / CLion / Rider / RubyMine / PhpStorm / DataGrip / Android Studio register which native per-product scheme. The `PhpStormProtocol` README notes PhpStorm 8+ has it; verification for the rest rests on community reports.

---

## Gaps / follow-ups for a future research pass

1. **Confirm scheme registration mechanics per Zed-supported OS.** Fetch `crates/zed/build.rs` and the macOS `Info.plist`, Linux `.desktop`, and Windows installer logic to enumerate which schemes are registered at install time. This pass only verified the URL parser, not the OS-level registration.
2. **Locate the `ExternalSourcePrompt::new` constructor.** Does it enforce length limits or sanitize the prompt? What does it reject? Relevant for understanding "malicious URL" attack surface (the phishing-vector analysis in the Codex / Cursor evidence files).
3. **Verify Android Studio + DataGrip scheme coverage.** Neither appears in alanhe421's tool-tag list — are they registered at all, or do they inherit via the IntelliJ Platform automatically?
4. **Trace the Junie CLI↔IDE transport concretely.** `--acp` implies ACP over stdio; the IDE plugin side likely spawns the CLI or attaches to a local socket. Worth probing `JetBrains/junie` source (not fully readable from the README alone).
5. **JetBrains Toolbox `jetbrains://` full surface.** The Toolbox browser extension source (`github.com/JetBrains/toolbox-browser-extension`) is the canonical reverse-engineering target. A grep for `'jetbrains:'` across that repo would produce the authoritative route list — this pass could not read the repo source directly. Worth a follow-up if JetBrains remains a serious competitor/peer in the OK analysis.
6. **Android Studio `studio://` vs `idea://`.** Worth confirming whether Google's Android Studio fork diverges from upstream IntelliJ's scheme registration.
7. **Does Zed have any UI surfacing the `zed://` URL copy action?** VS Code's "Copy Permalink" / JetBrains' "Copy Path/Reference" pattern creates authored `<product>://` URLs. Zed has `editor::CopyPermalinkToLine` but this emits an HTTPS git-forge permalink, NOT a `zed://` URL. Relevant for understanding user-facing authoring of Zed deep links.
