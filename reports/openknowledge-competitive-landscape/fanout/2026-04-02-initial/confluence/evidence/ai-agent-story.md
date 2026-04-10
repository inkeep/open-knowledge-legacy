---
title: "Confluence AI & Agent Story (Rovo, Atlassian Intelligence, MCP)"
source_type: primary
date_collected: 2026-04-02
dimension: "AI / Agent Story"
sources:
  - url: https://www.atlassian.com/blog/announcements/atlassian-rovo-mcp-ga
    title: "Atlassian Rovo MCP Server is now GA"
    type: announcement
  - url: https://support.atlassian.com/atlassian-rovo-mcp-server/docs/supported-tools/
    title: "Rovo MCP Server Supported Tools"
    type: documentation
  - url: https://github.com/atlassian/atlassian-mcp-server
    title: "Atlassian MCP Server GitHub (Apache-2.0)"
    type: github
  - url: https://support.atlassian.com/rovo/docs/agents/
    title: "Rovo Agents Documentation"
    type: documentation
  - url: https://support.atlassian.com/rovo/docs/create-and-edit-agents/
    title: "Create and Edit Rovo Agents"
    type: documentation
  - url: https://support.atlassian.com/organization-administration/docs/atlassian-intelligence-features-in-confluence/
    title: "AI Features in Confluence"
    type: documentation
  - url: https://www.atlassian.com/blog/announcements/atlassian-rovo-mcp-connector-chatgpt
    title: "Rovo MCP Connector for ChatGPT"
    type: announcement
  - url: https://www.atlassian.com/platform/remote-mcp-server
    title: "Extend Atlassian into any AI assistant using MCP"
    type: product_page
  - url: https://www.techtarget.com/searchitoperations/news/366622263/Atlassian-Rovo-pricing-shifts-amid-AI-adoption-struggles
    title: "Atlassian Rovo pricing shifts amid industry AI struggles"
    type: news
---

# Confluence AI & Agent Story

## Three-Layer AI Architecture

### Layer 1: Atlassian Intelligence (Built-in AI features)
Available on Standard, Premium, and Enterprise plans:
- **Page/blog summarization**: One-click summary of any page
- **Comment summarization**: Distill discussion threads
- **Change summarization**: "What changed since I last visited"
- **Smart Link summarization**: AI summary on hover over any linked content
- **Content creation**: Draft from scratch, improve writing, adjust tone, translate
- **Whiteboard AI**: Generate stickies, auto-group by theme
- **Task extraction**: Create Jira issues from highlighted text or full-page scan
- **Natural language search**: Q&A search (beta)
- **Automation**: Create automation rules via natural language

### Layer 2: Rovo (AI Teammate Platform)
- **Rovo Chat**: Conversational interface across Confluence + Jira + connected sources
- **Rovo Search**: Semantic search across organizational knowledge
- **Rovo Agents**: Custom AI agents with specialized knowledge and skills
- **Rovo Studio**: No-code/low-code agent builder

**Rovo Pricing Shift**: Originally $20-24/user/month. As of April 2025, bundled at no additional cost with all paid Confluence/Jira/JSM subscriptions. Available to non-Atlassian users at $5/user/month.

### Layer 3: Rovo MCP Server (External Agent Integration)
- **Status**: Generally Available
- **Architecture**: Cloud-hosted bridge at `https://mcp.atlassian.com/v1/mcp`
- **Authentication**: OAuth 2.1 (3LO) or scoped API tokens
- **License**: Apache-2.0 (open source on GitHub)
- **Supported clients**: Claude, ChatGPT, GitHub Copilot, VS Code, Cursor, Devin, Gemini CLI, and more

## Confluence-Specific MCP Tools

| Tool | Operation |
|------|-----------|
| `createConfluencePage` | Create page or live doc with Markdown body |
| `updateConfluencePage` | Update title, body, location of existing page |
| `getConfluencePage` | Get page by ID, body returned as Markdown |
| `getConfluencePageDescendants` | List child pages under a parent |
| `getConfluenceSpaces` | List spaces (by key, ID, type, status, labels) |
| `getPagesInConfluenceSpace` | List pages in a space with filters |
| `searchConfluenceUsingCql` | Search using Confluence Query Language |
| `createConfluenceFooterComment` | Create footer comment or reply |
| `createConfluenceInlineComment` | Create inline comment tied to selected text |
| `getConfluencePageFooterComments` | List footer comments as Markdown |
| `getConfluencePageInlineComments` | List inline comments |

**Notable**: MCP Server accepts/returns content as **Markdown** (not ADF), performing conversion server-side. This is a pragmatic choice — ADF would be unusable for external agents.

## Custom Rovo Agent Capabilities

- **Knowledge sources**: Confluence spaces, Jira projects, Google Drive folders
- **Deep research**: Agents can perform multi-step research across connected sources
- **Automation integration**: Agents can be triggered by automation rules (e.g., on page publish)
- **Skills**: Pre-built and custom agent actions
- **Scenarios**: Configured knowledge + capability bundles per use case

## Critical Assessment

**Strengths:**
- MCP server is a genuine agent integration surface — GA, well-documented, Apache-2.0
- Rovo bundling at no extra cost removes adoption friction
- Markdown I/O on MCP tools is agent-friendly
- Custom agent builder is reasonably accessible

**Weaknesses/Gaps:**
- MCP tools are CRUD-level — no deep structural operations (reorder sections, merge pages, transform content)
- No webhook/event streaming for agents to react to changes in real-time
- Agents cannot modify ADF at the node level — only full-page read/write
- All AI compute is Atlassian-hosted (no bring-your-own-model)
- Rovo agents are confined to Atlassian's AI infrastructure
- CQL search is powerful but not full-text — agents inherit the same search quality limitations as humans

**Strategic read**: Atlassian is building **AI features ON TOP OF Confluence** and **MCP as an integration bridge**, not building Confluence as an agent-native substrate. The knowledge layer remains human-first with AI as an assistant, not a co-author with native read/write at the document structure level.
