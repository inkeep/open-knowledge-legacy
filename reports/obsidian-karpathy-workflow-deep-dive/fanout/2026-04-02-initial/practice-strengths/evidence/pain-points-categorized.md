# Evidence: Pain Points with Obsidian + LLMs for Knowledge Base Workflows

## Category 1: Plugin Fragmentation (Structural)
- **Source:** [Obsidian Forum — "Why Isn't There a Standard Interface Plugin for AI/LLMs in Obsidian?"](https://forum.obsidian.md/t/why-isn-t-there-a-standard-interface-plugin-for-ai-llms-in-obsidian/95431) (Jan 2025, active through 2026)
- **Problem:** Each AI plugin (Copilot, Smart Connections, InsightA) requires independent API key configuration and model selection. Very few support local models, even fewer support OpenRouter.
- **Impact:** Users must maintain multiple configurations, can't share context between AI tools
- **Community response:** Developer building unified AI interface plugin; MCP emerging as de facto standard

## Category 2: LLM Output Structure Problems (Workflow)
- **Source:** [Obsidian Forum — AI Knowledge Filler](https://forum.obsidian.md/t/ai-knowledge-filler-turn-any-llm-into-a-structured-file-generator-for-obsidian/111443)
- **Problem:** LLMs give great answers but terrible file structure. Claude generates "a wall of prose" when asked to create structured notes.
- **Impact:** Users spend additional time organizing LLM output into proper vault structure
- **Workaround:** AI Knowledge Filler plugin, obsidian-skills teaching agents proper Obsidian markdown

## Category 3: No Agent Event System (Architectural)
- **Problem:** Obsidian has no core mechanism for agents to subscribe to vault changes, trigger on file updates, or run background processes
- **Impact:** Impossible to build the "continuous wiki maintenance" that Karpathy's workflow requires without external tooling
- **Evidence:** All practitioners use external tools (Cursor, Claude Code, custom scripts) rather than Obsidian plugins

## Category 4: Smart Connections Paywall & Quality
- **Source:** [Obsidian Forum — Alternatives to Smart Connections](https://forum.obsidian.md/t/alternatives-to-smart-connections/108886)
- **Problem:** Developer put meaningful functionalities behind a paywall; concerns about data transparency despite "local" claims
- **Impact:** Users seeking alternatives; ObsidianRAG project emerged with hybrid search (Vector + BM25 + CrossEncoder reranking)

## Category 5: Large Vault Performance
- **Source:** [Obsidian Forum — Slow performance with large Vaults](https://forum.obsidian.md/t/slow-performance-with-large-vaults/16633)
- **Source:** [Obsidian Forum — Terabyte size, million notes vaults?](https://forum.obsidian.md/t/terabyte-size-million-notes-vaults-how-scalable-is-obsidian/66674)
- **Problem:** 10,000+ file vaults take 20+ minutes to index. The `[[` link selector takes 4 seconds between keystrokes. Initial load and search are "unusably slow."
- **Impact:** Knowledge bases that grow large (as Karpathy's would) hit performance ceilings
- **Contributing factors:** Community plugins increase load time; large attachments (PDFs, images) compound the issue

## Category 6: Mobile Sync Reliability
- **Source:** [Obsidian Forum — Unpractical vault load time for large vaults on mobile](https://forum.obsidian.md/t/unpractical-vault-load-time-for-large-vaults-on-mobile-indexeddb-transactions-are-not-flushed-to-disk/88470)
- **Source:** [Dev.to — Why I switched from Obsidian](https://dev.to/dev_tips/why-i-switched-from-obsidian-a-real-developers-story-and-what-im-using-now-ndn)
- **Problem:** Mobile is clunky, sync is unpredictable, plugins break crucial things. Sync requires paid subscription.
- **Impact:** Primary reason people leave Obsidian; the Karpathy workflow is desktop-only anyway

## Category 7: Local LLM Integration Difficulty
- **Source:** [Obsidian Forum — Custom LLM connection with Text Generator plugin](https://forum.obsidian.md/t/custom-llm-connection-with-text-generator-plugin/105840)
- **Problem:** Users struggle for days to get local LLM integration working, particularly with LM Studio
- **Impact:** Barrier to entry for privacy-conscious users who want local processing

## Category 8: Plugin Quality & Maintenance
- **Source:** [GitHub — Awesome Obsidian AI Tools](https://github.com/danielrosehill/Awesome-Obsidian-AI-Tools)
- **Problem:** Many AI plugins are deprecated, unmaintained, or miscategorized. 86 AI plugins catalogued but quality varies wildly.
- **Impact:** Users can't trust that plugins will continue working; creates hesitancy to invest in plugin-dependent workflows

## Summary: Pain Point Severity for Karpathy Workflow
| Pain Point | Severity for LLM KB Workflow | Workaround Exists? |
|---|---|---|
| No agent event system | **Critical** | External tools only |
| Plugin fragmentation | **High** | MCP emerging |
| Large vault performance | **High** | Hardware scaling |
| LLM output structure | **Medium** | obsidian-skills, AI Knowledge Filler |
| Smart Connections paywall | **Medium** | ObsidianRAG, Copilot |
| Mobile sync | **Low** (desktop workflow) | N/A |
| Local LLM integration | **Medium** | API-based models |
| Plugin quality variance | **Medium** | Stick to top plugins |
