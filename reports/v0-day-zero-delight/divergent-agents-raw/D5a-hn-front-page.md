# D5a — HN Front Page Launch (Divergent Raw)

**Lens.** Hacker News is the canonical dev-tool launch channel. Title craft matters (digits / version / time-boxed claims perform best per ASOF Show HN survival study). Post Tuesday 8-10am PT. Need 8-10 upvotes + 2-3 comments in first 30 minutes to clear the new-page filter. Trust artifacts (license, telemetry stance, single-author mythology, working demo URL on first paint) carry the second hour.

This is unbounded ideation. Mix titles, post structures, comment-prompts, README pitches. 2 wild cards at the bottom.

---

## SHOW HN TITLE CANDIDATES

### 1. "Show HN: Obsidian, but agents can edit it (CRDT, MCP, zero LLM compute)"
The six-word product description from PROJECT.md, weaponized for HN's parenthetical-payload convention. The parenthetical is three trust artifacts: CRDT (we did the hard thing), MCP (we did the standard thing), zero LLM compute (we picked the side HN respects). Beat-for-beat the same shape as "Show HN: Warp: Fast, Rust-based terminal."

### 2. "Show HN: We open-sourced the agent-native wiki we built for Inkeep"
The YC-adjacent narrative. Inkeep has been building customer-support knowledge infra; this was internal; it's now MIT. Tracks the kepano archetype (CEO of X teaches AI X) without needing kepano-level following. The "we built this for ourselves" frame answers "is this real?" before the click.

### 3. "Show HN: Claude can edit my Obsidian vault now and I can watch the cursor"
First-person, specific, **the cursor as the noun**. The cursor is the demo. HN's audience already knows what an Obsidian vault is and what Claude is — the only new word is "watch." This title is weaponized envy. 30 chars under the limit; leaves room for the GIF in the OG image to do the rest of the work.

### 4. "Show HN: Local-first wiki where humans and Claude co-edit in real time"
The 14th whitespace claim verbatim. "Co-edit in real time" is the unique combination — every word in the title closes a competitor (local-first kills Notion; wiki kills Linear-docs; co-edit kills Obsidian; in-real-time kills Mintlify; Claude kills the read-only-MCP crowd).

### 5. "Show HN: I replaced 47 SKILL.md files with one MCP server"
Solo-author voice, specific number, picks a fight with the kepano-skills cottage industry. Replaces the abstract "we built a wiki" with "I had a problem you have, here's what I did." Implicit benchmark: count your own SKILL.md files; you'll lose.

### 6. "Show HN: Open Knowledge — the wiki Karpathy described in his LLM gist"
Lineage hijack. Karpathy's "I built a wiki for my LLMs" gist is a known artifact. Naming it puts us in his lineage without him having to say anything. Risk: Karpathy could publicly disclaim. Reward: if even one person from his orbit shares it, it's instant 200 points.

### 7. "Show HN: A markdown wiki where every edit shows you who did it (human, agent, which agent)"
The attribution pitch. Three-clause crescendo. The parenthetical does the differentiation. This title alone makes the Notion-MCP "agents appear as authenticated user" failure visible to anyone who's tried it.

### 8. "Show HN: open-knowledge — bunx, 30 seconds, your first Claude-authored wiki edit"
The aider/Bolt template — install command + time-box + outcome. Three concrete things; zero adjectives. Bun gets bonus credibility on HN right now (npx 10x slower benchmark posts have been frontpage twice in 2025).

### 9. "Show HN: Notion costs $10 per 1,000 agent credits. Ours costs $0."
The price-anchor pitch. Linear-style contrarian first sentence. The Notion AI tax is a known-felt pain on HN — they shipped that pricing in 2024 and the rage thread is still cited. We benefit from their unpopularity even if we never name them.

### 10. "Show HN: The MCP server I wish Notion had — staging, attribution, per-agent undo"
Frame as the canonical thing. Everyone who's tried Notion's MCP knows exactly what's missing. Title is the wishlist. Three nouns are three differentiators (PQ9 staging, S5 attribution, S5 per-origin undo).

### 11. "Show HN: We built CRDT presence for human+AI editing because we couldn't find one"
The "we did the work" pitch. Fights "you should've used Y.js" by saying "we did, here's what we figured out." Reads as the post that links to a CRDT-observer-bridge engineering deep-dive. Comment-bait built in.

### 12. "Show HN: open-knowledge v0.1 — markdown wiki, agents are first-class, runs locally"
The boring credible version. v0.1 number signals honesty (HN distrusts v1.0 pre-launch claims). Three concrete attributes. The opposite of #3 — no envy, just facts. Backup title if leadership wants conservative.

---

## OPINIONATED MANIFESTO POSTS (BLOG → HN ORGANIC)

