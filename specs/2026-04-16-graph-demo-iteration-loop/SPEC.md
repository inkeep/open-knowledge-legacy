# Graph Demo Iteration Loop — Spec

**Status:** Draft
**Owner(s):** Mike (product), AI agent (spec draft)
**Last updated:** 2026-04-16
**Links:**
- Demo direction note: `../../demo.md`
- Evidence: `./evidence/demo-capability-baseline.md`

---

## 1) Problem statement
- **Who is affected:** The dev group iterating on the graph-first story, the person recording demo clips, and implementers choosing which graph/MCP features to build next.
- **What pain / job-to-be-done:** We have enough capability today to create a compelling graph-centric demo, but no durable iteration ladder. We need a phased set of **runnable prompt packs** where stage 0 works now, and every later stage is a concrete failing test that turns green when a specific product capability lands.
- **Why now:** The graph surface is already visually interesting and the MCP/write surfaces are already strong. This is the ideal moment to establish a repeatable demo loop that both excites the team today and drives product implementation in the right order.
- **Core narrative (from `demo.md`):** "The best demo is not 'agent writes docs.' It is **a living knowledge garden forming itself in real time.**"

## 2) Goals
- **G1:** Ship a stage-0 prompt pack that works with the current product today and is good enough to record immediately.
- **G2:** Define every later phase as a **demo-first failing test**: a prompt pack that currently fails for a specific product reason, plus the implementation required to make it green.
- **G3:** Give every phase a **smoke loop** (tiny corpus, ~90s) and a **hero loop** (large or real corpus, recording-quality) so iteration can happen frequently.
- **G4:** Sequence phases so each unlock is both architecturally sound and visibly impressive in a recording.
- **G5:** Establish clean precedents: one canonical topic, standardized corpus sizes, reusable prompt structure, and product-grounded success criteria with machine-assertable checks.

## 3) Non-goals
- **NG1:** One giant hero prompt that is exciting once but too slow or brittle to rerun frequently.
- **NG2:** Demo-only hacks that do not correspond to real product capability.
- **NG3:** Optimizing for theatrics at the expense of clean API/UI precedents.
- **NG4:** Treating later demo capabilities as vague future ideas without concrete acceptance criteria and prompt contracts.
- **NG5:** Deferred tech debt — each phase is implemented correctly or not at all.

## 4) Personas / consumers
- **P1: Implementing engineer** — needs a small, fast prompt that can be rerun after each code change to prove the new capability works.
- **P2: Product/engineering storyteller** — needs a flow that looks good in a screen recording and can be celebrated.
- **P3: Dev group reviewer** — wants to understand what payoff each next feature unlocks before deciding what to build.
- **P4: Future agent/operator** — needs a durable, explicit sequence of prompts and green conditions instead of reconstructing intended demo behavior from chat history.

## 5) User journeys

### P1: Engineer runs a fast smoke loop
1. Pick the current phase.
2. Run the phase's smoke prompt against the tiny corpus.
3. The green conditions are either clearly met (pass) or clearly not (fail).
4. Implement the missing capability.
5. Rerun the same prompt to verify pass.

### P2: Storyteller records a payoff clip
1. Use the same phase, but run the hero prompt against a larger or real corpus.
2. Record the live run.
3. The new capability produces an unmistakable visual payoff in the graph.

### P3: Dev group selects what to build next
1. Review the phase ladder.
2. See the current green phase, the next red phase, and the specific product gap blocking it.
3. Choose the next implementation target based on both architectural merit and demo payoff.

### Aha moment
The demo plan is not separate from the product roadmap. The next product feature IS the next demo that becomes possible.

## 6) Requirements
### Functional requirements
| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | Stage 0 works with the current product | The smoke and hero prompts run against current MCP tools and graph UI, producing clip-worthy results | No new code required |
| Must | Every later phase is a failing demo contract | Each phase specifies: the exact demo payoff, the blocking missing capability, a smoke prompt, a hero prompt, machine-assertable green conditions, and visual green conditions | |
| Must | Every phase has a fast rerun path | Smoke loops target ~90s on the tiny corpus; if too slow, phase is split into sub-step prompts | |
| Must | Phases compose cumulatively | Later prompts build on the same corpus and conventions rather than inventing unrelated topics | |
| Must | Prompts are product-grounded | Prompt contracts exercise real product surfaces (MCP, graph UI, metadata, graph repair, attribution, timeline) | The demo IS the product |
| Must | Phase order reflects both payoff and architecture | Sequencing unlocks visible wins quickly while establishing clean contracts that later phases build on | |
| Must | Green conditions include machine-assertable checks | Topology, orphan count, dead links, metadata presence checked via MCP/API assertions; visual checks only for UI-specific behavior | |
| Should | Corpus strategies include both synthetic and real | Tiny synthetic corpus for smoke loops, existing repo corpus (~1500+ docs) for impressive hero demos | |
| Could | Prompt packs graduate to checked-in assets | Prompts could move into a `demo/` directory once the ladder stabilizes | |

### Non-functional requirements
- **Performance:** Smoke loops target ~90s. Phases that can't meet that budget are decomposed into sub-steps.
- **Reliability:** Prompts use deterministic corpus shapes and verifiable success criteria.
- **Safety:** Demo phases use synthetic topics and safe content. No external services or privileged data.
- **Operability:** Every phase makes it obvious what failed: missing metadata in API, missing UI affordance, missing MCP tool.
- **Cost:** Maximize visible payoff per implementation step. No dead-end demo scaffolding.

## 7) Success metrics & instrumentation
| Metric | Baseline | Target | Instrumentation |
|---|---|---|---|
| Smoke loop rerun time | Undefined | ≤ 90s for tiny corpus, or decomposed sub-steps within budget | Manual timing; harness script if checked in |
| Time from feature landing to shareable clip | Ad hoc | Same day, using the phase's hero prompt | Track via shipped demo clips |
| Phase clarity | Missing capabilities known but not organized as green-able stages | Dev group can identify next implementation target + its visible payoff without explanation | Qualitative review against this spec |
| Green condition pass rate | No machine checks | Smoke loops report pass/fail for every machine-assertable check | Agent output or harness script |

## 8) Current state

