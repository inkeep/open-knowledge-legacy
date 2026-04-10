# Wiki-Links + Backlinks (S10) — Spec

**Status:** Final
**Owner(s):** Tim (primary), Mike (MCP surface)
**Last updated:** 2026-04-10
**Bucket:** 7 (STORIES.md)
**Links:**
- Research: `reports/wiki-links-backlinks-architecture/REPORT.md` (2026-04-04) — 7 dimensions, 10+ OSS implementations
- Evidence: `./evidence/` — codebase traces + research synthesis
- Stories: `STORIES.md §Bucket 7`
- Implementation milestones: `./IMPLEMENTATION_MILESTONES.md`

---

## 1) Problem statement

- **Who:** Knowledge workers and AI agents using the KB
- **Pain:** Markdown files in a folder are a set of isolated documents. There's no navigable knowledge graph — no way to link concepts, discover what a page is connected to, or orient in the KB by following links. Agents hit a dead end after reading one file.
- **Why now:** S10 is in the Now phase and sits at the intersection of editor UX (wikilink node) and agent DX (link-graph MCP tools). It depends on and extends the CRDT+persistence foundation (Buckets 1+4) which is landing. The backlink index is also needed for T7.6 (per-folder catalog files reference backlinks).
- **Current workaround:** None — neither writers nor agents have any link graph tooling today.

---

## 2) Goals

- G1: Writers can link pages by name with `[[Page Name]]` syntax and see autocomplete, resolved previews, and red links for non-existent targets
- G2: Every article has a backlinks panel showing which pages link to it
- G3: Agents can query the link graph (backlinks, forward links, orphans, hubs) via MCP tools
- G4: Links survive standard markdown round-trip (stored as `[[...]]` in `.md` files on disk)
- G5: Renaming a page either propagates links or makes broken links clearly visible

---

## 3) Non-goals

- NG1: Graph visualization UI (S-L4 — Fumadocs has react-force-graph-2d; possible low-cost promotion but deferred to Later)
- NG2: Block-level references (`[[Page#^blockid]]`) — Obsidian-specific, non-portable
- NG3: Embed syntax (`![[Page]]` transclusion) — separate feature
- NG4: Real-time collaborative backlink index (agents and multiple humans need consistent state) — backlinks are derived, computed on `onStoreDocument`, eventual consistency is fine
- NG5: Full-text search (S8, Next phase) — `search_files` covers agent needs for Now

---

## 4) Personas / consumers

- **P1: Knowledge worker (writer)** — types `[[` and gets autocomplete; sees backlinks at bottom of article; clicks red links to create new pages
- **P2: External AI agent (Claude Code, Cursor, Codex)** — uses MCP link-graph tools to orient in KB, find orphaned content, discover related pages, suggest cross-links
- **P3: Hocuspocus server / persistence layer** — extracts links on every `onStoreDocument` call to maintain the index

---

## 5) User journeys

### P1: Writer linking a page

1. Writer is editing an article, types `[[Pro` in the editor
2. Autocomplete popup appears with matching page titles (async fetch from server)
3. Writer selects "Project Alpha" → `[[Project Alpha]]` node inserted as inline chip
4. If "Project Alpha" exists → chip renders in default style with link cursor
5. If "Project Alpha" doesn't exist → chip renders as red link
6. Writer clicks red link → confirmation dialog opens with a suggested same-directory path; writer can accept or change it; editor navigates to the created page
7. On save → backlink index updated; "Project Alpha" now shows this article in its backlinks panel

### P1: Writer seeing backlinks

1. Writer opens any article
2. Backlinks panel at article bottom shows "X pages link here"
3. Each entry shows: source page title + context snippet (surrounding sentence)
4. Clicking an entry navigates to that page
5. If no backlinks → panel shows "No pages link here yet"

### P2: Agent orienting in a KB

1. Agent calls `get_backlinks("Project Alpha")` → receives list of pages that reference it (with snippets)
2. Agent calls `get_orphans()` → finds pages with zero incoming links (knowledge gaps)
3. Agent calls `get_hubs()` → finds most-referenced pages (core concepts)
4. Agent calls `suggest_links("New Article")` → finds pages that mention "New Article" concept without a wikilink (link gap detection)

