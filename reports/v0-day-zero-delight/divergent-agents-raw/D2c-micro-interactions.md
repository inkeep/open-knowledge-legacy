# D2c — Warm Micro-Interactions, Easter Eggs, Hidden Delights

*Divergent ideation. Raw. Unfiltered. The lens: the thousand tiny details that accumulate into "this is well-loved." Panic-style. Things 3-style. Octocat's silent pantomime. Designed for Open Knowledge v0.*

---

## Discipline guardrails (the Octocat rule, ported)

Before the ideas: the discipline. Three rules every micro-interaction below honors or knowingly breaks.

1. **Never interrupt competent flow.** Delight appears *in moments of friction the user has already accepted* — startup, empty state, error, save, idle, completion. Never mid-typing. Never mid-sync.
2. **Never speak in serious contexts.** No mascot in a CRDT conflict toast. No mascot in a permission denied. No mascot in a security warning. No mascot in a sync failure that costs the user data. The Octocat brand-book rule: *never in sales, support, enterprise, crisis*. For us: never in sync, security, persistence, conflict.
3. **The fast path is bulletproof or delight reads as mockery.** Every micro-interaction is allowed *only if* the underlying behavior is robust. Cute spinner on a hung server is contempt.

---

## 1. The Animal Migration

**Pitch.** The presence-bar animal-icon system already exists (Bird, Cat, Dog, Fish, Rabbit — deterministic from name). Promote it: when an agent connects for the first time, the matching animal *walks in* from the right edge of the presence bar — three frames, ~400ms — and settles into its slot. When it disconnects, it walks out the other side. Returning agents *fade back in* at their slot (no walk; they live here). First arrival is ceremony; subsequent presence is ambient.

**Emotional target.** Welcome, recognition, "this room knows you."

**Reference.** Animal Crossing villager arrivals; Slack's wandering forest-animal 404; Mac OS 9 Sherlock dog easing in.

**Demo sentence.** Claude joins your KB, a small Bird walks across the top bar and sits down; you instinctively wave at your screen.

---

## 2. Wiki-Link Redlink Hover: "This wants to exist"

**Pitch.** Hover any `[[Page That Doesn't Exist Yet]]` for 600ms. A tiny tooltip appears with a *rotating* one-liner — never the same twice in a session: *"This article wants to exist."* / *"You're the first to imagine this page."* / *"Click to summon."* / *"Empty page energy."* / *"A note without links is a bug. So is a link without a note."* Click creates the page with the agent's first paragraph already drafted (using the surrounding sentence as a prompt — but only IF an agent is connected and consent is configured; otherwise blank).

**Emotional target.** Generative pull. The product *wants the graph to grow*.

**Reference.** Wikipedia's redlinks (factual); obsidian-mind's "A note without links is a bug" slogan; Notion's "/page" inline creation.

**Demo sentence.** You write `[[Postgres Replication]]`, hover, see "This article wants to exist" — and you laugh, and you write it.

---

## 3. The Thinking Indicator Has Verbs

**Pitch.** When an agent is mid-write, the standard "Claude is typing…" is replaced by a rotating, MCP-tool-derived verb: *"Claude is **reading** AGENTS.md"* / *"Claude is **wandering** the backlinks of [[OAuth]]"* / *"Claude is **drafting** a section"* / *"Claude is **stitching** two articles together"* / *"Claude is **untangling** a list."* The verb is derived from which MCP tool last fired (read = reading, list = wandering, write_document = drafting, edit_document = stitching, etc.). Same data layer, warmer surface.

**Emotional target.** Legibility of effort. The agent isn't a black box — it's a craftsperson with hands.

**Reference.** Linear's `Triage → In Progress` enum naming; Things 3's purposeful animation; Cursor's "Thinking…" but with semantic content.

**Demo sentence.** You glance at the bar, see "Claude is wandering the backlinks of [[Auth]]" and think — huh, I should follow it.

