# D1b — WYSIWYG ↔ Source Toggle as a 30-Second Demo Magic Trick

*Divergent ideation. Unbounded horizon. No engineering filter. Wild.*

**The thesis:** Open Knowledge's S2 toggle (WYSIWYG ↔ CodeMirror, both bound to the same Y.Doc via observers A/B) is a structural differentiator Notion, Outline, AFFiNE, and even Mintlify can't replicate without rebuilding their storage layer. Right now it's a button labeled "Source." That's malpractice. Every pixel of that toggle should scream "markdown is the substrate, agents write markdown, not HTML, and you can trust both views." What follows is 20 wild shots at making THE TOGGLE ITSELF the viral artifact — the "wait, do that again" moment that lands in a tweet clip.

---

## 1. The Morph — Character-Level Transformation Animation

**Pitch.** Press the toggle and every block visibly *transforms* in place: `# Heading` characters slide in from the left of an H1, `**` hugs each end of bold text as it de-styles, bullet dots physically become `-` glyphs. 400ms FLIP animation, staggered 15ms per block top-to-bottom.

**Emotional target:** *"oh my god it's the same thing"* — the moment the user understands markdown IS the document, not a lossy export.

**Reference:** Things 3's to-do open animation (Cultured Code, Apple Design Award); Rauno Freiberg's "Follow-Through and Overlapping Action"; Keynote's "Magic Move."

**Demo sentence:** "Watch a heading turn into # and back — same document, two views, zero conversion."

---

## 2. The Scrub — Toggle as a Continuous Slider

**Pitch.** Replace the binary button with a horizontal slider at the top of the pane. Drag it 0→100% and you see a *continuous interpolation* between rendered and source: at 30% you see bold text still bolded but with faint `**` markers appearing around it; at 60% the markers are solid and the bold styling fades; at 100% you're in pure CodeMirror. A dev can literally pause at 50% and screenshot "markdown revealed."

**Emotional target:** playful control — *"I am the demiurge of my document"*.

**Reference:** Figma's zoom slider; Warp's command-block drag; Playdate's hand crank (input nobody asked for that becomes the identity).

**Demo sentence:** "Scrub the slider halfway and see exactly where the markdown lives."

---

## 3. The Ghost Overlay — Live-Preview Decorations in Source Mode

**Pitch.** In CodeMirror source mode, `# Heading` renders at actual H1 size with its `#` visible but dimmed (Obsidian Live Preview). `**bold**` shows the `**` at 40% opacity flanking the bolded run. Tables render as actual tables with the pipe chars visible as ghosts. It's a single view that IS both at once. Obsidian has this; ours should have it with *per-cursor reveal* — only the line the cursor is on shows raw syntax; all other lines are rendered.

**Emotional target:** satisfaction — *"it's the best of both and neither compromises"*.

**Reference:** Obsidian Live Preview (CM6 + decorations); Typora's hybrid mode; iA Writer's focus line.

**Demo sentence:** "Put your cursor on a heading — the # pops in. Move away — it dissolves."

---

## 4. The Collab Split — Agent Edits Source While You Edit WYSIWYG

**Pitch.** Agent is mid-stream writing a 300-token markdown chunk. User presses source toggle. Source pane opens showing the agent's cursor *still typing* one character at a time in CodeMirror — text streaming in with a yellow highlight fade. Switch back to WYSIWYG and the same stream appears as rendered blocks materializing. **No other product can do this** — Notion has collab but no source mode; Obsidian has source but no collab. Both-at-once is the moat made visible.

**Emotional target:** awe — the "wait that's not possible" reaction.

**Reference:** Figma multiplayer cursors; Google Docs typing indicator; the Karpathy vibe-coding clip (agent writes, user watches).

**Demo sentence:** "Claude is writing in markdown. I toggle to source. I watch the characters stream in. I toggle back. Same document."

---

## 5. The Shortcut Flourish — `Cmd+/` Toggles with a Whoosh

**Pitch.** Keyboard shortcut `Cmd+/` (universal "toggle view") triggers the mode swap with a ~150ms horizontal wipe — rendered pane slides out left while source pane slides in right, with a subtle motion-blur trail. A muted synth `bloop` fires on switch (toggleable, off by default for respect). Six-frame GIF-worthy.

**Emotional target:** tactile craftsmanship — *"this is well-loved software"*.

**Reference:** Arc browser tab switch; Things 3's paper-transform; Rauno's "every transition has a sound budget."

