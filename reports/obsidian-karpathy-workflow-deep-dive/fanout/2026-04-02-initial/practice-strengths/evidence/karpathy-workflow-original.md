# Evidence: Karpathy's Original LLM Knowledge Base Workflow

## Source
- **Primary:** [Karpathy X post](https://x.com/karpathy/status/2039805659525644595) — "LLM Knowledge Bases" (posted ~April 2026)
- **Analysis:** [DeepakNess analysis](https://deepakness.com/raw/llm-knowledge-bases/)
- **Community reaction:** [Alex Prompter on X](https://x.com/alex_prompter/status/2039853870810108384) — "The most important line here isn't about Obsidian or wikis..."
- **Elvis/omarsar on X](https://x.com/omarsar0/status/2039810362782962023) — "I have also been obsessed with building LLM knowledge bases"
- **Year in Review context:** [Karpathy 2025 LLM Year in Review](https://karpathy.bearblog.dev/year-in-review-2025/)

## Karpathy's Exact Workflow (Reconstructed from Post)

### Stage 1: Data Ingest
- Indexes source documents (articles, papers, repos, datasets, images) into a `raw/` directory
- Uses **Obsidian Web Clipper** extension to convert web articles into `.md` files
- Downloads related images locally
- All raw materials stored as Markdown and images in Obsidian vault

### Stage 2: LLM-Compiled Wiki
- Uses an LLM to incrementally "compile" a wiki — a collection of `.md` files in a directory structure
- Wiki includes summaries of all data in `raw/`, backlinks, categorization of data into concepts
- LLM writes articles for discovered concepts and links them all together
- **The LLM writes and maintains all of the wiki data — Karpathy doesn't manually edit/add anything**

### Stage 3: Q&A Against Wiki
- Once wiki reaches sufficient scale (~100 articles, ~400K words), he asks the LLM complex questions
- Key insight: "I thought I had to reach for fancy RAG, but the LLM has been pretty good about auto-maintaining index files"
- LLM reads related data fairly easily at this scale

### Stage 4: Rendered Output
- Prefers generating new Markdown files, slideshows (Marp format), or matplotlib images
- All viewed in Obsidian
- **Outputs are filed back into the wiki to enhance it for further queries**
- "Explorations and queries always add up in the knowledge base"

### Stage 5: Wiki Linting & Enhancement
- Runs LLM "health checks" to find inconsistent data
- Imputes missing data with web searches
- Finds interesting connections for new article candidates

### Stage 6: Compounding Knowledge
- The output-feeding-back-into-wiki loop means the knowledge base compounds over time
- Each query/exploration enriches the KB for future use

## Key Architectural Insight
The most discussed aspect was the **anti-RAG finding**: Karpathy showed that with proper index file maintenance by the LLM, you don't need vector databases or retrieval pipelines. The LLM auto-maintains its own navigation structure within the wiki. This was noted by Alex Prompter: "The entire AI infrastructure industry is building retrieval pipelines. Karpathy just showed that a well-maintained index.md file might be all you need."

## What He Uses
- **Obsidian** — viewing, storing, rendering
- **Obsidian Web Clipper** — ingesting web content
- **LLM (unspecified, likely Claude/GPT-4)** — all wiki maintenance
- **"Hacky collection of scripts"** — CLI tools for orchestrating the LLM work
- **Marp** — slideshow format
- **matplotlib** — image generation

## What He Does NOT Use
- RAG / vector databases
- Any Obsidian AI plugins
- Manual editing of the wiki
- Obsidian's own search (relies on LLM-maintained index files)

## Shift in Token Usage
"A large fraction of my recent token throughput is going less into manipulating code, and more into manipulating knowledge stored as markdown and images."
