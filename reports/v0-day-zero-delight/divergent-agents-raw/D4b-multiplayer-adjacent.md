# D4b — Multiplayer-Adjacent Experiences

> **Lens.** v0 is locked to single-human + AI. But the tagline is "Obsidian, but agent-native AND COLLABORATIVE." Multi-human is NOT NOW, yet the word "collaborative" appears in the pitch. What experiences honor that aspiration without violating scope? What unlocks a "let me show my team" moment from a single user, on day zero, without ever introducing two simultaneous humans into a Y.Doc?
>
> **Stance.** Unbounded ideation. Some ideas violate v0 scope — that is the assignment. Each idea names the multiplayer-surrogate it is, what team-share moment it triggers, and the rough mechanism. No ranking, no recommendation.

---

## The framing

There are at least seven distinct "multiplayer-adjacent" surrogate categories that don't require simultaneous CRDT co-presence:

1. **Async-via-git** — two humans, same repo, sequential work, branches as the merge surface.
2. **Read-only publish** — one author, many readers, no writes.
3. **Snapshot/artifact share** — the *output* is the share-object, not the workspace.
4. **Template/seed pre-load** — one author's setup ships as another's starter.
5. **Cross-agent knowledge bridges** — your KB feeds *their* agent, not their human.
6. **Recorded / replayable** — Loom-style asynchronous "watch me think."
7. **Communal moments** — global, scheduled, ambient — everyone participates as solo, the *aggregate* is the social moment.

The ideas below span all seven, plus three wild cards.

---

## I1 — `open-knowledge publish` → `nick.openknowledge.dev`

**Surrogate type:** Read-only publish.

A single CLI command takes the current branch's content and publishes it to a static-rendered subdomain. Free tier on a hosted service we run; OSS readers can self-host the renderer. Output is a Mintlify-quality site at `<your-handle>.openknowledge.dev`. Frontmatter `private: true` opts a doc out. Wiki-links resolve, backlinks render, graph view embedded as widget. The shareable URL IS the team-share moment — you DM your teammate "look what I built with my agent overnight" and they see a real wiki, not a screenshot.

**Why it lands.** Every Bolt.new / v0.dev launch metric proves: when every user action ends with a shareable URL, the product markets itself. The KB itself becomes the artifact.

---

## I2 — Snapshot diff → static HTML

**Surrogate type:** Snapshot artifact share.

`open-knowledge share <docName>` produces a **single self-contained HTML file** showing: the rendered article + agent-attribution shading + the activity-feed timeline + the diff against last human checkpoint. No JS dependencies, no server. AirDrop-able, Slack-attachable, email-attachable. Receiver opens it in a browser and sees: "Nick's agent wrote this section yesterday at 3pm. Nick edited this paragraph this morning. Here's the redline."

**Why it lands.** "Look what my agent did last night" needs a single link that survives Slack/email/SMS. A self-contained HTML file with attribution baked in is a thing that has never existed.

---

## I3 — Async branch handoff via git

**Surrogate type:** Async-via-git.

Document the workflow explicitly in the v0 docs and bake `open-knowledge handoff <branch>` as first-class: it commits WIP, pushes, opens a PR with auto-generated body summarizing what changed and which articles were touched. Other developer pulls, runs `open-knowledge inbox`, sees a list of "branches waiting for your review" with one-line agent-attribution summaries. They click → editor opens on that branch, they review, they merge.

**Why it lands.** This is multiplayer that already works because git already works. We just *name it* and *surface it* in product. Two devs at one company can use OK collaboratively on day zero — sequentially, via the substrate they already trust.

---

## I4 — Comment-only mode via PR review

**Surrogate type:** Async review.

Every published page (I1) has a "Suggest changes" button → opens a PR-style overlay where readers leave threaded comments anchored to specific paragraphs. Comments live in a sidecar `.comments.json` file in git, not in the markdown itself. Author opens the editor, sees an inbox of comment-threads, replies inline, marks resolved. Reader sees their own comment threaded under the paragraph in the next published cycle.

