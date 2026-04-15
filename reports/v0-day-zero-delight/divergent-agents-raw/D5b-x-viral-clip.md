# D5b — X/Twitter viral tweet + 30-second Loom/GIF clip

> **Lens.** X is where dev-tool launches happen now. The 30-second demo clip + a single sharp tweet is the 2024-2026 launch unit. Bolt.new did this. Karpathy/Cursor did this. v0.dev did this. Kepano-on-Obsidian-Skills did this with literally a tweet and a repo URL. What's *our* clip-and-tweet?
>
> **Stance.** UNBOUNDED divergent ideation. Every clip below is paired with a candidate tweet. Mix of "demo a thing," "pick a fight," "show a number," "screen-capture-as-poetry." 18 ideas + 3 wild cards.

---

## §0 — What makes a clip-and-tweet go viral on dev-X (operating principles)

Pulled from the evidence file so each idea below can be evaluated against them:

- **The clip is the tweet.** Tweet text is 90% redundant with what's in the video. The video has to land in the first 3 seconds.
- **One unbroken screen capture.** Cuts kill the "could be real?" feeling. Bolt's clip is one continuous take.
- **Numbers beat adjectives.** "$80K ARR day 2", "10 seconds", "42K stars", "7 years overnight."
- **One-sentence frame, then the artifact.** "I just X" / "Did you know X" / "New: X" — then the video.
- **Pick a felt gap.** Karpathy named what a million devs were already feeling. Kepano filled the official-answer slot for an obvious hole.
- **The whoa is often an *absence*.** Karpathy's vibe-coding clip's whoa is the absence of keyboard. Ours might be the absence of "wait for the agent to finish."
- **A shareable artifact per use.** Bolt's URL, v0's permalink. Each user creates a new tweet-bait.
- **Quote-tweet bait > likes.** A take that someone has to QT to disagree with travels further than a take that gets liked and forgotten.

---

## §1 — Eighteen clip + tweet combos

### Idea 1 — "Cmd+Z the agent" (the cleanest 6-second clip we have)

**Clip (15s).** Split-screen NOT needed. One editor. Human types a sentence in blue. Agent (in orange) writes a paragraph below. Human reads it, frowns, presses **⌘Z**. The agent's paragraph vanishes. Human's sentence remains. Human presses **⌘⇧Z**. Agent's paragraph comes back. Total: 4 keystrokes, 6 seconds of action.

**Tweet.**
> ⌘Z just undid the AI. Not your last keystroke. The AI's last paragraph.
>
> Per-author undo in a wiki where humans and agents are both first-class writers.
>
> [video]

**Why it works.** The keyboard shortcut everyone has muscle memory for, doing something everyone has wanted to do at least once. Quote-tweet bait: "Wait this is what undo SHOULD have been the whole time." Single concept, sub-10-second video, no setup needed. **This is our Bolt-equivalent.**

---

### Idea 2 — "Two cursors, both editing" (the defining clip)

**Clip (20s).** Top half of frame: Claude Code terminal session. Bottom half: the Open Knowledge editor in the browser. User in the terminal says "draft a release notes page for v0.4." A page appears in the editor. The agent's caret begins typing the release notes — visible cursor with a small "Claude" tag. Mid-paragraph, the user clicks into the editor and starts typing a sentence *above* the agent's paragraph. Two cursors, two colors, both writing simultaneously. No flicker, no conflict, no "saving…"

**Tweet.**
> Real-time co-editing where one of the cursors is Claude.
>
> Both writing. Both visible. No turn-taking. No "wait for the AI." 60fps Yjs CRDT under the hood.
>
> Local-first, MIT, opens with one bunx command.
>
> [video]

**Why it works.** This is the structural moat. Nothing in the competitive landscape has it. The clip is impossible to fake without actually shipping it. Numbers in tweet = "60fps", "one bunx command."

---

### Idea 3 — "10 seconds, zero to wiki" (the speed-record clip)

**Clip (15s).** Big timer in the corner. `bunx open-knowledge` typed at t=0. Banner appears at t=2s. Browser opens at t=4s. Editor renders at t=5s. Agent on the right says "I made you a welcome page" — page appears at t=8s with a couple of `[[wiki-links]]`. Click a wiki-link at t=11s — new redlink page opens. Timer freezes at 12.4 seconds.

