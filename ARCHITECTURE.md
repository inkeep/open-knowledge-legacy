# Open Knowledge — Architecture at a Glance

**Purpose:** 15-minute team briefing. Reads top-to-bottom: **why this exists** (problem, user stories, landscape, phasing) → **what customers touch** (product surfaces) → **how it works** (internal architecture).

**Sources:** `PROJECT.md`, specs `2026-04-07-bidirectional-observer-s`



## Pasted Heading

**Bold** and *italic*

- Item 1
- Item 2

`ync` / `2026-04-08-presence-awareness-ux` / `2026-04-08-typed-component-nodes` / `2026-04-07-agent-markdown-writes`, `init_spike/RESULTS.md`, `/reports/openknowledge-competitive-landscape/REPORT.md`, memory `worldmodel_mdx_component_pipeline.md`.

**Thesis in one line:** An agent-native knowledge substrate — **markdown-canonical, CRDT-collaborative, WYSIWYG + source, bidirectional MCP, zero LLM in the core**. No competitor ships this combination, because each category was built for a different problem.

---

## 1 · Why this exists — the gap and the stories that prove it

### The problem

AI agents are becoming the primary interface to code, docs, and knowledge work. Every agent's usefulness is bounded by what it can *read and write*. But every knowledge tool on the market was built for a different era, a different audience, and a different problem:

- **Personal KM** tools (Obsidian) nailed markdown file ownership and a polished raw-source editor with inline rendering, but deliberately stopped short of a true block-based WYSIWYG and are philosophically single-player — agents become silent file-mutators with no presence or attribution.
- **Team workspaces** (Notion, Confluence) nailed real-time collaboration, but lock content into proprietary formats with rate-limited APIs and bundle their own walled-garden LLMs.
- **Developer docs platforms** (Mintlify) nailed markdown-in-git publishing, but are read-only for agents, docs-only for scope, and have no live editing.
- **Help center / support KB** tools (Zendesk, Guru) nailed CX workflows, but are hostile to developer workflows and trap content in one publishing surface.

None of them was designed to let a **human and an agent author the same document, on the same screen, at the same time**, with attribution, review, and undo — which is exactly the job a CX/support/docs team does every day. The knowledge layer has become the bottleneck for every AI agent story, and the tools that manage it are structurally incapable of reaching the goal without abandoning their business models.

### Six stories nobody can tell today

Each one is blocked by a different category's structural limitation. Each one is a thing we enable.