### What exists today
- **21 MCP tools** spanning read, write, graph intelligence, and version control. See `evidence/demo-capability-baseline.md` Finding 1 for the full list.
- **Fullscreen graph surface** with Explore (force-directed graph), Orphans (incoming/outgoing/both), and Hubs (by inbound count). Canvas-based via `react-force-graph-2d`.
- **Rich graph intelligence**: `get_orphans`, `get_hubs`, `get_dead_links`, `suggest_links` (with precise offsets), `get_backlinks`, `get_forward_links`.
- **Version control**: `save_version`, `rollback_to_version`, `get_history` for shadow-repo checkpoints.
- **Agent identity plumbing**: `agentId`, `agentName`, `clientName`, `colorSeed` already flow through write/edit paths.
- **Existing repo corpus**: ~1500+ markdown files with frontmatter, wiki-links, and natural graph structure. Available as a real-world demo corpus with zero setup.
- **`demo.md`** captures the core narrative, a single-agent hero prompt, a 4-agent parallel script, and a recording sequence.

### What does NOT exist
- `/api/link-graph` does not include frontmatter metadata (cluster, category, tags) in node payloads.
- `GraphView` uses fixed color constants — no metadata-driven coloring.
- No `get_link_graph` MCP tool — agents cannot query graph topology directly.
- No `update_frontmatter` or `bulk_update_frontmatter` MCP tools.
- No `apply_graph_plan` batch creation tool.
- No `apply_suggested_links` / `autolink_document` MCP tools.
- No agent attribution rendering in the graph surface.
- No graph timeline/diff UI.

### What partially exists
- **Frontmatter mutation** is achievable via `edit_document` find/replace targeting YAML fields, but is fragile (requires knowing exact current values, no merge semantics).
- **Auto-link application** is achievable manually: `suggest_links` returns precise offsets, and `edit_document` with `offset` can insert links. But it requires multiple tool calls per link and is too slow for a smooth demo.

## 9) Demo infrastructure

### Setup options

**Option A: Real corpus (existing repo)**
1. Start the dev server: `cd packages/app && bun run dev`
2. Open browser to the dev server URL
3. Navigate to fullscreen graph (Explore mode)
4. The server sees all ~1500+ `.md` files in the repo immediately

Best for: hero recordings that show scale; demos where the graph is already populated and agents improve or extend it.

**Option B: Big-bang synthetic corpus**
1. Create a clean content directory (e.g., `demo-content/`)
2. Configure content dir override or start server against it
3. Open browser to fullscreen graph
4. Run the creation prompt — watch the graph grow from empty

Best for: "watch it grow" demos; smoke loops with controlled corpus sizes; before/after comparisons.

**Option C: Hybrid**
Use the real corpus as the base, then run synthetic prompts that create NEW documents in a demo namespace (e.g., `demo/ai-memory-systems/`). The existing graph provides context; the new docs bloom within it.

### Canonical topic
**AI memory systems** — familiar to the AI/eng audience, has natural sub-clustering (retrieval, long-term memory, planning, knowledge graphs, evaluation), and supports cross-cluster bridging.

### Canonical corpus sizes
| Size | Structure | Doc count | Use case |
|---|---|---|---|
| Tiny / smoke | 1 map + 3 hubs + 2 spokes/hub | 10 | Frequent iteration, smoke loops |
| Medium | 1 map + 5 hubs + 3 spokes/hub | 16 | Feature validation |
| Hero | 1 map + 5 hubs + 4-6 spokes/hub | 26-31 | Recording, multi-agent runs |

### Frontmatter conventions (all corpus sizes)
```yaml
title: <short, graph-label-friendly>
description: <one sentence>
tags: [3-6 short tags]
category: <concept | method | tool | benchmark | system | map>
cluster: <retrieval | long-term-memory | planning | knowledge-graphs | evaluation>
```

These fields are included from Stage 0 onward. They don't affect the graph visually until Stage 1, but they establish the convention early and validate frontmatter round-trip fidelity through the CRDT pipeline.

---

## 10) Phase ladder

### Stage 0 — Baseline Bloom (works today)

**Unlock / payoff:** A knowledge graph grows live from near-empty to visibly clustered using only the current product. The graph, orphan/hub views, and graph intelligence tools produce a demo-worthy result today.

**Why it does not fail today:** No new capability required.

**Required functionality:** Current MCP tools + current fullscreen graph surface.

#### Smoke prompt (tiny corpus, ~2-3 min)

```text
You are operating inside Open Knowledge with live MCP tools.
A graph view is open in a browser showing the fullscreen Explore view.

TASK: Create a tiny knowledge garden about "AI memory systems" that
produces a clean, well-connected graph.

CORPUS PLAN (10 documents):
- 1 map page: "AI Memory Systems"
- 3 hub pages: "Retrieval Systems", "Long-Term Memory", "Agent Planning"
- 2 spoke pages per hub:
  - Retrieval: "Vector Search", "Sparse Retrieval"
  - Long-Term Memory: "Memory Consolidation", "Episodic Buffers"
  - Planning: "Goal Decomposition", "ReAct Loops"

FRONTMATTER (every page):
  title: <page title>
  description: <one-sentence description>
  tags: [3-5 short tags]
  category: <one of: concept, method, tool, map>
  cluster: <one of: retrieval, long-term-memory, planning>

LINKING RULES:
- The map page links to all 3 hubs.
- Each hub links back to the map and forward to its spokes.
- Each spoke links to its hub, at least 1 sibling spoke in the same
  cluster, and at least 1 page in a DIFFERENT cluster.
- Use [[wiki-links]] exclusively. No markdown links.
- Links should reflect real conceptual relationships, not random connections.

WORK ORDER:
1. Create the map page.
2. Create the 3 hub pages.
3. Create spoke pages, cluster by cluster.
4. After ALL pages exist, run a health check:
   a. get_hubs — verify the map and hub pages appear as top hubs
   b. get_orphans with mode 'both' — target: zero orphans
   c. get_dead_links — target: zero dead links
5. If any issues, fix them by editing pages to add missing links.
6. Report final state:
   - Total pages created
   - Top 3 hubs by link count
   - Orphan count (target: 0)
   - Dead link count (target: 0)
   - Cross-cluster link count

WRITING STYLE:
- Concise, high-signal, wiki-like prose.
- Every page should feel useful on its own, not just a graph-topology stub.
- Keep titles short (2-4 words) — they must be readable as graph labels.
```

#### Hero prompt (recording-quality, ~5-10 min)

Use the prompt from `demo.md` § "Demo Prompt" — 5 clusters, 4-6 spokes each, ~25-30 documents. The full prompt is:

