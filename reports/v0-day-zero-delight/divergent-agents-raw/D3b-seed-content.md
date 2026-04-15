# D3b — Zero-Config Seed Content

*Divergent ideation. Lens: what if `init` doesn't leave you with a blank `No files yet`, but seeds a small, opinionated set of pages that ARE the demo? The pre-populated content is itself a working showcase of wiki-links, backlinks, frontmatter, agent attribution, callouts, MDX components, version history. The user lands inside the product, not in front of it.*

*Posture: unbounded, divergent, no triage. Ranking and feasibility happen elsewhere.*

---

## The 18 ideas

### 1. `Welcome.md` — the Notion-style living onboarding doc

A single page titled "Welcome to Open Knowledge." Frontmatter (`title`, `tags: [welcome, demo]`, `created`). Body has every primitive we ship: an H1, a paragraph, a callout, a wiki-link to `[[How to co-edit with your agent]]`, a backlink panel populated because we also seeded the inbound link, a `<Note>` MDX component, a fenced code block, and a TODO checklist with three items: "Edit me," "Run `/buddy` in Claude Code," "Create your first page." The user can edit it freely — and as they do, every feature lights up by being touched. Notion proved this works; we have richer primitives to show off.

### 2. `How to co-edit with your agent.md` — a recorded co-write, replayed as content

The page is itself the *output* of a real human + agent collaboration session, frozen at v0. Inline attribution shading is preserved on agent-written paragraphs. A small "Version history" link in the corner reveals the actual commit chain — three commits, two by `agent:claude`, one by you. Reading it teaches the model. There's even a frozen "Undo Claude's last edit" button rendered as a screenshot inline. The doc is the demo.

### 3. `This wiki about this wiki.md` — recursive self-description

A page that describes Open Knowledge using Open Knowledge's own features. Wiki-links to every other seed page. A Mermaid diagram of the seed-page graph. The page exists on the graph view as the central node. Self-reference is the joke and the demo. Karpathy-aesthetic.

### 4. Project-wiki template (git-aware)

If `init` detects a `.git/` and a populated working tree, seed `architecture.md`, `decisions.md` (with one sample ADR), `glossary.md`, `runbooks/index.md` — each pre-filled with frontmatter, wiki-links to each other, and a "// agent: populate this section" comment. The agent's first natural action is to fill them in. The blank canvas becomes a fill-in-the-blank canvas.

### 5. `Scraped-from-your-readme.md` — Warp-style competence theater

`init` reads the repo's `README.md` and creates a KB page that summarizes it (heading-by-heading split → wiki page per top-level section, linked from a parent `[[README Index]]`). No LLM call needed — we're just doing structural extraction. The user opens the editor and sees their own project, already organized. "We already know what you have."

### 6. The Karpathy-Welcome — lineage flex

A literal excerpted page from Karpathy's LLM Wiki gist, titled `On building a personal LLM wiki — Andrej Karpathy.md`, with a callout at the top: "This is the gist that inspired Open Knowledge. We seeded it as page 1 so you can see the lineage. Edit it freely; it's yours now." Establishes provenance. Kepano did this with Obsidian quotes; we do it explicitly.

### 7. Seed-from-templates picker

`init --template <name>` flag, or interactive picker on first run: `research-lab`, `personal-notebook`, `company-wiki`, `bug-diary`, `reading-journal`, `agent-skills-vault`, `karpathy-wiki`. Each template seeds 5–10 pages with frontmatter conventions tuned for the genre. Bug diary has `Severity`, `Status` properties; reading journal has `Author`, `Rating`, `Read`. The genre choice IS the schema choice — no separate config step.

### 8. Seed-from-Obsidian-vault — zero-gravity migration

