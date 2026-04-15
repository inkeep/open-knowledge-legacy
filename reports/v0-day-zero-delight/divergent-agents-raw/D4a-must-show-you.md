# D4a — "Must Show You" / DM-Worthy Moments

> *Divergent ideation for Open Knowledge v0. Lens: what makes a user paste a link or screenshot in a private DM / team Slack to a specific coworker who they know will care?*
>
> Sharing with teammates ≠ social-media virality. The receiver is named. The trust is high. The context is shared. The share-trigger is "Sarah will lose her mind when she sees this." Status dynamics matter — the SENDER wants to look interesting / tasteful / on-top-of-things.
>
> Date: 2026-04-14. Status: raw idea fan-out. Not pre-filtered.

---

## Frame: what triggers a private DM (vs a public tweet)

A private share is paid for by the sender's *taste tax*. They're spending a small amount of social capital saying "I think you should look at this." The receiver judges the sender by the link.

So the artifact has to do one of:

1. **Solve a problem the receiver was just complaining about** ("you mentioned your SKILL.md sprawl yesterday — look")
2. **Feel like an inside joke only this audience would get** (Karpathy fans, Claude Code power users, Obsidian refugees)
3. **Be an artifact the sender helped make** ("look at this wiki my agent and I built last night")
4. **Be visually weird enough that the screenshot itself is the message** (no caption needed)
5. **Make the sender look like they're already living in the next era** (status signaling: "I'm using this thing you haven't heard of yet")
6. **Be tiny enough to not feel like homework** ("just paste this one line in your terminal")
7. **Confirm a private hypothesis** ("I told you AI co-editing was real now — receipts")

Every idea below is engineered against one of those seven triggers.

---

## The 18 ideas

### 1. The "co-edit replay" — 8-second GIF baked into the editor

**Pitch.** Every Y.Doc carries an in-memory ring buffer of the last 60 seconds of CRDT ops with attribution. Cmd+Shift+G captures the last N seconds and renders a tiny screen-cap GIF of *the actual cursor dance* — your cursor and Claude's cursor both editing the same paragraph, with origin shading flashing green for agent / blue for human. Optimized for 4MB max, looped, captioned with the file name.

**Emotional target.** "Holy shit, that's real-time human+AI co-editing" — the receiver has never *seen* it before, only heard about it. The four locked differentiators (S5) become a single share-able loop.

**Reference.** v0.dev's shareable component URL pattern; Excalidraw's "share as GIF" export; Karpathy's vibe-coding tweet (the absence of keyboard) — but here it's the *presence of two cursors*.

**Demo sentence.** "Cmd+Shift+G after any agent edit → 8-second GIF on your clipboard, ready to paste in Slack."

---

### 2. The "shareable wiki snapshot" URL — `share.openknowledge.dev/<hash>`

**Pitch.** Right-click a wiki page → "Share read-only snapshot." Server captures the rendered MD + frontmatter + backlinks at this moment, posts to a public read-only renderer at `share.openknowledge.dev/<8-char-hash>`. The page renders with a tiny "made with [[ Open Knowledge ]]" footer (curly-brace styled — wiki-link as logo). Snapshot expires in 30 days unless you check "keep forever."

**Emotional target.** The Bolt.new effect — every action produces a permalink. The DM share isn't "look at my product," it's "look at this *page* I wrote with an agent." Page becomes the artifact; product becomes the substrate.

**Reference.** v0.dev permalinks; Excalidraw shared scenes; CodeSandbox embed URLs.

**Demo sentence.** "Right-click → Share. URL on clipboard. Receiver doesn't need to install anything to read it."

---

### 3. The "agent-attribution diff card" — every agent edit gets a Linear-style permalink

**Pitch.** Every agent-attributed edit (server records actor + timestamp + before/after slice in the activity Y.Map) gets a stable permalink: `/edits/<docName>/<edit-id>`. The page renders a beautiful before/after diff card with the agent's avatar, the Claude/Cursor/etc. badge, the timestamp, the file path, and a syntax-highlighted unified diff. Cmd+Shift+L on any flashed agent edit copies the link.

**Emotional target.** "Look what Claude did to my notes." The diff card looks Linear-grade (dark mode, monospace, generous padding). Sending it to a coworker is sending *evidence* — "this is the new normal, screenshot saved."

**Reference.** Linear issue permalinks; GitHub commit deeplinks; Sentry issue cards. The Cursor "Composer accepted all" archetype made tangible.

