# D2a — Mascot / Character Identity (Divergent Raw)

*Divergent ideation pass. Unbounded. Unranked. Ideas are seeds, not recommendations.*
*Author: divergent agent D2a. Date: 2026-04-14.*

**Lens.** Open Knowledge ships with no mascot today. The animal-avatar system (Bird, Cat, Dog, Fish, Rabbit — deterministic per user) is latent infrastructure. The Claude icon stands in for agents. Where could character live? In a visual? In a name? In a voice? In the absence of all three? Below: 20 ideas + 3 wild cards. Then: candidate names with rationale.

---

## Ideas

### 1. "Quill" — the archivist corvid
**Pitch.** A small, not-quite-raven, not-quite-magpie bird carrying a quill. Corvids collect shiny things, remember faces for years, and famously trade gifts with humans who feed them. The raven-as-librarian evokes the collector-and-rememberer that a knowledge base *is*. Follows the Octocat rule: never speaks. Shows emotion through context — sleeping on a rolled scroll when idle, feathers ruffled when agent sync conflicts, holding a single feather when a new wiki-link is made.
**Emotional target.** Scholarly-warm. Quiet competence.
**Reference.** Octocat (pantomime-only), Slonik (metaphor-anchored), Huginn & Muninn (Odin's ravens of Thought and Memory).
**Demo sentence.** "You open the editor and Quill is perched on the corner of the sidebar, head tilted at the file you just created."

### 2. "Mothball" — the unassuming librarian moth
**Pitch.** A chunky, fluffy, stripe-winged moth who lives in the margins. Moths are drawn to lights (documents, cursors, ideas). The absurdity of a moth-librarian is what makes it shareable. Dino-style energy: drawn slightly awkwardly, earnest, not slick. Mothball flutters toward whichever file was last edited, revealing recency without a UI chrome.
**Emotional target.** Absurd-cozy. The mascot you'd put on a hoodie.
**Reference.** Dino (Deno), Tux (Linux) — explicitly non-aggressive, approachable-weird.
**Demo sentence.** "Claude just edited README.md and Mothball is now orbiting the file tree entry with tiny wing-pulses."

### 3. Extend the existing avatar zoo — "The Five"
**Pitch.** The Bird, Cat, Dog, Fish, Rabbit avatar system *is* the mascot ensemble. No single face. Lean into the Snoo model — each user *is* their animal, and the canonical product face is the ensemble. Launch merch as five stickers, not one. Like Octodex, hundreds of seasonal variants can emerge: Librarian Cat, Astronaut Fish, Cartographer Rabbit. The ensemble is shareable because *everyone sees themselves in one.*
**Emotional target.** Belonging. "Which one are you?" is the first-install question.
**Reference.** Snoo (Reddit — "most user-adapted mascot in tech"), Octodex, Animal Crossing villagers.
**Demo sentence.** "First question the CLI asks: 'What's your animal?' — or it assigns you one deterministically from your git name, and you can re-roll."

### 4. "Codex" — the agent-side character, paired with the user's animal
**Pitch.** Two-character dynamic. The *user's* animal (from the existing zoo) is one half; the *agent* is represented by a consistent character — a small translucent ghost with glasses, or a plush robot, or a librarian cat. Presence bar always shows the pair. The *relationship* is the mascot. When Claude is editing, user animal + agent character are drawn side-by-side in the header, cooperating.
**Emotional target.** Companionship. "Me and my co-author."
**Reference.** GitHub's Mona + Ducky + Copilot triad, Pokémon trainer + starter pairings.
**Demo sentence.** "The header shows you (a fox) and Codex (a tiny ghost with a quill) leaning over the same page."

### 5. "The Hive" — the product IS the creature
**Pitch.** No mascot-avatar. Instead, the **knowledge base itself is alive and visible**. A living sidebar organism: a root system that grows as files are added, branches as backlinks form, leaves that pulse with recent edits. The creature is collective — it's *your* wiki, literally rendered as an organism. Bees drift across it when agents are working. The thing you're tending is the mascot. Ships well on Twitter because every user's hive looks different — a screenshot is a fingerprint.
**Emotional target.** Awe. Pride of cultivation.
**Reference.** Forest (Pomodoro-as-garden), Tamagotchi's generational record, Finch's visible state-of-care.
**Demo sentence.** "Month 3: your hive is visibly denser than month 1. Screenshots of high-backlink-density hives trend on Twitter."

### 6. "Page" and "Link" — the two-sided coin
**Pitch.** Two tiny characters who only exist in pair. Page is square, patient, slightly rumpled. Link is a thin coil of line with two ends, endlessly reaching between pages. They cannot be drawn apart. The *relationship between two files* is what they embody. Every backlink creation is a tiny Link animation stitching two Pages together. Adopts the obsidian-mind slogan "A note without links is a bug" — Link literally can't function alone.
**Emotional target.** Delight in relationship. The feeling of remembering why two things connect.
**Reference.** Laurel & Hardy, Calvin & Hobbes, PB&J brand pairs.
**Demo sentence.** "First `[[wiki-link]]` you create triggers a 300ms animation of Link stitching from one Page to the next, with a soft audible *click*."

### 7. Anti-mascot: **Pure typography + color is the character**
**Pitch.** Follow Vercel / Linear. No illustrated character. A distinctive word mark — `open.knowledge` lowercase, period-separated, served in a custom mono-adjacent face (think Berkeley Mono or Commit Mono). The character is *the precision of the typography*. Error messages are the voice. Empty states are the voice. The product is so confidently designed that decoration would cheapen it.
**Emotional target.** Premium-craft. The Rolex-of-markdown-tools feeling.
**Reference.** Vercel (triangle + Geist), Linear (dark-mode-first Inter), Raycast (beam + extension cover art).
**Demo sentence.** "Launch page is one sentence in Berkeley Mono on a near-black background. Nothing else. The silence is the brand."

### 8. Dialable persona: **"Voice Modes"** (the Claude Code `/output-style` pattern)
**Pitch.** No visual. Personality is configuration. Ship four preset voices that the user can pick on first run or swap via `open-knowledge voice <mode>`:
- **Scribe** (default) — terse, collaborative, present-tense.
- **Archivist** — slightly formal, historical framing, "the record shows..."
- **Scholar** — curious, questioning, comfortable with uncertainty, cites sources.
- **Field notes** — casual, outdoorsy, "let's mark where we are."

The voice shows up in CLI output, empty states, commit messages, agent-change summaries. User can define a custom voice via markdown file.
**Emotional target.** Self-expression. The product *adapts* to the user.
**Reference.** Claude Code `/output-style`, GitHub issue #42341 requesting named "Umbral" companion.
**Demo sentence.** "First prompt: 'Pick a voice: Scribe, Archivist, Scholar, Field Notes, or write your own.'"

### 9. "Margin" — the sentient marginalia
**Pitch.** Not a character with a body — a *style*. Light annotations appear in the editor margins, drawn in fake handwriting, never interrupting. When Claude drafts a section, a marginal scribble says "new draft — review when ready." When backlinks form, a tiny arrow is sketched in. The editor has a *marginalia layer* that feels like a thoughtful reader jotting in the margin of your book. Never speaks *in dialog*; speaks only in marginalia.
**Emotional target.** The feeling of reading a used book that was previously owned by a brilliant nerd.
**Reference.** Fermat's "I have discovered a marvelous proof...", Tolkien's annotated Silmarillion, Rauno Freiberg's "invisible details."
**Demo sentence.** "Claude edits a paragraph; a tiny handwritten `revised 14:02` appears in the margin, fades gently after 5 seconds."

### 10. "Slonik-style metaphor-first" names for the underlying primitives
**Pitch.** No mascot-character. Instead, name the *technical primitives* metaphorically, and let the names be the personality:
- The CRDT: **Huginn** (memory raven).
- The shadow git repo: **Muninn** (thought raven).
- The file watcher: **Scout**.
- The merge conflict resolver: **Quilt**.
- The presence system: **Roll Call**.
- The WIP branch: **Sketchbook**.

Users learn the vocabulary; the vocabulary becomes tribal. Personality through terminology.
**Emotional target.** Tribal belonging. Feels like a well-named codebase.
**Reference.** Slonik (Postgres), Hashi's Vagrant/Terraform/Consul/Nomad, Kubernetes (helmsman / pilot / kubectl-kuttle).
**Demo sentence.** "`open-knowledge sketchbook list` shows your in-progress drafts. `huginn status` reports CRDT sync health."

### 11. "Folio" — the folding-page mascot
**Pitch.** A character that is literally a single sheet of paper that folds itself into different shapes: owl for reading, bird for sending, crane for carrying, fox for hunting broken links. The origami-paper-folding loop is visually hypnotic and ties directly to the paper/markdown metaphor. Folio *never stops folding* — different activities trigger different forms.
**Emotional target.** Quiet fascination.
**Reference.** Blade Runner 2049's origami unicorn, Paper Mario, origami in minimalist branding.
**Demo sentence.** "When you create your first document, a single sheet floats down, folds into a tiny paper owl, perches, and sleeps."

### 12. "The Bureau" — a mini-office of tiny characters
**Pitch.** Not one mascot, a *workplace*. A tiny bureau with a desk, inbox, filing cabinet, reading lamp. Different small characters appear at different parts: a stamp-clerk character when you save a version, a postmaster when an agent delivers a new draft, a cartographer when you open the graph view. The *institution* is the mascot. Every feature has its own specialist; you're the proprietor.
**Emotional target.** Cozy bureaucracy. The coffee-shop-on-a-rainy-afternoon feeling.
**Reference.** Grand Budapest Hotel, Animal Crossing Post Office, Studio Ghibli's small-role ensembles.
**Demo sentence.** "Save Version triggers the stamp-clerk animation — a tiny figure walks over, stamps the current commit, files it in the cabinet."

### 13. "Loom" — the weaver of links
**Pitch.** A spider-like creature (but friendly — think cartoon Aragog-redeemed, or Charlotte). The web IS the knowledge graph. Loom weaves new threads when backlinks form, patches old threads when links break. The graph view literally shows Loom at work. Ties the product's *core technical promise* (the link-and-backlink graph) to the mascot's raison d'être — Slonik logic applied to wikis.
**Emotional target.** The graph as a living weave. Wonder-at-structure.
**Reference.** Slonik (metaphor = product promise), Charlotte's Web, Anansi mythology.
**Demo sentence.** "Open the graph view: Loom is in the center, tending the web, new threads glowing faintly at the edges where you added links this session."

### 14. "Compost" — the weird-but-earnest decomposer
**Pitch.** A mushroom or slime-mold character. Knowledge bases rot without tending — old notes, stale links, abandoned drafts. Compost eats the rot and turns it into nutrients (detected broken links, flagged stale sections, suggested reorganizations). Supabase-tier weirdness: the product's co-worker who jokes about rot but also knows where every dead link is buried.
**Emotional target.** Permissive weirdness. The joke that becomes the brand.
**Reference.** Supabase CEO as "meme-lord," Duolingo's passive-aggressive owl, Glia's slime-mold-pathfinding research.
**Demo sentence.** "`open-knowledge rot` prints: 'Compost found 14 broken wiki-links and 3 orphan drafts. Shall I tend to them?'"

### 15. "Lighthouse" — the ambient signaling landmark
**Pitch.** Not a creature — a *place*. A single lighthouse silhouette in the corner of the editor whose beam rotates to signal what the agent is doing. Beam pointing at the file tree = agent is scanning files. Beam pointing at the document = agent is editing here. Beam rotating slowly and dim = agent idle. It's the anti-Clippy: it never talks, never interrupts, but its state is always readable at a glance. Pairs naturally with "Raven" — sailor-and-his-bird imagery.
**Emotional target.** Maritime calm. Ambient awareness without noise.
**Reference.** macOS Dock's subtle status dots, Raycast's ambient status, Animal Crossing's 9am/5pm mail (time-gated ambient signal).
**Demo sentence.** "Lighthouse beam swings to point at the sidebar — Claude is indexing new files."

### 16. "You" — the user is the only character
**Pitch.** Radical: *there is no mascot*. The user's own git name, git email, git avatar (via identicon) IS the character. Every string of copy addresses them by name. Every empty state is personalized (`"Hi Nick, this KB has 0 notes — shall we start?"`). Every error message uses their name. The product feels like it was built for you specifically. Finch's onboarding ownership logic taken to the extreme: ownership is identity, identity is name.
**Emotional target.** Intimate recognition.
**Reference.** Arc's "Welcome, [Name]", Warp's `.zshrc` silent import, birthday card energy.
**Demo sentence.** "First banner after install: `Welcome back, Nick — your KB is waiting.`"

### 17. "Clawd" — the agent mascot, per-agent
**Pitch.** Every agent gets a distinct mascot-avatar mapped from its MCP-session name. Claude = a small plush with soft tendrils. GPT = a different shape. Cursor = another. Open Knowledge's own internal MCP namespace becomes visual. Multi-agent future is already visible in the UI: two different plushes collaborating on the same doc, each one distinctly shaped. The product *wants* a multi-agent world.
**Emotional target.** Agent as distinct colleague, not generic bot.
**Reference.** Claude Code `/buddy`, GitHub Copilot's "fearless hero" portrait, Pokémon party composition.
**Demo sentence.** "Presence bar shows: you (rabbit), Clawd (plush), Cur (wave-form). Each is mid-edit on a different file."

### 18. Merch-first mascot (Octodex style) — **community expansion**
**Pitch.** Pick one mascot (let's call it Quill the Corvid from idea 1), then launch it with an **Octodex-style variant gallery**: Librarian Quill, Astronaut Quill, Cartographer Quill, Cowboy Quill, Ada-Lovelace Quill. 15 variants on day 1. Users submit their own designs via PR to a designated repo. Stickers ship free to anyone who writes a blog post about the product. Variants become the community's running joke; the sticker page is a discovery funnel.
**Emotional target.** Tribal affinity through collectibility.
**Reference.** Octodex (GitHub), obsidian-skills 21K-stars (community-driven viral loop).
**Demo sentence.** "Week 1 of launch: the `@open-knowledge/octodex` repo has 40 PRs for variant Quills."

### 19. "Librarian Mode" — dialable persona AS mascot
**Pitch.** Mash idea 8 (voice modes) with idea 16 (user-is-character). Personality is a **role you cast the product into**. First-run question: *"What is Open Knowledge to you?"* Options:
- **My librarian** (cataloging, reference, retrieval)
- **My scribe** (drafting, rewriting, summarizing)
- **My cartographer** (graph, links, structure)
- **My archivist** (versions, provenance, attribution)

The answer shapes: CLI verbs (`catalog`, `draft`, `map`, `archive`), default slash commands, empty-state language, onboarding tour. The mascot is the *role you project onto the system*.
**Emotional target.** Self-casting. The product adapts to your mental model.
**Reference.** D&D class selection, Notion's onboarding persona split, Arc's membership card.
**Demo sentence.** "First run asks: `What is Open Knowledge to you today?` You pick Cartographer; the next 10 minutes of UI subtly emphasizes the graph view."

### 20. "Ghost of the Wiki" — haunted-in-a-friendly-way
**Pitch.** The KB is *haunted* by a kindly ghost who remembers everything that has ever been written, even deleted things. When you visit an old page, the ghost sometimes leaves a small note: "You last edited this 47 days ago." When a link points to a deleted page, the ghost is there: "This page used to exist — I remember it. Shall I show you the last version?" Direct embodiment of the **attribution journal** (shadow git repo). The ghost is your access to history.
**Emotional target.** Melancholy comfort. The feeling of rediscovering old journal entries.
**Reference.** Spirited Away's soot sprites, Casper, GitHub's "contributions 3 years ago."
**Demo sentence.** "You click a red-link; the ghost appears and says (in a margin-note style), 'This page existed once. Want to see it again?'"

---

## WILD CARDS

### 🃏 W1. "Glyph" — a procedurally-generated mascot per-user, per-wiki
**Pitch.** The mascot isn't pre-drawn. It's **procedurally generated from the hash of your wiki's root commit**. Every Open Knowledge user gets a *unique* small creature — composed from a library of parts (heads, bodies, tails, accessories) seeded by the git SHA. Yours looks like nobody else's. It evolves as your wiki grows: new parts appear at backlink milestones, seasonal costumes unlock. Screenshots are *fingerprints*. A fox-bodied, rabbit-eared, paper-scroll-tailed creature is uniquely yours — and tweet-shareable *because* no two people have the same one.
**Emotional target.** Identity + collectibility + ownership. Pokémon-starter energy.
**Reference.** Spore creature creator, Finch customization, Animal Crossing island identity, GitHub identicons.
**Demo sentence.** "First run: `Generating your librarian… ` [500ms animation] Then a small creature appears, labeled *'This is Swoop — the keeper of your wiki. Only you have this one.'*"

### 🃏 W2. "The Index" — the mascot is a living, breathing alphabetical index at the bottom of the screen
**Pitch.** Not a character. Not a creature. At the bottom of the editor is a permanent horizontal strip showing a live *alphabetical index* of all pages in your KB. Pages appear and disappear as they're created and deleted. Hovering reveals little context. When Claude writes a new page, you see the letter-group it lands in *visibly bulge and settle*. **The index is the mascot**: ambient, utilitarian, alive, distinctive. It IS what a wiki is — a mapping from letters to articles — rendered as the product's face. Nobody else does this. It's the Slack-tray-mascot of reference-tools.
**Emotional target.** Scholarly satisfaction. The feeling of watching a card catalog fill up.
**Reference.** The Dewey Decimal System as design, Panic's Nova "sense of fun," Wikipedia's portal pages, ticker-tape aesthetics.
**Demo sentence.** "The bottom strip reads `A B C D E F G H…` with small badges under each letter showing article counts. When Claude creates *Kafka-Overview.md*, the K group bulges with a soft bounce."

### 🃏 W3. "The Covenant" — the mascot is a *contract* between human and agent
**Pitch.** No creature. No typography. The "character" is a **visible, editable text artifact** that lives at the root of every Open Knowledge install — `.open-knowledge/COVENANT.md`. It says things like:
> *"I, Claude, agree to: attribute my edits, stage drafts before merging, never delete without review. I, Nick, agree to: acknowledge agent work, review drafts within reasonable time, trust the per-origin undo system."*

First run, the CLI prints the covenant and the user signs it (literally: git commits their name). The covenant shows up on the docs landing page. It's the thing you *share* on Twitter. "Look at the contract I have with my AI." The personality is the *agreement itself* — and it's radically different from everyone else shipping agent-writable tools. The Covenant can be forked and customized. Users post theirs like mission statements.
**Emotional target.** Intentionality. Dignity-of-labor. Being-treated-as-a-peer.
**Reference.** Obsidian-mind's CLAUDE.md conventions, Hippocratic Oath, open-source CODE_OF_CONDUCT but *between you and your AI*.
**Demo sentence.** "First run prints: `This KB runs under a Covenant between you and your agents. Review the draft → Sign → Begin.` — and the signing moment is a physical gesture."

---

## NAMING — Candidate Names

Specific candidate names with rationale, drawing from the precedents (Mona, Dino, Slonik, Freddie, Clawd, Umbral, Ducky):

### Tier A — top candidates

1. **Quill** — corvid + scribe. Evokes writing, memory, the tool-of-knowledge. Short, tweetable, easy to illustrate. Two-syllable vowel-consonant rhythm like Mona, Dino. Trademark risk moderate (real products exist; none in dev-tool mascot space).

2. **Muninn** — Odin's raven of Memory (partner: Huginn = Thought). Slonik-tier metaphor — a *memory*-creature for a *knowledge-memory* product. Exotic-enough to be distinctive, Nordic precedent in tech naming (Valkyrie, Thor, etc.). Pairs well with second character if we go two-character route.

3. **Codex** — the universal symbol for a bound book of writings. Feels institutional, archival, slightly medieval (which is charming for a knowledge product). Ships well as "the agent side of the pair" — the user is their animal, Codex is the agent. Risk: Codex is the name of an OpenAI product and a GitHub repo — name collision.

### Tier B — strong second-round candidates

4. **Folio** — a single sheet of paper; a unit of printing. Soft, scholarly, visual. Would fit the origami-folding character (idea 11).

5. **Margin** — the space where thought happens. Zero-letters-wasted. Works for the marginalia character (idea 9) — the mascot IS the margin.

6. **Atlas** — cartography + support-of-the-world. Fits if we go "cartographer" voice mode. Pairs with graph view. Known name but in mascot space, clear.

7. **Clawd** — already used as archetype reference in the prompt. If we want the agent-specific mascot (pun on Claude), this is short, weird, share-worthy. Risk: locks us to Anthropic.

8. **Ink** — one syllable. Pure. It's what writing IS. Could be the mascot's name (a tiny ink-blot creature) or the product's shorthand. "Made with Ink." "Ink v0.1."

9. **Mona-of-the-wiki / Mona Knowledge / Kira** (Japanese for "shimmer") — exploratory.

### Tier C — metaphor-first (Slonik-style) technical-primitive names

10. **Huginn** (CRDT) + **Muninn** (shadow repo) — pair-naming the underlying primitives (idea 10). Not the mascot per se — the personality lives in the vocabulary. Shipping the docs with these names would be memorable.

11. **Scout** (file watcher), **Sketchbook** (WIP refs), **Covenant** (permission contract), **Roll Call** (presence), **Quilt** (reconciler). Personality-through-terminology play.

### Tier D — wild / non-obvious

12. **Mothball** — idea 2. Absurd. Lovable. Hoodie-ready.
13. **Swoop** — what idea W1's procedural creature gets labeled by default (user can rename).
14. **Compost** — idea 14. Risky, but shareable-weird.
15. **Ledger** — archivist-mode mascot name. Sounds serious. Is serious. But slightly warm.

---

## Pattern observations

- **Two-character pairings consistently outperform single mascots** in the corpus: Mona+Ducky+Copilot, Huginn+Muninn, Tux+any-friend. Open Knowledge has a built-in pairing opportunity: user-animal + agent-character. Designing the *pair* is stronger than designing one.
- **Metaphor-anchored mascots (Slonik) are more defensible than generic-cute ones.** Pick a creature whose *trait* is the product's promise. Corvids-remember. Spiders-weave-webs. Moths-follow-lights. Mushrooms-decompose-rot.
- **The anti-mascot stance (Vercel, Linear) is viable but expensive** — requires world-class typography and writing craft to carry the absence.
- **Dialable personas (Claude Code `/output-style`) are the lowest-risk highest-optionality play.** They defer the visual-character decision while still shipping personality on day 1.
- **The Covenant (W3) is the only idea here that could not be copied by any competitor without changing their product philosophy.** That's the structural moat test.

---
