# D1c — Divergent Ideation: MCP write tools with permission-based routing

> **Lens.** Agents drafted; you reviewed; you merged. S4 + PQ9 routing — unique to Open Knowledge. Today it's a spec, not a designed moment. Make the loop feel like a *first-class product ritual* on day 0.
>
> **Stance.** Unbounded. Raw. Generative. Filtering and ranking happens upstream, not here.

---

## The emotional target space

Before the ideas, the feelings we're aiming at. Every idea below slots into one or more:

- **Custody** — "I am the editor-in-chief. The agent is my staff writer."
- **Ceremony** — the merge itself should feel like a small, satisfying ritual (like tapping Shazam, like sealing an envelope).
- **Trust-through-transparency** — I can see exactly what changed, who changed it, and what happens if I say no.
- **Morning-coffee review** — the overnight-batch rhythm: the agent worked while I slept, I read over coffee, I merge five of twelve.
- **Proprietorial pride** — "I command the agents; they propose, I dispose."
- **Kindness** — GitHub's merge but softer; git's attribution but humane; no-punishment (Finch-style) if I reject everything.
- **Visibility of the invisible** — making permissions visually real, not config-YAML real.
- **Counter to Clippy** — the agent **waits**, never interrupts. Restraint is the personality.

---

## The 18 ideas

### 1. The Inbox, capital I
**Pitch.** A dedicated left-rail tab called `◉ Inbox` showing stacked agent proposal cards — one per branch — like a Gmail triage surface for prose, with swipe-left / swipe-right keyboard shortcuts (`j`/`k` to move, `a` to approve, `r` to reject, `c` to comment).
**Emotional target.** Morning-coffee review. Custody.
**Reference inspiration.** Superhuman inbox triage + GitHub Files Changed tab + Tweetdeck column.
**Demo sentence.** "Claude worked overnight; I opened OK, hit `j j j a`, and four pages shipped before my coffee cooled."

### 2. "Waiting on you, human" — live presence of a waiting agent
**Pitch.** When an agent submits a proposal and stays connected via MCP, show its avatar in a *waiting* state on the proposal card — a gentle dim pulse, a little tooltip "claude-code-abc123 has been waiting 14m for your review" — making the async loop feel synchronous.
**Emotional target.** Proprietorial pride + the quiet power of making the agent wait.
**Reference inspiration.** Uber's driver-waiting screen, Apple Handoff pulse, Linear's "blocked by" indicator.
**Demo sentence.** "The agent sits in the gutter, politely waiting. You click approve and its avatar relaxes into green."

### 3. Paragraph-level approve/reject (no red-green prose)
**Pitch.** Per-paragraph pill buttons floating in the gutter of the review view — green ✓ / red ✗ / yellow comment bubble — so you triage section-by-section without ever reading a character-diff. PQ11 compliance by construction.
**Emotional target.** Trust-through-transparency; kindness (no noise).
**Reference inspiration.** Medium's inline highlight bar, Google Docs "Suggesting" per-change accept, Figma comment pins.
**Demo sentence.** "Three paragraphs in, you click the ✓ three times; the gutter turns sage-green; the merge button unlocks."

### 4. The Gavel — one-click "approve all, merge, close PR"
**Pitch.** A single animated gavel button on the proposal header. Clicking it approves every paragraph, merges the branch, attributes the commit, closes the review, and triggers a satisfying *tap-tap* sound (optional). Keyboard: Cmd+Return.
**Emotional target.** Ceremony. Morning-coffee review.
**Reference inspiration.** Gmail "Send+Archive", macOS trash sound, Linear's `Cmd+Enter` submit.
**Demo sentence.** "Twelve proposals. One gavel. The branch graph collapses into `main` in a ripple."

### 5. Git log with deterministic agent badges
**Pitch.** Every agent commit in the sidebar timeline shows a stable, deterministic little glyph + color per agent identity (FNV-1a hash → 18-species-style variant). `claude-code-abc123` is always a violet fox. `cursor-def456` is always a teal axolotl. Re-usable across the product.
**Emotional target.** Custody + collection-loop (Clawd-style).
**Reference inspiration.** Clawd `/buddy` deterministic rarity system, Slack member color bars, Reddit Snoo-per-subreddit.
**Demo sentence.** "Your history tab looks like a tiny zoo — each agent a stable mascot — and you learn to love your violet fox."

