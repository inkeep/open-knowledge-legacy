# X1 — Competitor-Inversion Divergent Ideation

> **Lens.** For each major competitor, enumerate strengths, then invert. What's the opposite product? What does Open Knowledge look like when it leans hard into being the anti-version? What fight do we pick?
>
> **Output stance.** Wild, unfiltered, Linear-manifesto-energy. Not all of these will survive triage — the point is to widen the surface.
> **Date.** 2026-04-14.

---

## Quick reference: inversion seeds

| Competitor | Their core identity | The opposite |
|---|---|---|
| Notion | Bundled databases + AI + polish + blocks | Plain markdown, raw devtool, BYO-agent, prose, zero compute |
| Obsidian | Solo single-player vault + 2,736 plugins | Multiplayer-by-default + zero plugins (batteries included + agents-as-plugins) |
| Logseq | Outliner + blocks | Prose + WYSIWYG + flat documents |
| Mintlify | Read-only docs publishing | Read-write knowledge editing — agents WRITE, not READ |
| AFFiNE | "Hyper-Fused" everything-engine binary CRDT | Focused, markdown-canonical, shipped not roadmapped |
| obsidian-mind | Pure-conventions-on-top, zero code | The substrate the conventions can't deliver — presence, embedding, permissioned writes |
| Claude Code | Ephemeral terminal sessions | Persistent knowledge that survives session death |
| Copilot | Inline single-author code suggestions | Block-level multi-author prose with visible presence |

---

## Ideas 1–20

### 1. Anti-Notion Manifesto: "Wikis aren't databases."

Notion's deepest moat is the relational database with six view types. Invert: a wiki is **prose linked by other prose**. No tables-as-database. No properties. No formulas. No filters. Just markdown files, links, and people (human + AI) typing into them. The radical move is to strip *more* than Notion stripped from the original wiki idea. Sell the absence: "We removed the database. What's left is a knowledge base."

**Tagline candidates:**
- "Wikis aren't databases."
- "Notion confused 'organize your team' with 'build a CRM out of pages.' We didn't."
- "We will never ship a database view. That's a feature."

### 2. Anti-Notion Pricing: "Zero credits. Forever."

Notion's economic engine is bundled AI compute at $10/1K agent credits. Invert: **Open Knowledge will never sell tokens.** The product's price for AI is exactly zero — you bring a Claude subscription, a Cursor subscription, a Codex subscription, an Ollama install, whatever. We are the only player who structurally cannot turn into an LLM rent-collector, because we have no inference at all.

**Pick a fight:** "Every other knowledge tool is now a margin business on top of OpenAI. Every prompt you write pays them twice. We refuse to be that."

### 3. Anti-Obsidian: "Built for the teammate Obsidian doesn't believe in."

Obsidian's tagline is literally "A second brain, **for you, forever.**" The 2020 collaboration request is the highest-voted unaddressed issue in the repo — six years of "no." Invert by name: "**Open Knowledge is the second brain for two.**" Or three. Or the agent that joined while you slept.

**Tagline candidates:**
- "Obsidian is perfect — if you never want a teammate."
- "Obsidian said 'no' to multiplayer for six years. We said 'yes' on day one."
- "A second brain — but you can lend it out."

### 4. Anti-Obsidian Plugins: "Zero plugins. Batteries included. Agents are the plugins."

Obsidian's other moat: 2,736 community plugins. Invert: **the plugin model is the bug.** Wiki-links, backlinks, graph view, source toggle, auto-persistence, attribution, branching, real-time presence — all in core. Whatever isn't in core, an MCP-connected agent does for you instead of a JS plugin you have to trust.

**Tagline:** "Obsidian has 2,736 plugins. We have one MCP server. The agent IS the plugin."

### 5. Anti-Mintlify: "Mintlify taught agents to read. We taught them to write."

Mintlify's MCP surface is read-only — 2 tools, both fetch. Invert: writing is the entire product. Agents draft, propose, restructure, refactor, link. Humans review and merge. Read is the boring half of the loop.