```text
You are operating inside Open Knowledge with live MCP tools and a visible
graph view.

Goal:
Create a striking, fast-growing knowledge graph that makes the product
feel alive. Optimize for:
- many new documents
- dense, meaningful [[wiki-links]]
- clean clusters with a few strong hub pages
- frontmatter-based categorization
- visible graph improvement over time

Topic:
Build a knowledge garden about "AI memory systems" with 5 clusters:
- Retrieval
- Long-term memory
- Agent planning
- Knowledge graphs
- Evaluation

Hard requirements:
- Create 5 hub pages, one per cluster.
- Create 4-6 spoke pages per cluster.
- Every page must include YAML frontmatter with:
  title:
  description:
  tags:
  category:
  cluster:
- Keep titles short and readable in a graph label.
- Every spoke page must link to:
  - its hub
  - at least 2 sibling pages
  - at least 1 page in a different cluster when relevant
- Create one top-level map page that links all 5 hubs.
- Prefer [[wiki-links]] over markdown links.
- Use tags and categories consistently so graph colors could later map
  to them.
- Avoid random links; links should reflect real conceptual relationships.

Work in phases:
1. Inspect the current corpus and existing graph-related docs.
2. Create the 5 hub pages first.
3. Create spoke pages cluster by cluster.
4. Run graph-health passes:
   - get_hubs
   - get_orphans
   - get_dead_links
   - suggest_links on important hub pages
5. Repair weak connectivity by editing pages to add better links.
6. End by summarizing:
   - top hubs
   - remaining orphans
   - any dead links
   - suggested color groups based on frontmatter clusters

Frontmatter conventions:
- category should be one of: concept, method, tool, benchmark, system, map
- cluster should be one of: retrieval, long-term-memory, planning,
  knowledge-graphs, evaluation
- tags should be 3-6 short tags

Writing style:
- concise, high-signal, wiki-like
- every page should feel useful on its own
- link liberally

Success criteria:
- the graph becomes visibly denser over time
- there are clear clusters and a few strong cross-cluster bridges
- hubs and orphans meaningfully improve after the repair pass
```

#### Hero prompt — multi-agent variant (~5-10 min, from `demo.md`)

Run 4 agents concurrently against the same Open Knowledge server with the graph open fullscreen:

**Agent 1: Architect** — Create the backbone.
```text
You are the Architect agent operating inside Open Knowledge.

Create the structural backbone for an "AI memory systems" knowledge garden:
1. Create 1 top-level map page: "AI Memory Systems"
2. Create 5 hub pages: "Retrieval Systems", "Long-Term Memory",
   "Agent Planning", "Knowledge Graphs", "Evaluation"
3. Every page gets YAML frontmatter: title, description, tags,
   category (use 'map' for the map page, 'concept' for hubs),
   cluster (matching the hub's topic).
4. The map page links to all 5 hubs.
5. Each hub links back to the map.
6. Stop after creating these 6 pages. Do not create spoke pages.
```

**Agent 2: Cluster Builder A** — Build 2 clusters.
```text
You are Cluster Builder A operating inside Open Knowledge.

Wait until the hub pages for "Retrieval Systems" and "Long-Term Memory"
exist, then build out those clusters:

For each hub, create 4-6 spoke pages. Each spoke must:
- Have YAML frontmatter (title, description, tags, category, cluster)
- Link to its hub via [[wiki-link]]
- Link to at least 2 sibling spokes in the same cluster
- Link to at least 1 page in a different cluster when relevant

Keep titles short (2-4 words). Write concise, wiki-style content.
```

**Agent 3: Cluster Builder B** — Build 3 clusters.
```text
You are Cluster Builder B operating inside Open Knowledge.

Wait until the hub pages for "Agent Planning", "Knowledge Graphs",
and "Evaluation" exist, then build out those clusters:

For each hub, create 4-6 spoke pages. Each spoke must:
- Have YAML frontmatter (title, description, tags, category, cluster)
- Link to its hub via [[wiki-link]]
- Link to at least 2 sibling spokes in the same cluster
- Link to at least 1 page in a different cluster when relevant

Keep titles short (2-4 words). Write concise, wiki-style content.
```

**Agent 4: Gardener** — Tighten the graph.
```text
You are the Gardener agent operating inside Open Knowledge.

Wait 60-90 seconds for other agents to create initial content, then
run continuous graph health passes:

Loop:
1. Run get_orphans with mode 'both'. For each orphan, read it and add
   links to related existing pages.
2. Run get_dead_links. For each dead link, either create the missing
   target page or edit the source to fix the link.
3. Run suggest_links on the top hub pages. For high-confidence
   suggestions, edit the source page to add the missing [[wiki-link]].
4. Run get_hubs to monitor hub strength.
5. Report your repair actions and repeat until:
   - Zero orphans in 'both' mode
   - Zero dead links
   - Top 5 hubs each have ≥ 4 inbound links
```

#### Recording sequence (from `demo.md`)
1. Start with nearly empty graph.
2. Agent 1 creates hubs — first visible cluster skeleton.
3. Agents 2 and 3 run in parallel — graph blooms rapidly.
4. Switch graph to fullscreen Explore.
5. Agent 4 runs repair — show orphan count dropping and hubs rising.
6. End on map page, then pan back to fullscreen graph.

**Best clip format:** Split-screen with agent activity (left), document content (center), fullscreen graph (right).

#### Green conditions

**Machine-assertable (agent runs these):**
- `get_hubs(limit=5)` returns ≥ 3 entries (smoke) or ≥ 5 entries (hero)
- `get_orphans(mode='both')` returns empty list
- `get_dead_links()` returns empty list
- `list_documents()` count matches expected corpus size (10 smoke, ~26-31 hero)

**Visual (human verifies):**
- Graph in fullscreen Explore shows visible clustering from force layout
- Orphans view shows 0 pages in `both` mode
- Hubs view shows the map and hub pages at the top
- Graph grew visibly from the starting state

#### Sub-steps (if smoke loop is too slow)
- **S0-A Seed:** Create the map page + 3 hub pages (4 docs)
- **S0-B Grow:** Create 6 spoke pages (6 docs)
- **S0-C Garden:** Run get_hubs / get_orphans / get_dead_links, repair issues

---

### Stage 1 — Semantic Color Bloom

**Unlock / payoff:** Frontmatter metadata becomes visible in the graph. Clusters look like clusters instead of a monochrome cloud. This is the single biggest visual upgrade — it makes every subsequent demo look dramatically better.

