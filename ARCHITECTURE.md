# Open Knowledge — Architecture at a Glance

**Purpose:** 15-minute team briefing. Three paired views — product surfaces, internal architecture, competitive landscape + phasing — showing what we are, how it works, and where it grows.

**Sources:** `PROJECT.md`, specs `2026-04-07-bidirectional-observer-sync` / `2026-04-08-presence-awareness-ux` / `2026-04-08-typed-component-nodes` / `2026-04-07-agent-markdown-writes`, `init_spike/RESULTS.md`, `/reports/openknowledge-competitive-landscape/REPORT.md`, memory `worldmodel_mdx_component_pipeline.md`.

**Thesis in one line:** An agent-native knowledge substrate — **markdown-canonical, CRDT-collaborative, WYSIWYG + source, bidirectional MCP, zero LLM in the core**. No competitor ships this combination.

---

## 1 · Customer-facing surfaces & interaction patterns

**What users (and agents) touch.** Humans and agents are both first-class participants — not a human product with an "AI feature" bolted on.

```
                        ┌─────────────────────────────────────────────┐
                        │                    BROWSER                  │
                        │                                             │
  ┌──────────┐          │  ┌──────────────┐  ┌──────────────────┐    │
  │  Human   │◀────────▶│  │  WYSIWYG     │⇄│   Source mode    │    │
  │  editor  │  cursor  │  │  (TipTap)    │  │  (CodeMirror)    │    │
  │          │  presence│  │              │  │                  │    │
  │  (IC dev,│          │  │  · Rich MD   │  │  · Raw .md/.mdx  │    │
  │   CX     │          │  │  · Slash cmd │  │  · Syntax hl     │    │
  │   writer)│          │  │  · Prop panel│  │  · Collab cursor │    │
  └──────────┘          │  │    (JSX void)│  │                  │    │
                        │  │  · Inline MDX│  │                  │    │
                        │  │    children  │  │                  │    │
                        │  └──────┬───────┘  └─────────┬────────┘    │
                        │         │   Toggle button    │             │
                        │         └────────┬───────────┘             │
                        │                  │                         │
                        │     ┌────────────▼─────────────┐           │
                        │     │  Presence bar            │           │
                        │     │  [👤 Nick] [🤖 Agent]    │           │
                        │     │  Undo-Agent-Edit action  │           │
                        │     │  Region flash on writes  │           │
                        │     └──────────────────────────┘           │
                        └─────────────────────────────────────────────┘
                             ▲                          ▲
                             │ WebSocket (Yjs/Hocuspocus)│
                             │                          │
         ┌───────────────────┴──┐            ┌──────────┴──────────────┐
         │   AI agents          │            │   External editors      │
         │   (Claude Code,      │            │   (VS Code, Cursor,     │
         │    Cowork, Cursor,   │            │    vim, obsidian)       │
         │    Codex)            │            │                         │
         │                      │            │                         │
         │  · MCP tools         │            │  · Edit raw .md on disk │
         │    (read/write/edit/ │            │  · @parcel/watcher      │
         │     search/draft)    │            │    bridges to Y.Doc     │
         │  · DirectConnection  │            │                         │
         │    → batch writes    │            │                         │
         │  · Reference skills  │            │                         │
         │    (research/compile │            │                         │
         │     /ingest/lint)    │            │                         │
         └──────────────────────┘            └─────────────────────────┘
```

### Surface inventory

