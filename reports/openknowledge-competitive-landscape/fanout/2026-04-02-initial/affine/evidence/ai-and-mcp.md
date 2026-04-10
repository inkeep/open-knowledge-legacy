---
title: "AFFiNE AI Features and MCP/Agent Integration"
type: technical-analysis
sources:
  - url: https://github.com/toeverything/AFFiNE/issues/13262
    title: "Feature Request: API/MCP Support - GitHub Issue"
  - url: https://github.com/DAWNCR0W/affine-mcp-server
    title: "AFFiNE MCP Server by DAWNCR0W"
  - url: https://docs.affine.pro/self-host-affine/administer/ai
    title: "AFFiNE AI Self-Host Documentation"
  - url: https://docs.affine.pro/self-host-affine/administer/getting-ai-api-keys
    title: "Getting AI API Keys - AFFiNE Docs"
  - url: https://affine.pro/blog/whats-new-dec-update
    title: "AFFiNE What's New: December Update"
  - url: https://github.com/toeverything/AFFiNE/discussions/7030
    title: "Support Third-Party AI Providers Discussion"
date_collected: 2026-04-02
---

# AFFiNE AI Features and MCP/Agent Integration

## AFFiNE AI Capabilities (Built-In)

AFFiNE AI is powered by OpenAI's GPT models and includes:
- **Writing assistant**: Sentence and article generation, rewriting, tone adjustment, spelling/grammar correction
- **Inline AI**: Contextual assistance while editing
- **Chat with AI**: Conversational interface within the workspace
- **Mind map generation**: Convert outlines to visual mind maps
- **Presentation facilitation**: Transform ideas into visual works
- **Image generation**: Via DALL-E integration
- **Canvas AI**: Generate mind maps and process charts from brainstorming on whiteboards

### AI Model Support
- OpenAI GPT models (primary)
- DALL-E for image generation
- Claude Sonnet 4.5 support added (December 2025 update)
- Gemini 2.5 Pro support added (December 2025 update)

### Self-Hosted AI
Self-hosted AFFiNE requires users to provide their own API keys for AI features (OpenAI, etc.). This is configured via environment variables.

## MCP Integration

### Official MCP Support
As of v0.24-0.25, AFFiNE has added native MCP support:
- Available in Settings -> Integrations -> MCP Server
- Generates JSON configuration for tools like Cursor
- Personal access token support introduced in v0.24

### Community MCP Server (affine-mcp-server by DAWNCR0W)
A comprehensive MCP server exposing AFFiNE's GraphQL API with **76 focused tools**:

**Workspace Management:**
- List, read, create, update, delete workspaces
- Document hierarchy as tree
- Identify orphaned documents

**Document Operations:**
- Search with pagination, title search, tag-based filtering
- Create from markdown, templates, or duplication
- Read/write content via WebSocket
- Append blocks (text, code, media, databases)
- Publishing (make public or revoke)
- Metadata updates, tag management, backlinks

**Database Workflows:**
- Create database blocks, inspect schemas
- Add/update/delete rows, manipulate cell values

**Organization:** Collections, folders, sidebar data management

**Additional:** Comments CRUD, version history, user queries, blob upload/delete, notifications

### Authentication
- Personal access token (preferred)
- Session cookies
- Email/password (self-hosted only; blocked on cloud by Cloudflare)

### Transport Options
- stdio (default for Claude Desktop, Cursor)
- HTTP on `/mcp` with bearer-token or OAuth mode

## API Access

### GraphQL API
- Endpoint: `https://app.affine.pro/graphql`
- Exposes workspace, document, user, and mutation operations
- Schema discoverable at the endpoint

### Limitations
- No REST API (GraphQL only)
- No official public API documentation (as of early 2026)
- Community frustration: "The silence about API from the maintainers is deafening" (from GitHub issue #13262)
- WebSocket operations required for real-time document editing

## Agent-Readiness Assessment

### What Exists
1. GraphQL API for CRUD operations on workspaces/documents
2. MCP server with comprehensive tooling (76 tools)
3. Personal access tokens for authentication
4. WebSocket-based document editing for real-time content manipulation

### What's Missing for True Agent-Native
1. **No block-level API**: Agents can't surgically modify individual blocks; they work with full document content
2. **CRDT opacity**: The Yjs CRDT layer is not exposed to external agents; they interact via GraphQL/markdown, not CRDT operations
3. **No event/webhook system**: Agents can't subscribe to document changes
4. **No agent-specific primitives**: No concept of agent identity, attribution, or agent-authored content
5. **AI is additive, not structural**: AI features bolt onto the editor rather than being native to the document model
