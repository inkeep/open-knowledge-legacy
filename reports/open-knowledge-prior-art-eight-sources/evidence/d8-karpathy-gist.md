# Evidence: Karpathy — LLM Wiki gist (the canonical vision)

**Dimension:** D8 — gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
**Date:** 2026-04-07
**Sources:** Raw gist content fetched via curl (verbatim)

---

## Key pages referenced
- `https://gist.githubusercontent.com/karpathy/442a6bf555914893e9891c11519de94f/raw` — raw gist content, full verbatim

---

## Findings

### Finding: The gist is explicitly positioned as "an idea file" — a pattern description to be handed to an LLM agent, not a product
**Confidence:** CONFIRMED
**Evidence:** Gist opening — "This is an idea file, it is designed to be copy pasted to your own LLM Agent (e.g. OpenAI Codex, Claude Code, OpenCode / Pi, or etc.). Its goal is to communicate the high level idea, but your agent will build out the specifics in collaboration with you."

And closing: "This document is intentionally abstract. It describes the idea, not a specific implementation. [...] The right way to use this is to share it with your LLM agent and work together to instantiate a version that fits your needs. The document's only job is to communicate the pattern. Your LLM can figure out the rest."

**Implications for open-knowledge:** Karpathy is not building a product. The gist is a **prompt** handed to an agent. This is an important distinction: **the canonical vision for LLM-maintained wikis has no reference implementation from the person who articulated it.** Open-knowledge is one of many attempts to instantiate this pattern. The field is open.

### Finding: The core distinction — "the LLM incrementally builds and maintains a persistent wiki" vs RAG's "LLM rediscovering knowledge on every question"
**Confidence:** CONFIRMED
**Evidence:** Direct quote — "Most people's experience with LLMs and documents looks like RAG: you upload a collection of files, the LLM retrieves relevant chunks at query time, and generates an answer. This works, but the LLM is rediscovering knowledge from scratch on every question. There's no accumulation. Ask a subtle question that requires synthesizing five documents, and the LLM has to find and piece together the relevant fragments every time. Nothing is built up. NotebookLM, ChatGPT file uploads, and most RAG systems work this way. The idea here is different. Instead of just retrieving from raw documents at query time, the LLM **incrementally builds and maintains a persistent wiki** — a structured, interlinked collection of markdown files that sits between you and the raw sources."

**Implications for open-knowledge:** This is the foundational argument. Open-knowledge's rabbit hole #1 (rejecting RAG as a product feature) is directly grounded in this framing. Karpathy's distinction between **retrieving** (RAG) and **compiling** (wiki) is the same distinction open-knowledge makes between "search" (product) and "compilation" (skill).

### Finding: "The wiki is a persistent, compounding artifact" — the compounding argument
**Confidence:** CONFIRMED
**Evidence:** Direct quote — "This is the key difference: **the wiki is a persistent, compounding artifact.** The cross-references are already there. The contradictions have already been flagged. The synthesis already reflects everything you've read. The wiki keeps getting richer with every source you add and every question you ask."

**Implications for open-knowledge:** Use this framing directly in positioning. The compounding artifact is what distinguishes a knowledge base from a file dump. Open-knowledge's MCP tools + reference skills should make compounding easy — every new source (ingest) and every query (query) should be able to file results back into the KB.

### Finding: Division of labor — "You never (or rarely) write the wiki yourself — the LLM writes and maintains all of it"
**Confidence:** CONFIRMED
**Evidence:** Direct quote — "You never (or rarely) write the wiki yourself — the LLM writes and maintains all of it. You're in charge of sourcing, exploration, and asking the right questions. The LLM does all the grunt work — the summarizing, cross-referencing, filing, and bookkeeping that makes a knowledge base actually useful over time. In practice, I have the LLM agent open on one side and Obsidian open on the other. The LLM makes edits based on our conversation, and I browse the results in real time — following links, checking the graph view, reading the updated pages. **Obsidian is the IDE; the LLM is the programmer; the wiki is the codebase.**"