**Demo sentence:** "`Cmd+/` — whoosh — you're in source. Again — whoosh — you're back."

---

## 6. Block-Level Mode — One Paragraph as Source, Rest Rendered

**Pitch.** Right-click any block → "Edit as source" → just THAT block becomes an inline CodeMirror widget with syntax highlighting, while everything around it stays rendered. Cursor still moves between them. For tables and fenced code blocks this is already common; generalize it to *every* block type. The Y.Doc substrate makes it trivial because the block boundaries are addressable.

**Emotional target:** granular trust — *"I can inspect any single block's markdown"*.

**Reference:** Notion's `/code` block; Obsidian's inline code blocks; Jupyter's cell-level code/markdown toggle.

**Demo sentence:** "One paragraph in source, five paragraphs rendered, all live-edited together."

---

## 7. The Mirrored Split-Screen

**Pitch.** `Cmd+Shift+/` opens a vertical split: WYSIWYG left, source right, cursors synchronized and scroll-locked. Typing `## heading` in source materializes as a rendered H2 on the left in real time. Bold the word "cat" on the left and `**cat**` wraps instantly on the right. **Every keystroke is an argument that the observer bridge is real**. The split IS the proof.

**Emotional target:** mechanical trust — *"I can see the conversion happening live"*.

**Reference:** VS Code's markdown preview; Typora (killed this feature, got backlash); Cursor's diff view.

**Demo sentence:** "Type on one side, it mirrors to the other in the same frame. That's a CRDT."

---

## 8. Diff Mode as a Third Toggle State

**Pitch.** Toggle isn't binary — it's `WYSIWYG | Source | Diff`. The third state shows agent changes (per-origin UndoManager) as a GitHub-style diff inline with the rendered view: green highlights for agent-added spans, red strikethrough for agent-removed spans. Architecturally aligned with precedent #6 (mode as enum, not boolean). Demo: agent edits, user hits toggle twice to enter Diff mode, sees exactly what Claude changed, Cmd+Z'es just Claude's delta.

**Emotional target:** control — *"I can see and reject Claude's edits surgically"*.

**Reference:** GitHub PR diff; Cursor inline-diff; Mintlify's review flow.

**Demo sentence:** "Claude wrote five paragraphs. I toggle to Diff. I see exactly what's new. I reject two with one click."

---

## 9. Toggle Replay — Scrub History as Mode-Preserving Timeline

**Pitch.** Each user-named checkpoint (S6 version history) replayable in either mode. At t=3min the document had one heading, by t=5min it had three; a timeline scrubber replays the shadow-repo WIP commits *while you're in source mode*, so you watch the markdown being authored character-by-character. Toggle to WYSIWYG mid-scrub and see the rendered version at that moment. Time-travel + mode-shift combined.

**Emotional target:** discovery — *"I can watch my own thinking happen"*.

**Reference:** Figma version history; Replit's timeline; Tuple's "replay the pair session."

**Demo sentence:** "Scrub back to 3 minutes ago. Toggle to source. Watch Claude write it again in front of you."

---

## 10. The Karaoke — Agent Writes in Source Mode with Highlighter

**Pitch.** When agent is writing and you're in source view, the current line being written has a yellow horizontal bar sliding with the cursor — literal karaoke bouncing-ball style. The Y.Text updates tick character-by-character, and a 2px yellow background highlight fades 1500ms after each insertion. After 30s of agent writing, the whole pane has fading yellow streaks showing the write path.

**Emotional target:** mesmerizing — *"I could watch this for an hour"*.

**Reference:** Apple Music karaoke; Stream Deck typing visualizer; Claude's own streaming chat UI.

**Demo sentence:** "Claude writes. Yellow highlighter tracks its cursor. The whole doc glows with its write path."

---

## 11. The Format-Reveal Annotations

**Pitch.** In WYSIWYG, hover over any formatted element and a small ghost tooltip shows its source syntax: hover a bold word → tooltip says `**cat**`. Hover a heading → `## Heading`. Hover a wiki-link → `[[Page Name]]`. Teaches users what markdown their formatting compiles to without forcing the toggle. The toggle stops being a "switch" and becomes an "inspect element" for prose.

**Emotional target:** learning via osmosis — *"oh THAT's what bold is"*.

**Reference:** Browser dev tools inspect; Figma's dev-mode panel; Grammarly's suggestion tooltips.

**Demo sentence:** "Every formatted word tells you its markdown if you hover. No toggle needed."

---

## 12. Syntax Rain (WILD CARD)

