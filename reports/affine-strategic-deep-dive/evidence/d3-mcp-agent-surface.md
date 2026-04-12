# Evidence: D3 — MCP surface and agent co-creation primitives

**Dimension:** D3 (P0 Deep)
**Date:** 2026-04-11
**Sources:** toeverything/AFFiNE release notes + issue tracker, DAWNCR0W/affine-mcp-server (community server), Glama schema registry, AFFiNE docs

---

## Key sources

- [GitHub Issue #13262 "API/MCP Support" (toeverything/AFFiNE)](https://github.com/toeverything/AFFiNE/issues/13262) — feature request still open as of April 2026
- [DAWNCR0W/affine-mcp-server](https://github.com/DAWNCR0W/affine-mcp-server) — community MCP server, now v1.13.0 (April 10, 2026)
- [Glama schema: AFFiNE MCP server tools](https://glama.ai/mcp/servers/DAWNCR0W/affine-mcp-server/schema) — canonical tool catalog
- [AFFiNE v0.26.3 changelog](https://github.com/toeverything/AFFiNE/releases) — "Fix MCP token cannot display"
- AFFiNE v0.24+ release notes — "feat(server): support access token" (PATs)

---

## Findings

### Finding: No official first-party MCP server — only a community implementation

**Confidence:** CONFIRMED
**Evidence:**
- Searched toeverything GitHub org for `packages/mcp`, `apps/mcp`, `server/mcp` → NOT FOUND
- AFFiNE's in-product MCP UI (Settings → Integrations → MCP Server) generates JSON config for *external* MCP servers (Cursor, Claude Desktop). It does NOT host a server.
- The only production MCP server for AFFiNE is `DAWNCR0W/affine-mcp-server` — a community project by one maintainer, currently v1.13.0.
- v0.26.3's "Fix MCP token cannot display" is a UI bug in the config-export flow, not server functionality.

**Implication:** The landscape report's "Community (76 tools, R+W)" label was correct. The AFFiNE team has not filled the official-MCP-server gap. The community's leading implementation is a single-maintainer project — high bus factor, no vendor SLA.

**Correction to landscape matrix:** The "76 tools" count is stale. Current canonical tool count varies by counting method (see below).

---

### Finding: Tool catalog is broad and growing — but the "76 tools" count is imprecise

**Confidence:** CONFIRMED (with caveat on counting method)
**Evidence:**
- Glama schema for the community server lists ~36 canonical atomic tools (v1.13.0, April 2026).
- Tool manifest fetch surfaced ~107 entries when semantic workflows + batch operations are included.
- v1.10+ added semantic workflows (`semantic_page`, `compose_database_from_intent`, `analyze_doc_fidelity`) and batch operations.
- Earlier v1.3 had ~31–32 tools after legacy `affine_*` aliases were consolidated.
- The landscape report's "76" appears to have been a mid-version snapshot; today the number is either "~36 canonical" or "100+ including workflows" depending on counting.

**Tool catalog (DAWNCR0W v1.13.0, canonical subset):**

| Category | Read-only | Read-write |
|---|---|---|
| Workspaces | `list_workspaces`, `get_workspace` | `create_workspace`, `update_workspace`, `delete_workspace` |
| Documents | `list_docs`, `get_doc`, `search_docs` | `create_doc`, `publish_doc`, `revoke_doc`, `append_block`, `append_paragraph`, `update_doc_title`, `delete_doc`, `move_doc` |
| Comments | `list_comments` | `create_comment`, `update_comment`, `resolve_comment`, `delete_comment` |
| Version history | `list_histories` | (none for writes — history is read-only) |
| Notifications | `list_notifications`, `read_notification` | `read_all_notifications` |
| Auth / identity | `current_user`, `list_access_tokens` | `sign_in`, `update_profile`, `generate_access_token`, `revoke_access_token` |
| Blobs | (none — reads are direct URL) | `upload_blob`, `delete_blob`, `cleanup_blobs` |
| Databases | `read_database_columns`, `read_database_cells` | `add_database_row`, `update_database_row`, `delete_database_row`, `add_database_column` |
| Collections | (none) | `create_collection`, `update_collection`, `delete_collection` |

**Implication:** The functional CRUD surface is comprehensive. AFFiNE-via-DAWNCR0W can be driven by agents for most routine workspace/document/database operations. This is a real and useful capability — but it is *CRUD*, not *co-creation*. The primitives that follow (D3.3–D3.7) are all about whether agents can participate as distinct actors, not just execute reads and writes.

---

### Finding: Authentication model is PAT-scoped to human user — no agent identity

**Confidence:** CONFIRMED
**Evidence:**
- DAWNCR0W README: agents authenticate with the owner's personal access token (PAT) or session cookie.
- `generate_access_token` / `revoke_access_token` tools take no scoping parameters — tokens are all-or-nothing under the authenticated user's workspaces.
- v0.24 changelog: "feat(server): support access token" — per-user PAT, no per-agent concept.
- AFFiNE docs on self-hosted access tokens: no mention of per-workspace or per-page scoping.

**Implication:** AFFiNE treats agents as extensions of the human user. There is no way to:
- Issue agent-specific credentials with their own audit trail
- Revoke an agent's access without revoking the human's
- Differentiate agent vs. human writes at the auth layer

**This is structurally the opposite of open-knowledge's co-creation model** (where agents have identity, attribution, and scoped capabilities).

---

### Finding: No attribution in content history

**Confidence:** NOT FOUND (documented negative search)
**Evidence:**
- BlockSuite's CRDT uses Yjs `client_id` internally (standard yjs pattern) — but AFFiNE's UI and API do not expose client-level attribution.
- `list_histories` tool returns document snapshots + update timestamps, not "who made each edit."
- Searched AFFiNE issues and changelogs for "attribution", "audit log", "who made change" → no agent-aware attribution features.
- v0.26.3 changelog contains no attribution-related entries.
- Prior landscape report's evidence explicitly noted: "No agent-specific primitives. No concept of agent identity, attribution, or agent-authored content."

**Negative searches:** "AFFiNE BlockSuite client_id author attribution", "AFFiNE audit log agent" → no features found.

**Implication:** When an agent appends a block via the MCP server, the edit is indistinguishable from a human edit in any user-visible surface. For open-knowledge's thesis (agent writes as first-class, reviewable, revertable events), AFFiNE's persistence layer provides no primitives to build on. You'd have to re-architect the attribution model on top of BlockSuite, not extend it.

---

### Finding: No staging / draft / review primitives

**Confidence:** NOT FOUND (documented negative search)
**Evidence:**
- MCP tool catalog contains no `create_draft`, `propose_change`, `request_review`, or `pending_changes` tool.
- AFFiNE docs have no "draft mode", "staging", "pending changes", or "review workflow" concepts.
- The only "pending" concept in the tool surface is *notifications* (`list_notifications`, `read_notification`) — unrelated to content staging.
- v0.26.3 changelog: no staging-related entries.

**Negative searches:** "AFFiNE draft", "AFFiNE review workflow", "AFFiNE pending changes" → not found.

**Implication:** All agent writes are immediate and live. There is no pathway for an agent to say "here's a proposed change, please review before I apply it." For the agent-human co-creation pattern open-knowledge is building, AFFiNE lacks the most fundamental primitive.

---

### Finding: No event subscription — agents must poll

**Confidence:** NOT FOUND (documented negative search)
**Evidence:**
- DAWNCR0W MCP server tool catalog: all tools are request-response CRUD. No `subscribe_to_*` or `watch_*` tools.
- AFFiNE's WebSocket transport is used for **CRDT state sync** (document editing), not for **change-event push** to external consumers.
- Landscape report's prior evidence: "No event/webhook system: Agents can't subscribe to document changes."

**Negative searches:** "AFFiNE webhooks", "AFFiNE event subscription", "AFFiNE push notification" → not found.

**Implication:** An agent watching for changes to a document must poll `get_doc` / `list_histories` on a timer. This is expensive at scale and introduces latency for event-driven workflows (e.g., "when human posts a question in page X, agent should respond"). Open-knowledge's architecture (yjs awareness + server-sent events to agents) can deliver what AFFiNE cannot.

---

### Finding: No scoped permissions — tokens are all-or-nothing

**Confidence:** NOT FOUND (documented negative search)
**Evidence:**
- `generate_access_token` takes no scope parameters.
- No mechanism to issue tokens valid only for specific workspaces, pages, or sub-trees.
- No read-only token mode.
- Landscape report prior evidence: "No fine-grained access control at block level."

**Negative searches:** "AFFiNE PAT scope", "AFFiNE token permission workspace", "AFFiNE token page-level" → not found.

**Implication:** An agent granted write access has write access to the full workspace. There is no "this agent can edit only /drafts, read-only on /published" capability. Open-knowledge's scoped-permission model can be positioned as a governance feature AFFiNE structurally lacks.

---

## The seven co-creation primitive scoreboard

| Primitive | open-knowledge target | AFFiNE state | Gap |
|---|---|---|---|
| 1. Official MCP server | First-party | Community only (1 maintainer, DAWNCR0W) | Present |
| 2. Agent identity | Distinct from human | Uses human's PAT | Present |
| 3. Attribution in history | Per-edit, agent-marked | Document snapshots only | Present |
| 4. Staging/draft/review | Review before apply | All writes immediate | Present |
| 5. Event subscription | Push to agents | Polling only | Present |
| 6. Scoped permissions | Per-workspace / per-page | All-or-nothing | Present |
| 7. CRUD API surface | Complete | ~36 canonical tools, R+W | *Not* a gap — AFFiNE has this |

**6 of 7 primitives are absent** — and the 7th (CRUD surface) is the one that CRUD-without-co-creation platforms all ship. The gaps are not peripheral; they are the entire co-creation architecture.

---

## Gaps / follow-ups

- A hands-on agent-identity test (attempt to set `createdBy: agent-alice` on a block write via the MCP) would verify the "no agent identity" finding at the protocol level rather than the documentation level.
- The community MCP server's roadmap might close some gaps (e.g., if DAWNCR0W adds a draft-mode wrapper). Worth re-checking as a Path C refresh.
- AFFiNE's AI features inside the product likely write to BlockSuite directly, not via MCP. A source-code pass on how in-product AI attributes its writes could change the attribution finding — unlikely to, but worth noting.