### 13. "Wikis fail because humans get bored. Agents don't."
The Linear-archetype contrarian opener. One sentence picks a fight with every wiki ever written (Confluence corpses, Notion-spaces-no-one-updates, README-rot). Second paragraph: "we tried for ten years to make humans care about wiki hygiene; we failed; we're trying the other side of the equation." Rest of post = product. End-of-post ASK: *"what's the wiki you abandoned, and why?"* — primes high-engagement comment thread of war stories.

**Headline test:** put just the title on a black background, post to X, see if it goes viral solo. If yes, the post will land HN by Wednesday morning organically. If no, post Show HN with the manifesto as the body.

### 14. "Zero LLM compute: why we refused to bundle AI into our wiki"
The trust-artifact manifesto. HN respects products that don't ship the obvious revenue lever. Riffs the Mozilla / DuckDuckGo / Sourcegraph anti-bundling tradition. The post writes itself: "every other AI-enabled wiki bundles compute and charges per credit. We don't, because [philosophy]. Here's the architecture diagram." Architecture diagram = the agent-agnostic substrate. End with: *"if you want to bring your own model, here's the MCP."*

### 15. "The case against Notion-as-workspace"
Long-form anti-incumbent. Notion's "everything-in-one-app" promise was the right call in 2018; it's the wrong call in 2026 because (a) lossy markdown export = vendor lock-in is *increasing* in the AI era, (b) bundled compute is a tax not a feature, (c) co-editing with agents needs primitives Notion's block model can't represent. Doesn't mention Open Knowledge until the last paragraph.

### 16. "Obsidian was perfect — until I needed a second person"
Personal-essay form. Single-author voice. Loving tribute to Obsidian (defuses tribal pushback) → the moment it broke (real moment from a real teammate ask) → the architectural reason it can't be fixed (closed-source, single-player philosophy, 2020 feature-request thread linked) → what we built. Comments will fork between Obsidian defenders and Obsidian-frustrated; both keep the thread alive.

---

## TECHNICAL DEEP-DIVE LAUNCHES

