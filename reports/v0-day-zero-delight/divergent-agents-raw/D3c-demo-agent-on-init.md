# D3c — Demo agent on init (agents SHOW UP on day zero, not "configure your own")

> **Lens.** Agent collaboration is the locked differentiator (S5). Today it's invisible until a user has installed Claude Code, approved an MCP server, restarted the client, and run a prompt. Multi-minute friction. PROJECT.md pre-mortem risk #4 says the "zero LLM compute" stance can read as *dumb* if the demo gap is too wide. Resolve it: the agent SHOWS UP on init.
>
> **Posture.** Unbounded. 20 ideas + 3 wild cards. Engineering cost ignored. Many of these are mutually exclusive — the surface area is the point.

---

## Core ideas

### 1. The Choreographed Hatch
`open-knowledge init` ends with a 12-second cinematic in the terminal AND in the editor, simultaneously. Terminal: ASCII mascot waddles in, says "watch this." Editor (auto-opened): a fake agent cursor materializes at the top of `welcome.md`, types — at human-imperfect cadence with backspaces and corrections — a personalized welcome paragraph that names the user's repo, lists three real files it found, and ends with `[[wiki-link]]` to a redlink the user can click. **No LLM call.** Pure templated text + a CRDT replay choreographer. The user has now SEEN the differentiator before they've configured anything. Total time from `npx` to "whoa": ~25 seconds.

### 2. The Two-Cursor Welcome Page
The welcome doc opens with TWO presence cursors visible from frame 1: yours (real) and "Olly" (a scripted persistent demo agent). Olly types "← that's you, this is me, let's co-edit" then drops a tasklist. The user can interrupt, paste, scroll. Olly *gracefully yields the cursor* whenever the user touches the doc. The yield IS the demo — it shows that co-editing isn't turn-based. Olly stays in the doc until the user explicitly evicts him (`/agent evict olly`).

### 3. The CRDT Replay Format `.okreplay`
Ship a recorded session as a first-class file format. `init` plays `welcome.okreplay` — a 90-second deterministic CRDT update stream of a real prior agent+human session writing a real document. It's not a video; it's the actual Y.Doc updates replayed at 1.5× speed. User sees real cursors, real attribution flashes, real per-origin undo trail accumulating. Then the playhead pauses and hands the keyboard over. Bonus: `.okreplay` becomes a sharable artifact pattern — every interesting session can be recorded and shared as a tiny binary.

### 4. The Cloud Burst (one free Anthropic call)
We hold a small Anthropic budget. First-run users get exactly one real LLM call, fingerprinted to bunx hash + machine ID, gated server-side. The agent reads `package.json`, the README, the largest 5 files, and writes a real personalized welcome doc citing them. The cost is ~$0.04 per user. After the call: "That was on us. Configure your own key for unlimited." This is the **single most expensive 30 seconds we'll ever buy** and probably the most converting.

### 5. Llama-Cpp Baby Agent (`okagent-mini`)
Bundle a 1.5B parameter local model that ships with OK as an optional install (`open-knowledge init --bundle-baby-agent`). It can co-edit, summarize, and respond to `@okmini` mentions. It's bad — and we say so. "Use Olly Mini to feel the loop. Plug in Claude when you want it to actually be smart." The baby is the *gateway drug*; it doesn't compete with frontier agents, it sells them.

### 6. Pretend-Agent: `@lorem`
Pre-installed. Type `@lorem` in any doc, it writes lorem ipsum at imperfect-human cadence with attribution, presence cursor, the works. Zero intelligence, full UX. Useful for: demo recordings, presentations, screen-shares, onboarding without a real agent. Marketed as "the world's dumbest collaborator. Hire smarter ones from your favorite agent IDE."

### 7. The MCP Approval Celebration
The first time Claude Code (or any client) successfully calls an MCP tool, the editor explodes with confetti, the mascot in the corner shakes hands with a new mascot labeled "Claude," and a toast appears: **"Welcome, Claude. Olly's been holding your seat."** Olly (the demo agent) waves and dissolves. The handoff is the moment the demo becomes real. The editor remembers — first-Claude-arrival is a versioned milestone in the version-history timeline forever.

### 8. Onboarding That Refuses To Finish Without Witnessing An Agent
`init` shows a 4-step checklist. Step 4: "Watch an agent edit your knowledge base." There is no skip button. The default (if no MCP-discovered client is running) auto-spawns the scripted demo so step 4 always completes. If a real agent IS connected, step 4 hands it a prompt. **Either way the user sees the differentiator before init exits.** The mascot says "I can't let you leave until you've seen it." This is opinionated as hell. Linear-style.