| #      | Story (in the user's voice)                                                                                                                                                                                                                                                                                                | Blocked today by                                                                                                                                                                                                                                                                                                                                              | What we give them                                                                                                                                                                                                                                                                |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **U1** | **"Co-write with an agent, live and visibly."** I can *see* my agent working. It doesn't magic text into my doc — I see it land, see who wrote it, and can undo just its edits without touching mine.                                                                                                                      | Obsidian has silent agent writes (LWW, no presence). Notion's agents run inside a walled garden with no attribution. Nobody has presence + per-origin undo for human+AI.                                                                                                                                                                                      | Yjs awareness + `Y.Map('activity')` side-channel + per-origin `UndoManager` + region-flash UX. → §2 S3, §3 L11/L12                                                                                                                                                               |
| **U2** | **"My knowledge is files I own."** My docs are plain markdown in my git repo. I can grep them, diff them, fork them, ship them through the same pipeline as my code. Nobody can ransom my content.                                                                                                                         | Notion (proprietary blocks, lossy export), Confluence (ADF), Outline (ProseMirror JSON), AFFiNE (CRDT binary) — all opaque.                                                                                                                                                                                                                                   | Markdown-canonical storage; Y.Doc is derived state. → §3 L1                                                                                                                                                                                                                      |
| **U3** | **"WYSIWYG and source are the same document — live."** I flip to raw markdown to fix an escaped character, then flip back — same cursor, same state, and agent edits that landed while I was in source mode are still there. My teammate can be in WYSIWYG while I'm in source and we see each other's edits in real time. | **Notion / Confluence:** WYSIWYG only, no raw source mode at all. **Obsidian:** raw source + Live Preview (inline-render hybrid), but **no true block-based WYSIWYG** — no slash commands, no component prop panels, no draggable blocks — and single-player either way. **Mintlify:** no WYSIWYG at all. Nobody bridges the two as live collaborative views. | True block-based WYSIWYG (TipTap, slash commands, JSX void nodes with prop panels) **and** collaborative raw source (CodeMirror + y-codemirror.next), bridged by a bidirectional observer between `Y.XmlFragment('default')` and `Y.Text('source')` inside one Y.Doc. → §3 L3/L4 |
| **U4** | **"Agents propose, humans review."** My agent writes to a draft branch. I see the diff. I accept or reject — same muscle memory as reviewing a PR, but for content.                                                                                                                                                        | No WYSIWYG competitor has content branching + review for agent-generated changes. Mintlify has git branching but no live editing; Notion/Confluence have linear version history only.                                                                                                                                                                         | Git branches + permission-based routing (proposer → draft, editor → main). "Everything branchable" principle. → PROJECT.md CC6/PQ7/PQ9                                                                                                                                           |
| **U5** | **"One substrate, many publishing surfaces."** The same markdown renders as a help center article, a docs site page, agent MCP context, and a Zendesk KB entry. Edit once; users, agents, and customers see one truth.                                                                                                     | Every publishing tool owns one surface (Zendesk = help center only, Mintlify = docs site only, Confluence = wiki only). Content forks, drifts, rots.                                                                                                                                                                                                          | Markdown + frontmatter + fumadocs-compatible components → any renderer. Architectural hook today; publishing engine is LATER phase. → §2 S9/S10                                                                                                                                  |
| **U6** | **"Write from anywhere — browser, IDE, or agent."** I edit in Cursor while a teammate edits in the browser while an agent edits via MCP. No conflicts. No "someone else saved this file" dialogs.                                                                                                                          | Nobody. This is the full all-directional-sync story — every tool offers at most two of the three inputs.                                                                                                                                                                                                                                                      | Disk bridge + WebSocket + MCP DirectConnection, all converging on one Y.Doc via observers. → §3 main diagram                                                                                                                                                                     |

**Who these stories are for.** A solo developer with Claude Code (NOW). A small CX/support team co-writing runbooks with their agents (NEXT). An enterprise CX org using the same substrate to power their help center, their agent context, and their internal knowledge base (LATER). The stories don't change as we grow up — the audience and the scale do.

### Competitive landscape — by category

Every category has done something right and something structurally wrong. The gap isn't "feature X is missing" — it's that no category was *designed* for the combination.