### 6. The Diff-as-Story view (semantic, not line-diff)
**Pitch.** Instead of red-green line diff, render the review as a *two-column prose story*: the current doc on the left, the proposal on the right, with a subtle background wash per changed section and a little "what the agent intends" one-line sentence at the top of each block ("Tightened the OAuth callback explanation; added a link to [[Auth Tokens]]").
**Emotional target.** Kindness; trust-through-transparency.
**Reference inspiration.** Quarto preview, Medium's "diff story" concept, Scribus merge panel.
**Demo sentence.** "Your eye reads prose, not patches."

### 7. "Tighten this sentence" — inline comment to the agent
**Pitch.** Hover any sentence in the proposal, hit `Cmd+'`, type a nudge ("tighter" / "more neutral tone" / "cite the RFC"), press Enter. The agent receives a threaded MCP notification, re-drafts that sentence only, and the proposal updates in place with a tiny revision marker `(v2)` in the gutter.
**Emotional target.** Editor-in-chief custody. Proper creative collaboration.
**Reference inspiration.** Google Docs inline suggestion reply, GitHub review-comment thread, Lex.page AI rewrite.
**Demo sentence.** "You type 'tighter.' Five seconds later the sentence is tighter. You type 'tighter still.' It apologizes."

### 8. Permission Passport — the "what can this agent do?" card
**Pitch.** Click any agent's avatar anywhere in the product and a card slides in showing its permission passport: a travel-document-style spread listing its docName scopes, its route (propose-only / auto-merge / overwrite), a visible "signed by" line (the human who granted it), and a revoke button. Not a settings pane — an object.
**Emotional target.** Custody + visibility of the invisible.
**Reference inspiration.** 1Password "item sheet," ProtonPass, an actual passport booklet.
**Demo sentence.** "I opened claude-code-abc123's passport: stamped for `docs/*.md`, route `propose → review`, revocable in one click."

### 9. The Batch Digest email (and docs page)
**Pitch.** Once a day, Open Knowledge generates a shareable static HTML digest summarizing every agent proposal merged / pending / rejected that day — the kind of artifact you screenshot and tweet. Includes a copy button, a permalink to the checkpoint, and an OG-image-ready hero ("12 merges, 3 pending, 1 rejected by Nick").
**Emotional target.** Shareability. Morning-coffee review as identity.
**Reference inspiration.** Substack's daily digest, GitHub's weekly activity email, Vercel preview-URL embed.
**Demo sentence.** "A daily digest arrives; one screenshot tells your timeline 'I command four agents.'"

### 10. Merge-graph as live art
**Pitch.** A real-time canvas-rendered git-graph panel in the sidebar showing branches growing and merging as agents propose and humans accept. Purely decorative and deeply satisfying — tiny avatars walk along branches, the main line thickens as merges land, color-coded per agent.
**Emotional target.** Ceremony. The pleasure of systems visibly working.
**Reference inspiration.** GitGraph.js demos, Arc's sidebar animation, Observable notebooks.
**Demo sentence.** "Watch your repo's DNA replicate in real time on the right edge of the screen."

### 11. "Claude proposed, you merged" — the reversible commit
**Pitch.** Every merged-from-proposal commit in the version-history timeline has a one-click "undo merge, restore branch, re-open review" button — the *kind* merge. No `git revert` ceremony, no lost attribution; just back to the reviewable state.
**Emotional target.** Kindness; GitHub-but-kinder.
**Reference inspiration.** Gmail "Undo send," iMessage edit/unsend, Linear's undo toast.
**Demo sentence.** "Click the tiny circular-arrow. Thirty minutes ago's agent merge is back in review, with all paragraph approvals intact."

