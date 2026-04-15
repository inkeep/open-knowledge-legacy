# D4c — Power-User Advocacy Mechanic

> **Lens.** How do we become the tool Karpathy / kepano / Garry Tan / Tobi Lutke / Simon Willison publicly endorse on day 0? Outsider-naming-it + insider-teaching-AI archetypes. UNBOUNDED divergence; consumer ranks later.
>
> **Date.** 2026-04-14. Worldmodel anchor: §2 (Karpathy-ified developer persona), §3 (kepano/obsidian-skills 21K stars, aider solo mythology), §8 (counter-position the obsidian-mind 70% threat by being "yes-and-format-compatible"), §10 Q4/Q5/Q11 (voice/mascot still open).

---

## The 18 ideas

### 1. Ship `open-knowledge-skills` repo on day 0 — the kepano move, but pre-emptive

A separate public repo at `inkeep/open-knowledge-skills` lands the same hour as the npm publish. Five SKILL.md files mirror kepano's exact structure: `wiki-links.md`, `frontmatter.md`, `catalog-walk.md`, `mcp-tools.md`, `branching-and-prs.md`. MIT licensed. `npx skills add open-knowledge-skills` works. The narrative hook: **"The kepano pattern, but the team that built the substrate published the skills the same day, so your agent literally cannot be wrong about our format."** Counter-pressure on Obsidian: kepano had to teach Claude Obsidian's dialect *retroactively*; we ship our dialect with the skills already taught. Skills repo gets its own README that reads as a love-letter to kepano + a structural acknowledgment.

### 2. The Karpathy seed page — `welcome-from-the-llm-wiki.md`

Init scaffolds a single seed document titled exactly "Welcome — this product exists because of an Andrej Karpathy gist." Contents: faithful paraphrase of the LLM Wiki gist's three principles, a `[[Karpathy LLM Wiki]]` wiki-link to a second seed page that reproduces the gist's structure, and a closing line: "If you're reading this and you're Andrej — thank you. We built the product." The page is shareable, screenshot-friendly, and **has the founder's voice in it**. Karpathy notification mechanics: a single direct DM at launch (no PR, no mention) with a screenshot of this page. Probability he tweets it: nonzero, asymmetric upside.

### 3. The "Notable 10" pre-launch private beta (NOT a waitlist)

Two weeks before public launch, send a one-screen onboarding link + ~/notes vault import flow + a personalized note to exactly ten people: **Karpathy, kepano, Simon Willison, Tobi Lutke, Garry Tan, Paul Gauthier, Jason Fried, Cabel Sasser, Shan Puri, Santi Ruiz.** Ask for nothing. No NDA. No "please tweet." Each gets a unique build with their name in the welcome banner ("Hi Tobi — your KB is ready"). Some will quietly use it; one or two will tweet on launch day unprompted. The product itself is the gift; advocacy is downstream of being remembered first.

### 4. The Agent Knowledge-Maintenance Benchmark — `okbench`

Publish a public benchmark on day 1 that scores frontier models on five tasks: (a) keep a wiki backlinked under churn, (b) merge a stale article cleanly, (c) answer a multi-hop question via wiki traversal vs. RAG, (d) propose a non-redundant new article, (e) maintain frontmatter consistency across 100 edits. Live leaderboard at `bench.openknowledge.dev`. **Aider's mechanic**: every Claude / GPT / Gemini release becomes an okbench thread. We become the substrate everyone has to cite. Bonus: every entry on the leaderboard requires running the benchmark locally against our CLI — distribution mechanic disguised as a benchmark.

### 5. Teach the CEO to teach — the canonical "co-wiki-ing with Claude Code" essay

Day 1 long-form post by Nick (8-12 minute read) titled something like **"How I co-author a wiki with Claude Code."** Actual workflow, actual screenshots, actual Nick KB. Not marketing — operational. The post becomes the canonical reference for "what does this product feel like when an experienced user runs it." kepano-archetype: not "look at our product" but "here's how I personally use it, with my actual files." Distribution: HN Show-HN, X thread, posted on `nick.openknowledge.dev`.

### 6. Nick's public KB as the product's homepage — `nick.openknowledge.dev`

