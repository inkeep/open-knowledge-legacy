# Evidence: Community Overnight Workflow Patterns

**Dimension:** Concrete patterns that other Karpathy-style implementations and broader Claude-Code-Obsidian ecosystems use for nightly / scheduled / background work
**Date:** 2026-04-27
**Sources:** Web searches; GitHub repos; Anthropic Claude Code Routines docs

---

## Findings

### Finding: The eugeniughelbur/obsidian-second-brain "5-phase nightly" is the cleanest reference pattern
**Confidence:** CONFIRMED
**Evidence:** [eugeniughelbur/obsidian-second-brain README](https://github.com/eugeniughelbur/obsidian-second-brain) (web fetch summary):

> "The nightly agent runs at 10 PM and executes these phases:
> 1. **Closes the day** — Finalizes daily note with session summaries
> 2. **Reconciles contradictions** — Uses `/obsidian-reconcile` to identify and resolve conflicting claims
> 3. **Synthesizes cross-source patterns** — Applies `/obsidian-synthesize` to find connections across ingested sources
> 4. **Heals orphan notes** — Identifies unlinked notes and creates connections to existing pages
> 5. **Rebuilds the index** — Updates `index.md` with current vault structure"

Plus weekly: *"A scheduled agent runs Sundays 9 PM for health audits."*

Plus event-triggered: *"Background: fires after every context compaction. You keep working. The vault updates itself."*

**Implications:**
- The cadence is **layered** — daily, weekly, event-triggered (compaction). Different operations at different cadences match the prior research's 4 trigger classes (activity / time / use / continuous decay) plus Sleep Consolidation.
- **None of the 5 phases promote to canonical state.** Each either describes state ("close the day," "rebuild index"), surfaces issues ("reconcile contradictions" — note: surfaces, doesn't auto-resolve), or makes provisional suggestions ("heal orphans" via link suggestions, "synthesize patterns" as new pages).
- **Reconciliation surfaces, doesn't decide.** The `/obsidian-reconcile` command "identifies and resolves" — but in practice (per the prior `compiled-truth-timeline` research's failure-mode #4: "conflicting rewrites — last-writer-wins"), automated resolution of contradictions is unsolved. The pattern probably surfaces conflicts and queues them, not resolves them.

### Finding: The Pratiyush/llm-wiki uses native OS schedulers as the canonical pattern
**Confidence:** CONFIRMED
**Evidence:** [Pratiyush/llm-wiki README](https://github.com/Pratiyush/llm-wiki) (web fetch):

> "For a daily / weekly cron-style sync, schedule `llmwiki sync` directly via your OS's native job runner (`launchd` on macOS, `systemd` on Linux, Task Scheduler on Windows)."

Three scheduled commands:
- `llmwiki sync` — pulls sessions, converts `.jsonl` → markdown, runs build + lint by default. Idempotent. (~1 sec / 100 sessions.)
- `llmwiki all` — `build → graph → export → lint` consolidated pipeline.
- `llmwiki lint` — 16-rule check.

> "Periodic lint, consolidation, and retention decay are scheduled operations, with the human remaining in the loop for curation and direction, while bookkeeping should be fully automated."

Crash-resilience strategy: *"re-running any command is safe and cheap"* — idempotency over recovery.

**Implications:**
- The "delegate scheduling to the OS" pattern is the lowest-overhead approach — no daemon, no cloud dependency. Each command is a one-shot invocation.
- **The principle "consolidation is human-in-loop, bookkeeping is automated"** is exactly what OK's `consolidate.ts` STOP gate enforces. This is an industry-convergent stance, not a unique OK design choice.
- Idempotency is the resilience strategy of choice — "re-running is safe" beats "complex recovery logic."

### Finding: Anthropic shipped Claude Code Routines (Q1 2026) as cloud-native scheduling
**Confidence:** CONFIRMED
**Evidence:** Web search results:

> "Anthropic's Q1 2026 release introduced Scheduled Tasks — Claude Code can now run on managed cloud infrastructure on a cron schedule. This is headless mode's cloud-native sibling."
>
> "Claude Code Routines let you schedule AI agents to run in Anthropic's cloud on a fixed cadence — no server required. Routines require the Max plan ($20/month) and run Claude in headless mode with access to your repo, shell commands, and stored credentials."

Tracking issue [anthropics/claude-code#30649](https://github.com/anthropics/claude-code/issues/30649) ("Scheduled / cron task support for automated skill execution") shows community demand history.

**Implications:**
- **Anthropic-managed cloud cron is now a first-class feature** for users on the Max plan. This is the highest-quality auto-research substrate for Claude Code users specifically.
- Other hosts have analogous cloud-agent surfaces (per prior `agent-host-hooks-cross-host` report): Cursor background agents, Codex Cloud, GitHub Copilot cloud agent, Continue CLI in CI, Cowork, Windsurf parallel agents.
- **The cross-host LCD remains GitHub Actions** — every agent CLI runs there, and it's the only mechanism that doesn't require a specific paid plan or vendor lock-in.

### Finding: Headless mode + system schedulers is the DIY pattern for users without Routines
**Confidence:** CONFIRMED
**Evidence:** Web search results (multiple sources):

> "The -p (or --print) flag runs Claude Code non-interactively: it processes one prompt, outputs the result, and exits. No session UI, no conversation state — just input and output. This makes it a clean target for cron, systemd timers, or any scheduler that can execute shell commands."

> "On modern Linux systems, systemd timers are often a better option than cron. For more robust scheduling on Linux, systemd timers provide better logging, dependency management, and failure handling."

For macOS: launchd. For Windows: Task Scheduler.

**Implications:**
- The DIY pattern is well-documented and works against the user's local installation — no cloud subscription required.
- **Setup overhead is real** — each scheduler has its own config format. Compare with Routines (which is cron-string-only) or GitHub Actions (which is YAML).
- For OK specifically, shipping a templated wrapper that handles the per-OS scheduler config (mirroring the per-host hook config templates from the prior `ok-knowledge-lint-integration` report) would lower this overhead.

### Finding: "Auto-Dream" / "Sleep Consolidation" patterns are now first-class in some implementations
**Confidence:** CONFIRMED
**Evidence:** Web search results:

> "Auto-Dream, a memory consolidation feature modeled on how brains process sleep, is partially rolled out as of April 2026."

> "The system runs scheduled 'heartbeat' cycles to consolidate, synthesize, and surface insights without you asking and manages a modular skills system that lets it acquire new capabilities over time."

This matches the gist-comments "Sleep Consolidation" pattern (DPC Messenger) from prior research:

> "Agents periodically reviewing archives to identify contradictions, propose refinements, and distinguish weak from important memories."

**Implications:**
- The "biological-sleep-as-metaphor" framing has emerged as the standard naming for *deep* overnight passes, distinct from shallow incremental syncs. The pattern is convergent, not anomalous.
- Functionally, "Auto-Dream" / "Sleep Consolidation" / "heartbeat cycles" are all variants of the same operation: scheduled LLM-judgment passes that run when nobody's waiting, surface findings rather than auto-resolve, and feed back into the next user session as queued context.
- These map cleanly to the prior research's **"LLM-required 5"** lint checks (contradictions, data gaps, lost-nuance, hallucination amplification, over-confidence) — the checks that are too expensive to run on every write but valuable enough to run on cadence.

### Finding: The trigger taxonomy across all surveyed implementations converges on 5 classes
**Confidence:** INFERRED
**Evidence:** Synthesizing across eugeniughelbur, Pratiyush, GBrain, ByteRover, Astro-Han, claude-obsidian, Claude Code Routines:

| Trigger class | What fires | Cadence | Operations suited |
|---|---|---|---|
| **Per-event (activity)** | After every write / ingest / N-th turn | Synchronous, frequent | Deterministic lint (write_document hints), source-traceability |
| **Per-session-end (use)** | When user disconnects / context compacts | Per-session | Index rebuild, "close the day" summary, queue findings for next session |
| **Daily (time)** | Nightly cron / launchd / systemd | Daily, fixed time | 5-phase nightly: reconcile, synthesize, heal orphans, rebuild index, decay-score |
| **Weekly (time)** | Weekly cron — Sunday night convention | Weekly | Deep audits: stale-claim detection, supersedes-chain validation, source-rot check |
| **Continuous (decay)** | In-memory scoring updated on every change | Real-time | Importance/maturity decay (ByteRover AKL pattern), freshness ranking |

Plus **on-demand**: `/lint`, `/consolidate`, `/research --headless` triggered explicitly by the user (interactive) or by another scheduled task (composed).

**Implications:**
- The 5-trigger taxonomy is more granular than the prior research's 4 (activity / time / use / continuous decay). The new addition is **session-end** — distinct from time-based because it fires on user-end-of-session regardless of clock.
- Each Karpathy-implementation picks a subset of the 5; none implement all of them. eugeniughelbur uses per-event (compaction), daily, weekly, and on-demand. Pratiyush is daily + weekly + on-demand. GBrain is continuous decay + on-demand.

---

## Gaps / follow-ups

- **The Sunday weekly health audit pattern** wasn't deeply traced beyond the eugeniughelbur reference. Other implementations may have different weekly conventions.
- **Active learning patterns** (where the system learns from user feedback on lint findings to tune future lint sensitivity) appeared in the redmizt "Beyond the Wiki" gist title but the gist returned 404. This is a direction worth a separate investigation.
- **Per-OS scheduler templates** (launchd plist, systemd unit, Task Scheduler XML) — the existing community implementations describe the shape but don't ship turnkey templates. A future OK contribution could.
