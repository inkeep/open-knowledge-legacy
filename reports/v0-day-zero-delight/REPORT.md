---
title: "V0 Day-Zero Delight: What Would Make Our Launch Feel Special"
description: "Research-driven divergent exploration of how Open Knowledge's v0 launch can feel special, differentiated, and shareable on day 0. Four-phase methodology (multi-channel worldmodel harvest + 20 parallel divergent agents + thematic consolidation + synthesis) producing a top-20 curated shortlist across 5 dimensions (differentiation-exploit, delightful onboarding, time-to-wow, teammate-share, social-share), 3 distinct day-0 story spines (Warm-Ceremony, Power-Tool-Pride, Wonder-and-Magic), 12 tagline candidates, and 11 open narrative questions. Includes a reusable shareable worldmodel artifact."
createdAt: 2026-04-14
updatedAt: 2026-04-14
subjects:
  - Open Knowledge
  - Obsidian
  - Notion
  - Claude Code
  - obsidian-mind
  - kepano
  - Andrej Karpathy
  - Clawd /buddy
  - Bolt.new
  - Cursor
  - Linear
  - Arc Browser
  - Finch
  - Tamagotchi
  - Octocat
  - Supabase Launch Week
topics:
  - v0 launch strategy
  - day-0 delight
  - differentiation narrative
  - mascot and voice
  - onboarding ceremony
  - time-to-wow
  - shareability mechanics
  - viral dev-tool launches
  - power-user advocacy
  - benchmark-as-flywheel
  - anti-incumbent manifesto
  - divergent ideation methodology
---

# V0 Day-Zero Delight — What Would Make Our Launch Feel Special

**Last verified:** 2026-04-14
**Commissioned by:** Nick
**Scope:** Research-driven divergent exploration of how Open Knowledge's v0 launch can feel special, differentiated, and shareable on day 0 — for the "developer or non-developer" P0 persona using it locally as an Obsidian / Notion alternative.
**Methodology:** 4-phase research — (A) multi-channel worldmodel harvest, (B) 20 parallel divergent agents dispatched across 5 dimensions × lens matrix, (C) thematic consolidation + convergence heatmap + shortlist curation, (D) this synthesis. Unbounded creative horizon — ideas NOT filtered by engineering viability. See `meta/RUN.md` for full methodology log.

**Sibling artifacts in this report:**
- [`worldmodel.md`](./worldmodel.md) — shareable, reusable topology of product + competitive + UX state (read cold to understand the full picture)
- [`evidence/*.md`](./evidence/) — 4 web-probe + OSS-scan outputs preserved verbatim (viral dev-tool launches, mascots + voice archetypes, warm/cute onboarding patterns, OSS positioning scan)
- [`consolidation.md`](./consolidation.md) — 17 clusters, full convergence heatmap, tagged idea universe with five tags per idea, extended pitches
- [`divergent-agents-raw/`](./divergent-agents-raw/) — 20 raw divergent-ideation files (~4,800 lines) preserved for future mining
- [`meta/RUN.md`](./meta/RUN.md) — research methodology log

---

## TL;DR

- Open Knowledge is **technically competent and narratively sparse**. The v0 codebase ships with zero mascot, a sterile init flow, invisible agent presence on first run, and a flat empty state. The #1 differentiator (real-time human+AI co-editing) is a structural capability but not a sensory day-0 event.
- **The four locked differentiators** — real-time co-editing presence (S5), WYSIWYG+source toggle (S1/S2), permission-routed MCP writes (S4), embeddable editor inside agent environments (S9) — are unique in the landscape but currently undemonstrated. No competitor ships any of the four. The moat exists; the *demo* does not.
- **Three ideas reached 6+ independent agents in our divergent ideation** (strongest signals in the entire 20-agent corpus):
  - **Deterministic species/mascot-per-user** (10 agents) — the existing animal-avatar infrastructure wants to become identity.
  - **Two-cursor visible co-editing** (7 agents) — the defining clip.
  - **Demo-agent-on-init** (7 agents) — resolves PROJECT.md pre-mortem risk #4 without shipping LLM inference.
- **Highest-signal single idea: Cmd+Z the Agent** (6 agents). Six seconds. Universal muscle memory, doing the thing every dev has wanted to do once. Quote-tweet bait. The Bolt-equivalent.
- **Top-20 curated proposals** below: 5 per locked-differentiator (D1), 4 warm-identity (D2), 4 ten-second-aha (D3), 4 teammate-share (D4), 3 social-launch (D5).
- **Three distinct day-0 story spines** below: Warm-Ceremony / Power-Tool-Pride / Wonder-and-Magic. Each chains 8-11 shortlisted proposals in a distinct emotional register. They are genuinely different launches — picking one is a strategic choice, not a packaging detail.
- **Twelve tagline candidates** below. "Wikis aren't databases" and "Claude Code forgets. Open Knowledge remembers." are the strongest for their respective fights.
- **Sixteen open narrative questions** flagged in worldmodel.md §10. A handful are load-bearing: is v0 for the developer or the knowledge-worker on day 0? What phrase do we want Karpathy to coin? Does v0 ship with a mascot, or a dialable-persona, or neither?

---

## 1. The worldmodel in 500 words

*Condensed recap. Full grounding in [`worldmodel.md`](./worldmodel.md).*