**Demo sentence.** "Hover any green-shaded paragraph, hit Cmd+Shift+L, paste in Slack — your teammate sees a Linear-grade diff card with Claude's avatar."

---

### 4. The "morning-after" — agent draft summary email/DM you forward unchanged

**Pitch.** If you opt in, the MCP server bundles a daily "what your agents did" summary as a single Markdown file (`overnight/2026-04-14.md`) with: top 3 changed pages, new wiki-links discovered, redlinks that got resolved, a one-line synth ("Claude added 14 backlinks to your auth notes overnight"). Designed to be screenshotted or forwarded *as-is* to a teammate.

**Emotional target.** "My agent wrote a better version of my notes while I slept" — the morning-after tweet pattern, but private. The sender looks like they have a *team*, not just a tool. Status moves from "uses AI" → "directs AI."

**Reference.** Linear daily digest emails; Cron-style "your roundup"; Obsidian Daily Notes plugin culture.

**Demo sentence.** "Each morning OK drops a single overnight summary file you can forward verbatim to your manager — no editing."

---

### 5. The "membership card" — Arc-style end-of-onboarding artifact

**Pitch.** Last step of `open-knowledge init` renders a personalized "knowledge card" PNG (1200×630, OG-image-friendly): your animal-icon avatar (the existing presence avatar), your KB name, your join date, a fingerprint hash, a Card No. (e.g. "OK-2026-00042"). Saved to `~/.open-knowledge/card.png`. CLI prints "Your card: ~/.open-knowledge/card.png — share it."

**Emotional target.** Belonging. "I'm member #42." Sender posts to team Slack: "look at the onboarding artifact this thing made." Receiver feels FOMO and wants their own.

**Reference.** Arc's membership card at end of onboarding (the most-imitated 2024 onboarding moment); Spotify Wrapped cards; Linear's "you're employee #N" badges.

**Demo sentence.** "After init, you get a 1200×630 PNG card with your number, your animal, and your KB name. Made to be pasted in Slack."

---

### 6. The "I built this in a night" project-card

**Pitch.** When you hit a milestone (10 pages, 50 backlinks, first agent edit accepted), a tasteful toast offers: "Generate a project card." Output is a single PNG that shows your KB's wiki-link graph (anonymized — no titles, just nodes + edges), your stats, and a one-liner ("21 pages, 84 backlinks, co-edited with Claude"). Like a Strava run summary.

**Emotional target.** Pride of craft. "Look what I built last weekend." The graph is visually striking enough to share without context. Sender looks productive, tasteful, *finished*.

**Reference.** Strava run cards; Wakatime stats; GitHub year-in-review.

**Demo sentence.** "After your 50th backlink, OK offers a Strava-style PNG of your KB graph for sharing."

---

### 7. The "you can Cmd+Z the agent" 6-second GIF

**Pitch.** First time a user accepts an agent edit, a tasteful coachmark appears: "Tip: Cmd+Z undoes Claude's edit specifically — without touching yours." If they actually use it, the next session shows a "🎓 Power user unlocked: per-origin undo" toast with a "Show your team how" button → captures a 6-second GIF of per-origin undo working live (their cursor undoes only the green-shaded text).

**Emotional target.** The Cursor "vibe coding" tweet equivalent — naming a capability that already feels like magic. "Did you know you can Cmd+Z the agent?" is exactly the sentence a coworker DMs to another coworker.

**Reference.** Cursor's "Accept All"; Karpathy's vibe-coding framing; Notion's first-time-feature toasts.

**Demo sentence.** "First time you Cmd+Z an agent edit, OK offers to record a GIF showing it working — for forwarding."

---

### 8. The "novel commit log" screenshot

**Pitch.** When you `Save Version`, the resulting git commit log entry includes co-author trailers for any agent that contributed: `Co-authored-by: Claude (claude-sonnet-4-5) <agent@anthropic>`. `git log --pretty=fuller` shows your name + Claude's name on the same commit. A built-in `open-knowledge log --pretty` command renders this in the terminal with avatars and color, screenshot-optimized.

**Emotional target.** "Look at my commit log — Claude is a co-author." The screenshot is novel enough that engineers will share it without explanation. Sender looks like they're operating in 2027 already.

**Reference.** GitHub co-authored-by trailers; Pair-programming commit conventions; the broader cultural moment of "is the AI a coworker or a tool?"

**Demo sentence.** "`open-knowledge log` prints your git history with Claude as a co-author on every collaborative commit."

---

### 9. The "redlink resolution" satisfaction loop