### 9. README-As-First-Edit
After init, prompt: "Want an agent to draft a README for this repo right now?" Yes → opens user's preferred IDE with a pre-formed prompt, the editor pops open in split view, and the user watches the README appear character-by-character via agent-write through OK. The output is a real artifact they keep. **The first thing the agent does is genuinely useful** — not a tutorial doc that gets archived, a real README. Conversion is asymmetric: even if 1 in 5 takes the offer, those 1 in 5 share the README.

### 10. Trojan Horse via `npx`
`npx open-knowledge demo` (separate from `init`) launches a fully-self-contained 60-second demo: spins up server, opens editor, plays the `.okreplay` of a real agent+human session on a sample repo. No install, no config, no commitment. This is the **shareable URL equivalent** in the CLI universe — it's the link that gets posted on X with "watch this for a minute, you've never seen co-editing like this." The actual product install is a button at the end of the demo.

### 11. The `--with` Flag at Install Time
`npx open-knowledge init --with claude-code` auto-discovers the local Claude Code install, writes the MCP config, restarts the relevant daemons, and proves the connection by triggering a real handshake before init exits. Variants: `--with cursor`, `--with codex`, `--with cowork`. **The friction Claude Code makes the user solve manually, OK solves at install time.** "Bring your own agent" becomes "bring your own agent in one flag."