**Implications for open-knowledge:** 
- **"Obsidian is the IDE; the LLM is the programmer; the wiki is the codebase" is the clearest articulation of the product positioning.** Open-knowledge wants to BE the IDE in this triple. The product replaces Obsidian in Karpathy's setup with a better editor + real-time presence + CRDT co-editing.
- **Karpathy says "you never (or rarely) write the wiki yourself."** This is an important stance. Open-knowledge currently assumes human+AI co-editing as the happy path (S5 presence). But the canonical Karpathy vision is **AI-primary authoring with human review**. Open-knowledge should explicitly support both patterns — but the "AI writes, human reviews" path needs work (the draft review UX in S6 is the starting point).
- **"I browse the results in real time — following links, checking the graph view, reading the updated pages"** is the co-editing experience Karpathy is DOING, with Obsidian + a shell. Open-knowledge's S5 presence and S10 backlinks + S-L4 graph view ARE the productization of this workflow.

### Finding: Five use-case examples — personal, research, book reading, business/team, hobby deep-dives
**Confidence:** CONFIRMED
**Evidence:** Direct quote — the full bullet list:
- **Personal**: tracking your own goals, health, psychology, self-improvement
- **Research**: going deep on a topic over weeks or months
- **Reading a book**: filing each chapter as you go, building out pages for characters, themes, plot threads (compares to Tolkien Gateway)
- **Business/team**: an internal wiki maintained by LLMs, fed by Slack threads, meeting transcripts, project documents, customer calls. Possibly with humans in the loop reviewing updates.
- **Competitive analysis, due diligence, trip planning, course notes, hobby deep-dives**

**Implications for open-knowledge:** 
- Open-knowledge's P0 audience is "IC developer/knowledge worker with Claude Code" (PROJECT.md). Karpathy's list is broader:
  - Personal (matches)
  - Research (matches)
  - Book reading (NOT covered — a new audience)
  - Business/team (NOT now per PROJECT.md NOT NOW, but Karpathy lists it)
  - Hobby deep-dives (covered by "Individual contributor")
- **"Business/team wiki fed by Slack threads, meeting transcripts" is the enterprise killer use-case** that Garry Tan is also building for (GBrain). Open-knowledge's S-L1 (multiplayer) and S-L6 (connectors) are the Later stories that target this. The landing case is stronger than open-knowledge's current framing suggests.
- **"Reading a book" is a fun example** — not a monetization target but a great demo. Could be a reference use-case in open-knowledge docs.

### Finding: Three-layer architecture — raw sources (immutable) / wiki (LLM-owned) / schema (configuration)
**Confidence:** CONFIRMED
**Evidence:** Direct quote — "There are three layers:
**Raw sources** — your curated collection of source documents. Articles, papers, images, data files. These are immutable — the LLM reads from them but never modifies them. This is your source of truth.
**The wiki** — a directory of LLM-generated markdown files. Summaries, entity pages, concept pages, comparisons, an overview, a synthesis. The LLM owns this layer entirely. It creates pages, updates them when new sources arrive, maintains cross-references, and keeps everything consistent. You read it; the LLM writes it.
**The schema** — a document (e.g. CLAUDE.md for Claude Code or AGENTS.md for Codex) that tells the LLM how the wiki is structured, what the conventions are, and what workflows to follow when ingesting sources, answering questions, or maintaining the wiki. This is the key configuration file — it's what makes the LLM a disciplined wiki maintainer rather than a generic chatbot. You and the LLM co-evolve this over time as you figure out what works for your domain."

**Implications for open-knowledge:** 
- **The "raw / wiki / schema" three-layer split is a convention open-knowledge should adopt explicitly.** PROJECT.md does not currently call this out. The folder convention could be:
  - `raw/` — ingested sources (immutable by convention)
  - `articles/` or root — the compiled wiki
  - `CLAUDE.md` or `AGENTS.md` — the schema
