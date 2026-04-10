# Evidence: Folder Hierarchy Conventions — Flat vs Structured at Different Scales

**Dimension:** D10 — Folder hierarchy conventions across prior art and established knowledge management patterns
**Date:** 2026-04-07
**Sources:** 6 prior art systems (ByteRover, GBrain, obsidian-mind, Karpathy gist, DeepWiki, Graphify), established knowledge management patterns (PARA, Zettelkasten, wiki namespaces), cognitive science research on hierarchy depth, Obsidian community practices, Notion workspace patterns

---

## Part 1: Prior Art Hierarchy Approaches (6 systems)

### Approach 1: ByteRover — Canonical 4-level hierarchy, agent-discovered

**Pattern:** `domain/topic/[subtopic]/entry.md` with `context.md` at each level and `_index.md` at root.

**Evidence:** From d2-byterover-cli.md — `src/server/infra/context-tree/file-context-tree-service.ts:16-67`:
```
.brv/context-tree/
├── domain1/
│   ├── context.md                   # Domain-level metadata
│   ├── topic1/
│   │   ├── context.md               # Topic-level metadata
│   │   ├── entry.md                 # Leaf knowledge entry
│   │   └── subtopic1/
│   │       ├── context.md           # Subtopic metadata
│   │       └── entry.md             # Leaf
│   └── topic2/
│       └── entry.md
├── README.md                         # Root index
├── _index.md                         # Summary index (derived artifact)
└── _archived/                        # Archive stubs
```

**Key characteristic:** Domains are created dynamically by agent curation — NOT pre-scaffolded. The product creates only `.brv/context-tree/` on first run; everything inside is agent-authored. Maximum depth: 4 levels. Per-folder metadata files (`context.md`) at every level.

**Scale:** Validated at ByteRover's benchmark scale (LoCoMo, LongMemEval). Unclear how many real entries in production deployments. The 4-level hierarchy IS the retrieval structure — BM25 search uses path components for field boosting (title 3x, path 1.5x).

---

### Approach 2: GBrain — Type-prefixed slugs (flat within type)

**Pattern:** `type/entity-slug` — one folder per entity type, flat within each type.

**Evidence:** From d6-garrytan-gbrain.md — Gist section 2:
```
people/pedro-franceschi.md
people/garry-tan.md
companies/river-ai.md
companies/stripe.md
concepts/agent-architecture.md
sources/karpathy-llm-wiki-2026-04-02.md
comparisons/sqlite-vs-postgres-for-personal-kb.md
```

Each entity type (people, companies, concepts, sources, comparisons) is a top-level folder. Within each folder, files are flat — no sub-hierarchy. The slug is the canonical identifier used in cross-references: `[[people/pedro-franceschi]]`.

