# D5c — Reddit Communities (Launch Posts, Threads, Cross-Post Strategy)

> **Lens.** What lands on r/ObsidianMD, r/selfhosted, r/LocalLLaMA, r/ClaudeAI, r/artificial — five tribes with sharply different in-jokes, allergies, and aesthetics. Reddit is the *anti-Show-HN* — it sniffs out grift in 30 seconds, downvotes signups behind walls, and rewards people who show up as members of the tribe rather than as marketers passing through. This file is unbounded raw ideation: 18 launch ideas + 3 wild cards. Each idea: subreddit, title, screenshot/asset, thesis, seed comments, cross-post graph, why-it-lands, why-it-might-flop.

> **Stance.** Non-prescriptive, divergent. Many of these are mutually exclusive (you can't be a humble single-dev project and a Linear-style manifesto launcher in the same week). Pick the ones that resonate — but the tonal range itself is the point.

---

## Universal Reddit launch hygiene (table stakes for every idea below)

These aren't ideas, they're **the floor**. Skip any of these and the post dies regardless of content.

- **Account age + karma.** Throwaway accounts get auto-removed by AutoModerator on most of these subs. Nick (or whoever posts) needs an account that's been commenting in the sub for at least 30 days first.
- **No links in the post body until a comment asks.** Every "I built X" with a GitHub link in paragraph 1 reads as marketing. Drop the link in the *first comment* or in response to the first "where can I try it?"
- **First-person, past tense, frustrated-tinkerer voice.** "I was annoyed that..." beats "We're excited to launch...". The corporate "we" is downvote bait everywhere except r/programming.
- **No signup, no waitlist, no "request access".** This is the single biggest filter on r/selfhosted and r/LocalLLaMA. If they can't `git clone && bun install && bunx open-knowledge` and have it working in 60 seconds, the post is dead.
- **Picture or it didn't happen.** Every subreddit here is image-first in the feed. Text-only posts get ignored.
- **Reply within the first hour.** Reddit's algorithm weights early engagement. Whoever posts has to be at the keyboard for 90 minutes after.
- **Don't cross-post the same image+title to multiple subs in the same day.** Mods notice. Stagger by 3-7 days, rewrite the title, change the screenshot's framing.
- **Avoid the "Show HN smell."** No "🚀", no "I'm excited to share...", no "would love your feedback!". Reddit tolerates none of these.

---

## Idea 1 — r/ObsidianMD: "I made an Obsidian companion that adds real-time co-editing with my AI agents. 100% local, your vault stays yours."

**Subreddit.** r/ObsidianMD (~200K).

**Title.** *"I made an Obsidian companion that adds real-time co-editing with my AI agents. 100% local, your vault stays yours."*

**The word "companion" is doing all the work.** Not "alternative." Not "competitor." Companion. Lives next to your vault, doesn't replace it. r/ObsidianMD's collective trauma is the steady drip of "Obsidian alternative" posts from VC-funded apps trying to skim users — those posts get downvoted into oblivion because the implicit message is "your beloved tool is bad." Companion-positioning bypasses that immune response entirely.

**Screenshot.** Side-by-side: left pane Obsidian with a vault open, right pane Open Knowledge editor on the *same* `vault/note.md` file. Both have a cursor in slightly different positions. A floating tooltip on the right pane reads "Claude is editing — line 14." Bottom strip: a `git log` showing two commits — `human: nick` and `agent: claude-code`. **No logos visible**, no startup-deck framing, just two editors and a terminal. Looks like someone caught a screenshot mid-work.

**Thesis (post body).**

> I love Obsidian. I've used it for 4 years and I'm not switching. But over the last six months I've been pairing with Claude Code on basically everything and it kept failing me on my vault — Claude would write `.md`, I'd open Obsidian, see Claude's edits, want to fix one sentence, and Obsidian would pop up "file changed on disk — reload?" and trash whatever I'd been writing.
>
> I built a thing that fixes this. It runs locally, watches my vault folder, opens a tab at localhost where I can edit alongside the agent in real time. CRDT under the hood so neither of us clobbers the other. Press Cmd+Z and it undoes only the agent's last edit, not yours. Source ↔ rendered toggle just like Live Preview.
>
> Files stay markdown. Wiki-links work. Frontmatter works. Your vault folder is unchanged. If you delete the tool tomorrow, you have your vault back as if nothing happened.

**Seed comments to leave open.**
- "Does it work with the existing Obsidian Sync? I don't know yet — anyone tried?" *(invites a tester to find out for you)*
- "What plugins from your vault still work? I think most do but Templater might fight it." *(seeds a plugin-compatibility thread)*

**Why it lands.** "Obsidian companion that respects your vault" hits the sub's three core values in one sentence: local files, no lock-in, additive. The "file changed on disk — reload?" bug is a known and *hated* Obsidian failure mode (you'll see commiseration immediately). The fact that the demo screenshot has a `.md` file open in *both* tools simultaneously is a flex that no other product can pull off.

**Why it might flop.** r/ObsidianMD is suspicious of anything that mentions "AI" because of the wave of half-baked AI plugins from 2023-2024 that ended up abandonware. Frame as "for people already using Claude Code / Cursor" not "AI for everyone."

**Cross-post:** wait 5 days, then r/ClaudeAI with a different angle (see Idea 4).

---

## Idea 2 — r/selfhosted: "Local-first markdown wiki with built-in MCP server. docker-compose up. No cloud, no telemetry, no signup."

**Subreddit.** r/selfhosted (~400K, brutal critics).

**Title.** *"Local-first markdown wiki with built-in MCP server. `docker-compose up`. No cloud, no telemetry, no signup."*

**Three "no"s in the title because r/selfhosted scans titles for them.** They are the trust signal that makes someone click. r/selfhosted's collective enemy is "SaaS masquerading as OSS" — projects that ship a self-hostable tier as a funnel to the cloud version. Every word in the title is calibrated to short-circuit that suspicion.