**Tweet.**
> bunx → wiki → first agent edit → first wiki-link click in 12 seconds.
>
> No signup. No account. No cloud. No vendor lock-in. Just a folder of .md files and a friend who can write.
>
> [video, with the timer visible the whole time]

**Why it works.** Bolt's "Airbnb in 30 seconds" template, applied to a wiki. Numbers do all the work.

---

### Idea 4 — "Obsidian → Open Knowledge in one command" (the migration clip)

**Clip (25s).** Finder window open showing `~/Obsidian Vault/` with hundreds of `.md` files. Drag the folder into a new directory. `cd` in. Run `bunx open-knowledge start`. Editor opens. The vault is *there*. Wiki-links work. Backlinks panel populated. File tree mirrors disk. Click a note — it opens. Backlink count: 47. Type a sentence — it persists to the same file Obsidian was reading from. Open Obsidian in the background — same file, same content. Both editing live.

**Tweet.**
> Your Obsidian vault, but agents can edit it with you in real time.
>
> Same .md files. Same git repo. Same `[[wiki-links]]`. No import. No export. No new format.
>
> Open both at once. Edit in either. Files are the source of truth.
>
> [video]

**Why it works.** Defuses the #1 P0 objection ("I have Obsidian + MCP plugins, why switch?") in 25 seconds by *literally not making them switch*. Coexistence is the move. This is a quote-tweet magnet from the Obsidian community itself.

---

### Idea 5 — "Flip mid-write" (the WYSIWYG ↔ source toggle reveal)

**Clip (12s).** Editor showing a half-written paragraph in WYSIWYG. The agent is mid-stream, typing into the next paragraph. User hits the **toggle button**. View flips to source. The agent's caret is *still moving* — now in the raw markdown. User types `## Heading` directly. Toggle back. WYSIWYG shows the new heading rendered, agent still streaming, no jank.

**Tweet.**
> WYSIWYG and source mode editing the same document. At the same time. While an agent is streaming into it.
>
> One Y.Doc. Two views. Bidirectional CRDT bridge. No "render preview." No "switch and lose your place."
>
> Try it: `bunx open-knowledge`
>
> [video]

**Why it works.** This is the *most technically impressive* thing we have to show, and it's invisible in screenshots. A 12-second video makes it visceral. Devs who've fought ProseMirror or CodeMirror will know what's happening and feel it. The reply guys will fact-check; let them — the architecture holds.

---

### Idea 6 — "Karpathy slot — the named-it tweet" (no clip needed)

**Tweet (no video, just a short paragraph).**
> There's a kind of writing I'm calling **agent-paired knowledge work** — where the wiki is shared between you and a model, both cursors visible, both edits attributed, and the act of writing is closer to dictation with a colleague than typing alone.
>
> It's possible because the substrate is finally good enough — local-first CRDTs (Yjs), MCP for tool surfaces, markdown-as-canonical so nothing is ever locked in.
>
> I've been doing it for a week and I don't think I can go back.

**Why it works.** This is the explicit Karpathy-vibe-coding-tweet pattern: name a thing the audience is already feeling, attach it to a tool, let them do the spreading. Doesn't need to be Karpathy himself — could be Nick, could be any single voice with reach. The tweet *is* the moment. Optional: append a 6-second clip showing two cursors typing into the same line.

**Risk.** Naming things has to feel like discovery, not branding. "Agent-paired knowledge work" is fine; "Knowledge Vibes™" would be cringe. Lean academic-blogpost tone.

---

### Idea 7 — "MCP setup is one checkmark per agent" (the boring-magic clip)

**Clip (10s).** `npx open-knowledge init`. Output rolls past:
```
✓ Detected Claude Code → registered MCP in .mcp.json
✓ Detected Cursor → registered MCP in .cursor/mcp.json
✓ Detected Codex → registered MCP in ~/.codex/config.toml
✓ Detected ChatGPT desktop → instructions printed
Open your wiki: bunx open-knowledge
```

**Tweet.**
> `npx open-knowledge init` finds every agent on your machine and wires them into your wiki at once.
>
> Claude Code ✓ Cursor ✓ Codex ✓ ChatGPT ✓
>
> One MCP server. Every agent. Zero copy-paste from a config doc.
>
> [video]

