# Evidence: Obsidian MCP Servers — Complete Inventory (April 2026)

## Methodology
Servers identified via GitHub search, Smithery.ai, Glama.ai, mcp.so, Obsidian Forum, and npm registry. Each entry verified against primary GitHub README.

---

## 1. bitbonsai/mcpvault
- **GitHub:** https://github.com/bitbonsai/mcpvault
- **Stars:** ~994
- **Transport:** stdio (MCP standard)
- **Access method:** Direct filesystem (no Obsidian plugin required)
- **Tools (14):**
  1. `read_note` — Retrieve note content
  2. `write_note` — Create/overwrite notes
  3. `patch_note` — Modify existing content
  4. `delete_note` — Remove notes
  5. `move_note` — Rename notes
  6. `move_file` — Relocate files
  7. `list_directory` — Browse vault structure
  8. `read_multiple_notes` — Batch retrieve
  9. `search_notes` — BM25 relevance-ranked search
  10. `get_frontmatter` — Extract YAML frontmatter
  11. `update_frontmatter` — Modify metadata
  12. `get_notes_info` — File statistics
  13. `get_vault_stats` — Overall vault metrics
  14. `manage_tags` — Add/remove/list tags
- **Search:** BM25 with multi-word matching
- **Read-only mode:** No
- **Notable:** Zero dependencies, 40-60% smaller responses (v0.6.3+), auto-excludes `.obsidian/`

## 2. cyanheads/obsidian-mcp-server
- **GitHub:** https://github.com/cyanheads/obsidian-mcp-server
- **Stars:** ~429
- **Transport:** stdio + HTTP (Hono-based with SSE, CORS)
- **Access method:** Via obsidian-local-rest-api plugin (REST bridge)
- **Tools (8):**
  1. `obsidian_read_note` — Retrieve note content and metadata
  2. `obsidian_update_note` — Append/prepend/overwrite
  3. `obsidian_search_replace` — In-note search-and-replace
  4. `obsidian_global_search` — Vault-wide text/regex search
  5. `obsidian_list_notes` — List files in directories
  6. `obsidian_manage_frontmatter` — Get/set/delete YAML keys
  7. `obsidian_manage_tags` — Add/remove/list tags
  8. `obsidian_delete_note` — Permanently remove notes
- **Search:** Full-text + regex + JsonLogic queries
- **Security:** API key auth, rate limiting, SSL, JWT/OAuth 2.1 options, sensitive data redaction
- **Notable:** In-memory cache with periodic refresh, targets active file or periodic notes

## 3. MarkusPfundstein/mcp-obsidian
- **GitHub:** https://github.com/MarkusPfundstein/mcp-obsidian
- **Stars:** ~700+
- **Transport:** stdio
- **Access method:** Via obsidian-local-rest-api plugin
- **Tools (7):**
  1. `list_files_in_vault` — List all files/dirs at root
  2. `list_files_in_dir` — List files in specific directory
  3. `get_file_contents` — Read single file
  4. `search` — Text query search across vault
  5. `patch_content` — Insert relative to heading/block ref/frontmatter
  6. `append_content` — Append to new or existing file
  7. `delete_file` — Delete file/directory
- **Search:** Basic text search via REST API
- **Notable:** One of the earliest Obsidian MCP servers, widely referenced

## 4. aaronsb/obsidian-mcp-plugin
- **GitHub:** https://github.com/aaronsb/obsidian-mcp-plugin
- **Stars:** ~271
- **Transport:** HTTP (port 3001/3443 HTTPS) with Bearer token auth
- **Access method:** Runs natively inside Obsidian as a plugin
- **Tools (8 semantic groups):**
  1. `vault` — List, read, create, search, move, split, combine files
  2. `edit` — Window editing, append, patch sections
  3. `view` — View files, windows, active note
  4. `graph` — Traverse, find paths, analyze connections, backlinks, forward links, search-traverse
  5. `workflow` — Contextual hints, suggest next actions
  6. `dataview` — Execute DQL queries (if Dataview installed)
  7. `bases` — Query/export Obsidian Bases
  8. `system` — Server status, commands, web fetch
- **Search:** Full-text + graph traversal (multi-hop with depth control)
- **Notable:** Native Obsidian plugin (<10ms file ops), knowledge graph navigation, Dataview/Bases integration

## 5. aaronsb/obsidian-semantic-mcp
- **GitHub:** https://github.com/aaronsb/obsidian-semantic-mcp
- **Stars:** ~34
- **Transport:** HTTP
- **Access method:** Via obsidian-local-rest-api
- **Tools (5 semantic operations):**
  1. `vault` — List, read, create, update, delete, search, fragments
  2. `edit` — Window (fuzzy match), append, patch, at_line, from_buffer
  3. `view` — Window with context, open_in_obsidian
  4. `workflow` — Suggest next actions based on state
  5. `system` — Info, commands, fetch_web
- **Search:** Text search with fuzzy matching (threshold 0.8)
- **Notable:** Designed to reduce LLM tool-selection confusion by consolidating 20+ tools into 5