**Why it fails today:** `/api/link-graph` does not include frontmatter display metadata (`cluster`, `category`, `tags`). `GraphView` uses fixed color constants with no metadata encoding. See `evidence/demo-capability-baseline.md` Findings 3 and 4.

**Required functionality:**
1. **Server:** Extend `/api/link-graph` node payloads to include frontmatter fields:
   ```ts
   // doc nodes gain:
   { cluster?: string; category?: string; tags?: string[]; }
   ```
   Read from `Y.Map('metadata')` frontmatter cache (already maintained by persistence layer) or fall back to disk read via `readPageTitleForDocName`-style path.

2. **Client:** Color nodes in `GraphView.tsx` by a stable metadata field (`cluster` by default):
   - Use a deterministic hash-to-color mapping (same cluster always gets the same color)
   - Choose a palette with ≥ 8 distinct, accessible colors for both dark and light themes
   - Keep the blue active-node highlight and amber external-node color unchanged
   - Configurable color-by field via a dropdown or the existing graph controls

3. **Client:** Show metadata on hover — extend node tooltip to display `category`, `cluster`, and `tags`.

**Smoke prompt (against existing corpus from Stage 0, ~30-60s):**

```text
You are operating inside Open Knowledge with live MCP tools.
The "AI memory systems" corpus from Stage 0 already exists.

TASK: Verify that frontmatter metadata is visible in the graph.

1. Run list_documents to confirm the corpus is present.
2. Read 3 documents from different clusters and confirm their
   frontmatter includes cluster, category, and tags fields.
3. Report:
   - How many distinct cluster values exist in the corpus
   - Expected number of color groups in the graph
   - Which documents should be visually identifiable as bridge nodes
     (pages linking across clusters)

FAILING TEST (what should work but currently doesn't):
- The graph should render each cluster in a distinct color.
- Hovering a node should show its category, cluster, and tags.

If the graph is still monochrome, this phase is RED.
If clusters are visually distinct by color, this phase is GREEN.
```

**Hero prompt (real repo corpus):**

```text
You are operating inside Open Knowledge with live MCP tools.
The graph view is open fullscreen showing the real project corpus
(~1500+ documents).

TASK: Analyze the existing graph and its metadata color encoding.

1. Run get_hubs(limit=10) to identify the most-linked pages.
2. Read the top 5 hubs and report their frontmatter metadata.
3. Run get_orphans(mode='both') to find disconnected pages.
4. Describe what the graph should look like with metadata coloring:
   - Which clusters or categories should form visible color groups
   - Which hub pages should stand out by degree (size) and color
   - Where cross-cluster bridges should be visible

The visual payoff: the existing repo's natural documentation structure
should produce a stunning colored graph without any synthetic content.
```

**Green conditions:**

**Machine-assertable (developer curls API):**
- `GET /api/link-graph` response nodes include `cluster`, `category`, and `tags` fields where frontmatter is present
- At least 3 distinct `cluster` values appear across the node set

**Visual (human verifies):**
- Graph renders ≥ 3 distinct colors based on `cluster` values
- Hovering a node shows metadata tooltip with category/cluster/tags
- Active node highlight (blue) and external node color (amber) are unchanged

#### Sub-steps
- **S1-A** Extend `/api/link-graph` node payload with frontmatter fields (server only)
- **S1-B** Add cluster-based coloring to `GraphView.tsx` (client only)
- **S1-C** Add metadata tooltip on hover (client only)

---

### Stage 2 — Graph Inspector

**Unlock / payoff:** The agent can see and reason about graph topology directly, enabling topology-aware editing. This is the architectural foundation for every subsequent "intelligent agent" demo — the agent stops being blind to the graph it's building.

**Why it fails today:** There is no `get_link_graph` MCP tool. Agents can query backlinks/hubs/orphans per-document, but cannot get a full or neighborhood graph snapshot. See `evidence/demo-capability-baseline.md` Finding 5.

**Required functionality:**
1. **MCP tool:** `get_link_graph` — exposes the existing `/api/link-graph` endpoint to agents.
   - Parameters: `docName?` (optional focus node), `degrees?` (optional hop radius, requires docName)
   - Returns: `{ nodes: Array<{id, kind, label, cluster?, category?, tags?}>, links: Array<{source, target}> }`
   - Full graph when no params; neighborhood subgraph when docName + degrees provided

2. This tool should compose with Stage 1's metadata enrichment — if Stage 1 has landed, the tool returns metadata fields on nodes. If not, it still returns structural data.

**Smoke prompt (~60-90s):**

```text
You are operating inside Open Knowledge with live MCP tools.
The "AI memory systems" corpus already exists.

TASK: Use the graph inspector to analyze and improve topology.

1. Call get_link_graph to get the full graph snapshot.
2. Analyze the result:
   - How many nodes and edges?
   - Which nodes have the highest degree (most connections)?
   - Are there any isolated subgraphs or weakly connected components?
   - Which clusters have the fewest cross-cluster bridges?
3. Identify the single weakest connection in the graph and fix it
   by editing a page to add a missing [[wiki-link]].
4. Call get_link_graph again and verify the edge count increased.
5. Report:
   - Before: node count, edge count, weakest point
   - After: node count, edge count, what you fixed
   - Cross-cluster bridge count

FAILING TEST: If get_link_graph is not available as an MCP tool,
this phase is RED. If it returns structured graph data that the agent
can reason about, this phase is GREEN.
```

**Hero prompt (~3-5 min):**

```text
You are operating inside Open Knowledge with live MCP tools.
The graph view is open fullscreen.

TASK: Act as a topology-aware graph gardener.

1. Call get_link_graph for the full graph.
2. Compute a "graph health report":
   - Total nodes, total edges, average degree
   - Clusters by node count
   - Cross-cluster edge count vs. intra-cluster edge count
   - Identify the 3 most isolated nodes (lowest degree)
   - Identify missing bridge opportunities between clusters
3. Create a repair plan: which specific edits would most improve
   graph connectivity? Prioritize:
   a. Cross-cluster bridges (connect isolated clusters)
   b. Hub strengthening (ensure every hub has ≥ 5 inbound links)
   c. Orphan rescue (connect any degree-0 or degree-1 nodes)
4. Execute the top 5 repairs by editing existing pages.
5. Call get_link_graph again and report the before/after delta.

The visual payoff: the agent reads the graph, identifies weak spots,
and deliberately strengthens connections — the graph visibly tightens
on screen.
```

**Green conditions:**