| Category                                        | Representative(s)                                                                  | Does well                                                                                                                                                                                                                                                                                                                             | Falls short                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | What we do differently                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Personal KM / "second brain"**                | Obsidian (1.5M users, 21K-⭐ `obsidian-skills` agent ecosystem)                     | Markdown-canonical files users own. Best-in-class **raw-source editor** with three modes: Source (pure markdown), Live Preview (inline rendering around the cursor), Reading view. 2.7K plugins. Deep agent *format literacy* via `obsidian-skills` — teaches 33+ agents to read/write Obsidian formats. Zero LLM compute in product. | **No true block-based WYSIWYG.** Live Preview is "raw source with inline rendering when the cursor leaves the line" — not a structured editor. No slash commands, no MDX component prop panels, no draggable blocks. **Closed source** (free ≠ OSS — can't fork, can't self-modify, 18-person bootstrapped team with no OSS path). **Philosophically single-player** (6-year-old FR, 2.2K votes, deliberately unanswered). Silent agent writes (LWW, no presence, no attribution). Desktop-only, no web/embed story. `obsidian-skills` is format literacy, not co-creation. | Keep the file ownership + agent format literacy. Add **a true block-based WYSIWYG** (TipTap, slash commands, MDX component prop panels) co-existing with a collaborative raw-source mode — both live-bridged CRDT views. Plus multiplayer, agent-as-visible-peer, draft/review primitives, and an embeddable web editor. |
| **Team workspace / cloud wiki**                 | Notion ($600M ARR, 100M+ users), Confluence (300K+ customers)                      | Mature real-time co-editing (Notion OT, Confluence Live Docs). Rich block types (50+ in Notion). Enterprise features (SSO, audit, fine-grained permissions). Deep distribution.                                                                                                                                                       | **Proprietary canonical format** (Notion blocks, ADF) → lossy export, rate-limited APIs (Notion: 3 req/s, 2,000 chars/block, 2-level nesting), agent-*captive* with bundled LLM compute ($10/1K agent credits). No draft/review for agent content. No content branching. Changing this would break the business model.                                                                                                                                                                                                                                                      | Markdown-canonical + true CRDT collab + bring-your-own-agent + git-native branching = no lock-in, agent as peer (not walled-garden captive).                                                                                                                                                                             |
| **Developer docs platform**                     | Mintlify (10K+ companies, $21M Series A)                                           | MDX in git (human-readable, portable). Native git branching for content. Great publishing UX. Auto-generated MCP + `llms.txt` on every site — 40%+ of readership now from AI systems.                                                                                                                                                 | **Read-only MCP** (2 tools: search + get-page). No WYSIWYG. No real-time collaboration. Bundled LLM (Claude Sonnet 4.5). Docs-only product surface. Closed source. Pricing cliff ($0 → $250/mo).                                                                                                                                                                                                                                                                                                                                                                            | Same substrate goals (markdown + git) + writable MCP + WYSIWYG/source both-ways + real-time collab. Same markdown can publish to docs, help center, and agent context.                                                                                                                                                   |
| **Help center / support KB**                    | Zendesk (help center market leader), Guru ($25/user/mo, enterprise KM + agent Q&A) | Deep CX workflows. Ticket integration (Zendesk). Published help center rendering with branded themes. Enterprise "AI assistants" for customer-facing Q&A.                                                                                                                                                                             | **Proprietary formats** (no git, no markdown, no file ownership). Hostile to developer and agent authoring workflows (API-first authoring is an afterthought). Agent Q&A = retrieval over walls the vendor built; no agent *write* story. Content locked to one publishing surface. Expensive seat-based pricing.                                                                                                                                                                                                                                                           | One substrate → help center + docs site + agent MCP context + internal wiki. CX writers and agents author *together* in the same editor. The same markdown publishes to Zendesk via the publishing engine (LATER).                                                                                                       |
| **Retrieval infra / agent memory** *(adjacent)* | Chroma (Apache-2.0, 27K ⭐), Mem0/Zep/Letta                                         | Purpose-built for machine access. Great agent ergonomics. Open source.                                                                                                                                                                                                                                                                | Not human-authorable. No UI. Not a knowledge *platform* — an infrastructure layer. Content isn't human-readable in situ.                                                                                                                                                                                                                                                                                                                                                                                                                                                    | **Complementary, not competitive.** We are the human-authoring layer; these are the machine-memory layer. An agent that uses our MCP for authored knowledge and Mem0 for experiential memory is the right shape.                                                                                                         |

### Where everyone lives on one chart