**Pitch.** When you write `[[Quaternions for Cameras]]` and the page doesn't exist, OK shows the redlink. Click it: agent (via MCP) is invited to "draft this for me." 30 seconds later the redlink turns blue and shows a tasteful "✨ drafted by Claude — review" badge. The before/after micro-moment (red → "Claude drafting…" → blue) is captured as a 3-second GIF auto-saved to clipboard.

**Emotional target.** "Look how this works." The visual transition is immediate, satisfying, low-cost to share. The mechanism (agent fills your gaps automatically) is the entire OK pitch in one micro-interaction.

**Reference.** Notion AI's "fill this in"; Wikipedia redlinks (the original); Cursor's tab-completion feedback loops.

**Demo sentence.** "Click any redlink — Claude drafts the page in 30 seconds. The transition GIF auto-copies for sharing."

---

### 10. The "auto-discovered backlinks" surprise toast

**Pitch.** When the agent (via MCP) discovers and inserts wiki-links between three previously-disconnected pages, a quiet toast: "Claude auto-linked 3 articles you wrote." Click it → a mini graph showing the three nodes lighting up with edges between them. The mini-graph is shareable as a 4-second animated SVG.

**Emotional target.** "My KB just auto-linked these three articles" — the morning-after tweet. The sender looks like their KB has *agency*. Receiver thinks: "wait, the wiki is doing this on its own?"

**Reference.** Roam's bidirectional-link reveal moment; the Obsidian graph's first-time-zoom moment; "the graph is alive" trope.

**Demo sentence.** "The first time Claude connects three of your pages, OK shows you the link-up animation as a mini graph you can share."

---

### 11. The "weird charming error" library

**Pitch.** Every error message that surfaces to the user gets a tiny, tasteful character — not Clippy, but more like Linear's empty-state copy. Examples:
- ServerLockCollisionError → "Someone else is already editing here. (Probably you, in another terminal.)"
- Symlink escape → "That path leads outside your knowledge base. Politely declining."
- Schema validation fail → "MDX got weird. The original is preserved as a raw block — nothing lost."
- Missing MCP server → "No agent connected yet. Run `claude mcp add open-knowledge` and wave hello."

**Emotional target.** Screenshot-as-message. Errors that are *funny enough to share* without commentary. Sender looks like they pick tasteful tools.

**Reference.** Linear empty states; Fly.io error messages; Slack 404 forest animals; Lego "Oh Bricks!"; GitHub's Octocat 404. The Octocat rule: "show personality through context, not dialogue" — apply that to errors.

**Demo sentence.** "Every error message reads like it was written by someone who likes you. Screenshots-worthy, not stack-trace-worthy."

---

### 12. The "agent commentary on your draft" — observable proof of co-creation

**Pitch.** When an agent reads your draft (via MCP `read_document`) and decides not to edit, it can drop an inline `<!-- claude:thought -->` comment in the activity feed (NOT in the file): "Considered restructuring §3 but you seem to be intentionally building tension. Skipping." Visible in a sidebar tab, not noisy. The thought is timestamped, attributed, and individually shareable as a quote-card.

**Emotional target.** "Claude *considered* this and chose not to act" — agency made visible. Sender shares a Claude-thought card and looks like they have a *thoughtful collaborator*, not an autocomplete. Status: working with a peer, not a tool.

**Reference.** Cursor's "thinking" step shown to user; Claude's `<thinking>` blocks made culturally famous; the broader "show your work" movement.

**Demo sentence.** "Claude leaves you tasteful inline thoughts about your draft — not changes, just notes. Each one is its own shareable card."

---

### 13. The "10-second install demo" — a single line worth pasting

**Pitch.** The whole product reduces to one line that *just works*:
```
bunx @inkeep/open-knowledge
```
No `init`, no flags, no questions. It detects you're in a git repo, scaffolds, registers MCP for whichever editor it can autodetect, opens the browser, drops you in a welcome doc that contains live agent-edit examples. The whole sequence is choreographed to be screen-recordable in 10 seconds for sharing.

**Emotional target.** The "just paste this" share. Sender looks generous: "I'm saving you a weekend." Receiver gets value with zero friction. The sentence "it took 10 seconds" is itself the share.

**Reference.** `npx create-next-app`; the bun installer; the homebrew `brew install` trope; Bolt.new's single-tweet launch.

**Demo sentence.** "One bunx command. 10 seconds to a working agent-collaborative wiki. Worth pasting in your team channel."

---

### 14. The "demo agent writes a poem" inside the welcome doc