**Screenshot.** A terminal. Top half: `cat docker-compose.yml` showing a 12-line file with no env vars, no API keys, no external services. Bottom half: `curl localhost:3000/api/health` returning `{ok: true, telemetry: "disabled by default"}`. **No GUI screenshot at all** — r/selfhosted respects CLI more than UI.

**Thesis (post body).**

> I run a homelab with Paperless-ngx, Karakeep, and a folder of markdown notes. The notes folder grew faster than I could keep it organized so I started using a local Ollama + a Claude Code subscription to triage and cross-link.
>
> The agent side worked fine. The "local wiki it can write to without trusting some cloud" side did not. So I shipped this.
>
> - Single binary or `docker compose up`.
> - Exposes an MCP server over a unix socket or HTTP.
> - Storage is plain `.md` files in a directory you choose. `git init` if you want history; works without git too.
> - Zero external network calls. No telemetry. No phone-home for updates. No login screen, ever.
> - ARM64 builds, runs on Raspberry Pi 4 (tested).

**Seed comments.**
- "What's the resource footprint on a Pi? I tested ~120MB RSS but no benchmarks yet — if anyone runs it on a Pi 5 I'd love to compare." *(invites Pi enthusiasts to amplify with their own data)*
- "Currently no auth — assumes you're behind tailscale/headscale on your LAN. Adding optional reverse-proxy auth header support next; PRs welcome." *(invites the "I run everything behind authelia" crowd)*

**Cross-post graph.** r/selfhosted → r/homelab (3 days later) → r/raspberry_pi (5 days later, only if Pi performance is genuinely good).

**Why it lands.** Posts that include a docker-compose.yml in the screenshot consistently outperform on r/selfhosted. The "no signup" line specifically — last quarter the most-upvoted r/selfhosted posts had "no signup," "no telemetry," "no cloud" in the title. The MCP angle adds novelty for the subset who've been hearing about MCP without trying it.

**Why it might flop.** r/selfhosted hates "no native auth." Mention the auth story up front (reverse-proxy header, basic-auth, or "behind your tailnet") or you'll lose the thread.

---

## Idea 3 — r/LocalLLaMA: "My local Llama 3.1 8B is now my wiki gardener. Here's the MCP setup."

**Subreddit.** r/LocalLLaMA (~400K, technically deep).

**Title.** *"My local Llama 3.1 8B is now my wiki gardener. Here's the MCP setup."*

**Specific model in the title is the trust signal.** r/LocalLLaMA only respects posts that name specific quantized models. "AI" → downvote. "Llama 3.1 8B Q4_K_M" → upvote. The phrase "wiki gardener" is novel and sticky — it implies the LLM is doing low-status maintenance work, which fits the sub's anti-hype aesthetic.

**Screenshot.** A terminal split-pane. Left: `ollama run llama3.1:8b`. Right: a tail of the wiki's git log showing the local Llama making 47 commits over the last 24 hours — frontmatter cleanup, backlink inserts, dead-link sweeps. Bottom strip: a tiny stats line — "Local model time: 4.2 hours of GPU. Cloud calls: 0."

**Thesis (post body).**

> I've been wanting a "set it and forget it" agent for organizing my notes — link inference, summary refresh, dead-link sweeps. Frontier models do it well in Claude Code but the cost adds up and I don't want my private notes leaving my machine.
>
> I built a markdown wiki that exposes an MCP server. Pointed Llama 3.1 8B Q4 at it via mcp-bridge and let it run overnight on a small worktree. Results in the screenshot.
>
> An 8B local model isn't going to write your articles for you, but it's *plenty* for the bookkeeping work — frontmatter normalization, "is this `[[link]]` actually a real page?", "this article hasn't been touched in 90 days and references three pages that no longer exist." That's 80% of what I want a wiki gardener to do, and it can do it on a 3090 forever for free.

**Seed comments.**
- "Tried Qwen 2.5 7B for the same task — slightly worse at frontmatter, slightly better at link inference. Curious what others find." *(invites model-comparison thread, which r/LocalLLaMA loves)*
- "Roughly 350 tokens per maintenance action; I'm seeing ~4 actions/min on a 3090." *(invites perf comparison)*

**Cross-post.** r/Ollama (next day, almost certain pickup), r/MachineLearning (probably skip — too applied for ML).

**Why it lands.** r/LocalLLaMA's most upvoted posts in the last year have all been "local model doing something useful that you'd have assumed needed Claude/GPT-4." A small local LLM as wiki janitor is exactly that genre. The benchmark-style framing (4 hrs GPU, 0 cloud calls) is the sub's native dialect.

**Why it might flop.** If the demo only works with Claude API and the local-model story is a footnote, r/LocalLLaMA will sniff it out and the post dies.

---

## Idea 4 — r/ClaudeAI: "I built a knowledge base that Claude Code can read AND write through MCP — here's how it changed my workflow"

**Subreddit.** r/ClaudeAI (~150K, growing fast).

**Title.** *"I built a knowledge base that Claude Code can read AND write through MCP — here's how it changed my workflow"*

**The "AND write" is the hook.** Most MCP servers in the wild are read-only. The sub has seen many "here's a search MCP server" posts. A *write* MCP server with attribution and review is genuinely new content for them.

**Screenshot/GIF.** Animated GIF, 8 seconds. Claude Code terminal on the left, browser editor on the right. User in Claude Code says "look up the auth notes and add what we just figured out." Right pane: cursor appears in the editor, types out a paragraph, the page now has a new section. A tiny pill labeled "Claude Code (session abc-123)" floats next to the new paragraph. Then user in Claude Code says "wait, undo that last change." Right pane: the paragraph fades out. **One unbroken clip, no cuts.**

**Thesis (post body).**

