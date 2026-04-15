# D1d — Embeddable Editor Inside Agent Environments (S9)

> **Lens.** The agent programmatically opens the Open Knowledge editor panel inside Claude Desktop, Cursor, Claude Code CLI's browser tool, VS Code preview, MCP Apps iframe, ChatGPT Desktop. No competitor ships this. The viral frame: **"the agent brings you to the editor."** This is the Vercel v0 / Lovable preview-pane moment applied to knowledge work — a split-screen shot where one side is "what the agent is doing" and the other side is "your wiki, live, with the agent's cursor visibly moving."
>
> **Output discipline.** 15-20 ideas. Title, pitch, emotional target, reference inspiration, demo sentence. 2-3 WILD CARDS clearly labeled. Unbounded.

---

## 1. `/bring-me-there` — the one command that opens a panel next to the terminal

**Pitch.** A single Claude Code slash command. The agent is mid-task, has just found (or created) the relevant page, and types `/bring-me-there`. The Open Knowledge editor panel slides in as a Claude Code browser-tool window (or a Claude Desktop side panel, or a VS Code webview), docked alongside the conversation. The page is already scrolled to the exact paragraph the agent just wrote. Your cursor lands there. Agent keeps typing; you watch the letters appear. No context switch. No "now go check the file."

**Emotional target.** Reduction of navigational burden to zero — "the agent just does the work of opening the right thing." The same delight as Cursor's "Go to Definition" but for knowledge.

**Reference inspiration.** Cursor's `Cmd+Click` jump-to-definition. Vercel v0's "open in v0" button. Linear's `Cmd+K` fuzzy-jump. Claude Code's `/buddy` because the verb is a gesture, not a command. Figma's "Jump to selection."

**Demo sentence.** "Claude types `/bring-me-there`; a panel opens; the wiki page scrolls to the exact paragraph; Claude's cursor is already blinking there."

---

## 2. The "follow me" toggle — agent cursor as camera

**Pitch.** A panel button labeled **Follow Claude** (on by default the first time). When enabled, the editor viewport tracks wherever the agent is editing — if the agent jumps from `auth.md` to `deployment.md`, the panel autopilots to the new file and scrolls to the agent's active paragraph. Like "Follow" in Figma, but for wiki work. Turn it off when you want to read ahead; turn it back on to re-sync.

**Emotional target.** The cinematic feeling of riding shotgun with a careful, fast driver. You lean back; the pages come to you.

**Reference inspiration.** Figma's spectator/follow mode. Google Docs' "Follow [Name]" on multi-cursor sessions. Twitch streamer-follow. Apple's Continuity Camera — the magic of passive syncing.

**Demo sentence.** "Claude edits across five files in two minutes; my cursor follows along, zero input; I just watch the book write itself."

---

## 3. Split-screen auto-layout on first run — the default is Lovable's default

**Pitch.** On the first `open-knowledge init` invocation from within an agent environment, the product auto-arranges: agent conversation pinned left 40%, Open Knowledge editor pinned right 60%. You don't do this; the product does. (Claude Desktop: opens a side panel. Cursor: splits the inline-preview pane. Claude Code browser tool: spawns browser side-by-side with terminal. VS Code: opens a webview panel on right.) The **layout is the product decision**, not the user's chore.

**Emotional target.** Arriving at a set table. The surprise of "I didn't have to configure this."

**Reference inspiration.** Lovable's default split. v0.dev's preview-left/code-right. Bolt.new's three-pane. Xcode Previews. Storybook.

**Demo sentence.** "One command and the workspace lays itself out — chat here, wiki there, cursor visible in both, no window wrangling."

---

## 4. The "open in OK" badge on every agent answer

**Pitch.** Every Claude/Cursor/ChatGPT response that cites a wiki page ends with a small pill: **[ Open in wiki ]** that opens the referenced page inside the embedded editor panel, scroll position preserved, agent attribution highlighted. The badge appears because the agent's response was built from a wiki read; clicking it is the v0-style "permalink to this artifact" moment applied to knowledge. Every agent reply becomes a tweet-ready artifact.