### 12. The PR Title — agents *must* propose a one-line review title
**Pitch.** Every agent write via MCP is required to include a `title` and `why` field (contract-first; not optional-with-fallback, per architectural precedent #5). The title becomes the review card's header. The `why` becomes the card's subtitle. Human reads two sentences and decides.
**Emotional target.** Editor-in-chief custody + the agent's voice surfacing with restraint.
**Reference inspiration.** GitHub PR titles, Conventional Commits, Linear issue titles.
**Demo sentence.** "Claude proposed: 'Clarify OAuth token lifecycle — users confused RS256 vs HS256 in issue #42.' You read, you merge."

### 13. The paragraph-level Cmd+Z
**Pitch.** Cmd+Z, by default, undoes *the last thing the agent did* to your current paragraph — per-origin, per-location. Cmd+Shift+Z undoes *your own* last edit. The keyboard shortcut is literal humans-vs-agents routing. (Builds directly on S5 + existing per-origin UndoManager.)
**Emotional target.** Custody; the most satisfying single keystroke in the product.
**Reference inspiration.** S5 per-origin undo spec; Figma's multi-user undo; Apple Notes collaborator undo.
**Demo sentence.** "You press Cmd+Z. The agent's paragraph vanishes. Your sentence remains. You press it again. The agent's paragraph comes back."

### 14. WILD CARD — **The Veto Stamp** (physical ASMR merge ritual)
**Pitch.** Add a toggleable "stamp mode" to the review view. Approving a proposal triggers a slow-motion rubber-stamp animation with a thunk sound — a literal APPROVED in green ink or REJECTED in red rolls down. Reviewing ten proposals becomes a satisfying ASMR-y gallery of stamped parchment. Branded. Shareable. Screen-record-bait.
**Emotional target.** Ceremony; TikTok-able; custody-as-craft.
**Reference inspiration.** Papers, Please; Linear's shipped-emoji rain; Arc's "membership card"; Framer's emoji-forward brand policy.
**Demo sentence.** "Five agents proposed; you stamp APPROVED five times in satisfying succession. The feed is 30 seconds of pure ASMR."

### 15. WILD CARD — **Delegation Contracts** (multi-agent review chain)
**Pitch.** I can grant `claude-code-abc123` propose-only permission, but delegate *first-pass review* to a second agent (`reviewer-agent-xyz`) who either approves or rejects every proposal before it reaches me — so by morning coffee I only see the ones the reviewer thinks I need to decide. Agents review agents; I'm the final editor. **No competitor has this.**
**Emotional target.** Proprietorial pride taken to its logical extreme.
**Reference inspiration.** GitHub CODEOWNERS, Judicial chambers ("clerks review cert petitions, the judge signs"), editorial mastheads (sub-editor → editor → editor-in-chief).
**Demo sentence.** "Agent A proposes. Agent B rejects 7 of 12 for tone. You merge the remaining 5 in thirty seconds. Mastheads made flesh."

### 16. WILD CARD — **The Obituary / Honor Roll of Rejected Drafts**
**Pitch.** Rejected proposals don't just disappear — they land in a read-only "rejected drafts" page, with a tiny epitaph the human typed ("too cute", "wrong citation", "we already have this in [[Auth Tokens]]"). The agent sees it. The next proposal is measurably better. **Rejection becomes teaching.** A named-and-dated gallery of dead ideas, tweetable and funny.
**Emotional target.** Kindness + identity + "the reward is a story, not points" (Finch philosophy).
**Reference inspiration.** Ship of Theseus, Pixar's "culled frames" screenings, dead-draft Twitter threads, tombstone markers.
**Demo sentence.** "`docs/_rejected/2026-04-15-too-cheerful.md` — 'Claude suggested "Cheers!" as a signoff. We're not 14.' Claude reads it. Claude adjusts."

### 17. Live "presence gutter" during review
**Pitch.** While you're reviewing a proposal, the agent's avatar stays docked at the bottom-left of the review pane, small and quiet. When you start typing an inline comment, it leans slightly toward the comment. When you approve, it nods (a tiny head-bob animation). When you reject, it fades. Never speaks. *Octocat rule.*
**Emotional target.** Companion warmth without Clippy-ness.
**Reference inspiration.** Octocat's "never speak, only pantomime"; Finch's reactive bird; Slack's typing indicator.
**Demo sentence.** "The tiny violet fox nods when you click approve. You smile involuntarily."

### 18. The Merge Commit Authored By Line — named agents in git log
**Pitch.** Every merged-from-proposal commit lands in git with authorship attributed as `agent-claude-code-abc123 <agent+abc123@open-knowledge.local>` and `Co-Authored-By: Nick <nick@...>`. The `git log --oneline` literally shows `merged by Nick; authored by agent-claude-code-abc123 (violet fox)`. Runs on every `git log`. Zero config.
**Emotional target.** Visibility of the invisible; shareability; git-native integrity.
**Reference inspiration.** GitHub's `Co-Authored-By` on squash merges, Linux kernel's `Signed-off-by:`, academic acknowledgments.
**Demo sentence.** "Six months later, `git blame` tells you which paragraphs Claude wrote and which you did. The record is permanent and human-readable."

### 19. Keyboard-first Review Mode (`Cmd+Shift+R`)
**Pitch.** A distinct fullscreen mode with its own minimal chrome: one proposal at a time, keyboard-only navigation (`j/k` between paragraphs, `a/r/c` to act, `n/p` between proposals, `Esc` to exit, `?` for help). The entire review loop happens without the mouse. Feels like vim for prose review.
**Emotional target.** Editor-in-chief custody at velocity; tribal-password aesthetic for devs.
**Reference inspiration.** Superhuman; Linear's `Cmd+K`; Gmail's Ctrl-shortcut mode; less(1)/more(1) pagers.
**Demo sentence.** "Cmd+Shift+R. j j j a n j j a n r. Six proposals decided in fifteen seconds. Never touched the mouse."

### 20. The "Nightly Report" proposal from the agent itself
**Pitch.** Agents can propose a special meta-document — a daily `_activity/2026-04-14.md` — summarizing *what they did today across all pages*, as its own proposal for human review. It's the agent's self-reported standup. Human reviews the summary, not the diffs. "I touched 12 pages, reorganized [[Auth Tokens]], and flagged a stale link in [[Deploy Guide]]."
**Emotional target.** Agent as conscientious staff member; delegation that scales.
**Reference inspiration.** GitHub's weekly activity digest; Slack standup bots; Karpathy's "LLMs don't get bored — they'll do the bookkeeping."
**Demo sentence.** "At 6am, the agent proposes its own daily report. You skim, you merge, you're caught up on twelve pages' worth of work in forty seconds."

---

## Cross-cutting motifs for the convergent synthesizer

- **Gutter-first UI.** The right-margin and left-gutter are where permission/review/agent-identity live. Center stays for prose. Don't pollute the canvas with admin chrome.
- **Deterministic-mascot-per-agent.** Reuse the Clawd `/buddy` trick: stable hashed identity → visual glyph → reusable everywhere (timeline, presence, git log, passport, review cards). One primitive, eight surfaces.
- **Two-stroke rituals.** Every key action should be one keystroke (or one click) *plus* a satisfying micro-animation — gavel tap, stamp thunk, fox nod, branch ripple. Ceremony without ceremony-fatigue.
- **Inversion of "Accept All."** Cursor's virality came from keyboardless "Accept All." Ours comes from the *opposite*: every merge is chosen, but the choosing itself is delightful.
- **Contract-first MCP required fields.** `title` + `why` are mandatory on every MCP write. No optional-with-fallback per precedent #5. The agent must *pitch* — not just mutate — and that pitch becomes the review card header.
- **No agent speaks without being asked.** Octocat rule. Waiting pulses, subtle pantomime, stamps, nods — yes. Chat bubbles, popups, toasts from the agent — never.
- **Shareable artifacts fall out naturally.** Daily digest, stamped-proposal GIF, rejected-draft epitaphs, git-log honor roll, merge-graph screenshots — every review session produces at least one tweet-ready image without the user trying.
- **Rejection is a feature, not a failure.** The "Honor Roll of Rejected Drafts" flips the shame of "agent proposed a bad thing" into "look how the agent learned."

---

## The one-frame demo candidates

If D1c has to pick a single 15-second clip for the launch tweet, candidates are:

1. **Gavel ASMR.** Twelve proposal cards → Cmd+Return on each → gavel animation → branches ripple into main → Git log fills with deterministic-fox commits.
2. **Paragraph-level Cmd+Z.** Human types a sentence. Agent writes a paragraph. Human presses Cmd+Z once. Agent's paragraph vanishes, human's sentence stays. Human presses Cmd+Z again. Agent's paragraph is back.
3. **Permission Passport.** Click avatar. Passport slides open. Stamps visible. Revoke button. Close. Agent's avatar pulses dim-gray (revoked).
4. **The Nightly Report.** 6am notification. Agent-authored daily summary proposal. Skim, gavel, done. "You caught up on twelve pages in forty seconds."

---

## What this unlocks for positioning

- "The first knowledge tool where **agents propose and humans decide.**"
- "Git for prose — but the merge button is kind."
- "Your agent's boss dashboard."
- "A staff of tireless staff writers; you are the editor-in-chief."
- "We invented the wait state for AI."
- "The agent works while you sleep. You review with your coffee. Twelve merges before 8am."

---

*End D1c. Raw. Ranked nothing. Filtered nothing.*