**Key characteristic:** 2-level hierarchy only (type/slug). Entity types are pre-defined in the schema. The hierarchy IS the type system — folder name = entity type. Designed for 7,471 files (Garry's current brain), though GBrain uses SQLite as canonical storage with markdown as export view.

**Scale:** Designed for ~7,500 files. The flat-within-type approach means each type folder could have hundreds of entries — 1,222 people dossiers in Garry's brain alone.

---

### Approach 3: obsidian-mind — Purpose-based folders

**Pattern:** Top-level folders organized by purpose/function, not content type.

**Evidence:** From d5-obsidian-mind.md — CLAUDE.md lines 38-66:
```
brain/          # Concepts, research, reference knowledge
work/           # Projects, incidents, 1:1s, decisions
org/            # Team, people, processes
perf/           # Performance review evidence, competencies
thinking/       # Session logs, scratch space
templates/      # Note templates
bases/          # Obsidian Bases (dynamic views)
```

8 note types distributed across folders by purpose: work notes → `work/`, concept notes → `brain/`, person notes → `org/people/`, decisions → `work/decisions/`.

**Key characteristic:** 2-3 level hierarchy. Purpose-driven, not content-type-driven. The "where to put things" decision tree is in CLAUDE.md — the agent is told explicitly which folder each type goes in. Backlinks (not folders) are the primary organizational mechanism: "A note without links is a bug."

**Scale:** Designed for individual use (1 person's vault). Obsidian-mind is a template with 1.3K stars. No data on typical vault sizes, but the structure assumes hundreds to low-thousands of notes.

---

### Approach 4: Karpathy — Emergent hierarchy ("conventions should emerge")

**Pattern:** No prescribed folder structure. Three-layer architecture (raw/wiki/schema) with emergent organization.

**Evidence:** From d8-karpathy-gist.md — Direct gist quotes:
- "This document is intentionally abstract. It describes the idea, not a specific implementation."
- Three layers: raw sources (immutable) / wiki (LLM-owned) / schema (CLAUDE.md/AGENTS.md configuration)
- Two special files: `index.md` (content-oriented catalog) and `log.md` (chronological audit trail)
- No prescribed folder convention within the wiki layer

**Key characteristic:** Deliberately does NOT prescribe hierarchy. The gist says the LLM and user "co-evolve" the schema over time. The index.md file serves as the navigational layer regardless of folder structure. This aligns with open-knowledge rabbit hole #4: "the conventions should emerge from real skill usage, not be designed top-down."

**Scale:** Karpathy operates at ~100 articles, ~400K words. Claims index.md "works surprisingly well at moderate scale (~100 sources, ~hundreds of pages) and avoids the need for embedding-based RAG infrastructure." No folder convention is needed at this scale because the index.md IS the navigation.

---

### Approach 5: DeepWiki — Code-derived hierarchy (subsystem-based)

**Pattern:** Hierarchy mirrors the source code's module structure.

**Evidence:** From d4-deepwiki.md — Direct fetch of deepwiki.com/microsoft/vscode:
```
VS Code Codebase Overview (entry point)
├── Application Startup and Process Architecture
├── Build System and CI/CD
├── Core Editor (Monaco)
├── Terminal
├── Debugger
├── Extensions
└── ... 15+ additional major subsystems
```

Each top-level section is a code subsystem. Within each section, pages follow the code's own organizational structure. The hierarchy is auto-generated from the codebase — not human-designed or agent-curated.

**Key characteristic:** The hierarchy IS the domain structure of the source material. For code, that's modules/packages/subsystems. The pattern: derive hierarchy from the source data's own organization, don't impose external taxonomy.

**Scale:** Handles large codebases (VS Code = millions of LOC). The hierarchy depth varies by codebase but is typically 2-4 levels matching the code's module nesting.

---

### Approach 6: Graphify — Clustered hierarchy (topology-derived)

**Pattern:** Leiden community detection on the knowledge graph; clusters become navigational groups.

**Evidence:** From d1-graphify.md — `graphify/cluster.py:44-117`:
- Graph-topology-based clustering (no embeddings). Leiden finds communities by edge density
- Split oversized communities (>25% of graph) recursively
- Re-index communities by size descending (deterministic)
- Communities become navigational groups in the output HTML report

**Key characteristic:** No folder hierarchy at all. Instead, the knowledge graph's topology defines groupings. Communities emerge from link density — articles that are heavily cross-linked cluster together. The agent navigates by community (get_community tool), not by folder.

**Scale:** Designed for codebase analysis (function/class graphs). Community count scales with graph size. At 100-500 nodes, produces 5-20 communities. At 5000+ nodes, produces hundreds of communities with sub-communities.

---

## Part 2: Established Knowledge Management Patterns

### PARA Method (Tiago Forte)
- **Structure:** Projects / Areas / Resources / Archive — 4 top-level folders organized by actionability
- **Depth:** 2 levels (category/item). Sub-folders discouraged
- **Scale:** Designed for personal use, hundreds of notes
- **Principle:** "Organize by actionability, not by topic." Move items between folders as their actionability changes
- **Agent relevance:** PARA's categories are human-workflow-centric (what am I working on NOW vs what's reference material). Less useful for agent navigation because the agent doesn't have "projects" — it has queries
- **Source:** [PARA + Zettelkasten template on Obsidian Forum](https://forum.obsidian.md/t/para-zettelkasten-vault-template-powerful-organization-task-tracking-and-focus-tools-all-in-one/91380)

### Zettelkasten (Niklas Luhmann)
- **Structure:** Flat or near-flat. Notes identified by sequential IDs (1a, 1b, 1b1). Links between notes are the primary structure
- **Depth:** 1-2 levels at most. "The permanent notes (Zettels) should be free from any folder hierarchy"
- **Scale:** Luhmann's original: ~90,000 notes. Modern digital implementations: hundreds to thousands
- **Principle:** "Structure emerges from connections, not containers." Notes link to each other; structure is discovered, not imposed
- **Agent relevance:** The Zettelkasten's flat structure with dense links is highly agent-compatible. The agent navigates via links (backlinks, forward links) rather than folder paths. This is the graph navigation pattern (D5)
- **Source:** [Zettelkasten Forum: Beginning Obsidian Note Structure](https://forum.zettelkasten.de/discussion/1726/beginning-obsidian-note-structure), [Pragmatist's Guide to Zettelkasten Structure](https://actionablenotes.substack.com/p/the-pragmatists-guide-to-zettelkasten)

### Maps of Content (MOCs) — Nick Milo
- **Structure:** Index notes that curate links to related notes. No folder hierarchy required. MOCs are just regular notes with curated link collections
- **Depth:** Effectively 1 level (MOC → notes). MOCs can link to other MOCs for multi-level navigation
- **Scale:** Hundreds to thousands of notes
- **Principle:** "Let notes exist freely; create MOCs to organize retroactively." MOCs are bottom-up — created when a cluster of notes needs organization
- **Agent relevance:** MOCs ARE index.md files. The pattern of "create an index note that curates links to related content" is exactly what open-knowledge's CC6 auto-maintained index.md does. MOCs validate the index-as-note pattern
- **Source:** [Obsidian Rocks: How I Use Folders in Obsidian](https://obsidian.rocks/how-i-use-folders-in-obsidian/)

### Wiki Namespaces (MediaWiki)
- **Structure:** 16+ namespaces (Main, User, Help, Template, Category, etc.) separate content by type. Subpages enabled via `/` paths within namespaces
- **Depth:** 2+ levels (namespace/page or namespace/page/subpage). Wikipedia discourages more than 2 subpage levels
- **Scale:** Wikipedia: 60M+ articles. MediaWiki handles any scale
- **Principle:** "Namespaces partition by type and function; categories provide cross-cutting taxonomy." Pages can belong to multiple categories but only one namespace
- **Agent relevance:** The namespace pattern is GBrain's type-prefixed approach. `people/garry-tan` ≈ `User:Garry_Tan`. Categories ≈ tags. The dual taxonomy (namespace = type, category = topic) is a proven pattern at massive scale
- **Source:** [MediaWiki Help: Namespaces](https://www.mediawiki.org/wiki/Help:Namespaces), [WikiTeQ: Guide to MediaWiki Namespaces](https://wikiteq.com/post/mediawiki-namespaces-pages-categories)

### Confluence Spaces
- **Structure:** Spaces (team/project level) → hierarchical page tree within each space. Each space has its own page hierarchy
- **Depth:** Varies by space. Atlassian recommends 3-4 levels maximum
- **Scale:** Enterprise: thousands of spaces, millions of pages across an organization
- **Principle:** "Spaces partition by team/project; page trees provide local hierarchy." Cross-space linking for connections
- **Agent relevance:** Confluence's space model maps to a multi-KB architecture (each space = a project/KB). Within a space, the page tree is the navigational hierarchy. Dust.tt's synthetic filesystem over Confluence content validates this as an agent-navigable pattern
- **Source:** [BlueSpice: MediaWiki vs Confluence](https://bluespice.com/mediawiki-versus-confluence-not-a-question-of-features/)

### Notion Workspace Hierarchy
- **Structure:** Workspace → Teamspaces → Pages → Sub-pages → Blocks. Databases as cross-cutting structured data
- **Depth:** Recommended maximum 4 levels. "Not exceeding four levels when architecting navigation" based on cognitive science
- **Scale:** Teams of 5 to organizations of 5000+
- **Principle:** "Databases over pages for structured data; pages for narrative content." Linked databases provide cross-cutting views without duplicating data
- **Agent relevance:** Notion's 4-level maximum and database-as-primary-structure are design constraints worth adopting. The "databases are cross-cutting, pages are hierarchical" split maps to "frontmatter is queryable, folders are navigational"
- **Source:** [Notion VIP: Principles of a Mindful Notion User](https://www.notion.vip/insights/principles-of-a-mindful-notion-user), [Notion Help: Organization Setup](https://www.notion.com/help/guides/everything-about-setting-up-and-managing-an-organization-in-notion)

---

## Part 3: Cognitive Science on Hierarchy Depth

### The depth-breadth tradeoff (Miller 1981; Bergman et al.)
- **Finding:** Retrieval time follows a U-shaped curve — too shallow (too many items per level) and too deep (too many clicks) both increase retrieval time. The optimal balance for menu navigation: **2 levels with 8 choices per level** (Miller 1981). For file systems: **3 levels is optimal for daily work** (Compresto 2026 guide, synthesizing prior research).
- **Source:** [Miller 1981: Depth/Breadth Tradeoff in Hierarchical Menus](https://journals.sagepub.com/doi/10.1177/107118138102500179), [Bergman et al.: Effect of Folder Structure on Navigation](https://www.researchgate.net/publication/220432870_The_Effect_of_Folder_Structure_on_Personal_File_Navigation)

### Cognitive load and navigation (Nature Scientific Reports 2015)
- **Finding:** Navigating digital folders uses the same brain structures as real-world spatial navigation (hippocampus, retrosplenial cortex). Deep hierarchies tax spatial working memory. The brain treats folders as "places" — more levels = more "rooms to remember."
- **Agent implication:** Agents don't have hippocampal spatial memory, but they DO have finite context windows. Each hierarchy level requires a `list_directory` or `read_file` call. More levels = more tool calls = more tokens consumed for navigation. The cognitive load analog for agents is token cost per navigation step.
- **Source:** [Nature: Navigating Through Digital Folders Uses Same Brain Structures as Real World Navigation](https://www.nature.com/articles/srep14719)

### The "flat + metadata" recommendation (Karl Voit 2020; Obsidian community consensus 2025-2026)
- **Finding:** "Don't do complex folder hierarchies — they don't work. Follow a very flat hierarchy concept and invest effort in advanced retrieval methods instead." At scale (8,000+ notes), systems that relied on deep folders were iteratively refactored toward "flat structures with strategic subfolders" combined with tags and links. IDC survey: knowledge workers spend 4.5 hours/week looking for documents in hierarchical systems; half the time they fail.
- **Source:** [Karl Voit: Avoid Complex Folder Hierarchies](https://karl-voit.at/2020/01/25/avoid-complex-folder-hierarchies/), [dsebastien: PKM at Scale — 8,000 Notes](https://www.dsebastien.net/personal-knowledge-management-at-scale-analyzing-8-000-notes-and-64-000-links/), [Obsidian Forum: Folders vs Flat](https://forum.obsidian.md/t/folders-and-links-hierarchies-vs-flat/48400)

---

## Part 4: Scale Analysis — What Works at Each Scale

### At 10-50 articles: Flat is correct
- **Evidence:** Karpathy operates at ~100 articles with no folder convention. The index.md alone provides full orientation. GBrain's type-prefixed approach at this scale would have ~5 type folders with ~10 items each — minimal value over flat.
- **Recommendation:** No folders needed. One root index.md is sufficient navigation. Creating folders adds overhead without benefit.

### At 50-200 articles: Optional light grouping
- **Evidence:** Obsidian community consensus (2025-2026) strongly favors MOC/links over folders at this scale. PARA's 4-folder approach works but is workflow-centric not topic-centric. The obsidian-mind template uses 7 purpose-based top-level folders — reasonable at ~200 notes.
- **Recommendation:** 1 level of optional grouping by topic or type. Folders emerge when a topic cluster exceeds ~10-15 articles and the user or agent naturally groups them. Not pre-scaffolded.

### At 200-1000 articles: Light hierarchy becomes necessary
- **Evidence:** ByteRover's 4-level hierarchy is agent-discovered at this scale. GBrain's type-prefixed approach handles 1,222 entries in a single type folder (people/). Notion recommends max 4 levels. Cognitive science: 2-3 levels optimal.
- **Recommendation:** 2-3 levels of hierarchy. Top level: ~5-15 topic folders. Second level: subtopics within large clusters. Per-folder index.md provides orientation at each level. The hierarchy should help both agents (fewer items to scan per `list_directory` call) and humans (recognizable topic groupings).

### At 1000-5000 articles: Structured hierarchy required
- **Evidence:** GBrain's 7,471 files with type-prefixed slugs. Wikipedia uses namespaces + categories. Confluence uses spaces + page trees. At this scale, flat-within-type folders become unwieldy (1,222 files in one folder is too many to scan). Sub-hierarchy is needed.
- **Recommendation:** 3-4 levels of hierarchy. Type or domain at top level, topic groups at second level, subtopics at third. Per-folder index.md at each level. Search becomes essential alongside hierarchy (D9 finding: tree + scoped search, not either/or).

### At 5000+ articles: Beyond P0 — needs database backing
- **Evidence:** GBrain hits git's scaling ceiling at ~5K files. Garry Tan's solution: SQLite as canonical storage. Confluence/MediaWiki use database backing. At this scale, folder hierarchy is a rendering concern (how to present the data) not a storage concern.
- **Recommendation:** Out of scope for P0. Note: open-knowledge's git-based markdown approach has a natural ceiling around 5K articles per KB. Scale beyond requires either sharding or database backing (GBrain's bet).

---

## Part 5: Synthesis — The 6 Approaches Compared

| Approach | Hierarchy Depth | Who Decides | Scale Sweet Spot | Agent Navigation Cost |
|----------|----------------|-------------|------------------|----------------------|
| **ByteRover** (canonical 4-level) | 2-4 levels | Agent (curation pipeline) | 200-2000 entries | 2-4 reads to navigate |
| **GBrain** (type-prefixed) | 2 levels | Schema (pre-defined types) | 100-7000+ entries | 1-2 reads per type |
| **obsidian-mind** (purpose-based) | 2-3 levels | Human (template) | 100-500 notes | 1-2 reads per purpose area |
| **Karpathy** (emergent) | 0-? levels | Co-evolved human+LLM | 50-200 articles | 1 read (index.md) |
| **DeepWiki** (code-derived) | 2-4 levels | Auto-generated from source | Any (code scale) | 2-3 reads per subsystem |
| **Graphify** (clustered) | 0 levels (graph) | Algorithm (Leiden) | 100-5000 nodes | 1 tool call per community |

**Convergent finding:** No system prescribes more than 4 levels. The range is 0-4, with 2-3 being the most common. The systems that work at the largest scale (GBrain 7K+, MediaWiki 60M+) use flat-within-type with cross-cutting metadata — not deep nesting.

**The strongest pattern at 100-1000 scale:** Light hierarchy (1-2 levels) with per-folder index.md + dense cross-linking + flat search. This is the intersection of ByteRover (agent-discovered hierarchy), Karpathy (index.md as navigation), MOCs (index notes over folder nesting), and the cognitive science recommendation (2-3 levels max).

---

## Gaps / follow-ups
- No empirical measurement of agent navigation efficiency (tool calls, tokens consumed) comparing flat vs 2-level vs 3-level hierarchy on the SAME KB content
- PARA's workflow-centric categories (Projects/Areas/Resources/Archive) may be useful for open-knowledge's "compiled truth + timeline" convention (GBrain D6) — sources as "Resources," compiled articles as "Areas" — but this hasn't been tested
- How do agents handle the case where a folder has 200+ files? Do they scan the index.md or attempt to list all files? Performance testing needed

## Related open-knowledge material
- **PQ17** (root index scope) — directly answered by this analysis. See D10 recommendation in REPORT.md
- **CC6** (recursive index.md per folder) — validated as the correct navigational mechanism
- **Rabbit hole #4** (over-engineering project structure) — reinforced. Start minimal, let hierarchy emerge
- **PQ7** (project structure as permission boundaries) — Karpathy's raw/wiki/schema maps to read/write/config permissions