---

## 4. The Save-Version Confetti That Isn't

**Pitch.** "Save Version" is the named-checkpoint moment (S6). When you press it, a **single character** appears for 600ms in the upper-right corner — a tiny pin / paper-plane / ribbon glyph — then fades. No confetti. No sound. No modal. Just the punctuation of a sentence that ended cleanly. The version name you typed becomes a quiet achievement in the timeline forever.

**Emotional target.** Quiet pride. Like clicking the satisfying click of a Leuchtturm pen.

**Reference.** Things 3's checkmark animation; Apple's haptic-tap on completion; Vercel's `✓ Ready`. The opposite of GitHub's Pull Shark badge fatigue.

**Demo sentence.** You name a checkpoint "Auth refactor done"; a tiny ribbon flickers; you exhale.

---

## 5. The Empty-File-Tree Wikipedia Stub

**Pitch.** Empty state for the file sidebar isn't a button — it's a **fake Wikipedia stub article** rendered in the editor pane: a small illustration (line-art globe, dithered), a single italic line *"This knowledge base is a stub. You can help by expanding it."*, and three pre-filled wiki-link redlinks below: `[[About this project]]`, `[[Things I keep forgetting]]`, `[[People I work with]]`. Click any to create the page. The Wikipedia visual joke is the unlock; the redlinks are real onboarding scaffolding.

**Emotional target.** Recognition. Insider joke. "Oh, it gets it."

**Reference.** Wikipedia stubs ("This article is a stub"); Notion's pre-populated welcome doc; Linear's ideal-state-as-onboarding.

**Demo sentence.** Empty KB greets you with a stub article about itself, and the redlinks make you laugh and start typing.

---

## 6. CLI Banner Knows Your Name (Quietly)

**Pitch.** The `start` banner reads `git config user.name` (silently — Warp-style "we already know you"). Replace the subtitle line with `Welcome back, <name>.` on second+ runs, `Hello, <name>.` on first. If `git config user.name` is unset, no greeting — just the existing banner. **No nag to set it.** No emoji. The acknowledgment is the gift; the silence on absence is the discipline.

**Emotional target.** Being seen. Being not-fussed-over.

**Reference.** Arc's "Welcome, [Name]"; Warp's silent .zshrc import; the bartender who remembers your drink without asking.

**Demo sentence.** Second time you start the server, the banner says "Welcome back, Nick." and you smile despite yourself.

---

## 7. The Idle Cursor (After 30 Min)

**Pitch.** When the editor has been open and idle for 30 minutes, the agent presence-cursor (if an agent is connected) does a slow blink — once. That's it. It signals: *I'm still here when you come back.* Every 30 min of idle: one blink. Never a notification. Never a sound. Pure ambient companion logic, Tamagotchi-grade fidelity (one bit of expression).

**Emotional target.** Companionable solitude. Not alone, not bothered.

**Reference.** Tamagotchi's 16-dot expressions doing the whole emotional work; Finch's bird existing on its dedicated screen; cat in the windowsill.

**Demo sentence.** You return from lunch; the agent cursor blinks once as if to say "still here"; you keep working.

---

## 8. Markdown-Source View: The Old-Wikipedia Touch

**Pitch.** When you toggle to the Source view (S2 — CodeMirror), the editor chrome subtly shifts: a 1px dotted underline appears beneath the file path, monospace numbers use tabular figures, the cursor blinks at exactly 530ms — the canonical original CodeMirror cadence. Tiny things. The toggle feels like flipping to a different *room* in the same house, not a different mode in the same screen. Bonus: a one-character glyph at the bottom-left — `§` — that nobody asked for but feels right in source mode.

**Emotional target.** Different gravity. The room knows what it is.

**Reference.** Old Wikipedia's monospace-and-section-symbol typography; Panic's neon-on-dark scheme contrast; the satisfying tactile shift of switching from Pages to BBEdit.

