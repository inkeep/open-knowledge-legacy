# D3a — First 10 Seconds from `bunx @inkeep/open-knowledge` to "Whoa"

> Divergent ideation. UNBOUNDED. No engineering filter. The brief: compress 90s → 10s and find the legible "this is different" moment.
>
> Today's reality: install → 15-20 status lines → second command → boxed banner → blank editor → "Create your first file." Competent. Flat.
>
> Target: the user's mouth opens before they finish their first sip of coffee.

---

## Frame the 10 seconds

```
T-5s  ← bunx fetches & installs (dead air today)
T+0s  ← install completes, our first byte of stdout
T+10s ← "whoa" must have already happened
```

The install itself is a 3-8s dead window we don't currently use. The post-install window is currently spent on status lines that nobody reads. Both are reclaimable.

---

## 20 ideas

### 1. The single-command door
Kill `init` and `start` as separate verbs. `bunx @inkeep/open-knowledge` is the ONLY command. It scaffolds, registers, starts, opens. Anything else (custom port, headless, init-only) is a flag. The hello-world is one line of muscle-memory: `bunx @inkeep/open-knowledge`. Same shape as `npx create-next-app`, but no prompts, no questions, no second invocation. Time-to-editor: one shell line.

### 2. Pre-install priming sentence
Before `bunx` even resolves, we can ship a `prepare` script that prints **one sentence** during install: `Setting up your knowledge base. Your AI is about to have a memory.` That sentence frames everything that follows. It's the first time the user reads a marketing line in the terminal. It does the job a marketing site does — but inside the install. (Bolt.new's tweet equivalent, but in the install log.)

### 3. Install-time loading bar IS the demo
Replace npm/bun's default install spinner with a custom progress bar that shows what's being staged: `[1/4] Editor… [2/4] CRDT runtime… [3/4] MCP bridge… [4/4] Teaching Claude your wiki dialect…`. Each line lands as a real install step completes — not faked. The user reads "Teaching Claude your wiki dialect" and learns the entire product positioning before the first byte of stdout from our actual binary. **Free real estate.** ([[Bun preinstall hooks]] make this trivial.)

### 4. Auto-open with `?firstrun=1` URL
After scaffolding, immediately `open()` the browser to `localhost:3000/?firstrun=1`. The query param triggers a different render path — not the empty editor, but a **pre-populated welcome document already mid-stream**. The user's browser races the terminal banner. They tab to Chrome and see content writing itself. (Time-to-whoa: literally the network round trip.)

### 5. Demo agent that writes the welcome doc LIVE
Init spawns a fake MCP client (a hardcoded scripted "Claude") that writes a welcome document to the live Y.Doc, character by character, at human-readable speed, with the agent presence avatar in the corner. The user's first view of the editor is **content typing itself in front of them, with attribution shading**. They're watching the headline feature (real-time human+AI co-editing) before they've taken any action. The demo agent's first sentence: *"Hi Nick. I'm a scripted demo. The real Claude can do this too — try /buddy in your terminal to wake it up."*

### 6. Animal avatar assignment ceremony, in the terminal
The init output spends ONE line on a real ceremony: `🦊 You're the Fox on this knowledge base.` Deterministic from `git config user.name`. Ties the terminal output to the editor's presence bar (which already uses animal icons — the warmest surface we have today). Now the avatar is something the user *was given*, not something they noticed.

### 7. Warp-style competence theater
Init silently reads `git config user.name`, `git config user.email`, `~/.zshrc` for shell, `pwd` for project name, last commit message for project context. Banner becomes:
```
Welcome back, Nick.
You're set up in nicks-startup (last commit: "feat: shipping mode").
Claude Code is configured. Cursor is configured. VS Code, ChatGPT not detected.
Open your browser → http://localhost:3000
```
Zero questions asked. Everything inferred. The user's reaction: "how did it know?"

### 8. The `Cmd-click` URL is the entire UX
The terminal output is ONE line: a clickable URL. Cmd-click → browser opens → init completes in the background → editor materializes in <2s → first content streams in. The terminal is invisible after that one click. (Anti-pattern for terminal users; killer pattern for everyone else. Pick a battle.)