- **PQ7 (project structure as permission boundaries)** — the Karpathy three-layer split maps naturally to permissions:
  - `raw/` → agent is READER (never writes)
  - articles → agent is EDITOR or PROPOSER (writes here)
  - `CLAUDE.md`/`AGENTS.md` → agent is READER (user-owned convention file, rarely edits)
- **The "schema" concept is the AGENTS.md / CLAUDE.md pattern open-knowledge already targets.** But Karpathy frames it as the PRIMARY configuration surface — "what makes the LLM a disciplined wiki maintainer rather than a generic chatbot." Open-knowledge's MCP server's `instructions` field + AGENTS.md is the productization of this.

### Finding: Three operations — Ingest, Query, Lint
**Confidence:** CONFIRMED
**Evidence:** Direct quotes on each:

**Ingest** — "You drop a new source into the raw collection and tell the LLM to process it. An example flow: the LLM reads the source, discusses key takeaways with you, writes a summary page in the wiki, updates the index, updates relevant entity and concept pages across the wiki, and appends an entry to the log. A single source might touch 10-15 wiki pages. Personally I prefer to ingest sources one at a time and stay involved — I read the summaries, check the updates, and guide the LLM on what to emphasize. But you could also batch-ingest many sources at once with less supervision. It's up to you to develop the workflow that fits your style and document it in the schema for future sessions."

**Query** — "You ask questions against the wiki. The LLM searches for relevant pages, reads them, and synthesizes an answer with citations. Answers can take different forms depending on the question — a markdown page, a comparison table, a slide deck (Marp), a chart (matplotlib), a canvas. **The important insight: good answers can be filed back into the wiki as new pages.** A comparison you asked for, an analysis, a connection you discovered — these are valuable and shouldn't disappear into chat history. This way your explorations compound in the knowledge base just like ingested sources do."

**Lint** — "Periodically, ask the LLM to health-check the wiki. Look for: contradictions between pages, stale claims that newer sources have superseded, orphan pages with no inbound links, important concepts mentioned but lacking their own page, missing cross-references, data gaps that could be filled with a web search. The LLM is good at suggesting new questions to investigate and new sources to look for. This keeps the wiki healthy as it grows."

**Implications for open-knowledge:** 
- **Ingest, Query, Lint are the three reference skills.** Open-knowledge's PQ14 lists these (with different names: "ingest, compile, Q&A, lint, index-maintenance"). Karpathy's three collapse "compile" into "ingest" (compiling IS what happens during ingest).
- **"A single source might touch 10-15 wiki pages"** is a concrete metric. Open-knowledge's MCP tools need to support this scale of batch update efficiently. Cross-cutting with ByteRover's "max 5 files per operation" curation limit — ByteRover is more conservative.
- **"Good answers can be filed back into the wiki as new pages"** is the compounding loop. This is what makes the KB grow from queries, not just sources. Open-knowledge's `write_file` tool supports this mechanically, but it needs to be CONVENTIONAL for the compounding to happen. Reference skill prompts must encourage this.
- **Lint checks from Karpathy**:
  1. Contradictions between pages
  2. Stale claims (newer sources supersede older)
  3. Orphan pages (no inbound links)
  4. Important concepts without pages
  5. Missing cross-references
  6. Data gaps (for web search)
  Compare to Garry Tan's 8 lint checks (D6): more specific, including tag consistency, dead links, embedding freshness. Both lists are worth merging for a reference `lint` skill.

### Finding: Two special files — `index.md` (content-oriented catalog) and `log.md` (chronological audit trail)
**Confidence:** CONFIRMED
**Evidence:** Direct quote — "**index.md** is content-oriented. It's a catalog of everything in the wiki — each page listed with a link, a one-line summary, and optionally metadata like date or source count. Organized by category (entities, concepts, sources, etc.). The LLM updates it on every ingest. When answering a query, the LLM reads the index first to find relevant pages, then drills into them. **This works surprisingly well at moderate scale (~100 sources, ~hundreds of pages) and avoids the need for embedding-based RAG infrastructure.**"