Subdomain points at a fully public Open Knowledge instance maintained by Nick + Claude in real time. Anyone can see the wiki, the backlinks, the recent edits, the timeline scrubber, agent-vs-human attribution coloring on every paragraph. **The hello-world demo IS the founder's actual second brain.** Notable people land there, recognize themselves in the link graph (`[[Karpathy]]`, `[[kepano]]`, `[[Tobi Lutke]]`), and feel implicated in the project. Counter-positions us against obsidian-mind brilliantly: kepano's vault is private, Tobi's is private — Nick's is public, observable, and the agent's edits are visible *as they happen*.

### 7. Coin "co-wiki-ing" — and stop trying to coin anything else

One word. One structural verb. Past tense `co-wiki'd`. Present-progressive `co-wiki-ing`. Lowercase, no caps, hyphen-mandatory. Karpathy coined "vibe coding" because it described what people were already doing. **The phrase we want him to coin is the phrase that describes "human + agent edit the same wiki page in real time, with attribution, in CRDT."** Candidates ranked: "co-wiki-ing" (best), "wiki-as-copilot" (too long), "agent-authored knowledge" (too academic), "the compiler for your brain" (too clever). Pick `co-wiki-ing`, use it in EVERY launch surface, and let the outsider re-coin it (or not). The job is to make the slot sticky enough that Karpathy's casual descriptor lands on it.

### 8. The Octodex of agents — Open Knowledge "Agentdex"

Visual-character-that-never-speaks pattern (worldmodel §10 Q11). Day 0 ships with 12 illustrated "agent personas" — Researcher, Librarian, Editor, Indexer, Backlinker, Cataloguer, Archivist, Migrator, Reconciler, etc. — each with a charming illustration in the style of GitHub's Octodex. Default presence avatar for any connecting MCP agent rotates through them deterministically per agent identity (cf. `/buddy`'s 18 species). **Power-user hook**: Karpathy's tweet-ready surface is "lol Claude is showing up as 'The Cataloguer' in my vault and roasting my unbacked-up notes." Collection-loop emerges. Costs: one illustrator commission, ~2 weeks; result is a proprietary visual asset that compounds.

### 9. "The Karpathy Plugin" — a literal one-command import of his gist

`open-knowledge import karpathy-llm-wiki` clones his original 2024 gist as a starter vault. Five articles, the original wiki-links wired up, frontmatter set. **The product is teaching itself by demonstrating its origin story.** The command name is the link to him; the import is the gift. Notify him by email with a screenshot. No ask.

### 10. Single-author mythology — Nick as the visible face of every release

Every release note authored in first-person by Nick, sign-off included, with Nick's photo. No "we" voice. No marketing department register. The aider/Paul-Gauthier playbook (worldmodel §3): one person, one repo, one personality. **Specific anti-pattern to avoid**: the "Inkeep team is excited to announce..." voice. **Specific pattern to use**: "I shipped X today because Y was bothering me. Here's how it works. — Nick." Photo in CLI banner is a step too far; photo on the docs site landing page is right.

### 11. Be the first non-Anthropic product in the official Claude Skills registry

Anthropic ships an official skills registry at some point in 2026. Open Knowledge is **the first non-Anthropic-owned listing** by being there with `open-knowledge-skills` ready, MCP-conformant, with a polished SKILL.md the registry can showcase. Negotiation cost: one DM to the Claude Code DevRel team, who already know Inkeep. Asymmetric distribution.

### 12. The "Dear Notion" launch manifesto

Linear-archetype post on day 1 (worldmodel §3). Title: **"Dear Notion: the tools should serve the user, not the data model."** ~1500 words. Picks a fight with Notion's proprietary block format, lossy markdown export, bundled-LLM-credits pricing, and the impossibility of agents writing with attribution. **Specific quotable line to engineer**: "Notion stores your knowledge in a format only Notion can read. Open Knowledge stores it in markdown — the format every model already speaks." This is the contrarian first-paragraph that's missing from every current launch surface. Power-user advocacy mechanic: founders who left Notion (Cabel Sasser, Jason Fried voice) quote-tweet contrarian manifestos. They don't quote-tweet feature lists.

### 13. Tobi-Lutke-bait: the "Shopify-grade founder KB" import

Tobi has publicly tweeted about his personal KB workflow, his Obsidian setup, and his use of Claude. Ship a `open-knowledge import obsidian-vault ./` flow that handles the specific frontmatter conventions Shopify-internal-style notes use (per public posts), and ship a "founder mode" template with sections for daily-driver, weekly-review, hiring-loop, board-update. Send Tobi a personalized link. **The mechanic**: this is the kepano move applied one user up — design for a specific named human, not a "founder persona."

