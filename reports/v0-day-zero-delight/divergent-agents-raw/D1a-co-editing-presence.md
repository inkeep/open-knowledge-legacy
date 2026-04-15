# D1a — Real-time Human+AI Co-editing Presence (Divergent, Unbounded)

**Lens:** S5 is the defining UX moat. Open Knowledge is the first product where a human and an AI agent can *both have cursors in the same document at the same time*, via CRDT, with per-origin undo. Today that shows up as a sync dot, an animal avatar, a Claude glyph. That's a footnote. This lens asks: how does presence become *visceral* — a sensory event, a thing a user feels in their chest and tells a friend about within 60 seconds of first seeing it?

**Provocation:** The moment a user realizes *"there is someone else in my document right now, and it is not a human"* should be the shareable frame. Not a feature bullet — a **first-contact scene**. What's the cinematography?

**Constraints reminder:** Unbounded. Weird, expensive, impossible — fair game. Target: 15–20 ideas. 2–3 WILD CARDS.

---

## 1. The Arrival Cinematic — "Claude just walked in"

**Pitch.** The first time an agent connects to your doc, the whole editor dims for 600ms and a named avatar fades in at the top bar with a subtle *whoosh* + pulse, the way Slack used to ping a friend joining a huddle. Then the dim lifts and the cursor slides in from the margin like a fountain pen being uncapped.

**Emotional target:** wonder + belonging.

**Reference inspiration:** Arc browser's onboarding color-flood; Slack huddle join animation; the "Claude has joined the chat" moment in Cowork demos.

**What you see:** editor dims → `Claude joined your document` toast with pulsing cyan ring → agent cursor materializes at paragraph 1 with a 200ms hand-draw trail → you feel it land.

---

## 2. The Typing Caret — a visible, blinking agent cursor with a name tag

**Pitch.** The agent gets a first-class CodeMirror/TipTap caret just like a Google Docs peer — blinking, colored per-agent-identity, with a persistent name flag ("Claude" or user-chosen name) that hovers above the line it's on. Not a floating avatar. A *cursor*.

**Emotional target:** warmth + identity.

**Reference inspiration:** Google Docs / Figma multiplayer cursors. Notion's live cursors. Every multiplayer presence system since 2018, but ours has **an AI in the cursor**, which nobody has shipped.

**What you see:** a cyan blinking | with `Claude` floating above it, 2cm to the right of your own blinking |, moving around as Claude reads and edits.

---

## 3. Typewriter Sound — the tactile *clack* of Claude typing

**Pitch.** When the agent writes, you hear a low, soft mechanical typewriter clack — per character, gain-rolled off to avoid annoyance, respecting OS "reduce motion" / mute. An optional setting, but **on by default** for the first session so the first impression is sensory. A slightly different timbre for you (higher, softer) vs. Claude (lower, wooden).

**Emotional target:** tactility + nostalgia (the materiality of writing).

**Reference inspiration:** iA Writer "focus mode" + typewriter-sound community plugins; Heyrobin.ai's keystroke audio; the satisfying feel of a Keychron.

**What you see:** a paragraph appears and you *hear* it — *clack clack clack*. Your hand feels the rhythm even though it's not on the keyboard.

---

## 4. Origin-Shaded Paint Trail — text lands with colored afterimage, then fades

**Pitch.** Every character written by an agent is painted with a soft colored background (cyan for Claude, purple for a second agent, etc.) when it lands, and the color decays over ~4 seconds to transparent. Your own text has no trail. Attribution is thus visible in the moment of creation, then gracefully recedes so the document remains clean.

**Emotional target:** pride + power (the sense that "I can always see who wrote what, just by watching").

**Reference inspiration:** Linear's subtle row-flash on state change; Rauno Freiberg's "Disney overlap" timing principles; watercolor brushstrokes.

**What you see:** Claude writes a sentence — the text appears with a cyan wash under it, like wet ink on paper, that evaporates over a breath.

---

## 5. Attribution Tattoos that fade — but you can summon them back

**Pitch.** Same as #4 but with a gesture: hover over any paragraph with the `Option` key held, and the origin shading instantly re-appears as a static overlay for the whole doc — a "show me the x-ray" mode. You see the entire document colored by authorship history. Release Option → fade back to clean.

