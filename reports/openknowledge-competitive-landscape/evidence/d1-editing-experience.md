---
title: "D1: Editing Experience -- Cross-Competitor Evidence"
type: evidence
created: 2026-04-02
parent: openknowledge-competitive-landscape
---

# D1: Editing Experience -- Cross-Competitor Evidence

## Editor Architecture Comparison

| Competitor | Editor Foundation | Canonical Format | Modes | Block Types |
|---|---|---|---|---|
| Notion | Proprietary block engine | Proprietary JSON blocks | WYSIWYG only | 50+ (richest set) |
| Confluence | ADF-based (ProseMirror migration) | Atlassian Document Format (JSON) | WYSIWYG, Live Docs | ~26 block node types |
| Obsidian | CodeMirror 6 + HyperMD | Plain markdown files (.md) | Source, Live Preview, Reading | Extensible via 2,736 plugins |
| Mintlify | Web editor + CLI/local MDX editing | MDX in Git repos | Visual editor, code editor | 22+ built-in MDX components |
| Outline | ProseMirror + React + Y.js CRDT | ProseMirror JSON (JSONB in PostgreSQL) | WYSIWYG only | ~20 block types |
| AFFiNE | BlockSuite (Lit web components, Yjs CRDT) | Yjs binary CRDT (Y.Doc) | Document, Edgeless (whiteboard) | Block-based, custom block support |
| Chroma | None (programmatic-only) | Embedding vectors + raw text | N/A | N/A |

## Key Findings

### Obsidian Sets the Developer Editing Bar
Obsidian's Live Preview mode solved the "two-pane problem" -- inline rendering that collapses away from the cursor without losing access to raw markdown. Three modes (Source, Live Preview, Reading) cover the full spectrum from purist to casual user. Combined with vim keybindings, keyboard-first navigation, and CodeMirror 6 extensibility, it is the benchmark for developer-oriented editing. Average daily usage of 43 minutes/user signals deep engagement.

Sources: [Obsidian docs](https://docs.obsidian.md/Home), [fueler.io statistics](https://fueler.io/blog/obsidian-usage-revenue-valuation-growth-statistics)

### Notion Leads on Rich Content but at the Cost of Portability
Notion's 50+ block types, databases with 6+ view types, and polished UX make it the most capable WYSIWYG editor for non-developers. However, the proprietary block format means content is not portable. Export to markdown is lossy -- databases export as CSV, colors and synced blocks are silently dropped, toggle/callout blocks convert to raw HTML.

Sources: [Notion Data Model Blog](https://www.notion.com/blog/data-model-behind-notion), [Unmarkdown export analysis](https://unmarkdown.com/blog/notion-export-broken)

### Confluence Editor Remains a Persistent Weakness
Despite years of investment and a new ADF-based cloud editor (mandatory from April 2026), community complaints remain endemic. Representative thread: "Why is the Confluence Cloud Editor so much worse?" Complex documents with tables and diagrams are slow to edit. PDF export produces messy formatting. Concurrent editing can mix up changes.

Sources: [Atlassian Community](https://community.atlassian.com/forums/Confluence-questions/Why-is-the-Confluence-Cloud-Editor-so-much-worse/qaq-p/2242549), [PeerSpot reviews](https://www.peerspot.com/questions/what-needs-improvement-with-atlassian-confluence)

### AFFiNE Demonstrates CRDT-Native Editing Is Viable
BlockSuite's document-centric architecture (CRDT as data layer, editors attach/detach) proves that building a full-featured editor on Yjs CRDTs is viable. The "Hyper Fused Platform" concept mixing documents, whiteboards, and databases in one page is novel. y-octo (Rust CRDT engine) provides performance. However, the CRDT binary is the canonical format -- not human-readable markdown.

Sources: [BlockSuite Blog: Document-Centric Editors](https://block-suite.com/blog/document-centric.html), [BlockSuite Blog: CRDT-Native Data Flow](https://block-suite.com/blog/crdt-native-data-flow.html)

### Outline Is Clean but "Very Basic" vs. Notion
Outline's ProseMirror-based editor is polished and fast with ~20 block types, but community perception consistently describes it as "very basic" compared to Notion. No databases, no advanced views. The maintainer explicitly declined a raw markdown editing mode, stating the team is "doubling down on making the editor collaborative" with features markdown cannot represent.

Sources: [GitHub Discussion #3326](https://github.com/outline/outline/discussions/3326), [Featurebase Outline alternatives](https://www.featurebase.app/blog/outline-alternatives)

### Search Quality Is a Universal Weakness
- **Notion**: Search degrades at scale; API indexing is not immediate. Enterprise Search (AI semantic layer) aims to address this.
- **Confluence**: Persistent, widely-acknowledged weakness. Community threads titled "Confluence Search Sucks." Requires exact keyword matches; metadata-poor content is unfindable.
- **Obsidian**: Fast local full-text search with operators, but no semantic/vector search in core (requires plugins).
- **Outline**: PostgreSQL full-text search (tsvector) -- fast for keywords but no semantic understanding in OSS edition.

Sources: [Notion Search API Docs](https://developers.notion.com/reference/search-optimizations-and-limitations), [HN on Confluence search](https://news.ycombinator.com/item?id=28597895)