---

## 6) Requirements

### Functional requirements

| Priority | Requirement | Acceptance criteria | Notes |
|---|---|---|---|
| Must | WikiLink inline node in TipTap | `[[Page]]` typed in editor inserts a wikilink node; saved as `[[Page]]` in .md on disk; loaded back as wikilink node | Markdown round-trip lossless |
| Must | `[[` autocomplete trigger | Typing `[[` shows page suggestions; Tab/Enter inserts selected page | Async fetch; debounced |
| Must | Red link detection | Unresolved targets render visually distinct from resolved links | Red = target file doesn't exist |
| Must | Click-to-create on red link | Clicking red link opens a create-page confirmation dialog with a suggested path and optional path override | Default suggestion: same directory as current page |
| Must | Backlinks panel on articles | Bottom of article shows pages linking to current file, with context snippets | Can be empty state |
| Must | Backlink index built on save | `onStoreDocument` extracts wikilinks from ProseMirror JSON and updates in-memory index | Dual adjacency list |
| Must | Backlink index rebuilt on startup | Server start scans all .md files for `[[...]]` patterns to populate index | Regex over disk files |
| Must | Backlink index rebuilt on external change | File watcher triggers re-index when external editor modifies a file | |
| Must | Managed rename/move flow | Intentional rename/move operations go through a first-class app/server flow that rewrites inbound page and section links atomically | Guaranteed path for U7.5 |
| Must | External rename reconciliation fallback | Watcher `delete` + `create` bursts are reconciled by confidence tiers using tombstones + last-known metadata | Best-effort support for external filesystem renames |
| Must | Ambiguous external rename persistence | Low-confidence rename candidates are persisted to `.openknowledge/cache/<branch>/rename-ambiguities.json` | No GUI review flow in this spec |
| Must | MCP tools: `get_backlinks`, `get_forward_links` | Returns JSON list of pages with context snippets | |
| Must | MCP tools: `get_orphans`, `get_hubs` | Returns pages by link degree | |
| Must | `[[Page|alias]]` display text | Alias renders as chip label; `[[Page]]` stored in node's `target` attr, alias in `alias` attr | P0 scope confirmed |
| Must | Context snippets in backlinks panel | Show a short excerpt around the link in the source page, extracted from the parent paragraph/list context | In scope by user decision |
| Should | MCP tool: `suggest_links(page)` | Finds pages that mention target page name but don't wikilink it — deterministic, no LLM | Text-match only |
| Should | Backlink index persisted to disk | Cache written to `.openknowledge/cache/main/backlinks.json` on each update | Per-branch |
| Must | `[[Page#Heading]]` section links | Section anchor stored in node; resolved via a documented heading-anchor algorithm | P0 scope confirmed; exact anchor policy still needs resolution |
| Could | MCP tool: `get_link_graph()` | Returns full adjacency list for agent-side traversal | |
| Should | Reference definitions (Foam portability) | `[Page Name]: ./page-name.md` footer appended to files on save | P0 scope confirmed |

### Non-functional requirements

- **Performance:** Backlink extraction on `onStoreDocument` < 50ms for a 500-file KB (regex walk of PM JSON)
- **Correctness:** Markdown round-trip lossless — `[[Page|alias]]` → disk → reload → identical node
- **Startup:** Index rebuild from 500 .md files < 2s on server start
- **Consistency:** Index always reflects the last-written disk state (eventual, not real-time)

---

## 7) Success metrics

- Metric 1: Writer uses `[[` and completes a link without leaving keyboard
  - Instrumentation: Log autocomplete open + completion events
- Metric 2: Agent calls `get_backlinks` and gets meaningful results in < 200ms
  - Instrumentation: HTTP endpoint timing logs
- Metric 3: Markdown round-trip fidelity — wikilinks survive CRDT persist → disk → reload → CRDT
  - Instrumentation: Playwright test covering full cycle

---

## 8) Current state