**Tagline candidates:**
- "Mintlify ships docs. We ship a wiki agents can edit."
- "Read-only knowledge is a museum. We built the workshop."
- "Mintlify made your docs MCP-readable. We made them MCP-writable."

### 6. Anti-Mintlify Polish: "Scruffy. On purpose."

Mintlify is a publisher: clean theme, polished cards, a navbar that converts. Invert by **deliberately not being a publisher.** The product is the editing surface, not the publish target. No themes, no SEO, no "design your docs site." If you want polish you ship to Mintlify or your own Next.js — Open Knowledge's job is to be the workshop where the polished thing was authored.

**Pick a fight:** "Other tools want to be your published docs. We want to be the place you write them. There's a difference."

### 7. Anti-AFFiNE: "Markdown is the format. Always. Forever. No exceptions."

AFFiNE bets on BlockSuite + binary CRDT (y-octo) — beautiful engineering, total portability disaster (you can't grep your own knowledge). Invert: **every byte the user wrote is a byte they can `cat`.** The CRDT is invisible scaffolding around `.md` files, never the canonical store. This is the inversion of inversion: AFFiNE chose the technically ambitious answer; we chose the answer the user can read with `vim`.

**Tagline:**
- "AFFiNE built a CRDT. We built a markdown wiki that happens to use one."
- "Your knowledge is `.md` files. The CRDT is our problem."
- "If `cat` can read it, no vendor can hold it hostage."

### 8. Anti-AFFiNE Scope: "Focused, not fused."

AFFiNE markets a "Hyper Fused Platform" — docs + whiteboards + database + AI + email + everything. Invert: ruthless focus. **One thing — a markdown wiki where humans and agents co-edit.** No whiteboard. No kanban. No table view. No email. No Notion-replacement attempt.

**Tagline:** "AFFiNE wants to be every app. We want to be one app you'll actually open tomorrow."

### 9. Anti-obsidian-mind: "Conventions are the wallpaper. We're the building."

obsidian-mind (1.3K stars in 95 days, zero application code) is pure conventions on top of Obsidian + Claude Code. Invert: **the substrate IS the value-add.** Real-time presence the conventions can't fake. Embeddable editor the conventions can't render. Permissioned writes the conventions can't enforce. Per-origin undo the conventions can't reach. The pitch isn't "conventions are wrong" — it's "conventions get you to 70%, and we're the missing 30% the market keeps trying to brute-force with markdown discipline."

**Tagline candidates:**
- "obsidian-mind covers 70%. We are the 30% that matters."
- "Conventions can teach an agent. They can't show you the agent typing."
- "Pure conventions hit a ceiling at 'the agent and I are in the same file at the same time.' That's where we begin."

### 10. Anti-Claude-Code: "Claude Code forgets. Open Knowledge remembers."

Claude Code's defining limitation: every session starts cold. Inversion is the cleanest one in the deck — Open Knowledge is **persistent collaborator memory that survives the `/clear`.** You bring the agent's IQ. We bring its long-term memory.

**Tagline candidates:**
- "Claude Code forgets. Open Knowledge remembers."
- "You bring the agent. We bring the memory."
- "Sessions die. Knowledge accrues."
- "The next agent you spin up already knows what the last one learned. That's the entire pitch."

This is also the cleanest **embedding pitch:** the product literally opens *inside* Claude Code. The opposition isn't "instead of" — it's "the part that survives when Claude Code ends."

### 11. Anti-Copilot: "Block-level co-authorship with visible presence."

Copilot is single-author, ghost-text, ephemeral, code-only. Invert all four:
- **Multi-author** — both writers visible at once
- **Cursor-and-presence** instead of ghost text — you SEE who's writing
- **Persistent** — every keystroke is a tracked CRDT op
- **Prose, not code** — for knowledge work, not autocomplete

**Tagline:** "Copilot writes for you. Open Knowledge writes WITH you. Different game."

### 12. Anti-Logseq: "Prose, not bullets."

Logseq's outliner moat. Invert: prose is how humans actually think when documenting decisions, narratives, explanations. Forced bullet-everything fragments long-form reasoning into staccato. **Open Knowledge is for documents that have paragraphs.**

**Tagline:** "Logseq makes everything a bullet. Some ideas need paragraphs."

### 13. Pick the Big Fight: Notion as the named villain

Linear's brand was built on a public anti-Jira manifesto. We have a similar opening with Notion. Their architecture choice (proprietary blocks, lossy markdown export, bundled credits, MCP-without-attribution) is the structural lock that prevents agent-native primitives — and that's exactly the gap we're built into. Naming Notion turns a wishy-washy "knowledge base" pitch into a tribal one: **the people who already know Notion is wrong for AI-native teams now have a flag to rally under.**

**Manifesto opener candidates:**
- "Notion was built for teams of humans. We built one for teams of humans and agents."
- "Notion's database is the thing that broke wikis. The wiki is back."
- "Every Notion 'AI feature' is a Notion margin product. We don't sell intelligence. We sell the surface intelligence works on."

### 14. Pick the Smaller Fight: Mintlify as the friendly enemy

Mintlify is the right enemy for the agent-era story specifically. They're loud about agents, but they capped themselves at read-only. We agree with their framing of "agents need first-class surfaces" — and we extend the conclusion they refused to extend. The fight isn't bitter; it's "you were right, and you stopped one step short."

**Tagline:** "Mintlify is right that agents need their own surfaces. They're wrong that those surfaces should be read-only."

### 15. Pick the Quiet Fight: every "AI knowledge base" startup

Every YC batch ships another "AI-powered knowledge base" — some flavor of "upload your docs, get a chatbot." Invert that entire category by being **AI-agnostic instead of AI-powered.** We don't have an AI. We have a place where YOUR AI works. The category we're founding isn't "AI-powered KB," it's "agent-native KB."

**Tagline:** "Not AI-powered. Agent-native. There's a difference, and the difference is who owns the model bill."

### 16. Anti-positioning: "We are the boring substrate."

Linear leaned into design. tldraw leans into delight. Notion leans into bundled-everything. Invert by being **deliberately uninteresting at the surface, deeply useful at the substrate.** "The dumb excellent substrate" (PROJECT.md's own phrase) becomes the pitch. The product's voice is competent and quiet, like Postgres. The interesting things happen because of what we *don't* do.

**Tagline:** "Open Knowledge is boring. Your agent doing your bookkeeping at 2am is the interesting part."

### 17. Anti-onboarding: "No tutorial. The agent is the tutorial."

Most products invest in a guided onboarding flow — Arc's color picker, Superhuman's concierge call, Notion's template gallery. Invert: **the agent IS your onboarding.** First-run hands the user a blank doc and a pre-formatted prompt to paste into Claude Code: "I just installed Open Knowledge — bootstrap a wiki from this codebase." Your first three minutes ARE collaboration. There is no separate tutorial because the product is the tutorial.

**Tagline:** "We don't onboard you. Your agent does."

### 18. Anti-mascot: "The agent IS the character."

Octocat, Slonik, Mona, Ducky — every dev brand is reaching for a face. Invert: **don't ship a mascot. Let the user's chosen agent be the personality.** Claude has a Claude vibe. Cursor has a Cursor vibe. We don't compete with that — we frame it. The presence-bar avatars (animals for humans, Claude icon for Claude) are already doing this. Lean further: when an agent connects, the product literally adopts that agent's tone in toasts ("Claude joined." / "Codex joined." — different voice each).

**Tagline:** "Other tools have a mascot. Ours is whichever agent you brought."

### 19. Anti-feature-list: "Markdown files. Git. MCP. That's it."

Most launch announcements list 30 features. Invert: the launch page lists THREE. Markdown files. Git history. MCP tool. Everything else is a consequence of those three. Polish, presence, undo, branching — they're not features, they're what those three primitives produce when combined honestly.

**Pick a fight:** "Other launches list features. We list primitives. The features are emergent."

### 20. Anti-PLG: "We don't want your email."

Most OSS-with-cloud plays gate something behind a signup. Invert: **no signup, no telemetry, no email capture, no waitlist, no `--login` step.** `bunx @inkeep/open-knowledge init` works the moment you type it, exactly as it does today, and the README brags about it. The growth mechanism is the agent itself — when an agent on a teammate's machine connects to the local server, the teammate sees the agent's name in the presence bar. Distribution-by-collaboration, not distribution-by-funnel.

**Tagline:** "No signup. No telemetry. No 'click here to get started.' Just type one command."

---

## WILD CARDS

### W1. The Linear-Manifesto Microsite

Build a one-page manifesto site at `wikisarentdatabases.com` (or similar), Linear-aesthetic, that picks the fight openly. Sections: "What we believe," "What we don't believe," "The list of things you won't find in Open Knowledge," "Why every other AI knowledge tool charges you twice." Five hundred words. No product screenshots — manifesto only. The actual product is one link at the bottom: `bunx @inkeep/open-knowledge`. **The manifesto is the launch artifact.** The repo README quotes it.

This is the highest-leverage move in the deck. Linear's anti-Jira manifesto is *the reason* a generation of teams considered switching. We have the same opening because Notion-with-AI is provoking the same backlash among the AI-native cohort that Jira provoked among modern eng teams in 2019.

### W2. The "Bring-Your-Own-Brain Bench" — a public benchmark of agents on OK

Mem0, Zep, Letta, ByteRover all publish memory benchmarks (LoCoMo, LongMemEval-S). What if **Open Knowledge published a benchmark of how well agents collaboratively edit knowledge** — a `co-edit-bench` — running every major coding agent (Claude Code, Cursor, Codex, Cline, Aider, Continue) against a set of wiki-construction tasks, scored on link-density, attribution accuracy, undo-respect, and merge cleanliness? **The product becomes the testbed for agent quality.** Every model launch creates inbound press for us, because agent vendors want a top spot on `co-edit-bench`. The board sits at `openknowledge.dev/bench`.

This inverts the entire AI-knowledge-tool space: instead of us picking a model and bundling it, we become the kingmaker who measures all of them. Mintlify can't do this because they're locked to Sonnet. Notion can't because they sell credits. Only the player with zero LLM dependency can run a fair bench — and that's structurally only us.

### W3. "Wiki-By-Wire" — agent typing into a livestream

The single most viscerally shareable thing about Open Knowledge is that you can **watch an agent type into a knowledge base in real time, with cursor and attribution visible.** Wild card: a permanent live demo at `openknowledge.dev/live` — an actual Open Knowledge server with an actual Claude session running 24/7, building a public wiki about whatever Twitter is talking about that day, with the agent's cursor, edits, undo events, and version history all visible to anonymous spectators. **Twitch for agent knowledge work.** No login, no install, just watch a Claude write a wiki in front of you.

This is the demo Notion structurally cannot ship (no markdown, no attribution, no presence-for-agents). It's the demo Obsidian structurally cannot ship (no multiplayer). It's the demo Mintlify structurally cannot ship (read-only). And it makes the abstract "real-time human+AI co-editing" pitch into something a person can SEE in five seconds on a phone, in a tweet, with no install. The conversion ratio of "saw the livestream → typed `bunx`" is the bet.

---

## Inversion summary — taglines worth A/B testing

In rough order of "would I share this on Twitter":

1. "Claude Code forgets. Open Knowledge remembers." (#10)
2. "Wikis aren't databases." (#1)
3. "Obsidian is perfect — if you never want a teammate." (#3)
4. "obsidian-mind covers 70%. We are the 30% that matters." (#9)
5. "Mintlify taught agents to read. We taught them to write." (#5)
6. "You bring the agent. We bring the memory." (#10)
7. "If `cat` can read it, no vendor can hold it hostage." (#7)
8. "Not AI-powered. Agent-native." (#15)
9. "We don't onboard you. Your agent does." (#17)
10. "Other tools have a mascot. Ours is whichever agent you brought." (#18)