Open Knowledge ships as `@inkeep/open-knowledge` — local CRDT markdown wiki + HTTP editor + MCP server. PROJECT.md calls the tagline **"Obsidian, but agent-native and collaborative."** The v0 ("Now") stories lock seven surfaces: unified WYSIWYG editor (S1), WYSIWYG↔source toggle (S2), MCP 10-tool surface (S4), real-time presence with per-origin undo (S5), auto-persist timeline with attribution (S6), embeddable editor inside agent environments (S9), wiki-links + backlinks + graph (S10). Day-0 closest competitor is **Obsidian** (not because Obsidian is building what we're building, but because the P0 user already uses it). Second-closest "competitor" is **no product at all — a folder of .md files + Claude Code**, per PROJECT.md.

The competitive landscape synthesizes to a tight whitespace claim: **no competitor offers markdown-canonical + git-versioned + real-time-CRDT + bidirectional-MCP + zero-LLM-compute + genuine-OSS together.** Every incumbent would have to abandon architectural or business commitments to reach it. **obsidian-mind** (1.3K stars, pure-convention Obsidian template) is the honest 70% threat — it delivers persistent agent memory and convention-based knowledge with zero code. Our moat narrows to **the substrate layer it cannot deliver**: real-time co-editing presence, embeddable editor, permission-routed MCP writes, developer-grade WYSIWYG.

The current first-60-seconds is: `bunx init` → status list → `start` → competent Vite-style banner → browser opens → "No files yet." → click "Create your first file" → blank editor. ~90 seconds elapsed, zero personality, agents invisible. The delight-gap table in worldmodel §5 catalogs the specific surfaces that are competent-but-flat today: init output, empty states, first agent arrival, MCP config output, presence bar.

**Karpathy's three quotes anchor the narrative raw material**: "Obsidian is the IDE; the LLM is the programmer; the wiki is the codebase." "Humans abandon wikis because the maintenance burden grows faster than the value. LLMs don't get bored." "The tedious part of maintaining a knowledge base is not the reading or the thinking — it's the bookkeeping."

**obsidian-skills** (kepano's repo, 21K stars in 95 days, zero marketing) is the shareability precedent — the CEO-teaches-AI-own-dialect archetype. **Claude Code `/buddy`** (April 1 2026, 18 species × 5 rarity × 1% shiny, deterministic per user-ID, persistent) is the pattern: ship the playful thing on April 1 so criticism can't stick; make it deterministic+persistent so it becomes identity.

The pre-mortem's load-bearing risk is #4: **"Zero LLM compute makes the product feel dumb."** Day-0 must resolve this — "bring your own agent" has to feel like an upgrade, not a setup chore. This is the single most important framing problem. The corpus resolves it with **demo-agent-on-init** (7 agents independently): the user sees co-editing + presence + attribution before configuring anything real.

---

## 2. The divergent landscape — 17 clusters across 5 dimensions

The 20 divergent agents collectively produced ~400 raw ideas across 5 dimensions. Consolidation grouped them into **17 thematic clusters**. Full cluster map in [`consolidation.md`](./consolidation.md) §A. Here is the cluster inventory with the dimension each primarily serves:

| Cluster | Primary dim | Example ideas | Agents contributing |
|---|---|---|---|
| Presence & attribution | D1 | Named agents, visible cursor, arrival ceremony, activity Y.Map as creature-fuel | D1a, D1c, D2c, D3c, D4a |
| Share-artifacts as primitives | D4 | `.okclip`/`.okreplay` URLs, postcards, OK Cards, publish-to-subdomain | D1d, D3c, D4a, D4b, D5b, X2 |
| Mascot / character | D2 | Quill, Muninn, Ink Spirit, Olly, Bramble, OK's-equivalent-of-`/buddy` | D2a, D2b, D3c, X2 |
| Pet-KB / legibility of care | D2 | Hatching ceremony, evolution stages, Finch-no-punishment | D2a, D2b, D2d |
| Onboarding ceremony & identity | D2 | Name library + name agent, membership card, `you.md`, hatching trait | D2a, D2d, D3a |
| 10-second aha | D3 | Scripted demo agent, reclaim install window, one-command to editor-with-content | D3a, D3b, D3c |
| Seed content | D3 | Welcome.md, Karpathy gist, haunted wiki, autobiography from shell history | D3b, D3c |
| Review & permission UX | D1 | Inbox triage, gavel merge, paragraph approve/reject, named-agent commits | D1c |
| Per-origin undo as hero | D1 | Cmd+Z undoes the AI clip | D1a, D1b, D1c, D4a, D5b, D5d, X1 |
| Toggle magic tricks | D1 | Source toggle animation, CRDT merge theater, alt-reveal, paste-anything | D1b |
| Embed-in-agent-environments | D1 | `/bring-me-there`, `okwiki://`, Cursor inline hijack, VS Code replacement | D1d |
| Launch-week / manifesto surfaces | D5 | Anti-Notion manifesto microsite, single-tweet launch, kepano-skills repo | D4c, D5a, X1 |
| Benchmark-as-flywheel | D4/D5 | okbench, co-edit-bench, wiki-gardening benchmark | D4c, D5a, D5b, D5c, X1 |
| Anti-incumbent manifesto | D5/X | "Wikis aren't databases", "Claude Code forgets", "taught to write" | X1, D5a, X2 |
| Micro-interactions & easter eggs | D2 | Wikipedia-stub empty states, redlink hover copy, timeline scrubber, sound | D2c |
| Reference-product mashups | X | Daily Note Ritual × Roam, Shareable Permalinks × v0, Knowledge Bird × Finch, Ink Spirit × Clawd | X2 |
| Live / public / spectacle | D5 | openknowledge.dev/live, 24/7 TikTok LIVE, nick.openknowledge.dev | X1, D5b, D5d |

### Convergence heatmap — ideas that appeared independently in 5+ agents

The strongest signals. When 5+ agents — each working from the same worldmodel but different divergent lenses — land on a similar idea, the idea is doing structural work, not local optimization.

| Idea | Agent count | Why it converges |
|---|---|---|
| **Deterministic animal/species/mascot per user** | **10** | Existing avatar infrastructure + `/buddy` precedent + Octocat archetype all point here |
| **Shareable URL per session / artifact-as-primitive** | 8 | Bolt.new + v0.dev pattern; every local-first product's missing piece |
| **Two-cursor visible co-editing** | 7 | S5 is the defining differentiator; visual grammar is obvious |
| **Demo-agent-on-init (Olly-archetype)** | 7 | Only way to resolve pre-mortem risk #4 without LLM inference |
| **Cmd+Z the Agent** | 6 | Per-origin undo is structurally unique; universal keybinding primes the demo |
| **Karpathy lineage hijack** | 6 | Founder-of-the-narrative as seed content + reserved-subdomain gift |
| **Anti-Notion / pick-a-fight manifesto** | 5+ | Linear playbook is the most-copied launch pattern 2019-2026 |
| **Benchmark-as-flywheel (okbench)** | 5 | Aider pattern; the only "substrate-everyone-must-cite" move |
| **Named-agent attribution in git log** | 5 | CRDT + git + named agents is a unique primitive |
| **Empty-state-as-Wikipedia-stub** | 4 | Natural metaphor fit; low-cost; memorable |
| **Timeline scrubber / rewind-the-session** | 4 | S6 has this latent; branch-switching demo is viral |

See [`consolidation.md`](./consolidation.md) §B for full tier-2 (3-4 agents) and tier-3 (notable 2-agent) lists.

---

## 3. The curated top-20

*Selected by creative value × differentiation reinforcement × emotional resonance. **Not** by engineering cost. Minimum three per dimension (D1, D2, D3, D4, D5) so no dimension is starved. Ordering within dimensions is not a ranking.*

*Extended pitches with inspiration + demo + source attribution in [`consolidation.md`](./consolidation.md) §D. What follows is the concise version.*

### D1 — UX moat (presence, source toggle, permissions, embed)

**1. Cmd+Z the Agent.** The cleanest six-second clip we have. Press ⌘Z once and the agent's last paragraph rolls back. Press ⌘Z again and your sentence stays untouched. Press ⌘⇧Z and the agent's text comes back. The keyboard shortcut every dev has muscle memory for, doing the thing every dev has wanted to do at least once. Quote-tweet bait. **Demo:** "⌘Z just undid the AI. Not your last keystroke. The AI's last paragraph."

**2. Two Cursors, Both Editing.** The defining clip of the entire product. Top of frame: a Claude Code terminal session. Bottom of frame: the editor in the browser. The user types while Claude's named caret writes two paragraphs above. Both colors. No turn-taking, no flicker. The structural moat in a twenty-second loop. Nothing in the landscape has it; nothing else can fake it without rebuilding the storage layer. **Demo:** "Real-time co-editing where one of the cursors is Claude. Both writing. Both visible."

**3. Alt-Reveal — the one gesture the product is remembered for.** Hold the Option key over any rendered element — bold, heading, wiki-link chip, code span — and it transforms in place to its raw markdown source. Release: it's a chip again. Per-element mode-toggle via modifier key. If every user develops the muscle memory of "Alt to peek at markdown," the toggle becomes a verb the product owns. **Demo:** "Hold Alt. The rendered chip becomes raw markdown. Release. It's a chip again."

**4. The Gavel — one-click approve+merge+close.** A single animated gavel button on every agent proposal card. ⌘↩ approves every paragraph, merges the branch, attributes the commit, closes the review, triggers a satisfying *tap-tap*. Twelve proposals, twelve gavel taps, branch graph collapses into main in a ripple. The morning-coffee review as ASMR ceremony. Custody as craft. **Demo:** "Twelve proposals. One gavel. The branch graph collapses into main in a ripple."

**5. `/bring-me-there` — the verb that opens the editor inside your agent.** A single Claude Code slash command. The agent is mid-task, has just edited a page, types `/bring-me-there`. The OK editor panel slides in as a Claude Desktop side panel (or a Cursor inline-preview, or a VS Code webview), docked alongside the conversation. The page is already scrolled to the exact paragraph. Your cursor lands there. Agent keeps typing; you watch. The S9 differentiator as one verb. **Demo:** "Claude types `/bring-me-there`; a panel opens; the wiki scrolls to the paragraph; Claude's cursor is blinking there."

### D2 — warmth, mascot, identity, gamification

**6. Bramble — the pet KB you hatch on day zero.** `init` isn't a scaffold — it's a hatching. ASCII egg pulses in the terminal for ~8 seconds. A crack. Another. The egg opens. The CLI asks three questions: name, color, one trait (curious / steady / mischievous / quiet). The creature blinks: *"hi, i'm [name]. what should we remember first?"* Every evolution stage (Egg → Hatchling → Sprout → Fledgling → Companion → Sage → Ancient) locked to a real KB-maturity signal. Care is legible — well-tended → resting → dusty → dormant — but the creature **never dies and never guilts** (Finch discipline, not Duolingo). Animated by `Y.Map('activity')` so the creature is a live visualization of the unique-to-us substrate. **Demo:** "Init prints an ASCII egg. It hatches. You name the creature. The first article you write is its first meal."

**7. Quill — the archivist corvid who never speaks.** A small not-quite-raven, not-quite-magpie bird carrying a quill. Corvids collect shiny things, remember faces for years. Follows the Octocat rule: **never speaks**. Shows emotion through context — sleeping on a rolled scroll when idle, feathers ruffled at sync conflicts, holding a single feather when a new wiki-link is made. Metaphor-anchored (corvid = remember + collect = the product's promise). Ships with an Octodex-style variant gallery: Librarian Quill, Cartographer Quill, Cowboy Quill — community-PR'd. **Demo:** "You open the editor and Quill is perched on the corner of the sidebar, head tilted at the file you just created."

**8. The Inscription — membership card from init.** Last step of `init` renders a membership card to stdout — ASCII-bordered, 24-bit color. Library name (you chose it), Companion name (you chose it), Archetype, Established date, Member #, Library Sign. Saved as `.open-knowledge/membership.svg` + `.txt` (immutable). On every `start`, a condensed version in the banner. Recoverable via `open-knowledge whoami`. The artifact a user paste-screenshots into team Slack. Status dynamics: "I'm member #7341." **Demo:** "After init, you get a 1200×630 card with your number, your animal, and your KB name. Made to be pasted in Slack."

**9. The Empty-File-Tree Wikipedia Stub.** The empty state for a fresh KB isn't a button or tutorial overlay — it's a fake Wikipedia stub article. A small dithered globe. A single italic line: *"This knowledge base is a stub. You can help by expanding it."* Three pre-filled redlinks: `[[About this project]]`, `[[Things I keep forgetting]]`, `[[People I work with]]`. Click any to create. The Wikipedia visual joke is the unlock; the redlinks are real onboarding scaffolding. Pairs with the 404 page. **Demo:** "Empty KB greets you with a stub article about itself, and the redlinks make you laugh and start typing."

### D3 — 10-second aha, demo agent, seed content

**10. Olly — the demo agent that holds your seat.** A persistent scripted demo agent on init. The welcome doc opens with TWO cursors visible from frame 1: yours (real) and "Olly" (scripted). Olly types: *"← that's you, this is me, let's co-edit."* User can interrupt, paste, scroll — Olly gracefully yields whenever the user touches the doc. The yield IS the demo — proves co-editing isn't turn-based. Olly stays dormant, summonable via `@olly`. When real Claude connects, the editor explodes with confetti, Olly waves and dissolves: *"Welcome, Claude. Olly's been holding your seat."* **Resolves PROJECT.md pre-mortem risk #4 without shipping LLM inference.** **Demo:** "First run, two cursors are already in the welcome doc. One is yours. The other says hi."

**11. The Choreographed Hatch — 12-second cinematic on init.** `init` ends with a 12-second cinematic simultaneously in the terminal AND in the auto-opened editor. Terminal: ASCII mascot waddles in, says "watch this." Editor: a fake agent cursor materializes at the top of `welcome.md`, types — at human-imperfect cadence with backspaces — a personalized paragraph that names your repo, lists three real files it found, and ends with a redlink. **No LLM call.** Pure templated text + CRDT replay choreographer. Total time `bunx` → "whoa": ~25 seconds. **Demo:** "T+0 you type bunx; T+10 you're watching agent text stream in with attribution shading; T+12 you say whoa."

**12. The Haunted Wiki — seed that looks lived-in.** `init` seeds a wiki that looks *used*. 30+ pages. A `journal/` folder with daily notes from a fictional previous owner named Ada, spanning six months. Abandoned drafts. Broken links. A TODO with three open items. Old version-history with real edit patterns. Framing in `README.md`: *"This wiki belonged to Ada. She moved on. It's yours now — keep what's useful, delete the rest."* First user action is exploration, not creation. Blank-canvas problem vanishes. Dual flavors at install (`--seed haunted` / `--seed clean`) so cynics can opt out. **Demo:** "A wiki you didn't write, with months of edits, by Ada. It's haunted. You're its new owner."

**13. The Karpathy Welcome — lineage flex built into init.** A literal excerpted seed page from Karpathy's LLM Wiki gist, titled `On building a personal LLM wiki — Andrej Karpathy.md`, with a callout: *"This is the gist that inspired Open Knowledge. We seeded it as page 1 so you can see the lineage. Edit it freely; it's yours now."* Pairs with `open-knowledge import karpathy-llm-wiki` one-command import. Pairs with a parked `karpathy.openknowledge.dev` subdomain whose keys sit in his X DMs. Founder's voice is in your KB on day zero. **Demo:** "Init drops one page. It's the gist that inspired the product, dated 2024, signed Karpathy."

### D4 — teammate-share, multiplayer-adjacent, power-user advocacy

**14. OK Cards — trading-card meta-economy.** Every wiki page you create generates a trading card — JSON + PNG with page title, your KB name, your animal, a deterministic rarity tier (from page age + backlink count), a stat block (word count, agent edits accepted, redlinks resolved). Publicly viewable at `cards.openknowledge.dev/<hash>`. Embeddable in any markdown. Coworkers trade cards. Cards from famous KBs (Karpathy's, kepano's) become collector items. Same dynamics as `/buddy`'s 18 × 5 × 1%, but the unit of collection is real intellectual artifacts. **Demo:** "Every page becomes a tradeable card with a rarity tier. Collectors will swap them in DMs."

**15. `open-knowledge publish` → `<handle>.openknowledge.dev`.** A single CLI command takes the current branch's content and publishes to a static-rendered subdomain. Output is a Mintlify-quality site at `nick.openknowledge.dev`. Frontmatter `private: true` opts a doc out. Wiki-links resolve, backlinks render, graph view embedded as widget. The shareable URL IS the team-share moment — DM your teammate "look what I built with my agent overnight" and they see a real wiki, not a screenshot. Combine with **forkable wikis** (every page has a "Fork this" button → clones to GitHub → `open-knowledge import`). **Demo:** "Right-click → Publish. URL on clipboard. nick.openknowledge.dev is live in 4 seconds."

**16. The Permission Passport.** Click any agent's avatar anywhere in the product and a card slides in showing its permission passport: a travel-document-style spread listing docName scopes, route (propose-only / auto-merge / overwrite), a visible "signed by" line (the human who granted it), a revoke button. Not a settings pane — an *object*. Screenshot-worthy. Makes invisible permission state into a tangible artifact. **Demo:** "I opened claude-code-abc123's passport: stamped for `docs/*.md`, route `propose → review`, revocable in one click."

**17. okbench — the agent knowledge-maintenance benchmark.** Public benchmark on day 1 scoring frontier models on five tasks: (a) keep a wiki backlinked under churn, (b) merge a stale article cleanly, (c) answer a multi-hop question via wiki traversal vs. RAG, (d) propose a non-redundant new article, (e) maintain frontmatter consistency across 100 edits. Live leaderboard at `bench.openknowledge.dev`. Day-1: Sonnet 4.6 — 89%, GPT-5 — 71%, Codex — 68%. **Aider's mechanic** — every Claude/GPT/Gemini release becomes an okbench thread. We become the substrate everyone has to cite. Distribution mechanic disguised as a benchmark. **Demo:** "Every model release re-ignites the okbench thread. We're the yardstick."

### D5 — HN, X, Reddit, TikTok

**18. "Wikis aren't databases" — the Anti-Notion Manifesto.** Linear-archetype contrarian launch post. Picks a fight with Notion's proprietary block format, lossy markdown export, bundled-LLM-credits, and the impossibility of attributed agent writes. Quotable line: *"Notion stores your knowledge in a format only Notion can read. Open Knowledge stores it in markdown — the format every model already speaks."* Ship as a one-page manifesto microsite at `wikisarentdatabases.com`, Linear-aesthetic, no product screenshots. The product is one link at the bottom: `bunx @inkeep/open-knowledge`. **The manifesto IS the launch artifact.** **Demo:** "One page. Five hundred words. Black background. The product is the link at the bottom."

**19. openknowledge.dev/live — the 24/7 Claude-is-typing spectacle.** A permanent live demo: an actual Open Knowledge server with an actual Claude session running 24/7, building a public wiki about whatever Twitter is talking about that day. Cursor, edits, undo events, version history all visible to anonymous spectators. **Twitch for agent knowledge work.** No login, no install — just watch a Claude write a wiki. The demo Notion structurally cannot ship (no markdown, no attribution, no presence-for-agents). The demo Obsidian cannot ship (no multiplayer). The demo Mintlify cannot ship (read-only). Five-second comprehension on a phone, in a tweet, with no install. **Demo:** "Right now: a Claude session is editing a wiki about today's news. Tab away. Come back. Still happening."

**20. "I Typed Nothing" — the TikTok cold-open.** Vertical 9:16 silent-autoplay. Frame 1: blinking cursor, caption on screen: **"i typed nothing."** 0:01-0:12: text streams in by itself — "How OAuth works," with headings, code fences, a wiki-link `[[JWT]]`, a Mermaid diagram rendering live. Sticky bottom caption: **"my AI is writing my wiki rn."** 0:13: cut to file tree — three new files appeared (`oauth.md`, `jwt.md`, `pkce.md`). Caption: **"and it linked them."** 0:14: end frame with OK logo + `bunx open-knowledge`. Pair with **Cmd+Z the Agent** as the second drop, **WYSIWYG flip** as the third. **Demo:** "Blinking cursor. Caption: 'i typed nothing.' Then text appears."

---

## 4. Three candidate day-0 story spines

Three coherent launch experiences — each threading 8-11 shortlisted ideas in a distinct emotional register. **These are genuinely different launches.** Picking one is a strategic choice, not a packaging detail. (The consolidator notes that the three are not fully mutually exclusive and could compose — but I'm presenting them as alternatives here so the tonal trade-offs stay visible.)

### Spine 1 — Warm-Ceremony

*Tonal anchor: Tamagotchi + Arc + Animal Crossing + Octocat-rule. Emphasizes hatching, naming, membership-card, monthly letters from your KB.*

Threads: **Bramble hatching** → **Choreographed Hatch** cinematic → **Olly holding your seat** → **The Inscription** membership card → KB's monthly letter to the user → **OK Cards** collection visible at month 3 → **Empty-File-Tree Wikipedia Stub** as warm empty-state. Plus: animal migrating into presence bar when real Claude arrives; Quill sleeping on a scroll when idle.

**What lands:** legibility of care without shame; identity-through-artifact; the audience is invited into *a library with a history* on day 0. The largest single convergence cluster in the corpus (deterministic mascot — 10 agents) threads through here.

**Risks:** dev-tool audiences may smell theater if execution is off. Duolingo-adjacency has trust cost. Mitigation: Finch-no-punishment discipline; dual seed flavors (`--seed haunted` / `--seed clean`); Octocat rule (Bramble/Quill never speak, pantomime only).

**Best for:** knowledge-worker P0 users; Obsidian converts; the non-developer half of the audience; product audiences tuned to Arc, Superhuman, Notion onboarding.

### Spine 2 — Power-Tool-Pride

*Tonal anchor: Linear + Aider + Karpathy + kepano. Emphasizes ⌘Z-the-AI, branch-switch demo, okbench, HN front page, The Gavel.*

Threads: **Cmd+Z the Agent** (hero clip across every channel) → **Two Cursors, Both Editing** (defining moment) → **Alt-Reveal** (muscle-memory gesture) → **The Gavel** (morning-coffee ritual) → **`/bring-me-there`** (Claude Code verb) → **Permission Passport** (custody made tangible) → **okbench** (benchmark flywheel) → **"Wikis aren't databases" manifesto** → Nick's canonical first-person essay → **nick.openknowledge.dev** as the product's public homepage.

**What lands:** highest convergence-density in the entire corpus — six of the most-converged-upon ideas thread through this spine. The launch surfaces (HN + manifesto + benchmark + power-user advocacy) form a coherent four-headed launch. Status dynamics for the audience (Karpathy / kepano / Tobi / YC) skew strongly here.

**Risks:** feels narrow if mis-executed ("it's just a wiki with undo"). Lands harder for developers than for knowledge-workers. The "Zero LLM compute" story has to do real work in the manifesto or the "feels dumb" pre-mortem risk surfaces.

**Best for:** the Karpathy archetype; Claude Code / Cursor / HN crowd; YC-adjacent; dev-tool-launch-playbook audiences.

### Spine 3 — Wonder-and-Magic

*Tonal anchor: Panic + Playdate + Are.na + Karpathy. Emphasizes Haunted Wiki, two cursors as magic trick, openknowledge.dev/live, Ink Spirit / Quill.*

Threads: **Quill** corvid in the editor corner (Octodex-style variants from day 1) → **Haunted Wiki** (Ada's six months of inherited journal) → **Karpathy Welcome** (*"this is yours now"*) → **Two Cursors** as the magic trick → a "your bird is on an adventure" overnight-return → **openknowledge.dev/live** (24/7 ambient stream) → hidden `/celebrate` and `Cmd+Shift+1996` dithered mode → **"I Typed Nothing"** TikTok.

**What lands:** highest novelty per surface — none of these have been shipped by a competitor. Highest cross-tribe ceiling (TikTok + design Twitter + permaculture-adjacent communities reach beyond the dev tribe). Most likely to produce a permanent dent in brand identity if executed perfectly.

**Risks:** highest variance. Relies on aesthetic execution. "Wonder" that falls flat reads as try-hard. Haunted Wiki specifically could alienate skeptics who want clean install.

**Best for:** brand-building over conversion; earned-media plays; the audience that bought Playdate, Nothing Phone, Arc, or a Figma subscription.

**A note on picking:** the consolidator observes that the three spines are not mutually exclusive — **Spine 2 as primary register, Spine 1's hatching as the warm onboarding moment, and Spine 3's `openknowledge.dev/live` as the always-on attractor** would honor all three highest-density convergence clusters simultaneously. I'm flagging this but not recommending — the distinct spines stand on their own as alternatives.

---

## 5. Tagline candidates

*Twelve one-liners from the divergent set. No ordering imposed.*

1. **"Wikis aren't databases."** — anti-Notion, Linear-energy
2. **"Claude Code forgets. Open Knowledge remembers."** — anti-Claude-Code (friendly enemy)
3. **"You bring the agent. We bring the memory."** — embedding-pitch variant
4. **"Obsidian is perfect — if you never want a teammate."** — anti-Obsidian, defangs by loving
5. **"Mintlify taught agents to read. We taught them to write."** — anti-Mintlify
6. **"If `cat` can read it, no vendor can hold it hostage."** — anti-AFFiNE / pro-markdown
7. **"Not AI-powered. Agent-native. There's a difference, and the difference is who owns the model bill."** — HN / launch-page long form
8. **"Co-wiki-ing."** — the verb to coin (past tense `co-wiki'd`)
9. **"Knowledge tended, not just stored."** — the brand line for the warm register
10. **"obsidian-mind covers 70%. We are the 30% that matters."** — for the kepano-aware audience
11. **"Wikis fail because humans get bored. Agents don't."** — manifesto opener (Karpathy-adjacent)
12. **"This knowledge base is a stub. You can help by expanding it."** — Wikipedia-borrowed brand tic for empty states

---

## 6. Wild-card bank (15 out-of-scope-but-memorable provocations)

Preserved verbatim from [`consolidation.md`](./consolidation.md) §G. These didn't make the top-20 but deserve to survive the synthesis — they're the weirdest provocations the divergent process produced.

1. **The Inkwell** — physical USB-C/BLE LED desk lamp that glows cyan when an agent is in your doc (Ambient Orb for AI presence; 3D-printable case on day 0)
2. **Haptic co-presence** — Apple Watch / BLE wristband soft-taps per agent paragraph-burst
3. **The Agent Has a Face** — gaze-tracking eyes that follow your cursor (rigatoni-eyes.js inspiration)
4. **macOS `say` voice greeting on first run** — "Hi Nick. Your knowledge base is ready. Your fox is waiting in the browser."
5. **The Library's Coat of Arms** — full heraldic, generative, evolves with your tags
6. **Patron Saints** — pick a thinker who haunts your library (Borges / Vannevar Bush / Ada Lovelace / Audre Lorde)
7. **The Cohort** — your library has a graduating class ("the April 2026 Cohort")
8. **The Ossuary** — donate dead KBs to a public graveyard-as-library
9. **`open-knowledge dinner`** — weekly autonomous P2P agent potluck while you sleep; you wake to a digest
10. **Agent-pair-bonding** — two users' agents correspond autonomously for 30 days; output auto-published
11. **KB séance** — resurrect dead OSS projects as queryable wikis with backdated agent-attribution
12. **The Library Card** — physical kraft-card mailed at 30 days (Arc/Octocat-sticker tier)
13. **Dithered Mode** — `Cmd+Shift+1996` makes the whole editor a 1996 BBS; prose stays canonical
14. **Telnet wiki.ok.sh:23** — Open Knowledge in 80-column ANSI
15. **The Crank** — Cmd-K + trackpad scroll rewinds through shadow-repo timeline like VCR scrub

---

## 7. Do-not-use / dead-ends

From [`consolidation.md`](./consolidation.md) §H. Explicitly flagged because they fail the discipline or duplicate PROJECT.md-locked decisions.

**Fails the Octocat rule (mascot speaking unprompted):**
- Any mascot that talks in toasts, tooltips, or chat bubbles. Quill must pantomime; Bramble must show state visually; **the room narrates, the character never anthropomorphizes itself.**
- Tamagotchi creature must **never guilt or punish** (Finch discipline). "Your KB has been neglected for 7 days" fails the Duolingo-anxiety test.
- Contribution-grid visualization must **not** be streak-weighted with red-triangle-for-missed-days.

**Fails dev-audience credibility:**
- Physical-mail commitments at scale; public-graveyard-as-library as default (fine as wild-cards, risky as shortlist).
- Spotify-Wrapped-style anniversary notifications if push-notified or socially-leaderboarded. Octocat-rule and Finch-no-punishment must be policy, not aspiration.

**Already covered by PROJECT.md-locked decisions:**
- Per-origin undo, WYSIWYG toggle, MCP staging, markdown-canonical, OSS-no-telemetry. **Don't re-invent in design — invoke them in copy.**

**Risky framing pitfalls:**
- "Ask HN: please break our launch" — high variance, could die at 3 upvotes.
- 24-hour Claude-watching-itself stream — what if Claude writes 8 hours of garbage on stream? Logistical risk.
- Agent-authored testimonials page — prompt-injection risk; requires moderation queue.
- Compost / mushroom mascot for "rot" — "my notes are rotting" could be read as the product insulting the user's KB.

---

## 8. Open narrative questions — what's still genuinely unresolved

From worldmodel.md §10. Sharpened by the divergent process. Nick decides.

1. **Is v0 for the developer or the knowledge-worker, on day 0?** PROJECT.md says both. Codebase is dev-shaped. Docs landing copy is dev-shaped. The three spines above map differently to each persona. Pick the wedge or genuinely aim both.

2. **Mascot archetype choice.** Four precedent-backed options: (a) Octocat pattern (visual character that never speaks — **Quill** is the corpus's pick); (b) dialable-persona (Claude Code `/output-style`, no visual); (c) meme-native voice (Supabase-weird-co-worker, no character); (d) anti-mascot (Vercel/Linear — typography IS personality). Corpus converges on **Octocat-archetype with Quill**, but the decision is still yours. See also the 10-agent convergence on deterministic-species-per-user (any of Bramble / Quill / OK Cards honors this).

3. **Streak/pet/gamification stance.** Corpus is clear: **Finch-no-punishment discipline**, no shame, no streak-monetization, ambient-not-performative. Implement or not, but if yes — only this version.

4. **Launch format.** Supabase Launch Week? Bolt-style single-tweet? kepano-style solo-GitHub-repo? Arc-style invite-gated cinematic? Or combine (soft-launch via `open-knowledge-skills` repo kepano-style, then Launch Week for v0 formally)?

5. **The phrase we want Karpathy to coin.** Corpus candidate: **"co-wiki-ing."** Better candidates welcome. *Who* plausibly says it matters as much as the phrase.

6. **Prebuilt April 1 Easter-egg equivalent of `/buddy`.** Corpus converges heavily on a deterministic species/OK Cards system. Do we ship one? If so, on launch day or banked for April 1 2027 as a delightful surprise?

7. **Benchmark candidacy.** `okbench` / `co-edit-bench` converges in 5+ agents. Ship it with v0 (aider archetype) or hold for 3 months?

8. **The Obsidian-vault migration path.** Corpus repeatedly hits this ("Obsidian → Open Knowledge in 10 seconds" is a top-5 clip candidate). Is it scoped for v0 or deferred?

9. **What does `openknowledge.dev/live` actually stream?** If we ship Spine 3, we need an operational answer (who picks the topic? how do we handle garbage-generation? Claude's rate limits?).

10. **`nick.openknowledge.dev` — are you actually willing to be the face of this?** Corpus assumes yes (kepano archetype requires a visible single human). Worth confirming.

11. **Zero-LLM-compute messaging.** Pre-mortem risk #4 is the load-bearing framing problem. Day-0 design must resolve "bring your own agent = upgrade, not chore." The corpus resolves it primarily via **Olly** + **demo-agent-on-init**, but the messaging has to do work in tagline, manifesto, README. Who writes that language?

---

## 9. Meta

- **Convergence is signal, not verdict.** Ideas that hit 5+ agents are structurally sticky. But the divergent process was seeded with a shared worldmodel, so some convergence is inherited. Treat the heatmap as a prior, not a conclusion.
- **The 20 agents were instructed to be wild.** Not every wild-card is worth pursuing. The discipline is in the top-20 (passes the Octocat-rule / Finch-no-punishment / dev-audience-credibility / Clippy-avoidance tests) and the wild-card bank (preserves the weirdness without implying endorsement).
- **Three strategic trade-offs** worth naming explicitly:
  1. **Mascot vs. anti-mascot** (Quill/Bramble vs Vercel/Linear). The corpus favors mascot but both are defensible.
  2. **Warm vs. power-tool register.** Not incompatible, but the primary register has to be picked — readers recognize tone faster than they recognize features.
  3. **Benchmark/manifesto/live-stream vs. ship-and-see.** Distribution mechanics need ongoing operational ownership. Low-cost to ship, high-cost to maintain.
- **Downstream asks for Nick:** review this report + the three spines; pick one as primary register (or explicitly the blended approach the consolidator suggests); answer the 11 open questions above. Everything else below that is spec work.

---

## Appendix A — File tree of this research

```
reports/v0-day-zero-delight/
├── REPORT.md                           # this file (synthesis + top-20 + spines)
├── worldmodel.md                       # full shareable worldmodel (reusable)
├── consolidation.md                    # 17 clusters, tagged universe, extended pitches
├── evidence/
│   ├── viral-dev-tool-launches-2024-2026.md
│   ├── dev-tool-mascots-voice.md
│   ├── warm-cute-gamified-onboarding.md
│   └── oss-repo-positioning-scan.md
├── divergent-agents-raw/               # 20 files, ~4800 lines, ~400 raw ideas
│   ├── D1a-co-editing-presence.md
│   ├── D1b-source-toggle-magic.md
│   ├── D1c-permissioned-writes.md
│   ├── D1d-embeddable-editor.md
│   ├── D2a-mascot-character.md
│   ├── D2b-tamagotchi-pet-kb.md
│   ├── D2c-micro-interactions.md
│   ├── D2d-personalization-identity.md
│   ├── D3a-first-10-seconds.md
│   ├── D3b-seed-content.md
│   ├── D3c-demo-agent-on-init.md
│   ├── D4a-must-show-you.md
│   ├── D4b-multiplayer-adjacent.md
│   ├── D4c-power-user-advocacy.md
│   ├── D5a-hn-front-page.md
│   ├── D5b-x-viral-clip.md
│   ├── D5c-reddit-launches.md
│   ├── D5d-tiktok-silent.md
│   ├── X1-competitor-inversion.md
│   └── X2-reference-mashup.md
└── meta/
    └── RUN.md                          # methodology log
```

## Appendix B — Coined terms worth preserving

Divergent agents coined terms that should carry forward into any spec work:

- **Quill, Muninn, Bramble, Olly, Ink Spirit** — mascot/character names
- **OK Cards** — trading-card meta-economy
- **`.okclip` / `.okreplay`** — CRDT-replay share-artifact formats
- **okbench / co-edit-bench** — benchmark-as-flywheel
- **`/bring-me-there`** — the S9 verb
- **`okwiki://`** — deep-link protocol for editor panels inside agents
- **The Gavel, The Inscription, The Permission Passport** — first-class UI objects
- **Alt-Reveal** — the toggle gesture
- **`open-knowledge-skills`** — the kepano-archetype launch repo
- **co-wiki-ing** — the phrase to seed (candidate)
- **Haunted Wiki** — the Ada-seeded install flavor
- **openknowledge.dev/live** — the 24/7 spectacle subdomain
- **wikisarentdatabases.com** — the manifesto microsite URL