**Emotional target.** Every agent message has a door. You never feel trapped in the chat.

**Reference inspiration.** v0.dev's shareable component URLs — every generation is a permalink. Notion's share-block link. Perplexity's source citations. Arc's "Little Arc" pop-out.

**Demo sentence.** "Every answer from Claude ends with one button: 'Open in wiki.' I click; the editor panel shows the source, highlighted, with Claude's mark still on it."

---

## 5. The live-streaming preview — Bolt.new for wikis

**Pitch.** Paste a URL into Claude. It runs the compile-to-wiki flow (raw → article), and the Open Knowledge editor panel shows the article **being constructed paragraph-by-paragraph**, live. Not rendered post-hoc; visibly typed by the agent, one token at a time, with structure (headings, backlinks, frontmatter) emerging. Indistinguishable from watching Bolt scaffold an app — except it's a knowledge article.

**Emotional target.** Awe. The productivity-porn feeling. "I can watch my second brain get built."

**Reference inspiration.** Bolt.new scaffolding a full-stack app live. v0 streaming a React component. Replit Agent's typing-out-the-file shot. YouTube's "building X in 10 minutes" genre.

**Demo sentence.** "Drop a URL into Claude; ten seconds later a fully-structured wiki article is typing itself in the preview pane, with headings and backlinks appearing in real time."

---

## 6. The OKURL protocol — `okwiki://page#paragraph` as a first-class link

**Pitch.** Register a system-wide `okwiki://` URI scheme during `open-knowledge init`. Any agent output, any terminal, any clipboard paste — click `okwiki://auth/oauth#authorize-flow` and the embedded editor pops (or focuses) and jumps to that paragraph. Claude Code responses lean on the scheme by default. ChatGPT's web search output can deep-link. The URL **is** the navigation primitive — agents ship them; humans click them; the panel opens.

**Emotional target.** Cohesion. Everything routes. No dead ends.

**Reference inspiration.** `vscode://` URI scheme. `x-github-client://` for GitHub Desktop. `slack://` channels. `zoommtg://`. Arc's tab-group links.

**Demo sentence.** "Claude replies with a blue `okwiki://` link; I click; the editor opens, scrolls, highlights; two seconds total."

---

## 7. The MCP Apps iframe choreography — "my wiki is a tool-call return value"

**Pitch.** Using the MCP Apps (OAI Responses API iframe) primitive, an MCP tool call returns **an interactive Open Knowledge editor embed as the result**. The user asked a question; the model decided the best response is "here, look at this page while it's being edited"; the iframe materializes inside the chat. The agent continues editing inside the iframe; the user reads; the user replies in chat. The chat transcript itself **embeds the editor**. The wiki is no longer a destination — it's a message.

**Emotional target.** The sci-fi moment. "The agent handed me the document the way it's written in the novel I read as a kid."

**Reference inspiration.** OpenAI Apps SDK (Spotify-in-ChatGPT pattern). MCP UI. Slack's Block Kit interactive messages. iMessage apps.

**Demo sentence.** "Ask Claude to summarize the auth doc; the reply isn't text — it's the live editor embedded in the chat bubble, cursor blinking, Claude's edits flowing in as you read."

---

## 8. "Embed-by-default" VS Code extension — first-party, not a thought

**Pitch.** Ship an official VS Code extension the day of launch. Opening any `.md` file in a folder that contains `.open-knowledge/` **replaces** the VS Code markdown preview with the Open Knowledge rich editor webview. No opt-in, no config — the extension detects the marker directory and upgrades the preview. Presence, agent cursor, everything works inside the VS Code webview panel. For the Cursor/VS Code crowd, Open Knowledge is now their markdown preview.

**Emotional target.** Recognition. "This replaces the ugly default preview with something I actually want."

**Reference inspiration.** Prettier extension (auto-formats on save, no thought). GitLens (upgrades blame). Thunder Client (replaces Postman inside VS Code). Copilot's inline suggestions.

