---
title: Demo Direction For Graph-First MCP Showcase
description: Internal note for the dev group on how to demo Open Knowledge as a live, agent-driven knowledge graph without losing the richer original analysis.
tags:
  - demo
  - graph
  - mcp
  - agents
  - product
type: internal-note
---

# Demo Direction For Graph-First MCP Showcase

I looked through the actual MCP registry and the graph implementation. The current MCP surface is already strong for a graph-first demo:

- Read/navigation: `exec`, `read_document`, `search`, `list_documents`
- Corpus building: `init-content`, `ingest`, `research`, `consolidate`
- Live editing: `write_document`, `edit_document`, `rename_document`
- Graph intelligence: `get_backlinks`, `get_forward_links`, `get_orphans`, `get_hubs`, `suggest_links`, `get_dead_links`
- Time/history: `get_history`, `save_version`, `rollback_to_version`

The best demo is not "agent writes docs." It is **a living knowledge garden forming itself in real time**.

## Best Demo Shape

Use 4 roles, not 1:

1. `Taxonomist` creates 4-6 hub pages with consistent frontmatter: `title`, `description`, `tags`, plus one stable field like `category` or `cluster`.
2. `Researchers` create 4-8 spoke pages per hub, each linking to its hub and 2-3 sibling pages.
3. `Gardener` runs `get_orphans`, `get_dead_links`, and `suggest_links`, then patches pages to densify the graph.
4. `Curator` writes one top-level map page linking the major hubs.

That gives the best visual arc:

- sparse seed graph
- clusters appear
- cross-links tighten the graph
- orphan count drops
- hubs emerge
- optional `save_version` / `rollback_to_version` moment for time travel

The strongest social clip is a split-screen:

- left: prompt / agent activity
- center: document content changing
- right: fullscreen graph on `Explore`, then briefly `Orphans`, then `Hubs`

## What Would Make It Pop

The main thing missing right now is metadata-aware graph rendering. The graph API currently returns structural identity and labels, but not frontmatter-driven display metadata like `category`, `cluster`, or `tags`, and the client still uses fixed color constants.

`packages/server/src/api-extension.ts`

```ts
const enrichedNodes = nodes.map((node) =>
  node.kind === 'doc'
    ? {
        id: node.id,
        kind: 'doc' as const,
        docName: node.docName,
        anchor: node.anchor ?? null,
        label: readPageTitleForDocName(node.docName),
      }
```

`packages/app/src/components/GraphView.tsx`

```ts
const defaultNodeColor = isDark ? '#6b7280' : '#9ca3af';
const activeNodeColor = isDark ? '#69a3ff' : '#3784ff';
const edgeColor = isDark ? 'rgba(75,85,99,0.6)' : 'rgba(209,213,219,0.8)';
const labelColor = isDark ? '#f3f4f6' : '#111827';
const activeNodeRingColor = isDark ? 'rgba(105,163,255,0.45)' : 'rgba(55,132,255,0.3)';
```

So if we want tags/categories/colors to matter, I would prioritize:

- Add `category`, `cluster`, `tags`, `status`, `lastEditedBy`, and `colorSeed` to `/api/link-graph`
- Color by one stable field like `cluster` or `category`, not arbitrary freeform tags
- Use node size for degree or recency
- Use ring/glow for "currently being edited by agent"
- Add hover chips for `tags` / `status`

That alone would make the graph go from "nice utility" to "shareable product moment."

## Highest-Leverage Missing Functionality

If the goal is "viral graph-native agent wiki," I would rank the missing features like this:

1. `get_link_graph` MCP tool

Agents can query backlinks/hubs/orphans, but there is no direct graph snapshot/neighborhood MCP tool. If agents could inspect the graph itself, they could intentionally improve topology.

2. First-class frontmatter mutation tool

Right now tags/categories are possible, but awkward. A dedicated `update_frontmatter` or `bulk_update_frontmatter` tool would make taxonomy demos much smoother.

3. `apply_suggested_links` / `autolink_document`

`suggest_links` is great, but the killer moment is "agent notices weak graph, then repairs it."