`init --import ~/Obsidian/MyVault`. We walk the vault, copy markdown verbatim (Obsidian's `[[wiki-links]]` syntax is already ours), preserve frontmatter, build the backlink index. In 10 seconds the user's existing knowledge is in OK with backlinks intact and the agent is wired up. The "I have Obsidian, why switch?" objection from PROJECT.md gets a one-command answer.

### 9. Seed-from-filesystem — the `find ~ -name "*.md"` move

`init --discover` runs a bounded find for the user's recently-modified `.md` files outside obvious junk dirs and surfaces them in a sidebar section called "Found nearby." Doesn't import — just *links*. The user clicks one and OK opens it in the editor (the file lives where it lived). Suddenly OK is the editor for all their scattered notes without a migration step. Warp-style "we already know."

### 10. The mascot's welcome letter

If we have a mascot (Clawd-analog), its first act on `init` is writing a `letter-from-<mascot-name>.md` — a one-page welcome in the mascot's voice, signed with a tiny ASCII portrait. The frontmatter says `author: clawd`. Backlinks-from is empty for now. The page invites you to write back: "If you reply to me with a `[[link]]` to a new page, I'll come visit it." Animal Crossing letter pattern, ported to a wiki.

### 11. The 5-page running tutorial — "the wiki is the tutorial"

Five seed pages that each teach one feature and `[[link to the next]]`:
1. `1. Editing.md` — try inline `**bold**`, headings, lists; toggle to source mode; toggle back.
2. `2. Wiki-links and backlinks.md` — create a `[[New Page]]` here and watch the redlink turn green.
3. `3. Agents and attribution.md` — open Claude Code, ask it to add a sentence to this page, watch it appear with shading.
4. `4. Version history.md` — hit Cmd+Z to undo Claude's change specifically.
5. `5. You're done.md` — delete these tutorial pages, or keep them as a manual.

Reading the wiki IS the onboarding. No modal, no overlay, no tooltip tour.

### 12. The "broken" backlink — invitation by absence

Inside `Welcome.md`, one wiki-link points to `[[Your first article]]` — a redlink. Hovering says "This page doesn't exist yet. Click to create." The first user action is creating *content*, not closing a tutorial. Wikipedia's red-link pattern repurposed as the first call-to-action.

### 13. `Today.md` — the daily-note that's already here

Seeded with today's date as title, frontmatter `created: <today>`, an empty `## Notes` heading and a `## Captured by agent` heading underneath. The agent knows from the AGENTS.md to append observations under the second heading. By end of day there's a real day-log. Logseq's daily-note pattern, but seeded so the user doesn't have to opt in.

### 14. The seeded SKILL.md mirror — kepano's pattern, native

`init` writes `.open-knowledge/skills/wikilinks.md`, `.../callouts.md`, `.../frontmatter.md`, `.../mdx-components.md` — the agent-facing dialect docs for our own format. These ARE wiki pages (visible in the sidebar under a `Skills` group). The agent reads them automatically because they're in the MCP catalog; the human reads them because they're searchable. Doubles as documentation and as agent grounding. Kepano's `obsidian-skills` repo, but it ships in the box.

### 15. The "before/after" demo pair

Two seed pages: `Before-OK.md` (a flat dump of unstructured notes — a pasted Slack thread, a half-edited todo, raw URLs) and `After-OK.md` (the same content, restructured: callouts, headings, wiki-links to extracted entities, frontmatter tags). The hint at the bottom of `Before-OK.md`: "Ask your agent to turn this into After-OK.md." The user runs the prompt and watches the transformation happen live. v0.dev "type and see" but for organizing knowledge.

### 16. Seed by agent on first connect — lazy seeding

`init` creates ONLY a single empty `index.md`. The first time an MCP agent connects, the *agent* is prompted (via a system-message returned by `list_documents` on an empty workspace): "This workspace is empty. Would you like me to seed it from the README, or from a template?" The first creative act is the agent's. The human watches. The first-write demo IS the seeding. (Wild card precursor.)

### 17. The "starter pack" subscribable feed

Seed a single page `Starter pack.md` with a list of seed-set URLs the user can click to import: "Karpathy's LLM gist," "kepano's obsidian-skills as wiki pages," "GBrain's Compiled-Truth + Timeline convention as a worked example." Each click pulls a curated mini-pack into the wiki. The seed itself is a *menu* of seeds. Composability over commitment.

### 18. The frontmatter-only seed (the lightest possible touch)

Don't seed pages — seed a single `.open-knowledge/templates/page.md` with a frontmatter scaffold (`title`, `tags`, `created`, `aliases`). When the user creates their first page, this template autofills. The seed isn't *content*; it's a *shape*. Zero clutter, but the very first page already has the conventions baked in. Linear's "the opinion IS the onboarding," at the schema layer.

---

## WILD CARDS

### W1. **The wiki ships with a fictional inhabitant who has been living there for years**

`init` seeds a wiki that *looks like it's been used*. There are 30+ pages. There's a `journal/` folder with daily notes from "the previous owner" (a fictional researcher named Ada, or a wink-name like "Andrej K.") spanning the last six months. There are abandoned drafts. There are pages with broken links. There's a TODO page with three items still open. There are old version-history entries showing real edit patterns over time.

The user lands inside *someone else's brain* — a haunted wiki. The framing in `README.md` (also seeded): "This wiki belonged to Ada. She moved on. It's yours now — keep what's useful, delete the rest." The first user action is exploration, not creation. The blank-canvas problem disappears entirely because the canvas is full.

This is **emotionally radical** for a dev tool. Pet rocks, Tamagotchi, Animal Crossing — they all work because of imagined backstory. A wiki with a fictional past commits to the same trick. The git log even shows commits dated months ago by `ada@example.com` so the version history feels real. Edit attribution makes the lie load-bearing — every "Ada" page has Ada's name on it; every page YOU edit immediately gets your name. The product teaches itself by contrast.

Risk: dev-tool audiences may smell theater. Mitigation: ship two flavors — `--seed haunted` for the inhabited version, `--seed clean` for the blank one. Make the haunted one the default for the first month, watch how people react.

### W2. **The seed content is generated from your shell history**

`init --autobiography` reads the last N commands from `~/.zsh_history` / `~/.bash_history`, groups them by working directory + tool, and generates ~10 wiki pages titled like `Projects I've been working on.md`, `Tools I use.md`, `Recent investigations.md`, `Things I git-cloned this month.md`. Each page has frontmatter, wiki-links between pages where they share dirs/tools, and source citations linking back to history line numbers.

It's Warp's `.zshrc` move pushed to its absurd limit: not "we read your config," but "we wrote your autobiography." The user's first reaction will be one of: (a) "this is uncanny and amazing," (b) "delete delete delete," (c) "wait, this is what I've been doing all month?" All three reactions are share-triggers. Karpathy-aesthetic to the bone.

The *content* is not the point — the *moment of recognition* is the point. The user shares a screenshot the same day. The screenshot is the launch demo.

Privacy: opt-in flag (`--autobiography`), runs entirely locally, never leaves the machine, generated pages have a "🔒 Generated from local history — not synced" callout at top. The opt-in is part of the bit.

### W3. **The seed content is a playable mystery**

`init --mystery` seeds a 7-page wiki that is itself a small detective game. Page 1: `Welcome — there's something wrong with this wiki.md`. The user has to follow wiki-links, find broken backlinks, notice frontmatter inconsistencies, spot a page where the version history shows a suspicious deletion, ask the agent to help investigate (the agent *also* gets clues via MCP — there are pages with `agent: please look here` hints in frontmatter). The "solution" is a page that, when created, completes the graph and shows a Mermaid diagram of the full mystery.

This is the Panic / Playdate move — *a hardware crank that has no business existing*. A wiki that has no business being a puzzle. But it teaches every primitive (wiki-links, backlinks, frontmatter, version history, agent collaboration, graph view, page creation) through *play*, not tutorial. Solving it takes 15 minutes. Sharing the moment of solution is automatic. There are HN posts and TikToks waiting.

Variants: ship 3-4 mysteries seasonally, leaderboard for fastest solve, agent-vs-human race mode. The seed becomes a *channel* — every quarter we ship a new mystery and people post about it. It's a Launch Week format scoped to a single primitive.

---

## Cross-cutting observations

- Several ideas (1, 2, 11, 15) collapse the demo and the tutorial into the same artifact — the page IS what it teaches. This pattern is Notion's, but our richer feature set (attribution, version history, MCP) makes the recursion thicker.
- Several (4, 5, 8, 9, W2) are *theft from the user's existing context* — read the README, read the vault, read the filesystem, read the shell history. Every one of them is a Warp-style "we already know" beat.
- Several (10, 16, W1, W3) introduce a *fictional or semi-fictional inhabitant* whose presence justifies the existing content. This is the riskiest bucket for a dev tool but also the highest-ceiling for emotional install.
- Several (7, 12, 14, 17, 18) are *minimal-touch* — a template, a redlink, a starter pack, a frontmatter scaffold. The seed is a hint, not a body.
- The "haunted wiki" wild card (W1) is the most divergent move from where every competitor is. It's the only one that solves the blank-canvas problem AND establishes character AND demonstrates every feature simultaneously.
- Every idea here can be stacked with `D1a` (co-editing presence) — the seed is the *substrate on which the first co-edit happens*. They are complementary, not alternative.