**Pitch.** 🎲 On first-ever toggle to source mode, a Matrix-style rain of markdown syntax falls from the top of the pane for ~800ms — `# * _ > [ ] ` characters cascading down, dissolving, revealing the actual source beneath. Pure Easter egg, fires once per document per user. A "welcome to the substrate" moment. Plays with the viral aesthetic of Bolt.new's "it's just building!" frame — the markdown itself is the magic.

**Emotional target:** wonder — *"this software has soul"*.

**Reference:** The Matrix opening credits; Every hacker-movie terminal; Clawd's `/buddy` hatch animation.

**Demo sentence:** "First time you toggle to source, markdown literally rains into existence. Once. Then never again."

---

## 13. The Tweet-Ready URL Capture

**Pitch.** Hit `Cmd+Shift+S` in either mode → generates a single shareable image pairing WYSIWYG rendered view (left) with source markdown (right), watermarked `localhost:3000 · open-knowledge`. Copied to clipboard. This is the **artifact** — every toggle action can birth a tweet. Aligns with the "share-trigger as primitive" pattern from Bolt and v0.

**Emotional target:** instant pride — *"I want to post this"*.

**Reference:** Carbon.now.sh code screenshots; v0.dev's permalink-per-generation; Linear's shareable issue URL.

**Demo sentence:** "Cmd+Shift+S. You now have a side-by-side image of rendered vs markdown. Tweet it."

---

## 14. The CRDT Merge Theater

**Pitch.** Two users + one agent all editing. User A is in WYSIWYG; User B is in source; agent is writing via MCP. A single shared Y.Doc. Show all three panes stacked on one screen (demo rig): every keystroke from any surface propagates to the other two in real-time. This is the **money shot** for the launch video — the demo that proves "no other product can do this." Source and rendered and agent-writing all settled on the same substrate.

**Emotional target:** transcendence — *"that's actually impossible in Notion / Obsidian / anywhere"*.

**Reference:** Figma multiplayer keynote demo (2019); Google Wave launch demo (RIP); Karpathy's vibe-coding clip.

**Demo sentence:** "Three surfaces. One substrate. Every keystroke everywhere, instantly."

---

## 15. Mode-Aware Undo Attribution

**Pitch.** Cmd+Z behaves differently by mode and origin. In source mode, Cmd+Z undoes character-level edits (CodeMirror grain). In WYSIWYG, it undoes block-level edits (ProseMirror grain). Cmd+Shift+Z undoes *only agent edits* regardless of mode. A tiny badge on the undo button tells you what the next undo will touch: "Will undo: Claude's last sentence" vs "Will undo: your last paragraph". Toggle the mode → the badge updates.

**Emotional target:** precision — *"I control exactly what gets undone"*.

**Reference:** Figma's history panel; Photoshop's history states; Ableton's arrangement undo scope.

**Demo sentence:** "One Cmd+Z undoes my edit. Cmd+Shift+Z undoes Claude's. The mode changes which grain."

---

## 16. The Autolink Reveal — Inline Link Shape-Shifting