**Machine-assertable (agent runs these):**
- `get_link_graph` MCP tool exists and returns a response
- Response contains `nodes` array with `id`, `kind`, `label` fields
- Response contains `links` array with `source`, `target` fields
- After repair: edge count > initial edge count

**Visual:**
- (After repairs) Graph in fullscreen Explore shows tighter clustering
- (No new visual UI requirement — this phase is about agent capability)

#### Sub-steps
- **S2-A** Implement `get_link_graph` MCP tool (wire existing `/api/link-graph` endpoint)
- **S2-B** Run the smoke prompt and verify agent can query and reason about topology
- **S2-C** Run the hero prompt and record the "intelligent gardener" demo

---

### Stage 3 — Live Retaxonomy

**Unlock / payoff:** The agent retags documents and the graph recolors in real time. This makes the metadata model feel alive, not decorative — the agent can reorganize the knowledge structure's taxonomy and the visual graph immediately reflects it.

**Why it fails today:** No first-class `update_frontmatter` MCP tool. `edit_document` can modify frontmatter but is fragile (requires exact current-value matching, no merge semantics). See `evidence/demo-capability-baseline.md` Finding 9.

**Required functionality:**
1. **MCP tool:** `update_frontmatter` — targeted frontmatter field mutation.
   - Parameters: `docName: string`, `fields: Record<string, unknown>` (fields to set/overwrite)
   - Behavior: Parse current frontmatter YAML, merge the provided fields, write back. Fields not in `fields` are preserved. Setting a field to `null` removes it.
   - Must trigger CRDT update so graph view reflects the change live.

2. **MCP tool (optional but valuable):** `bulk_update_frontmatter`
   - Parameters: `updates: Array<{ docName: string, fields: Record<string, unknown> }>`
   - Batch version of `update_frontmatter` — apply multiple updates in one call.
   - Valuable for "retag an entire cluster" demos.

**Smoke prompt (against existing corpus, ~60-90s):**

```text
You are operating inside Open Knowledge with live MCP tools.
The "AI memory systems" corpus already exists with Stage 1 colors active.

TASK: Retag documents and verify the graph recolors live.

1. Read the "Vector Search" page and note its current cluster value.
2. Use update_frontmatter to change its cluster from "retrieval"
   to "evaluation".
3. Read it again to confirm the frontmatter changed.
4. Use update_frontmatter to add a new tag "cross-disciplinary" to
   the "Goal Decomposition" page without losing existing tags.
5. Use bulk_update_frontmatter (if available) to add the tag
   "foundational" to all 3 hub pages at once.
6. Report:
   - Which pages changed
   - What the expected visual change is (node color shift for
     Vector Search, no color change for tag-only updates)

FAILING TEST: If update_frontmatter is not available, this phase is RED.
If frontmatter updates succeed and the graph recolors accordingly,
this phase is GREEN.
```

**Hero prompt (~3-5 min):**

```text
You are operating inside Open Knowledge with live MCP tools.
The graph view is open fullscreen showing colored clusters.

TASK: Run a live taxonomy refactor that visibly reorganizes the graph.

1. Call get_link_graph to see the current cluster distribution.
2. Propose a taxonomy refactor:
   - Split "retrieval" into "sparse-retrieval" and "dense-retrieval"
   - Move 2 evaluation-related pages from "planning" to "evaluation"
   - Create a new cluster "meta-cognition" and retag 2-3 relevant pages
3. Execute the refactor using update_frontmatter / bulk_update_frontmatter.
4. Call get_link_graph again to verify the new cluster distribution.
5. Report:
   - Before: cluster distribution (counts per cluster)
   - After: cluster distribution
   - Which nodes changed color

The visual payoff: the graph visibly reorganizes — nodes shift color as
the agent reclassifies them, and new cluster groupings emerge in the
force layout.
```

**Green conditions:**

**Machine-assertable:**
- `update_frontmatter` MCP tool exists and succeeds
- After update: `read_document` shows the new frontmatter values
- After update: `get_link_graph` (if Stage 2 landed) shows updated `cluster` on the changed node

**Visual:**
- Node color changes in real time after frontmatter update
- Force layout may shift slightly as the color-weight changes (depends on whether color affects forces — likely no layout change, only color change)

#### Sub-steps
- **S3-A** Implement `update_frontmatter` MCP tool
- **S3-B** Run single-doc retag, verify via read_document
- **S3-C** Implement `bulk_update_frontmatter`, run cluster-wide retag
- **S3-D** Record the visual recoloring demo

---

### Stage 4 — Auto-Link Repair

**Unlock / payoff:** Agents don't just create graphs — they detect weakness and repair it automatically. The "agent notices weak graph, then repairs it" moment is one of the most impressive demonstrations of graph intelligence.

**Why it fails today:** `suggest_links` discovers candidates and returns precise offsets, but there is no single-call `apply_suggested_links` tool. Applying suggestions requires the agent to manually `edit_document` per suggestion, which is slow and error-prone. See `evidence/demo-capability-baseline.md` Finding 10.