The two axes that matter most for our bet: **canonical format** (open vs. proprietary) × **real-time collaboration** (yes vs. no). The white space is empty because no existing category has an incentive to reach it.

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
      │  │ (personal   │         │  (dev docs,  │              │
      │  │  KM, single │         │  RO MCP,     │              │
      │  │  player)    │         │  no WYSIWYG) │              │
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
      │  ┌─────────────┐  ┌─────────┐  │  ┌────────────────┐   │
      │  │ Notion /    │  │ Zendesk │  │  │   Outline /    │   │
      │  │ Confluence  │  │ / Guru  │  │  │    AFFiNE      │   │
      │  │ (cloud team │  │ (help   │  │  │ (OSS, but PM-  │   │
      │  │  wiki, propr│  │  center,│  │  │  JSON / CRDT   │   │
      │  │  blocks)    │  │  propr) │  │  │  binary)       │   │
      │  └─────────────┘  └─────────┘  │  └────────────────┘   │
      │                                │                       │
      └────────────────────────────────┼───────────────────────┘
                                       ▼
                                HAS real-time collab
```

### The five things no category ships together

Not five missing features — five structural combinations that each incumbent's business model prevents them from reaching.

1. **Markdown as canonical format WITH rich collaborative editing.** Every collab tool stores in proprietary format; every markdown tool is single-player.
2. **Git-native branching + PR-style review for content.** Only Mintlify has git branches, and Mintlify has no live editing or review UX.
3. **Bidirectional MCP with agent identity, attribution, and draft/review primitives.** Every MCP server is either read-only (Mintlify) or CRUD-without-co-creation (Notion, Confluence, Outline, AFFiNE).
4. **Zero LLM compute in the knowledge layer.** Every AI-enabled competitor bundles LLM compute and monetizes it. Only Obsidian ships zero, and Obsidian doesn't ship collab.
5. **True OSS core with a cloud grow-up path.** Only AFFiNE (MIT) and Chroma (Apache-2.0) are genuinely OSS — and AFFiNE has the wrong format, Chroma is the wrong category. Even Obsidian, the closest to our "files you own" story, is **closed source** (free, but proprietary).

### Now → Next → Later phasing

```
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│      NOW  (P0)   │───▶│      NEXT        │───▶│      LATER       │
│   single-player  │    │   multiplayer    │    │  cloud / ENT     │
│      local       │    │      team        │    │                  │
└──────────────────┘    └──────────────────┘    └──────────────────┘
   IC developer           CX / support          CX / support orgs
   + Claude Code          writing teams         + enterprise
   + Cowork / Cursor      + their agents        + Inkeep distribution

   "Obsidian, but          "Confluence, but       "Your team's
    agent-native"           collaborative          knowledge substrate
                            WITH your agents"      for every AI agent
                                                   (yours or ours)"
