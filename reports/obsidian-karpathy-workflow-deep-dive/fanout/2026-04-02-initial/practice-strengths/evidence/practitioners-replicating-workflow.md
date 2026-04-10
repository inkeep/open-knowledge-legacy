# Evidence: Practitioners Replicating the Karpathy Workflow

## Practitioner 1: Eric J. Ma — "Mastering Personal Knowledge Management with Obsidian and AI"
- **Source:** [Blog post, March 6, 2026](https://ericmjl.github.io/blog/2026/3/6/mastering-personal-knowledge-management-with-obsidian-and-ai/)
- **Role:** Engineer managing 12 people across 2 teams
- **Workflow:**
  - Plain text notes in Obsidian with structured note types (daily journals, meeting notes, dossiers, project notes)
  - `AGENTS.md` file documents the system for AI coding agents
  - Python scripts convert Word docs, PowerPoints, PDFs, spreadsheets into markdown
  - AI agents update people/project notes via "sweeps" when context gaps appear
  - Publishes to Confluence, GitHub Gists, Jira, Office formats via Pandoc
  - Procedural knowledge encoded as executable markdown agent skills
- **Results:** Knowledge management overhead dropped from 30-40% to <10% of time
- **Remaining pain point:** Requires manual download of cloud documents before processing

## Practitioner 2: Daniel Pickem — "LLM-Powered Work Notes" 
- **Source:** [Blog post, January 13, 2026](https://danielpickem.com/posts/2026_01_13_obsidian_note_taking_system/)
- **Role:** Staff Software Engineer at NVIDIA
- **Workflow:**
  - Obsidian vault organized using PARA methodology (Project, Area, Resource, Archive)
  - Cursor as the LLM interface (entire vault is a Cursor workspace)
  - Claude processes raw inputs into structured, linked outputs
  - YAML frontmatter makes notes LLM-parseable
  - Dataview for automated task/status aggregation
- **Key insight:** "Rarely writes notes from scratch — feeds raw inputs to Claude and gets structured, linked outputs"
- **Philosophy:** "The real power of this system isn't manual note-taking—it's using LLMs to process raw information into structured notes"

## Practitioner 3: SEOtistics Content Management System
- **Source:** [Blog post](https://seotistics.com/content-management-obsidian-llm/)
- **Workflow:**
  - Obsidian Bases for database-like content views
  - Obsidian MCP + Claude for vault analysis
  - Python + trafilatura/crawl4ai for competitive intelligence scraping
  - Claude processes metadata, returns structured guidance
  - Graph view reveals content clusters
- **Use case:** Content management and SEO-driven knowledge base
- **Key tool:** Obsidian MCP (Model Context Protocol) integration with Claude

## Practitioner 4: "How I Built a Personal Knowledge System" (Substack)
- **Source:** [dspn.substack.com](https://dspn.substack.com/p/how-i-built-a-personal-knowledge)
- **Stack:** Obsidian + AI + plain text
- **Pattern:** Similar raw-to-processed pipeline

## Common Patterns Across Practitioners
1. **Obsidian as filesystem, LLM as processor** — Nobody uses Obsidian's built-in AI plugins for the core workflow
2. **External LLM tools** — Claude Code, Cursor, custom scripts — not Obsidian plugins
3. **Markdown as the interchange format** — YAML frontmatter + wikilinks as the machine-readable layer
4. **Ingest → Process → Render → Compound** — All follow Karpathy's basic loop
5. **MCP as the bridge** — Model Context Protocol emerging as the standard way to connect LLMs to vaults

## Key Divergences from Karpathy
- Practitioners often use Cursor as the LLM workspace (Karpathy uses CLI scripts)
- Some add RAG via Smart Connections or Copilot (Karpathy explicitly avoids RAG)
- Most don't implement the "linting" stage
- Few implement the compounding loop (outputs feeding back into wiki)