**Demo sentence.** "Install the VS Code extension; open any `.md`; the preview pane is now a live rich editor with real-time agent collab — same keybindings, same sidebar, just better."

---

## 9. The `--watch` terminal output that streams to a browser

**Pitch.** `open-knowledge watch` in the terminal. A URL appears (something ngrok-feeling but localhost). Every edit Claude makes streams as a **live event log in the terminal**: `[10:03:14] Claude touched deployment.md:42-48`. Each entry is a clickable OSC-8 link that opens the editor panel in the browser at the exact position. The terminal becomes an activity feed. The browser is the inspector.

**Emotional target.** The feeling of a healthy production system — tail -f on your own brain.

**Reference inspiration.** Vite's dev server output. Next.js's terminal URL + browser. `docker logs -f`. CloudWatch Live Tail. Pino-pretty.

**Demo sentence.** "Run `open-knowledge watch`; the terminal tails every agent edit with clickable timestamps; click one; the browser jumps to that exact line."

---

## 10. The choreographed first-agent-edit moment

**Pitch.** First time an agent writes to the wiki inside an embedded editor panel, the panel **does a choreographed entrance**: gentle blur-fade of the background, a subtle "Claude is editing…" pill slides in, the agent's colored cursor materializes at the edit position with a 400ms pulse, the edited text appears with a soft highlight that decays over two seconds, then the pill dismisses. **Only the first time**, ever. After that, edits are just edits. But the first time is a cinematic.

**Emotional target.** Genuine delight reserved for a single moment. The "first flight" feeling.

**Reference inspiration.** Arc's first-run onboarding cinematic. Apple's unboxing. Linear's first-issue confetti. Stripe's first-payment animation. The one-time iCloud handoff animation.

**Demo sentence.** "The first time the agent edits a page while I'm watching, the panel does a tiny cinematic — once, ever — and from that moment I believe in the product."

---

## 11. Shareable "choreography clips" — every session is a replay

**Pitch.** Every co-editing session produces a `.okclip` artifact — a lightweight CRDT timeline replay (Y.Doc update stream + agent attribution + cursor positions) that can be posted to a public OK URL. Viewers hit the URL and watch the session play back **in a live editor at normal speed**, with a scrub bar. Twitter-ready, 30–60s loops, watermarked with the user's avatar + agent avatar. Every user produces shareable content without thinking about it.

**Emotional target.** Pride without performance. "Here's what I built with Claude this afternoon."

**Reference inspiration.** Loom. Replit's Multiplayer replays. Excalidraw's replay mode. Figma's Version History timeline. Warp's block-share links. v0.dev's shareable generation URLs.

**Demo sentence.** "Tweet a `okclip.link/abc` URL; anyone who clicks sees a 40-second real-time playback of Claude and me co-editing a document — scrubbable, beautiful, in-browser."

---

## 12. The Claude Desktop side-panel "workspace mode"

**Pitch.** When Claude Desktop launches with an Open Knowledge MCP server connected, the right pane — normally unused — automatically becomes the wiki. It's not an iframe hack; it's a first-class Desktop extension we ship. Conversation on the left, wiki on the right, both bound to the same Y.Doc. The persona feels "Claude with a notebook" the way ChatGPT Desktop + a Notion window is "me toggling two windows." Now they're one.

**Emotional target.** The feeling of an integrated workspace vs. a dock of windows.

**Reference inspiration.** Notion Calendar integration. Arc's Split View. Superhuman's reading pane. Apple Mail's preview pane. Obsidian's multi-pane workspace layout.

**Demo sentence.** "Open Claude Desktop; the right panel already contains my wiki — conversation and notebook, one window."

---

## 13. The Cursor inline-preview hook

**Pitch.** Cursor's inline chat has a preview slot. Hijack it. When an agent response references a wiki page, the inline preview pane becomes an **embedded Open Knowledge editor** scrolled to the referenced section. No separate tab, no app-switch. The preview is now live-editable, agent-presence-enabled. Cursor users who never leave their editor never have to leave it to touch the wiki either.