- No wikilink node exists in TipTap. `[[Page]]` typed in editor passes through as raw text.
- No backlink index exists. No adjacency list. No graph.
- MCP tools: 8 tools exist (`read_document`, `write_document`, `edit_document`, `list_documents`, `search_documents`, `undo_agent_edit`, `redo_agent_edit`, `update_frontmatter`). No link-graph tools.
- `packages/core/src/extensions/shared.ts` defines the extension registry. JsxComponent is the closest analogue (block `atom` node with markdown round-trip via `markdownTokenName` + `parseMarkdown` + `renderMarkdown`).
- `@tiptap/markdown@3.22.3` uses `marked@17` (not remark). Custom inline token types are supported via the undocumented `markdownTokenizer` extension field, which calls `marked.use({ extensions: [...] })` internally. **CONFIRMED from source** (`/node_modules/.bun/@tiptap+markdown@3.22.3+.../dist/index.js:163-248`).
- `onStoreDocument` hook in `packages/server/src/persistence.ts:165-195` provides the correct trigger point. ProseMirror JSON is already available at this stage — walk for wikilink nodes directly without re-parsing markdown.
- `yXmlFragmentToProsemirrorJSON` from `@tiptap/y-tiptap` works server-side without DOM.

---

## 9) Proposed solution (vertical slice)

### System architecture

```mermaid
flowchart TD
    A[Writer types [[...]] in TipTap] --> B[WikiLink Node inserted]
    B --> C[TipTap renders chip NodeView]
    B --> D[onStoreDocument fired]
    D --> E[ProseMirror JSON walked]
    E --> F[BacklinkIndex.update(docName, links)]
    F --> G[in-memory Map + JSON cache]
    G --> H[Backlinks panel queries index]
    G --> I[MCP tools query index via HTTP]
    J[Server startup] --> K[Scan .md files on disk]
    K --> F
    L[File watcher external change] --> E
```

### WikiLink TipTap extension

**Location:** `packages/core/src/extensions/wiki-link.ts` (new file)

```typescript
// Schema
Node.create({
  name: 'wikiLink',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      target: { default: '' },           // Page name (human-readable)
      alias: { default: null },          // Display text override
      anchor: { default: null },         // #Heading (if [[Page#Heading]])
      resolved: { default: false },      // Resolved vs red link (runtime, not persisted)
    };
  },

  // Markdown round-trip: custom marked inline extension
  markdownTokenName: 'wikilink',
  markdownTokenizer: {
    name: 'wikilink',
    level: 'inline',
    start: '[[',
    tokenize(src) {
      const match = src.match(/^\[\[([^\]|#\[]+?)(?:#([^\]|]+?))?(?:\|([^\]]+?))?\]\]/);
      if (match) {
        return { type: 'wikilink', raw: match[0],
          target: match[1].trim(), anchor: match[2]?.trim() || null, alias: match[3]?.trim() || null };
      }
    }
  },
  parseMarkdown(token, helpers) {
    return helpers.createNode('wikiLink', {
      target: token.target, alias: token.alias || null, anchor: token.anchor || null,
    });
  },
  renderMarkdown(node) {
    const { target, alias, anchor } = node.attrs;
    let s = `[[${target}`;
    if (anchor) s += `#${anchor}`;
    if (alias) s += `|${alias}`;
    return s + ']]';
  },
})
```

**App NodeView:** `packages/app/src/editor/extensions/wiki-link.ts` — React component rendering clickable chip. Uses `resolved` attr (populated by a decoration plugin that queries the page index) to control red link styling.

**Autocomplete:** `@tiptap/suggestion` plugin, `char: '[['`, `allowSpaces: true`. `items` callback fetches `/api/pages` (list of doc names + titles), then ranks results with a fuzzy matcher. Current recommendation: add `fuzzysort` as a direct app dependency rather than rely on a transitive install. Command callback inserts `wikiLink` node with `{ target: selectedPage }`.

### Backlink index

**Location:** `packages/server/src/backlink-index.ts` (new file)

```typescript
class BacklinkIndex {
  private forward: Map<string, Set<string>> = new Map(); // source → targets
  private backward: Map<string, Set<string>> = new Map(); // target → sources