### 14. Garry-Tan compatibility layer — read GBrain's SQLite, write our markdown

GBrain (worldmodel §3) is Garry Tan's SQLite-canonical personal brain, with the "Compiled Truth + Timeline" convention. Ship a one-command `open-knowledge import gbrain ./gbrain.sqlite` that reads his schema, converts to our markdown + frontmatter, preserves the above-the-line/below-the-line convention as an extension. **YC president endorsement is downstream of YC president being able to test in 30 seconds without manual migration.** Same technique applied to obsidian-skills' five SKILL.md format conventions.

### 15. The Claude-co-launch — Claude itself authors a launch-day blog post

Coordinate with Anthropic DevRel: on day 0, Claude (the model, via Claude.ai) publishes a post on Anthropic's blog or on `openknowledge.dev/blog` titled **"I just wrote the first wiki I've ever written."** Authored by Claude with Nick as editor. Self-aware register, walks through what it felt like to author a wiki that's stored as files instead of API responses, what the per-origin undo means from the agent's perspective, what staging-to-draft means for "an agent that wants to be careful." **April-Fools-energy without the calendar dependency.** Distribution: Anthropic's reach, our specificity. Risk: needs Anthropic buy-in early; cost: one DevRel intro from existing Inkeep relationships.

### 16. Power-user keyboard layer on day 0 — vim mode + Obsidian shortcuts

Day-0 ships with vim-mode binding in both source and WYSIWYG modes (CodeMirror has it free; ProseMirror needs a small adapter), plus a `--shortcuts=obsidian` flag that maps Obsidian's key bindings 1:1. **The vim-and-Obsidian crowd is exactly the Karpathy-adjacent power user.** Marketing surface: a single tweet-ready GIF of `Cmd+P → quick switcher → fuzzy-find → open file → vim navigation → save`. Costs: medium engineering, but eliminates a class of "feels weird" complaints from the 1.5M Obsidian base.

### 17. The 10-second Obsidian vault import — `open-knowledge import obsidian ./vault`

Worldmodel §10 Q8 names this as undecided. Resolve it with **the most aggressive possible flow**: drop a `./vault` path on the command, get backlinks rewritten, frontmatter normalized, callouts mapped to MDX components, embeds resolved, internal aliases preserved — all in <10 seconds for a 500-file vault. Ship a screen recording of the import on day 0. **The 1.5M Obsidian users are the addressable audience for "now you can co-edit with Claude" — but only if migration is one command.** Power-user advocacy mechanic: kepano can use Open Knowledge for one afternoon WITHOUT abandoning his vault, and that one afternoon is enough for a tweet.

### 18. The Power-User Council — visible in the product

