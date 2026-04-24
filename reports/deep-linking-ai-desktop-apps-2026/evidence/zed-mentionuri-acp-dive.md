# Evidence: Zed MentionUri + ACP — Router Architecture and Scheme-Collision Precedent

**Dimension:** Addendum to D3 (editor deep-links) — Zed's internal-vs-external URL router architecture
**Date:** 2026-04-17
**Sources:** `github.com/zed-industries/zed` source (commit at `main`, sampled 2026-04-16), [agentclientprotocol.com](https://agentclientprotocol.com) spec, [crates.io/crates/agent-client-protocol](https://crates.io/crates/agent-client-protocol), `@zed-industries/agent-client-protocol` on npm, PR #47959 (`zed://agent?prompt=…`)

---

## Why this matters for OK

Zed is the **only editor in the D3 sample that reuses a single URL scheme (`zed://agent/…`) for two structurally different purposes**: (1) external deep-link routing from the OS `open-url` handoff (e.g. shared-thread links opened from a browser), and (2) internal mention-context encoding — typed references to files, symbols, selections, diagnostics, terminals, and git objects that appear inline in agent conversations. Both parsers read URLs with identical syntactic shape. The system relies on path-level dispatch and a newtype-at-boundary pattern to keep them separate without collisions.

Open Knowledge will hit this exact question the moment it (a) ships a deep-link (`openknowledge://page/<slug>`) and (b) wants first-class inline references inside its own wiki — `[[Page Title]]` already exists, but the MCP-tool-call path or agent-chat-embedding path will benefit from stable URI forms for non-page context (e.g., backlinks queries, diff views, activity ranges). Zed has already lived with the collision for ~9 months (first commit in `mention.rs` dates to 2025-08-12, #36006). This evidence file documents how they solved it so OK doesn't have to rediscover the solution or its failure modes.

---

## Part 1: Agent Client Protocol (ACP) primer

### Finding 1.1: ACP transport is JSON-RPC over stdio (stable); streamable HTTP is draft
**Confidence:** CONFIRMED
**Evidence:** [agentclientprotocol.com/protocol/transports](https://agentclientprotocol.com/protocol/transports)

> "The client launches the agent as a subprocess. The agent reads JSON-RPC messages from its standard input (stdin) and sends messages to its standard output (stdout). Messages are delimited by newlines and cannot contain embedded newlines. Agents may log to stderr, which clients can optionally capture."

Streamable HTTP is tagged "*draft proposal in progress*". No WebSocket/TCP/Unix-socket transport appears in the stable spec. ACP messages MUST be UTF-8.

### Finding 1.2: SDK packaging — Rust + TypeScript are first-class, Python/Java/Kotlin published
**Confidence:** CONFIRMED
**Evidence:**
- Rust crate: `agent-client-protocol` on crates.io at `v0.10.4` (2026-03-31), 1.28M cumulative downloads, description *"A protocol for standardizing communication between code editors and AI coding agents"*. Zed's `mention.rs` imports it as `use agent_client_protocol as acp;` (`crates/acp_thread/src/mention.rs:1`).
- TypeScript package: `@zed-industries/agent-client-protocol` on npm, ~14.4K weekly downloads, offers `AgentSideConnection` / `ClientSideConnection` factories.
- Additional libraries listed at [agentclientprotocol.com/libraries](https://agentclientprotocol.com/libraries): Python, Java, Kotlin, plus community implementations.
- Companion package `@zed-industries/claude-agent-acp` / `@zed-industries/claude-code-acp` wraps Anthropic's Claude Agent SDK into ACP.

### Finding 1.3: ACP-compatible agents (as of April 2026)
**Confidence:** CONFIRMED
**Evidence:** [zed.dev/docs/ai/external-agents](https://zed.dev/docs/ai/external-agents) lists four:
- **Gemini CLI** (Google's reference implementation)
- **Claude Agent** (Anthropic SDK wrapped by `@zed-industries/claude-agent-acp`)
- **Codex CLI** (OpenAI)
- **GitHub Copilot**

Users launch via the agent panel's `+` button or bind `agent::NewExternalAgentThread { agent_name }` to a custom keyboard shortcut in `keymap.json`. Custom agents can be declared in settings under `agent_servers` (command/args/env). MCP server access is NOT universal: Claude Agent and Codex support MCP; Gemini CLI does not.

### Finding 1.4: Core protocol primitives relevant to mentions
**Confidence:** CONFIRMED
**Evidence:** [agentclientprotocol.com/protocol/prompt-turn](https://agentclientprotocol.com/protocol/prompt-turn) + [agentclientprotocol.com/protocol/content](https://agentclientprotocol.com/protocol/content)

Two JSON-RPC methods matter for this evidence:

- `session/prompt` (client → agent): includes a `prompt` array of `ContentBlock` values.
- `session/update` (agent → client): streams plan/chunk/tool-status notifications.

ContentBlock variants: `Text`, `Image`, `Audio`, `ResourceLink` (reference: `{uri, name, mimeType, size?}`), `Resource` (embedded: `{uri, mimeType, text|blob}`).

> "Embedded Resource: Complete resource contents embedded directly in the message. This is the preferred approach for @-mentions referencing files."

Mentions in Zed travel either as `ResourceLink` (reference only, agent fetches content itself) or as `EmbeddedResource → TextResourceContents` (content already materialized client-side). Either way, the `uri` field carries a `MentionUri`.

---

## Part 2: MentionUri — the internal URI scheme

### Finding 2.1: MentionUri enum (12 variants) — verbatim source
**Confidence:** CONFIRMED
**Evidence:** `crates/acp_thread/src/mention.rs:17-64`

```rust
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Hash)]
pub enum MentionUri {
    File { abs_path: PathBuf },
    PastedImage { name: String },
    Directory { abs_path: PathBuf },
    Symbol { abs_path: PathBuf, name: String, line_range: RangeInclusive<u32> },
    Thread { id: acp::SessionId, name: String },
    Rule { id: PromptId, name: String },
    Diagnostics {
        #[serde(default = "default_include_errors")] include_errors: bool,
        #[serde(default)] include_warnings: bool,
    },
    Selection {
        #[serde(default, skip_serializing_if = "Option::is_none")] abs_path: Option<PathBuf>,
        line_range: RangeInclusive<u32>,
    },
    Fetch { url: Url },
    TerminalSelection { line_count: u32 },
    GitDiff { base_ref: String },
    MergeConflict { file_path: String },
}
```

Twelve variants total (I originally miscounted; `PastedImage` is its own variant distinct from `File`).

### Finding 2.2: Per-variant URL shapes (from `to_uri()` — `mention.rs:322-423`)

| Variant               | URL shape                                                                 | Scheme used |
|-----------------------|---------------------------------------------------------------------------|-------------|
| `File`                | `file:///<abs_path>`                                                      | `file:`     |
| `Directory`           | `file:///<abs_path>/` (trailing slash disambiguates from `File`)          | `file:`     |
| `Symbol`              | `file:///<abs_path>?symbol=<name>#L<start>:<end>`                         | `file:`     |
| `Selection` (in-file) | `file:///<abs_path>#L<start>:<end>`                                       | `file:`     |
| `Selection` (buffer)  | `zed:///agent/untitled-buffer#L<start>:<end>`                             | `zed:`      |
| `PastedImage`         | `zed:///agent/pasted-image?name=<name>`                                   | `zed:`      |
| `Thread`              | `zed:///agent/thread/<session_id>?name=<name>`                            | `zed:`      |
| `Rule`                | `zed:///agent/rule/<prompt_id>?name=<name>`                               | `zed:`      |
| `Diagnostics`         | `zed:///agent/diagnostics?include_errors=<bool>&include_warnings=<bool>`  | `zed:`      |
| `TerminalSelection`   | `zed:///agent/terminal-selection?lines=<n>`                               | `zed:`      |
| `GitDiff`             | `zed:///agent/git-diff?base=<ref>`                                        | `zed:`      |
| `MergeConflict`       | `zed:///agent/merge-conflict?path=<file_path>`                            | `zed:`      |
| `Fetch`               | `http://…` / `https://…` (arbitrary external URL)                         | `http(s):`  |

**Critical shape detail:** Zed uses `zed:///agent/...` (triple-slash — empty authority) for mentions, while external deep-links use `zed://agent/...` (double-slash — `agent` is the authority). In `open_listener.rs` the parser `.strip_prefix("zed://agent…")` doesn't differentiate authority-vs-path, so both shapes coexist only because the internal-vs-external router doesn't see MentionUris (see Part 3).

### Finding 2.3: Timeline of MentionUri evolution (PR numbers + dates)
**Confidence:** CONFIRMED
**Evidence:** `git log` on `crates/acp_thread/src/mention.rs` via `gh api`

| Date       | PR        | What it added                                                                 |
|-----------:|-----------|-------------------------------------------------------------------------------|
| 2025-08-12 | #36006    | `Include mention context in acp-based native agent` — initial file           |
| 2025-08-13 | #36134    | "Fully support all mention kinds"                                             |
| 2025-08-19 | #36416    | Directory mentions                                                            |
| 2025-08-20 | #36551    | History mentions (Thread variant expansion)                                   |
| 2025-08-23 | #36741    | Eager loading of all mention kinds                                            |
| 2025-09-25 | #38882    | Fix `@mentions` when remoting from Windows to Linux                           |
| 2025-10-28 | #41310    | Fix `@mention` file-path format                                               |
| 2025-12-03 | #44063    | Update to ACP SDK v0.8.0                                                      |
| 2025-12-16 | #44983    | Decode `file://` mention paths for non-ASCII names                            |
| 2026-01-08 | #46330    | Make URL parsing less strict for agent-generated URLs                         |
| 2026-01-20 | #42270    | `@diagnostics` mention                                                        |
| 2026-01-29 | #47637    | Terminal output as context                                                    |
| 2026-01-29 | #47950    | Terminal selection adjustments                                                |
| 2026-02-18 | #49513    | `git_ui: Add "Review Branch" with agent feature` (adds `GitDiff`)             |
| 2026-03-02 | #50087    | Full-path tooltips                                                            |
| 2026-03-10 | #49807    | `git: Add the ability to resolve merge conflicts with the agent` (`MergeConflict`) |
| 2026-03-31 | #52757    | Remove text thread and slash command crates                                   |
| 2026-04-06 | #52995    | Fix label for image mentions                                                  |

The enum has been growing monotonically since August 2025 — 12 variants in ~8 months, roughly one new variant every 3 weeks. This is an actively-used internal schema; new context-surfaces (terminal, git-diff, merge-conflict) arrive regularly.

### Finding 2.4: MentionUri is the boundary type between UI and ACP wire-format
**Confidence:** CONFIRMED
**Evidence:** `crates/agent/src/thread.rs:4055-4120` + `crates/acp_thread/src/acp_thread.rs:720-740`

Flow for OUTBOUND user mentions (toward agent):
1. User types `@` in `MessageEditor` (`crates/agent_ui/src/message_editor.rs`).
2. Completion provider builds a `MentionUri` variant, stored in `MentionSet: HashMap<CreaseId, (MentionUri, MentionTask)>`.
3. `UserMessageContent::Mention { uri: MentionUri, content: String }` becomes an `acp::ContentBlock::Resource(EmbeddedResource { TextResourceContents { content, uri: uri.to_uri().to_string() } })`.

Flow for INBOUND mentions (from agent or rehydrated thread):
1. `acp::ContentBlock::ResourceLink` or `acp::ContentBlock::Resource(TextResourceContents)` arrives.
2. `MentionUri::parse(&resource.uri, path_style)` reconstructs the typed variant.
3. On failure, falls back to `Self::Text(format!("[{}]({})", name, uri))` — **graceful degradation, never a panic**.

Fallback code is in `thread.rs:4063-4095`:
```rust
acp::ContentBlock::ResourceLink(resource_link) => {
    match MentionUri::parse(&resource_link.uri, path_style) {
        Ok(uri) => Self::Mention { uri, content: String::new() },
        Err(err) => {
            log::error!("Failed to parse mention link: {}", err);
            Self::Text(format!("[{}]({})", resource_link.name, resource_link.uri))
        }
    }
}
```

This means an adversarial/unknown URI scheme arriving inside the agent conversation can't crash the UI — worst case it becomes ordinary markdown text.

---

## Part 3: Router architecture — the disambiguation mechanism

### Finding 3.1: OpenRequest and MentionUri parsers are in DIFFERENT PROCESSES / DIFFERENT CODE PATHS
**Confidence:** CONFIRMED
**Evidence:** `crates/zed/src/zed/open_listener.rs:121-205` vs `crates/acp_thread/src/mention.rs:67-224`

The two parsers don't share a dispatcher. They are invoked from **completely disjoint call sites**:

- `OpenRequest::parse` is called ONLY from:
  - `handle_cli_connection` (cli tool relays `zed` CLI args, line 472)
  - The OS `open-url` event handler (registered during app startup, not shown in `open_listener.rs` but consumed from its `UnboundedReceiver<RawOpenRequest>`)
  - Stateless on-startup URL arguments

- `MentionUri::parse` is called ONLY from:
  - `acp_thread.rs:737` — converting incoming ACP `ContentBlock::ResourceLink/Resource` URIs into mentions
  - `agent/src/thread.rs:4064, 4078` — same, for thread replay
  - `agent_ui/src/message_editor.rs` — parsing pasted links and converting into mention chips
  - Tests

There is **no unified "URL open" entry point** that would first try MentionUri::parse and fall back to OpenRequest::parse (or vice versa). The disambiguation is **structural**: external URLs physically arrive via `CFURLRef` → Cocoa → `OpenListener` (macOS), or command-line args → `cli` → `OpenListener`; internal URLs physically arrive via ACP JSON-RPC messages or `MessageEditor` paste/typing events. They literally never cross.

### Finding 3.2: `OpenRequest::parse` dispatch — verbatim
**Confidence:** CONFIRMED
**Evidence:** `crates/zed/src/zed/open_listener.rs:143-202`

```rust
for url in request.urls {
    if let Some(server_name) = url.strip_prefix("zed-cli://") { … }
    else if let Some(action_index) = url.strip_prefix("zed-dock-action://") { … }
    else if let Some(file) = url.strip_prefix("file://") { self.parse_file_path(file) }
    else if let Some(file) = url.strip_prefix("zed://file") { self.parse_file_path(file) }
    else if let Some(file) = url.strip_prefix("zed://ssh") { … }
    else if let Some(extension_id) = url.strip_prefix("zed://extension/") { … }
    else if let Some(session_id_str) = url.strip_prefix("zed://agent/shared/") {
        if uuid::Uuid::parse_str(session_id_str).is_ok() {
            this.kind = Some(OpenRequestKind::SharedAgentThread { session_id: … });
        } else { log::error!("Invalid session ID in URL: {}", session_id_str); }
    }
    else if let Some(agent_path) = url.strip_prefix("zed://agent") {
        this.parse_agent_url(agent_path)
    }
    else if let Some(schema_path) = url.strip_prefix("zed://schemas/") { … }
    else if url == "zed://settings" || url == "zed://settings/" { … }
    else if let Some(setting_path) = url.strip_prefix("zed://settings/") { … }
    else if let Some(clone_path) = url.strip_prefix("zed://git/clone") { … }
    else if let Some(commit_path) = url.strip_prefix("zed://git/commit/") { … }
    else if url.starts_with("ssh://") { … }
    else if let Some(zed_link) = parse_zed_link(&url, cx) { … }  // zed:// → internal routes
    else { log::error!("unhandled url: {}", url); }
}
```

**Critical observation:** the router is an `if/else if` chain with **textual prefix-stripping** on the raw string, NOT URL parsing. Ordering matters — `zed://agent/shared/` is tested BEFORE `zed://agent` so the SharedAgentThread branch wins. The agent-mention paths (`/agent/thread/`, `/agent/rule/`, `/agent/symbol/`, `/agent/diagnostics`, etc.) are NOT listed — they would fall through to the generic `zed://agent` branch and be parsed by `parse_agent_url`, which only understands `?prompt=<text>`. In effect, a MentionUri shape arriving through `OpenRequest::parse` would silently degrade to an empty agent-panel open.

### Finding 3.3: `parse_agent_url` (the external branch) — verbatim
**Confidence:** CONFIRMED
**Evidence:** `crates/zed/src/zed/open_listener.rs:213-223`

```rust
fn parse_agent_url(&mut self, agent_path: &str) {
    // Format: "" or "?prompt=<text>"
    let external_source_prompt = agent_path.strip_prefix('?').and_then(|query| {
        url::form_urlencoded::parse(query.as_bytes())
            .find_map(|(key, value)| (key == "prompt").then_some(value))
            .and_then(|prompt| ExternalSourcePrompt::new(prompt.as_ref()))
    });
    self.kind = Some(OpenRequestKind::AgentPanel {
        external_source_prompt,
    });
}
```

The external branch only recognizes the empty path (`zed://agent`) or the `?prompt=<text>` query shape. Any path suffix — `/symbol/…`, `/thread/…`, etc. — is **silently ignored**; `agent_path.strip_prefix('?')` returns `None` and `external_source_prompt` stays `None`. No exception, no log. This is actually a defense-in-depth property: an attacker-controlled MentionUri-shaped URL passed through the OS `open-url` handler degrades to a bare "open agent panel" action.

### Finding 3.4: `MentionUri::parse` requires strict `zed` scheme — `file:` and `http(s):` are also recognized
**Confidence:** CONFIRMED
**Evidence:** `crates/acp_thread/src/mention.rs:97, 131, 222-224`

```rust
match url.scheme() {
    "file" => { … file-scheme branch }
    "zed" => { … /agent/thread, /agent/rule, /agent/symbol, /agent/diagnostics, /agent/… }
    "http" | "https" => Ok(MentionUri::Fetch { url }),
    other => bail!("unrecognized scheme {:?}", other),
}
```

Any other scheme (e.g., `javascript:`, `data:`, `zed-cli:`) is rejected at parse time with `bail!`. The `/agent/shared/` path is **NOT** recognized by MentionUri::parse — verifying the external-deep-link shape and the internal-mention shapes are structurally disjoint **by convention** (both teams have to know about the other's namespace).

### Finding 3.5: The router architecture summarized

```
┌─────────────────────────────────────────────────────────────────────┐
│ External URL arrival paths (OS-delivered, user-initiated)           │
│                                                                      │
│   macOS `open-url` AppleEvent ─┐                                    │
│   Linux .desktop Exec=zed %u ──┤                                    │
│   Windows registered scheme  ──┤                                    │
│   `zed <URL>` CLI invocation ──┤──> OpenListener::open(RawOpenRequest)
│   Unix socket (cli handshake)  │                                    │
│                                                                      │
│ → OpenRequest::parse  (open_listener.rs:121)                        │
│     dispatch table: zed-cli://, zed-dock-action://, file://,        │
│       zed://file, zed://ssh, zed://extension/, zed://agent/shared/, │
│       zed://agent[?prompt=…], zed://schemas/, zed://settings,       │
│       zed://git/{clone,commit}, ssh://, zed-link-shortener          │
│                                                                      │
│   NOT recognized: zed://agent/thread/*, /agent/rule/*,              │
│     /agent/symbol/*, /agent/diagnostics, /agent/terminal-selection, │
│     /agent/git-diff, /agent/merge-conflict — these fall through     │
│     to parse_agent_url which treats the path suffix as inert.       │
└─────────────────────────────────────────────────────────────────────┘
                        ┃ strict separation — no bridge function ┃
┌─────────────────────────────────────────────────────────────────────┐
│ Internal URL arrival paths (ACP wire-format, user typing, paste)    │
│                                                                      │
│   ACP JSON-RPC session/prompt ─┐                                    │
│   ACP JSON-RPC session/update ─┤                                    │
│   Thread history replay       ─┤──> ContentBlock { uri: String }    │
│   @-mention completion         │                                    │
│   Markdown-link paste          │                                    │
│                                                                      │
│ → MentionUri::parse  (mention.rs:67)                                │
│     dispatch on url.scheme():                                        │
│       file://     → File / Directory / Symbol / Selection           │
│       zed://      → /agent/{thread,rule,symbol,diagnostics,         │
│                     pasted-image,untitled-buffer,selection,         │
│                     terminal-selection,git-diff,merge-conflict}     │
│       http(s)://  → Fetch                                           │
│       *          → bail!("unrecognized scheme")                     │
│                                                                      │
│   NOT recognized: zed://agent/shared/, zed://settings,              │
│     zed://extension/, zed://git/clone, zed://schemas/, zed-cli://,  │
│     ssh://, zed-dock-action://                                      │
└─────────────────────────────────────────────────────────────────────┘
```

The two routers are **complementary projections of the same `zed://agent/…` prefix** — each implements the subset of paths the other doesn't. A defender can read both parsers and prove there is no overlapping path segment (e.g., no shape that both parsers successfully return a non-default variant for), though this property is maintained by discipline rather than enforced by types or tests.

---

## Part 4: Tool-invocation URIs

### Finding 4.1: NO `zed://agent/tool/…` or `zed://agent/action/…` URI shape exists
**Confidence:** CONFIRMED (negative result)
**Evidence:** exhaustive review of `MentionUri::parse` (lines 131-220) — no `/agent/tool` or `/agent/action` path arm; `gh search code --owner=zed-industries "agent/tool"` returned no Rust-source results.

ACP tool invocation travels over JSON-RPC as a first-class protocol primitive (`ToolCall` content blocks, `session/update` notifications, `session/request_permission` bidirectional methods per [agentclientprotocol.com/protocol/tool-calls](https://agentclientprotocol.com/protocol/tool-calls)) — NOT through a URI shape. Mentions are strictly *context* (what the user is referring to); tool calls are strictly *actions* (what the agent is doing). These are kept separate at the protocol level.

The only path where a user-supplied URI causes Zed to perform an action is `MentionUri::Fetch { url }` — but `Fetch` means "embed this URL's content as context", not "navigate to this URL". The agent still chooses what to do with it.

### Finding 4.2: Slash-commands are the nearest analog — also not URI-shaped
**Confidence:** CONFIRMED
**Evidence:** [agentclientprotocol.com/protocol/slash-commands](https://agentclientprotocol.com/protocol/slash-commands); commit 76c6004b removed `slash_command` crate 2026-03-31 (#52757) — slash commands are being phased out in favor of Agent Skills (#50453, open).

---

## Part 5: Security — trust flag handling

### Finding 5.1: `ExternalSourcePrompt` is a newtype with mandatory sanitization
**Confidence:** CONFIRMED
**Evidence:** `crates/agent_ui/src/external_source_prompt.rs:1-70`

```rust
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ExternalSourcePrompt(String);

impl ExternalSourcePrompt {
    pub fn new(prompt: &str) -> Option<Self> {
        sanitize(prompt).map(Self)
    }
    …
}

fn sanitize(prompt: &str) -> Option<String> {
    // Strip bidi control chars, disallowed control chars;
    // collapse > 2 consecutive newlines; CR → LF.
    // Returns None if sanitized is empty.
}

fn is_bidi_control_character(character: char) -> bool {
    matches!(character,
        '\u{061C}'           // ALM
        | '\u{200E}'         // LRM
        | '\u{200F}'         // RLM
        | '\u{202A}'..='\u{202E}'  // LRE, RLE, PDF, LRO, RLO
        | '\u{2066}'..='\u{2069}'  // LRI, RLI, FSI, PDI
    )
}
```

This is **VS Code's `trusted:` flag pattern done right**: the trust boundary is enforced by type-wrapping at the parse point. The only constructor is `ExternalSourcePrompt::new`, which ALWAYS runs sanitize. Any code receiving an `ExternalSourcePrompt` knows it's already been cleaned. The `parse_agent_url` handler calls `ExternalSourcePrompt::new(prompt.as_ref())` (`open_listener.rs:218`) — a prompt can only leave the external-URL boundary as a sanitized newtype.

This defends against:
- **Bidi override attacks** (Trojan-Source CVE-2021-42574 style — a URL with embedded RTL overrides that visually spoof prompt content)
- **Control-char injection** (null bytes, BS, DEL chars that confuse downstream display)
- **Prompt-injection padding via enormous blank-line runs** (newline count capped at 2 consecutive)
- **Windows CR/CRLF inconsistency**

### Finding 5.2: MentionUri has NO analogous trust flag
**Confidence:** CONFIRMED (architectural observation)
**Evidence:** `MentionUri` is `pub enum MentionUri { … }` with `pub fn parse`. No newtype wrapping. No `trusted: bool` field. No sanitization step.

This is defensible BECAUSE of the router architecture documented in Part 3: MentionUri is constructed only inside trusted internal paths — the ACP JSON-RPC message pipe (agent subprocess, stdio, launched by Zed itself under user control) and the local `MessageEditor` (user typing). Neither path is reachable by an attacker-controlled external URL. An attacker would need to either:

1. Trick the user into running a malicious ACP agent (a hypothetical "agent server" over the web) — but ACP agents are local subprocesses launched explicitly via `agent::NewExternalAgentThread`, and
2. Inject a MentionUri shape into something that reaches `MentionUri::parse` through the external router — but no route in `OpenRequest::parse` forwards URLs into the MentionUri parser.

The trust model is *structural* — MentionUri inherits the trust level of its arrival path. Zed has not needed a per-URI trusted flag because MentionUri never crosses the external boundary.

### Finding 5.3: Residual exposure — `MentionUri::Fetch { url }` and raw HTML paths
**Confidence:** LIKELY
**Evidence:** `MentionUri::Fetch` wraps an arbitrary `http://` / `https://` URL. A malicious agent COULD emit a `ResourceLink { uri: "https://evil.example/…", name: "innocuous" }` in `session/update`; the client would parse it to `MentionUri::Fetch`, and if the user clicks the mention chip, Zed would fetch and embed that content.

This is not a "scheme collision" issue; it's the normal "content from an agent is untrusted" issue. The defense is that fetch content lands as text inside the agent conversation, not as executable context or privileged action. The analogue is trusting the agent's own output — a problem no URI design can fully eliminate.

---

## Lessons for OK's own scheme design

### Lesson A: Single scheme + path-level dispatch is viable IF the routers have structurally disjoint namespaces AND the paths never cross code boundaries
Zed's approach works because MentionUri (`/agent/thread`, `/agent/rule`, `/agent/symbol`, `/agent/diagnostics`, `/agent/selection`, `/agent/pasted-image`, `/agent/untitled-buffer`, `/agent/terminal-selection`, `/agent/git-diff`, `/agent/merge-conflict`, `/agent/file`, `/agent/directory`) and OpenRequest (`/agent/shared/<uuid>`, `/agent[?prompt=…]`) partition the `/agent/` suffix space cleanly. For OK, this would mean: **IF** you want `openknowledge://page/<slug>` to serve both external deep-link ("open this page") AND internal mention ("inline this page's content as context"), you can do it — provided you either route through a single parser that dispatches on subpath, or you maintain two parsers with disjoint prefix sets. The single-parser-with-unified-dispatch is safer (a typed test can enumerate all variants and prove no prefix collisions); Zed's two-parser approach requires vigilance because new external paths (`/agent/review/…`) could shadow mention paths (`/agent/review-mode-selection`) without warning.

### Lesson B: Adopt Zed's `ExternalSourcePrompt` newtype pattern at every external-URL boundary
Every payload that enters OK via an external URL (query param, path segment) should pass through a newtype whose only constructor sanitizes. Specifically for OK: if `openknowledge://page/<slug>?prompt=<text>` ever seeds an agent task, `<text>` must be wrapped in `ExternalPrompt::new(...)` that strips bidi overrides, control characters, and caps newline runs. This is the single cheapest and highest-ROI pattern to steal from Zed.

### Lesson C: Graceful-degrade unknown shapes — never panic, never crash
MentionUri::parse falls through to `Err(anyhow::Error)` which upstream converts to `log::error!` + "render as plain markdown link" (`thread.rs:4069-4071`). OpenRequest::parse falls through to `log::error!("unhandled url: …")` and the request is a no-op. Both patterns say: "an unrecognized shape is not fatal." For OK, this matters when schemes drift across versions — an older client shouldn't crash on a newer URL it doesn't understand.

### Lesson D: Keep mention URIs a data type, not a dispatch hook
Zed's MentionUri produces `serde`-derived structured data. It does NOT carry a callback or trigger a side effect when parsed. The `as_link()` → markdown-link-string and the UI-level click handling (in `MentionCrease`) are separate from parse. For OK, if you add an `openknowledge://...` scheme for internal wiki mentions, the parser should ONLY produce a typed value; the decision to "open in main editor pane" or "render inline" or "fetch content" belongs to a layer above, so the same typed value can be used for display, serialization, and routing independently.

### Lesson E: Avoid the separate-schemes alternative unless ambiguity actually bites
An alternative Zed could have chosen — `zed-mention://` for internal, `zed://` for external — would eliminate the possibility of a shape like `zed://agent/symbol/foo` being semantically different in different contexts. Zed chose NOT to do this. Benefits of the single-scheme approach: (1) users can copy-paste a mention out of a chat into the URL bar and it renders sensibly-ish (Fetch falls back to raw); (2) the same scheme means only one entry in `Info.plist`/`.desktop`/registry; (3) `to_uri()` / `parse()` round-trip is a single source of truth. Drawbacks: (1) namespace discipline is required forever — you can never add `zed://agent/thread/<uuid>` as an external route without breaking an in-flight mention serialization; (2) security audit has to examine two parsers, not one. For OK's greenfield state, I'd lean toward Zed's single-scheme approach IF the internal mention paths are documented and tested as off-limits for external routing. A scheme-level split (`openknowledge://` external, `openknowledge-mention://` internal) trades namespace safety for boilerplate.

### Lesson F: Watch out for `/shared/` as a collision-prone path segment
Zed's one ambiguity is `/agent/shared/<uuid>` vs `/agent/<anything-else>`. The external parser tests the more-specific `zed://agent/shared/` branch first; falling through reaches `parse_agent_url` (only understands `?prompt=`). Because `parse_agent_url` silently ignores unknown path suffixes, an adversary-supplied `zed://agent/shared/not-a-uuid` (which fails UUID parse) degrades to `OpenRequestKind::AgentPanel { external_source_prompt: None }` (an empty panel open). That's benign but non-obvious. OK should enumerate all `/shared/`, `/new/`, `/action/` segments early so they can't silently shadow future internal-mention segments.

---

## Comparison with other editors

| Editor | Internal scheme | External scheme | Disambiguation mechanism |
|---|---|---|---|
| **Zed** | `zed:///agent/{thread,rule,symbol,diagnostics,selection,pasted-image,untitled-buffer,terminal-selection,git-diff,merge-conflict,file,directory}` via `MentionUri::parse` | `zed://agent/shared/<uuid>`, `zed://agent?prompt=…` via `OpenRequest::parse` | Structural: two parsers, two disjoint code paths, two disjoint subpath sets under `/agent/`. No shared dispatcher. `ExternalSourcePrompt` newtype sanitizes at the external boundary. |
| **VS Code** | `vscode-resource://`, `vscode-webview://` for webview internal refs; `vscode-file://` for local file renders | `vscode://` (with nested `vscode://<extension-id>/...` per extension) | Fully separate schemes. `vscode-resource` is enforced by Electron's scheme-registration layer with custom interceptors. External URLs go through `IOpenerService.open(uri, { trusted: boolean })` with explicit trust flag per [evidence/vscode-windsurf-dia-deep-links.md](./vscode-windsurf-dia-deep-links.md). |
| **Cursor** | None (internal refs do not use URIs) | `cursor://anysphere.cursor-{deeplink,mcp,retrieval,settings}/…` — extension-scoped prefixes | Extension-namespace prefix in the authority segment. Path-level handlers inside each extension. Per [evidence/cursor-desktop-deep-links.md](./cursor-desktop-deep-links.md). |
| **Codex CLI** | `codex://threads/<uuid>` for existing conversation (if implemented) | `codex://new?prompt=…` for external seed (if implemented — see [evidence/codex-recent-announcements.md](./codex-recent-announcements.md)) | Path-level; no internal-ref URI scheme. |
| **Windsurf** | — | `windsurf://` (see [evidence/vscode-windsurf-dia-deep-links.md](./vscode-windsurf-dia-deep-links.md)) | Inherits VS Code's separate-scheme pattern. |

Zed is genuinely the sample's outlier — the only app whose deep-link scheme (`zed://`) is *also* a legitimate payload scheme inside its own live agent conversations.

---

## Negative searches

The following hypotheses were checked and rejected:

- **No trust flag exists on MentionUri.** There is no `trusted: bool` field, no `IOpenURLOptions`-equivalent, no guarded constructor. Trust is inherited structurally from the arrival path.
- **No tool-invocation URI scheme exists.** ACP tool calls flow over JSON-RPC methods, not URIs. `gh search code` for `agent/tool` / `agent/action` paths in MentionUri returns nothing.
- **No unified URL dispatcher.** OpenRequest::parse and MentionUri::parse are never called from the same function. There is no `handle_url(url)` that tries both.
- **No MentionUri variant for MCP tools.** MCP servers are configured out-of-band in settings; their output flows into agent conversations as ordinary tool-call blocks, not as URI-addressed context.
- **No evidence of a known CVE or security advisory** on MentionUri parsing in Zed's [security advisories page](https://github.com/zed-industries/zed/security/advisories). Sanitization discipline appears to have held so far.

---

## Gaps / follow-ups

1. **Observation, not verified:** I couldn't confirm whether the macOS `open-url` delivery path passes URLs to `OpenListener` directly, or whether it routes through `handle_cli_connection` first. `crates/zed/src/zed/open_listener.rs:472` shows the CLI path; the Cocoa AppleEvent handler wiring is likely in `crates/zed/src/main.rs` or a platform-specific module. For OK this is a minor point — the parser separation holds regardless.
2. **The `zed://` vs `zed:///` (authority-present vs authority-absent) asymmetry** is real: `to_uri()` produces `zed:///agent/...` with empty authority; `OpenRequest::parse` uses `url.strip_prefix("zed://agent")` which matches both. If a mention URI is ever copy-pasted into the OS URL handler, the external parser would accept its prefix. This is a soft collision risk I didn't fully exercise.
3. **ACP v0.10.x → v0.11.x upgrade cadence:** crate versions bump roughly every 2-3 weeks. MentionUri serde representations are implicitly part of the wire format; a non-back-compatible change in variant tags would break cross-version ACP clients. No explicit versioning discipline visible in the Rust source comments.
4. **`@zed-industries/claude-code-acp` source would tell us** exactly how an ACP agent emits `ResourceLink` URIs — i.e., what MentionUri shapes a third-party agent could synthesize to seed into Zed's UI. This is the right place to look for "what can an adversarial agent construct?" I didn't dive into it; it's a follow-up for if OK wants to implement an ACP agent itself.
5. **Unverified claim in prior evidence:** the `zed-and-jetbrains-deep-links.md` summary at line 38 states `zed://agent?prompt=<text>` is a *first-class* route. PR #47959 (merged 2026-01-29) confirms this; the implementation is `parse_agent_url` at `open_listener.rs:213-223`. The feature is ~11 weeks old as of 2026-04-17.