"**log.md** is chronological. It's an append-only record of what happened and when — ingests, queries, lint passes. A useful tip: if each entry starts with a consistent prefix (e.g. `## [2026-04-02] ingest | Article Title`), the log becomes parseable with simple unix tools — `grep \"^## \\[\" log.md | tail -5` gives you the last 5 entries. The log gives you a timeline of the wiki's evolution and helps the LLM understand what's been done recently."

**Implications for open-knowledge:** 
- **The `index.md` pattern is what open-knowledge's CC6 (derived data) IS.** PROJECT.md explicitly references this: "auto-maintained `index.md` at every folder. Computed strictly from frontmatter + file structure, no LLM."
- **"Works surprisingly well at moderate scale (~100 sources, ~hundreds of pages) and avoids the need for embedding-based RAG infrastructure"** — this is Karpathy's direct claim that embedding infra is premature optimization at open-knowledge's scale. Strong grounding for open-knowledge's S8 phasing debate ("S8 semantic search phasing is unconfirmed").
- **The `log.md` pattern is NOT in open-knowledge's current spec.** Open-knowledge tracks history via git, which is structurally similar but not as skill-accessible. A convention of maintaining a `log.md` (via a reference skill) would complement git — the log.md is agent-parseable, git is the full record.
- **Log entry format with parseable prefix** — Karpathy's trick: `## [2026-04-02] ingest | Article Title`. Allows `grep "^## \[" log.md | tail -5`. This is a **purely convention-based optimization** — the skill adds the prefix, and any grep tool can parse the log. Open-knowledge should adopt this pattern for the reference ingest/query/lint skills.

### Finding: QMD mentioned as the recommended local search engine
**Confidence:** CONFIRMED
**Evidence:** Direct quote — "At some point you may want to build small tools that help the LLM operate on the wiki more efficiently. A search engine over the wiki pages is the most obvious one — at small scale the index file is enough, but as the wiki grows you want proper search. [qmd](https://github.com/tobi/qmd) is a good option: it's a local search engine for markdown files with hybrid BM25/vector search and LLM re-ranking, all on-device. It has both a CLI (so the LLM can shell out to it) and an MCP server (so the LLM can use it as a native tool). You could also build something simpler yourself — the LLM can help you vibe-code a naive search script as the need arises."

**Implications for open-knowledge:** 
- **Karpathy's recommended path is exactly what open-knowledge plans: hybrid BM25/vector search + LLM re-ranking**, local, MCP-native. S8 is aligned with the canonical vision.
- QMD (by Tobi Lutke, Shopify CEO) is prior art worth looking at specifically. Open-knowledge's S8 plans Orama; QMD is an alternative TypeScript implementation worth comparing.
- **The progression Karpathy describes: "at small scale the index file is enough, but as the wiki grows you want proper search"** — validates a phased approach. Open-knowledge could ship with index.md-only navigation and add Orama later if the initial KB is small enough.

### Finding: Tips and tricks — Obsidian-specific practical patterns
**Confidence:** CONFIRMED
**Evidence:** Direct quote — practical tips:
- **Obsidian Web Clipper** for fast web article ingest
- **Image handling** — "Set 'Attachment folder path' to a fixed directory (e.g. `raw/assets/`)" + download hotkey. Note: "LLMs can't natively read markdown with inline images in one pass — the workaround is to have the LLM read the text first, then view some or all of the referenced images separately to gain additional context."
- **Obsidian's graph view** — "the best way to see the shape of your wiki"
- **Marp** for markdown slide decks
- **Dataview** for dynamic tables from frontmatter
- **Git**: "The wiki is just a git repo of markdown files. You get version history, branching, and collaboration for free."

**Implications for open-knowledge:** 
- **"The wiki is just a git repo of markdown files"** — this is the exact architectural bet open-knowledge makes. Canonical validation.
- **Obsidian's graph view as "the best way to see the shape of your wiki"** — validates S-L4 (knowledge graph visualization) as a Later feature. The graph view is what Obsidian users cite as a reason they use Obsidian.
- **"LLMs can't natively read markdown with inline images in one pass"** is a subtle but important finding for open-knowledge. Rich content with images needs a two-pass pattern: extract text, then selectively view images. This is relevant for the reference ingest skill (when processing clipped web content with images).
- **Dataview pattern** — querying frontmatter as structured data. Open-knowledge's TQ6 (frontmatter as source of truth) enables this pattern but doesn't currently surface it as a product feature. Could be a reference skill or a future query language.

