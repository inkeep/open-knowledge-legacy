# STORIES.md — Now phase workstreams

**Last verified:** 2026-04-08
**Scope:** Only PROJECT.md's **Now** phase (S1, S2, S4, S5, S6, S9, S10) + the cross-cutting concerns that gate them.
**Purpose:** Bucket the Now-phase work into logical semantic workstreams so the team can assign owners. Each bucket is split into **user stories** (observable outcomes) and **technical stories** (implementation work). Items marked **[scope: Next]** or **[scope: Later]** surfaced in planning but PROJECT.md has deferred them — decide per-item whether to promote, defer, or ship a stub.

---

## Now-phase story map


| Story   | Title                                                                    |
| ------- | ------------------------------------------------------------------------ |
| **S1**  | Unified WYSIWYG editor (TipTap + y-prosemirror, void nodes, prop panels) |
| **S2**  | Source toggle (WYSIWYG ↔ CodeMirror via bidirectional observer sync)     |
| **S4**  | External agent via MCP (filesystem-compatible tools + catalog files)     |
| **S5**  | Human sees agent edits with presence (cursor, flash, diff view, undo)    |
| **S6**  | Auto-persistence + version history timeline                              |
| **S9**  | Localhost editor embeddable in agent environments                        |
| **S10** | Wiki-links + backlinks (the knowledge graph)                             |


Seven Now stories form **one delivery group** — they share the CRDT layer and ship together. Internal sequencing from the phasing rationale: S1+S4 (CRDT+MCP foundation) → S6 (persistence) → S5+S10 (presence + knowledge graph) → S2+S9 (source mode + embeddability as polish).

---

## Bucket 1 — Editor experience ++[Dima/Sarah]++

**Primary stories:** S1 (unified WYSIWYG editor), S2 (source toggle)

### User stories

- **U1.1** A knowledge worker can write markdown in rich-text mode — headings, lists, tables, code blocks, images, links — and see it render as they type
- **U1.2** A knowledge worker can insert a component (Callout, Tabs, CodeGroup, Steps, Accordion, Card, Embed) via slash command and edit its props through a visual panel
- **U1.3** A knowledge worker can insert a non-predefined JSX component and edit its raw JSX in a mini code view; the JSX string is preserved verbatim on save
- **U1.4** A developer can toggle any single component block between visual preview and code view without switching the whole file
- **U1.5** A developer can toggle the entire file between WYSIWYG and full CodeMirror source mode, and both views stay in sync as they type in either one
- **U1.6** A user can drag and drop files and images into the editor to insert them
- **U1.7** (optional Now) A user can open a live MDX preview pane alongside the editor that auto-refreshes as they edit
- **U1.8** A developer editing in source mode sees agent writes appear in real-time (agent writes via MCP propagate to source mode via observer sync) — no "file changed on disk" dialog

### Technical stories

- **T1.1** Wire TipTap + y-prosemirror to Y.XmlFragment('default') — block-level CRDT, void nodes atomic. *(Already landed via init-spike; this bucket inherits it.)*
- **T1.2** Build custom block schemas for the pre-defined component set, each backed by a React component from the project's `mdx-components.tsx`
- **T1.3** Build the component introspection pipeline: react-docgen-typescript reads the TypeScript interface → auto-generate prop controls (string→text, boolean→toggle, union→dropdown). Override file (`.openknowledge/component-meta.ts`) upgrades specific controls. React.ReactNode props become inline-editable children, not prop fields. Cache to `.openknowledge/component-cache.json` with mtime invalidation. *(See TQ31 findings — `skipChildrenPropWithoutDoc: false`, `shouldExtractLiteralValuesFromEnum: true`, not `shouldExtractValuesFromUnion`.)*
- **T1.4** Build the void-node-with-mini-CodeMirror extension for non-registered JSX. Raw string in, raw string out.
- **T1.5** Build the per-block code toggle — one component block switches to code view while the rest stays WYSIWYG
- **T1.6** Build the file-level source toggle UI on top of the observer sync already landed in PR #6 (TQ25). *(The sync is done; the polish is not.)*
- **T1.7** Build the Obsidian-parity component shim — math, mermaid, footnotes, collapsible callouts, inline tags (~3-4 days per TQ4)
- **T1.8** (optional Now) Build the side-by-side MDX preview pane — compiles MDX → React on each change
- **T1.9** Expose rendering hooks for S5 presence: agent cursor position + diff view inside the editor canvas *(data model lives in Bucket 3; this bucket only draws)*