**Required functionality:**
1. **MCP tool:** `apply_suggested_links`
   - Parameters: `docName: string`, `maxLinks?: number` (default: all suggestions), `dryRun?: boolean`
   - Behavior: Calls `suggest_links` internally, then applies the top N suggestions by inserting `[[wiki-links]]` at the precise offsets. Returns which links were applied and which were skipped (e.g., stale offset, already linked).
   - `dryRun: true` returns what WOULD be applied without modifying documents.
   - Must handle stale offsets gracefully (re-scan if offset doesn't match expected text).

2. **Alternative or complement:** `autolink_document`
   - Parameters: `docName: string`
   - Behavior: Scan a single document for all unlinked references to other pages, and insert wiki-links for each. More aggressive than `apply_suggested_links` (which operates from the target page's perspective).

**Smoke prompt (~60-90s):**

```text
You are operating inside Open Knowledge with live MCP tools.
The "AI memory systems" corpus already exists.

TASK: Run an auto-link repair pass and verify graph improvement.

1. Run get_orphans(mode='both') and get_dead_links.
   Record the baseline counts.
2. Run get_hubs(limit=5) and note the top hub link counts.
3. Pick the hub page with the fewest inbound links.
4. Run apply_suggested_links on that page with dryRun=true.
   Review the proposed links.
5. Run apply_suggested_links on that page (not dry run).
6. Re-run get_orphans and get_hubs.
7. Report:
   - Before: orphan count, dead link count, weakest hub inbound count
   - After: orphan count, dead link count, weakest hub inbound count
   - Links applied: count and list

FAILING TEST: If apply_suggested_links is not available, this phase is RED.
If it applies links and improves graph metrics, this phase is GREEN.
```

**Hero prompt (~3-5 min):**

```text
You are operating inside Open Knowledge with live MCP tools.
The graph view is open fullscreen.

TASK: Run a comprehensive auto-link repair pass across the corpus.

1. Start with a graph health baseline:
   - get_hubs(limit=10)
   - get_orphans(mode='both')
   - get_dead_links
   - get_link_graph (if available) for edge count
2. For each hub page, run apply_suggested_links in dry-run mode.
   Collect all proposed links.
3. Review the proposals — reject any that seem semantically weak.
4. Apply the approved links (run apply_suggested_links without dry-run).
5. For any remaining orphans, run autolink_document on each.
6. Run the same health checks again and report the delta.
7. Summarize:
   - Total links added
   - Orphans eliminated
   - Hubs strengthened
   - Edge count before/after

The visual payoff: the graph visibly tightens — isolated nodes get
pulled into clusters as new edges appear, and hub nodes grow as their
inbound count increases.
```

**Green conditions:**

**Machine-assertable:**
- `apply_suggested_links` MCP tool exists and succeeds
- After repair: `get_orphans(mode='both')` count ≤ before count
- After repair: total edge count (via `get_link_graph` or hubs) increased

**Visual:**
- Graph in Explore shows tighter clustering after repair
- Orphans view shows fewer (ideally zero) pages

#### Sub-steps
- **S4-A** Implement `apply_suggested_links` MCP tool
- **S4-B** Run dry-run, verify proposed links make semantic sense
- **S4-C** Apply links, verify graph metrics improve
- **S4-D** Implement `autolink_document` for aggressive per-doc linking

---

### Stage 5 — Batch Graph Plan

**Unlock / payoff:** A coherent cluster appears almost instantly from a declarative plan rather than dozens of sequential write calls. The graph "pops" — nodes and edges materialize at once.

**Why it fails today:** No batch graph-plan tool. Creating a 5-doc cluster with links requires ~10+ MCP calls. See `evidence/demo-capability-baseline.md` Finding 5.

**Required functionality:**
1. **MCP tool:** `apply_graph_plan`
   - Parameters:
     ```ts
     {
       docs: Array<{
         docName: string;
         markdown: string;
         frontmatter: Record<string, unknown>;
       }>;
       links?: Array<{ source: string; target: string }>;
     }
     ```
   - Behavior: Create all documents with their frontmatter and content, then ensure all specified links exist (by inserting `[[wiki-links]]` in the source docs if not already present).
   - Must use the same underlying `write_document` / `edit_document` CRDT paths to preserve all collaboration invariants.
   - Must be atomic-ish: if a doc creation fails, report the failure but don't roll back already-created docs (idempotent reruns should work).

**Smoke prompt (~60-90s):**

```text
You are operating inside Open Knowledge with live MCP tools.

TASK: Create a new cluster in one shot using a graph plan.

Apply this graph plan:
- cluster: "meta-cognition"
- docs:
  1. "Meta-Cognition" (hub, category: concept, cluster: meta-cognition)
     Content: overview of meta-cognitive processes in AI systems.
     Links to: [[AI Memory Systems]]
  2. "Self-Monitoring" (spoke, category: method, cluster: meta-cognition)
     Content: how AI agents monitor their own reasoning processes.
     Links to: [[Meta-Cognition]], [[Agent Planning]]
  3. "Confidence Calibration" (spoke, category: method, cluster: meta-cognition)
     Content: techniques for agents to calibrate confidence in outputs.
     Links to: [[Meta-Cognition]], [[Evaluation]], [[Self-Monitoring]]
  4. "Reflection Loops" (spoke, category: concept, cluster: meta-cognition)
     Content: iterative self-improvement through reflection.
     Links to: [[Meta-Cognition]], [[ReAct Loops]], [[Self-Monitoring]]

Use apply_graph_plan to create all 4 docs with frontmatter and links
in a single operation.

Verify:
- list_documents shows all 4 new docs
- get_dead_links returns no dead links involving the new cluster
- get_link_graph (if available) shows the new cluster connected to
  the existing graph

FAILING TEST: If apply_graph_plan is not available, this phase is RED.
If it creates the cluster in one operation, this phase is GREEN.
```

**Hero prompt (~3-5 min):**

```text
You are operating inside Open Knowledge with live MCP tools.
The graph view is open fullscreen.

TASK: Create 2-3 new clusters that expand the knowledge garden rapidly.

Design and apply graph plans for:
1. "Meta-Cognition" cluster (4-5 docs)
2. "Multi-Agent Coordination" cluster (4-5 docs)
3. "Tool Use & Grounding" cluster (3-4 docs)

Each cluster should:
- Have a hub page linked to the main "AI Memory Systems" map
- Have spoke pages with cross-cluster bridges to existing content
- Use consistent frontmatter with the new cluster values

Apply each cluster via apply_graph_plan.
After all clusters are created, run a health check and repair pass.

The visual payoff: 3 new colored clusters "pop into" the graph in rapid
succession. The graph expands dramatically in seconds rather than minutes.
```

**Green conditions:**

**Machine-assertable:**
- `apply_graph_plan` MCP tool exists and succeeds
- After plan: `list_documents` count increased by the expected number
- After plan: `get_dead_links` returns no dead links involving the new docs

**Visual:**
- New cluster appears in the graph as a coherent group (if Stage 1 colors landed, it has a distinct color)
- The cluster is connected to the existing graph via bridge links

#### Sub-steps
- **S5-A** Implement `apply_graph_plan` MCP tool
- **S5-B** Apply a single 4-doc cluster plan, verify docs + links created
- **S5-C** Apply 2-3 clusters in sequence, record the visual "pop" effect

---

### Stage 6 — Agent Theater

**Unlock / payoff:** Viewers can see which agent is changing which part of the graph in real time. Multiple agents editing concurrently produce distinct visual signatures, making the "living garden" story tangible.

**Why it fails today:** Agent identity (`agentId`, `agentName`, `colorSeed`) already flows through writes, but the graph does not surface this information visually. See `evidence/demo-capability-baseline.md` Finding 6.

**Required functionality:**
1. **Server:** Expose recent editor/agent attribution per document:
   - Extend `/api/link-graph` nodes with `lastEditedBy?: { agentName: string; colorSeed: string; timestamp: number }` (or similar)
   - Or provide a separate endpoint for recently-edited-by data

2. **Client:** Render agent attribution in `GraphView.tsx`:
   - Node ring/halo/pulse colored by agent's `colorSeed`
   - Animation for "recently edited" state (e.g., glow that fades over 5-10 seconds)
   - Keep attribution legible when multiple agents act concurrently (distinct colors, no overlap ambiguity)

3. **Client:** Legend or overlay showing active agents and their colors.

**Smoke prompt (~60-90s, 2 agents):**

```text
Run two agents concurrently against the AI memory systems corpus:

Agent A (name: "Architect"):
  Edit the "AI Memory Systems" map page to add a new section.

Agent B (name: "Gardener"):
  Edit the "Retrieval Systems" hub page to add a new link.

Both agents should identify themselves with distinct names.
The graph should make it visually obvious:
- Which node(s) are actively being changed
- Which agent is responsible (distinct colors/halos)
- What changed recently vs. what is static

FAILING TEST: If concurrent edits produce no visible attribution
in the graph, this phase is RED. If each agent's edits are visually
distinct, this phase is GREEN.
```

**Hero prompt (~5-10 min, 4 agents):**

Run the full 4-agent script from `demo.md` (Architect, Cluster Builder A, Cluster Builder B, Gardener), each with distinct `agentName` values. The graph should show:
- Different colored halos as each agent writes
- Visible "wave" of activity moving across the graph
- Clear attribution of which agent built which cluster

**Green conditions:**

**Machine-assertable (developer checks):**
- `/api/link-graph` nodes include `lastEditedBy` data with agent name and color
- Multiple distinct agent names appear in the response

**Visual:**
- Concurrent edits produce distinct, visible halos/rings per agent
- A human viewer can tell which agent is working on which cluster

#### Sub-steps
- **S6-A** Extend link-graph API with agent attribution data
- **S6-B** Add agent-colored node halos to GraphView
- **S6-C** Run 2-agent concurrent demo
- **S6-D** Run 4-agent hero demo and record

---

### Stage 7 — Graph Time Travel / Diff

**Unlock / payoff:** The demo can show not just the current graph, but how it became that graph. A timeline/scrubber reveals the evolution from empty seed to rich garden.

**Why it fails today:** `save_version` and `get_history` exist, but there is no graph-level diff or timeline experience. The graph can only show its current state.

**Required functionality:**
1. **Server:** Graph diff between two versions:
   - Endpoint (e.g., `GET /api/graph-diff?from=<sha>&to=<sha>`) returning `{ added: nodes[], removed: nodes[], addedLinks: links[], removedLinks: links[] }`
   - Or: reconstruct graph at a historical version from shadow repo state

2. **Client:** Graph timeline UI:
   - Scrubber or step controls tied to `save_version` checkpoints
   - Visual diff overlay: added nodes glow green, removed nodes glow red, new edges highlight
   - Replay mode: step through versions and watch the graph evolve

**Smoke prompt (~60-90s):**

```text
You are operating inside Open Knowledge with live MCP tools.

TASK: Create a before/after sequence for graph time travel.

1. Run save_version to checkpoint the current sparse state.
2. Create 3 new spoke pages with cross-cluster links.
3. Run save_version again to checkpoint the grown state.
4. Request a graph diff between the two versions.
5. Report:
   - Nodes added
   - Edges added
   - Which hubs were strengthened
   - Which orphans were resolved

FAILING TEST: If graph diff / timeline is not available,
this phase is RED. If the diff shows what changed between versions,
this phase is GREEN.
```

**Hero prompt:**

```text
You are operating inside Open Knowledge with live MCP tools.
The graph timeline view is open.

TASK: Record a full graph evolution replay.

1. Start from a save_version at the earliest available checkpoint
   (the sparse seed state).
2. Step through each checkpoint in order.
3. At each step, describe what changed:
   - New clusters that appeared
   - Bridges that formed
   - Hubs that strengthened
   - The overall graph shape evolution
4. The viewer should see the graph evolve from empty/sparse to
   rich/clustered/well-connected through the timeline scrubber.

The visual payoff: a time-lapse of knowledge growing.
```

**Green conditions:**

**Machine-assertable:**
- Graph diff endpoint returns valid delta between two version SHAs
- Delta includes node and edge additions/removals

**Visual:**
- Timeline scrubber shows distinct checkpoints
- Graph visually evolves when stepping between versions
- Added/removed elements are visually highlighted

#### Sub-steps
- **S7-A** Implement graph diff endpoint
- **S7-B** Build timeline/scrubber UI component
- **S7-C** Record full evolution replay

---

## 11) Implementation requirements summary

Derived from the phase ladder. Each row is the minimum implementation to make that phase's prompts go from red to green.

| Stage | Server changes | Client changes | MCP tool changes |
|---|---|---|---|
| S0 | None | None | None |
| S1 | Enrich `/api/link-graph` nodes with frontmatter fields | Color nodes by `cluster`, add metadata tooltip | None |
| S2 | None (link-graph endpoint already exists) | None | Add `get_link_graph` tool (wire to existing API) |
| S3 | Frontmatter parse/merge/write endpoint | None | Add `update_frontmatter`, `bulk_update_frontmatter` |
| S4 | Suggest-links application logic | None | Add `apply_suggested_links`, optionally `autolink_document` |
| S5 | Batch doc creation endpoint | None | Add `apply_graph_plan` |
| S6 | Attribution data in link-graph response | Agent halo/pulse rendering, active-agent legend | None (attribution already flows through writes) |
| S7 | Graph diff endpoint | Timeline/scrubber UI, diff overlay rendering | None (save_version already exists) |

## 12) Decision log

| ID | Decision | Type (P/T/X) | 1-way door? | Status | Rationale | Evidence / links | Implications |
|---|---|---|---|---|---|---|---|
| D1 | Use a two-tier demo contract for every phase: smoke loop + hero loop | X | No | Confirmed | Satisfies both frequent iteration and recording payoff | `demo.md`, `evidence/demo-capability-baseline.md` | Every phase must define both loops |
| D2 | Stage 0 works with the product exactly as it exists today | X | No | Confirmed | The phase ladder needs a shippable starting point | `demo.md`, `evidence/demo-capability-baseline.md` | Can record immediately |
| D3 | Every later stage is a failing demo contract | X | No | Confirmed | Creates a direct implementation target per capability | This spec §10 | The roadmap is green-able |
| D4 | Phase ordering: colors → inspector → retaxonomy → auto-link → batch plan → theater → timeline | X | No | Confirmed | Colors give the biggest visual lift and make all subsequent demos better; inspector is architecturally foundational for topology-aware demos; matches `demo.md` feature priority | `demo.md`, `evidence/demo-capability-baseline.md` | |
| D5 | Prompt packs are the primary spec deliverable; implementation requirements are derived | X | No | Confirmed | The prompts ARE the demo; this makes them impossible to miss | Session decision D1=B | Spec restructured around prompt packs |
| D6 | Corpus reuse strategy: Stage 0 builds the fixture, later stages test against it | X | No | Confirmed | Smoke loops for S1+ must be fast (~60-90s); corpus creation takes 2-3 min | Session decision D4=B | Later stages don't recreate from scratch |
| D7 | Corpus strategies include both synthetic and real repo | P | No | Confirmed | The existing repo (~1500+ docs) provides a real-world demo corpus; synthetic corpus provides controlled "from nothing" story | Session decision, `evidence/demo-capability-baseline.md` Finding 8 | Hero prompts can use whichever is most impressive for that stage |
| D8 | Canonical topic: "AI memory systems" with 5 clusters | P | No | Confirmed | Familiar to AI/eng audience, natural sub-clustering, not product-specific | `demo.md` | |
| D9 | Green conditions: machine-assertable for structural properties + human-visual for UI properties | X | No | Confirmed | Automates smoke loops, keeps visual checks for UI-only outcomes | Session decision D6=A | Each phase specifies both types |

## 13) Open questions

| ID | Question | Type (P/T/X) | Priority | Blocking? | Plan to resolve / next action | Status |
|---|---|---|---|---|---|---|
| Q1 | Should prompt packs be checked into a `demo/` directory as runnable assets? | X | P1 | No | Decide once the phase ladder is validated by running Stage 0 | Open |
| Q2 | What does the graph look like with the existing ~1500 doc repo corpus? | T | P1 | No | Run the dev server against this repo and check performance + visual quality of the force layout at that scale | Open |
| Q3 | Can the multi-agent hero script run with current MCP infrastructure? | T | P1 | No | Verify that multiple concurrent MCP connections (separate terminal sessions) to the same Hocuspocus server work correctly | Open |
| Q4 | For Stage 1 coloring, should the color-by field be configurable or always `cluster`? | T | P2 | No | Default to `cluster`; add a dropdown later if needed | Open |

## 14) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | A 10-doc corpus is small enough for a ~2-3 min smoke loop | MED | Validate during Stage 0 usage; split into sub-steps if too slow | Before Stage 0 recording | Active |
| A2 | The existing graph fullscreen surfaces (Explore, Orphans, Hubs) are sufficient to make Stage 0 clip-worthy | HIGH | Run and record Stage 0 | Before Stage 0 signoff | Active |
| A3 | The existing write/edit path's `colorSeed` and agent identity are a strong enough foundation for Stage 6 | MED | Confirm server/app surfaces can expose and consume that data without re-architecting | Before Stage 6 implementation | Active |
| A4 | `react-force-graph-2d` can handle ~1500 nodes for the real-corpus hero demo | MED | Run the dev server against this repo and check rendering performance | Before real-corpus hero recording | Active |
| A5 | Frontmatter fields (cluster, category, tags) round-trip correctly through the CRDT pipeline when included from Stage 0 onward | HIGH | Validated by existing fidelity invariants; confirm during Stage 0 | Before Stage 0 recording | Active |

## 15) In Scope
- **Goal:** Produce a durable, implementation-driving demo phase ladder with runnable prompt packs as the primary deliverable.
- **Non-goals:** Rewriting unrelated graph architecture, inventing demo-only subsystems, or collapsing all future capabilities into one hero prompt.
- **Requirements with acceptance criteria:** See §6.
- **Proposed solution:** See §10 (Phase Ladder).
- **Owner(s)/DRI:** Mike.
- **Next actions:**
  - Run Stage 0 smoke prompt and verify it produces a clip-worthy graph
  - Run Stage 0 against the real repo corpus and evaluate graph at scale
  - Validate the multi-agent hero script runs with concurrent MCP connections
  - Choose the first red phase to implement (likely Stage 1: Semantic Colors)
  - Optionally promote approved prompts into checked-in `demo/` assets
- **Risks + mitigations:** See §16.
- **What gets instrumented/measured:** Smoke loop duration, green condition pass/fail, visual payoff per phase.

## 16) Risks & mitigations
| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Smoke prompts exceed ~90s target | Medium | High | Use tiny corpus, split into sub-steps, corpus reuse for S1+ | Spec / implementation owner |
| `react-force-graph-2d` performance degrades at 1500+ nodes | Medium | Medium | Test early; if too slow, default hero to medium corpus; investigate WebGL renderer | Implementation owner |
| Phase ordering optimizes for spectacle but sets poor API precedents | Low | High | Every phase tied to a real reusable product capability; ordering justified architecturally | Spec owner |
| Visual green conditions remain subjective | Medium | Medium | Machine-assertable checks cover structural properties; visual checks are the minority | Implementation owner |
| Multi-agent hero script has race conditions or conflicts | Medium | Medium | The CRDT layer handles concurrent writes; test with 2 agents before 4 | Demo owner |
| Hero prompts drift from smoke prompts | Medium | Medium | Hero prompts scale the same corpus model and frontmatter conventions | Demo owner |

## 17) Future Work

### Explored
- **Checked-in demo harness assets** — Promote validated prompt packs into `demo/phases/stage-0.md`, `stage-1.md`, etc., plus optional helper scripts for corpus setup/teardown and automated green-condition checking.
  - Triggers to revisit: Stage 0 validated, next 1-2 phases selected for implementation.

### Identified
- **Machine-readable phase assertions** — A light assertion schema (JSON or YAML) that a harness script evaluates after each smoke run, reporting pass/fail per green condition.
- **Public launch-story packaging** — Once the phase ladder is validated internally, a public-facing version optimized for launch video / social rollout rather than internal iteration.
- **WebGL graph renderer** — If `react-force-graph-2d` Canvas performance limits hero demos at scale, investigate `react-force-graph-3d` or a custom WebGL renderer.

### Noted
- **Graph-aware prompt templates** — If the phase ladder stabilizes, agent prompts could be generated from graph state (e.g., "the 3 weakest spots in the current graph are X, Y, Z — go fix them") instead of using static prompts.