**Emotional target.** "This feels like it was always supposed to be this way."

**Reference inspiration.** Cursor's Apply / inline diff preview. GitLens hover-preview. Copilot inline completions. Linear's Cursor plugin.

**Demo sentence.** "In Cursor, I ask about our OAuth flow; the inline-chat preview pane transforms into the wiki's auth page, live-editable, Claude's cursor already blinking."

---

## 14. The dock pulse — persistent presence, subtle signal

**Pitch.** A tiny Open Knowledge menubar (macOS) / system tray (Windows/Linux) icon. When no agent is editing, it's a soft dot. When an agent is actively editing, it **pulses gently** — the same breathing rhythm as an AirPods case. Click it: the editor panel pops to front at the agent's current position. Ambient awareness of "the wiki is being worked on right now." Doesn't interrupt; just exists.

**Emotional target.** Ambient companionship. The AirPods-charging feeling — you know, without looking.

**Reference inspiration.** AirPods case pulse. Things 3's menubar. Raycast's tray. Slack's "typing" dot. Linear's keyboard-nav pulse.

**Demo sentence.** "A little dot in my menubar pulses when Claude is editing; I click it; the wiki panel snaps open at the live edit position."

---

## 15. The `open-knowledge link-here` one-shot

**Pitch.** In any agent environment, typing `open-knowledge link-here` (or invoking the MCP tool equivalent) creates a new wiki page **linked to the current conversation**. The page's frontmatter has `source: <conversation-id>`, `agent: <model>`, and a backlink to the chat transcript. The editor panel opens with the page ready to edit. The conversation is now a wiki page with a bidirectional link. Conversations become durable artifacts in the knowledge graph.

**Emotional target.** The "save as" moment for thought. Capturing the ephemeral.

**Reference inspiration.** Raycast's "quicklink." Bear's from-clipboard import. Readwise's highlight capture. Apple Notes' "share to." The GitHub "Discussion → Issue" promote flow.

**Demo sentence.** "After a useful 20-minute Claude session, I type `link-here`; a new wiki page spawns linked to the chat, ready to expand — the conversation is now a permanent artifact."

---

## 16. "Try this agent" links — like tryitcommerce.com but for skills

**Pitch.** Every Open Knowledge wiki page can publish a `try-this-agent.link/<slug>` URL. Clicking it (from any browser, no install) opens a **hosted Claude Code-like chat bound to the wiki's MCP server**, with the page as the conversation starter. The embedded editor panel is pre-opened to the page. Zero-install demos. Share the URL on Twitter; anyone who clicks lands in a working agent session inside Open Knowledge.

**Emotional target.** Frictionless trial. "I can try the product without signing up."

**Reference inspiration.** StackBlitz's instant-clone URLs. CodeSandbox embeds. v0.dev's public chat URLs. Replit's "Run on Replit." HuggingFace Spaces.

**Demo sentence.** "Click `try-this-agent.link/my-auth-doc`; a full agent session opens in the browser with my wiki embedded on the right — zero install."

---

## 17. The Playwright-invocable editor — "programmable viewer"

**Pitch.** Ship a Playwright helper library: `await openKnowledge.openEditor({ page: 'auth.md', position: 42 })` returns a controlled browser instance with the editor open. Used inside agent environments that embed Playwright (Claude's computer-use, Anthropic's agent framework, Cowork). The agent doesn't just edit the file; it **opens a browser and reads the page the user would read**, including the rendered rich content, links, backlinks, agent-presence UI. Completes the loop.

**Emotional target.** The "my agent actually uses the product the same way I do" feeling.

**Reference inspiration.** Anthropic computer-use demos. Replit's agent-browser. OpenAI's operator showing the same UI a human sees. Puppeteer scripting that feels human.

**Demo sentence.** "The agent opens the editor in a headless browser, reads the rendered page, makes edits, captures a screenshot, and paste the screenshot back into chat as proof."

---

## 18. WILD CARD — The "editor-as-REPL" mode