**Pitch.** The welcome document (auto-created on first run) has a paragraph that says: "Try this — open Claude Code, paste `Add a haiku about local-first software to my README`, and watch." If the user does it, Claude writes a haiku live in their editor, with the agent cursor visible. The first haiku per user is logged and seeded with a tiny library of charming pre-written ones (deterministic per user-id hash, kepano/buddy-style).

**Emotional target.** Surprise + delight + low-stakes. Sender shares "look at the haiku my onboarding agent wrote" — the artifact is intrinsically funny + tasteful + brand-defining.

**Reference.** Claude `/buddy` 18-species deterministic seeding; Cursor's first "Accept All"; the "demo that works in one prompt" Bolt.new lineage.

**Demo sentence.** "First-run welcome doc invites you to ask Claude for a haiku. The haiku is unique to your machine. People DM screenshots."

---

### 15. The "your KB at 30/60/90 days" auto-snapshots

**Pitch.** OK takes a private snapshot of your KB graph at 30/60/90/180 days from first commit. At each milestone you get a quiet notification: "Your knowledge base is 30 days old." Click → side-by-side graph: where you started, where you are now. The animation between the two states is the share-artifact.

**Emotional target.** Past-self meets present-self. "Look how my KB has grown." The sender is sharing *their own progression* — the most personal shareable artifact possible. Receiver feels: "I want a 30-day timeline of my own."

**Reference.** Spotify Wrapped; Strava year-in-review; GitHub contribution graph anniversaries; Day One journal "On this day" emails.

**Demo sentence.** "At 30 days, OK shows you a side-by-side animation of your KB graph then-vs-now. Most users screenshot it."

---

### 16. The "agent-drafted PR for review" — the review IS the artifact

**Pitch.** When an agent stages a multi-file change to a draft branch (S4 permission routing), OK can `gh pr create` with a beautifully formatted PR description: agent identity, conversation excerpt that prompted the change, file-by-file rationale, links back to the OK editor for live review. The PR itself becomes the share-trigger: you DM your reviewer "claude opened a PR on the auth-notes repo, take a look" — and the PR description is *better than what most humans write*.

**Emotional target.** Engineering culture. The reviewer (a coworker) opens the PR and the description tells them everything. Sender looks like they have a *team that ships.* The PR description is the artifact, not the code.

**Reference.** Linear-grade PR descriptions; Sweep.dev's PR drafting; the broader "AI as a team member" cultural shift.

**Demo sentence.** "Claude stages a draft via MCP, opens a PR with a description so good your reviewer thanks Claude personally."

---

### 17. The "old-self surprise" — discovery from your own KB

**Pitch.** Daily, OK runs a tiny background pass: pick a page you wrote >30 days ago, find the most-related page you wrote in the last 7 days, surface a card: "These two ideas you had 6 weeks apart might be the same idea." Both pages linked. Quiet, opt-in, optional.

**Emotional target.** "My KB just told me something about myself." Self-discovery is the highest-trust share — sender DMs a friend: "look what my notes told me about my own thinking." Status: sender has a *system that thinks with them*.

**Reference.** Day One's "On this day"; the "second brain" movement; Roam's "interesting discoveries" pattern; GBrain's Compiled Truth + Timeline pattern (above-the-line current, below-the-line evidence).

**Demo sentence.** "Once a week OK surfaces a card connecting an old idea to a new one — you screenshot the connection because it's a thing you didn't see yourself."

---

### 18. The "your agent is here" arrival animation

**Pitch.** When an MCP-connected agent first joins your Y.Doc session, a small avatar fades in to the presence bar with a tasteful 400ms slide. Above the editor, a temporary toast: "Claude has joined." 1.5 seconds, then dismisses. The animation is captured automatically the first time it happens per user, saved to `~/.open-knowledge/first-arrival.gif`.

**Emotional target.** Witnessable proof of co-presence. The first time a developer sees an *agent join their wiki in real time*, they want to show someone. The auto-saved GIF makes it shareable without setup.

**Reference.** Slack's "X is typing"; Figma's collaborator avatars; Google Docs' presence dots; Linear's "X is viewing this issue" — but for an *agent.*

**Demo sentence.** "First time Claude connects to your KB, OK saves a 1-second arrival GIF you can forward to anyone."

---

## WILD CARDS

### W1 — "OK Cards" — the trading-card meta-economy