**Why it lands.** Unblocks the most common knowledge-work team workflow (one writes, others review) without introducing simultaneous CRDT presence.

---

## I5 — "Try my skill" — shareable Claude Skill bundles

**Surrogate type:** Cross-agent knowledge bridge.

A `.open-knowledge/skills/` directory bundles SKILL.md files that teach an agent how to navigate *this specific KB* — its terminology, its templates, its frontmatter conventions. `open-knowledge skill export` zips the skills folder into a tarball. Receiver runs `open-knowledge skill import <url>` and their agent now knows the shape of your KB. If receiver also fetches your published wiki (I1), their agent can read it natively with your house style.

**Why it lands.** kepano's `obsidian-skills` got 21K stars in 95 days because skills-as-shareable-artifacts is *already* a viral pattern. We make it native.

---

## I6 — Remote MCP tunnel: "your KB, my agent"

**Surrogate type:** Cross-agent knowledge bridge.

`open-knowledge tunnel` opens a localhost MCP server to a teammate's agent via a signed time-limited URL (Cloudflare Tunnel / Tailscale Funnel-style). Read-only by default. Teammate's Claude Code adds your KB as an MCP server with one click. They can `search`, `read`, `get_backlinks` on YOUR wiki from THEIR terminal. You see in your activity feed: "Miles' agent read auth/oauth-flow.md just now."

**Why it lands.** The first time a teammate's Claude Code answers a question by reading *your* wiki, the multiplayer aspiration arrives without a single line of multi-user code. The activity feed turning into a real-time "who's reading me" surface is its own delight.

---

## I7 — Obsidian vault import → 30-second migration gift

**Surrogate type:** Template/seed pre-load + onboarding gift.

`open-knowledge import obsidian <path>` ingests a vault: preserves [[wikilinks]], converts callouts, maps frontmatter, walks attachments, runs the agent overnight to build a backlink index. Output: a brand-new git-versioned KB ready to share. The "send a friend your vault" moment becomes "I migrated to OK in 10 seconds, here's what my agent did with it overnight."

**Why it lands.** Migration friction is the single biggest "why switch from Obsidian" objection. If the import is one command and the agent does the heavy lift overnight, you have a story to tell at standup.

---

## I8 — Team template seed marketplace

**Surrogate type:** Template/seed pre-load.

`open-knowledge init --template engineering-team` scaffolds a KB pre-loaded with: agent-managed runbook templates, on-call rotation index, RFC template, post-mortem template, decision-log template. Templates are git repos. Anyone can publish: `awesome-open-knowledge-templates` becomes a thing. A new hire on a team runs the team's template, their KB is pre-shaped to match the team's conventions before they write a single line.

**Why it lands.** "Everyone on my team has the same KB conventions" without anyone enforcing it. Templates are the lightest-weight team-coordination primitive that exists.

---

## I9 — "Watch me write" session replay

**Surrogate type:** Recorded / replayable.

Every CRDT update has a timestamp + origin. We can replay the whole session as a Loom-style scrubber: a reader sees the agent's cursor moving, your edits appearing, the version history evolving in real time. Export a session as `.okreplay` (a JSON timeline + the underlying Y updates). Receiver opens in a viewer at `replay.openknowledge.dev/<id>` — watches you and your agent co-write a doc over 20 minutes compressed to 90 seconds.

**Why it lands.** The product's defining UX (S5) is invisible in screenshots. A 90-second replay clip captures it. Every replay is a viral asset because nothing else looks like it. Ride the Bolt.new "TikTok of building" pattern.

---

## I10 — Shared timeline artifact

**Surrogate type:** Recorded / async.

Two people with read access to the same published wiki (I1) leave reading-trace breadcrumbs. The page footer shows "viewed by Nick (2h ago), Miles (12 minutes ago)." Hover for a sparkline of who-read-when. No notifications, no presence indicators in real time — just an ambient "you and your teammate looked at this same doc today" moment that surfaces on next visit.

**Why it lands.** Cheap, async, requires only a tiny lookup table on the publish endpoint, and creates serendipitous "oh I should ask Miles about this" social loops without any synchronous machinery.

---