### Scope flags

- **[scope: Next — S3]** Full file navigator sidebar (create folders, full-text search). A **minimal shell sidebar** without polished organization is part of CC3 and acceptable in Now.
- **[scope: Next — S3]** Frontmatter editing via the editor
- **[?]** "Switching between projects" — not in any Now story. Decide if it's CC3 shell or PQ12 init concern.

### Dependencies

- Upstream: None — foundational.
- Downstream: Buckets 3 (presence rendering), 7 (wikilink node), 8 (QA validates Bucket 1).

---

## Bucket 2 — Agent integration (MCP surface + _INDEX.md + .openknowledge/*) ++[Tim]++

**Primary story:** S4, plus derived work on CC6 (catalog files) and CC7 (agent DX)

### User stories

- **U2.1** An external MCP-compatible agent (Claude Code, Cursor, Codex, Cowork) can connect via standard MCP protocol and discover the KB tools without learning a new API
- **U2.2** An agent can read a file's content + enriched metadata (parsed frontmatter, backlinks, per-file info) in a single tool call
- **U2.3** An agent can write or edit a file and the change propagates to the editor in real-time via CRDT
- **U2.4** An agent can list a directory and get enriched per-file metadata, not just names
- **U2.5** An agent can orient in the KB by reading the root catalog file — no special tool required, just a filesystem read
- **U2.6** An agent can navigate into any subfolder by reading its catalog file; catalog files are recursive at every level
- **U2.7** An agent can read or update folder-level metadata (`meta.json` / `meta.yaml` / equivalent) via the same `update_frontmatter` tool it uses for file frontmatter
- **U2.8** An agent entering a KB for the first time reads `AGENTS.md` and the MCP `instructions` field and knows the navigation conventions (catalog files first, then grep, then read)
- **U2.9** (if permission model is ready) An agent's write behavior depends on its resolved permission: `editor` writes to main, `proposer` auto-creates a draft, `maintainer` overwrites — with no per-call draft parameter

### Technical stories

- **T2.1** Build the MCP server with filesystem-compatible tool signatures: `read_file`, `write_file`, `edit_file`, `list_directory`, `search_files` (XQ1, Decided)
- **T2.2** Build the knowledge-specific tools: `update_frontmatter`, `create_draft`, `apply_draft`, `discard_draft`, `get_active_context`
- **T2.3** Additive enrichment in tool responses — parsed frontmatter, backlinks, relevance scores, per-file metadata in the text content (not `structuredContent` — per TQ19, most hosts ignore it)
- **T2.4** Wire MCP writes through Hocuspocus DirectConnection to Y.Docs. *(Already validated in init-spike TQ15; this bucket inherits it.)*
- **T2.5** Build the per-folder catalog file generator: runs on Hocuspocus `onStoreDocument`, reads folder metadata + children's frontmatter + file structure, writes the catalog file deterministically. Catalog file is **write-protected** against MCP and editor writes.
- **T2.6** Resolve catalog file naming (CC6, OPEN): `llms.txt` vs `_index.md` vs `CATALOGUE.md`. Must be portable, must not collide with Fumadocs `index.md`, must support the llms.txt spec.
- **T2.7** Build folder metadata handling — MCP `update_frontmatter` detects folder paths and writes to the per-folder metadata file internally
- **T2.8** Write the MCP `instructions` field content + `AGENTS.md` template for cross-agent guidance (CC7)
- **T2.9** *(evaluation)* TQ21: is just-bash the implementation layer beneath the filesystem-compatible MCP tools, or an alternative? Prototype and decide during spec.
- **T2.10** Hook into the permission store (Bucket 5) for write-path enforcement — permission resolved → routing decided → CRDT write dispatched