**Pitch.** Every wiki page you create generates a *trading card* — a small JSON + PNG artifact with: page title, your KB name, an animal icon, a rarity tier (deterministic from page age + backlink count), and a "stat block" (word count, agent edits accepted, redlinks resolved). The card is publicly viewable at `cards.openknowledge.dev/<hash>` and can be `<embed>`-ed in any Markdown. Coworkers trade cards. Cards from "famous" KBs (Karpathy's, kepano's, etc.) become collector items. There's a private `open-knowledge cards` CLI subcommand that shows your collection.

**Emotional target.** Collection-loop + identity + status signaling, all at once. Same dynamics as `/buddy`'s 18 species × 5 rarities, but the unit of collection is *real intellectual artifacts*. Sender shares a card from their KB; receiver wants to make their own.

**Reference.** Pokémon TCG; Letterboxd's review cards; Claude `/buddy`'s deterministic seeding; the broader "show me your second brain" exhibition culture.

**Demo sentence.** "Every page you write becomes a tradeable card with a rarity tier. Collectors will swap them in DMs."

---

### W2 — Agent-authored "in memoriam" deletion ceremony

**Pitch.** When you delete a wiki page that has >5 backlinks, OK runs a tasteful confirmation flow: instead of "Are you sure?", an agent (via MCP) auto-drafts a 2-sentence "in memoriam" — what the page was about, where its ideas got absorbed into other pages. You can: (a) accept the deletion + the in-memoriam goes into a `_archive/eulogies.md` ledger, (b) cancel and keep the page, or (c) merge the page into one of the linkers instead. The eulogy ledger becomes a shareable artifact in itself: "look at the deletions journal in my KB."

**Emotional target.** Permanence + ritual + craft. Engineers love rituals around destructive actions (Linear's archive, GitHub's "type the repo name to delete"). The eulogy adds *narrative*. Sender shares "look how this thing handles deletion — it gives the page a funeral." Status: working with software that takes its work seriously.

**Reference.** Linear's archive UI; the broader software-craft movement (Charity Majors, Tobi Lutke); Discord's deletion rituals for old servers; Apple's Shortcuts "are you sure" patterns.

**Demo sentence.** "Delete a backlinked page → Claude writes its eulogy → the eulogy ledger is its own artifact people screenshot."

---

### W3 — "Ghost Karpathy" — opt-in famous-KB style mimicry overlay

**Pitch.** A purely cosmetic, opt-in mode: `open-knowledge style --as karpathy` (or kepano, or Tobi Lutke) re-renders YOUR sidebar / page chrome / wiki-link styling to match the public design language of someone famous in the space — using only public taste signals (color palette, font choice, link density). It's the equivalent of an Instagram filter, but for your KB's chrome. The famous person doesn't endorse it; OK ships pre-made "style packs" with attribution. You can screenshot your KB looking like Karpathy's hypothetical KB.

**Emotional target.** Aspirational play. Sender shares "I made my KB look like Karpathy's setup." Receiver: "wait you can DO that?" Status: showing taste through reference. (Cultural lineage: Arc's themes, Linear's color palettes, the broader "dotfiles" sharing culture.)

**Reference.** Arc themes; the dotfiles repo culture (Karpathy literally has one); VS Code theme marketplace; Spotify's "your top artist" identity-by-association moves; the kepano archetype made visually portable.

**Demo sentence.** "`open-knowledge style --as karpathy` re-skins your chrome to match a famous public KB. Pure cosmetic, deeply aspirational."

---

## Cross-cutting observations

- **Most ideas converge on "the artifact has a stable URL."** The DM-share isn't the screenshot — it's the link. Build the permalink layer first; the artifacts compose on top.
- **Avatar-as-identity is already in the product** (animal icons for humans, Claude logo for agents). Almost every shareable artifact above can re-use it.
- **The activity Y.Map is a goldmine.** It already has actor + timestamp + action. Most ideas are ways to render slices of it as shareable cards/GIFs.
- **The "auto-saved on first occurrence" pattern keeps recurring** — first-arrival GIF, first-haiku, first-redlink-resolution, first-Cmd+Z-of-agent. Day-zero produces *automatically* the artifacts a user would otherwise have to capture manually.
- **Status dynamics:** every share above either makes the sender look like they (a) have a system that thinks with them, (b) operate in the next era, (c) have taste, or (d) are productive. None require the receiver to install anything to get value from the share — that's the receiver-respect tax.
- **The Octocat rule applies.** None of these are "OK speaks at you" — they're all "OK shows you something via context, action, and expression." No Clippy. No mascot dialogue. The artifacts speak.