**Pitch.** In WYSIWYG, type `[[Kn`  and the wiki-link autocomplete pops. Pick "Knowledge graph." The rendered chip materializes. Hold `Alt` — the chip transforms in-place to its source form `[[Knowledge graph]]`, then back when released. A dev can hover, Alt, screenshot, tweet. Per-element mode-toggle via modifier key. Applies to any construct: Alt over bold shows `**`, Alt over code shows `` ` ``.

**Emotional target:** power-user flex — *"this is a hotkey I'll actually use"*.

**Reference:** macOS Option-key reveal patterns; Notion's `/` slash menu; VS Code's Alt-key peek.

**Demo sentence:** "Hold Alt. The rendered chip becomes raw markdown. Release. It's a chip again."

---

## 17. The Agent-Attribution Paint

**Pitch.** Every character in the document has an origin (user / agent-name-X / file-watcher). In source mode, toggle on "Attribution Paint" → source text gets colored underlines per author (blue for you, orange for Claude, green for Codex, etc.). Toggle to WYSIWYG — same underlines but under rendered spans. This is *only possible with CRDT item-preservation* (precedent #11) — a normal diff system would lose the per-character attribution on every save. Visible proof the CRDT bridge is doing real work.

**Emotional target:** forensic clarity — *"I can see who wrote which comma"*.

**Reference:** Google Docs' "suggesting" mode colors; git-blame view; GitHub copilot's per-token highlight.

**Demo sentence:** "Toggle Attribution Paint. Every word shows who wrote it. Claude wrote the comma, I wrote the sentence."

---

## 18. The Cursor Ferry

**Pitch.** When you toggle, your cursor physically *rides* the animation. In WYSIWYG you're on character 47 of paragraph 3. Press toggle — a ghost cursor arrow arcs across the screen and lands precisely on the corresponding character in the source. 250ms, cubic-bezier easing. No other tool does cursor-position preservation across mode switches *visibly animated*. The animation teaches you the mapping.

**Emotional target:** continuity — *"I didn't lose my place, I can SEE I didn't lose my place"*.

**Reference:** iA Writer's focus preservation; Things 3's cursor; Rauno's "follow-through principle."

**Demo sentence:** "Toggle mode. Watch the cursor fly to the exact character in the source. Never lose your place."

---

## 19. Anthropomorphic Mode Mascot (WILD CARD)

**Pitch.** 🎲 A tiny animated character lives in the corner of the editor — let's call it "MD" (emdee). In WYSIWYG mode, MD holds up a rendered page and smiles. Press toggle: MD flips the page over to reveal markdown on the back, nods encouragingly. MD gets a species/rarity based on user ID hash (per `/buddy` pattern). On first-ever toggle, MD does a backflip. Each mode swap is a micro-interaction with MD. Persistent across sessions. Claude Code's `/buddy` taught us deterministic pets work; do the same but scoped to the toggle itself.

**Emotional target:** companionship — *"this software has a face that knows me"*.

**Reference:** Clawd `/buddy`; Finch bird; Duolingo owl (without the guilt).

**Demo sentence:** "MD flips the page. Markdown on one side, rendered on the other. That's the whole product."

---

## 20. Paste-Anything Toggle Demo

**Pitch.** Paste a URL into WYSIWYG — it renders as a link chip. Paste a code snippet — fenced block. Paste a table from Notion — actual table. Then toggle to source and see it's all clean CommonMark+GFM+MDX. This is the implicit proof that the storage layer is markdown, not HTML. Build a landing page demo that lets visitors paste *anything* (HTML email, Notion block, Google Docs selection, Obsidian note) into a sandboxed editor, then toggle and see the markdown. **A zero-install taste of the toggle**. Every paste is a meme opportunity ("look, my Notion export is finally clean markdown").

**Emotional target:** relief — *"finally, software that respects the format"*.

**Reference:** CleanShot X's paste-preview; Markdown Clipper extensions; Pandoc's web playground.

**Demo sentence:** "Paste your messiest Notion page. Hit toggle. Watch it become clean markdown."

---

## 21. The Agent's POV Source Cursor (WILD CARD)

**Pitch.** 🎲 When agent is writing, click a "Watch Claude" toggle in the toolbar. Editor forcibly switches to source mode AND the viewport auto-scrolls to wherever the agent's cursor is. The agent's write cursor becomes YOUR viewport anchor. You're experiencing the document from the agent's perspective. A live stream of what it's thinking in markdown. When agent pauses to read context, you see the cursor idle. When it streams a new section, you're carried along. Pure performance art — the agent's POV exposed through the source view that humans rarely visit.

**Emotional target:** intimacy with the agent — *"I am riding in Claude's head"*.

**Reference:** Twitch "spectate" mode; Google Docs "follow" mode; Cursor's agent-view panel.

**Demo sentence:** "Hit Watch Claude. The view rides with the agent's cursor. You're in its head, watching markdown unspool."

---

## Cross-cutting observations

- **The toggle is the best artifact we have to prove agents write markdown, not HTML.** Every idea above leans on that proof. The demo sentence for the whole category is: *"Everything you just saw Claude do? It was typing plain markdown. Look — here's the markdown."*
- **CRDT is load-bearing for half these ideas.** #4, #7, #14, #17, #21 are only possible because the observer bridge keeps both representations in sync. That's the structural moat made visible.
- **Mode-state-as-enum (precedent #6) unlocks Diff as a third mode.** #8 is the architectural-cleanest win.
- **Best for launch-day clips (15-60s):** #4 (collab split), #14 (CRDT merge theater), #1 (the morph), #12 (syntax rain), #17 (attribution paint).
- **Best for zero-install landing-page taste:** #20 (paste-anything demo) + #2 (the scrub).
- **Best as a single defining *gesture* the product is remembered for:** #16 (Alt-reveal) — if every Open Knowledge user forms the muscle memory of "Alt to peek at markdown," the toggle becomes a verb.