### 12. Reverse-MCP Bootstrap
First time the editor opens, it sniffs for any running MCP-aware process on the machine via `lsof`/process tables. If Claude Code is running anywhere → push notification in the IDE: "Open Knowledge wants to introduce itself. [Approve]." User clicks. Done. The editor and Claude Code introduced themselves. **No `.mcp.json` editing, no restart, no docs.** The agent just appears. (Implementation: piggyback on Claude Code's hot-reload of MCP config or use a side-channel `/mcp add` invocation.)

### 13. The Welcome-Doc Is The Product Tour
Instead of an out-of-band tutorial, the welcome doc ITSELF is the tour. Headings include `## Watch me edit (the agent will write here in 5 seconds)`, `## Type [[ to make a wiki link`, `## Press Cmd+Z to undo what the agent did`. Each section's body is a live instrumented surface — an agent writes into the first one, a redlink completion fires in the second, an undo-button highlights when the third is reached. **The doc is the demo is the artifact.**

### 14. "Steal Karpathy's Repo" Mode
`open-knowledge init --karpathy` clones a curated public repo (Karpathy's nanoGPT-docs or similar), runs an agent over it producing a real knowledge base with backlinks, presents the result with a banner: "This is what your repo becomes after one agent pass. Here's how to do it on yours." The demo is **someone else's familiar codebase being transformed**, not a synthetic toy. Karpathy archetype users immediately recognize it.

### 15. The Postcard
Init produces a single shareable PNG postcard: `welcome-${reponame}-${date}.png`. Image shows the welcome doc with both cursors, the attribution timeline, the redlink graph preview. Watermark: `made with open-knowledge / day 1`. The postcard is auto-saved to `~/Pictures` and copied to clipboard. **One artifact per init, designed to be tweeted.** Bolt's shareable URLs but for CLI tools.

### 16. Persistent Olly As First-Class Citizen
Olly the demo agent doesn't disappear after onboarding. He stays attached to the workspace, dormant, resurrectable via `@olly` in any doc. He becomes a fallback: when no real agent is connected, mention `@olly` and you get a scripted "Olly's a demo agent — connect Claude for real responses" message styled like an actual agent reply. **The empty state is never empty.** The product never feels lonely.

### 17. The Aha-Then-Ask Order
Standard onboarding asks for the API key first, then shows the value. Invert it: NEVER ask for an API key during init. After the user has WITNESSED co-editing (via Olly / replay / cloud burst), the editor sidebar shows a permanent "🚀 Want this with a real agent? [Connect Claude Code]" CTA. Conversion happens AFTER the wow, not before. Reframe: API key isn't a chore, it's the upgrade button on a rocket they've already test-flown.

### 18. The Co-Edit Stress Test In Onboarding
A 10-second mini-game: type as fast as you can while Olly types in the same paragraph. The bridge invariant holds, both cursors stay live, Cmd+Z undoes Olly's run specifically — the user can FEEL the CRDT. This is the single most differentiating moment any wiki product has ever shipped. It's also fun. Display a "concurrent character count" leaderboard against `@karpathy`'s recorded best.

### 19. Time-Travel Trailer
After init, the version-history timeline already has 4 commits in it: the agent's welcome write, your first edit, an agent revision, your accepted merge. Click any of them — the doc rewinds. **The user has shipped 4 versions before they've thought about saving anything.** The git-backed history isn't a future-feature, it's already populated, by Olly, on day 0.

### 20. The Mascot Hands Off The Keyboard
The mascot animation literally walks across the editor surface and hands a comically large keyboard to a second mascot labeled "your agent." When Claude Code first connects, the second mascot accepts the keyboard. Until then, the second mascot is shaded out with a "vacant" tag. **Visual metaphor for "this seat is reserved."** The product is incomplete without an agent in that seat — but the seat is set, and the meal is on the table.

---

## WILD CARDS

### W1. The Agent Speedrun Leaderboard
Every `open-knowledge init` records a deterministic hash of (init time, first agent response time, time to first wiki-link, time to first cross-doc backlink). Submit to `speedrun.openknowledge.dev`. Karpathy gets a perfect score, Tobi Lutke beats it, the leaderboard becomes a **public benchmark of how fast the human + agent loop converges** on different machines, with different agents, on different repos. The benchmark IS the GTM. Aider's leaderboard pattern but for setup-to-flow time.

### W2. The Live Agent Lounge
On first launch, the editor offers: "Want to drop into the OK Agent Lounge — a live shared doc where strangers and agents are co-editing right now?" One click, the user is thrown into a moderated public Y.Doc with 30 other strangers and a few rotating LLM agents (we pay for these) co-writing a graffiti wall. The user sees agent collaboration **at scale, with strangers, in the wild,** before they've written anything in their own repo. They leave the lounge, return to their own workspace, and now their workspace feels lonely without an agent. We've created demand by exposure. (Twitch-plays-Pokemon meets Figma multiplayer.)

### W3. The Agent Inbox Pre-Loaded With A Real Letter From Karpathy
Day-0 inbox has one message: a video letter or hand-written markdown note from Karpathy (or kepano, or Tobi, or Levels) saying "welcome to your knowledge base, here's what I do with mine." Costs us a celebrity outreach + recording budget. Pays back in: every screenshot of "open OK and Karpathy says hi" is shared. The day-0 experience is **a personalized welcome from the person who minted the term that defined your category**. (The deeper move: Karpathy's note IS a wiki page in your KB. It has backlinks to suggested next docs. The first agent that connects can reply to it in the same doc. He becomes the first node in your graph.)

---

## Reframing "BYO agent" as upgrade, not chore

The current framing is configuration overhead. Five reframes that flip it:

1. **"Olly's holding your seat."** The seat metaphor — there's a chair at your table reserved for an agent. Connecting Claude is filling the seat, not setting up plumbing.
2. **"The keyboard handoff."** Visual: mascot literally hands over the keys. Connecting an agent is the dramatic completion of a setup, not a new burden.
3. **"Upgrade your demo."** You've test-flown with Olly / the cloud burst / the replay. Connecting a real agent is the upgrade path, like switching from the test-drive Tesla to the bought one.
4. **"Make Olly a real boy."** Connecting Claude is breathing life into the demo agent — the workflows, the prompts, the muscle memory the user built with Olly all transfer.
5. **"You've been pair-coding with a sketch. Bring in the real one."** The first agent slot is positioned as a *role* the user fills with their preferred pick — Claude, Cursor, Codex — like casting a co-host for a podcast they've already started.

The unifying pattern: **the connection step is positioned as a milestone in a journey the user is already on**, not an admin task they've been blocking on. Every reframe makes "approve this MCP" the *climax* of init, not the *prerequisite*.

---

## Cross-cutting observations

- The cheapest moves (W1, #6, #10, #15, #20) are pure presentation layered on existing infrastructure. The expensive ones (#4, W3) buy disproportionate share-events.
- Multiple ideas compose: (#3 replay) + (#7 confetti handoff) + (#17 ask-after-wow) form a single coherent first-90-seconds.
- The single biggest insight across all 20+3: **"agent on day 0" doesn't mean "intelligent agent on day 0."** It means *the loop, the presence, the attribution, the undo* are all visible — even with zero LLM intelligence behind them. We're selling the *substrate*; the intelligence is the user's own.
- The hardest competitor isn't Notion or Obsidian, it's **the absence of a felt category**. Olly + replay + handshake creates the felt category in 60 seconds. After the user has seen it, the question stops being "why this over Obsidian" and becomes "why am I editing alone."