### 9. Pre-heat during install
The post-install hook (running while `bunx` is still "completing") starts the Hocuspocus server in the background, runs the file watcher, opens a hidden Chrome tab, primes the CRDT room. By the time the user reads the install banner, the editor is already alive at localhost. They click the URL → instant render, no warmup. Steve-Jobs-keynote pace.

### 10. The countdown banner
Replace the boxed banner with a five-line countdown:
```
Knowledge base ready in:
  3… registering with Claude Code
  2… opening your editor
  1… your first agent is awake
  ✓
```
Each line resolves in real time as the corresponding step completes. The user waits because the terminal is **performing** for them. Compare to a load screen with no progress bar — agonizing — vs. one with a countdown — interesting.

### 11. Init writes a real article using the real LLM
If `ANTHROPIC_API_KEY` is set (or Claude Code is detected as registered), init spawns a real Haiku call: *"Write a 3-paragraph welcome that explains what this knowledge base will become for Nick, who works on `nicks-startup`."* Result lands in the editor as the user opens it. Free, fast (Haiku is sub-second), and now the user has a personalized welcome that demonstrates the agent loop end-to-end. Ship a ✓ in the terminal: `Claude wrote your welcome page.`

### 12. The "browser opens to a tour" pattern
First-run editor opens not on README.md but on a **3-card horizontal tour**: card 1 shows a fake agent edit replaying with attribution shading; card 2 shows a wiki-link being clicked; card 3 shows the source/WYSIWYG toggle. Each card is 4 seconds, auto-advances. Total: 12 seconds, but those 12 seconds carry every locked differentiator. Then dismiss → editor.

### 13. Split-screen terminal+browser
On macOS, after install, the CLI uses AppleScript / `open -a` to position the Terminal window left-half and Chrome right-half, side by side. The user literally sees the terminal print ✓s on the left while the editor materializes on the right. The whole product is one tableau. (On Linux: prints `tmux` invocation. On Windows: skip.) Theatrical, ridiculous, **shareable as a single screen recording.**

### 14. The MCP handshake is visible
When `init` registers the MCP server with Claude Code, the terminal prints — not "configured" — but: `🤝 Claude Code now has access to 10 tools on your knowledge base. Try asking it to "summarize my wiki" and see what happens.` The handshake is named, narrated, and ends with a copy-pasteable prompt. The user has a script for what to type next. (Closes the "now what?" gap that kills onboardings.)

### 15. The deterministic species roll, terminal-side
Steal the `/buddy` move directly. Init computes `species = hash(user_id)` deterministically across 18 candidates (Fox, Otter, Owl, Fennec, Octopus, Capybara, Axolotl, Quokka, …). Banner: `🦊 Fox · Knowledge Companion · Common (97% roll)`. 1% chance of shiny gold-bordered output. The species is the same one that shows up as the user's presence avatar in the editor. **The terminal output is now collectible.** Reroll on `bunx @inkeep/open-knowledge --reroll`.

### 16. First-byte personality
The very first `console.log()` is a one-liner with character. Not "Initializing…" — instead:
```
Waking up your knowledge base.
This knowledge base is yours forever, even if we go away.
```
Two sentences. The first is warm. The second is a PROMISE — local-first, OSS, file-canonical — encoded as a blood-pact. Sets the entire trust posture in the first line.

### 17. The "second terminal trick"
After install, print: `→ Open a new terminal and run:  ck "what's in my knowledge base?"`. `ck` is a tiny shipped binary that calls Claude Code with a pre-baked prompt against the user's brand-new (empty) KB. Claude Code response: *"Looks like you just installed Open Knowledge — this base is empty, but I have access. Want me to scaffold a starter index from your README? (yes/no)"*. The user's first interaction with the agent loop is **the agent asking permission to do useful work.**