### Open product decision (M2' from recent audit)

S4's "Core P0 surface: 10 tools" framing conflicts with S10 shipping 6 more link tools in the same Now phase. Options:

- **(a)** Gate S10's link namespace behind a capability flag, keep the 10-tool core surface as the default (agents who don't need the graph see 10)
- **(b)** Accept 16 tools in Now, drop the 10-tool ceiling framing
- **(c)** Drop the framing but don't add the flag — document the actual shipped surface without the ceiling claim

The "tool count is the strongest failure predictor" research argues for (a). Decide before S4 spec.

### Scope flags

- **[scope: Next — S8]** Orama-powered search bar for humans (agents get catalog + grep at P0). Consider shipping a trivial file-content search in Now as a placeholder if the bucket has capacity.

### Dependencies

- Upstream: Bucket 5 (permission model) for write-path behavior — soft dependency, MCP writes can ship with permissive defaults while the permission model is designed in parallel
- Downstream: Bucket 3 (presence uses MCP write events), Bucket 7 (link-graph tools live in this surface)

---

## Bucket 3 — Presence & coauthoring UX [Mike // Sarah and or Dima]

**Primary story:** S5, currently in-flight as PR #7 (`feat/presence-awareness-ux`)

### User stories

- **U3.1** When an agent is writing via MCP, a human in the editor sees a visible agent cursor showing where the agent is working
- **U3.2** When an agent is writing, the human sees an "AI is typing" indicator in the editor chrome
- **U3.3** A human can see in the sidebar which files an agent is currently editing across the whole project
- **U3.4** Content written by an agent renders with visible origin shading so the human can distinguish agent-written from human-written text at a glance
- **U3.5** A human can press Cmd+Z and undo only their own edits — the agent's writes are preserved (per-origin undo)
- **U3.6** A human can open an activity feed and see recent agent actions (which files, what changed, when) whether they watched the agent work live or are reviewing after the fact
- **U3.7** A human can review a section-level before/after diff for content the agent wrote or modified, both in real-time and async. NOT line-level (PQ11, Locked — fully rewritten sections as line diffs are red/green noise)
- **U3.8** A human can toggle a "follow agent" mode that scrolls the editor to wherever the agent is writing
- **U3.9** (within a draft) A human and agent can both be in the same draft branch and presence shows inside the draft context, not bleeding across branches

### Technical stories

- **T3.1** Yjs awareness protocol wired through Hocuspocus to publish cursor position + identity
- **T3.2** trackedOrigins setup for per-origin undo — `human-user-1` origin vs `agent-claude-code` origin
- **T3.3** Agent identity injection — each MCP connection carries an identity that becomes the origin tag on writes
- **T3.4** Origin shading decoration in TipTap — reads Y.Doc annotation layer, paints origin color on ranges
- **T3.5** Section-level diff extraction — given an origin and a time window, compute the before/after for each section the agent touched
- **T3.6** Activity feed backend — query Y.Doc update log or the git WIP ref log, produce an event stream
- **T3.7** Presence within draft context — when human and agent are both on a draft branch, awareness scoped to that Y.Doc namespace
- **T3.8** (coordination, not new work) Expose hooks for Bucket 1 to render T3.1, T3.4, T3.5 inside the editor canvas

### Coordination note

The data model + awareness protocol work is in PR #7. Editor-side rendering is Bucket 1 (T1.9). Keep the boundary clean: Bucket 3 defines the data, Bucket 1 paints the pixels.

### Dependencies

- Upstream: Buckets 1 and 2 both writing to the same CRDT
- Downstream: Bucket 4 (origin shading shares attribution data)

---

## Bucket 4 — Auto-persistence & version history [Miles]