| # | Surface | Consumer | What it does | Status |
|---|---|---|---|---|
| S1 | **WYSIWYG editor** (TipTap + y-prosemirror) | Human writer | Rich editing of .md/.mdx — slash commands, images, lists, callouts, JSX void nodes. Obsidian-grade, not terminal-grade. | Spike validated |
| S2 | **Source toggle** (CodeMirror + y-codemirror.next) | Developer-leaning writer | Flip to raw markdown without leaving the editor. Both modes share the same Y.Doc via bidirectional observers. | Spike validated (browser verification pending) |
| S3 | **Presence & awareness UX** | Human in multi-participant session | Cursors for humans, region-flash + activity pill for agent batch writes, presence bar with human/agent identity, dedicated "Undo Agent Edit". | Specced (S5 v0) |
| S4 | **Bidirectional MCP surface** | AI agent | Read, write, edit, list, search, grep, draft. Two approaches under evaluation: semantic tools (A) vs. `just-bash` unix-command shell (B). Writes go through CRDT, not raw filesystem. | Open: XQ1 |
| S5 | **Component prop panels** (JSX void nodes) | Writer inserting MDX components | `<Callout>`, `<Tab>`, `<Accordion>`, etc. render live; prop panel auto-generated from TypeScript via react-docgen-typescript. ReactNode children become inline editing zones. | Layer 1 shipped (PR #6); Layers 2-4 specced |
| S6 | **Disk bridge** (external editors) | VS Code / Cursor / vim user | `@parcel/watcher` reconciles external saves into the Y.Doc so browser + IDE stay in sync. | Specced in observer-sync spec §3.10 |
| S7 | **Git versioning (auto-persistence)** | All users | CRDT → markdown → disk (debounced 2-10s), git WIP ref commits (30s). No "save" button; git is invisible but present. Branching = experiments / drafts. | Spike validated |
| S8 | **Reference skills** (OSS `npx skills add`) | Agent | Research, compile, ingest, lint, Q&A — shipped as Agent Skills spec (compatible with 33+ agents: Claude Code, Cursor, Codex, Copilot, Gemini, …). | Directed (PQ4) |
| S9 | **Embeddable web editor** (future) | Third-party agent environments | Same TipTap core embeddable in Cowork, Claude, Inkeep dashboards. | Architectural hook, not built |
| S10 | **Wiki-links + backlinks + index.md** | All | Derived index pipeline on `onStoreDocument`: auto-generated catalog, backlink graph. | P0 scope (TQ7) |

### Interaction patterns

| Pattern | Who initiates | Path | Frequency |
|---|---|---|---|
| Type in WYSIWYG | Human | Keystroke → ProseMirror → y-prosemirror → Y.XmlFragment → observers → Y.Text → peers | Per-char |
| Toggle to source | Human | Button → show/hide (no serialize needed once observers are live) | Rare |
| Agent writes section | Agent via MCP | DirectConnection → markdown parse → `updateYFragment` → Y.Doc → all peers see change + region flash | Batch, 1-50/session |
| External editor save | IDE user | Disk write → `@parcel/watcher` → markdown parse → Y.Doc | Per-save |
| Draft/review workflow | Agent + human | Agent writes to `draft` branch → user toggles to branch → reviews → merges | Once per proposal |
| Knowledge query | Agent | MCP `search` / `grep` / `read` → reads from live Y.Doc (not stale disk) | High |

---

## 2 · Internal architecture enabling all-directional sync

**The core trick:** one Y.Doc per file per branch holds three co-located CRDT types. Bidirectional observers keep them in sync. Every input path (WYSIWYG typing, source typing, agent batch write, external editor save) converges on the same Y.Doc. Every output path (markdown on disk, git commits, derived index, peer clients) reads from it.

```
                         ╔════════════════════════════════════════════╗
                         ║          Y.Doc  (per file, per branch)     ║
                         ║                                            ║
                         ║  ┌────────────────────┐  ┌───────────────┐ ║
                         ║  │  XmlFragment       │  │   Y.Text      │ ║
                         ║  │  'default'         │◀▶│   'source'    │ ║
                         ║  │  (rich tree)       │  │   (raw md)    │ ║
                         ║  └─────────┬──────────┘  └────────┬──────┘ ║
                         ║            │                     │        ║
                         ║            │   Observer A ─▶     │        ║
                         ║            │   XmlFragment→Text  │        ║
                         ║            │                     │        ║
                         ║            │   ◀─ Observer B     │        ║
                         ║            │   Text→XmlFragment  │        ║
                         ║            │   (parse + update-  │        ║
                         ║            │    YFragment)       │        ║
                         ║            │                     │        ║
                         ║  ┌─────────▼─────────────────────▼──────┐ ║
                         ║  │  Y.Map('activity')                   │ ║
                         ║  │  agent write attribution side-channel│ ║
                         ║  └──────────────────────────────────────┘ ║
                         ╚════════╦═══════════════════════════╦══════╝
                                  ║                           ║
          ┌───────────────────────╬───────────────────────────╬──────────────────────┐
          │                       ║                           ║                      │
          ▼                       ▼                           ▼                      ▼
 ┌────────────────┐     ┌──────────────────┐        ┌──────────────────┐    ┌─────────────────┐
 │  TipTap        │     │  CodeMirror 6    │        │  DirectConnection│    │  Hocuspocus     │
 │  (y-prosemirror│     │  (y-codemirror   │        │  (agent writes)  │    │  WS server      │
 │   binding)     │     │   .next binding) │        │                  │    │  (embedded in   │
 │                │     │                  │        │  md parse →      │    │   Vite)         │
 │  trackedOrigins│     │  trackedOrigins  │        │  updateYFragment │    │                 │
 │  →  human      │     │  →  human        │        │  →  'agent-write'│    │  Sync + aware-  │
 │     observer   │     │     observer     │        │      origin      │    │  ness protocol  │
 │     agent      │     │                  │        │                  │    │                 │
 └────────────────┘     └──────────────────┘        └──────────────────┘    └────────┬────────┘
                                                                                     │
                                   ┌─────────────────────────────────────────────────┤
                                   │                                                 │
                           onStoreDocument hook (2-10s debounce)            Peer browser tabs
                                   │
                                   ▼
                  ┌────────────────────────────────┐
                  │   Persistence pipeline         │
                  │                                │
                  │  1. MarkdownManager.serialize  │
                  │     (Y.Doc → markdown string)  │
                  │  2. Atomic file write          │
                  │     (temp + rename)            │
                  │  3. Git WIP ref commit         │
                  │     (30s debounce, isolated    │
                  │      git index)                │
                  │  4. Derived index update       │
                  │     (index.md, backlink graph) │
                  └────────────────┬───────────────┘
                                   │
                                   ▼
                  ┌────────────────────────────────┐
                  │   .md / .mdx files in git      │
                  │                                │
                  │   · Frontmatter (open schema)  │
                  │   · Raw JSX void nodes         │
                  │   · Plain markdown             │
                  │   · Branchable (git checkout)  │
                  └────────────────┬───────────────┘
                                   │
                                   ▼
                  ┌────────────────────────────────┐
                  │   @parcel/watcher (disk bridge)│
                  │   External edits → Y.Doc       │
                  └────────────────────────────────┘
```

### Layer map

| Layer | Component | Role | Decision status |
|---|---|---|---|
| **L1 Storage** | `.md` / `.mdx` files in git + frontmatter + JSX void nodes | Canonical format. Human-readable, diffable, grep-able, portable. | Locked (TQ3, TQ6) |
| **L1b Branching** | Git branches + per-branch cache | "Everything branchable" — drafts, experiments, reviews are just branches. Cache regenerable from files. | Directed (core principle) |
| **L2 CRDT state** | Y.Doc per file — `XmlFragment('default')` + `Y.Text('source')` + `Y.Map('activity')` | Shared state for all peers. Per-attribute LWW for typed component props; character-level CRDT for rich text. | Locked (TQ1) |
| **L3 Observer bridge** | Bidirectional observers: XmlFragment→Text (A), Text→XmlFragment (B). Origin guards prevent loops. | Single source of truth across modes. Toggle becomes show/hide; no serialize, no three-way merge. | Specced, in build |
| **L4 Editor bindings** | TipTap (y-prosemirror) for WYSIWYG, CodeMirror 6 (y-codemirror.next) for source. Both always mounted. | Users edit either view; changes propagate through the observer bridge automatically. | TipTap locked (TQ4); CM binding in build |
| **L5 Agent write path** | DirectConnection → `markdownParse` → `updateYFragment` with `'agent-write'` origin | Unified write path — agent writes land in the same place human writes do, via markdown. No raw XML construction. | Validated (server-side) |
| **L6 Sync transport** | Hocuspocus WebSocket server, embedded in the Vite dev plugin | Peer sync + awareness. Single transport for all clients (browser tabs, agents, disk bridge). | Validated (V2) |
| **L7 Persistence** | `onStoreDocument` hook → markdown serialize → atomic disk write → git WIP ref commit | Debounced auto-save. No save button. Git invisible but present. | Validated (V5) |
| **L8 Disk bridge** | `@parcel/watcher` → markdown parse → Y.Doc | External editors (VS Code, Cursor, vim) are just another writer. | Specced |
| **L9 Derived index** | `onStoreDocument` → index.md, backlink graph | Walkable catalog files (committed) + cached backlinks (per-branch). Search index deferred. | Directed (TQ7) |
| **L10 Component registry** | react-docgen-typescript reads `.tsx` → ComponentMeta → prop panels + slash commands + render | Layer 2 of the MDX component pipeline. Typed props → auto controls. ReactNode children → inline edit zones. | Specced (typed-component-nodes) |
| **L11 Undo / attribution** | Per-origin `UndoManager` (human, observer, agent) | User-stack stays clean; "Undo Agent Edit" targets only the agent stack. | Specced (PQ1) |
| **L12 Awareness / presence** | Yjs awareness protocol — cursors, identity, mode, agent activity | Wire exists; UX layer in current spec (S5 v0). | In build |

### Why this shape

- **Markdown is canonical, not the CRDT.** Y.Doc is derived state; `.md` files in git are the source of truth. Crash recovery = rebuild Y.Doc from disk. Migration = nothing; it's already files.
- **Single Y.Doc, dual types.** Having `XmlFragment` AND `Y.Text` in the same doc — bridged by observers — is the key architectural move. It is what makes WYSIWYG↔source↔agent↔external-editor all one cohesive editor instead of four disconnected tools with sync headaches.
- **Zero LLM in the core.** Intelligence is an external concern. Every agent (Claude Code, Cowork, Cursor, Codex) consumes the same MCP surface. The cloud product, if added, is just another consumer.
- **Everything branchable.** Git branches switch content + derived index atomically. Drafts and agent proposals are branches, not a parallel state-management system.

---

## 3 · Landscape, positioning, and now → next → later

**The structural white space (validated in `/reports/openknowledge-competitive-landscape/`):** no competitor combines markdown-canonical + real-time CRDT collaboration + bidirectional MCP agent co-creation + zero LLM compute + genuine OSS license. Incumbents can't reach it without abandoning core business-model commitments.

```
                    CANONICAL FORMAT
              (proprietary) ◀──────────────────────▶ (markdown / git)
                    ▲
                    │ NO real-time collab
                    │
      ┌─────────────┼──────────────────────────────────────────┐
      │             │                                          │
      │  ┌──────────┴──┐         ┌──────────────┐              │
      │  │  Obsidian   │         │  Mintlify    │              │
      │  │ (md files,  │         │  (MDX+git,   │              │
      │  │  21K-star   │         │  docs only,  │              │
      │  │  skills     │         │  RO MCP,     │              │
      │  │  ecosystem) │         │  bundled LLM)│              │
      │  └─────────────┘         └──────────────┘              │
      │                                                        │
      │                ▲  WHITE SPACE  ▲                       │
      │               ┌┴──────────────┐│                       │
      │               │               ││                       │
      │               │   ⭐           ││                       │
      │               │ OPEN KNOWLEDGE ││                       │
      │               │               ││                       │
      │               │ · markdown    ││                       │
      │               │   canonical   ││                       │
      │               │ · Yjs CRDT    ││                       │
      │               │ · bidir MCP   ││                       │
      │               │ · 0 LLM core  ││                       │
      │               │ · OSS core    ││                       │
      │               └───────────────┘│                       │
      │                                │                       │
      │  ┌─────────────┐   ┌───────────┴──┐   ┌─────────────┐  │
      │  │  Notion     │   │  Outline     │   │   AFFiNE    │  │
      │  │ ($600M ARR, │   │  (BSL, Y.js, │   │  (MIT, CRDT │  │
      │  │  bundled    │   │  ProseMirror │   │  binary,    │  │
      │  │  LLM, propr │   │  JSON, ~20   │   │  67K stars, │  │
      │  │  blocks)    │   │  blocks)     │   │  BlockSuite)│  │
      │  └─────────────┘   └──────────────┘   └─────────────┘  │
      │                                                        │
      │  ┌─────────────┐                      ┌─────────────┐  │
      │  │ Confluence  │                      │   Docmost   │  │
      │  │  (ADF,      │                      │   (AGPL,    │  │
      │  │  Rovo, Jira │                      │   OSS wiki) │  │
      │  │  bundled)   │                      │             │  │
      │  └─────────────┘                      └─────────────┘  │
      │                                                        │
      └────────────────────────────────────────────────────────┘
                    ▼
                 HAS real-time collab
```

### Landscape summary (compressed from the 7-competitor primary report)

| Player | Category | Canonical format | Real-time collab | MCP story | LLM in product | License | Gap vs. us |
|---|---|---|---|---|---|---|---|
| **Notion** | Enterprise KM | Proprietary blocks | Mature | RW (22 tools), agent-captive | Bundled ($10/1K credits) | Proprietary | Locked into walled garden; would have to cannibalize agent-credits revenue |
| **Confluence** | Enterprise KM | ADF (proprietary JSON) | Mature (Live Docs) | RW (11 tools) | Rovo bundled | Proprietary | ADF lock-in; Jira bundle coupling; DC→Cloud forced migration window |
| **Obsidian** | Dev-native KM | Markdown files | **None** (6-year FR, 2.2K votes, philosophical NO) | Community (12+) | **None** | Proprietary (free) | No collab, no co-creation primitives. `obsidian-skills` (21K ⭐) covers format literacy but not draft/review/presence. |
| **Mintlify** | Dev docs | MDX in git | None (git branches) | **Read-only** (2 tools) | Bundled (Claude Sonnet 4.5) | Proprietary | Read-only MCP; docs-only; closed |
| **Outline** | OSS wiki | ProseMirror JSON | Mature (Y.js, 5+ yrs) | RW | Bundled (OpenAI) | BSL 1.1 | ProseMirror JSON (not markdown); no extensibility; one-person core team |
| **AFFiNE** | OSS knowledge | CRDT binary (Yjs) | Maturing | Community (76 tools) | Multi-model (BYOK) | MIT | Binary format (not markdown); no agent-native primitives; no funding since '23 |
| **Chroma** | Retrieval infra | Embedding vectors | None | RW (12 tools) | Context-1 (20B) | Apache 2.0 | Different category — retrieval, not KM |
| **Docmost, GitBook, Guru, AnyType, Semiont** | Secondary | Mixed | Mixed | Mixed | Mixed | Mixed | Various — Semiont is the only conceptual match, alpha-stage |

**The five things no one ships together:**
1. Markdown as canonical format **with** rich collaborative editing
2. Git-native branching / PR / structural diff for content
3. Bidirectional MCP with agent identity, attribution, draft/review workflows
4. Zero LLM compute in the knowledge layer
5. True OSS core (MIT/Apache) with cloud monetization path

### Now → Next → Later phasing

```
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│      NOW  (P0)   │───▶│      NEXT        │───▶│      LATER       │
│   single-player  │    │   multiplayer    │    │  cloud / ENT     │
│      local       │    │      team        │    │                  │
└──────────────────┘    └──────────────────┘    └──────────────────┘
   IC developer           CX / support          CX / support orgs
   + Claude Code          writing teams         + enterprise
   + Cowork / Cursor      + their agents        + inkeep distribution

   "Obsidian, but          "Confluence, but       "Your team's
    agent-native"           collaborative          knowledge substrate
                            WITH your agents"      for every AI agent
                                                   (yours or ours)"
```

| Phase | Audience | Scope | Shipping surfaces | Status |
|---|---|---|---|---|
| **NOW — Local IC (P0)** | Solo dev / knowledge worker running Claude Code or Cowork locally | Obsidian-grade editor · bidirectional source↔WYSIWYG · JSX void nodes · Yjs CRDT foundation · local Hocuspocus · MCP tools · git auto-persistence · presence (human+agent) · disk bridge · reference skills as OSS | S1, S2, S3, S4, S5 (L1), S6, S7, S8 | Init spike validated 6/7; presence + observer-sync specs in build |
| **NEXT — Team multiplayer** | Small writing/support teams co-editing with their agents | Multi-human CRDT · hosted Hocuspocus w/ auth · draft / review / merge workflows · publishing engine (to Fumadocs / llms.txt / help-center renderers) · web-embeddable editor · typed component registry (L2/L3) | Extensions to S1–S3, new S9 | Specced as PQ9, PQ13; no ship date |
| **LATER — Cloud / Enterprise / CX** | CX/support orgs via Inkeep distribution; mid-market + enterprise; selling to heads-of-support/CX | Hosted SaaS · SSO / audit log · optional hosted AI orchestration (as a consumer of the same MCP, not privileged) · CX-shaped skills (runbooks, escalation templates, tone check, policy linter) · Confluence/Notion/Mintlify replacement path · publishing to Zendesk/help-center surfaces · agent-authored KB entries with human review | Cloud layer · new skill packs · consumer surfaces | NOT NOW (bet-level) — path kept clear but explicitly out of P0 |

### Why this order (grow-up rationale)

| Move | Why now (not later) | Why not now (held for later) |
|---|---|---|
| Markdown + git + CRDT foundation first | Validates the hardest, most novel architectural bet (no competitor has proven it); everything else depends on it. | — |
| Single-player before team | Team features without a great single-player experience = another Confluence. Obsidian's lesson. | Team CRDT + auth + presence need a proven core first. |
| OSS + reference skills before SaaS | Developers adopt → teams inherit → enterprise pays. The playbook for Hashi/Gitlab/Supabase. | Premature SaaS forks attention from the substrate. |
| Inkeep / CX as a LATER distribution channel | Inkeep has CX customers whose knowledge workflows map directly onto our substrate (runbooks, SOPs, help-center articles, agent-editable drafts). | `NOT UNLESS Inkeep needs it`: we refuse to let CX-specific features constrain the general-purpose product. The product serves CX by being excellent, not by being CX-shaped. |
| Confluence / Notion / Mintlify replacement LATER | That's the $ prize, but requires team collab, permissions, publishing, enterprise auth. | Competing on feature-parity with $600M-ARR incumbents today is suicide; competing on architectural white space is defensible. |

---

## Open questions for the team

1. **XQ1 — MCP interface shape:** 6-7 semantic tools (read/write/edit/search/draft) or 1-2 `just-bash`-backed tools with unix commands the agent already knows? Evidence from Dust.tt and agent-performance research leans B; ergonomics lean A.
2. **TQ5 — License:** AGPL (Docmost/Wiki.js model, blocks SaaS forks) vs. MIT + proprietary cloud (AFFiNE model). Trigger: before public repo creation.
3. **CX distribution timing:** when does the Inkeep path open — after Next phase lands, or opportunistically sooner via custom reference skills?
4. **Presence for agents without faking cursors:** we've committed to region-flash + activity pill (not fake typing). Does the demo sell it? S5 v0 is built to find out.
5. **Layer 2/3 of the component pipeline:** react-docgen-typescript at project load is ~10-15s for 75 components — acceptable for dev, what about a 500-component docs repo? TypeScript 7 (tsgo, mid-2026) may break the Compiler API.

---

## Meta

- **Confidence:** HIGH on product surfaces + internal architecture (grounded in specs, init-spike validation, and memory). HIGH on landscape (sourced directly from the competitive-landscape report). MEDIUM on phasing — the NOW phase is code-grounded; NEXT is specced but unshipped; LATER is strategic direction, not a plan.
- **Channels tapped:** local code (specs, init_spike, PROJECT.md), reports (`/reports/openknowledge-competitive-landscape/`), memory (worldmodel_mdx_component_pipeline), skill-ecosystem context from the same report. Web channel intentionally skipped — reports dir has enough.
- **Channels not tapped:** full PROJECT.md items table beyond PQ1–PQ9 area (124KB file, read surface); ~50 related reports in `/reports/` flagged by PROJECT.md references but not deep-read.
- **UNRESOLVED:** exact shape of the publishing-engine surface (LATER phase); whether CX skill packs live in this repo or Inkeep's.
- **ADJACENT (not chased):** agent-memory layer (Mem0, Zep, Letta) — distinct category from authored knowledge, boundary may blur (XQ3).
