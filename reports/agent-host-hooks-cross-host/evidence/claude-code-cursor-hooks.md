# Evidence: Claude Code & Cursor Hooks

**Dimension:** Tier-A hosts with full PreToolUse/PostToolUse-pattern hooks
**Date:** 2026-04-27
**Sources:** [Claude Code Hooks docs](https://code.claude.com/docs/en/hooks); [Cursor Hooks docs](https://cursor.com/docs/hooks); this repo's `config-surfaces-vscode-and-claude-code/` report; [InfoQ on Cursor 1.7](https://www.infoq.com/news/2025/10/cursor-hooks/)

---

## Findings

### Finding: Claude Code ships ~30 hook events across 6 scope locations
**Confidence:** CONFIRMED
**Evidence:** This repo's `config-surfaces-vscode-and-claude-code/REPORT.md:330` (which sources [code.claude.com/docs/en/hooks](https://code.claude.com/docs/en/hooks)):

> "The event taxonomy is rich (~30 event types): session-level (`SessionStart`, `SessionEnd`, `InstructionsLoaded`); per-turn (`UserPromptSubmit`, `Stop`); tool execution (`PreToolUse`, `PostToolUse`, `PermissionRequest`); agent lifecycle (`SubagentStart`, `TaskCreated`); environment (`ConfigChange`, `CwdChanged`, `FileChanged`); compaction (`PreCompact`, `PostCompact`); MCP elicitation; worktree events. Handler types: `command` (default), `http`, `mcp_tool`, `prompt`, `agent`. HTTP hooks gate egress via `allowedHttpHookUrls` allowlist."

Six scope locations: `managed → user → project → local → plugin → skill/agent frontmatter`. Hook source is *labeled* in output (`[User]`, `[Project]`, etc.). No per-hook approval prompt — trust comes from scope provenance.

Mute switches: `allowManagedHooksOnly: true` (enterprise), `disableAllHooks: true` (respects hierarchy — user-level cannot disable managed hooks).

**Implications:**
- Claude Code is the most feature-rich hook surface today: largest event taxonomy, multiple handler types (not just shell commands), scope hierarchy with managed-vs-user trust differentiation.
- The `mcp_tool` handler type is unique — a hook can invoke an MCP tool directly, which means OK could ship a built-in `get_dead_links` hook for Claude Code users that requires no host-side script.

### Finding: Cursor 1.7 (Oct 2025) ships ~17 hook events; explicitly Claude-Code-compatible
**Confidence:** CONFIRMED
**Evidence:** [Cursor Hooks docs](https://cursor.com/docs/hooks) (web fetch):

```text
sessionStart / sessionEnd
preToolUse / postToolUse / postToolUseFailure
subagentStart / subagentStop
beforeShellExecution / afterShellExecution
beforeMCPExecution / afterMCPExecution
beforeReadFile / afterFileEdit
beforeSubmitPrompt
preCompact
stop
afterAgentResponse / afterAgentThought
```

Tab (autocomplete) hooks separately:
```text
beforeTabFileRead / afterTabFileEdit
```

Configuration: `~/.cursor/hooks.json` (user) or `<project>/.cursor/hooks.json` (project). Priority: Enterprise → Team → Project → User.

**Direct compatibility statement** (verbatim from docs):

> "Cursor supports loading hooks from third-party tools like Claude Code. Exit code blocking: Exit code `2` from command hooks blocks the action (equivalent to returning `permission: 'deny'`). **This matches Claude Code behavior for compatibility.**"

Per-platform paths for enterprise:
- macOS: `/Library/Application Support/Cursor/hooks.json`
- Linux/WSL: `/etc/cursor/hooks.json`
- Windows: `C:\ProgramData\Cursor\hooks.json`

**Implications:**
- A single hook *script* can target both Claude Code and Cursor — the exit-code semantics match. The *config file* differs (`.claude/settings.json` vs `.cursor/hooks.json`), but the underlying handler is portable.
- Cursor's event coverage is narrower than Claude Code's (~17 vs ~30) and lacks Claude Code's `mcp_tool` handler type — Cursor hooks are command-only.

### Finding: The PreToolUse "approve / deny" semantics are convergent
**Confidence:** CONFIRMED
**Evidence:** Cursor docs:
> "preToolUse hook is the most powerful, capable of approving or denying tool executions for security enforcement and compliance logging. The preToolUse output can include a 'permission' field with values 'allow' or 'deny' to proceed or block an action."

Claude Code's `PreToolUse` hook similarly returns approve/deny via stdout JSON or exit code 2.

**Implications:**
- The "block this write if it would introduce a dead link" pattern is a portable hook between Claude Code and Cursor — only the config plumbing differs.
- A *deny* return is post-decision-pre-execution: the agent has already chosen the tool call, the hook just stops it. This is the right shape for "lint before write," not "lint instead of letting the agent write."

### Finding: Cursor preToolUse has known bugs for the Task tool
**Confidence:** CONFIRMED
**Evidence:** [Cursor forum #151985](https://forum.cursor.com/t/pretooluse-hook-updated-input-is-silently-ignored-for-the-task-tool/151985):

> "preToolUse hook updated_input is silently ignored for the Task tool"

**Implications:** Task-tool subagents in Cursor can bypass preToolUse modifications. For OK's purposes (we don't use Task heavily), this is minor — but it's a known gotcha if delegating wiki edits to subagents.

### Finding: Both hosts support multiple scope locations with explicit hierarchies
**Confidence:** CONFIRMED
**Evidence:** Side-by-side:

| Scope | Claude Code | Cursor |
|---|---|---|
| Managed (admin/enterprise) | `~/.claude/managed-settings.json` | `/Library/Application Support/Cursor/hooks.json` (macOS, etc.) |
| Team | (via plugins / managed) | (Cursor cloud-config) |
| User | `~/.claude/settings.json` | `~/.cursor/hooks.json` |
| Project | `.claude/settings.json` | `.cursor/hooks.json` |
| Local (gitignored) | `.claude/settings.local.json` | (no equivalent — see this repo's `config-surfaces` report §D10) |
| Skill/agent frontmatter | hooks in skill SKILL.md frontmatter | (no equivalent) |

**Implications:**
- Claude Code's six scopes give richer per-developer override flexibility (esp. `.claude/settings.local.json`).
- Both support enterprise managed configs — important for org-wide knowledge-lint policy.
- Project-level hooks in both ride along with the repo, which is exactly what OK needs to bundle a default knowledge-lint hook with the OK MCP install.

---

## Gaps / follow-ups

- I did not trace the exact JSON envelope shape for hook stdin/stdout in either host. The `ms` semantics, JSON field names (`continue`, `stopReason`, `systemMessage`), and Cursor's `permission: allow|deny` field need code-level confirmation if writing a portable hook.
- Cursor's CLI mode hook support is undocumented — the docs cover desktop primarily.