**Primary story:** S6

### User stories

- **U4.1** A user never clicks Save — edits auto-persist invisibly. If the process crashes, they lose at most 10 seconds of work
- **U4.2** A user can open a version history panel and see a timeline of their KB — named checkpoints prominent, background auto-saves collapsed
- **U4.3** A user can click "Save Version," type a name and description, and create a named checkpoint — the intermediate auto-saves collapse under it
- **U4.4** A user sees visual attribution in the timeline distinguishing human vs agent edits (ties to Bucket 3 origin shading)
- **U4.5** A user can return to any named checkpoint and see the KB as it was at that point
- **U4.6** When an agent works in a draft branch, the agent's edits auto-persist to the draft's git ref, not to main
- **U4.7** When a draft is applied, the result is one clean checkpoint on main — not a noisy stream of auto-save commits
- **U4.8** A user never sees git terminology in the UI (PQ5, Locked — "Save Version" not "Commit", "Publish" not "Pull Request", "Start experiment" not "Create branch")

### Technical stories

- **T4.1** Layer 1: CRDT → filesystem debounced persistence via Hocuspocus `onStoreDocument` (2s quiet / 10s max). ✅ **Already validated** in init-spike per TQ8.
- **T4.2** Layer 2: Filesystem → git auto-commit pipeline on `afterStoreDocument` (30s idle / 60s max) using simple-git per TQ20. Writes to per-writer WIP refs. ✅ **Already validated.**
- **T4.3** Layer 3: Named checkpoint mechanism — squash-merge from WIP refs to main branch with description + annotated tag
- **T4.4** "Save Version" UI — modal/panel for name + description, triggered by user action
- **T4.5** Version history timeline panel — git log rendered with checkpoints prominent, auto-saves collapsed by default, expandable
- **T4.6** Attribution visualization in the timeline — shows origin (human vs agent, which agent) per commit/change
- **T4.7** Draft branch persistence — same pipeline writes to `refs/drafts/<name>` instead of `refs/wip/<writer>/main` when context is a draft
- **T4.8** Draft-apply = squash-merge draft branch → main as a single checkpoint
- **T4.9** Server-restart recovery test — verify content survives process restart (part of the test matrix that wasn't completed in the last spike)

### Dependencies

- Upstream: Bucket 5 (draft branches require permission context to know when to create them)
- Downstream: Bucket 3 (attribution data), Bucket 6 (git-vs-parent-project question affects what "the KB's repo" means)

### Scope open question (from meeting)

The full "Save Version" + timeline UI is the biggest remaining work in this bucket. Option to defer the timeline UI to Next and ship invisible auto-persist in Now (the pipeline is already built; the visible UI is what's missing).

---

## Bucket 5 — Permission & coauthoring model (cross-cutting) [Andre]

**This is not one of the 7 Now stories.** It is a cross-cutting concern that gates Buckets 2, 3, and 4. Driven primarily by PQ7, PQ9, CC4, TQ10, TQ14, PQ12.

### User stories

- **U5.1** A KB owner can configure some folders as "agent-writable" (agents have `editor` or `maintainer`) and others as "human-approval-required" (agents have `proposer`) without writing code
- **U5.2** When an agent writes to a folder it has `proposer` on, the product automatically creates a draft; the agent does not need to call a draft tool
- **U5.3** When an agent writes to a folder it has `editor` on, the write goes straight to the current branch alongside the human's edits (co-editing)
- **U5.4** When an agent has `maintainer` on a folder (e.g., a regenerable compiled section), the agent can overwrite the folder's contents wholesale
- **U5.5** A user reviewing a draft can see the section-level diffs, accept or reject per-article, and apply the draft as one clean checkpoint
- **U5.6** A user running `npx openknowledge init` gets sensible default permissions that work without configuration (the Day-0 trust model)
- **U5.7** A user never sees a "suggest mode" — agent writes are either direct (editor/maintainer), as a draft (proposer), or blocked (read-only). Per-word suggestions are explicitly out (PQ11, Locked)

### Technical stories

- **T5.1** Pick the permission store implementation (TQ10, currently Parked): (a) frontmatter-only, (b) `.openknowledge/permissions.yaml` config, (c) full Zanzibar (SpiceDB/OpenFGA/Permify). P0 recommendation: (a) or (b); full Zanzibar is Later.
- **T5.2** Build the permission resolution layer — given (agent identity, file path), return the effective relation (`editor` / `proposer` / `maintainer` / `reader`)
- **T5.3** Wire permission resolution into the MCP write pipeline (Bucket 2 integration point) — resolved permission determines: write-to-main, auto-draft, overwrite, or reject
- **T5.4** Draft branch creation from proposer writes — `create_draft` called internally when an agent with `proposer` calls `write_file`
- **T5.5** Draft branch CRDT isolation — Hocuspocus document naming `{branch}/{filepath}`, git worktree per draft (TQ22)
- **T5.6** PQ12 decision: what `npx openknowledge init` scaffolds as default permissions (editor-by-default for the Karpathy IC workflow, or proposer-by-default for safety)
- **T5.7** Document the conventions in `AGENTS.md` so agents without our MCP server can still understand the permission shape by reading the files

### Critical path

TQ10 decision → PQ12 decision → Bucket 2 can finalize write-path routing → Bucket 4 can finalize draft-branch persistence → Bucket 3 can finalize presence-within-draft behavior.

### Dependencies

- Upstream: None
- Downstream: Buckets 2, 3, 4, 6 all depend on this

---

## Bucket 6 — Zero-friction onboarding & cross-agent DX [Andrew / Miles]

**Primary stories:** S9 (embeddable editor) + CC5 (zero-friction onboarding) + CC7 (agent DX)

### User stories

- **U6.1** A user runs `npx openknowledge init` in a directory and gets a working KB (folder structure + `AGENTS.md` + permissions + MCP config) in under 30 seconds
- **U6.2** A user runs `npx openknowledge` (no args) in an initialized KB and the editor opens in their browser ready to edit, in under 10 seconds
- **U6.3** A user adds one line to their Claude Code / Cursor / Cowork / Codex MCP config and the agent can immediately read and write the KB
- **U6.4** When an agent starts editing KB files, the agent automatically opens the editor at `localhost:3000` for the user — via Claude Desktop preview panel, Cursor browser panel, Playwright, or the `open` / `xdg-open` command
- **U6.5** A user editing the same KB in both the web editor and Cursor/VS Code on disk sees changes flow bidirectionally, automatically (disk bridge from TQ26)
- **U6.6** A user running on macOS, Linux, or Windows has the same experience — auto-scaffold, auto-open, cross-agent skill discovery all work cross-platform
- **U6.7** An agent reading `AGENTS.md` and the MCP `instructions` field immediately knows the KB conventions (catalog files first, then grep, permission model, draft flow) without further configuration

### Technical stories

- **T6.1** Build `npx openknowledge init` — scaffolds folder structure + `AGENTS.md` + MCP config + default permissions per PQ12
- **T6.2** Build `npx openknowledge` (server start) — embedded Hocuspocus + Vite + editor UI; runs as Node distribution (TQ23)
- **T6.3** Embeddable editor — renders in standalone browser tab AND as iframe inside agent preview panels. No reliance on `window.top`, responsive to panel-sized viewports, works within sandboxed iframes
- **T6.4** Programmatic editor-open integration — MCP `instructions` field tells the agent to open `localhost:3000` via whatever browser capability is available (preview panel, browser tool, Playwright, CLI `open`)
- **T6.5** `AGENTS.md` template — portability principle (CC7): any coding agent without our MCP server can still navigate the KB via files alone
- **T6.6** Resolve TQ30 — is `.openknowledge/` the project namespace? What goes in it (permissions, config, component cache, component overrides, gitignored derived data)?
- **T6.7** Resolve `.openknowledge/config.json` — what does it contain? Is it needed at all or does `AGENTS.md` carry the conventions?
- **T6.8** Resolve the KB-git-vs-parent-project question (new from team plan, not in PROJECT.md): own repo / subdir with own `.git` / git worktree / tracked in parent. Affects `npx openknowledge init` behavior and the version history surface from Bucket 4.
- **T6.9** Resolve "starting dir" convention — `npx openknowledge init .` vs `init <path>` vs auto-detect from existing markdown files
- **T6.10** Cross-platform verification matrix — run T6.1/T6.2/T6.4 on macOS, Linux, Windows; document any quirks
- **T6.11** Reference skill distribution paths — PQ14's triple distribution (Claude Code plugin marketplace + `npx skills add` + git clone) must work cross-platform

### Dependencies

- Upstream: Bucket 5 (init scaffolds default permissions), Bucket 2 (MCP `instructions` field is the main agent-guidance channel)
- Downstream: None — this is the delivery surface

### Critical path

T5.6 (PQ12 init defaults) + T6.6 (TQ30 `.openknowledge/`) + T6.8 (git relationship) must resolve early — they're a three-way interlock.

---

## Bucket 7 — Knowledge graph (wiki-links + backlinks) [[Tim]]

**Primary story:** S10

### User stories

- **U7.1** A writer types `[[` and gets autocomplete for existing pages; selecting one inserts a wiki-link
- **U7.2** A writer can reference a page with `[[Page Name]]`, alias it with `[[Page|display text]]`, or link to a section with `[[Page#Heading]]`
- **U7.3** Wiki-links to non-existent pages render as red links; clicking a red link creates the new page (Wikipedia pattern)
- **U7.4** At the bottom of any article, a user sees a backlinks panel showing all pages that link TO this article with surrounding context snippets
- **U7.5** When a user renames or moves a page, existing wiki-links to it still resolve (page-name resolution, not path-based)
- **U7.6** An agent can ask "what links to this page?" via MCP and get back all backlinks with context
- **U7.7** An agent can ask "what pages are orphaned (no incoming links)?" and get a list — the start of the "agent as librarian" pattern
- **U7.8** An agent can ask "what pages are hubs (most linked-to)?" and get a list for orientation
- **U7.9** An agent can ask "what pages does this page link to?" and see the forward link graph
- **U7.10** An agent can suggest missing links — "article X mentions Y but doesn't link to the Y article, consider adding [[Y]]"

### Technical stories

- **T7.1** Custom TipTap `wikilink` node — atomic inline ProseMirror node, clickable pill rendering, resolved page title display. No production extension exists; build from scratch.
- **T7.2** `@tiptap/suggestion` integration — `[[` triggers the autocomplete dropdown against the page index
- **T7.3** Wiki-link parser for markdown round-trip (input + output) — integrate with the `@tiptap/markdown` pipeline from TQ3/TQ4
- **T7.4** Red link detection + click-to-create handler
- **T7.5** Dual adjacency list (forward + backward) built incrementally on `onStoreDocument`. Server-side extraction via `yDocToProsemirrorJSON()` — no editor schema needed on the server.
- **T7.6** Per-branch backlink cache (CC6) — serialized to `.openknowledge/cache/<branch>/backlinks.json`; content-addressed dedup for branch switching
- **T7.7** Backlinks panel UI — bottom of article, context snippets, click to navigate
- **T7.8** MCP link-graph tools: `get_backlinks(page)`, `get_forward_links(page)`, `get_orphans()`, `get_hubs()`, `get_link_graph()`, `suggest_links(page)`
- **T7.9** Reference definitions generation for git portability (Foam pattern) — standard markdown link ref defs emitted alongside wiki-links
- **T7.10** Section-link resolution (`[[Page#Heading]]`) — requires heading-ID stability across edits

### Overlaps with Bucket 2

T7.8 (6 link-graph MCP tools) live in Bucket 2's surface. This is the M2' 10-vs-16 tool count decision point.

### Scope flags

- **[scope: Later — S-L4]** Graph view visualization. Fumadocs already has `graph-view.tsx` wired to `react-force-graph-2d` — low marginal cost if promoted. Decide in meeting.

### Dependencies

- Upstream: Bucket 1 (editor hosts the wikilink node), Bucket 2 (MCP surface hosts the link-graph tools)
- Downstream: Bucket 8 (graph ops in the interop matrix)

---

## Bucket 8 — Interop bug bash & integration QA (validating CRDT // bidirectional stuff) [Dima // Mike]]

**This is a cross-story QA workstream, not a product story.** Validates the full disk ↔ WYSIWYG ↔ source mode ↔ MCP-agent pipeline holds under real-world usage.

### User stories (from the user's POV during the bug bash)

- **U8.1** A user typing in WYSIWYG mode sees the source mode update in real-time if they have both tabs open
- **U8.2** A user typing in source mode sees the WYSIWYG mode update in real-time if they toggle to it
- **U8.3** A user editing on disk in Cursor or VS Code sees the change appear in the web editor within 50-100ms (TQ26 disk bridge)
- **U8.4** An agent writing via MCP while a user is actively typing does not clobber the user's edits; per-origin undo separates them
- **U8.5** A user toggling between modes mid-edit does not lose any in-progress content
- **U8.6** A user disconnecting from the network (offline) continues editing; on reconnect, edits merge cleanly
- **U8.7** A user editing a 1000+ line document sees sync performance that matches small documents (no lag spike)
- **U8.8** A user's cursor position survives a large agent write in source mode — does not jump to the end of the file

### Technical stories

- **T8.1** Manual test matrix: run every cell of the CC1 cross-mode sync matrix (WYSIWYG→source, source→WYSIWYG, disk→both, agent→all three) under edit-while-edit conditions
- **T8.2** Edge cases: long docs, rapid agent writes during human typing, mode toggle mid-edit, offline+reconnect, concurrent multi-tab
- **T8.3** Cursor preservation test in source mode during agent writes (V3 step 5 from TQ15 — not yet tested in browser)
- **T8.4** Content drift detection test — diff `.md` on disk against editor content after a persistence cycle completes
- **T8.5** Server restart recovery test — verify content survives process restart (part of the test matrix T70/T75 from the prior spike)
- **T8.6** File all bugs found + PRs to close them
- **T8.7** Close any Playwright coverage gaps discovered — PR #6 shipped 24 Playwright tests, bug bash should identify what's missing

### Dependencies

- Upstream: Buckets 1, 2, 4 substantially working; Bucket 3 for the agent-write scenarios
- Downstream: None — sign-off is the deliverable

### Status

PR #6 already shipped the architecture + 24 Playwright tests under controlled conditions. This bucket is the "break it on purpose" pass.

---

## Cross-bucket coordination

### Three-party interlock: TQ30 + PQ12 + MCP `instructions` field

Buckets 2 (MCP), 5 (permissions), and 6 (onboarding) all touch:

- **TQ30** — is `.openknowledge/` the project namespace? What goes in it?
- **PQ12** — editor-by-default or proposer-by-default?
- **MCP `instructions` field** — what does an agent read on connect?

Recommend a single 30-minute sync early in Now to resolve all three together. Otherwise all three buckets block on each other.

### Bucket 1 / Bucket 3 boundary on S5

- Bucket 3 owns the data model: awareness protocol, cursor position, origin tagging, diff extraction
- Bucket 1 owns the rendering: how the cursor draws, where origin shading paints, how the diff view displays inside the editor canvas
- Keep the boundary explicit so Bucket 3 doesn't rebuild TipTap rendering and Bucket 1 doesn't invent its own presence protocol

### Bucket 5 gates Buckets 2/3/4

Permission model decisions propagate downstream:

- TQ10 (permission store) → Bucket 2 (MCP write behavior)
- PQ12 (init defaults) → Bucket 6 (scaffold content)
- CC4 (draft branches as context) → Bucket 3 (presence within drafts) + Bucket 4 (draft persistence)

---

## Scope flags

Items in the team planning doc that PROJECT.md has in Next or Later. Each needs: **promote**, **defer per PROJECT.md**, or **ship a stub**.


| Item                                         | Related bucket       | PROJECT.md phase              | Decision                                                              |
| -------------------------------------------- | -------------------- | ----------------------------- | --------------------------------------------------------------------- |
| Orama search bar for humans                  | Bucket 2             | Next (S8)                     | Ship trivial file/content search in Now, or defer?                    |
| `/ingest` **reference skill [Tim]**          | **— (not bucketed)** | **Next (PQ14 + S7)**          | **Promote S7 + PQ14 to Now? Or parallel reference-skill track?**      |
| `/consolidate` **reference skill [Tim]**     | **— (not bucketed)** | **Next (PQ14 + S7)**          | **Same as above**                                                     |
| **Externalize the "research" skill [Tim]**   | **— (not bucketed)** | **Next (PQ14)**               | **Same as above**                                                     |
| Graph view of links                          | Bucket 7             | Later (S-L4)                  | Low marginal cost (Fumadocs has it); promote?                         |
| **Full file navigator sidebar [Dima/Sarah]** | **Bucket 1**         | **Next (S3)**                 | **Minimal shell sidebar in CC3 Now, full S3 Next. Where's the line?** |
| Switching between projects                   | Bucket 1 or 6        | — (not in PROJECT.md)         | Add to CC3, CC5, or defer                                             |
| Obsidian parity in components                | Bucket 1             | S1 Now (~3-4 day gap per TQ4) | Explicit Now AC, or forward-looking goal?                             |


---

## Open questions for the team meeting

1. **Does S7 (skills alongside articles) promote from Next to Now?** Unblocks reference skill work (/ingest, /consolidate, research).
2. **M2' audit (Bucket 2):** 10 MCP tools with S10's links behind a capability flag, or 16 tools in two namespaces, or drop the framing?
3. **TQ10 permission store (Bucket 5):** frontmatter-only, config file, or full Zanzibar?
4. **PQ12 init defaults (Buckets 5, 6):** editor-by-default or proposer-by-default for new KBs?
5. **TQ30 `.openknowledge/` directory (Buckets 2, 5, 6):** confirm as project namespace, or alternative convention?
6. **KB git relationship to parent repo (Bucket 6):** own repo / subdir with own `.git` / worktree / tracked in parent?
7. **Bucket 4 timeline UI scope:** ship the full "Save Version" + timeline in Now, or ship invisible auto-persist with UI deferred to Next?
8. **Bucket 1 / Bucket 3 boundary on S5:** who draws the cursor + diff view inside the editor canvas?
9. **Obsidian parity in S1 (Bucket 1):** explicit Now AC or forward-looking goal?
10. **H3' Items table triage:** 59 rows vs 40+ anti-pattern — not blocking, but document health tracking.

---

## Traceability

- **PROJECT.md Now phase:** [PROJECT.md lines 296-418](PROJECT.md) — S1, S2, S4, S5, S6, S9, S10
- **Phasing rationale:** [PROJECT.md §Phasing rationale](PROJECT.md) — per-story heuristic assignments + barrel count check
- **Cross-cutting concerns:** [PROJECT.md §Cross-cutting concerns](PROJECT.md) — CC1..CC7
- **Items table:** [PROJECT.md §Items](PROJECT.md) — 59 rows (PQ / TQ / XQ)
- **PR #6 (merged):** bidirectional observer sync + disk bridge — TQ25, TQ26, CC1 matrix
- **PR #7 (in-flight):** `feat/presence-awareness-ux` — S5 core (cursors, flash, per-origin undo)
- **Post-merge audit findings:** [meta/_audit-project-md-post-merge.md](meta/_audit-project-md-post-merge.md) — most resolved; H3' and M2' deferred for team decision