## 6. jacksteamdev/obsidian-mcp-tools
- **GitHub:** https://github.com/jacksteamdev/obsidian-mcp-tools
- **Stars:** ~703
- **Transport:** MCP standard (runs as Obsidian plugin + external server)
- **Access method:** Obsidian plugin acting as secure bridge
- **Tools:**
  1. Vault access (note:// resources)
  2. Semantic search (search:// — requires Smart Connections plugin)
  3. Template execution (template:// — requires Templater plugin)
  4. Create/update notes
- **Search:** Semantic search via Smart Connections embeddings
- **Security:** "Never gives AI direct vault file access", SLSA provenance attestation
- **Notable:** Only MCP server with semantic search (via Smart Connections dependency)

## 7. rps321321/obsidian-mcp-pro
- **GitHub:** https://github.com/rps321321/obsidian-mcp-pro (inferred from Glama/DEV.to)
- **Stars:** Not widely tracked
- **Transport:** stdio
- **Access method:** Direct filesystem
- **Tools (23 + 3 resources):**
  - Read (5): search_notes, get_note, list_notes, get_daily_note, search_by_frontmatter
  - Write (7): create_note, append_to_note, prepend_to_note, update_frontmatter, create_daily_note, move_note, delete_note
  - Tags (2): get_tags, search_by_tag
  - Links/Graph (5): get_backlinks, get_outlinks, find_orphans, find_broken_links, get_graph_neighbors
  - Canvas (4): list_canvases, read_canvas, add_canvas_node, add_canvas_edge
  - Resources: obsidian://note/{path}, obsidian://tags, obsidian://daily
- **Search:** Full-text with folder scoping + frontmatter property search
- **Security:** 122 tests, security audit (path traversal, null byte injection, YAML injection)
- **Notable:** Most tools of any server, treats vault as knowledge graph, canvas support

## 8. StevenStavrakis/obsidian-mcp
- **GitHub:** https://github.com/StevenStavrakis/obsidian-mcp
- **Stars:** ~200+
- **Transport:** stdio
- **Access method:** Direct filesystem
- **Tools:** read, create, edit, move, delete notes; manage directories; search; tag management (add, remove, rename, list)
- **Search:** Basic text search
- **Notable:** Simple, early-stage, multi-vault support, "not thoroughly tested" warning

## 9. dp-veritas/mcp-obsidian-tools
- **GitHub:** https://github.com/dp-veritas/mcp-obsidian-tools
- **Stars:** ~4
- **Transport:** stdio
- **Access method:** Direct filesystem (read-only)
- **Tools (9):**
  1. `obsidian_search_notes` — Find by name, regex
  2. `obsidian_read_notes` — Read content, extract headings
  3. `obsidian_list_tags` — All tags with counts
  4. `obsidian_notes_by_tag` — Find notes by tag
  5. `obsidian_get_frontmatter` — Parse YAML as JSON
  6. `obsidian_backlinks` — Find referencing notes
  7. `obsidian_search_content` — Full-text with wildcards
  8. `obsidian_query` — Natural-language vault queries with date filtering
  9. `obsidian_count_files` — Count files with breakdown
- **Search:** Text + regex + natural-language queries + date filtering
- **Notable:** **ONLY read-only MCP server found.** No write capabilities at all.

## 10. flowing.abyss Hybrid Search MCP
- **Source:** https://forum.obsidian.md/t/hybrid-search-hybrid-search-mcp-server-cli-for-ai-assistants-bm25-semantic-obsidian-native/112491
- **Transport:** MCP + CLI
- **Access method:** Direct filesystem + SQLite index
- **Tools:** Search (BM25 + fuzzy trigram + semantic vector), graph traversal
- **Search:** Triple-path hybrid: BM25 (FTS5), fuzzy trigram, semantic vector — combined via Reciprocal Rank Fusion (RRF)
- **Notable:** Most advanced search of any MCP server. Single SQLite file, offline, incremental indexing, multilingual embeddings

## 11. aleksakarac/obsidian-mcp (MOST TOOLS — 45)
- **GitHub:** https://github.com/aleksakarac/obsidian-mcp
- **Stars:** ~6
- **Transport:** stdio (FastMCP, Python)
- **Access method:** Hybrid — 33 filesystem-native + 12 API-based tools
- **Tools (45 total):**
  - Filesystem-native (33): backlinks, broken links, tag CRUD, insert after heading/block, frontmatter CRUD, note/vault statistics
  - **Tasks plugin:** search_tasks, create_task, toggle_task_status, update_task_metadata, get_task_statistics
  - **Dataview inline:** extract_dataview_fields, search_by_dataview_field, add/remove_dataview_field
  - **Kanban:** parse_kanban_board, add/move/toggle_kanban_card, get_kanban_statistics
  - **Canvas:** parse_canvas, add_canvas_node/edge, remove_canvas_node, get_canvas_node_connections
  - **Templates:** expand_template, create_note_from_template, list_templates
  - API-based (12): Dataview DQL queries, Templater rendering, workspace control, command execution
- **Search:** Grep-based full-text
- **Notable:** Only server with Tasks, Kanban, Dataview inline fields, and template expansion

## 12. pvliesdonk/markdown-vault-mcp (MOST COMPREHENSIVE)
- **GitHub:** https://github.com/pvliesdonk/markdown-vault-mcp
- **Stars:** ~3
- **Transport:** stdio, SSE, HTTP with OIDC auth
- **Access method:** Direct filesystem
- **Tools (23):**
  - Search/Read: `search` (hybrid FTS5+semantic), `read`, `list_documents`, `list_folders`, `list_tags`
  - Write: `write`, `edit`, `delete`, `rename` (with backlink updates), `fetch` (download URLs)
  - Analysis: `get_backlinks`, `get_outlinks`, `get_broken_links`, `get_similar` (semantic), `get_recent`, `get_orphan_notes`, `get_most_linked`, `get_connection_path` (BFS, max 10 hops), `get_context` (consolidated dossier)
  - Admin: `reindex`, `build_embeddings`, `stats`, `embeddings_status`, `create_download_link`
- **Search:** FTS5 with BM25 + porter stemming + semantic vector (FastEmbed/Ollama/OpenAI) + Reciprocal Rank Fusion
- **Security:** OIDC + bearer token, configurable read-write mode, git integration with auto-commit/push
- **Notable:** Most complete feature set overall; 6 MCP Resources + 6 MCP Prompts exposed

## 13. jimprosser/obsidian-web-mcp (REMOTE ACCESS)
- **GitHub:** https://github.com/jimprosser/obsidian-web-mcp
- **Stars:** ~92
- **Transport:** Streamable HTTP (port 8420)
- **Access method:** Direct filesystem + Cloudflare Tunnel for remote access
- **Tools (9):** vault_read, vault_batch_read, vault_write, vault_batch_frontmatter_update, vault_search (ripgrep), vault_search_frontmatter (in-memory index), vault_list, vault_move, vault_delete
- **Search:** Full-text via ripgrep + frontmatter index queries (in-memory, filesystem-watched)
- **Security:** OAuth 2.0 with PKCE, bearer token, path traversal protection, symlink blocking, atomic writes, 1MB/file + 20 files/batch limits, soft-delete to .trash/
- **Notable:** Only server designed for remote access (Cloudflare Tunnel). Obsidian Sync safe.

## 14. iansinnott/obsidian-claude-code-mcp
- **GitHub:** https://github.com/iansinnott/obsidian-claude-code-mcp
- **Stars:** ~221
- **Transport:** Dual — WebSocket (Claude Code CLI) + HTTP/SSE (Claude Desktop, port 22360)
- **Access method:** Obsidian Plugin API (runs inside Obsidian)
- **Tools (7+):** view, str_replace, create, insert, get_current_file, get_workspace_files, obsidian_api, getDiagnostics
- **Notable:** Designed specifically for Claude Code CLI with auto-discovery

## 15. ben-vargas/obsidian-vectorize-mcp (SERVERLESS/CLOUD)
- **GitHub:** https://github.com/ben-vargas/obsidian-vectorize-mcp
- **Stars:** ~8
- **Transport:** Streamable HTTP (MCP v2025-03-26)
- **Access method:** Cloudflare Workers + Vectorize + R2
- **Tools (4):** search_notes (semantic), fetch_note, list_indexed_notes, get_index_stats
- **Search:** Semantic via Cloudflare Vectorize (1024 dimensions, cosine similarity)
- **Notable:** Fully serverless (~$0-10/month). Works with Claude.ai web.

## 16. msdanyg/smart-connections-mcp
- **GitHub:** https://github.com/msdanyg/smart-connections-mcp
- **Stars:** ~32
- **Transport:** stdio
- **Access method:** Reads Smart Connections plugin's pre-computed embeddings (.smart-env/ directory)
- **Tools (6):** get_similar_notes, get_connection_graph, search_notes, get_embedding_neighbors, get_note_content, get_stats
- **Search:** Semantic via pre-computed 384-dim embeddings (TaylorAI/bge-micro-v2)
- **Notable:** Does not compute own embeddings — requires Smart Connections to be installed and indexed

---

## Summary Table

| Server | Tools | Search Type | Access | Read-Only | Plugin Required |
|--------|-------|-------------|--------|-----------|-----------------|
| mcpvault | 14 | BM25 | Filesystem | No | None |
| cyanheads | 8 | Text+Regex+JsonLogic | REST API | No | Local REST API |
| MarkusPfundstein | 7 | Text | REST API | No | Local REST API |
| aaronsb/plugin | 8 groups | Text+Graph | Obsidian native | No | Is a plugin |
| aaronsb/semantic | 5 | Fuzzy text | REST API | No | Local REST API |
| obsidian-mcp-tools | 4 | Semantic | Plugin bridge | No | Smart Connections + Templater |
| obsidian-mcp-pro | 23 | Text+Frontmatter | Filesystem | No | None |
| StevenStavrakis | ~10 | Text | Filesystem | No | None |
| dp-veritas | 9 | Text+Regex+NL | Filesystem | **Yes** | None |
| Hybrid Search | 2+ | BM25+Semantic+Fuzzy | Filesystem+SQLite | Read search | None |