### 18. The animated ASCII KB, in the install bar
During the install window, an ASCII illustration of a tiny library grows line-by-line in the terminal — first an empty bookshelf, then a book appears, then a second, then an animated cursor scrolls into view, then a 🦊 walks across the bottom. By the time install completes, the user has watched a 6-second cartoon. (Competent ASCII art is shareable as a tweet-screenshot. cf. Stripe's CLI rocket; cf. asciinema embeds.)

### 19. "Your first agent" intro pop-out
The browser opens with a small chrome-overlay popup in the corner: a circular avatar, name, status: `Claude is here. (3 agents available — Cursor, Codex, Cowork pending.)` The user has never opened an editor where AI was a **default citizen of the empty room**. Notion's AI feels bolted-on; ours feels like the room came with someone already in it.

### 20. "Press space to begin"
Editor opens to a fullscreen black screen with a single line: `Press space to begin.` On space, a 5-second cinematic plays — the welcome doc materializes line-by-line as if an agent is typing it, with the species-avatar in the corner watching, then a wiki-link auto-creates, then the editor settles into normal state. Total ceremony: 5 seconds. **Skippable** with Esc. Arc-style ceremony for a CLI tool. Half the audience will hate it; the other half will record their first run as a TikTok.

---

## WILD CARDS

### WC1 — The reverse install: agent installs the product
Don't ship `bunx @inkeep/open-knowledge`. Ship a Claude Skill: `claude install open-knowledge`. The user types this **inside Claude Code**. Claude itself runs the install, narrates each step in chat, asks "want me to open the editor?", uses its own tools to open the browser. The install IS a conversation with the agent. The first time the user sees Open Knowledge, they're already collaborating with Claude *about Open Knowledge*. The product's first impression is delivered through its core differentiator. (No competitor can copy this — it requires the agent loop to already be alive.)

### WC2 — Voice greeting via macOS `say`
The CLI shells out to `say -v "Samantha" "Hi Nick. Your knowledge base is ready. Your fox is waiting in the browser."` Once. On first run only. Skippable with `--quiet`. Absurd, infantile, **unforgettable**. The first time a CLI talks to you out loud is the first time. Twitter clip writes itself: dev runs install, MacBook talks. ([[Mac say command]] is built-in, zero deps.) Tonally risky — could be mocked as Clippy 2.0 — but if we ship it as April-1-flavored-but-real (cf. `/buddy`), the criticism can't stick.

### WC3 — The shareable install-replay URL
`bunx` writes its own session — every line of stdout, color codes, timestamps — to a tiny JSON blob, then on completion prints: `Replay your install:  https://openknowledge.dev/r/x7k2p9`. The URL renders an asciinema-style replay of the user's exact session in the browser. They tweet it. Their followers click it. Their followers see the install they're about to do, end-to-end, with the user's actual name, project, ✓s, and the species roll. **Every install is a viral artifact.** First-of-its-kind for a CLI install. Implementation: 100 lines + a dirt-cheap KV store. Shareability: equivalent to v0.dev's permalink-per-generation.

---

## Stitched 10-second target sequence

If we picked the highest-leverage moves and stitched them:

```
T-5s  $ bunx @inkeep/open-knowledge
       [install bar: "Teaching Claude your wiki dialect…"]    ← Idea 3
T+0s  ✓ Welcome back, Nick.                                    ← Idea 7
       🦊 You're the Fox (Common · 97% roll)                   ← Idea 15
       🤝 Claude Code now has access to 10 tools.              ← Idea 14
       → Opening http://localhost:3000                         ← Idea 1
T+2s  [browser auto-opens]                                     ← Idea 4
T+3s  [welcome doc starts streaming in, attribution shaded]   ← Idea 5
T+8s  [first wiki-link auto-renders, species-avatar visible]
T+10s "whoa"
```

Total verbs the user typed: **one**. Total clicks: **zero** (browser auto-opened). Total moments of legible differentiation: at least three (species roll, agent-typing-in-real-time, attribution shading). The terminal looks competent. The browser looks alive. The species roll is collectible. The user has a story to tell within 10 seconds.

---

## What we'd be cutting

To hit 10 seconds we sacrifice:
- Two-step `init` then `start` (some users will resent the auto-merge)
- The boxed banner ceremony (boring but trustworthy — replaced with the countdown)
- The "Create your first file" empty-state moment (replaced with a streamed welcome doc — empty-state is gone)
- Configuration prompts (everything inferred, opt-out via flags)

What we explicitly preserve:
- Local-first promise (Idea 16's blood-pact)
- File-canonical (the welcome doc IS a real .md file on disk)
- OSS posture (no telemetry asks, no signup)
- Skippable ceremonies (Esc-to-skip, --quiet, --no-tour)