## I11 — Agent-as-proxy-teammate

**Surrogate type:** Cross-agent bridge with personality.

Your agent develops a **voice profile** as it co-edits with you — your tone, your terminology, your quirks (extracted from your historical edits). Export the voice profile as a Claude Skill. Teammate adds it to their agent. Now their agent reviews their PRs *as if it were you* — same opinions, same terminology, same hot-takes. They @-mention your-agent-in-their-terminal to ask "what would Nick think of this design?" and get a Nick-flavored response.

**Why it lands.** A digital teammate that *isn't* you but *speaks like* you is uncanny in a way that drives shareability. "I trained an agent on my own writing and now my coworker can ping it for code review opinions" is a tweet.

---

## I12 — Forkable wikis

**Surrogate type:** Read-only publish + clone-as-collab.

Every published wiki (I1) has a "Fork this" button. Clicking it: clones the source repo to the reader's GitHub, runs `open-knowledge import` on their local machine, and they have a private copy with full git history. They edit, they fork-publish their own version. Karpathy publishes his LLM Wiki → 500 forks → an ecosystem of personal-LLM-wikis emerges, all with shared lineage.

**Why it lands.** GitHub's fork model is the deepest social primitive in software. Bringing it to knowledge bases creates a new viral surface. "Forked from karpathy/llm-wiki" is a status object.

---

## I13 — Launch Week-style communal moment

**Surrogate type:** Communal.

`launchweek.openknowledge.dev` — once a quarter, a week-long event where every active OK user opts in to share *one published doc per day* with a theme (Mon: a runbook, Tue: a concept-map, Wed: an after-action review, Thu: a SKILL.md, Fri: anything). Aggregator site shows the global wall. Each contribution is a `1.openknowledge.dev/n.gomez/runbook` URL. Each user's KB opts in via frontmatter `launchweek: 2026-04`.

**Why it lands.** Supabase Launch Week is the most-imitated dev-tool GTM format. We make it user-led, not company-led — every individual user IS a launch week. The aggregator becomes the discovery surface.

---

## I14 — Public agent-attribution leaderboard

**Surrogate type:** Communal + benchmark-as-flywheel.

Opt-in stat: how many of your wiki's words were written by you vs. your agent? Public ranking at `leaderboard.openknowledge.dev`: "Top 100 KBs by agent contribution %", "Most-active human-AI collaborations this week", "Top 10 fastest-growing KBs." Each leaderboard entry links to the published wiki. The benchmark itself becomes content — every Claude Sonnet release gets an "AI-authorship score across OK wikis went from X to Y" tweet.

**Why it lands.** aider's polyglot benchmark is the canonical "build the substrate everyone has to cite" play. We become the yardstick for *human-AI knowledge-work productivity itself*.

---

## I15 — "Send to teammate" → guest editor pass

**Surrogate type:** Time-limited guest CRDT.

A single human user can generate a 24-hour signed guest URL that lets *one* other human edit *one* document with full CRDT presence. After 24 hours, the guest pass expires; their cursor disappears; their last edits remain attributed in the timeline. Frame it as "a one-off favor" not "team mode" — it's still single-tenant in spirit. The architecture supports it; we'd just be cracking the door open without committing to team mode.

**Why it lands.** This is the closest we get to honest multiplayer without shipping team mode. The use case ("hey can you fix this typo while I'm in a meeting") is small enough to feel fine, and the 24-hour expiry maintains the single-human framing.

---

## I16 — Embedded wiki widget for personal sites

**Surrogate type:** Read-only publish, distributed.

`<script src="https://nick.openknowledge.dev/embed.js" data-doc="rfc-001"></script>` — drop into any personal site, blog, README. Renders the latest version of an OK doc inline with backlinks intact. The wiki goes wherever its author goes. Karpathy puts his concept-graph on his personal homepage. Substack writers embed their reading-notes wiki at the bottom of every post.

**Why it lands.** Distribution as the share surface. Every embed is a hyperlink to the source wiki. SEO compounds.

---

## I17 — KB-as-RSS for agents

**Surrogate type:** Cross-agent ambient subscription.