4. Batch graph-plan tool

Something like `apply_graph_plan({ docs, links, frontmatter })` would let one prompt create a coherent cluster instead of lots of tiny write calls.

5. Graph timeline / graph diff

Because we already have `save_version` and rollback, a scrubber showing graph evolution over time would be incredibly shareable.

6. Visible agent attribution in graph

We already pass agent identity and `colorSeed` through writes. Surfacing that in node halos or recent-edit overlays would make multi-agent demos much more legible.

## What Would Impress Karpathy / Obsidian / MCP Communities

What those communities care about is not just pretty graph visuals. It is this combination:

- Plain markdown files, not a hidden proprietary DB
- Agents externalizing thought into durable notes
- Dense backlinks and graph structure as a byproduct of reasoning
- Git/version history and rollback
- Local-first feeling with real-time collaboration
- A visible "wiki grows itself" loop

So the punchy message is:

> Prompt in, live graph out, plain markdown underneath, versioned in git, and agents can repair the wiki structure themselves.

That is much more compelling than "AI writes docs."

## Demo Prompt

If we want a single prompt to drive the session, I would use something like:

```text
You are operating inside Open Knowledge with live MCP tools and a visible graph view.

Goal:
Create a striking, fast-growing knowledge graph that makes the product feel alive. Optimize for:
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
- Use tags and categories consistently so graph colors could later map to them.
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
- cluster should be one of: retrieval, long-term-memory, planning, knowledge-graphs, evaluation
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

## Multi-Agent Script

Best live demo: 4 agents plus the graph fullscreen on a second monitor/window.

### Agent 1: Architect

Purpose: create the backbone.

Use:

- `exec`
- `list_documents`
- `write_document`

Tasks:

1. Create `ai-memory-systems` map page.
2. Create 5 hub pages.
3. Add frontmatter and initial hub-to-map links.

### Agent 2: Cluster Builder A

Purpose: build 2 clusters fast.

Use:

- `write_document`
- `edit_document`

Tasks:

1. Fill `retrieval` and `long-term-memory`.
2. Create 4-6 spoke pages each.
3. Link each spoke to hub + siblings.

### Agent 3: Cluster Builder B

Purpose: build 3 clusters in parallel.

Use:

- `write_document`
- `edit_document`

Tasks:

1. Fill `planning`, `knowledge-graphs`, `evaluation`.
2. Create 4-6 spoke pages each.
3. Add cross-cluster bridges where natural.

### Agent 4: Gardener

Purpose: make the graph tighten itself.

Use:

- `get_hubs`
- `get_orphans`
- `get_dead_links`
- `suggest_links`
- `edit_document`

Tasks:

1. Watch for disconnected pages.
2. Patch pages to add missing links.
3. Resolve dead links.
4. Strengthen 3-5 major hubs.

## Recording Sequence

1. Start with nearly empty graph.
2. Agent 1 creates hubs: first visible cluster skeleton.
3. Agents 2 and 3 run in parallel: graph blooms rapidly.
4. Switch graph to fullscreen.
5. Agent 4 runs repair pass: show orphan count dropping and hubs rising.
6. End on top-level map page, then pan back to fullscreen graph.

## Feature Shortlist

These would most increase the wow factor:

1. Metadata-aware graph nodes
2. `get_link_graph` MCP tool
3. Frontmatter mutation tool
4. Auto-link repair tool
5. Batch graph-plan tool
6. Graph timeline / graph diff
7. Visible agent attribution in graph

## Social-Media Hook

Best positioning line:

> Plain markdown wiki, live multiplayer graph, agents creating and repairing the knowledge structure in real time.

Best short clip:

- 10s: empty graph to 5 hubs
- 15s: parallel agents explode the graph into clusters
- 10s: repair pass removes orphans and strengthens hubs
- 5s: reveal markdown files + frontmatter underneath

## Small Cleanup Before Recording

One small cleanup I noticed: the MCP docs still mention `undo_agent_edit` / `redo_agent_edit`, but the current registry appears to expose `suggest_links` and `get_dead_links` instead. I would align that before recording a polished demo.
