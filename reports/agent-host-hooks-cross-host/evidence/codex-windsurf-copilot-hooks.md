# Evidence: Codex, Windsurf, GitHub Copilot CLI Hooks

**Dimension:** Tier-A hosts beyond Claude Code + Cursor
**Date:** 2026-04-27
**Sources:** [Codex Hooks docs](https://developers.openai.com/codex/hooks); [Windsurf Cascade Hooks](https://docs.windsurf.com/windsurf/cascade/hooks); [GitHub Copilot CLI Hooks](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-hooks); [VS Code Agent hooks](https://code.visualstudio.com/docs/copilot/customization/hooks)

---

## Findings

### Finding: OpenAI Codex ships PreToolUse / PostToolUse / PermissionRequest / SessionStart / UserPromptSubmit / Stop hooks
**Confidence:** CONFIRMED
**Evidence:** [Codex Hooks docs](https://developers.openai.com/codex/hooks):

> "Hooks are an extensibility framework for Codex. They allow you to inject your own scripts into the agentic loop, enabling features such as: Send the conversation to a custom logging/analytics engine · Scan your team's prompts to block accidentally pasting API keys · Summarize conversations to create persistent memories automatically · Run a custom validation check when a conversation turn stops, enforcing standards."

Configuration: `hooks.json` files **OR** inline `[hooks]` table in `config.toml`. Co-located with active config layers.

Events: `SessionStart`, `UserPromptSubmit`, `Stop`, `PreToolUse`, `PostToolUse`, `PermissionRequest`. Matcher field is a regex; `"*"` or omitting matches every occurrence.

**Concurrent execution:** *"Multiple matching command hooks for the same event are launched concurrently, so one hook cannot prevent another matching hook from starting."*

Stdin JSON envelope (per-event):
- `SessionStart`, `UserPromptSubmit`, `Stop`: `{ continue: true, stopReason: "...", systemMessage: "...", suppressOutput: false }`
- `PreToolUse`, `PermissionRequest`: `systemMessage` only (no `continue`/`stopReason`/`suppressOutput`)
- `PostToolUse`: `systemMessage`, `continue: false`, `stopReason`

Managed hooks: *"Admin-enforced managed lifecycle hooks. Requires a managed hook directory and uses the same event schema as inline [hooks] in config.toml."*

**Implications:**
- Codex's hook surface is structurally similar to Claude Code's but smaller (~6 events vs ~30). The PreToolUse / PostToolUse / SessionStart / Stop core is present.
- Concurrent hook execution differs from Claude Code's serial model — order-sensitive hooks need coordination at the script layer.
- Codex shares the `~/.codex/config.toml` location with Codex Desktop and the IDE extension (per this repo's `mcp-server-auto-install-harnesses/`) — one hook config covers all three Codex surfaces.

### Finding: Windsurf Cascade ships pre/post hooks across the Cascade workflow lifecycle
**Confidence:** CONFIRMED
**Evidence:** [Windsurf Cascade Hooks](https://docs.windsurf.com/windsurf/cascade/hooks):

> "Cascade Hooks enable executing custom shell commands at key points in Cascade's workflow for logging, security controls, validation, and enterprise governance with pre and post hooks."

Specific hooks named in the search results: `pre_write_code`, `post_write_code`, `post_cascade_response`, plus user-prompt hooks.

> "Each hook receives context (details about the action being performed) via JSON as standard input and executes your script - Python, Bash, Node.js, or any executable."

Recent updates (2026):
- Cloud configuration for Cascade Hooks for enterprise teams (cloud dashboard).
- February 2026: fixes for `post_write_code` to handle all code editing tool formats.
- February 2026: tracking of triggered rules in `post_cascade_response` via new `rules_applied` field.
- User-prompt hooks for logging all user prompts and blocking policy-violating prompts.

Security warning (verbatim): *"Hooks execute shell commands automatically with your user account's full permissions, and poorly designed or malicious hooks can modify files, delete data, expose credentials, or compromise your system."*

**Implications:**
- Windsurf's event naming differs (`pre_write_code` rather than `PreToolUse`) — the events are more specific to Cascade's workflow categories rather than generic tool-use events.
- Cloud-configurable means enterprise teams can ship knowledge-lint hooks centrally — same posture as Claude Code's managed hooks.
- The `post_write_code` event is exactly the right trigger for OK's "run lychee + dead-link audit after every wiki write" pattern.

### Finding: GitHub Copilot CLI shipped hooks GA in February 2026
**Confidence:** CONFIRMED
**Evidence:** [GitHub Copilot CLI Hooks](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-hooks); [Hooks configuration](https://docs.github.com/en/copilot/reference/hooks-configuration); [GA changelog Feb 25 2026](https://github.blog/changelog/2026-02-25-github-copilot-cli-is-now-generally-available/):

> "Hooks allow you to extend and customize the behavior of GitHub Copilot agents by executing custom shell commands at key points during agent execution. Hooks are external commands, HTTP webhooks, or (on sessionStart only) prompt strings that execute at specific lifecycle points during a session, enabling custom automation, security controls, and integrations."

> "preToolUse hooks able to deny or modify tool calls, and postToolUse hooks enabling custom post-processing."

Configuration: `.github/hooks/<name>.json` in the repository.

Cross-surface coverage: same hooks system covers GitHub Copilot CLI, VS Code Copilot Agent mode, and (separately) the cloud "coding agent" — see [Agent hooks in Visual Studio Code (Preview)](https://code.visualstudio.com/docs/copilot/customization/hooks) and [Using hooks with GitHub Copilot agents](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/use-hooks).

**Implications:**
- GitHub Copilot is the latest entrant — Feb 2026 GA — and the hook system is first-class across CLI + IDE + cloud.
- Repo-local config (`.github/hooks/`) means hooks are versioned with the project. Slightly different placement than Claude Code's `.claude/` and Cursor's `.cursor/` — but conceptually the same project-scoped pattern.
- The HTTP-webhook handler type matches Claude Code's `http` handler — useful for centralizing knowledge-lint enforcement across all hosts at one webhook endpoint.

### Finding: All four hosts converged on the same conceptual surface within ~6 months
**Confidence:** INFERRED
**Evidence:** Timeline of hook arrival:

| Host | Hooks shipped | Event scope |
|---|---|---|
| Claude Code | ~Q1 2025 (mature by 2026-04) | ~30 events |
| Cursor | v1.7, October 2025 | ~17 events |
| GitHub Copilot CLI | February 2026 GA | ~6 events |
| Codex | (existed earlier; PreTool/PostTool added by 2026) | ~6 events |
| Windsurf | (mature by 2026-02 with cloud config) | Workflow-specific (`pre_write_code`, etc.) |

All converged on:
1. **Pre/Post tool execution events** with deny/modify capability on Pre.
2. **Session lifecycle events** (start, stop, end).
3. **JSON-on-stdin → JSON-on-stdout** envelope semantics.
4. **Project-scoped + user-scoped + (sometimes) enterprise-scoped** config files.
5. **Shell command + (sometimes) HTTP webhook** handler types.

**Implications:**
- This is now an **industry-standard pattern**, not a Claude Code idiosyncrasy. A knowledge-lint hook script written for one host can be wrapped for the others with thin adapters.
- The schema convergence is the more important point than full equivalence — the *shape* of the hook (stdin JSON → exit code or stdout JSON) is portable; only the per-host config file location and event-name vocabulary differs.

---

## Gaps / follow-ups

- The exact JSON field-name parity across hosts wasn't traced in detail. Codex's docs mention `continue: false` for `PostToolUse`; Cursor uses `permission: deny` for `preToolUse` block; Claude Code uses exit code 2 + stdout JSON. A cross-host adapter would need to normalize these.
- Windsurf's event names (`pre_write_code` etc.) are CASCADE-WORKFLOW-specific and may not have direct equivalents in other hosts' event taxonomies — extra mapping work for Windsurf.
- I did not investigate enterprise distribution mechanisms (managed hook directories) deeply for Codex and Windsurf.