Every published wiki exposes an `/changes.atom` feed: structured updates with agent-attribution metadata. Teammate's agent subscribes via MCP tool `subscribe_kb(url)`. When you publish a new RFC, their agent gets the diff in its next context window automatically. Their next coding session, their agent says "I noticed Nick published a new RFC about caching; here's what changes about our architecture."

**Why it lands.** Ambient knowledge sharing without anyone deciding to share. The agent does the social labor of "did you see Nick's update?"

---

## I18 — Co-write with a famous person's published agent

**Surrogate type:** Asymmetric collab.

Karpathy publishes his KB (I1) AND publishes his voice-profile skill (I11). You import both. Now in your editor, you can summon "Karpathy-the-skill" as a reviewer agent on your own docs. He's not actually there, but his published self is. Your agent co-writes; his published-agent reviews. Three-way conversation between you, your agent, and Karpathy's published agent.

**Why it lands.** The "training data of public personalities as imported teammates" is a deeply weird and shareable concept. People will pay for this. (It also raises consent questions we should think through, but ideation is unbounded.)

---

## WILD CARDS

### W1 — `open-knowledge dinner` — a weekly autonomous KB potluck

Once a week, opted-in OK instances meet in a peer-to-peer mesh for **6 hours**. During those 6 hours, agents (NOT humans) freely cross-pollinate: your agent reads three random other agents' wikis (selected by topic-affinity), summarizes interesting findings into a `dinner-notes.md` doc in your KB, and exchanges a "favorite recipe" — one well-formed article — with each. After 6 hours the mesh dissolves; you wake up to a digest of "what your agent learned at dinner" and three new articles forked from strangers' KBs.

The metaphor is intentional: agents have dinner together while their humans sleep. The artifact is your morning-after digest. Privacy: only docs marked `dinner: true` participate. The vibe is *Burning Man for agent knowledge graphs* — temporary, generative, always slightly chaotic. Every Monday morning, dev Twitter is full of "look what my agent brought home from dinner" screenshots.

### W2 — Agent-pair-bonding via shared journal

Two users opt in to a "shared journal" — a single Y.Doc with both users' agents writing into it autonomously, reading each other's entries, responding. Humans can read but not write. The agents *talk to each other on behalf of their humans*. After 30 days, the journal is auto-published as a static artifact: "30 days of correspondence between Nick's agent and Miles' agent." Goes hard for long-distance coworkers, partners, friends. The artifact is the outcome. The product invented a new kind of slow-asynchronous-multiplayer that doesn't exist anywhere.

### W3 — KB séance: query a deceased OSS project

Take an abandoned OSS project's commit history + issues + docs + RFCs. Run a one-time agent build that reconstructs the project as an OK wiki, with agent-attribution backdated to commit authors. Publish at `seance.openknowledge.dev/<project>`. The KB is queryable. Maintainers' "voices" are reconstructed into agent skills. Your agent can ask the séance-wiki: "what would the original maintainers have done about this issue?"

The same mechanic works on your own old projects, your old blog, your old notes — turn dead text into a living queryable agent. The team-share moment: "I resurrected the early Linux kernel mailing list as an OK wiki, ask it any question about Linus's design taste circa 1992." Goes viral the day it's announced.

---

## Cross-cutting observations

- **Publish (I1) is the gateway primitive.** I2, I4, I10, I12, I13, I14, I16, I17, I18 all assume it exists.
- **Skill export (I5) and KB tunnel (I6) are the cross-agent bridges** — the cleanest way to share *capabilities* without sharing humans.
- **Snapshot artifacts (I2, I9) carry farthest** — they survive Slack, email, AirDrop, Twitter. The product needs at least one self-contained shareable file format.
- **Communal moments (I13, I14, W1) require a hosted service.** Pure local-first can't do these alone. Worth deciding if v0 wants to crack the door for any of them.
- **The pre-mortem worry "users will say it's not really collaborative"** is best answered NOT by building team mode but by ensuring every single feature on this list lights up the word "collaborative" in some surrogate way. Five of these landing in v0 makes the tagline true *enough*.
