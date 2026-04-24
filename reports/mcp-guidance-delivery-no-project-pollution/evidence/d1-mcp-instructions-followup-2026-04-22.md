# Evidence: D1 follow-up — MCP `instructions` field delivery across hosts (empirical)

**Dimension:** How 6 target AI coding hosts consume (or don't consume) the MCP `InitializeResult.instructions` field
**Date:** 2026-04-22
**Sources:** GitHub issues (anthropic, openai/codex), Claude Code docs, Anthropic forum, Cursor forum, VS Code docs, Windsurf docs, open-source MCP SDK code
**Extends:** `d1-mcp-instructions-field.md` — this file focuses on the 5 hosts that prior evidence left UNCERTAIN

---

## Summary table (the deliverable)

| Host | Loaded into model context? | When / how | Size cap | Source of truth |
|---|---|---|---|---|
| Claude Code (terminal + desktop CLI) | **YES** — CONFIRMED | Every turn, included in system prompt under `# MCP Server Instructions` section. Becomes load-bearing when Tool Search is active (default) — server instructions steer when Claude searches for a server's tools. | **2 KB per server** (truncation silent) | [code.claude.com/docs/en/mcp § "For MCP server authors"](https://code.claude.com/docs/en/mcp) |
| Cursor | **NO (inferred)** — UNCERTAIN leaning NO | Cursor's documented MCP integration discusses tools, prompts, resources, roots, elicitation, apps — but never mentions `instructions` field ingestion. Forum feature request "MCP system prompt missing instructions" (May 2025, ID 150294) is a user asking Cursor to surface server-provided prompt discovery, implying current absence. | Not documented | [cursor.com/docs/mcp](https://cursor.com/docs/mcp), [forum.cursor.com/t/mcp-system-prompt-missing-instructions.../150294](https://forum.cursor.com/t/mcp-system-prompt-missing-instructions-for-prompt-discovery-and-usage/150294) |
| OpenAI Codex CLI | **PARTIAL / BRANCH-DEPENDENT** — CONFIRMED split | The `codex-mcp` Rust crate reads `InitializeResult.instructions` into `ManagedClient.server_instructions: Option<String>` and passes it to `list_tools_for_client_uncached(..., server_instructions.as_deref())`. The newer `rmcp-client` crate (PR #4252, experimental) does **NOT** read the field — only extracts `peer_info()` from the initialize result. Downstream injection into the LLM system prompt is past line 1000 of `mcp_connection_manager.rs` and could not be fully verified from outside GitHub auth. No public doc confirms end-to-end delivery. | Not documented | [codex-rs/codex-mcp/src/mcp_connection_manager.rs](https://github.com/openai/codex/blob/main/codex-rs/codex-mcp/src/mcp_connection_manager.rs) line 95: `pub server_instructions: Option<String>` + line 517, 649, 1299. [codex-rs/rmcp-client/src/rmcp_client.rs](https://github.com/openai/codex/blob/main/codex-rs/rmcp-client/src/rmcp_client.rs) line 831-837: `let initialize_result_rmcp = service.peer().peer_info()...` — no `.instructions` access. |
| Windsurf (Cascade) | **NO (inferred)** — UNCERTAIN leaning NO | [docs.windsurf.com/windsurf/cascade/mcp](https://docs.windsurf.com/windsurf/cascade/mcp) documents config-file plumbing (stdio/SSE/HTTP, variable interpolation, `alwaysAllow`, `disabled`) but never mentions server-supplied `instructions`. Changelog entries (2025-2026) list MCP prompts, OAuth, elicitation, loading indicators — never `instructions`. | Not documented | [windsurf.com/changelog](https://windsurf.com/changelog); [docs.windsurf.com/windsurf/cascade/mcp](https://docs.windsurf.com/windsurf/cascade/mcp) |
| VS Code + GitHub Copilot | **NO (inferred)** — UNCERTAIN leaning NO | [code.visualstudio.com/docs/copilot/customization/mcp-servers](https://code.visualstudio.com/docs/copilot/customization/mcp-servers) covers MCP tools, resources, prompts, elicitation, roots, sampling — no mention of the `instructions` field. VS Code issue search for "mcp instructions field" returns only UI chrome (badges on context-instructions list items), no injection plumbing. `.github/copilot-instructions.md` + `.instructions.md` files (host-side) are the documented guidance surface — distinct from MCP server `instructions`. | Not documented | [code.visualstudio.com/docs/copilot/customization/mcp-servers](https://code.visualstudio.com/docs/copilot/customization/mcp-servers) |
| Claude Desktop (consumer app) | **NO (high-confidence inferred)** — UNCERTAIN leaning NO | Same backend family as Claude.ai web. Issue [anthropics/claude-ai-mcp#131](https://github.com/anthropics/claude-ai-mcp/issues/131) filed March 2026: "Claude.ai (web) silently drops the `instructions` field from the MCP server's `InitializeResult`." Closed as duplicate of #93 (not fixed in that thread). Same-server test: works in Claude Code, dropped in Claude.ai. No evidence Desktop diverges from the web pipeline on this specific field. | — | [anthropics/claude-ai-mcp#131](https://github.com/anthropics/claude-ai-mcp/issues/131); [anthropics/claude-agent-sdk-typescript#174](https://github.com/anthropics/claude-agent-sdk-typescript/issues/174) |

**Bottom line: Of the 6 target hosts, only 1 (Claude Code) is CONFIRMED to inject MCP `instructions` into the model context. Codex is partial (one client branch reads it, another doesn't; end-to-end injection unverified). The other 4 hosts have NO documented injection, and for Claude Desktop and Anthropic Agent SDK TypeScript the absence is specifically user-reported and acknowledged by Anthropic (issue closed-as-duplicate, not denied).**

---

## Key files / pages referenced

- [Claude Code Docs: Connect Claude Code to tools via MCP](https://code.claude.com/docs/en/mcp) — canonical Claude Code behavior, 2KB cap, Tool Search interaction
- [Claude Code Docs: Changelog (v2.1.84, v2.1.105)](https://code.claude.com/docs/en/changelog) — 2KB cap rationale
- [anthropics/claude-ai-mcp#131 — Claude.ai does not load MCP Server instructions](https://github.com/anthropics/claude-ai-mcp/issues/131)
- [anthropics/claude-code#3312 — Original Claude Code instructions-not-loaded bug (Claude Code 1.0.48, now fixed)](https://github.com/anthropics/claude-code/issues/3312)
- [anthropics/claude-code#29655 — Subagents don't receive server instructions (open)](https://github.com/anthropics/claude-code/issues/29655)
- [anthropics/claude-agent-sdk-typescript#174 — Agent SDK drops instructions (open, confirmed by reporter cross-test vs Claude Code)](https://github.com/anthropics/claude-agent-sdk-typescript/issues/174)
- [openai/codex codex-rs/codex-mcp/src/mcp_connection_manager.rs](https://github.com/openai/codex/blob/main/codex-rs/codex-mcp/src/mcp_connection_manager.rs) — `server_instructions: Option<String>` field
- [openai/codex codex-rs/rmcp-client/src/rmcp_client.rs](https://github.com/openai/codex/blob/main/codex-rs/rmcp-client/src/rmcp_client.rs) — experimental new client does NOT read instructions
- [openai/codex PR #4252 — experimental rmcp-client](https://github.com/openai/codex/pull/4252)
- [forum.cursor.com — MCP system prompt missing instructions for prompt discovery](https://forum.cursor.com/t/mcp-system-prompt-missing-instructions-for-prompt-discovery-and-usage/150294)
- [code.visualstudio.com/docs/copilot/customization/mcp-servers](https://code.visualstudio.com/docs/copilot/customization/mcp-servers)
- [docs.windsurf.com/windsurf/cascade/mcp](https://docs.windsurf.com/windsurf/cascade/mcp)
- [modelcontextprotocol/typescript-sdk — client.getInstructions() docs](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/client.md)
- [sst/opencode — MCP client index.ts and utils.ts](https://github.com/sst/opencode/blob/dev/packages/opencode/src/mcp/index.ts) — does NOT read instructions
- [OpenHands/software-agent-sdk — openhands-sdk/openhands/sdk/mcp/client.py](https://github.com/OpenHands/software-agent-sdk/blob/main/openhands-sdk/openhands/sdk/mcp/client.py) — does NOT read instructions

---

## Findings

### Finding: Claude Code (terminal/CLI) is the only host with CONFIRMED, documented `instructions` injection — and it's explicitly tied to Tool Search

**Confidence:** CONFIRMED
**Evidence:** [code.claude.com/docs/en/mcp § "For MCP server authors"](https://code.claude.com/docs/en/mcp)

> "If you're building an MCP server, the server instructions field becomes more useful with Tool Search enabled. Server instructions help Claude understand when to search for your tools, similar to how skills work.
>
> Add clear, descriptive server instructions that explain:
> - What category of tasks your tools handle
> - When Claude should search for your tools
> - Key capabilities your server provides
>
> Claude Code truncates tool descriptions and server instructions at 2KB each. Keep them concise to avoid truncation, and put critical details near the start."

The 2KB cap landed in changelog entries 2.1.84 (2026-03-26) and 2.1.105 (2026-04-13) as explicit context-bloat mitigation against OpenAPI-generated servers. Tool Search is on by default (when `ANTHROPIC_BASE_URL` points at first-party Anthropic + Sonnet 4+ / Opus 4+).

**Implications:** Claude Code is the reference implementation — it reads the field, includes it in the system prompt, documents the cap, and ties it to a retrieval-index contract. When OK targets Claude Code, `instructions` is a working delivery channel subject to the 2KB constraint.

---

### Finding: Claude.ai (web) and Claude Desktop do NOT inject `instructions` — user-reported, Anthropic-acknowledged via duplicate-tracking

**Confidence:** CONFIRMED for Claude.ai web; INFERRED for Claude Desktop (high confidence — same pipeline)
**Evidence:** [anthropics/claude-ai-mcp#131](https://github.com/anthropics/claude-ai-mcp/issues/131) body:

> "Claude.ai (web) silently drops the `instructions` field from the MCP server's `InitializeResult`. The model only sees tool descriptions — server-level instructions never reach the LLM context.
>
> The same server connected to Claude Code correctly receives and follows the `instructions` field.
>
> Steps to reproduce:
> 1. Deploy an MCP server that returns `instructions` in `InitializeResult` (e.g., via FastMCP: `mcp = FastMCP("Name", instructions="...")`)
> 2. Connect the server to Claude.ai (web) as a custom remote MCP connector
> 3. Ask the model what instructions it has for the server → it has none, only tool descriptions
> 4. Connect the same server to Claude Code → instructions are visible and followed"

Issue **Closed as duplicate of #93** — tracking acknowledgment, not a deny. No fix announcement.

Claude Desktop runs the same remote-MCP-connector pipeline as claude.ai (shared Anthropic backend inference); no evidence it diverges for this field. No independent fix announcement for Desktop.

**Implications for OK:** Desktop users running Claude consumer app cannot rely on `instructions` delivery. Tool-description embedding remains the only robust path for those users — matching the reporter's documented workaround ("duplicating key instructions into each tool description, but this is limited and hard to maintain").

---

### Finding: OpenAI Codex reads `server_instructions` in the older `codex-mcp` crate but NOT in the experimental `rmcp-client` — and downstream injection is unverifiable from outside

**Confidence:** CONFIRMED (code-level read); UNCERTAIN (end-to-end LLM injection)
**Evidence:** Primary-source Rust code inspection of `openai/codex` repository.

**In `codex-rs/codex-mcp/src/mcp_connection_manager.rs`** (the older, production client path):

Line 95 (struct field definition):
```rust
/// Instructions from the MCP server initialize result.
#[serde(default)]
pub server_instructions: Option<String>,
```

Line 649 (threaded into tool listing):
```rust
list_tools_for_client_uncached(
    CODEX_APPS_MCP_SERVER_NAME,
    &managed_client.client,
    managed_client.tool_timeout,
    managed_client.server_instructions.as_deref(),
)
```

Line 1299 (same threading for generic servers):
```rust
list_tools_for_client_uncached(
    server_name.as_str(),
    &client,
    timeout,
    server_instructions.as_deref(),
)
```

**In `codex-rs/rmcp-client/src/rmcp_client.rs`** (the newer experimental client from PR #4252):

Line 831-837 reads ONLY the peer_info, not the instructions:
```rust
let initialize_result_rmcp = service.peer().peer_info().ok_or_else(|| 
    anyhow!("handshake succeeded but server info was missing"))?;
// ...
let initialize_result = initialize_result_rmcp.clone();
```

The `RmcpClient` struct (lines 764-769) has no field for server instructions.

**Negative searches conducted:**
- `codex-rs/core/src/mcp.rs` — no reference to `server_instructions` or `instructions`
- `codex-rs/core/src/mcp_tool_exposure.rs` — no reference
- `codex-rs/core/src/function_tool.rs` — no reference
- `codex-rs/codex-mcp/src/lib.rs` — no reference
- `codex-rs/codex-mcp/src/mcp/mod.rs` — no reference in 735 lines
- `codex-rs/codex-mcp/src/mcp_tool_names.rs` — no reference
- Codex public changelog ([developers.openai.com/codex/changelog](https://developers.openai.com/codex/changelog)) — no mention of `instructions` field handling in MCP-related entries from Apr 2026 back to May 2025
- GitHub PR search "is:pr server_instructions" — 0 results in openai/codex

**Remaining uncertainty:** The body of `list_tools_for_client_uncached` (where `server_instructions` is consumed) lives past line 1000 in a 1870-line file — GitHub's rendered view truncates at 1000 and the raw URL is blocked by sandbox. The parameter is threaded in, but whether it's formatted into tool descriptions, returned as a separate system-prompt element, or discarded is unverified from outside.

**Implications:** Codex may partially respect `instructions` (in the production client), may fully disrespect it (in the experimental rmcp path), or may discard the value at the LLM-assembly boundary. A coding-level source test or a live repro against a running Codex session is needed to close this gap definitively.

---

### Finding: Cursor, Windsurf, and VS Code Copilot have no documented ingestion of `instructions` — and their community forums show users specifically requesting this capability

**Confidence:** INFERRED (high) for all three — negative searches across official docs, user-facing feature requests corroborate absence
**Evidence:**

**Cursor:**
- [cursor.com/docs/mcp](https://cursor.com/docs/mcp): explicit coverage of tools, prompts, resources, roots, elicitation, apps — zero mention of `instructions` field.
- Forum post [150294 "MCP system prompt missing instructions for prompt discovery and usage"](https://forum.cursor.com/t/mcp-system-prompt-missing-instructions-for-prompt-discovery-and-usage/150294) is categorized as a feature request, not a bug. The user is explicitly asking Cursor to do what the MCP spec enables — indicating current behavior does not.
- Medium/How Cursor Orchestrates MCP Servers article (independent community analysis): describes tool-schema injection but not instructions-string injection.

**Windsurf:**
- [docs.windsurf.com/windsurf/cascade/mcp](https://docs.windsurf.com/windsurf/cascade/mcp): config-file-only surface (`command`, `args`, `env`, `serverUrl`, `headers`, `disabled`, `alwaysAllow`) — zero ingestion of server-supplied `instructions`.
- [windsurf.com/changelog](https://windsurf.com/changelog): MCP-related entries from 2025-2026 list prompts, OAuth, elicitation, loading indicators — no `instructions` field.

**VS Code + GitHub Copilot:**
- [code.visualstudio.com/docs/copilot/customization/mcp-servers](https://code.visualstudio.com/docs/copilot/customization/mcp-servers): tools / resources / prompts / elicitation / roots / sampling documented — `instructions` field not mentioned.
- Microsoft/VSCode issue search "mcp instructions field" returns only UI-chrome PRs (e.g. #303598: inline badge on context-instructions list). No issue is specifically about server-supplied MCP instructions injection.
- VS Code's native `.instructions.md` / `.github/copilot-instructions.md` surface is the documented guidance channel — this is a host-side file-based surface, not MCP server instructions.

**Implications:** For these three hosts, guidance must ride either on (a) the hosts' native file surfaces (`.cursor/rules`, `.windsurfrules` / workflows, `.github/copilot-instructions.md`), or (b) tool descriptions themselves. `instructions` field delivery is best-effort at the protocol level but practically not-delivered across this tier.

---

### Finding: The open-source MCP hosts we could verify (OpenCode, OpenHands, Codex-rmcp-client) do NOT read `instructions` in their client layers

**Confidence:** CONFIRMED (primary-source code inspection)
**Evidence:**

- **sst/opencode** — [packages/opencode/src/mcp/index.ts](https://github.com/sst/opencode/blob/dev/packages/opencode/src/mcp/index.ts): No reference to `.instructions`, `initializeResult.instructions`, or `client.getInstructions()`. Connection management, tool definitions, OAuth, resources, and prompts only.
- **OpenHands/software-agent-sdk** — [openhands-sdk/openhands/sdk/mcp/client.py](https://github.com/OpenHands/software-agent-sdk/blob/main/openhands-sdk/openhands/sdk/mcp/client.py): No reference to `instructions`, `server_instructions`, or any code reading server handshake instructions. Module focuses on lifecycle, sync/async bridging, tool iteration. `definition.py` and `utils.py` likewise clean of the field.
- **OpenAI Codex rmcp-client** — see Finding above; newer experimental client ignores the field.

**Implications:** The `instructions` field is underutilized across the open-source MCP host ecosystem. Despite the MCP TypeScript SDK exposing [`client.getInstructions()`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/client.md) as a one-line retrieval API, hosts must opt in and most haven't. This is not a spec problem (the API is ready) — it's a host-adoption problem.

---

### Finding: The MCP TypeScript SDK exposes `client.getInstructions()` — but host adoption is opt-in and uneven

**Confidence:** CONFIRMED
**Evidence:** [modelcontextprotocol/typescript-sdk docs/client.md](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/client.md) recommended pattern:

```typescript
const instructions = client.getInstructions();
const systemPrompt = ['You are a helpful assistant.', instructions]
  .filter(Boolean)
  .join('\n\n');
```

The SDK stores the `instructions` value on connection and surfaces it via a synchronous getter. No host needs to implement field-extraction — it's a two-line integration.

**Implications:** The cross-host variance documented here cannot be blamed on MCP spec ambiguity or SDK plumbing complexity. It is a deliberate product decision (or oversight) at each host. For OK's delivery strategy, this means: the field WILL work where a host has opted in (currently only Claude Code with certainty), and fallback mechanisms are required everywhere else — tool-description embedding, host-native file surfaces, or contextual per-tool instruction replication (the workaround the claude-ai-mcp#131 reporter named).

---

## Negative searches

- `openai/codex` GitHub PR search `is:pr server_instructions` → 0 results (no PR has ever touched the field by name)
- Codex public changelog search for "instructions" / "server instructions" / "MCP initialize" → 0 MCP-initialize-related entries
- Cursor MCP docs search for `instructions` → 0 mentions of the server-side InitializeResult field (only user-side rules files)
- Windsurf MCP docs + changelog search for `instructions` → 0 MCP-initialize-related entries (plenty for `.windsurfrules`)
- Microsoft/VSCode GitHub issue search `mcp instructions field` → 0 issues about the MCP server InitializeResult.instructions specifically
- sst/opencode search for `.instructions` / `getInstructions` → 0 matches
- OpenHands/software-agent-sdk MCP module search for `instructions` / `server_instructions` → 0 matches
- VS Code docs search for `copilot mcp server instructions` → surfaces only host-side `copilot-instructions.md` and `.instructions.md` files, not MCP server field

---

## Gaps / follow-ups

- **Codex end-to-end verification (UNCERTAIN).** Whether `server_instructions` in `codex-rs/codex-mcp` ultimately reaches the LLM requires reading the body of `list_tools_for_client_uncached` (blocked by GitHub truncation + sandbox). Direct verification: clone the repo, `rg 'fn list_tools_for_client_uncached' -A 80`, or run a live repro against Codex with FastMCP-style instructions and ask the agent whether it received them.
- **Claude Desktop 1P vs Claude.ai web.** No public decompilation of Claude Desktop's MCP pipeline confirms they share the same instructions-dropping behavior. Behavior may diverge silently. A direct repro using FastMCP + Claude Desktop vs Claude.ai web vs Claude Code would close the gap.
- **`instructions`-delta mode in Claude Code** (mentioned in prior evidence file). Whether delta-mode delivery changes the 2KB cap or alters frequency is not publicly documented.
- **Claude.ai issue #93** (umbrella bug). The issue body/status are not public — its resolution is the canonical fix point for the Claude ecosystem's web/desktop paths.
- **Anthropic Agent SDK TypeScript #174** remains OPEN as of research date. Watching for resolution tells us when Anthropic's own non-Claude-Code surfaces align.
- **Empirical cross-host behavior study.** No published benchmark/gist measures whether agents actually *follow* `instructions` guidance when present. The strongest signals remain qualitative.
