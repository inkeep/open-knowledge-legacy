---
title: "Open Knowledge v0 — Shareable Worldmodel"
description: "Self-contained topology of Open Knowledge's v0 product identity, persona model, competitive landscape, current first-60-seconds UX audit, narrative raw material, shareability precedents, obsidian-mind threat analysis, and open narrative questions. Designed to be read cold by a fresh Claude instance or human and provide enough grounding to reason responsibly about the launch. Companion artifact to REPORT.md; reusable across future research."
createdAt: 2026-04-14
updatedAt: 2026-04-14
subjects:
  - Open Knowledge
  - Obsidian
  - Notion
  - obsidian-mind
  - kepano
  - Andrej Karpathy
  - Mintlify
  - AFFiNE
  - ByteRover
  - GBrain
topics:
  - worldmodel
  - product identity
  - competitive landscape
  - UX audit
  - narrative raw material
  - shareability precedents
  - obsidian-mind 70% threat
  - open narrative questions
---

# Open Knowledge v0 — Shareable Worldmodel

> **Purpose.** A self-contained grounding artifact for anyone (human or nested Claude instance) reasoning about how Open Knowledge's v0 launch can feel special, differentiated, and shareable on day 0. Read this cold and you will have enough to ideate responsibly — what the product is, what v0 scope locks in, who the user is, where competitors fall short, what the current first-60-seconds feels like, what moat we actually have, and what narrative questions are still open.
>
> **Stance.** Non-prescriptive. This artifact observes the topology; it does not rank ideas or choose a direction. The consumer does that.
>
> **Last verified.** 2026-04-14 against PROJECT.md, competitive-landscape report (`reports/openknowledge-competitive-landscape/`), prior-art-eight-sources report, current CLI/app source under `packages/`, and the reports/CATALOGUE.md inventory.

---

## §1 — What Open Knowledge is

Open Knowledge is a **local-first agent-native knowledge platform**. It ships as the `@inkeep/open-knowledge` CLI, opens a web editor at `localhost:3000`, and exposes an MCP server that any AI agent (Claude Code, Cowork, Cursor, Codex, custom) can connect to.

**From PROJECT.md, the canonical one-liner:**

> "Obsidian, but agent-native and collaborative." — *Six words our P0 audience instantly understands.*

**From PROJECT.md, the strategic resolution:**

> "Build an agent-native knowledge platform. OSS core. Markdown files in git as the substrate. A rich editor that lets you flip between rendered rich editing and raw markdown (Obsidian-grade, not terminal-grade). An MCP server that makes the knowledge base a first-class tool for any AI agent. Humans and AI co-create, co-edit, co-maintain knowledge."

### Two architectural principles lock everything downstream

1. **Agent-agnostic substrate.** No LLM inference in the OSS core. All intelligence comes from external agents the user already has. The product "doesn't care who's driving."
2. **Everything branchable.** All meaningful state is either files in git (switched atomically with `git checkout`) or per-branch local cache (regenerable). Drafts, proposals, experiments are all just branches. No separate "draft state management."

### v0 ("Now") scope — what ships at launch

Directly quoted / summarized from PROJECT.md §Stories.Now:

| ID | What | The moat it builds |
|---|---|---|
| S1 | Unified WYSIWYG editor (TipTap + y-prosemirror) — both .md and .mdx; slash commands; drag-and-drop; registered JSX components render as void nodes with prop panels; unregistered JSX gets mini-CodeMirror | "No reason to use this over Obsidian or VS Code without a great editor." |
| S2 | File-level WYSIWYG ↔ source toggle (CodeMirror 6 + y-codemirror.next) — both bound to the same Y.Doc, observer-synced | "Developers expect source access — Obsidian has it and it's why they love it. Outline rejected it and is perceived as 'basic.'" |
| S4 | MCP server with 10-tool P0 surface (5 filesystem-compatible + 5 knowledge-specific), progressive disclosure via walkable catalog files, permission-routed writes (editor→main, proposer→auto-draft, maintainer→overwrite) | "This is what makes the product 'agent-native.' No other knowledge tool has this." |
| S5 | Human sees agent edits in real-time with presence — agent cursor in editor, "AI is typing" indicator, sidebar showing which files agent is editing, origin shading on agent-written content, activity feed, per-origin undo, section-level diff view | "This is the **defining UX** — no other product has real-time human+AI co-editing with presence." |
| S6 | Auto-persist with version history timeline — three-tier (CRDT→FS crash recovery / 30-60s WIP git refs / user-named checkpoints), attribution distinguishing human vs agent edits | "Figma/Notion mental model — continuous editing without friction. Git-backed history enables branching, PRs, collaboration without architectural changes." |
| S9 | Localhost editor embeddable in agent environments — the agent **programmatically opens** the editor panel in Claude Desktop / Cursor / Claude Code CLI / Playwright | "Transforms the product from 'a tool you remember to open' to 'the agent brings you to the editor.'" |
| S10 | Wiki-links + backlinks + graph view — `[[Page]]`, case-insensitive, `[[Page\|alias]]`, `[[Page#Heading]]`, red links (click to create, Wikipedia pattern) | Obsidian-grade knowledge-graph navigation. |

Plus granular UX work: V0-1 through V0-26 (undo, file ops, image paste, onboarding flow, agent-change diff review, rename+backlink-rewrite, etc.).

### v0 explicit non-goals (also canonical from PROJECT.md)