> I've been using Claude Code daily for ~6 months. The biggest workflow gap for me has been "Claude already understood the codebase, but every time I switched repos or started a new conversation, all the institutional knowledge was gone."
>
> I built a small wiki Claude can write to. It's an MCP server with attribution — every edit Claude makes is committed to git as the agent, so I can `git log --author=claude-code` and see what it added overnight. There's a localhost editor where I can review and edit alongside it (real-time co-editing, weirdly).
>
> The unlock for me has been *the wiki survives the conversation context*. I don't have to re-explain the OAuth flow every Monday because Claude wrote it down on Friday and Claude on Monday can read it.

**Seed comments.**
- "The MCP tool surface is intentionally small (10 tools) — `read`, `write`, `propose`, `search`, `link`, `backlinks`, `recent`, `list-drafts`, `merge-draft`, `request-review`. Trying to keep within the recommended ceiling. Anyone hitting context-window issues with larger tool sets in their MCP config?" *(invites the MCP-design crowd)*
- "Skill file you can drop into your Claude Code project: link in comments." *(invites the "skills enthusiasm" crowd that's been growing since kepano's Jan 2026 release)*

**Cross-post.** r/ChatGPTCoding (3 days later, retitled for tool-agnostic), r/cursor (5 days later, retitled for Cursor users — *only if a Cursor MCP demo also works*).

**Why it lands.** r/ClaudeAI's biggest current obsession is "MCP servers I should know about" — there are weekly threads asking exactly this. A read+write MCP with a UI panel beside Claude Code is a genuine new entry to that conversation.

**Why it might flop.** If the GIF doesn't show actual Claude Code working (they will look for the prompt prefix and the model name), they'll suspect a fake demo.

---

## Idea 5 — r/artificial: "Watching Claude write a wiki entry while I write the next one in the same document is the weirdest, coolest feeling"

**Subreddit.** r/artificial / r/singularity (~3M+ combined, broader audience, more impressionable).

**Title.** *"Watching Claude write a wiki entry while I write the next one in the same document is the weirdest, coolest feeling"*

**Phenomenology-as-headline.** r/singularity in particular rewards posts that frame technology in subjective, "future is here" terms. The title doesn't sell a product — it sells a *feeling*. The sub will fill in the future-is-here narrative for you.

**Screenshot/video.** Screen recording, 15 seconds. The single shot is of two cursors in a markdown document. A blinking text cursor labeled "Nick" types "and then we should consider..." while another cursor labeled "Claude" simultaneously types "...the failure modes of three-way merges in CRDTs are well-studied" two paragraphs above. Both cursors visible at once. **No UI chrome visible at all** — just the document.

**Thesis (post body).**

> Spent the morning writing a research note while Claude was filling in adjacent sections. Both of us editing the same document, both cursors visible, neither of us stepping on each other's text.
>
> It feels different from autocomplete. Autocomplete is the LLM finishing your sentence. This is the LLM writing its own sentences in parallel, while you write yours. Like co-writing with a colleague who doesn't get tired and doesn't get jealous of credit.
>
> I don't know if this is The Future but it's *a* future and I wanted to share what it actually looks like.