**Why it works.** MCP setup pain is universal and recent. "It just detected my IDE" is a small but viral kind of magic — the kind of thing that makes someone tweet "oh thank god."

---

### Idea 8 — "Inside Claude Desktop / Cursor — the agent opens the editor" (the S9 clip)

**Clip (20s).** Claude Desktop window. User: "Add a section to the auth design doc explaining the OAuth fallback path." Claude responds: "Opening the editor for you." The Open Knowledge editor panel slides open *inside* Claude Desktop, docked to the right. The auth design doc is loaded. Claude's cursor begins writing the new section. The user, watching live, clicks in and corrects a sentence as Claude types. Both visible. Both attributed.

**Tweet.**
> The agent opens the editor for you, in the same window you're already in.
>
> Click "edit the auth doc" → editor panel opens inside Claude Desktop. Watch the agent write. Edit alongside. Close when done.
>
> No context switch. No new tab. No "where did it save."
>
> [video]

**Why it works.** This is the S9 differentiator and it's hard to even describe in words. The video is the only way to convey it. The phrase "no context switch" is shorthand every dev wants.

---

### Idea 9 — "Draft → review → merge" (the GitHub-style clip)

**Clip (25s).** Editor showing the main view. Agent makes a 30-line edit to a PRD page. A small banner appears: "Claude proposed 1 change. **Review.**" Click. A diff view opens — green/red, side-by-side, exactly like GitHub PRs. User accepts 2 hunks, rejects 1, clicks "Merge." The page updates. `git log` panel at the bottom shows a new commit: `agent: Claude — auth-fallback-section (2 of 3 hunks accepted by nick)`.

**Tweet.**
> Agents don't write to your wiki. They open PRs against it.
>
> Diff view, hunk-level accept/reject, every change is a real git commit, attribution baked in.
>
> The agent staging → human review flow as a first-class primitive. Not a setting. The default.
>
> [video]