**Demo sentence.** You toggle to source, the typography subtly stiffens, and the editor *feels* like it knows it's now serving a different brain.

---

## 9. The Timeline Scrubber Tactility

**Pitch.** The version-history timeline (S6) is scrubbable. Add: a *very* faint click — visual only, a 1-pixel pulse on the playhead — at every checkpoint as you scrub past it. No sound (default). Optional: opt-in `--sound` config gives you a real soft tick (Things 3 reorder sound). The scrubber feels like dragging across a guitar's frets — *something happens* at every named version, even if you never look down. Plus: at named user-checkpoints, the playhead head changes color subtly to your accent color.

**Emotional target.** Tactility. The history is a physical object.

**Reference.** Things 3's reorder haptic; Final Cut Pro scrubbing; GitHub contribution-graph hover; Adobe Lightroom sliders that feel-detented.

**Demo sentence.** You drag back through 3 days of edits; you can *feel* every save-version go past, even silently.

---

## 10. Fly.io-Voiced Errors

**Pitch.** Replace every operator-facing CLI error message with a Fly.io-tone two-line: *what happened, what to try*. Examples: 
- Current: `EADDRINUSE :3000` 
- New: `Port 3000 is busy — something else is already using it. Try \`open-knowledge start --port 3001\`, or stop the other thing first.`
- Current: `ServerLockCollisionError` 
- New: `Another open-knowledge is already running here (pid 84321, since 11:42am). Two of us editing the same content at once would be a bad time. Stop that one first, or work in a different folder.`

Never an emoji. Never "oops". Always: factual, second-person, suggestive next step. Voice is *competent friend*, not customer-service robot.

**Emotional target.** Calm in failure. Trust.

**Reference.** Fly.io error voice; Biome's "we tell you exactly where the problem is and how to fix it"; Tom Scott's calm narration tone.

**Demo sentence.** You hit a port collision; the message reads like a colleague helping you out, not a stack-trace from 2009.

---

## 11. The Hidden `/celebrate`

**Pitch.** Slash command in the editor: `/celebrate` triggers a *one-time*, *hand-drawn* SVG ribbon to drop from the top of the page, lasting 1.2s. Discoverable only by accident or word-of-mouth. The command's existence is a private joke between the team and whoever pokes around the slash menu. Pair with `/wikistub` (inserts the Wikipedia stub-article banner into the current doc as a heading) and `/redlinks` (lists every wiki-link in the current doc that points nowhere — a one-line graphite-on-paper inventory of what wants to exist next).

**Emotional target.** "Wait, this exists?" delight. Easter-egg discovery.

**Reference.** GitHub's secret keyboard shortcuts; Discord's playable Snake; the Konami code; Things 3's "Magic Plus."

**Demo sentence.** You discover `/celebrate` mid-async-debug and now your team uses it sarcastically and earnestly in equal measure.

---

## 12. Agent-Arrival Toast, Greeting Variant

**Pitch.** When an agent connects to the MCP server and is *first seen by the editor in this session*, a small toast appears in the lower-right corner for 4 seconds: a single line whose copy rotates from a corpus of ~30 variants — *"Claude is here."* / *"Claude joined the room."* / *"Claude has the floor."* / *"Claude pulled up a chair."* / *"Claude is reading."* / *"Claude is on the line."* Same toast component for every agent type — "Cursor is here," "Codex is here." Never personality-projected onto the agent itself; the warmth is in the *narration*. The agent stays silent; the room narrates.

**Emotional target.** Co-presence. Acknowledgment without anthropomorphization.

**Reference.** Octocat-rule (the room speaks; the character pantomimes); Animal Crossing villager arrival lines; the doorman who notices.

**Demo sentence.** You're typing; "Claude pulled up a chair." flickers in the corner; you unconsciously shift to make room.

---

## 13. The 404: Wikipedia Stub Treatment