**Pitch.** A split where the left pane is a live REPL (running in WebContainers) and the right pane is the Open Knowledge editor. The REPL's stdout stream **pipes into the editor as it runs** — every line becomes a paragraph, heading, or code block depending on its shape. The agent can run code, watch output stream into a wiki page, refine, commit. The wiki becomes a **live lab notebook** — executable and editable. Jupyter's "notebook" meets Arc's live web.

**Emotional target.** The Jupyter-notebook "I can't believe this is a real thing" feeling, but for knowledge work with an agent driving.

**Reference inspiration.** Observable notebooks. Jupyter. MATLAB Live Scripts. StackBlitz WebContainers. Bolt.new. Claude's code-execution tool.

**Demo sentence.** "Claude runs a Python analysis; stdout streams live into a wiki page on the right; by the time the code finishes, there's a full formatted research note with charts and a commit timestamp."

---

## 19. WILD CARD — The "Pip-Boy" mode (terminal-native rendering)

**Pitch.** For users who refuse to leave the terminal, ship a **terminal-rendered Open Knowledge editor** using `ink` or equivalent — ANSI-colored rich markdown, inline images via Kitty/iTerm protocols, agent cursor as a blinking block, presence as a tiny avatar in the top-right, full `vi` keybindings. Embeds into Claude Code CLI via a subscreen. Cursor collaboration works over ANSI. **A rich editor that never leaves the TTY.** Warp-grade reimagining of "the terminal can be the editor."

**Emotional target.** The terminal purist's "wait, how is this real" reaction — plus a legendary Twitter clip of two ASCII cursors typing next to each other in an ANSI-rendered markdown doc.

**Reference inspiration.** Warp's block UI. Ink (Vadim Demedes). Magit. Helix. GitHub's Mona Sans terminal rendering. Fallout's Pip-Boy UI. Charm's Bubble Tea / Glamour. `fx`.

**Demo sentence.** "Inside Claude Code, I hit `Ctrl-O`; the terminal splits and a fully-rendered rich markdown editor appears — images, bold, links, agent cursor, presence avatar — all ANSI."

---

## 20. WILD CARD — The "holographic" presentation mode

**Pitch.** A presentation mode where the Open Knowledge page plays **as a deck in the embedded panel**, auto-advancing while the agent narrates in the chat. Headings become slide titles; paragraphs become speaker notes; the agent reads them aloud via Desktop's TTS while the slide plays. The agent can pause, rewind, take questions, and **edit the underlying wiki live while presenting** (edits propagate to the "deck" in real time). Presentations as living documents. The Prezi-killer that is also the Loom-killer.

**Emotional target.** "Wait, we just gave a meeting and edited the canonical document at the same time."

**Reference inspiration.** Tome (AI-generated decks). Pitch. Gamma. Reveal.js. Mmhmm's picture-in-picture. Loom. Mercury. Apple Keynote's rehearse mode. The Magic Leap demo.

**Demo sentence.** "Hit `present`; the wiki plays as a slide deck while Claude narrates; someone asks a question; Claude edits the underlying page mid-sentence and the slide updates live."

---

## Meta — common threads across all 20 ideas

- **Every idea produces a share-artifact.** Either a URL, a clip, a screenshot, or a choreographed moment screen-captured. Per the Bolt/v0/Warp lesson: the product and the tweet are the same thing.
- **Every idea minimizes user motion.** The agent brings you to the editor; you don't open it. This is the differentiator vs. Obsidian's plugin stack (where the user is always the driver).
- **Every idea is one-command installable.** `open-knowledge init` plus an optional env flag registers all embed surfaces at once. No per-environment setup.
- **Every idea has a 10-second video clip.** That's the minimum viable viral unit (Bolt's TikTok, v0's X thread, Clawd's 6-second GIF).
- **Every idea works *first* in Claude Code** (the evangelist channel per §2 Mode A) and secondarily in Cursor / Claude Desktop / MCP Apps / VS Code. Don't try to ship five surfaces on day zero; ship Claude Code as the lighthouse and let the clips pull the rest.
