# Evidence: MCP as Knowledge Access Protocol

**Dimension:** D3 — MCP positioned as how agents access knowledge; docs-as-MCP patterns
**Date:** 2026-04-02
**Sources:** gitbook.com, developers.notion.com, atlassian.com, developers.googleblog.com, microsoft.github.io, docsie.io

---

## Key Sources Referenced

- https://www.gitbook.com/blog/new-in-gitbook-september-2025 — GitBook auto-MCP announcement
- https://gitbook.com/docs/developers/gitbook-api/api-reference/docs-sites/site-mcp-servers — GitBook MCP API
- https://developers.notion.com/docs/mcp — Notion MCP
- https://www.atlassian.com/blog/announcements/remote-mcp-server — Atlassian MCP
- https://developers.googleblog.com/introducing-the-developer-knowledge-api-and-mcp-server/ — Google Developer Knowledge MCP
- https://microsoft.github.io/agent-academy/special-ops/ms-learn-mcp/ — Microsoft Learn MCP

---

## Findings

### Finding: GitBook auto-generates an MCP server for every published docs site
**Confidence:** CONFIRMED
**Evidence:** GitBook blog (September 2025), GitBook API docs

Every published GitBook site automatically includes an MCP server accessible at `<site-url>/~gitbook/mcp`. No configuration required. Users can copy the MCP link from Page actions menu and connect to VS Code, Cursor, etc. Admins can enable/disable per-site.

This is the clearest example of "docs-as-MCP" — every documentation site becomes an MCP server that agents can query.

**Implications:** This pattern makes every docs site an agent-accessible knowledge base without any additional tooling. It's the closest thing to "every article could be a skill" in the reference knowledge space.

### Finding: Major knowledge platforms have shipped MCP servers — MCP is becoming the universal knowledge access protocol
**Confidence:** CONFIRMED
**Evidence:** Notion, Atlassian, Google, Microsoft MCP announcements

- **Notion MCP**: OAuth-based, full workspace access (read/write), one-click setup
- **Atlassian Confluence MCP**: Remote MCP server for Jira + Confluence, CQL search
- **Google Developer Knowledge API + MCP**: Canonical gateway to Google's developer docs
- **Microsoft Learn MCP**: Real-time doc search, live documentation
- **Document360**: Released MCP server March 2026

The pattern is converging: every major knowledge/docs platform now exposes an MCP server. MCP is positioned not just as "how agents use tools" but as "how agents access knowledge."

### Finding: The MCP-as-knowledge-access pattern is orthogonal to skills
**Confidence:** INFERRED
**Evidence:** LlamaIndex "Skills vs MCP" analysis, Armin Ronacher analysis, cra.mr analysis

Multiple analysts converge on the same distinction:
- Skills = procedural knowledge (HOW to do things)
- MCP = connectivity + retrieval (ACCESS to knowledge and tools)
- The two are complementary layers: "Skills teach you to cook, MCP provides the instruments"

LlamaIndex: "MCP solved 'how do agents talk to tools'... skills address how to package and share workflows and best practices."

**Implications:** An agent-native knowledge platform would need BOTH: skills for operationalized procedures AND MCP for access to reference knowledge.

---

## Gaps / Follow-ups

- Technical details of GitBook's MCP auto-generation not documented
- No evidence of docs platforms auto-generating skills (only MCP servers)