### Finding: "The tedious part of maintaining a knowledge base is not the reading or the thinking — it's the bookkeeping"
**Confidence:** CONFIRMED
**Evidence:** Direct quote — "The tedious part of maintaining a knowledge base is not the reading or the thinking — it's the bookkeeping. Updating cross-references, keeping summaries current, noting when new data contradicts old claims, maintaining consistency across dozens of pages. **Humans abandon wikis because the maintenance burden grows faster than the value.** LLMs don't get bored, don't forget to update a cross-reference, and can touch 15 files in one pass. The wiki stays maintained because the cost of maintenance is near zero."

**Implications for open-knowledge:** 
- **"Humans abandon wikis because the maintenance burden grows faster than the value"** is the positioning statement. This is THE reason open-knowledge exists. Use this framing in product positioning directly.
- **"LLMs [...] can touch 15 files in one pass"** — specific capacity claim. Open-knowledge's MCP tools must support this scale of batch write. A single agent task should be able to update 15 files without hitting rate limits, permission friction, or CRDT conflicts.
- **"The cost of maintenance is near zero"** — the value prop. Open-knowledge's CC6 derived data (auto-maintained index.md from frontmatter, no LLM) makes EVEN MORE of the maintenance free than Karpathy describes.

### Finding: "Related in spirit to Vannevar Bush's Memex (1945)"
**Confidence:** CONFIRMED
**Evidence:** Direct quote — "The idea is related in spirit to Vannevar Bush's Memex (1945) — a personal, curated knowledge store with associative trails between documents. Bush's vision was closer to this than to what the web became: private, actively curated, with the connections between documents as valuable as the documents themselves. **The part he couldn't solve was who does the maintenance.** The LLM handles that."

**Implications for open-knowledge:** 
- The Memex framing is a strong narrative hook for open-knowledge positioning. "Memex, finally" is a more evocative tagline than "Obsidian but agent-native." The connections-as-valuable-as-documents framing is philosophically aligned with the S10 wiki-link/backlink architecture.
- **"The part he couldn't solve was who does the maintenance"** is the exact gap open-knowledge fills. The MCP server + reference skills automate the maintenance.

---

## Gaps / follow-ups
- The gist does NOT contain: implementation details, specific directory conventions, specific schema templates, specific prompt examples for ingest/query/lint. These are explicitly out of scope ("intentionally abstract").
- Comments on the gist — the summary mentioned "extensive comments discussing implementations like OMEGA, sage-wiki, and various domain-specific adaptations." I didn't fetch the comment thread. These would be valuable additional prior art — other people's attempts to instantiate the Karpathy vision.
- Karpathy's own implementation (if any) is not linked. He says "I have the LLM agent open on one side and Obsidian open on the other" — implying he does this interactively without a specific productized tool.

## Related open-knowledge material
- **PROJECT.md traces explicitly to this vision** — line 4: "Traces to: Karpathy LLM Knowledge Bases vision + OpenDesign architectural precedent"
- **Rabbit hole #1 (RAG rejection)** — grounded directly in this gist's framing
- **PQ13 (Karpathy workflow Option D)** — this gist IS the workflow
- **PQ14 (Reference skills)** — ingest/query/lint are Karpathy's operations
- **CC6 (derived data)** — the index.md pattern from this gist
- **S10 (wiki-links + backlinks)** — the Memex associative trails
- **New pattern to consider: log.md convention with parseable prefix** — not currently in open-knowledge, but trivial to add via convention
- **S8 (semantic search)** — phasing debate is resolved by Karpathy's "index file is enough at moderate scale, add search as you grow" — suggesting S8 could be Next, not Now