**Pitch.** The localhost editor's 404 (when you nav to a doc that doesn't exist via URL or external link) renders as a Wikipedia stub: italic *"This article does not exist."*, a stub-template gray box, and a single button *"Create [[Title from URL]]"*. The URL becomes the page title. Below: *"You may have arrived here from a redlink, a stale bookmark, or your future self trying to imagine this page."* No mascot. No game. The joke is the format itself.

**Emotional target.** Recognition humor. Productive resolution.

**Reference.** GitHub 404 ("This is not the webpage you are looking for"); Lego's "Oh Bricks!"; Wikipedia's actual stub-article notice; Pixar's 404.

**Demo sentence.** You hit a 404 and instead of frustration get *"You may have arrived here from your future self trying to imagine this page"* — and you create it.

---

## 14. The Backlink Density Whisper

**Pitch.** In the file sidebar, each file row gets a *very* small, dimmed integer in the right margin — not the file size, not the date, but the **backlink count**. Files with 0 backlinks get nothing (no red badge, no nag — that would be Duolingo-coded). Files with 5+ backlinks get a single subtle dot accent. Files with 10+ get a slightly brighter dot. A whisper-thin gradient of "this is connected." Hovering shows the actual integer + "incoming links." Total visual weight: 4 pixels.

**Emotional target.** Ambient pride in the graph. Like watching your GitHub contribution graph fill in.

**Reference.** GitHub contribution-graph hover ("X contributions on Monday"); Linear's issue-cycle progress bar; the graphite-thin Strava heatmap dots.

**Demo sentence.** You glance at the sidebar, see the dots clustering around your most-linked notes, and feel quietly that the graph is *yours*.

---

## 15. The Init Ceremony's One Cute Beat

**Pitch.** `open-knowledge init` mostly stays as it is — competent status lines. But at the end, after all the green checkmarks, **one** line appears with a 200ms delay (Disney follow-through animation): a centered, italic, dim-gray sentence — *"Your knowledge base is ready when you are."* That's it. No mascot. No emoji. No exclamation. The pause-then-arrival is the entire flourish — a single sentence that knows when to land. (The 200ms is the load-bearing detail. It IS the design.)

**Emotional target.** Anticipation, then quiet permission to begin.

**Reference.** Rauno Freiberg's "Follow-Through and Overlapping Action — tiny delays make the UI feel thoughtful"; Things 3's note-open animation; the way Pixar's Inside Out cuts a beat before the punchline.

**Demo sentence.** Init finishes; one line lands a heartbeat after the others; you sit with it for a second; then you type the next command.

---

## 16. Typography Personality Decision

