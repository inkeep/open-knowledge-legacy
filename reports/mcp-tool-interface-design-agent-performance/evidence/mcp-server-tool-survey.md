# Evidence: MCP Server Tool Interface Design Survey

**Dimension:** D2 — How existing MCP servers design their tool interfaces
**Date:** 2026-04-02
**Sources:** Official MCP repos, GitHub MCP server, Notion MCP, Confluence MCP, Mintlify MCP, Context7, Filesystem MCP, Mem0 MCP, GitBook MCP, Philschmid blog, MCPBundles blog, AWS Prescriptive Guidance

---

## Key files / pages referenced

- https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem — Official Filesystem MCP (11 tools)
- https://github.com/github/github-mcp-server — GitHub MCP Server (~26 tools, 5 toolsets)
- https://developers.notion.com/guides/mcp/mcp-supported-tools — Notion MCP (12+ tools)
- https://github.com/sooperset/mcp-atlassian — Confluence MCP (~7 tools)
- https://www.mintlify.com/docs/ai/model-context-protocol — Mintlify MCP (2 tools)
- https://github.com/upstash/context7 — Context7 MCP (2 tools, 51.6K stars)
- https://github.com/mem0ai/mem0-mcp — Mem0 MCP (2 tools)
- https://github.com/rickysullivan/gitbook-mcp — GitBook MCP (12 tools)
- https://www.philschmid.de/mcp-best-practices — Philschmid MCP best practices
- https://www.mcpbundles.com/blog/mcp-tool-design-pattern — Six-tool pattern
- https://docs.aws.amazon.com/prescriptive-guidance/latest/mcp-strategies/mcp-tool-strategy-organization.html — AWS guidance

---

## Findings

### Finding: MCP servers cluster into three archetypes by tool count
**Confidence:** CONFIRMED
**Evidence:** Survey of 9 MCP servers across categories

| Server | Category | Tool Count | Pattern |
|--------|----------|------------|---------|
| Mintlify | Docs/KB | 2 | search + get_page |
| Context7 | Docs/KB | 2 | resolve-library-id + get-library-docs |
| Mem0 | Memory | 2 | add_memory + search_memory |
| Confluence (community) | Knowledge | ~7 | ls_spaces, get_space, ls_pages, get_page, search, ls_comments, add_comment |
| GitHub (official) | DevOps | ~26 | 5 toolsets: context, issues, pull_requests, repos, users |
| Notion (official) | Productivity | 12+ | notion-search, notion-query-data-sources, retrieve-a-page, etc. |
| GitBook | Docs | 12 | search_content, get_page, get_code_blocks, refresh_content, etc. |
| Filesystem (Anthropic) | System | 11 | read_file, write_file, list_directory, search_files, etc. |
| MCP Filesystem (official) | System | 14 | read_text_file, read_media_file, read_multiple_files, list_directory, etc. |

**Three archetypes emerge:**
1. **Minimal (2-3 tools):** search + read. Mintlify, Context7, Mem0. Highest stars (Context7: 51.6K). Easiest for agents to use.
2. **Moderate (5-15 tools):** Domain-specific CRUD. Confluence, Filesystem, GitBook. Standard REST-like mapping.
3. **Comprehensive (20-30+ tools):** Full platform API surface. GitHub, Notion. Risk of tool explosion.

**Implications:** The most popular MCP servers by GitHub stars tend to be minimal. Two well-designed tools can be more effective than 20 mediocre ones.

---

### Finding: Two dominant naming conventions exist
**Confidence:** CONFIRMED
**Evidence:** AWS Prescriptive Guidance, Philschmid, MCP community

1. **domain_noun_verb** (AWS recommended): `github_issue_create`, `github_pullrequest_list`
   - Prevents collisions, clusters alphabetically, facilitates LLM scanning
   
2. **service_action_resource** (Philschmid): `slack_send_message`, `linear_list_issues`
   - Action-oriented, more natural for LLMs

Both use snake_case. Context7 uses kebab-case (`resolve-library-id`). No standardized convention in the MCP spec itself.

**Implications:** Naming matters for agent performance — Anthropic notes "prefix vs. suffix approaches produce non-trivial effects on tool-use evaluations." Domain prefixing prevents collisions across servers.

---

### Finding: 5-15 tools per server is the recommended range
**Confidence:** CONFIRMED
**Evidence:** Philschmid blog, AWS guidance, MCPBundles blog

- Philschmid: "5-15 tools per server"
- AWS: "Do not exceed 50 tools per single MCP server"
- MCPBundles: Rebuilt Weaviate from 12 tools to 6 using "six-tool pattern"
- Cursor has a hard limit of 40 MCP tools total
- OpenAI recommends "fewer than 20 functions at any one time"

**Implications:** There is strong convergence on the principle that fewer, well-designed tools outperform many atomic tools. The sweet spot is 5-15 per server, with 2-6 being the emerging optimum for knowledge/docs servers.

---

### Finding: Documentation MCP servers converge on search + read as core pattern
**Confidence:** CONFIRMED
**Evidence:** Mintlify, Context7, Mem0, GitBook

All documentation-focused MCP servers expose at minimum:
1. A **search/discovery** tool (semantic or keyword)
2. A **read/retrieve** tool (full content by identifier)

Some add:
3. A **resolve/browse** tool (navigate hierarchy)
4. A **metadata/overview** tool (corpus orientation)

This maps directly to the progressive disclosure pattern: discover → browse → read.

**Implications:** The 2-tool minimum (search + read) is the established baseline for documentation MCP servers. Adding overview and browse creates the 4-tool progressive disclosure pattern.

---

## Negative searches

* Searched for published data on MCP tool count vs agent accuracy correlation — no formal study found.
* Searched for head-to-head comparison of minimal vs comprehensive MCP servers on same domain — not found.

---

## Gaps / follow-ups

* Need to investigate whether the "six-tool pattern" from MCPBundles has empirical validation beyond anecdotal evidence.
* The naming convention impact on tool selection accuracy deserves deeper investigation — Anthropic mentions non-trivial effects but doesn't publish data.