**Seed comments.**
- "Open source if anyone wants to play with it." *(don't sell — invite)*
- "The technical bit that makes this work is the same CRDT tech that powers Figma multiplayer. The novelty is just pointing the second cursor at an LLM." *(reframes the magic as humble)*

**Cross-post.** r/Futurology (slightly different title, lean even harder into phenomenology).

**Why it lands.** r/singularity rewards "raw moments from the frontier." A 15-second video of two cursors writing in parallel is a raw moment. The framing is "I'm a person who experienced this thing" not "I built a product."

**Why it might flop.** r/artificial will be skeptical of anything that smells like product placement; the post should genuinely look like someone's morning, not like a launch.

---

## Idea 6 — r/ObsidianMD (second wave): "I imported my 4-year Obsidian vault into a thing that lets agents write to it. Here's what survived (everything) and what didn't (one Templater plugin)"

**Subreddit.** r/ObsidianMD again, 2-3 weeks after Idea 1 (different account, different angle).

**Title.** *"I imported my 4-year Obsidian vault into a thing that lets agents write to it. Here's what survived (everything) and what didn't (one Templater plugin)"*

**The truth-telling about what didn't work.** r/ObsidianMD will instantly trust a post that admits a failure — it's what separates real users from marketers. Listing the *one* thing that broke and saying "everything else worked" is more credible than "100% compatible!"

**Screenshot.** Two folder trees side-by-side. Left: an Obsidian vault file tree. Right: the same tree opened in Open Knowledge — bit-identical. Highlighted in yellow: one folder with a Templater plugin file that's grayed out. Below the screenshot: a tiny migration log — "227 markdown files, 18 folders, 1,402 wikilinks, 89 callouts, 3 dataview blocks (rendered as code blocks). One Templater script: not supported."

**Thesis (post body).**

> Migrated my main vault for a week as an experiment. Wrote up what worked and what didn't.
>
> Worked: every `[[wiki-link]]`, every callout, every frontmatter field, every embed, all my folder structure, my graph view (rendered identically). Backlinks all pointed where they should. The git history I had from the obsidian-git plugin came along automatically.
>
> Didn't work: One Templater script for "new daily note" — the tool doesn't run JS in templates. Worked around it with a CLI command. Dataview blocks render as raw code blocks (not executed) — fine for me since I barely used it.
>
> Took 30 seconds of `git clone && bunx open-knowledge`. My vault folder is untouched — I can still open Obsidian on the same folder if I want.

**Why it lands.** Migration stories are catnip on r/ObsidianMD. The "your vault folder is untouched" line is the trust killer that converts "this would replace Obsidian" into "this lives next to Obsidian."

---

## Idea 7 — r/selfhosted: "I'm tired of Notion-but-self-hosted promises that turn into Postgres + Docker + Redis + Elasticsearch nightmares. Here's a single binary."

**Subreddit.** r/selfhosted, 3-4 weeks after Idea 2.

**Title.** *"I'm tired of Notion-but-self-hosted promises that turn into Postgres + Docker + Redis + Elasticsearch nightmares. Here's a single binary."*

**Punching at AppFlowy / Outline / Affine architectural complexity** without naming them — every r/selfhosted regular has a story about giving up on one of these because of the dependency stack.

**Screenshot.** A terminal. `ls` of the install directory: one binary, one config file (`config.yml`, 6 lines), one folder of markdown. Total disk footprint at the bottom: `47MB`.

**Thesis.**

> The Notion-alternative subgenre keeps shipping things that need 4 services and 3GB of RAM to host a wiki for one person. I don't want to admin a database for my notes.
>
> This thing is one binary. Storage is markdown files in a folder. The "database" is the filesystem. There's no Postgres because there's nothing to put in Postgres. There's no Redis because there's nothing to cache. There's no Elasticsearch because grep on 5,000 markdown files runs in 30ms.
>
> It does support real-time collaboration (CRDT) and an MCP server for AI agents, but those are libraries inside the same binary, not separate services.

**Seed comment.** "When does this approach break? Around 5K markdown files in a single repo, by my testing — that's a git scaling limit, not anything I added. For larger KBs you'd want to shard into multiple folders."

**Why it lands.** "One binary" is r/selfhosted's love language. The implicit comparison ("not Outline") is a legible critique without being a hit-piece.

---

## Idea 8 — r/LocalLLaMA: "Benchmark: which local model is the best 'wiki gardener'? Llama 3.1 vs Qwen 2.5 vs Mistral, ranked"

**Subreddit.** r/LocalLLaMA, leveraging the **aider benchmark-as-flywheel** pattern.

**Title.** *"Benchmark: which local model is the best 'wiki gardener'? Llama 3.1 vs Qwen 2.5 vs Mistral, ranked"*

**Ship the benchmark, not the product.** The product is implicit (because you need it to run the benchmark), but the post is *about* the benchmark. This is the aider playbook — make the model leaderboard the interesting thing, then the tool that runs the leaderboard becomes the substrate.

**Screenshot.** A clean leaderboard table. Columns: Model, Frontmatter normalize %, Backlink inference accuracy %, Dead-link detection F1, Tokens per action, Time per action. Five rows of local models. Top of table: "Wiki Gardening Benchmark v0.1 — fully reproducible, runs locally."

**Thesis.**

> No one's been benchmarking local models on the boring-but-essential work of "keep a wiki organized." So I built one. 200 wiki articles, 600 ground-truth questions across 4 categories (frontmatter cleanup, backlink inference, dead-link sweep, summary refresh).
>
> Reproducible: clone the repo, point at any local Ollama model, get a score. Total benchmark run is ~30 minutes on a 3090.
>
> Headline finding: Qwen 2.5 7B beats Llama 3.1 8B on backlink inference but loses on frontmatter normalization. Mistral Small surprisingly competitive on dead-link detection.

**Why it lands.** r/LocalLLaMA *lives* for benchmark posts. The post becomes the canonical reference cited every time someone asks "best local model for X" — the same flywheel aider built. Open Knowledge becomes the substrate by accident.

**Why it might flop.** If the benchmark is genuinely useful, r/LocalLLaMA will scrutinize methodology hard. The benchmark needs to be solid before posting.

---

## Idea 9 — r/ClaudeAI: "MCP server that lets Claude write to a knowledge base WITH ATTRIBUTION — every commit is signed by the agent session"

**Subreddit.** r/ClaudeAI (different angle from Idea 4 — focus on attribution).

**Title.** *"MCP server that lets Claude write to a knowledge base WITH ATTRIBUTION — every commit is signed by the agent session"*

**Capital ATTRIBUTION because that's the unique technical claim.** No other MCP write tool does this. Every other "Claude wrote to my notes" demo loses the audit trail at the storage layer.

**Screenshot.** A `git log --oneline --pretty="%h %an %s"` in a terminal showing 30 lines, alternating `nick` (human commits) and `claude-code-session-abc12` / `claude-code-session-abc12` / `claude-code-session-def34` (agent commits, with session IDs visible). A `git show` of one of the agent commits at the bottom showing the actual diff.

**Thesis.**

> The thing that's been bothering me about agents writing to my notes is "if I look back in 6 months, I won't be able to tell which sentences I wrote and which ones the LLM did."
>
> Built an MCP server that solves this at the storage layer — every write is committed to git with the agent identity in the author field, *not* my GitHub identity. `git log --author=claude` and you get the agent's complete history. `git diff` to see what an overnight session changed.
>
> It also means version control for human-vs-agent edits is automatic. If Claude added something I disagree with, `git revert <commit>` and it's gone, but my edits are preserved.

**Why it lands.** Attribution is a sleeper concern for the r/ClaudeAI crowd that becomes painful around month 3 of using Claude Code for real work. Solving it at the storage layer (git!) instead of "an audit log we promise to maintain" is the credible answer.

---

## Idea 10 — r/ObsidianMD (third wave, weeks later): "Side-by-side: Obsidian + this thing on the same vault. AMA about either."

**Subreddit.** r/ObsidianMD, after Ideas 1 and 6 have established a presence.

**Title.** *"Side-by-side: Obsidian + this thing on the same vault. AMA about either."*

**The AMA framing turns the post into a thread the sub will moderate themselves.** r/ObsidianMD loves comparison threads but downvotes "X vs Y" posts that read as biased — making it an AMA where you'll honestly answer "where Obsidian is better" defangs the bias trap.

**Screenshot.** Genuine side-by-side dual-monitor screenshot. Both apps open on the same vault folder. The Obsidian side shows a graph view; the Open Knowledge side shows the same graph rendered slightly differently. Caption: "Same vault. Same files. Both work."

**Thesis.**

> I've been running both for a month on the same vault. Genuinely use both daily. Posting screenshots and answering questions in the comments. Including "where is Obsidian better" — there's a real list.
>
> tl;dr: Obsidian wins on plugin ecosystem, mobile, theme variety, polish in obvious places. The other thing wins when an AI agent is in the loop, when I want git-native attribution, and when I want real-time multiplayer for a future team. Neither replaces the other.

**Why it lands.** Mature comparison posts where the author honestly admits losses on both sides are r/ObsidianMD's gold standard. It positions Open Knowledge as a respectful neighbor, not a competitor. Months from now, when someone asks "I have Obsidian + want to use Claude Code, what should I do?" — this thread will be the canonical answer.

---

## Idea 11 — r/ClaudeAI: "Found a way to give Claude Code a 'memory' that survives across conversations — it writes to a wiki that other Claude instances can read"

**Subreddit.** r/ClaudeAI.

**Title.** *"Found a way to give Claude Code a 'memory' that survives across conversations — it writes to a wiki that other Claude instances can read"*

**'Found a way' is the discovery framing.** r/ClaudeAI rewards discoveries — "I noticed you can do X" is consistently the format that goes viral on the sub. The framing implies "this exists in the wild and I'm just sharing it" rather than "I built and am promoting this."

**Screenshot/GIF.** Two terminal panels. Top: Claude Code session 1, user says "remember that the auth flow uses PKCE, not implicit grant." Claude responds with a tool-use block writing to the wiki. Bottom: Claude Code session 2, started 3 hours later, user says "what auth flow did we decide on?" Claude reads from the wiki, answers correctly. Both screenshots from real Claude Code with the model name visible.

**Thesis.**

> Solved a thing that's been bothering me — Claude Code "forgets" between conversations. Wanted a way for Claude to write down decisions and pick them up next time.
>
> Approach: an MCP server that exposes a small markdown wiki Claude can read and write. When I tell Claude something worth remembering, it writes a wiki entry. Next conversation, Claude can search the wiki and find it.
>
> It's working better than I expected because the wiki is *just markdown files* — I can also read and edit them, and there's a UI for review.

**Cross-post.** r/cursor (with Cursor MCP integration), r/LocalLLaMA (if it works with local models too).

**Why it lands.** "Persistent memory for Claude" is a top-3 ongoing complaint on r/ClaudeAI. Solutions to this thread keep getting upvoted. The wiki framing is a new mental model for them — most attempts at agent memory have been opaque vector stores; "human-readable markdown the agent writes to" is a fresher answer.

---

## Idea 12 — r/selfhosted: "Setup that finally got me to consolidate my notes: this + Caddy + Tailscale, accessible from anywhere, never leaves my house"

**Subreddit.** r/selfhosted.

**Title.** *"Setup that finally got me to consolidate my notes: this + Caddy + Tailscale, accessible from anywhere, never leaves my house"*

**The setup post.** r/selfhosted's beloved subgenre — "here's how I run X with Y and Z." Always upvoted. The format is intrinsically replicable, which the sub values.

**Screenshot.** A diagram: [Phone/Laptop] → [Tailscale] → [Home Server: Caddy → Open Knowledge container] → [/notes folder, backed up nightly to local NAS]. Plus a tiny terminal output of `tailscale status` showing the device is connected.

**Thesis.**

> I have notes scattered across iCloud, Notion, Obsidian, and a `~/notes` folder. Wanted one place where I could write from my phone, where my dev agent could write from my desktop, and where nothing ever touches a third-party cloud.
>
> What worked:
> - Open Knowledge in a docker container on my home NAS
> - Caddy reverse-proxy with auto-HTTPS via my own domain
> - Tailscale for private access (no port-forwarding to the public internet)
> - Restic backups of the notes folder to a Backblaze B2 bucket nightly
>
> Total monthly cost: $0.40 (the B2 bill).

**Why it lands.** The "$0.40/month" hook is irresistible to r/selfhosted. The Tailscale + Caddy stack is the sub's canonical preferred setup. The post's frame is "here's a working setup" not "here's a product" — which is the only frame that passes the sub's grift filter.

---

## Idea 13 — r/ObsidianMD: aesthetic post — "My setup. Markdown, AI co-author, dark theme, monospace. Photo."

**Subreddit.** r/ObsidianMD (or r/unixporn for cross-pollination).

**Title.** *"My setup. Markdown, AI co-author, dark theme, monospace. Photo."*

**The minimal-title image post.** r/ObsidianMD has a strong "show your vault" subculture — screenshots of beautifully themed notes get hundreds of upvotes with almost no body text. Open Knowledge's theme is genuinely good (One Dark, monospace, calm) — let the screenshot do the work.

**Screenshot.** A high-res, professionally cropped shot of an Open Knowledge editor with a dense, well-linked wiki article visible. Two cursors (one human, one Claude) with their colored avatars in the gutter. Custom desktop background visible in the bezel. Aesthetic-first composition.

**Thesis (kept short, in r/unixporn style).**

> Open Knowledge + iTerm2 + JetBrains Mono. Real-time co-editing with my Claude Code session in the background. Theme is the default (One Dark).

**Why it lands.** r/unixporn / r/ObsidianMD share the "ricing" aesthetic. A pure beauty post invites curiosity — people *will* ask "what's that editor?" in the comments and you answer with a link. Marketing-via-aesthetic-envy is the most authentic Reddit promotion vector.

---

## Idea 14 — r/programming: "How we ship a CRDT-backed editor that synchronizes Y.XmlFragment ↔ Y.Text ↔ disk without losing edits"

**Subreddit.** r/programming (cross-post material, ~6M subscribers).

**Title.** *"How we ship a CRDT-backed editor that synchronizes Y.XmlFragment ↔ Y.Text ↔ disk without losing edits"*

**Pure technical write-up post.** r/programming rewards deep technical content with no hint of product placement. Write the engineering blog post Open Knowledge has been quietly assembling in PROJECT.md and the bridge-architecture comments — three propagation paths, two CRDT representations, one disk format.

**Screenshot.** A whiteboard-style diagram of the CRDT bridge architecture (Y.XmlFragment ↔ Y.Text ↔ disk). Plus a tiny callout showing one specific bug that took two weeks to find (e.g., the Y.Item-preservation invariant Path A solves).

**Thesis.**

> [Long-form technical post about the bridge architecture, the three invariants, the lessons from PR #43 multi-client divergence, and the unclaimed CRDT-bridge patterns documented in `reports/crdt-origin-laundering-prior-art/`.]
>
> The product this came from is open-source if anyone wants to see the working implementation. Link in comments.

**Cross-post.** Hacker News (separate post, more careful framing — "Show HN" is fine here because the post is genuinely engineering-substantive).

**Why it lands.** r/programming's most upvoted posts are technical deep-dives where the author shows their work and admits what they don't know. Open Knowledge has a *legitimately interesting* CRDT bridge story that would do well as long-form. The product mention is a footnote at the end, not the lede.

---

## Idea 15 — r/LocalLLaMA: "I gave Llama 3.1 8B write access to my notes and it spent the night reorganizing them. Here's what changed (with diffs)"

**Subreddit.** r/LocalLLaMA.

**Title.** *"I gave Llama 3.1 8B write access to my notes and it spent the night reorganizing them. Here's what changed (with diffs)"*

**Diary-format post.** r/LocalLLaMA loves "I left my model running overnight and here's what happened" stories. The diff-rendering format is native to the sub — they want to see the actual outputs, not a summary.

**Screenshot.** A `git log` showing 142 commits over 6 hours. Below it, three example commits opened with `git show` showing the actual changes — a frontmatter normalization, a backlink insertion, a dead-link removal.

**Thesis.**

> Pointed Llama 3.1 8B at my 800-article wiki via MCP. Set it to "maintenance mode" with one instruction: keep things tidy. Let it run for 6 hours overnight on a 3090.
>
> Woke up to 142 commits. Spot-checked 30:
> - 24 were genuinely good (frontmatter normalization, broken `[[link]]` corrections, missing tag inference)
> - 4 were neutral (rewording I had no opinion on)
> - 2 were wrong and I `git revert`'d them
>
> The pattern that worked: small, conservative model + rigid tool surface (only let it touch frontmatter and links, not body text) + git-as-undo. The model isn't smart enough to be trusted with editorial decisions, but it's *plenty* smart to be trusted with bookkeeping.

**Why it lands.** The "diary post" format + concrete numbers + honest reporting (including the 2 wrong commits) hit r/LocalLLaMA's sweet spot. The implicit lesson — small model + tight tool surface = useful — is a thesis the sub agrees with.

---

## Idea 16 — r/ChatGPTCoding: "MCP server I built — Cursor, Claude Code, and my own Codex setup all share a wiki now"

**Subreddit.** r/ChatGPTCoding.

**Title.** *"MCP server I built — Cursor, Claude Code, and my own Codex setup all share a wiki now"*

**Multi-tool framing.** r/ChatGPTCoding is more agnostic than r/ClaudeAI — they want tools that work across the agent ecosystem. The "all three of my tools share state" framing is exactly what they want.

**Screenshot.** Three terminal panels open simultaneously: Cursor on the left, Claude Code in the middle, Codex CLI on the right. All three are reading from / writing to the same wiki. Each shows a different action — Cursor reading a doc, Claude Code writing a new section, Codex updating frontmatter. A central terminal tail showing all three sessions writing to the same git history.

**Thesis.**

> I bounce between Cursor (for code), Claude Code (for terminal stuff), and Codex CLI (for some research workflows). The annoying part has been that none of them share context — each one starts cold every conversation.
>
> Built an MCP server backed by a markdown wiki. Configured all three tools to use it. Now whatever Claude figures out in one conversation is available to Cursor's chat in the next. Wiki entries are just `.md` files in a folder; nothing tool-specific.

**Why it lands.** r/ChatGPTCoding skews "I use multiple AI tools and want them to interop." The cross-tool MCP angle is the post they're waiting for.

---

## Idea 17 — r/selfhosted (third wave, weeks later): "Replaced Bookstack + Joplin Server with a single binary. Markdown, no DB, MCP for AI agents."

**Subreddit.** r/selfhosted.

**Title.** *"Replaced Bookstack + Joplin Server with a single binary. Markdown, no DB, MCP for AI agents."*

**Naming the incumbents you replaced.** r/selfhosted's "I replaced X with Y" post format is reliable. Bookstack and Joplin Server are the canonical "self-hosted wiki/notes" stack — naming both signals you've actually been around the ecosystem.

**Screenshot.** Three docker-compose.yml files side-by-side. Bookstack: 24 lines, 3 services, MySQL setup. Joplin Server: 18 lines, Postgres + setup. Open Knowledge: 8 lines, no external services. Total line count visualized as a bar chart.

**Thesis.**

> Ran Bookstack for 2 years. Joplin Server for 18 months. Both are great; both have ops overhead I stopped wanting (database backups, version compat, restore procedures).
>
> Switched to this thing 3 weeks ago. Imported all my Bookstack pages via export → markdown → drop in folder. Joplin notes via the markdown export. Now my wiki is a folder; my "database" is the filesystem; my backup is restic + the folder.
>
> Bonus I didn't expect: MCP server means Claude Code can read and write to it directly. Started using that for daily work-log automation.

**Why it lands.** "I replaced two pieces of software with one" is r/selfhosted catnip. The migration story (Bookstack export → markdown → drop in folder) is reproducible, which the sub values.

---

## Idea 18 — r/ObsidianMD: "Frontmatter for Claude — what fields are you using to teach AI agents about your notes?"

**Subreddit.** r/ObsidianMD.

**Title.** *"Frontmatter for Claude — what fields are you using to teach AI agents about your notes?"*

**Discussion-bait, not promo.** Open the conversation about *frontmatter conventions* for AI agents — a topic where there's no canonical answer yet. By starting the discussion you become the de facto convener; Open Knowledge's frontmatter conventions then become "the obvious thing to use."

**Screenshot.** A markdown file's frontmatter block with fields specifically meant for AI consumption — `agent_summary`, `agent_status: draft|reviewed|locked`, `agent_can_edit: [body, links, frontmatter]`. Caption: "what I've been experimenting with."

**Thesis.**

> Curious what frontmatter conventions people are evolving for "agent-readable" notes. I've been experimenting with a few:
>
> - `agent_summary`: 1-2 sentence summary the agent maintains
> - `agent_status: draft | reviewed | locked` — locked notes the agent won't touch
> - `last_reviewed_by_human: 2026-04-14`
>
> What are you using? Should there be a community convention here?

**Why it lands.** Discussion posts that *don't sell anything* perform best on r/ObsidianMD. By convening the conversation about agent-aware frontmatter, you build authority without product placement. The product is mentioned only when someone asks "what tool are you using?"

---

## WILD CARD 1 — r/ClaudeAI: "Got Claude to maintain a Wikipedia-style article about itself, with citations to every Anthropic blog post and every line of its system card. Here it is."

**Subreddit.** r/ClaudeAI.

**Title.** *"Got Claude to maintain a Wikipedia-style article about itself, with citations to every Anthropic blog post and every line of its system card. Here it is."*

**Meta-hook: Claude writing about Claude.** Spend a week pre-loading Open Knowledge with every Anthropic blog post, every system card, every public release note. Then have Claude maintain a long, deeply-linked, Wikipedia-style article about itself in the wiki. **Then post the article as the artifact.**

**Screenshot/asset.** A screen recording of the article: scroll through it, every paragraph footnoted, every footnote linked to a source, the wiki's backlink panel showing the article connects to 200+ other articles (about Anthropic models, RLHF, constitutional AI, etc.).

**Thesis.**

> I wondered what would happen if I asked Claude to maintain a wiki article about itself, where every claim had to be cited to public Anthropic material. The article ended up at 4,200 words across 18 sections with 137 citations.
>
> The wiki is open if anyone wants to fork it and have their model maintain its own article. It's running on a real-time co-editing markdown wiki I built (link in comments).

**Why it lands.** Meta-content about the model that the sub uses is irresistible. This is "the LLM looking in the mirror" content, which routinely tops r/ClaudeAI. The wiki/product reveal is in the second comment, not the post body.

**Cross-post.** r/MachineLearning (with academic-flavored framing), r/singularity (with phenomenology framing).

**Wild-card risk.** Anthropic's brand team might dislike "Claude writing about itself" posts. Run by them first if there's a relationship.

---

## WILD CARD 2 — r/Permaculture (yes, really): "Wiki about my homestead that my AI agent maintains. It now knows my soil, my crops, my pests, and writes the weekly garden plan."

**Subreddit.** r/Permaculture / r/homestead / r/gardening (totally outside the dev sphere).

**Title.** *"Wiki about my homestead that my AI agent maintains. It now knows my soil, my crops, my pests, and writes the weekly garden plan."*

**Counter-positioning by going OUTSIDE the dev tribe.** Every other launch post is for devs. This one is for hobbyists. Why does this work? Because (a) it shows the product isn't only for engineers, (b) it's *unexpected* content for a permaculture sub, which makes it stand out, (c) the homestead/garden communities on Reddit are large and have a strong organize-our-knowledge use case, and (d) when someone screenshots the post and reposts to /r/InternetIsBeautiful or /r/coolguides, the cross-tribe spread begins.

**Screenshot.** A wiki page about a single garden bed, with a hand-drawn map (image embed), historical plant rotations (a table), companion-planting links to other beds (`[[Bed 3 — Tomatoes 2026]]`), and at the bottom, an "Updated by claude-code-session — 2 days ago" stamp. Looks like a garden-nerd's dream wiki.

**Thesis.**

> I've kept terrible homestead notes for 6 years. Started using an AI agent to maintain a wiki about the garden — soil tests, plant rotations, pest sightings, weekly plans. Now it's the most useful resource on my farm.
>
> Sharing in case anyone else maintains a homestead wiki. The tool is open source; runs on my home computer. I don't need to think about it; I just type observations and the agent connects them.

**Wild-card risk.** Off-tribe posts can get downvoted as "not relevant to the sub." But a sincere garden-nerd post has good odds of slipping past — and if it lands, the visibility is enormous because no other dev tool is fishing in those waters.

---

## WILD CARD 3 — r/ObsidianMD or r/DataHoarder: A literal Reddit reply bot ("u/wiki-companion-bot") that, when summoned, takes a whole thread and writes it as a wiki article in real time, then posts the wiki link

**Subreddit.** r/ObsidianMD, r/DataHoarder, r/AskHistorians (especially the latter — they ALREADY value summarization and have community traditions around it).

**Mechanism.** Build a small Reddit reply bot. When summoned with `/u/wiki-companion-bot summarize` in any thread, it:
1. Reads the entire thread
2. Spins up a temporary Open Knowledge instance with a public-read wiki
3. Has Claude write the thread as a Wikipedia-style article with backlinks
4. Posts the article URL as a reply
5. The article is editable for 7 days by anyone who clicks

**Why it lands.** The bot becomes the share artifact — every thread it gets summoned in is a viral seed. People start summoning it in popular threads. The wiki link is the share-ready URL (Bolt.new pattern: every action produces a tweetable URL). And it makes the product *visible* to people who'd never read a launch post — they discover it as "that summary bot's tool."

**Wild-card risk.** Reddit bot policy is strict; the bot needs to be opt-in (only triggers on summon, never auto-replies) and rate-limited. Multiple subs ban bots regardless. But if 3-5 subs accept it, the embedded marketing is enormous and feels organic because the bot does *actual work*.

**Bonus.** The output wikis (one per thread) are themselves shareable artifacts. Some of them will end up cited externally — at which point Open Knowledge becomes part of Reddit's accidental archival infrastructure. **This is the "Bolt.new shareable URL" pattern translated to Reddit's social fabric.**

---

## Cross-post graph (master view)

A condensed map of who-feeds-whom across the launches. **Stagger by 3-7 days minimum.**

```
                        WEEK 1                    WEEK 2                   WEEK 3+
                        ─────────                 ─────────                ─────────
r/ObsidianMD       →   Idea 1 (companion)       Idea 6 (migration)       Idea 10 (AMA)
                                                                          Idea 13 (aesthetic)
                                                                          Idea 18 (frontmatter discussion)

r/selfhosted       →   Idea 2 (no-cloud)        Idea 7 (single binary)   Idea 12 (homelab setup)
                                                                          Idea 17 (replaced X+Y)

r/LocalLLaMA       →   Idea 3 (Llama gardener)  Idea 8 (benchmark)       Idea 15 (overnight diary)

r/ClaudeAI         →                            Idea 4 (read+write MCP)  Idea 9 (attribution)
                                                                          Idea 11 (memory)

r/artificial       →                                                     Idea 5 (phenomenology)

r/programming      →                                                     Idea 14 (CRDT engineering)

Cross-tribe        →                                                     WC2 (permaculture)
                                                                          WC3 (Reddit bot)

Meta               →                                                     WC1 (Claude on Claude)

Pickup chains:
  r/ObsidianMD Idea 1 → likely picked up by r/DataHoarder, r/PKMS
  r/selfhosted Idea 2 → likely picked up by r/homelab, r/raspberry_pi
  r/LocalLLaMA Idea 3 → likely picked up by r/Ollama, r/MachineLearning (skip)
  r/ClaudeAI Idea 4 → likely picked up by r/cursor, r/ChatGPTCoding (Idea 16 explicit)
  r/programming Idea 14 → bridges to HN naturally
```

---

## Tonal notes: what each sub punishes

A reference card. Every idea above respects these but they're easy to forget.

- **r/ObsidianMD punishes:** the word "alternative", any whiff of "Notion" comparison, AI-pluginitis fatigue, anything that implies their vault is bad
- **r/selfhosted punishes:** mandatory signups, telemetry-by-default, Postgres dependencies, missing ARM builds, "free tier with paid tier" model
- **r/LocalLLaMA punishes:** "AI" without naming a specific model, anything cloud-dependent, posts that don't include a quantization, vague benchmarks
- **r/ClaudeAI punishes:** Anthropic-bashing, OpenAI-bashing, posts that don't show real Claude Code output, generic "AI productivity" framing
- **r/artificial punishes:** corporate "we" voice, anything that smells like a launch post, "we're excited to announce" energy
- **r/programming punishes:** marketing in the lede, lack of technical depth, "Show HN: I built X with Y stack" framing without engineering meat
- **All of them punish:** alt accounts (account age <30 days), no-prior-comments-in-sub, link-in-post-body, "would love your feedback" closer

---

## Final framing principles

1. **Be a member of the tribe before you launch in the tribe.** Spend 30 days commenting in each sub before you post. Reddit smells transients.
2. **One artifact per post.** Either a screenshot OR a GIF OR a code block OR a diagram — not all four. The post that does one thing well outperforms the post that does four things adequately.
3. **First-person, past tense, frustrated-tinkerer voice.** "I was annoyed that..." is the only opener that consistently works on Reddit.
4. **Bury the link.** The GitHub link goes in the *first comment*, not the post body. This single move is the difference between "useful share" and "marketing post" in Reddit's collective unconscious.
5. **Stagger across subs.** Same content to two subs in 24 hours = mod removal. Rewrite the title, change the screenshot framing, post 3-7 days apart.
6. **Don't gate.** No "join our Discord", no "sign up for early access", no waitlist. The ask is "git clone." Every gate is a downvote.
7. **Reply for 90 minutes.** Reddit's algorithm weights early engagement. Whoever posts has to be at the keyboard to reply to every comment in the first 90 minutes.
8. **Pre-recruit one or two real users from each sub** (people who've been in the beta) to make the first comments. Not as shills — as actual users describing actual experience. The first three comments set the tone of the whole thread.
9. **The CEO-in-the-comments gambit.** When relevant, drop in as Nick (CTO/CPO) under the post — answer one technical question with depth. Don't pitch. Just prove there's a thoughtful human on the other end. (This is the kepano pattern adapted.)
10. **Lose graciously.** When someone says "this is just X with Y added," reply "yeah honestly that's not wrong — what we tried to do differently is Z." Reddit rewards the humility immediately.

---

## Meta-observation

The best Reddit launch isn't 18 posts. It's **3-4 carefully placed posts** that establish the product as a member of the relevant tribes, plus a Wild Card to spread cross-tribe. The list above is divergent inventory; the convergent move is choosing the 3-4 that match Open Knowledge's actual voice and the 1-2 wild cards that match the team's appetite for risk.

If forced to pick the highest-EV four from this file: **Idea 1** (r/ObsidianMD companion-positioning), **Idea 2** (r/selfhosted single-binary), **Idea 4** (r/ClaudeAI MCP write+attribution), **Idea 14** (r/programming CRDT engineering deep-dive). Plus Wild Card 3 (Reddit summary bot) if the team has the appetite.

But this file is divergent. The point is the *spread*, not the pick.