**Pitch.** Pick one font with a *personality* and ride it. Candidates:
- **Geist** (Vercel) — minimalist-premium signal; aligns us with the Linear/Vercel/dev-tool aesthetic. Lowest risk, lowest distinctiveness.
- **iA Writer Quattro** (or Mono) — the *writer's tool* signal; pairs Obsidian-grade editor with iA-grade craft pedigree. Medium risk, high distinctiveness for our writer-IC mode.
- **Berkeley Mono** (paid) — devtool-luxury signal. High risk (paid font), highest distinctiveness; "the Things-3 of CLIs."
- **Comic Mono** for the CLI banner ASCII *only* — joke option, but ironic-warmth done right (like Cult of the Lamb's UI font) is genuine identity.

The micro-interaction is: the same font everywhere. Banner, editor chrome, source view, error messages. Identity through repetition.

**Emotional target.** Coherence. "This product was made by people with taste."

**Reference.** iA Writer's font choice as identity; Berkeley Mono as cultural signal; Geist as Vercel-tribe membership.

**Demo sentence.** You install three things in a row; only this one feels like the same hand drew every glyph.

---

## 17. The "Open in Editor" Command Echo

**Pitch.** When an agent (via S9) programmatically opens the editor panel in Claude Desktop / Cursor / Claude Code CLI, the editor briefly shows — for ~600ms in the top bar — a single line: *"Opened by Claude."* Then it fades. Symmetry: when you open it manually, the line says *"Welcome."* Identical position, identical typography, different copy. Tiny acknowledgment that the *act of arrival* has provenance now.

**Emotional target.** Provenance as warmth. "I know how I got here."

**Reference.** macOS's "Opened from <Source>" sheet on quarantined apps (but ported to a *positive* moment); Notion's "Last edited by"; Slack's "Joined #channel via Search."

**Demo sentence.** Your agent opens the editor mid-conversation; the top bar reads "Opened by Claude" for half a second; the provenance is yours.

---

## 18. Sound: Optional, Opt-In, Singular

**Pitch.** One sound. A single soft "tick" — like a Leuchtturm cap. Plays only on **Save Version** (named checkpoint). Off by default. Enabled via `~/.open-knowledge/config.yml` → `delight.sound: true`. No music. No chimes for sync. No notification dings. No "agent arrived" beep. Just one tick, ever, at the moment a user names something. The discipline is what makes it land — a sound that ONLY plays at user-meaningful punctuation becomes a *Pavlovian satisfaction* instead of noise.

**Emotional target.** Closure. The satisfying click of a switch.

**Reference.** Things 3's reorder sound (single, optional, identity-defining); the iPhone screenshot click; the Game Boy power-on chime (one beat, forever-iconic).

**Demo sentence.** You opt in once; a week later you realize you've started naming versions just to hear it.

---

## 19. The Conflict Toast Without a Mascot

**Pitch.** When CRDT reconciliation surfaces a real conflict (rare; production-grade), the toast is **stark, voice-controlled, no character**. Honors the Octocat brand-rule: never a mascot in crisis. Copy: *"Two edits collided. Both are saved. Open conflict view to choose."* Two buttons: *Open conflict view* / *Later*. No emoji. No "oh no!". No spinner. The discipline of NOT being warm here is what makes the warmth elsewhere trustworthy. **List this here as the explicit anti-pattern that legitimizes everything above.**

**Emotional target.** Trust. The room can be serious when the moment requires.

**Reference.** Octocat brand-book ("never in security, crisis"); Stripe's payment-failure copy; airline-cockpit voice ("attention").

**Demo sentence.** Two clients conflict; the toast is calm and serious; you trust it because the rest of the product knows when to smile and when not to.

---

## 20. The "First Backlink" Celebration

**Pitch.** The very first time the user creates a wiki-link that resolves to an existing page (i.e., creates the first **edge** in their knowledge graph), the link gets a 1.5s pulse — a soft glow expanding from the link text outward. *Once*. Per KB. Forever. Stored as a single boolean in `~/.open-knowledge/state.yml` → `firstBacklinkCelebrated: true`. The *first edge* is the moment a knowledge base becomes a graph. The product notices.

**Emotional target.** Threshold. "You just unlocked the actual product."

**Reference.** Habitica's "+15 XP" first-task chime (but visual-only, single-event); Snapchat streak fire (but without the Duolingo-anxiety tail); the first commit to a new repo.

**Demo sentence.** You write `[[Auth]]` in a doc, it resolves to a real page, the link glows softly for a beat, and you understand what kind of object you're building.

---

## WILD CARDS

### W1 — The Library Card (Physical Mail After 30 Days)

**Pitch.** Open Knowledge ships an **opt-in mailing-address field** in `init`. After 30 days of continuous use (not "active" — *existence* — the shadow git has commits in 30 distinct days), the project mails the user a **single physical library card** — kraft-card stock, letterpress-printed, with their KB name and the line *"Reader. This card is yours."* — and a hand-numbered edition stamp. That's it. No tracking. No QR code. No url. The physical artifact in your wallet from a CLI tool you installed is the moat. Cost: ~$3/card; cap at 1000 cards for v0.

**Emotional target.** "I am part of something that exists in the world." Octocat sticker / Arc membership card / Superhuman concierge gift territory.

**Reference.** Arc's onboarding membership card; Superhuman's concierge gift; Octocat sticker mail-program; Are.na's membership card mailings.

**Demo sentence.** A month after installing, an unmarked envelope arrives; inside is one card; you keep it.

---

### W2 — The Agent's Diary (KB Writes a Letter to You at Month-End)

**Pitch.** At the end of each calendar month, when the user opens the editor on the 1st of the next month, a single new file appears at `.open-knowledge/journal/2026-04.md` — a one-paragraph **letter from the KB itself** (generated by the user's own connected agent, via a built-in MCP tool the agent-runs-on-launch idiom triggers). The letter summarizes: *what was added, what was abandoned, which articles got most-linked, which redlinks are still red, one curious observation*. Signed: *"— your knowledge base."* The letter is a real markdown file you can edit. The KB is *narrating itself back to you*.

The Octocat rule: the KB never speaks unprompted *during normal use*. But once a month, in a quiet ceremonial channel, it does.

**Emotional target.** Generational memory. Tamagotchi's evolution-as-record-of-care, but for a knowledge graph. *The product remembers with you.*

**Reference.** Finch's "story-as-reward" model; Animal Crossing letters from villagers; Year-in-Review playlists; Strava's monthly recap; Day One's "On This Day."

**Demo sentence.** First of the month; you open the editor; there's a one-paragraph letter from your own KB telling you what kind of knowledge it became this month — and you read it twice.

---

### W3 — Dithered Mode: The Whole Editor as a 1996 BBS

**Pitch.** Hidden config flag: `delight.dithered: true`. Restyles the entire editor — chrome, sidebar, presence bar, but **not the prose** — in 4-bit dithered grayscale, monospace everything, dotted dividers, pixelated icons, scanline overlay (1% opacity). The **prose itself stays clean and legible** — the chrome is the costume, the content is the canon. Triggered by `Cmd+Shift+1996` (joke shortcut), reversible. Pairs beautifully with W2's monthly letter (which gets ASCII flourishes in dithered mode). Discoverable via `/help` slash command. Useless. Beloved.

The discipline: dithered mode is **never the default**, **never the marketing screenshot**, and the prose stays untouched. It is a *room* you can enter, like Mac OS 9 simulators or Are.na's "Internet 1.0" scene-quality. The product is allowed to have an attic.

**Emotional target.** Nostalgia + insider tribe. The product has a hidden room. The room is for the people who notice.

**Reference.** Panic Playdate (hardware crank exists because they could); Are.na's nostalgic typography; Cabel Sasser's macOS-9-throwback-everything; Berkeley Mono's whole brand; the Wayback Machine's pixel logo.

**Demo sentence.** Late at night you discover `Cmd+Shift+1996`; your editor becomes a dithered BBS; your text stays crisp; you screenshot it for the group chat.

---

## Where delight becomes infantilizing — the Octocat-rule for micro-interactions

Three discipline lines, derived from the patterns above:

1. **Delight in moments of friction the user has accepted** (start, save, empty, idle, init, version, 404). **Never in moments of focus** (typing, scrolling, reading) **and never in moments of crisis** (sync conflict, security warning, persistence failure, permission denied).

2. **The narration is warm. The agent never anthropomorphizes itself.** "Claude pulled up a chair" is the room narrating. "Hi, I'm Claude!" would be the agent pretending to be a person. The room can have voice; the character must pantomime. (Octocat-rule, ported.)

3. **Single-bit-of-personality-per-surface.** One sound (Save Version). One animal-walk (first agent arrival). One blink (idle). One ribbon (named checkpoint). One letter per month. Restraint is the warmth. Pile three on one surface and it becomes Microsoft Bob.

**The litmus test:** *Could a senior dev show this to their CTO without flinching?* If yes, the delight has earned its place. If no, it's costume.