  update(source: string, newTargets: string[]): void {
    // Remove old forward links for source
    const oldTargets = this.forward.get(source) || new Set();
    for (const t of oldTargets) this.backward.get(t)?.delete(source);

    // Set new forward links
    const targetSet = new Set(newTargets);
    this.forward.set(source, targetSet);
    for (const t of newTargets) {
      if (!this.backward.has(t)) this.backward.set(t, new Set());
      this.backward.get(t)!.add(source);
    }
  }

  getBacklinks(target: string): string[] { return [...(this.backward.get(target) || [])]; }
  getForwardLinks(source: string): string[] { return [...(this.forward.get(source) || [])]; }
  getOrphans(allDocs: string[]): string[] { return allDocs.filter(d => !this.backward.get(d)?.size); }
  getHubs(n = 20): { page: string; count: number }[] {
    return [...this.backward.entries()]
      .map(([p, s]) => ({ page: p, count: s.size }))
      .sort((a, b) => b.count - a.count).slice(0, n);
  }
}
```

**Link extraction from ProseMirror JSON:** Walk `json.content` recursively, collect `{ type: 'wikiLink', attrs: { target } }` nodes.

**Context snippets:** During the same walk, when a `wikiLink` node is found, inspect its parent paragraph or list item and flatten surrounding inline text to produce a short excerpt bounded by punctuation or node edges. Store snippets alongside backlink entries.

**Reference definitions:** Generate them in a post-serialization step in persistence, not in per-node `renderMarkdown`. This allows deterministic document-global dedupe, relative-path computation, and footer regeneration.

**Persistence:** Write to `.openknowledge/cache/<branch>/backlinks.json` after each update (async, non-blocking).

### Rename reconciliation state

- Managed rename/move is the guaranteed path: app/server owns intentional page renames and rewrites inbound page and section links atomically.
- External filesystem renames are supported via watcher reconciliation, not a dedicated watcher rename event.
- Watcher implementation stores short-lived delete tombstones plus last-known document metadata (hash, title, headings, outgoing links) and pairs them against subsequent creates by confidence tiers.
- Auto-rewrite occurs only on high-confidence matches.
- Low-confidence matches do not rewrite automatically. Persist them to `.openknowledge/cache/<branch>/rename-ambiguities.json` for later review tooling.
- No GUI for ambiguity review is included in this spec.

**Startup rebuild:** On server start, read all `.md` files from disk, regex-match `\[\[([^\]|#]+)\]\]` to populate index (no TipTap runtime needed at this stage).

### onStoreDocument integration

In `packages/server/src/persistence.ts`, after `const json = yXmlFragmentToProsemirrorJSON(xmlFragment)`:

```typescript
const links = extractWikiLinks(json);  // Walk PM JSON, collect wikiLink node targets
backlinkIndex.update(documentName, links);
await backlinkIndex.saveToDisk(branch);  // async, non-blocking
```

### New HTTP endpoints

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/backlinks` | `?docName=X` | `{ backlinks: Array<{ source, snippet? }> }` |
| GET | `/api/forward-links` | `?docName=X` | `{ links: string[] }` |
| GET | `/api/orphans` | — | `{ orphans: string[] }` |
| GET | `/api/hubs` | `?n=20` | `{ hubs: Array<{ page, count }> }` |
| GET | `/api/pages` | — | `{ pages: Array<{ docName, title }> }` (autocomplete) |

### New MCP tools (packages/cli/src/mcp/tools.ts)

```typescript
// Must-have
tool('get_backlinks', 'Find all pages that link to a given page', { page: z.string() }, ...)
tool('get_forward_links', 'Find all pages that a given page links to', { page: z.string() }, ...)
tool('get_orphans', 'Find pages with no incoming links', {}, ...)
tool('get_hubs', 'Find most-referenced pages', { limit: z.number().default(20) }, ...)

// Should-have
tool('suggest_links', 'Find pages that mention target but don\'t wikilink it', { page: z.string() }, ...)
tool('get_link_graph', 'Return full adjacency list', {}, ...)
```

### Backlinks panel UI (packages/app/src/)

- Component: `BacklinksPanel` at bottom of article (below main content)
- Shows: count header + list of `{ sourceTitle, contextSnippet }`
- Queries: `/api/backlinks?docName=<current>`
- Refresh: on every `onStoreDocument` completion event (WebSocket message from server)

### Alternatives considered

**Option A: Remark-wiki-link parser** — Inapplicable. `@tiptap/markdown@3.22.3` uses `marked@17`, not remark/unified. remark-wiki-link cannot be plugged in. (Rejected: wrong stack.)

**Option B: Override `[[` as HTML pass-through** — Write `[[Page]]` into the markdown serializer as a raw HTML anchor. Avoids the marked tokenizer work. Downside: raw HTML in .md files, no structured node attrs, can't support aliases cleanly. (Rejected: loses structure.)

**Option C: Y.Map('backlinks') as collaborative index** — Store the backlink index in the Y.Doc CRDT so agents and humans both see real-time updates. Downside: significant CRDT overhead, index can be regenerated from files (it's derived), no benefit for the local-first single-player P0 use case. (Rejected for Now: Future Work Explored.)

---

## 10) Decision log

| ID | Decision | Type | 1-way door? | Status | Rationale | Evidence |
|---|---|---|---|---|---|---|
| D1 | Markdown round-trip via `markdownTokenizer` extension field in @tiptap/markdown | T | Yes | Resolved | Confirmed from source; `MarkdownManager.registerExtension()` auto-registers extension tokenizers with `marked.use({ extensions: [...] })`, making inline wiki-link tokenization viable on the current stack | `evidence/editor-integration-surface.md` |
| D2 | Backlink index storage: in-memory Map + JSON disk cache | T | No | Resolved | Simple, restart-safe (rebuild from disk), no CRDT overhead | `evidence/research-report-key-findings.md` |
| D3 | Rename resilience strategy | P/T | Yes | Resolved | Store name-based wikilinks on disk and auto-update backlinks on rename rather than surfacing broken links by default; robust external filesystem rename propagation is in P0 scope | `evidence/research-report-key-findings.md`, `evidence/editor-integration-surface.md` |
| D4 | P0 syntax scope | P | No | Resolved | P0 includes bare links, aliases, and section links | See Q2 |
| D5 | MCP tool count strategy (M2' decision) | P | No | Resolved | No capability flag; ship the visible tool surface by default and document it in logical groups/namespaces | `STORIES.md`, `evidence/editor-integration-surface.md` |
| D6 | Reference definitions (git portability layer) | P | No | Resolved | Ship Foam-style reference definitions in P0 for git/renderer portability | See Q4 |
| D7 | Red link click-to-create destination | P | No | Resolved | Click opens a confirmation dialog with suggested same-directory path and a Change option | See Q5 |
| D8 | Heading-anchor policy for `[[Page#Heading]]` | P/T | No | Resolved | Use text-derived anchors with a documented slug algorithm rather than stable per-heading IDs | See Q12 |
| D9 | Autocomplete ranking strategy | T | No | Resolved | Use fuzzy ranking via a dedicated library instead of prefix-only matching | `evidence/editor-integration-surface.md` |
| D10 | Section-link rename resilience model | P/T | No | Resolved | Text-derived anchors remain in P0, and heading renames propagate by rewriting inbound section links rather than by storing hidden stable IDs | `evidence/editor-integration-surface.md` |
| D11 | Reference definitions implementation style | T | No | Resolved | Ship pure footer definitions in P0 as the source-file portability layer, and defer any stronger preprocessing/export path for alias-fidelity polish to follow-on work | `evidence/editor-integration-surface.md` |
| D12 | Rename propagation implementation model | P/T | No | Resolved | P0 includes a first-class managed rename/move flow in app/server for intentional user actions, with watcher-side reconciliation as fallback support for external filesystem renames | `evidence/editor-integration-surface.md` |

---

## 11) Resolved questions

| ID | Question | Type | Priority | Blocking? | Plan to resolve | Status |
|---|---|---|---|---|---|---|
| Q1 | Rename resilience: stable frontmatter IDs vs name-based vs auto-update-on-rename | P/T | P0 | Yes | Design decision — options below | Resolved: name-based + auto-update |
| Q2 | P0 syntax scope: `[[Page]]` only, or also `[[Page\|alias]]` and `[[Page#Heading]]`? | P | P0 | Yes — scopes T7.3, T7.10 | Product call | Resolved: bare + alias + sections |
| Q3 | M2' MCP tool count: capability flag / 16 tools / drop 10-tool ceiling | P | P0 | Yes — scopes T7.8 | Product call (team meeting item) | Resolved: visible default surface, grouped logically |
| Q4 | Reference definitions for git portability (T7.9): P0 or Future Work? | P | P1 | No | Additive; can defer without breaking P0 | Resolved: P0 |
| Q5 | Red link click-to-create: where does the new page land? | P | P1 | No | Product preference | Resolved: confirmation dialog with editable suggested path |
| Q6 | Context snippets in backlinks panel: how extracted? | T | P1 | No | Walk PM JSON for surrounding text nodes | Resolved: extract from parent paragraph/list context during JSON walk |
| Q7 | `suggest_links` implementation: text-match or LLM? | P/T | P2 | No | Constraint: no LLM in OSS core (bet-level non-goal) | Resolved: deterministic text-match only |
| Q8 | Backlinks panel: always visible or on-demand? | P | P1 | No | UX preference | Resolved: always visible at article bottom |
| Q9 | Autocomplete page list: full title search or prefix? | T | P1 | No | Fuzzy match preferred; can start with prefix | Resolved: fuzzy matching library |
| Q10 | File watcher backlink update: re-extract inline vs wait for onStoreDocument | T | P1 | No | Investigate whether file-watcher-triggered updates need separate extraction | Resolved: explicit extraction in file-watcher path |
| Q11 | For P0 auto-update-on-rename, is the guarantee limited to managed rename flows, or must external filesystem renames also be handled robustly? | P/T | P0 | Yes | No managed rename flow exists today; external renames would require watcher-pair inference | Resolved: robust external renames are in scope |
| Q12 | What heading-anchor algorithm should `[[Page#Heading]]` use in P0? | P/T | P0 | Yes | No existing heading ID system in app/core; need explicit policy | Resolved: text-derived anchors |
| Q13 | How will P0 robust external rename propagation be implemented without a first-class rename event? | T | P0 | Yes | `@parcel/watcher` only emits `create`/`update`/`delete`; renames are `delete` + `create`, and current watcher ignores deletes entirely | Resolved: managed rename flow + watcher reconciliation fallback |
| Q14 | How do we handle duplicate headings when section links use text-derived anchors and auto-update on heading rename? | T | P1 | No | Need a deterministic ambiguity policy | Resolved: GitHub-style disambiguated slugs |
| Q15 | For P0 portability, are footer reference definitions enough if alias links render as raw `target|alias` payload in standard markdown parsers? | P/T | P0 | Yes | Local parser tests show clickability but not clean alias rendering fidelity | Resolved: footer defs now, stronger preprocessing/export later if needed |
| Q16 | Does P0 now include a first-class rename/move surface in app/server so U7.5 has an intentional path, with watcher reconciliation handling external filesystem changes as fallback? | P/T | P0 | Yes | No rename surface exists today; watcher heuristics alone are weaker than the user story implies | Resolved: yes, app/server rename flow in P0 |
| Q17 | When watcher-side external rename inference is low-confidence, what should the system do? | P/T | P0 | Yes | High-confidence matches can auto-rewrite; ambiguous matches need an explicit fallback policy | Resolved: persist ambiguity records to `.openknowledge/cache/<branch>/rename-ambiguities.json`; no automatic rewrite, no GUI in this spec |

---

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | `markdownTokenizer` field in TipTap extension auto-registers marked inline tokenizer | HIGH | Confirmed from @tiptap/markdown source (`index.js:163-248`) | — | Confirmed |
| A2 | ProseMirror JSON walk in `onStoreDocument` is fast enough (< 50ms for 500 files) | MEDIUM | Benchmark in test environment | Before scope freeze | Active |
| A3 | `@tiptap/suggestion` with `char: '[['` and `allowSpaces: true` works for multi-word page titles | HIGH | Confirmed from research report source analysis | — | Confirmed |
| A4 | Backlink index can be rebuilt from .md regex scan on startup in < 2s | MEDIUM | Benchmark 500 files | Before scope freeze | Active |
| A5 | File-watcher external changes need separate backlink extraction (skipStoreHooks: true bypasses onStoreDocument) | HIGH | Confirmed from file-watcher.ts:85 | — | Confirmed |

---

## 13) In Scope

The following items are in scope for implementation:

**Unblocked:**
- WikiLink TipTap extension (schema + markdownTokenizer + parseMarkdown + renderMarkdown) — D1 resolved
- BacklinkIndex class (in-memory dual Map, update/query/rebuild) — D2 resolved
- onStoreDocument integration (extractWikiLinks + index.update)
- HTTP endpoints: `/api/backlinks`, `/api/forward-links`, `/api/orphans`, `/api/hubs`, `/api/pages`
- MCP tools: `get_backlinks`, `get_forward_links`, `get_orphans`, `get_hubs` (count is minimum Must-have)
- Startup index rebuild from disk
- File-watcher integration
- Backlinks panel UI (always visible at bottom of article)
- Context snippet extraction during backlink indexing
- Managed rename/move flow in app/server for intentional renames
- Watcher-side external rename reconciliation with tombstones + confidence tiers
- Persistence of low-confidence ambiguity records to `.openknowledge/cache/<branch>/rename-ambiguities.json`

---

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| `markdownTokenizer` is undocumented and may change between @tiptap/markdown versions | Low | High | Pin @tiptap/markdown version; test on every upgrade; confirmed from source not docs | Tim |
| Backlink index diverges from disk on server restart without cache file | Medium | Medium | Write JSON cache on every update; rebuild from disk on startup (fallback already designed) | Tim |
| Autocomplete page list staleness (new page created by agent not in list) | Medium | Low | Cache bust: server publishes page-list-updated event; client refetches | Tim |
| Heading text changes break `[[Page#Heading]]` links if P0 uses text-derived slugs | High | Medium | Make the anchor policy explicit; if using text slugs, document breakage semantics and test them | Tim |
| Duplicate headings in one document make text-derived section links ambiguous | Medium | Medium | Use deterministic GitHub-style disambiguated slugs (`overview`, `overview-1`, `overview-2`) and test rewrite behavior | Tim |
| File-watcher external changes bypass `onStoreDocument` | Confirmed | Medium | Mitigated: add explicit extraction call in file-watcher path (A5 confirmed) | Tim |
| Robust external rename propagation is hard without a first-class rename event | High | High | `@parcel/watcher` does not expose rename intent; likely requires both a managed rename flow and a stronger watcher reconciliation strategy for external edits | Tim |
| Pure footer reference definitions do not preserve alias display text cleanly in standard markdown renderers | High | Medium | Accepted in P0; use footer defs as clickability portability layer and revisit preprocessing/export later if polished external rendering becomes important | Tim |
| Watcher-side rename inference can misclassify unrelated delete+create bursts as renames | Medium | High | Use confidence tiers and only auto-rewrite on high confidence; require an ambiguity fallback path for low-confidence matches | Tim |
| Larger visible MCP surface reduces tool-following reliability | Medium | Medium | Group tools logically in instructions/namespaces; monitor whether link-graph tools need later gating | Mike/Tim |

---

## 15) Future Work

### Explored

**Y.Map('backlinks') as collaborative CRDT index**
- What we learned: Feasible — add a new Y.Map key to the Y.Doc, update it in the same `onStoreDocument` transaction. Agents and humans would see the backlink index update in real-time via CRDT sync.
- Recommended approach: Same dual Map structure but serialized to Y.Map for collaborative broadcast.
- Why not in scope: Backlinks are derived data; CRDT sync overhead isn't justified for single-player P0. In-memory + JSON cache is sufficient.
- Triggers to revisit: Multi-player collaboration (team feature). When agents need real-time backlink updates during active editing sessions.

**Incremental backlink update (Dendron pattern)**
- What we learned: Diff old link set vs new link set per document on `onStoreDocument`. O(delta) instead of O(N) full rebuild per doc. Dendron's `DLinkUtils.isEquivalent` is the reference implementation.
- Recommended approach: Cache last-seen link set per document; diff on each update.
- Why not in scope: Full rebuild per document is O(L) where L = links in that doc — fast enough for P0.
- Triggers to revisit: Performance degradation at 1000+ file KBs.

**Disk-backed backlink store for large graphs**
- What we learned: The current P0 design keeps the active backlink graph in memory with a JSON cache on disk. That is the right complexity level for Now, but very large backlink networks will likely want a disk-backed query store rather than rebuilding everything around in-memory Maps.
- Recommended approach: Persist the derived backlink graph to disk in a structured store, likely SQLite, while keeping markdown files as the source of truth. SQLite is the leading candidate because it supports indexed graph-adjacent queries, scales beyond JSON blobs, and remains local-first and portable.
- Why not in scope: Adds schema design, migration/versioning, and a second persistence surface before P0 behavior is proven. The simpler in-memory + JSON cache path is sufficient for the current scope.
- Triggers to revisit: Imminently after this spec if we expect very large backlink networks, multi-hundred-thousand edge graphs, or startup/query latency pressure from rebuilding and querying the in-memory index.

**Reference definitions (Foam portability)**
- What we learned: Append `[Page Name]: ./page-name.md` reference definitions to files on save. Makes wikilinks valid standard markdown. Regenerable from index.
- Recommended approach: In a post-serialization persistence step, collect all wikilinks in the document, generate a deterministic definitions footer, and append it to the serialized markdown body.
- Why now in scope: explicit product decision; improves git/renderer portability for environments without our MCP server.
- Important caveat: local parser verification shows the pure Foam trick gives clickability for bare and section links but does not preserve alias display text cleanly. Accepted for P0; if full-fidelity alias rendering matters later, add a preprocessing/export layer rather than changing the source-file format.

### Identified

**Graph view visualization**
- What we know: STORIES.md flags this as S-L4 (Later). Fumadocs already has `graph-view.tsx` wired to `react-force-graph-2d`. The backlink index from S10 is the data source it needs.
- Why it matters: Visual exploration of the KB graph is a differentiator vs Obsidian (they have it as a core feature).
- What investigation needed: Integration between BacklinkIndex and fumadocs graph-view; performance with 500+ nodes.

**Page rename with link propagation**
- What we know: Requires an event (rename detected), finding all backlinks to the old name, and updating them. Foam does this via VS Code rename handler + workspace edit. In our system, the rename event is a file-watcher event.
- Why it matters: U7.5 in STORIES.md.
- What investigation needed: File rename detection in @parcel/watcher; whether it fires `delete` + `create` or a dedicated rename event; atomic link-update transaction; how to provide a robust guarantee for external renames in P0.
- Current recommendation: add a first-class managed rename/move flow for intentional user actions, and treat watcher-based delete+create reconciliation as fallback support for external filesystem changes.
- Proposed P0 fallback algorithm for external renames:
  - record delete tombstones instead of ignoring them
  - keep last-known per-document metadata in the derived index layer (hash, title, headings, outgoing links)
  - on create, pair against recent tombstones by confidence tiers
  - auto-rewrite only on high-confidence matches
  - for low-confidence matches, do not rewrite automatically; persist ambiguity records to `.openknowledge/cache/<branch>/rename-ambiguities.json`

### Noted

**`suggest_links` with semantic matching** — LLM-powered version could find conceptually related pages, not just text matches. Deferred: LLM inference is a bet-level non-goal in OSS core.

**Block-level references** (`[[Page#^blockid]]`) — Obsidian-specific. Would require stable block IDs in frontmatter per paragraph. Non-portable, high implementation cost. Not planned.

**Embed transclusion** (`![[Page]]`) — Inline embedding of one page's content into another. High implementation complexity (circular embed detection, real-time updates). Not planned for Now phase.