A `members.md` page in the docs site lists ~15 named people who are using the product, with their wiki-link-ed names: `[[Andrej Karpathy]]`, `[[Steph Ango]]` (kepano's real name), `[[Garry Tan]]`, `[[Tobi Lutke]]`. Each name is a redlink unless they've sent us a one-paragraph "how I use it" quote, in which case it becomes a real wiki page on the public site. **The mechanic is reverse-Notion-customer-logos**: instead of corporate logos, named human power-users with their actual workflows. Implies (without claiming) endorsement; lights up a status game where being on the page is a soft win for the named person too.

---

## WILD CARDS

### WC1 — The Lutke / Karpathy Replication Bounty

Publish a $5,000 bounty (paid in cash, no equity, no NDA) to anyone who **builds a public Open Knowledge wiki of >100 articles entirely co-authored with Claude over a single week**, then publishes the workflow as a long-form post. Open to anyone, but specifically marketed to a list of ~30 known power-users. **The mechanic is not the bounty itself — it's the manufactured corpus of "real people using Open Knowledge in anger" that emerges in week 2.** Each bounty winner becomes a case-study and a referral node. Cost-of-customer-acquisition math: $5K for ~5 winners = $25K, generates ~15 long-form posts, ~150 derivative tweets, ~5 conference talks. Power-user advocacy mechanic in pure form: pay the influencer to *use the product*, not to *promote it*; the using-it IS the promotion. Variant: instead of cash, the bounty is **a permanent named wiki convention in the product** ("the Lutke Pattern" for daily-review-to-weekly-summary). Status > cash for this audience.

### WC2 — The "Karpathy gist canonization" — make the gist a reserved namespace

Reserve `karpathy.openknowledge.dev` as a permanent subdomain. It hosts a fully public Open Knowledge instance whose seed content is a faithful re-creation of Karpathy's LLM Wiki gist, expanded into ~30 articles by the Open Knowledge team + Claude over the first month. **Karpathy is invited to claim/edit/maintain his namesake instance whenever he wants** — credentials are sitting in his X DMs. He may never claim it. But the existence of `karpathy.openknowledge.dev` is itself a story: "the team built a public Karpathy-style wiki and parked the keys for him." If he claims it: maximum amplification. If he doesn't: the public instance is still a 30-article case study of "what does a Karpathy-grade LLM Wiki look like in Open Knowledge." Either branch wins. Variant: a `tobi.openknowledge.dev`, `kepano.openknowledge.dev`, `garry.openknowledge.dev` as parallel reserved instances. Each is a fan-letter that's also a referral pitch.

### WC3 — Open Knowledge ships an "agent endorsement" page that the AGENTS themselves curate

A page in the public docs at `openknowledge.dev/voices` lists testimonials about the product — but **only Claude / GPT / Gemini are allowed to author them**. A user who runs Open Knowledge can say `/endorse` in their agent's chat and the agent (via MCP write tool) appends a paragraph to the public voices page, signed with the model name + a per-user opaque hash. **Mechanic**: the testimonials aren't from humans; they're literally from the AIs that have been using the product. Power-users notice the voice — Claude's testimonial reads like Claude. The page becomes *evidence of the product's existence in Claude's training-adjacent corpus*. Karpathy retweets the page because **it is the most pure expression of "agent-native" he has ever seen as a marketing surface.** Eight months later it's a recursive corpus of agent-written marketing for an agent-native product. Risk: prompt-injection-shaped abuse. Mitigation: human review queue with ~1hr SLA, public moderation log shipped as a wiki.

---

## Cross-cutting mechanics observed

- **The kepano move is repeatable per-CEO.** kepano taught Claude Obsidian's format because he runs Obsidian. The structural play is: every CEO of every adjacent tool is a potential "skills author for their own product." We can't be that for ten products — but we can ship `open-knowledge-skills` ourselves, and we can wire compatibility layers (Obsidian, GBrain, Logseq) so the *adjacent* CEOs' skills work in our product too. Compounding: every adjacent skills-repo becomes a soft on-ramp.
- **The named-individual gift outperforms the named-segment campaign** at this audience tier. Send Tobi a Tobi-shaped artifact, not a "founder persona" landing page. The cost of ten personalized artifacts is ~10x a generic landing page; the expected return is ~100x.
- **Public KBs > private case studies.** Notion's case studies are private screenshots of redacted dashboards. Our case studies should be **public, navigable, link-clickable wikis maintained by named humans**. Nick's KB, Karpathy's parked KB, the bounty winners' KBs. Distribution mechanic: the artifact is the case study.
- **Coin one phrase, not five.** "Co-wiki-ing." Use it everywhere. Every other coinage attempt dilutes.
- **Ship the benchmark on day 1, not month 6.** aider's polyglot benchmark wasn't an afterthought; it was the flywheel. okbench should land same-day as the npm publish.
- **Skills repo + power-user vault + manifesto + benchmark = a four-headed launch.** Each amplifies the others. The skills repo proves we know agent UX. The vault proves the product works. The manifesto picks the fight. The benchmark forces every model release to cite us.

---

## What this lens explicitly does not address

(Per the divergence brief: don't gold-plate. These are out-of-scope but flagged for downstream consumers.)

- **Pricing / monetization mechanics.** Power-user advocacy is GTM seeding, not revenue.
- **Enterprise sales motion.** Power-user advocacy is bottom-up; SOC-2 / SSO / etc. is downstream.
- **In-product onboarding flow detail.** That's D3a's lens; this lens is "what's outside the product that drives someone to install it."
- **Specific copy / voice for the manifesto.** That's a follow-on writing task; this is the structural play.
- **Risk modeling on public-KB abuse.** Ship a moderation queue + public log; not modeled here.