**Why it works.** Frames the product as "GitHub for agent-written knowledge" — a familiar mental model that immediately answers "what stops the agent from making a mess?" Plus the 1P moat (S4's permission-routed writes) is what makes the clip possible.

---

### Idea 10 — "Timeline scrubber" (the version-history poetry clip)

**Clip (15s).** A page is open. The user grabs the timeline scrubber at the top and drags it backward through the day. Content morphs in reverse: agent's paragraphs disappear, human paragraphs return, then earlier agent edits, then a blank page. Each segment is color-coded — orange for agent, blue for human, with little author tags. Drag forward — edits replay in fast-forward. Total: 24 hours of co-edits scrubbed in 8 seconds.

**Tweet.**
> Scrub through the day and watch your wiki rewrite itself.
>
> Every edit is timestamped, attributed, and undoable. Human in blue. Claude in orange. Cmd+Z respects authorship.
>
> Built on git refs + Yjs activity log. Persists forever.
>
> [video]

**Why it works.** Unique-to-us visual. Nobody else has color-coded human-vs-agent provenance. The clip is *aesthetic* — fast, fluid, color-rich — which makes it travel beyond the dev audience into design-Twitter.

---

### Idea 11 — "The graph view, with agent edits glowing" (the data-viz clip)

**Clip (20s).** Wiki-link graph view. Hundreds of nodes, thousands of edges. User clicks "show last 24h." Some nodes pulse softly — these are pages that changed. Orange pulses are agent edits, blue are human, mixed nodes pulse two-color. Zoom in on one cluster: "all the OAuth pages were edited together by Claude in a single session." Click → see the session.

**Tweet.**
> Your knowledge graph, with the last 24 hours of edits glowing in the colors of who edited them.
>
> Orange = Claude. Blue = me. Mixed = we co-wrote.
>
> Watch your second brain breathe.
>
> [video]

**Why it works.** Pure visual seduction. The graph view is table-stakes for an Obsidian-class product, but adding the *who-edited-recently* layer is unique to a real-time agent-collaborative wiki. This clip travels on aesthetic alone.

---

### Idea 12 — "Build your CLAUDE.md by talking to Claude inside your wiki" (the bootstrap clip)

**Clip (20s).** Empty wiki, just opened. Editor on the left, Claude conversation on the right. User: "Browse my wiki and write a CLAUDE.md that captures my conventions." Agent's cursor scans through pages — the file tree shows files highlighting one by one as Claude reads them. Claude opens a new file `CLAUDE.md`, starts writing it live, the user watches. The file is a real CLAUDE.md with "this user uses [[wiki-links]] for nouns, prefers second-person headings, ..."

**Tweet.**
> Claude reads your wiki and writes its own onboarding doc.
>
> 200 markdown files → 1 CLAUDE.md → every future agent starts oriented.
>
> Bootstrap took 90 seconds.
>
> [video]

**Why it works.** Touches the kepano-archetype directly: agents need a dialect doc, and we ship the *bootstrapping* of that doc as a one-shot. Plus it gives a concrete reason for someone to try the product on existing content.

---

### Idea 13 — "The 'wait, this is OSS?' tweet" (positioning shot)

**Tweet (long-form, no clip — or a single still showing the GitHub repo + license).**
> What we shipped today, MIT-licensed, no SaaS, no telemetry, no signup:
> • TipTap WYSIWYG with live source-mode toggle
> • Yjs CRDT for real-time human + agent co-editing
> • MCP server with 10 first-class tools
> • Per-author Cmd+Z (undo Claude, not yourself)
> • Git-backed version history with attribution
> • Wiki-links, backlinks, graph view
> • Embeddable editor panel for Claude Desktop / Cursor
>
> `bunx open-knowledge` and you have all of this in 10 seconds.
>
> github.com/inkeep/open-knowledge

**Why it works.** The list is the flex. Every line item is a competitor's *roadmap*. The tweet works without a video because the inventory itself is the surprise. Reply guys will demand a demo — link the 6-second Cmd+Z clip in the first reply.

---

### Idea 14 — "Obsidian + Open Knowledge open at the same time, both editing the same file" (the coexistence clip)

**Clip (20s).** Two windows side by side: Obsidian on the left, Open Knowledge on the right. Open the same `auth.md` in both. Type a sentence in Obsidian — appears in Open Knowledge after a beat. Claude in Open Knowledge writes a paragraph — appears in Obsidian after a beat. The wiki-link graph in Obsidian's view updates. Both apps are reading the same files on disk; the chokidar/file-watcher loop closes the bridge.

**Tweet.**
> You don't have to leave Obsidian to use this.
>
> Open both. Edit both. Files are the substrate; nobody owns them.
>
> Open Knowledge adds: real-time agent collaboration, MCP, per-author undo. Keep using your favorite plugins.
>
> [video]

**Why it works.** The single most important objection-defusing clip we can ship. Frames the product as *additive*, not *replacing*. Obsidian community can't argue with "use both."

---

### Idea 15 — "The benchmark tweet — agent collab leaderboard" (long-game flywheel)

**Tweet (and a leaderboard URL — no clip yet, this is a launch *follow-up*).**
> We built a benchmark for "how well does this agent collaborate with a human in real time on a wiki."
>
> Tasks: draft a section, accept partial diffs, undo cleanly, leave breadcrumbs other agents can follow.
>
> Day-1 leaderboard:
> 1. Claude Sonnet 4.6 — 89%
> 2. GPT-5 — 71%
> 3. Codex — 68%
>
> openknowledge.dev/bench

**Why it works.** Aider's playbook. Once a benchmark exists and the leaderboard is plausible, every model release reignites the conversation and someone *has* to cite us. Not a launch-day clip — a 30-day-after move that compounds the launch.

---

### Idea 16 — "The 'write the launch tweet from inside the product' meta clip"

**Clip (25s).** Open Knowledge editor on screen. User: "Claude, draft my launch tweet for Open Knowledge." Claude reads the README, the recent commit log, and the changelog visible in the wiki. Drafts a tweet in a new page titled `launch-tweet.md`. User edits two words. Right-click → "Send to X." A confirmation modal pops with the tweet preview. User clicks send. Cuts to the tweet on X — the same one, just posted.

**Tweet.**
> I asked Claude to write the launch tweet for the product Claude was using.
>
> [the tweet shown in the video is *literally the tweet you just read*]
>
> Demo: [video]

**Why it works.** Recursive, self-aware, peak X-bait. The kind of thing that gets quote-tweeted with "ok this is fine actually" and then everyone watches the video to see if it's real.

---

### Idea 17 — "Subtweet Notion / Mintlify with a single comparison frame"

**Clip (8s).** Three windows lined up on screen: Notion, Mintlify, Open Knowledge. Same prompt sent to each via MCP: "edit the auth doc — add a paragraph." Notion writes it as the user (no attribution). Mintlify says "MCP is read-only." Open Knowledge writes it with an orange "Claude" tag, an inline diff, and a "Review" button. Frame freezes on the three results side by side.

**Tweet.**
> "MCP-enabled" means three different things in 2026.
>
> Notion: agent writes as you. No attribution.
> Mintlify: agent can read, can't write.
> Open Knowledge: agent writes to a draft, you review, you merge. Attribution baked in.
>
> Pick the one your audit log can defend.
>
> [video]

**Why it works.** Quote-tweet bait that punches up at named competitors. Risky — pick-a-fight tweets cut both ways — but the differentiation is real and provable. The 8-second clip is the proof.

---

### Idea 18 — "The kepano-style solo announcement"

**Tweet (no production, no choreography, posted from a personal account).**
> I've been building this for the last few months. It's an open-source local-first wiki where Claude (or any MCP-capable agent) is a first-class collaborator — same Y.Doc as you, presence cursors, per-author undo, real-time co-editing.
>
> MIT. `bunx open-knowledge` to try it.
>
> github.com/inkeep/open-knowledge

**Why it works.** Kepano's obsidian-skills launch was *one tweet from his personal account*. 21K stars in 95 days, zero traditional marketing. The personal-stake framing is the engine. We have founders / maintainers who can carry this — Nick, Miles, anyone with reach. Underplaying the launch makes it more shareable than the production version.

---

## §2 — Three WILD CARDS

### WILD 1 — "Claude-watching-itself benchmark stream"

**24-hour live stream on X.** A blank wiki. Claude is given a single prompt: "build the most useful internal wiki you can in 24 hours." A camera-on-the-screen view of Claude editing the wiki, second-by-second, on Open Knowledge. Real-time edits visible to viewers. At hour 12 a human jumps in and edits alongside. At hour 24 we publish the wiki and the recording.

**Tweet (pinned for 24 hours).**
> Right now: Claude has 24 hours and Open Knowledge to build the world's best internal wiki from a single prompt.
>
> Watch live. Co-edit if you want — the wiki is open at openknowledge.live. Whatever exists at midnight ships as a public template.
>
> [stream link]

**Why it's wild.** It's a launch *and* a stunt *and* a benchmark *and* a content drop. The wiki it produces becomes a public reference. The stream becomes a 24-hour highlight reel for clip-mining. Genuinely high upside, real downside (what if Claude writes 8 hours of garbage on stream).

---

### WILD 2 — "The April-Fools-but-real co-pilot mascot"

**Clip (15s).** User opens Open Knowledge. In the bottom-right corner: a tiny ASCII raccoon (or whatever — the Clawd-equivalent for our wiki). It watches the user type. The user writes "auth.md is for OAuth flows." The raccoon's speech bubble: *"I'd add a backlink to [[OAuth Tokens]] if I were you."* The user clicks the suggestion. Backlink appears. The raccoon waves.

**Tweet.**
> meet **wiki**, your tiny markdown raccoon.
>
> she lives in your wiki. she suggests backlinks. she remembers you. there are 12 species. there is a 1% chance yours is shiny.
>
> ships april 1. is permanent.
>
> [video]

**Why it's wild.** Direct port of the `/buddy` playbook from Claude Code. Cosmetic-but-deterministic-and-persistent. The collection-loop emerges (12 species, shiny rolls). Risk: feels derivative if launched too close to `/buddy`. Mitigation: ours actually *does something useful* (backlink suggestions tied to the worldmodel) — `/buddy` is purely cosmetic.

---

### WILD 3 — "The 'no tweet' launch — release into the void"

**Counter-strategy.** Don't tweet at all on launch day. Instead, ship a perfect README, a perfect 30-second video on the GitHub repo's social-preview card, and a single Show HN post. Let the GitHub stars graph and the HN front page do the talking. *Then* on day 3, post: "we shipped on Tuesday. Here's what happened in 72 hours: [stars graph]."

**Tweet (day 3).**
> We shipped Open Knowledge on Tuesday with no announcement.
>
> 72 hours later: 4,200 GitHub stars, 18K Show HN points, and the #1 question is "wait why didn't you tell anyone."
>
> Because we wanted you to find it.
>
> [stars-graph chart, HN screenshot, repo link]

**Why it's wild.** Inverts the "single tweet" playbook by making the *absence* of a tweet the story. Bolt's "single tweet, no marketing" got copied into a meme; "no tweet at all, yet it took off" is the next level. Only works if the substrate (HN post + README + GitHub social card) actually carries it. Genuinely high-variance.

---

## §3 — Cross-cut taxonomy (so the consumer can pick a strategy)

Sorting the 18 + 3 by what they *do*:

| Category | Ideas | What it builds |
|---|---|---|
| **Differentiator demos (show the moat)** | 1, 2, 5, 8, 9, 10, 11 | "No competitor has this." Best for technical audience, best for screenshot-doesn't-do-justice features. |
| **Speed/onboarding records** | 3, 4 | "It works in 10 seconds." Best for objection-defusing. |
| **MCP / agent-setup magic** | 7, 12 | "Setup is the demo." Best for the recently-burned MCP audience. |
| **Coexistence / non-threatening framing** | 4, 14 | Defuses the Obsidian objection. |
| **Karpathy-style naming / single-voice** | 6, 18 | High-leverage, low-production-cost. |
| **Comparison / pick-a-fight** | 17 | Quote-tweet engine, real risk. |
| **Inventory / "wait this is OSS"** | 13 | Works without a video. The list is the flex. |
| **Long-game flywheels** | 15 | 30-day-after, not day-zero. |
| **Recursive / meta** | 16 | Pure X-bait. Cheap to produce, hits the X audience hard. |
| **Wild swings** | W1, W2, W3 | Stunts. Variable EV. |

---

## §4 — What I'd rank in my own head if forced (consumer can ignore)

If I had to point at three combos that maximize *p(viral × on-message × cheap-to-produce)*:

1. **#1 (Cmd+Z the agent)** — sub-10-second clip, single concept, the keyboard shortcut everyone has muscle memory for, demonstrates the per-origin undo moat that nobody else has. Could be the day-1 clip. Lowest production cost, highest probability of landing.
2. **#4 (Obsidian → Open Knowledge in one command)** — answers the #1 P0 objection in 25 seconds by *not requiring a switch*. Quote-tweet magnet from the Obsidian community itself. Coexistence framing > replacement framing.
3. **#2 (Two cursors, both editing)** — the *defining* clip of the whole product. If we only had one demo to ship, this is it. The screenshot version doesn't work; only the video conveys it. Pair with the Karpathy-style #6 tweet for maximum compound effect.

Honorable mentions: **#9 (Draft → review → merge)** as the MCP-permissions story for an enterprise/security-conscious audience, **#13 (the "wait this is OSS?" inventory)** as the LinkedIn / HN crosspost, and **WILD 1 (24-hour stream)** if the team has appetite for one big stunt.

---

## §5 — Appendix: tweet copy-templates the team can riff on

Pulling out the patterns so the consumer can mix-and-match:

- **The Karpathy frame.** *"There's a kind of [X] I'm calling [name]. [One sentence about what it feels like.] [One sentence about what made it possible now.] I've been doing it for [time] and [emotional payoff]."*
- **The Bolt frame.** *"[Verb] [thing] in [time]. No [pain]. No [pain]. Just [thing]. [video]"*
- **The "I just" frame.** *"I just [did the thing]. [video]"*
- **The inventory frame.** *"What we shipped today, [license], [no-strings caveat]: • [item] • [item] • ... [bunx command]"*
- **The pick-a-fight frame.** *"'[term]' means three different things in 2026. [Brand A]: [shortcoming]. [Brand B]: [shortcoming]. Us: [differentiator]. Pick the one your [audit/team/budget] can defend."*
- **The speed-record frame.** *"[bunx command] → [outcome] → [outcome] in [N] seconds. [video, with timer visible]"*
- **The coexistence frame.** *"You don't have to leave [incumbent] to use this. [How they coexist.]"*
- **The benchmark frame.** *"We built a benchmark for [thing]. Day-1 leaderboard: 1. [model] — N%. 2. ... [link]"*

---

*End D5b. 18 ideas + 3 wild cards. Mix-and-match encouraged.*
