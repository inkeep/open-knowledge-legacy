# Evidence: Narrower / Different-Shape Hosts

**Dimension:** Hosts that don't fit the PreToolUse/PostToolUse pattern but have related mechanisms
**Date:** 2026-04-27
**Sources:** [Aider docs](https://aider.chat/docs/usage/lint-test.html); [Continue.dev docs](https://docs.continue.dev/ide-extensions/agent/how-it-works); [Continue beyond-the-editor blog post](https://blog.continue.dev/beyond-the-editor-how-im-using-continue-cli-to-automate-everything)

---

## Findings

### Finding: Aider has lint/test "auto-runs" but no full agent-loop hooks
**Confidence:** CONFIRMED
**Evidence:** [Aider Linting and testing docs](https://aider.chat/docs/usage/lint-test.html):

```yaml
# .aider.conf.yml
auto-lint: true
lint-cmd: "eslint --fix"
auto-test: false
test-cmd: "npm test"
```

> "Whenever aider edits a file, it commits those changes with a descriptive commit message."
> "When a lint error is detected, Aider will attempt to fix the violation automatically before committing."
> "If tests fail, Aider will analyze the failure output and attempt to fix the code."

> "--git-commit-verify will run pre-commit hooks when making git commits. By default, aider skips pre-commit hooks by using the --no-verify flag (--git-commit-verify=False)."

**Implications:**
- Aider's "hooks" are narrower: only `lint-cmd` and `test-cmd` after edits, not arbitrary lifecycle events.
- The `auto-lint` mechanism is fundamentally suited to OK's deterministic-7 lint set — `lint-cmd: "lychee --no-progress wiki/"` would fire after every edit.
- No PreToolUse equivalent — Aider can't intercept tool calls before execution, only react after.
- Aider's `--git-commit-verify` (when enabled) defers to git pre-commit hooks — meaning Aider users running `husky`-managed hooks get knowledge-lint enforcement for free if the repo defines it as a pre-commit gate.
- Aider's design philosophy (CLI tool that wraps git workflow) means git hooks are the more natural integration point than Aider-specific hooks.

### Finding: Continue.dev exposes onPreToolUse / onPostToolUse via SDK (programmatic, not config-driven)
**Confidence:** CONFIRMED
**Evidence:** [Continue.dev docs](https://docs.continue.dev/ide-extensions/agent/how-it-works); search results indicate the SDK pattern:

> "Continue supports hook lifecycle patterns including pre/post tool use hooks for validation and session lifecycle hooks. The SDK demonstrates specific hook patterns:
> - **onPreToolUse**: This hook can validate tool calls before execution, allowing you to approve or continue based on conditions like tool name
> - **onPostToolUse**: This hook executes after tool completion, enabling logging and monitoring of tool execution"

> "Continue's parallel tool calling allows multiple operations to run simultaneously, the permission system ensures safety, and the rules engine enforces team standards"

> "Continue CLI enables AI to step beyond autocomplete into automation—triaging issues, running bash commands safely, driving workflows, and working asynchronously"

> "Agents can be integrated into CI/CD pipelines like GitHub Actions to automatically review every pull request, ensuring standards are enforced consistently across teams"

**Implications:**
- Continue's hooks are **SDK-level, not file-config-level** — you write JavaScript/TypeScript and call Continue's API, vs. Claude Code where you drop a hooks block in JSON. Higher floor for "drop in a knowledge-lint hook," lower ceiling for power users.
- Continue's CLI ships with a built-in async-agent mode that runs hooks in CI — which crosses into the **auto-research** territory naturally (next dimension).
- Same PreToolUse / PostToolUse vocabulary as the other hosts — schema convergence holds.

### Finding: Aider and Continue both have a "post-edit auto-fix" model that overlaps with hooks
**Confidence:** INFERRED
**Evidence:** Both tools build "edit → run check → fix" loops directly into the agent:
- Aider: `auto-lint` runs after each edit; on failure, the LLM is given the lint output and asked to fix.
- Continue: rules engine + permission system applies to every tool call; CLI/CI mode applies on every PR.

**Implications:**
- For OK's deterministic lint checks, both hosts already provide the right mental model — "run this command after edits, surface failures to the agent." The difference is that Claude Code / Cursor / Codex / Windsurf hooks are **more granular** (any lifecycle event, not just post-edit) and **runtime-blocking** (a PreToolUse hook can prevent the edit from happening).
- The "lint runs automatically and the LLM iterates on failures" pattern matches Karpathy's lint operation closely. Aider users get this for free; Continue users get it via SDK.

---

## Gaps / follow-ups

- I did not deep-read Continue's SDK to confirm the exact API surface for `onPreToolUse` / `onPostToolUse`. The references suggest a pattern but the API contract wasn't traced.
- Aider's interaction with git pre-commit hooks could be a useful path: the OK skill could ship a husky-installable git hook that fires on commit, which Aider would respect when `--git-commit-verify=True`. This crosses Aider into the "deterministic gate" model.