- **NEVER:** LLM inference in the OSS core
- **NEVER:** General-purpose workspace (Notion's databases, spreadsheets, project management)
- **NOT NOW:** Team/multiplayer (CRDT-ready, but P0 is single-player + AI)
- **NOT NOW:** Cloud/SaaS (P0 is local-first)
- **NOT NOW:** Publishing engine (Mintlify/GitBook replacement)

### The four "locked differentiators" (derived from Items + GTM framing)

These are the structural moat. Every day-0 delight/shareability idea should be tested against whether it makes these MORE visible:

1. **Real-time human+AI co-editing with CRDT presence** (S5) — you can *see* the agent typing; your edits and theirs merge via Yjs; per-origin undo lets Cmd+Z undo Claude's changes specifically. No competitor ships this.
2. **Embeddable editor inside agent environments** (S9) — the agent opens the editor panel in Claude Desktop / Cursor / VS Code next to the conversation. One MCP server, two surfaces.
3. **MCP write tools with permission-based draft/review routing** (S4, PQ9) — agents stage to drafts; humans review and merge. Permission model determines routing automatically. No competitor offers agent staging + human merge as a first-class flow.
4. **Developer-grade WYSIWYG + source toggle** (S1 + S2) — a proper markdown IDE. Obsidian has it (and devs love it for that); Notion doesn't (perceived as basic). We match Obsidian's editor bar + add collaboration.

---

## §2 — Persona model

From PROJECT.md §Audience: **"Individual contributor — developer or knowledge worker — using Claude Code or Claude Cowork."**

The persona contains two visible modes the team has explicitly left overlapping rather than split:

**Mode A — the Karpathy-ified developer.** Already uses Claude Code or Cursor; already maintains some scattered markdown + a half-working SKILL.md file; reads Karpathy / kepano / Tobi Lutke; lurks on HN and r/LocalLLaMA. Will judge the product by editor quality, MCP ergonomics, and whether it feels native to the terminal. Self-hosts by default. This is the initial evangelist.

**Mode B — the knowledge-work IC.** Non-developer or developer-adjacent (research, product, design, writing). Comes from Obsidian or Notion. Wants the agent to do the tedious bookkeeping (indexing, backlinking, summary refresh) without inheriting Notion's bundled AI + vendor lock-in. Cares about the *feel* of the editor more than the CLI's output.

PROJECT.md gives no separate onboarding path for each mode — both land in the same product. That's a **deliberate overlap, not a decision to split**. Whatever day-0 delight we ship has to land for both without feeling like a compromise to either.

**Day-0 closest competitor** (PROJECT.md verbatim): **Obsidian**. Not because Obsidian is building what we're building, but because our P0 user **already uses it**. "I have Obsidian + Claude Code MCP plugins. Why switch?" is the literal objection we have to answer.

**Second closest "competitor":** *No product at all*. "A folder of .md files + Claude Code. That's Karpathy's current setup. We're the product that replaces the 'hacky collection of scripts.'"

---

## §3 — Competitor portraits

*Each portrait is the distilled shape/strength/weakness as seen through `reports/openknowledge-competitive-landscape/`, the three Karpathy workflow deep-dives, and `reports/open-knowledge-prior-art-eight-sources/`.*

### Obsidian (1.5M users, strategic non-entry to collaboration)

The developer editing benchmark (CodeMirror 6 Live Preview, 43 min/day average usage). Markdown files + git compatibility + 2,736 community plugins is the deepest ecosystem moat. Philosophically single-player ("A second brain, for you, forever"). No real-time collaboration — oldest open feature request since 2020 with 2,200+ votes, no response. Closed-source, proprietary app. kepano's `obsidian-skills` repo (21K stars in 95 days) is the canonical "teach agents your format" pattern. `obsidian-mind` (1.3K stars, zero code) delivers persistent agent memory + convention-based knowledge workflows on top of Obsidian. **Will not add collaboration, embedded AI, or enterprise features.** Risk to us: Obsidian + kepano's conventions may be good enough for solo devs.

### Notion (enterprise incumbent, $600M ARR)

Mature real-time collaboration, 50+ block types, relational databases with six view types. Architecturally locked into proprietary block format (lossy markdown export). Bundles LLM compute at $10/1K agent credits. MCP server (22 tools) is read+write-without-co-creation — agents appear as the authenticated user, no attribution, no staging/review, no event subscription. The proprietary block model is the deepest moat and the structural lock preventing agent-native primitives. **Probability of pivoting to agent-native: very low** (would cannibalize bundled-credits revenue).

### Logseq

OSS outliner, block-based, local-first, markdown-compatible. Smaller community than Obsidian. No real-time collaboration. No MCP integration shipped. Fork risk: a lot of technical ambition but execution has been rocky post-v1 rewrite.

### Mintlify (10K+ companies, agent-infrastructure play)

Most vocal about "agent era." Auto-generates MCP (2 read-only tools) + llms.txt + skill.md on every docs site. Trieve + Helicone acquisitions signal ambition to be "Cloudflare of AI knowledge." **Hard ceiling: read-only MCP — agents cannot write back.** No wiki structure (hierarchical docs.json only, no backlinks). Fundamentally a documentation rendering platform, not a knowledge compilation engine. Threat is not that Mintlify will build Open Knowledge; it's that Mintlify's agent-readable surfaces become the standard interop layer everyone must conform to.

### AFFiNE (67K stars, OSS, technically ambitious)

BlockSuite (CRDT editor, y-octo Rust engine) is the most architecturally ambitious editor in the landscape. MIT license. Announced "AI knowledge base" pivot v0.25.0. **But:** CRDT binary is canonical (not markdown — loses portability). No agent-native primitives shipped. No funding since Oct 2023. Underdocumented API. Could theoretically become a direct competitor but execution momentum is unclear.

### Outline (37.9K stars, OSS-ish)

Y.js CRDT with 5+ years production hardening. Clean ProseMirror editor (~20 block types). MCP shipped Feb 2026. **But:** ProseMirror JSON canonical (lossy to markdown), BSL 1.1 license (prevents hosted offering), one-person core team, no extensibility model, deliberately avoids databases/advanced views. Consistently described as "very basic" vs Notion. Read-only MCP. Low probability of overlap.

### obsidian-mind (1.3K stars) — the 70% threat, see §8

A pure-convention template on top of Obsidian + Claude Code. Zero application code. Delivers persistent agent memory, agent-curated knowledge, convention enforcement through CLAUDE.md + slash commands + subagents + hooks + templates. **This is the strongest "you might not need this product" pressure Open Knowledge faces.** Covered in depth in §8.

### ByteRover (SOTA agent memory paper, arxiv:2604.01599)

96.1% on LoCoMo benchmark. Context Tree hierarchy, 5-tier progressive retrieval, bidirectional reference index. Agent-only writes via sequential FIFO queue. No editing UI. Markdown files canonical but no collaboration. Validates our S10 bidirectional-index design — same architecture, benchmark-proven.

### GBrain (Garry Tan, Y Combinator president)

SQLite-canonical personal brain. Compiled Truth + Timeline convention (above-the-line always-current summary, below-the-line append-only evidence). Thin CLI harness + fat SKILL.md files. 7,471 markdown files hit git's ~5K-file scaling ceiling and choked → chose SQLite. **Strong evidence that markdown-canonical faces scale limits at ~5K articles** — but at P0 scope it holds.

### Adjacent agent-memory crowd

Mem0 (51.9K stars), Zep/Graphiti (24.5K), Letta (21.9K), OpenViking (15K+). Orthogonal to KB platforms — conversational memory, not structured reference knowledge. Signal that "agents managing information" is a funded category.

### Adjacent AI-coding tools

Cursor, Claude Code, Windsurf, Aider, Continue, Cline, Codex. None is a knowledge platform. But all are channels — the agent environments our editor embeds into (S9). Claude Code has a `/buddy` mascot pattern we should specifically study for precedent.

---

## §4 — The 14 whitespace claims

Verbatim-ish from `reports/openknowledge-competitive-landscape/` + `reports/open-knowledge-prior-art-eight-sources/`. These are the specific "things no competitor does today" that we can light up.

1. **No competitor offers the full stack** — markdown-canonical + git version control + real-time CRDT + bidirectional MCP + zero LLM compute + genuine OSS license. Each incumbent would need to abandon core architectural or business commitments to reach it.
2. **Markdown-canonical is rare with collaboration.** Obsidian has markdown, no multiplayer. Mintlify has MDX+git, no co-editing. Every product with real-time collab (Notion, Confluence, Outline, AFFiNE) stores in proprietary/opaque format.
3. **Branching and merging for content is nearly absent.** Only Mintlify offers it (native git). No WYSIWYG competitor has branches, PRs, or structural diffs.
4. **No competitor supports agent co-creation.** Where MCP write exists (Notion, Confluence, Outline, AFFiNE), agent edits appear as the authenticated user — no attribution, no audit, no review flow, no staging.
5. **No MCP server offers** agent identity, attribution, staging areas, review workflows, event subscription, or scoped permissions — everyone is either read-only or CRUD-without-co-creation.
6. **Every AI-enabled competitor bundles LLM compute.** Notion ($10/1K credits), Confluence (Rovo bundled free after failed pricing), Mintlify (Claude Sonnet 4.5), Outline (OpenAI), AFFiNE (multi-model). Only Obsidian ships zero AI compute, by philosophy.
7. **Git's ~5K-file scaling ceiling** is documented (GBrain). Open Knowledge should explicitly scope "up to 5K articles per KB" and plan multi-brain support as the scaling story.
8. **No tool performs the core "compilation step"** — raw sources → structured wiki articles. Obsidian has InsightA, Notemd — but the orchestrator doesn't ship as one product.
9. **No mechanism natively distinguishes LLM-authored changes from human edits.** Obsidian has git-plugin but requires disciplined author/message discipline. No visual merge conflict UI.
10. **"Compiled Truth + Timeline" convention** (GBrain) is missing in every system — summary above, append-only evidence below. Pure convention, zero code, visually distinctive.
11. **Edge confidence typing for wiki-links is absent** — EXTRACTED vs INFERRED vs AMBIGUOUS. No system distinguishes provenance of relationships.
12. **Agent-writable "draft status" comment is missing** — Orca pattern (`worktree set --comment "..."`). High-bandwidth "what is the agent doing?" signal without log-parsing.
13. **Embeddable editor inside agent environments doesn't exist** — obsidian-mind depends on Obsidian-as-UI; Mintlify on its own web UI. No one ships an editor that runs *inside* Claude Code / Cursor / ChatGPT.
14. **Real-time human+AI co-editing with CRDT presence is not built anywhere.** Obsidian single-player. ByteRover agent-only. Mintlify no co-editing. Notion/Confluence human-only. We are the first bet.

---

## §5 — Current day-0 reality (UX audit)

*From direct inspection of `packages/cli/src/{commands,ui}/*`, `packages/app/src/components/*`, and the current presence/empty-state surfaces as of 2026-04-14.*

### The first 60 seconds, present tense

A user types `bunx @inkeep/open-knowledge init`. They see a list of status lines: `Content scaffolded at .open-knowledge/`, `Created: config.yml, AGENTS.md, .gitignore`, `MCP server configuration:` followed by per-editor registration status (Claude Code registered, Cursor registered, VS Code registered), then a numbered **Next steps** block in prose.

They run `bunx @inkeep/open-knowledge start`. A **Vite-style boxed banner** (via `cli-boxes.round` + picocolors) prints:

```
┌─────────────────────────────────────────┐
│                                         │
│  open-knowledge v0.0.1                  │
│                                         │
│  Local:   http://localhost:3000         │
│                                         │
│  Press Ctrl+C to stop                   │
│                                         │
└─────────────────────────────────────────┘
```

If first run: a green `✓ Scaffolded .open-knowledge/` checkmark + a dim "Tip: Run `open-knowledge init` to register MCP tools for Claude Code" line.

They open `localhost:3000`. They see a sidebar with "FILES" header, a `+` button, a "Create your first file" button (centered, muted gray), and a main editor pane with "Select a document to edit." The top bar shows `open-knowledge v0.0.1` breadcrumb, a green sync dot + "Synced", an empty presence-avatars area.

They click "Create your first file," name it `README.md`, and drop into a blank WYSIWYG editor.

**Total elapsed time: ~90 seconds from install to first editable document.**

### Where personality shows up today

- The banner (Vite-inspired, competent, calm — not sterile)
- Color semantics (green ✓ for success, cyan for links, gray for secondary)
- **Presence avatars**: humans get animal icons (Bird, Cat, Dog, Fish, Rabbit — deterministically mapped from name); agents get the Claude icon in a colored circle. This is the single warmest, most on-brand surface in the product today.
- Conversational "Next steps" after init

### Where personality is silent

- No ASCII art, mascot, character, or named persona anywhere
- Product name is "open-knowledge" (lowercase, hyphenated) — functional, not whimsical
- **Error messages are terse and technical** (`destroy() failed:` + stack trace). No "Oops!", no emoji, no voice.
- Init output is status lines. No celebration, no "You're all set!", no encouraging tone.
- Empty state is plain muted gray text. No illustration. No template hint.
- **No onboarding flow, tutorial, or demo agent.** Init does NOT automatically create a welcome document or run a sample agent. Blank slate.
- **Agent presence is minimal** — a colored circle. No "Claude is here" toast, no arrival animation, no tooltip beyond the name. If a first-time user didn't know MCP well, they'd see no visual evidence that they've just unlocked agent collaboration.
- Docs site: reference-only. No hero screenshot, no GIF, no 30-second "try it" video.

### The delight-gap table (sterile surfaces that could carry personality)

| Surface | Current | Opportunity territory |
|---|---|---|
| `init` output | Plain status list | Celebration, personality, a `/buddy` introducing itself, a visible "you've just connected your agent" moment |
| `start` banner | Server info only | Subtitle acknowledging the product's purpose ("Your agent's KB is live") |
| Empty file tree | "No files yet." | Illustration, warm copy, "Ask your agent to bootstrap from your code" |
| Empty editor | "Select a document" | Onboarding flourish, suggested first actions |
| First agent arrival | Silent colored dot | Toast, pulse, named greeting, an identity moment |
| MCP config output | "registered at ~/.claude/config.json" | "✓ Claude Code configured! Open it and start collaborating." |
| Presence bar | Minimal sync dot + avatars | Agent activity labels ("Claude is reading…"), warm identity cues |
| Docs landing | Tech stack table, positioning copy | Hero video, 30-second demo, narrative |
| 404 / error pages | Terse technical | Personality opportunity (think Hashi, Octocat, Ghost) |

### Existing "delight-ready" surfaces to amplify

Listed here because divergent ideation should lean on them rather than invent new ones wherever possible:

- **Animal-icon avatar system** (`packages/app/src/presence/PresenceBar.tsx`) — already personable, deterministically assigned, instantly warm. The backbone for any mascot/identity play.
- **Vite-style banner** (`packages/cli/src/ui/banner.ts`) — production-quality baseline. Easy to add a subtitle, side-slot, or ceremony.
- **TipTap WYSIWYG + slash commands** — rich enough to be delightful on its own; the "whoa" surface.
- **WYSIWYG ↔ source toggle (S2)** — the 30-second magic trick. Flip between polished rendered view and raw markdown while everything stays in sync. Demo gold.
- **Timeline / version-history rollback UI (S6)** — the "scrub through history" moment. Not visible on first run but latent.
- **MCP init auto-config** — one of the genuinely smooth bits today. Registers MCP with Claude Code / Cursor / VS Code without user fuss.

---

## §6 — Narrative raw material

*Quotes, analogies, framings, tagline candidates collected from PROJECT.md, the prior-art reports, and Karpathy's LLM Wiki gist. §6-web will be supplemented from web probes once they return.*

### Canonical phrases (from PROJECT.md)

- **"Obsidian, but agent-native and collaborative."** — the proposed 6-word tagline
- **"Humans and AI co-create, co-edit, co-maintain knowledge."** — the behavioral thesis
- **"Hacky collection of scripts."** — what we replace (how Karpathy's current setup is described)
- **"The agent brings you to the editor."** — the S9 framing for embeddable editor
- **"The defining UX — no other product has real-time human+AI co-editing with presence."** — S5 positioning

### Karpathy quotes (from prior-art-eight-sources D8)

- **"Obsidian is the IDE; the LLM is the programmer; the wiki is the codebase."**
- **"Humans abandon wikis because the maintenance burden grows faster than the value. LLMs don't get bored."**
- **"The tedious part of maintaining a knowledge base is not the reading or the thinking — it's the bookkeeping."**

### Analogies / framings proposed or implied in the corpus

- "The IDE Karpathy described, but collaborative"
- "Your AI co-author's wiki"
- "Obsidian, but it writes back"
- "A knowledge base where agents are first-class, not after-thoughts"
- "Figma for knowledge — continuous, collaborative, attributed"
- "GitHub for knowledge — branches, PRs, attribution, but for markdown articles"
- "The dumb excellent substrate" (from PROJECT.md's architectural self-description)
- "Zero LLM compute — you bring the brain" (inverting the pre-mortem's risk #4 as a principle)
- "A note without links is a bug" (obsidian-mind's slogan, worth adopting)

### Switching narrative (S5 verbatim from PROJECT.md, the three-beat story the team will probably use)

1. **Real-time co-editing** — "you see Claude's cursor, text appears as it writes, your edits and Claude's merge seamlessly via CRDT. In Obsidian, you get 'file changed on disk — reload?' and lose your unsaved work."
2. **Per-origin undo** — "Cmd+Z undoes Claude's changes specifically, preserving yours. In Obsidian, you'd `git checkout -- file.md` and lose everything since last commit."
3. **Async activity review** — "you open the product after Claude ran overnight, see an activity feed of what changed with visual diffs, accept or dig in. In Obsidian, you'd `git diff` in terminal."

### Pre-mortem risk #4 inversion (from PROJECT.md §Pre-mortem)

> "'Zero LLM compute' principle makes the product feel dumb. If competitors ship AI-powered search, AI-powered organization, AI-powered suggestions natively — and our product requires the user to separately configure an agent — the friction gap might be too large."

This is the single most important day-0 framing problem. The answer can't be "configure your own agent" alone — the day-0 experience has to make the bring-your-own-agent thing **feel like an upgrade, not a setup chore**. Day-0 delight must resolve this pre-mortem, not ignore it.

### Voice archetypes observed in adjacent dev-tool brands

*Distilled from web probes. Full material in `evidence/dev-tool-mascots-voice.md` and `evidence/oss-repo-positioning-scan.md`.*

- **Playful-opinionated (Laravel, tldraw).** "The clean stack for Artisans and agents." Emoji-forward. Whimsical use-cases. Opinions everywhere.
- **Bossy-opinionated (Rails).** `Rails has taken the liberty of...` — the framework *tells you* what it did.
- **Meme-native insider (Supabase).** CEO as meme-lord. "Your weird co-worker, who makes strange jokes, but also is super helpful, so you just vibe along." Technical jargon as tribal password.
- **Minimalist-premium (Vercel, Linear).** CLI output: `✓ Ready` / `◐ Building` / `○ Queued`. Present-tense, short sentences, bolded nouns.
- **No-nonsense-but-helpful (Biome).** "When we tell you something is wrong, we tell you exactly where the problem is and how to fix it." Zero hype.
- **Professional-but-warm (Claude Code).** Dialable via `/output-style explanatory | learning | [custom markdown file]`. **Personality as configuration.**
- **Empathetic-adaptive (Netlify).** Codified tone-switching: encouraging for announcements, empathetic in times of stress or confusion.
- **Aspirational-velocity (Astro, Bun).** "Ship less JavaScript." Speed claims ARE the voice.

### Mascot archetypes and hard-won rules

- **Octocat cardinal rule:** "The Octocat must never speak, instead showing emotion through context, action, and expression." Conscious anti-Clippy. Mona Lisa (Mona) + Ducky (debugging) + Copilot ("our fearless hero") — the Octodex has hundreds of named variants. **Forbidden in sales / support / enterprise / security / crisis contexts** per GitHub's own brand book. Community-and-merch only.
- **Slonik (Postgres elephant):** chosen because "elephants never forget" — mascot as **metaphor for the product's core technical promise.**
- **Dino (Deno):** drawn by the founder, amplified by fan artist hashrock. "Quiet and unassuming." Earnest, not slick.
- **Moby Dock → Artie (Docker, 2026):** cautionary tale. Evolving a mascot once it's viral generates community hand-wringing; *adding sidekicks* (Mona + Ducky + Copilot) works better than replacement.
- **Anti-mascot (Vercel, Linear, Ghost):** the absence is the personality. Typography, minimalism, generous whitespace.
- **Claude Code's dialable persona** (`/output-style`): no visual character, but personality is a *setting*. Issue #42341 on the repo literally asks to name the companion "Umbral."
- **Framer:** emoji-forward by official policy — JoyPixels emoji pack endorsed, emojis inside brand shapes.

**Universal failure mode: Clippy.** Chatty + interruptive + unsolicited. Never speak without being asked. A character who interrupts competent users is the nightmare; a character that *appears when invited* (Finch's bird on a dedicated screen) is loved.

### Warm-onboarding archetypes

*Full material in `evidence/warm-cute-gamified-onboarding.md`.*

- **Pet / companion** (Tamagotchi, Finch, Habitica). Core principles: continuous play (world moves without you), minimalist visual language (invites projection), **generational memory** (evolution as permanent record of care), **explicit no-punishment mode** (Finch's counter to Duolingo). The reward is *a story*, not points.
- **Streak / ritual** (Duolingo, GitHub contribution graph, Forest). Works when the daily action is small, the visualization accumulates, there's a character who notices proportionally, and there's a *recovery mechanic* (streak freeze). Cautionary tale: Duolingo is now canonically criticized for "dark patterns" — streak manipulation monetizes the anxiety itself.
- **Warm-ceremony** (Arc, Superhuman). First-run as emotional arc, not checklist. Arc's absurd color personalization forces IKEA-effect bonding before any utility. Superhuman's 30-min concierge call made friction itself the product.
- **Anti-onboarding** (Linear, Notion). Pre-populated demo data models the ideal state; you learn by *seeing it* not reading about it. The opinion is the onboarding.
- **Competence theater** (Warp). "We already know what you have" — reads `.zshrc` silently. For a local-first CLI this is likely the anchor stance, with a Finch-style companion layerable on top.
- **Small-delight accumulation** (Panic, Things 3, Rauno Freiberg's essays). Purposeful animation with 100-200ms Disney-style overlap delays. Small weirdness earns identity signal — but *only if the fast path is bulletproof.*

### Tagline scaffolds (raw phrase bank — not ranked)

From the OSS scan and PROJECT.md:

- "Obsidian, but agent-native and collaborative" *(PROJECT.md, 6-word tagline candidate)*
- "The OSS Obsidian alternative your AI writes alongside you"
- "Your wiki, where agents are co-authors not consumers"
- "Markdown wiki + AI agents + real-time collab. All yours. Always."
- "Your team's brain runs on markdown. Locally. Forever."
- "A note without links is a bug" *(obsidian-mind slogan, adoptable)*
- "Humans abandon wikis. LLMs don't get bored." *(Karpathy, tagline-worthy)*
- "Organize, find, and work with any amount of knowledge" *(Dendron's three-verb lifecycle frame)*
- "Source-controlled knowledge" *(inheriting Continue's git-as-ledger phrasing)*
- "Human-in-the-loop knowledge ops" *(Cline/Trigger.dev empowerment language)*
- "You just talk. The agent handles the bookkeeping." *(inverting Obsidian Mind's friction-free line)*

---

## §7 — Shareability precedents

*Signals from the corpus about what makes dev-tool launches viral, and what specific moments have worked in adjacent categories. Will be supplemented with web-probe findings when in-flight agents return.*

### Documented precedents already in the corpus

- **obsidian-skills (kepano, Jan 2026):** 21,036 stars in 95 days = ~221 stars/day. Largest Obsidian community repo (obsidian-releases) took 5 years to hit 9.6K. Signals: (a) developer hunger for "teach agents your format" is enormous; (b) Agent Skills + `npx skills add` distribution works; (c) founder personal brand + Obsidian's 1.5M user base provides distribution; (d) "teach agents your product's formats" is a validated go-to-market.
- **DeepWiki's URL-substitution trick** (github.com → deepwiki.com): zero-config publishing tied to existing identity. Tweetable distribution mechanic.
- **"Compiled Truth + Timeline" convention** (GBrain): visually distinctive, immediately understandable without explanation. Tweetable layout.
- **Format compatibility as a wedge:** make OK format-compatible with Obsidian markdown (wikilinks, frontmatter, callouts, embeds). "Everything obsidian-skills taught your agent still works in Open Knowledge, AND you get collaboration" is a migration-story tweet.

### Moat-reinforcing day-0 demos (candidates derived from the 4 locked differentiators)

Listed as raw material, not ranked:

- Two cursors in the same editor, one human one agent, both typing live
- WYSIWYG toggle to source in under a second while the agent is mid-edit; toggle back and the agent's changes are still visible
- Cmd+Z undoes Claude's last paragraph but keeps your sentence; press it again to bring Claude's paragraph back
- Claude Code in a split pane; a command is typed; the editor panel to the right receives the changes live with attribution
- Agent drafts a new page in a "draft" branch; user reviews the diff; user merges with one click; git log shows a commit by `agent: claude-code-session-abc123`
- Timeline scrubber: drag through the last 30 minutes of edits and watch the document rewind, with human and agent edits color-coded
- Obsidian vault imported (git clone → KB lives); first agent edit arrives within seconds

### Viral dev-tool launches 2024-2026 — distilled

*Full material in `evidence/viral-dev-tool-launches-2024-2026.md`. These are the patterns and specific moments that are most transferable.*

**Cursor.** The viral moment was not the launch — it was **Karpathy's Feb 2025 tweet coining "vibe coding."** "I just see things, say things, run things, and copy-paste things, and it mostly works." 27K+ likes, 4M views, Collins Dictionary Word of the Year 2025. Karpathy called it "a shower of thoughts throwaway tweet." Cursor hit $100M ARR in 20 months with no marketing spend. **An outsider naming the thing you enable beats any launch post you write yourself.**

**Bolt.new.** October 3, 2024. **Single tweet, no marketing.** Day 1: $60K ARR. 4 weeks: $4M ARR. The demo that went viral: full app built + deployed + previewed in-browser from one prompt. Creator-led TikTok/X virality. "90 days to ship or shut down" narrative was itself a viral asset. **Capability-unlock timing** (Claude 3.5 Sonnet crossed the threshold) beat calendar timing.

**kepano's obsidian-skills** (Jan 2026). **21K stars in 95 days from a single tweet + 5 SKILL.md files.** Zero marketing. Zero media coverage. The viral hook: the CEO of Obsidian personally teaching Claude how to write in his own product's dialect. **Competitors can't copy this because the CEO has to actually do it.** Pattern: ship an official Claude-Skills repo for your product's format on day 0.

**Claude Code `/buddy` (April 1, 2026).** Tamagotchi-style ASCII terminal pet. **18 species × 5 rarity tiers × 1% shiny**, deterministic per user-ID (FNV-1a hash → Mulberry32 PRNG). Observes your Claude session, persists across sessions. Spawned Medium guides, species-collection communities, reroll mechanics, imitators. Community quote: *"Clawd turns the terminal from a task space into a relationship space."* **The template: ship the playful thing on April 1 so criticism can't stick, but make it deterministic+persistent so the joke becomes identity.**

**Supabase Launch Week.** Quarterly cadence, 5 days, 1 ship per day, custom branding per cycle. Detailed launch-day schedule down to the minute (7:30am Spaces reminder → 7:55am PH goes live → 8:00am blog → 8:05am launch tweet). Pre-recruited Technical Angel Investors squad. **launchweek.dev now catalogs copycats** (Resend, Langfuse, Cal.com, PostHog, Neon, Clerk). The format itself became a category.

**Arc.** "A new web browser with a ton of personality." Framing: "we wanted to build something that felt more like a product from Nintendo or Disney than from a browser vendor." Invite-only rollout + cinematic onboarding + 1:1 founder Zoom calls + closing "membership card." **Frame a commodity as a home, not a tool.**

**Warp terminal.** Show HN 2021: 10K signups <24h on "terminal reimagined from the ground up." Block metaphor — command+output as draggable unit. BUT: 2025 "Agentic Development Environment" launch drew hostile HN threads about terminal-session-to-LLM-without-consent. **Trust artifacts ship on day zero or the ceiling is capped.** Relevant to us: "zero LLM compute in OSS core" is a trust asset, not a feature bullet.

**Linear.** Contrarian anti-Jira manifesto. "User stories have become a cargo cult ritual." Terminology rebellion — "issues" not "user stories", "cycles" not "sprints." Refuses the word "agile." **Opinionated efficiency > configurability.**

**aider** (Paul Gauthier, July 2023, 42K+ stars). Solo-author mythology. Viral growth came from the **polyglot benchmark leaderboard** — every new frontier model → aider benchmark result → developer X thread. **Build a benchmark the whole ecosystem has to cite.** (Candidate for us: an "agent knowledge-maintenance benchmark" — how well does each model compile/lint a wiki?)

### Launch-narrative archetypes (raw typology)

1. **"This is the end of X."** Linear → Jira. Arc → Chrome. Warp → 80s terminal.
2. **"I was frustrated and built this in a weekend."** Bolt's 90-days-to-ship, kepano's solo repo, aider's solo maintainer.
3. **"The CEO personally taught AI how to use their own app."** kepano-archetype. High signal, uncopyable.
4. **"Coining a category."** Windsurf = "agentic IDE." Karpathy = "vibe coding." v0 = "generative UI."
5. **"Outsider-names-it."** Karpathy for Cursor. Often a researcher/investor with larger following than the product.
6. **"Launch Week-as-festival."** Supabase. Scarcity through cadence.
7. **"Easter egg on April 1 that's secretly permanent."** `/buddy`.
8. **"Single tweet, no marketing."** Bolt, kepano — growth story itself becomes the pitch.
9. **"Capability-unlock timing."** Ship the day the substrate crosses threshold.
10. **"Benchmark-as-moat."** aider leaderboard.

### Demos that worked (15-60s clips)

- **Bolt.new:** prompt → full-stack app scaffolded, running, deployed, shareable URL — all in one unbroken screen capture, TikTok-friendly.
- **Karpathy/Cursor "vibe coding":** voice memo → Cursor Composer edits → "Accept All." **The viral element is the absence of keyboard.**
- **v0.dev:** prompt → shadcn component rendered live with preview + code toggle. Every demo ends with "click to open in Vercel."
- **Clawd `/buddy`:** 6-second GIF — user types `/buddy`, ASCII creature hatches, roasts a bug. Pure emotional delivery.
- **Warp blocks:** drag a block, copy it, share it. Command-as-first-class-object is visible in one frame.

**Parallel for us:** the equivalent for Open Knowledge is almost certainly (a) two cursors in the editor (one human, one agent, both typing) or (b) WYSIWYG↔source toggle mid-agent-write. Both produce a one-frame "I get it" moment.

---

## §8 — The obsidian-mind 70% threat + counter-positioning

*This section is treated structurally because it defines what our moat actually is after honest threat modeling.*

### What obsidian-mind actually delivers

A pure-convention template on top of Obsidian + Claude Code. **Zero application code.** Achieves:

- Persistent agent memory via CLAUDE.md (339-line operating manual) + 15 slash commands + 9 subagents + 5 lifecycle hooks
- Structured knowledge workflows via note templates + folder scaffolding + vault-manifest.json (declarative schema per content type, version fingerprints for migration)
- Obsidian backlinks as emergent evidence database
- QMD (Tobi Lutke's search engine) for hybrid BM25+vector+LLM rerank
- Reference-skills-as-markdown, composable

**It covers ~70% of Open Knowledge's functional ground with zero code.** 1.3K GitHub stars and growing. Validates that "persistent agent memory" and "agent-curated knowledge" as value propositions are already solved for power users via pure conventions.

### What it does NOT solve

- Real-time human+AI co-editing with CRDT presence (structurally impossible in Obsidian)
- Embeddable editor inside agent environments (depends on Obsidian as the UI)
- MCP write tools with permission-based routing (writes via bash, no permission model)
- Developer-grade WYSIWYG + source toggle (relies on Obsidian's editor)
- Branching + structural diff review (plugin, not first-class)

### Counter-positioning

**Do not position against "persistent agent memory" or "agent-curated knowledge" as categories** — obsidian-mind already won those battles with pure conventions on top of Obsidian. 

**Position on the substrate layer** — the 30% obsidian-mind cannot deliver is the entire product:

- Real-time co-editing with visible presence
- Embeddable editor surface
- Permission-aware MCP writes with staging/review
- Developer-grade WYSIWYG

**Take the "yes, and" posture.** Open Knowledge should be format-compatible with Obsidian markdown. "Everything obsidian-skills taught your agent still works in Open Knowledge, AND you get collaboration." Migration from Obsidian vault to Open Knowledge repo is `git init && mv *.md .` plus reading the existing frontmatter conventions. **Zero-cost adoption for the 1.5M Obsidian user base.**

**Adopt the patterns that work.** Copy obsidian-mind's CLAUDE.md / AGENTS.md template structure directly. It's the best in-the-wild template. (Not an endorsement of their positioning — an acknowledgment that good prior art compounds.)

---

## §9 — Existing "delight-ready" surfaces

A scan of the current codebase for surfaces we could amplify without net-new engineering. (See also §5's delight-gap table.)

| Surface | File | What's there today | Amplification territory |
|---|---|---|---|
| Animal avatar system | `packages/app/src/presence/PresenceBar.tsx` | Bird, Cat, Dog, Fish, Rabbit, etc. deterministically assigned to humans; Claude icon for agents | The mascot / identity infrastructure is already latent. Name them, give them voices, use them for error messages, use them in loading states, print them in the CLI. |
| Vite-style banner | `packages/cli/src/ui/banner.ts` | Boxed banner with product name + local URL | Subtitle line, ASCII mascot slot, "agent is ready" status cue, rotating tip or quote |
| Color semantics | `packages/cli/src/ui/colors.ts` | Picocolors-based helpers (error, warning, success, info, dim, accent) | Already principled; easy to extend for mascot voice, per-mode palettes, theme moods |
| Sync indicator | `packages/app/src/presence/PresenceBar.tsx` (sync dot) | Pulsing colored dot + "Synced" label | "Just connected" toast, "Claude is present" state, "draft auto-saved to branch xyz" cues |
| WYSIWYG + source toggle | `packages/app/src/editor/{TiptapEditor,SourceEditor,observers}.tsx` | Functional, CRDT-bound, convergent | The 30-second demo magic trick — design the toggle animation itself; the *motion* is the message |
| Timeline / rollback UI | `packages/app/src/components/...` | In-progress (V0-16) | Scrubber metaphor, human-vs-agent color coding, "rewind to before the agent wrote that paragraph" one-click |
| MCP auto-config | `packages/cli/src/commands/init.ts` | Writes `.mcp.json` entries for Claude Code / Cursor / VS Code | Make the moment legible — "✓ Your agent just got a new superpower" framing |
| AGENTS.md / CLAUDE.md scaffold | `packages/cli/src/content/init.ts` | Scaffolds these files | The seed template is where the product's voice is taught to the agent. Copy obsidian-mind's structure. |
| Seed content slot | (no seed content today) | Init creates no example articles | A welcome page, a "what to try next" page, and a demo-agent-walkthrough page are huge day-0 levers that don't exist yet |

---

## §9b — prior-art-open-knowledge (directly relevant)

The `~/.claude/oss-repos/prior-art-open-knowledge/` cache holds four projects previously identified as our prior art. **Obsidian Mind** is the most Open-Knowledge-shaped and worth naming specifically:

- Positions as "An Obsidian vault that makes Claude Code remember everything."
- Lifecycle commands: `/standup`, `/wrap-up`, `/dump`.
- Folder geography: `work/`, `org/`, `perf/`, `brain/`.
- Emoji mascot: 🧠.
- **Voice signature: "You just talk. The hooks handle the routing."** — warm, friction-free, process-oriented.

The other three (**Orca** — multi-agent orchestrator, **ByteRover CLI** — context-tree memory with benchmarks, **graphify** — multi-modal knowledge graph) are each solving a slice of our territory. The common thread is AGENT MEMORY + CONTEXT STRUCTURING. Obsidian Mind's voice is the one worth studying closely — it's the closest in tonal register to what we'd want.

See `evidence/oss-repo-positioning-scan.md` for full detail.

---

## §10 — Open narrative questions

The things PROJECT.md / stories / specs **have not decided** and that day-0 design still has to resolve. These are the choice points a downstream report should flag for Nick.

1. **Is v0 for the developer or the knowledge-worker, on day 0?** PROJECT.md says both. Current codebase is dev-shaped. Docs landing copy is dev-shaped. Do we ship with one wedge and expand, or genuinely aim both — and what's the single onboarding flow that serves both?
2. **What is the day-0 aha moment?** No spec names it. Candidates: see-agent-typing / WYSIWYG-source-toggle / Cmd+Z-the-agent / timeline-scrub / Obsidian-vault-import / agent-opens-the-editor-for-you. Picking ONE and designing for it (while not foreclosing the others) is missing.
3. **What is the 30-second demo?** No Loom, no storyboard, no hero video exists. This is the highest-leverage missing asset.
4. **What is the product's voice?** PROJECT.md has no tone-of-voice guide. CLI is competent-but-sterile. Error messages are terse. Without a voice decision, every writer (copywriter, docs writer, agent instruction writer) will pull in their own direction.
5. **Is there a mascot / character?** Not decided. The animal avatar system is latent infrastructure but there's no named character yet. Claude Code ships `/buddy`. Does Open Knowledge have its own?
6. **What's the "zero LLM compute" story on day 0?** The pre-mortem flags this as the #4 risk. "Bring your own agent" needs to feel like an upgrade, not a setup chore. No spec resolves this.
7. **What triggers a user to share?** Not specified anywhere in the corpus. Which moment makes someone DM a coworker or tweet? Not answered.
8. **What's the Obsidian-vault-import path?** Format compatibility is discussed but no explicit "here's the 10-second migration flow" exists.
9. **What does the first agent arrival look like?** S5 describes the steady-state presence UX. But the first-ever-arrival of an agent in an empty editor is a distinct moment and it's not designed.
10. **What ships pre-populated?** Init creates no seed content. Should it ship with a welcome-page-authored-by-an-agent-live, a tour document, a "try this" sample, or stay blank?
11. **Mascot archetype choice.** Octocat pattern (visual character that *never speaks*, Octodex-style variants, never appears in serious contexts)? Dialable-persona pattern (Claude Code `/output-style`, no visual)? Meme-native-voice pattern (Supabase-as-weird-co-worker, no character, all tone)? Anti-mascot minimalism (Vercel/Linear — typography + color as personality)? These are the four precedent-backed options; the corpus doesn't choose.
12. **Streak / pet / gamification stance.** Finch-style no-punishment companion (your KB as a cared-for creature that evolves with articles fed)? Or explicit refusal (Duolingo-style loss-aversion has been publicly called manipulative; devs sniff it out)? Or ambient GitHub-graph-style (passive visualization of real work)?
13. **Launch format.** Supabase-style Launch Week (5 days × 1 ship)? Bolt-style single-tweet? kepano-style solo-author GitHub repo with no marketing? Arc-style invite-gated cinematic onboarding? Or combine — e.g., soft-launch via a `open-knowledge-skills` repo (kepano archetype) then Launch Week for v0 formally?
14. **The phrase we want Karpathy (or another outside-voice) to coin.** "Vibe coding" did more for Cursor than any Cursor-owned asset. What's our equivalent? "Co-wiki-ing"? "Agent-authored knowledge"? "Wiki-as-co-pilot"? *Who* plausibly says it?
15. **Is there a prebuilt April 1 Easter-egg equivalent of `/buddy` we ship?** Deterministic+persistent cosmetic that turns the animal-avatar system into a collection loop? (The infrastructure is already there — each user deterministically gets an animal; we just haven't made it a *thing*.)
16. **Benchmark-as-flywheel candidacy.** An "agent knowledge-maintenance benchmark" — "how well does Claude vs GPT-5 vs Gemini vs Grok keep a wiki organized and cross-linked?" — that the ecosystem has to cite. Is this worth shipping alongside v0?

---

## §11 — Meta

- **Format.** Follows `gtm:worldmodel` skill's 10-section structure, adapted to this topic. Sections extended to §10 for open questions + §11 for meta.
- **Harvest channels tapped (all complete):**
  - ✅ Product identity (PROJECT.md, stories, specs)
  - ✅ Codebase UX audit (`packages/cli`, `packages/app`)
  - ✅ Reports corpus (`reports/CATALOGUE.md` + 12+ deep-reads)
  - ✅ Competitive landscape (openknowledge-competitive-landscape + prior-art-eight-sources + three Karpathy deep-dives + agent-retrieval + MCP-design + licensing)
  - ✅ Web probe — viral dev-tool launches 2024-2026 (`evidence/viral-dev-tool-launches-2024-2026.md`)
  - ✅ Web probe — dev-tool mascots + voice archetypes (`evidence/dev-tool-mascots-voice.md`)
  - ✅ Web probe — warm / cute / gamified onboarding (`evidence/warm-cute-gamified-onboarding.md`)
  - ✅ OSS channel — cached repo positioning scan (`evidence/oss-repo-positioning-scan.md`)
- **Confidence.**
  - **HIGH** on product identity, v0 scope, competitor portraits (triangulated across 4+ channels).
  - **HIGH** on the four locked-differentiator framing (derived from PROJECT.md S1-S10 plus §Audience).
  - **MEDIUM-HIGH** on shareability precedents and mascot/voice archetypes (single-channel web probes, well-cited).
  - **MEDIUM** on narrative questions (§10) — the *enumeration* is HIGH confidence; any *answer* is LOW until Nick picks.
  - **LOW** on what will actually go viral for Open Knowledge specifically — day 0 is ahead of us, uninstrumented.
- **What this artifact is NOT.** A recommendation. A ranking. A design proposal. A roadmap. A prescription. It is topology — what exists, what competitors ship, where the current product is silent, what precedents the corpus has proved work. The downstream divergent ideation and the curated shortlist happen in the main report, not here.
- **How to use this artifact in nested divergent ideation.** Read §1-§5 to understand the product. Read §8 to internalize the competitive reality. Skim §3-§4 for competitor gaps to flip into opportunity. Draw heavily from §6 for voice/tone range, §7 for shareability precedents, §9 for what's already delight-ready in the codebase. Treat §10 as the *unconstrained-ideation permission* — these are the unanswered questions, any imagination is welcome. When a specific reference is invoked (Octocat, Finch, Clawd), read the linked evidence file for depth.