**Emotional target:** power + status (you are the auditor; the history is at your fingertips).

**Reference inspiration:** Figma's "show layer outlines" hotkey; git blame but instant and aesthetic.

**What you see:** hold `Opt`, the page lights up like a heat map — you see that Claude wrote 60% of §2, you rewrote §3, and the intro is shared.

---

## 6. Follow-the-Agent camera lock

**Pitch.** Click the agent avatar → the editor viewport smoothly scrolls to wherever the agent's cursor is and stays locked on it, the way Figma's "Follow" works when you click a teammate's avatar. Agent moves → your view moves. Exit with Escape or any click.

**Emotional target:** wonder + flow (you are riding on Claude's shoulder as it thinks).

**Reference inspiration:** Figma's Observation Mode / Spotlight; Google Docs "Follow [user]"; the moment in pair programming where you give up the keyboard and ride shotgun.

**What you see:** click Claude's avatar → your screen smoothly pans down to paragraph 47 where Claude is editing, framed center-viewport, subtle "Following Claude" pill at top.

---

## 7. Ghost Cursor Trails — the breadcrumb of recent motion

**Pitch.** The agent's cursor leaves a 300ms motion blur trail (like a comet tail) when it moves — so you can literally *see* its gaze traversing the doc, jumping from a heading to a code block to a link. Short enough to feel alive, not long enough to feel cluttered.

**Emotional target:** wonder (it's reading, I can see it thinking).

**Reference inspiration:** old RTS game unit trails; cursor-trail web toys from the early 2000s; *Speed Racer* cinematography.

**What you see:** Claude scans paragraph 1, jumps to paragraph 5 — a faint cyan streak whips between them, fading in 300ms.

---

## 8. Reading Highlight — "Claude is reading §3"

**Pitch.** When the agent reads a section (via MCP `read_document`), the section's left margin gets a subtle vertical cyan bar that breathes gently, and the heading gets a ghost "Claude is reading" pill for the duration. Unlike writing, reading is invisible today. This makes it visible.

**Emotional target:** warmth + belonging (you aren't alone; someone is actually *paying attention to your writing*).

**Reference inspiration:** the reading-receipt pattern from iMessage/WhatsApp; GitHub's "X viewed your PR" ephemeral signal; the warm glow of a reading lamp.

**What you see:** you open a doc → 2 seconds later, §3 gets a soft cyan side-bar and a "Claude is reading §3…" label → 10 seconds later it moves to §4.

---

## 9. Agent Status Verbs — reading / thinking / writing / waiting

**Pitch.** The presence bar avatar is wrapped in a ring that encodes state: solid = connected, pulsing = reading, throbbing-with-ripple = thinking (tool call in flight), tracing = writing, dimmed = idle/waiting. Hover reveals the verb in plain English: "Claude is thinking about §4."

**Emotional target:** intelligibility + warmth (the machine is *legible*).

**Reference inspiration:** Discord's "speaking ring" around voice avatars; Loom's recording-dot; Apple Watch activity rings.

**What you see:** Claude's avatar ring pulses slowly → shifts to rippling → shifts to tracing while text appears in §4.

---

## 10. Named-and-Chosen Agents — "what should I call your agent?"

**Pitch.** First time an agent connects, a modal slides in: *"Claude has arrived. What would you like to call them here?"* Default name is "Claude", but users can set "Coco", "Athena", "my copilot" — and that name persists per project, shows in cursor flags, attribution, activity feed. Identity becomes *local and chosen*, not vendor-imposed.

**Emotional target:** identity + ownership.

**Reference inspiration:** Tamagotchi naming ceremony; `/buddy` persistence; Ollie from Ollama; naming your D&D familiar.

**What you see:** first agent connect → modal: *"This looks like Claude 3.5 Sonnet, connected from Claude Code. Call them 'Claude' — or give them a name."* You type "Sage" → "Sage" appears in the presence bar.

---

## 11. The Shared Desk Metaphor — a visible corner where the agent "sits"

**Pitch.** The bottom-right of the editor has a tiny illustrated workspace: a desk, a little lamp, a notebook. When the agent is present, a small pixel-art agent-figure sits at the desk, slightly animated (blinking, occasionally tilting head). When writing, the figure "leans in" over the notebook. When idle, it leans back. A mascot, but load-bearing.

**Emotional target:** warmth + nostalgia + belonging.

**Reference inspiration:** Animal Crossing's villagers sitting at desks; Clawd (`/buddy`); Finch the self-care bird; Stardew Valley NPCs at work.

**What you see:** bottom-right corner — a cozy little 48x48 illustrated desk with a tiny robot/bird/fox agent working at it, animated gently, visible at all times the agent is connected.

---

## 12. The Two-Cursors-at-a-Line Moment — deliberate collision

**Pitch.** If you and the agent end up on the same line, the UI *celebrates it*: both avatars briefly lean toward each other with a sparkle, the line glows warm for a half-second, and a tooltip reads *"You're both here."* Designed specifically for the "whoa, we're editing the same paragraph" first-contact moment.

**Emotional target:** wonder + belonging (the co-presence is literally staged as a moment).

**Reference inspiration:** Figma's "bumping cursors" subtle cue; the handshake animation in Zoom reactions; the canon-of-two metaphor (the moment Michelangelo's Adam touches God).

**What you see:** you're editing §2 line 3. Claude joins you on the same line. Both cursors shimmer briefly toward each other; a faint pink glow washes across the line. You feel *seen*.

---

## 13. Session Replay / Rewind scrubber — watch the last hour as a movie

**Pitch.** A "time scrubber" slider at the top of the editor (off by default, toggled with a clock icon) lets you drag backward through the last N minutes of the session. Watch Claude's cursor move, your edits appear, attribution trails re-paint. The doc becomes a *replayable performance*. First time a user drags it, you see the last 5 minutes of co-editing play as cinema.

**Emotional target:** pride + wonder + power.

**Reference inspiration:** Figma's version-history cursor replay; Loom scrubbing; Framer's timeline; the "animate through git history" Obsidian plugin (GitWitness).

**What you see:** drag the slider left → cursors reverse, text un-writes, then re-writes as you release. You just watched yourself and Claude co-author the last 10 minutes.

---

## 14. Arrival Toast with Personality — "Sage says hi"

**Pitch.** When an agent first connects (or reconnects after disconnect), a small toast slides in from the bottom-right: `👋 Sage connected from Claude Code — just joined § intro`. Named, located, contextual. Doesn't interrupt, fades in 4s. Subsequent connects are quieter (just a ring pulse on the avatar).

**Emotional target:** warmth + belonging.

**Reference inspiration:** Slack presence toasts; Apple AirDrop "iPhone nearby"; Finch the bird greeting you.

**What you see:** `👋 Sage connected from Claude Code` bottom-right, with a tiny agent avatar, then it fades.

---

## 15. Mirror-image Presence — "AI is looking at your work"

**Pitch.** Flip the direction: not just "I can see the agent" — the agent's *view* is also visible. A small ephemeral eye-icon appears in the margin of whatever section the agent last read, captioned *"last read by Claude • 2s ago"*. It's the author-side receipt of being witnessed. For writers who are lonely in their own doc, this is the warmest possible signal.

**Emotional target:** warmth + belonging + pride.

**Reference inspiration:** Instagram "Seen" receipts; Medium's "X read this story"; the way Slack shows who's viewed a message.

**What you see:** you finish writing §4 → 3 seconds later, a tiny eye-glyph appears in §4's margin: *"Claude read this • just now"*. You feel read.

---

## 16. Live Attribution in the Scrollbar — a vertical timeline of who's where

**Pitch.** The vertical scrollbar (or a dedicated right-side mini-map) shows colored segments: where you've been writing (warm orange), where Claude is writing (cyan), where both of you are (pink blended zone). Scroll-sized map of collaborative territory. Always-on, always-true.

**Emotional target:** power + status (I can see the whole battlefield).

**Reference inspiration:** Sublime/VS Code mini-maps; Figma's overview mode; the GitHub contribution graph but spatial.

**What you see:** scrollbar with a rainbow of cyan + orange + pink bars indicating authorship density. One glance → "oh, Claude is rewriting the whole appendix."

---

## 17. Presence Sound-Ambient Mode — the room has a hum

**Pitch.** Optional: when an agent is connected, the editor has a very faint ambient hum/drone (like the hum of a lamp, or a spaceship bridge at idle). Barely audible. When the agent is actively writing, the hum gains a subtle frequency component. When it disconnects, the hum fades. You don't consciously hear it — you feel its absence. Deeply sensory, deeply optional.

**Emotional target:** warmth + company + nostalgia.

**Reference inspiration:** ambient UI sounds in Brian Eno's 77 Million Paintings; the hum of a CRT; ASMR livestream "study with me" ambient noise; macOS's "chime" family.

**What you see:** you won't "see" it — but when Claude disconnects you'll realize the room just went quiet. That's the delight.

---

## 18. **WILD CARD** — Haptic co-presence via BLE-connected wearable

**Pitch.** Partner with a haptic-wristband maker (or just support Apple Watch). When the agent writes in your document, your wrist gets a soft tap per paragraph-burst. When Claude joins, a warm double-tap. When Claude leaves, a single slow fade-tap. The *body* registers collaboration. Ship a stretch v1 button that pairs.

**Emotional target:** wonder + belonging + the-body-knows.

**Reference inspiration:** Apple Watch haptic taps for heartbeats (the "share heartbeat" feature); Ultraleap haptics; Bond Touch bracelets; HEY's "focus time" wrist signals.

**What you see:** you feel a warm double-tap on your wrist → look at screen → "Sage connected" toast. You're in a relationship with software.

---

## 19. **WILD CARD** — The Agent Has a Face (and it looks at your cursor)

**Pitch.** The presence bar avatar is not a static glyph — it's a small, softly-animated, toy-like face (think Finch bird, or a `/buddy` sprite, or Mona Lisa smiling). The face's *eyes* track your cursor position in real time. When you type fast, it looks excited. When you stop for 30s, it tilts its head. When the agent is itself writing, the face looks down at where it's writing. A perpetual motion gaze-tracker.

**Emotional target:** wonder + nostalgia + unsettling-in-a-good-way.

**Reference inspiration:** Finch the self-care bird; Bonzi Buddy's gaze (but not creepy); Apple's Memoji tracking; the FOSS library `rigatoni-eyes.js` that makes cartoon eyes follow your cursor; Tamagotchi's emotive face.

**What you see:** top-right, a little round face — eyes drifting as you move your cursor, expression shifting when Claude is "thinking." You check in with it the way you check a pet. (Can be disabled with one click. Must.)

---

## 20. **WILD CARD** — A physical LED desk-lamp that glows when Claude is in your doc

**Pitch.** Ship (or open-source build plans for) a small USB-C or BLE ambient LED lamp — call it the **Inkwell** — that sits on your desk and glows cyan when an agent is connected to your Open Knowledge workspace. The lamp breathes when the agent is thinking, pulses when it's writing, dims when idle. A physical-world object whose only job is to tell you there's another mind in your document. Optional 3D-printable case on day 0; Amazon-able variant as v1.

**Emotional target:** wonder + identity + ritual.

**Reference inspiration:** The *Orb* (Ambient Devices, 2002) — a glass ball that glowed with stock prices; Philips Hue "presence" integrations; the "on-air" recording lamp; the `BusyLight` for remote workers; Hatch Restore's ambient glow; the ritual of lighting a candle before writing.

**What you see:** you say "work with me on the roadmap" in Claude Code → your desk lamp slowly fades from amber to cyan. Claude has arrived. Your whole desk glows. You don't have to check the screen to know the room isn't empty.

---

## Convergent patterns in my own ideas

Three themes recur across these twenty ideas. **First: the cursor wants to become a character** — from a blinking caret with a name (#2), to a tracked-gaze face (#19), to a pixel-figure sitting at a desk (#11). Presence works when there is *someone*, not just *something*. **Second: attribution wants to be ambient, not interrogative** — origin-shading trails (#4), scrollbar territory maps (#16), and read-receipt eye-glyphs (#15) all push authorship into the peripheral-vision layer so the user never has to *ask* "who wrote this" — they can always see it with a glance. **Third: the most shareable moments are sensory, not informational** — the typewriter clack (#3), the haptic tap (#18), the ambient hum (#17), the desk lamp (#20) all treat presence as a thing you feel in your body, not a UI element you parse. The "whoa" frame at day zero is probably not a screenshot — it's a 6-second clip with sound on, or a physical object on a desk, or the moment two cursors shimmer at the same line.