### 17. "How we built real-time human+AI co-editing on top of Y.js"
War story. The CRDT-observer-bridge architecture is genuinely novel (precedent #11 in CLAUDE.md — three patterns unclaimed in academic literature as of 2026-04-13). Walks through: Y.XmlFragment ↔ Y.Text dual representation, the typing-defer pattern, origin-aware reconciliation, the y-prosemirror patch that prevents silent multi-peer data loss. Embed live demo URL at the top. End with: *"our REPORT documents three CRDT patterns we couldn't find in the literature — if you've seen them elsewhere, please tell us so we can update."* (= academically humble + comment-bait.)

### 18. "Why we patched y-prosemirror in production (and why you might need to)"
Niche technical post that hits HN via r/programming overflow. The y-prosemirror destructive-delete-on-schema-throw bug is real, documented, and affects every Y.js + ProseMirror user. We have the patch. The post = "here's the bug, here's the patch, here's the five-line repro, here's what we learned about CRDT permanence." Post lands as a contribution to the ecosystem; product is the EXAMPLE not the SUBJECT. Trust artifact via demonstrated competence.

### 19. "We coined a new architectural pattern: 'origin laundering' in CRDT bridges"
The "we named it" play. Karpathy / vibe-coding archetype: you don't go viral by being the product, you go viral by minting the term that becomes the product's category. Reports/crdt-origin-laundering-prior-art/REPORT.md already exists. Frame the report as a paper, post to HN as "we wrote a paper on a CRDT pattern we couldn't find named anywhere." Lineage: this is how aider's polyglot-benchmark became canonical.

---

## CASE STUDY / NARRATIVE LAUNCHES

### 20. "We replaced our internal Notion with this over a weekend"
First-person Inkeep-internal case study. Numbers: how many docs migrated, how many agent edits in the first week, what broke, what didn't. Specific war stories ("the search-results page Claude wrote on a Tuesday afternoon while I was at lunch"). Ends with the OSS announcement as a P.S. Reads as a "we tried this" not a "we built this" — different posture, lower defensive triggering.

### 21. "After 18 months of building MCP integrations and watching them die in read-only-land, we built a wiki"
The journey post. Inkeep has shipped MCP integrations into Notion / Confluence / Linear / Slack / GitHub. We watched all of them be hobbled by the read-only ceiling or the no-attribution problem. So we built the substrate that doesn't have those ceilings. Authority: we've been in this trench for 18 months. Differentiator: we picked the side everyone else avoided (canonical markdown + write semantics + attribution).

---

## COMMENT-PROMPT STARTERS (drop these as the first reply to your own Show HN to seed the thread)

### 22. The controversy-bait
> "Hot take: every wiki tool that requires bundled LLM compute will be irrelevant by 2027. Change my mind."

### 23. The specific ask
> "If you've migrated off Obsidian, what was the surface that made you finally do it? Trying to sequence what to ship next."

### 24. The technical-credibility deposit
> "AMA on the CRDT bridge architecture — happy to walk through how we handle origin-aware diffs without per-character attribution."

### 25. The competitor-acknowledgment (defuses pile-on)
> "Things this is NOT trying to be: a Notion replacement (we don't do databases or project management); an Obsidian killer (Obsidian is great for solo devs and we love it); a publishing engine (use Mintlify). This is for the wiki you and your agent edit together."

### 26. The trust-artifact deposit
> "License: MIT. No telemetry. No sign-in. No cloud. Run it on a plane. The MCP key is generated locally and never leaves your machine. If we ever change this, fork the v0.x branch."

---

## README-AS-PITCH ELEMENTS (the README is the second click after HN — it has to land too)

- **Hero GIF, 8 seconds:** human types in WYSIWYG → cursor appears with "Claude" label → claude types in source-mode pane below → both panes converge → presence avatar pulses. No voiceover. No annotations. The cursor is the protagonist.
- **First sentence:** "Open Knowledge is a markdown wiki where you and your AI agents edit the same files at the same time."
- **Second sentence:** "Local-first. MIT. Zero LLM compute. Works with Claude Code, Cursor, Codex, or any MCP client."
- **One-line install:** `bunx @inkeep/open-knowledge` — no arguments, no flags, just runs.
- **30-second demo path right under install:** "1. Run the command. 2. Open localhost:3000. 3. Type `/connect` in Claude Code. 4. Ask Claude to write something. 5. Watch."

---

## OG IMAGE / SCREENSHOT THAT GOES IN THE POST

The single screenshot in the Show HN body should be the **split-pane editor mid-edit** — left pane WYSIWYG with a paragraph being typed, right pane source markdown with a different cursor on a different line, both panes labeled with presence avatars (human animal icon left, Claude circle right), agent-attribution shading visible on a previous paragraph. One frame conveys: dual representation, real-time presence, attribution, source-toggle, MCP-driven agent. Five differentiators in one image.

---

## WILD CARDS

### W1. "Ask HN: We're launching at 8am PT — please break it"
Subvert the Show HN format with an Ask HN. Honest, vulnerable, operationally interesting. Pre-announce on X: "tomorrow 8am PT we're going to post 'Ask HN: please break our launch' — be there to break it." The thread becomes a live debug session: bug reports + screenshots + fixes pushed in real-time + commit URLs replied inline. By noon the thread is a live changelog. The product becomes the meta-demo: "this is what it looks like to debug with the community in real time, exactly like our product lets you debug knowledge with agents in real time." Inception-grade. Highest variance idea here. Could be top-of-front-page for 18 hours or could die at 3 upvotes.

### W2. "We trained no models. We wrote no AI features. We made a wiki. It works with every agent."
The anti-AI-launch launch. April 14 2026, peak AI-feature fatigue. Every Show HN this week is "we built X with agents." We post the inverse: "we did not train a model; we did not bundle AI; we did not do RAG; we built a wiki and exposed an MCP." The negative space is the differentiator. Title-only post body. The README is the pitch. HN respects restraint when everyone else is shouting. Risk: too cute, too cryptic, doesn't convert. Reward: the post that quietly hits 800 points because every commenter has to explain to the next commenter what it is.

### W3. "Show HN: A wiki that watches your `git checkout` and has the right answer waiting"
Lead with the **branch switch UX** as the wedge. Nobody has shipped this. The HEAD watcher + CRDT branch park/restore protocol in our server is genuinely novel — switch git branches and your wiki state switches with it, including in-flight agent drafts. The demo is 6 seconds: type something, `git checkout other-branch`, the wiki content swaps + your draft is preserved + when you switch back it merges. This is invisible until you see it; once you've seen it you can't unsee it. The branch-switch demo is a viral GIF candidate that's *technically* shocking — "wait, how did it know?" Lineage: the same "absence of action" archetype as Karpathy's voice + Cursor demo.

---

## DAY-OF EXECUTION CHECKLIST (operational, not creative — but it's the difference between front page and obscurity)

1. Tuesday 8:00 AM PT post (highest survival per ASOF). Not Monday (post-weekend backlog), not Wednesday+ (less front-page real estate per dwell).
2. The first 30 minutes need 8-10 upvotes + 2-3 substantive comments. Pre-line up: 5 colleagues with HN accounts >1 year old who genuinely will use it (NOT vote-ring; HN detects this and slugs you).
3. The author replies to the FIRST comment within 90 seconds — every time, all day. Author-engagement is a scoring signal.
4. Trust artifact in the first reply: "no telemetry, MIT, here's the source, here's the lockfile if you want to audit deps."
5. The OG image is the split-pane editor mid-edit (above). Test it in Twitter card preview, Slack unfurl, Discord embed, before posting.
6. The README's first paint must work without git clone — the hero GIF embed has to load on the README page itself, not require a click.
7. If the post survives the first 90 minutes: post the technical deep-dive (#17 or #18) as the SECOND HN post on Friday. Don't do both same week unless first one stalls.