```

| Phase                               | Audience                                                                                         | Scope                                                                                                                                                                                                                                                                                                                                    | Shipping surfaces                                 | Status                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------- |
| **NOW — Local IC (P0)**             | Solo dev / knowledge worker running Claude Code or Cowork locally                                | Obsidian-grade editor · bidirectional source↔WYSIWYG · JSX void nodes · Yjs CRDT foundation · local Hocuspocus · MCP tools · git auto-persistence · presence (human+agent) · disk bridge · reference skills as OSS                                                                                                                       | S1, S2, S3, S4, S5 (L1), S6, S7, S8               | Init spike validated 6/7; presence + observer-sync specs in build |
| **NEXT — Team multiplayer**         | Small writing/support teams co-editing with their agents                                         | Multi-human CRDT · hosted Hocuspocus w/ auth · draft / review / merge workflows · publishing engine (to Fumadocs / llms.txt / help-center renderers) · web-embeddable editor · typed component registry (L2/L3)                                                                                                                          | Extensions to S1–S3, new S9                       | Specced as PQ9, PQ13; no ship date                                |
| **LATER — Cloud / Enterprise / CX** | CX/support orgs via Inkeep distribution; mid-market + enterprise; selling to heads-of-support/CX | Hosted SaaS · SSO / audit log · optional hosted AI orchestration (as a consumer of the same MCP, not privileged) · CX-shaped skills (runbooks, escalation templates, tone check, policy linter) · Confluence/Notion/Mintlify replacement path · publishing to Zendesk/help-center surfaces · agent-authored KB entries with human review | Cloud layer · new skill packs · consumer surfaces | NOT NOW (bet-level) — path kept clear but explicitly out of P0    |

**Why this order (grow-up rationale):**

| Move                                                       | Why now (not later)                                                                                                                              | Why not now (held for later)                                                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Markdown + git + CRDT foundation first                     | Validates the hardest, most novel architectural bet (no competitor has proven it); everything else depends on it.                                | —                                                                                                                       |
| Single-player before team                                  | Team features without a great single-player experience = another Confluence. Obsidian's lesson.                                                  | Team CRDT + auth + presence need a proven core first.                                                                   |
| OSS + reference skills before SaaS                         | Developers adopt → teams inherit → enterprise pays. Hashi/Gitlab/Supabase playbook.                                                              | Premature SaaS forks attention from the substrate.                                                                      |
| Inkeep / CX as LATER distribution                          | Inkeep has CX customers whose knowledge workflows map directly onto our substrate (runbooks, SOPs, help-center articles, agent-editable drafts). | `NOT UNLESS Inkeep needs it`: the product serves CX by being excellent, not CX-shaped.                                  |
| Confluence / Notion / Mintlify / Zendesk replacement LATER | That's the $ prize, but requires team collab, permissions, publishing, enterprise auth.                                                          | Competing on feature-parity with $600M-ARR incumbents is suicide; competing on architectural white space is defensible. |

---

## 2 · Customer-facing surfaces & interaction patterns

**What users (and agents) touch** — the surfaces that deliver the six user stories from §1. Humans and agents are both first-class participants — not a human product with an "AI feature" bolted on.

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

| #   | Surface                                            | Consumer                           | What it does                                                                                                                                                                          | Delivers story | Status                                         |
| --- | -------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------- |
| S1  | **WYSIWYG editor** (TipTap + y-prosemirror)        | Human writer                       | Rich editing of .md/.mdx — slash commands, images, lists, callouts, JSX void nodes. Obsidian-grade, not terminal-grade.                                                               | U3             | Spike validated                                |
| S2  | **Source toggle** (CodeMirror + y-codemirror.next) | Developer-leaning writer           | Flip to raw markdown without leaving the editor. Both modes share the same Y.Doc via bidirectional observers.                                                                         | U3             | Spike validated (browser verification pending) |
| S3  | **Presence & awareness UX**                        | Human in multi-participant session | Cursors for humans, region-flash + activity pill for agent batch writes, presence bar with human/agent identity, dedicated "Undo Agent Edit".                                         | U1             | **Shipped (PR #7)**                            |
| S4  | **Bidirectional MCP surface**                      | AI agent                           | Read, write, edit, list, search, grep, draft. Two approaches under evaluation: semantic tools (A) vs. `just-bash` unix-command shell (B). Writes go through CRDT, not raw filesystem. | U1, U4, U6     | Open: XQ1                                      |
| S5  | **Component prop panels** (JSX void nodes)         | Writer inserting MDX components    | `<Callout>`, `<Tab>`, `<Accordion>`, etc. render live; prop panel auto-generated from TypeScript via react-docgen-typescript. ReactNode children become inline editing zones.         | U3, U5         | Layer 1 shipped (PR #6); Layers 2-4 specced    |
| S6  | **Disk bridge** (external editors)                 | VS Code / Cursor / vim user        | `@parcel/watcher` reconciles external saves into the Y.Doc so browser + IDE stay in sync.                                                                                             | U6             | Specced in observer-sync spec §3.10            |
| S7  | **Git versioning (auto-persistence)**              | All users                          | CRDT → markdown → disk (debounced 2-10s), git WIP ref commits (30s). No "save" button; git is invisible but present. Branching = experiments / drafts.                                | U2, U4         | Spike validated                                |
| S8  | **Reference skills** (OSS `npx skills add`)        | Agent                              | Research, compile, ingest, lint, Q&A — shipped as Agent Skills spec (compatible with 33+ agents: Claude Code, Cursor, Codex, Copilot, Gemini, …).                                     | U1, U4         | Directed (PQ4)                                 |
| S9  | **Embeddable web editor** *(future)*               | Third-party agent environments     | Same TipTap core embeddable in Cowork, Claude, Inkeep dashboards.                                                                                                                     | U5             | Architectural hook, not built                  |
| S10 | **Wiki-links + backlinks + index.md**              | All                                | Derived index pipeline on `onStoreDocument`: auto-generated catalog, backlink graph.                                                                                                  | U2, U5         | P0 scope (TQ7)                                 |

### Interaction patterns

| Pattern               | Who initiates | Path                                                                                                | Frequency           |
| --------------------- | ------------- | --------------------------------------------------------------------------------------------------- | ------------------- |
| Type in WYSIWYG       | Human         | Keystroke → ProseMirror → y-prosemirror → Y.XmlFragment → observers → Y.Text → peers                | Per-char            |
| Toggle to source      | Human         | Button → show/hide (no serialize needed once observers are live)                                    | Rare                |
| Agent writes section  | Agent via MCP | DirectConnection → markdown parse → `updateYFragment` → Y.Doc → all peers see change + region flash | Batch, 1-50/session |
| External editor save  | IDE user      | Disk write → `@parcel/watcher` → markdown parse → Y.Doc                                             | Per-save            |
| Draft/review workflow | Agent + human | Agent writes to `draft` branch → user toggles to branch → reviews → merges                          | Once per proposal   |
| Knowledge query       | Agent         | MCP `search` / `grep` / `read` → reads from live Y.Doc (not stale disk)                             | High                |

---

## 3 · Internal architecture enabling all-directional sync

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

| Layer                        | Component                                                                                             | Role                                                                                                             | Decision status                          |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **L1 Storage**               | `.md` / `.mdx` files in git + frontmatter + JSX void nodes                                            | Canonical format. Human-readable, diffable, grep-able, portable.                                                 | Locked (TQ3, TQ6)                        |
| **L1b Branching**            | Git branches + per-branch cache                                                                       | "Everything branchable" — drafts, experiments, reviews are just branches. Cache regenerable from files.          | Directed (core principle)                |
| **L2 CRDT state**            | Y.Doc per file — `XmlFragment('default')` + `Y.Text('source')` + `Y.Map('activity')`                  | Shared state for all peers. Per-attribute LWW for typed component props; character-level CRDT for rich text.     | Locked (TQ1)                             |
| **L3 Observer bridge**       | Bidirectional observers: XmlFragment→Text (A), Text→XmlFragment (B). Origin guards prevent loops.     | Single source of truth across modes. Toggle becomes show/hide; no serialize, no three-way merge.                 | Specced, in build                        |
| **L4 Editor bindings**       | TipTap (y-prosemirror) for WYSIWYG, CodeMirror 6 (y-codemirror.next) for source. Both always mounted. | Users edit either view; changes propagate through the observer bridge automatically.                             | TipTap locked (TQ4); CM binding in build |
| **L5 Agent write path**      | DirectConnection → `markdownParse` → `updateYFragment` with `'agent-write'` origin                    | Unified write path — agent writes land in the same place human writes do, via markdown. No raw XML construction. | Validated (server-side)                  |
| **L6 Sync transport**        | Hocuspocus WebSocket server, embedded in the Vite dev plugin                                          | Peer sync + awareness. Single transport for all clients (browser tabs, agents, disk bridge).                     | Validated (V2)                           |
| **L7 Persistence**           | `onStoreDocument` hook → markdown serialize → atomic disk write → git WIP ref commit                  | Debounced auto-save. No save button. Git invisible but present.                                                  | Validated (V5)                           |
| **L8 Disk bridge**           | `@parcel/watcher` → markdown parse → Y.Doc                                                            | External editors (VS Code, Cursor, vim) are just another writer.                                                 | Specced                                  |
| **L9 Derived index**         | `onStoreDocument` → index.md, backlink graph                                                          | Walkable catalog files (committed) + cached backlinks (per-branch). Search index deferred.                       | Directed (TQ7)                           |
| **L10 Component registry**   | react-docgen-typescript reads `.tsx` → ComponentMeta → prop panels + slash commands + render          | Layer 2 of the MDX component pipeline. Typed props → auto controls. ReactNode children → inline edit zones.      | Specced (typed-component-nodes)          |
| **L11 Undo / attribution**   | Per-origin `UndoManager` (human, observer, agent)                                                     | User-stack stays clean; "Undo Agent Edit" targets only the agent stack.                                          | **Shipped (PR #7)**                      |
| **L12 Awareness / presence** | Yjs awareness protocol — cursors, identity, mode, agent activity                                      | Cursors for humans, region-flash + activity pill for agent batch writes, presence bar.                           | **Shipped (PR #7)**                      |

### Why this shape

- **Markdown is canonical, not the CRDT.** Y.Doc is derived state; `.md` files in git are the source of truth. Crash recovery = rebuild Y.Doc from disk. Migration = nothing; it's already files.
- **Single Y.Doc, dual types.** Having `XmlFragment` AND `Y.Text` in the same doc — bridged by observers — is the key architectural move. It is what makes WYSIWYG↔source↔agent↔external-editor all one cohesive editor instead of four disconnected tools with sync headaches.
- **Zero LLM in the core.** Intelligence is an external concern. Every agent (Claude Code, Cowork, Cursor, Codex) consumes the same MCP surface. The cloud product, if added, is just another consumer.
- **Everything branchable.** Git branches switch content + derived index atomically. Drafts and agent proposals are branches, not a parallel state-management system.

---

## Open questions for the team

1. **XQ1 — MCP interface shape:** 6-7 semantic tools (read/write/edit/search/draft) or 1-2 `just-bash`-backed tools with unix commands the agent already knows? Evidence from Dust.tt and agent-performance research leans B; ergonomics lean A.
2. **TQ5 — License:** AGPL (Docmost/Wiki.js model, blocks SaaS forks) vs. MIT + proprietary cloud (AFFiNE model). Trigger: before public repo creation.
3. **CX distribution timing:** when does the Inkeep path open — after Next phase lands, or opportunistically sooner via custom reference skills?
4. **Presence for agents without faking cursors:** we've committed to region-flash + activity pill (not fake typing). Does the demo sell it? S5 v0 is built to find out.
5. **Layer 2/3 of the component pipeline:** react-docgen-typescript at project load is \~10-15s for 75 components — acceptable for dev, what about a 500-component docs repo? TypeScript 7 (tsgo, mid-2026) may break the Compiler API.

---

## Meta

- **Confidence:** HIGH on product surfaces + internal architecture (grounded in specs, init-spike validation, and memory). HIGH on landscape (sourced directly from the competitive-landscape report). MEDIUM on phasing — the NOW phase is code-grounded; NEXT is specced but unshipped; LATER is strategic direction, not a plan.
- **Channels tapped:** local code (specs, init\_spike, PROJECT.md), reports (`/reports/openknowledge-competitive-landscape/`), memory (worldmodel\_mdx\_component\_pipeline), skill-ecosystem context from the same report. Web channel intentionally skipped — reports dir has enough.
- **Channels not tapped:** full PROJECT.md items table beyond PQ1–PQ9 area (124KB file, read surface); \~50 related reports in `/reports/` flagged by PROJECT.md references but not deep-read.
- **UNRESOLVED:** exact shape of the publishing-engine surface (LATER phase); whether CX skill packs live in this repo or Inkeep's.
- **ADJACENT (not chased):** agent-memory layer (Mem0, Zep, Letta) — distinct category from authored knowledge, boundary may blur (XQ3).

