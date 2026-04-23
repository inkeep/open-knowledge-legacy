# Evidence: Anthropic's Built-in Sandbox + Auto Mode

**Dimensions:** D1 (built-in sandbox), D2 (permission model + auto mode)
**Date:** 2026-04-22
**Sources:** Anthropic official docs (`code.claude.com/docs`), Anthropic engineering blog, in-CLI flag inspection

---

## Key sources

- [Sandboxing — Claude Code Docs](https://code.claude.com/docs/en/sandboxing) — official feature documentation
- [Making Claude Code more secure and autonomous — Anthropic Engineering](https://www.anthropic.com/engineering/claude-code-sandboxing) — design rationale + 84% claim
- [Choose a permission mode — Claude Code Docs](https://code.claude.com/docs/en/permission-modes) — mode taxonomy including auto mode
- [Claude Code auto mode: a safer way to skip permissions — Anthropic Engineering](https://www.anthropic.com/engineering/claude-code-auto-mode) — auto mode rationale + classifier architecture
- The Bash tool exposed in this very session has a `dangerouslyDisableSandbox` parameter — direct in-CLI confirmation that the sandbox is active for shell commands

---

## Findings

### Finding: The sandbox is an OS-kernel-level mechanism, not a container or VM

**Confidence:** CONFIRMED
**Evidence:** [code.claude.com/docs/en/sandboxing — OS-level enforcement](https://code.claude.com/docs/en/sandboxing)

> "The sandboxed bash tool leverages operating system security primitives: **macOS**: Uses Seatbelt for sandbox enforcement. **Linux**: Uses [bubblewrap](https://github.com/containers/bubblewrap) for isolation. **WSL2**: Uses bubblewrap, same as Linux."

> "These enforce restrictions at the kernel level, covering not just direct interactions but also spawned subprocesses and scripts." — [anthropic.com/engineering/claude-code-sandboxing](https://www.anthropic.com/engineering/claude-code-sandboxing)

The Anthropic engineering post explicitly contrasts this with containers, noting the sandbox runs "without the overhead of spinning up and managing a container."

**Implications:**
- On macOS, this is *the lightest possible isolation tier* — no container daemon, no VM, no separate root filesystem. Seatbelt rules are loaded into the kernel and applied to the bash subprocess directly.
- All spawned subprocesses inherit the sandbox profile, so an agent that runs `npm install` cannot escape via a child process.
- On macOS the implementation is built on the same Seatbelt (`sandbox-exec`) framework Apple uses for Mac App Store apps and that Chrome uses for renderer-process isolation.

---

### Finding: Filesystem isolation defaults are sensible — read-broad, write-narrow

**Confidence:** CONFIRMED
**Evidence:** [code.claude.com/docs/en/sandboxing — How it works](https://code.claude.com/docs/en/sandboxing)

> "**Default writes behavior**: Read and write access to the current working directory and its subdirectories. **Default read behavior**: Read access to the entire computer, except certain denied directories. **Blocked access**: Cannot modify files outside the current working directory without explicit permission."

> "These restrictions are enforced at the OS level (Seatbelt on macOS, bubblewrap on Linux), so they apply to all subprocess commands, including tools like `kubectl`, `terraform`, and `npm`, not just Claude's file tools."

**Implications:**
- The default is *not* a strict allowlist for reads. By default, sensitive files like `~/.ssh/id_rsa`, `~/.aws/credentials`, browser cookies, and shell history are still readable. The sandbox alone does not protect against credential exfiltration over a permitted network channel — this is the major caveat.
- Configurable via `sandbox.filesystem.allowWrite` in `settings.json` to extend write access to additional paths.
- Critically, this is *write-protection*. Pair it with network isolation (next finding) to actually block exfiltration.

---

### Finding: Network isolation works via a unix-socket proxy with domain allowlists

**Confidence:** CONFIRMED
**Evidence:** [anthropic.com/engineering/claude-code-sandboxing](https://www.anthropic.com/engineering/claude-code-sandboxing) — network isolation section

> "network isolation, by only allowing internet access through a unix domain socket connected to a proxy server running outside the sandbox."

> "The proxy enforces restrictions on the domains that a process can connect to."

From the docs:

> "**Domain restrictions**: Only approved domains can be accessed. **User confirmation**: New domain requests trigger permission prompts (unless `allowManagedDomainsOnly` is enabled, which blocks non-allowed domains automatically)."

**Implications:**
- This is the lighter-weight equivalent of running a Squid proxy in front of Claude Code — Anthropic ships its own proxy as part of the sandbox, no separate process to operate.
- Network is the load-bearing piece. Even if the agent can read `~/.ssh`, with network isolation set to managed-only it cannot send the keys anywhere outside the allowlist.
- Domain-fronting is an explicitly acknowledged bypass class: "in some cases it may be possible to bypass the network filtering through [domain fronting](https://en.wikipedia.org/wiki/Domain_fronting)" — the proxy enforces SNI/Host headers, not packet payloads.

---

### Finding: Sandboxing reduces permission prompts by 84% in Anthropic's internal testing

**Confidence:** CONFIRMED (claim is published; methodology is not disclosed)
**Evidence:** [anthropic.com/engineering/claude-code-sandboxing](https://www.anthropic.com/engineering/claude-code-sandboxing)

> "Internal usage testing found that sandboxing safely reduces permission prompts by 84%."

**Caveat:** The 84% number is Anthropic's own measurement of a feature Anthropic ships. No detail on workload mix, repo type, or measurement period is published. Treat as directional rather than scientific.

---

### Finding: There is an escape hatch (`dangerouslyDisableSandbox`) and it can be globally disabled

**Confidence:** CONFIRMED
**Evidence:** [code.claude.com/docs/en/sandboxing — Getting started](https://code.claude.com/docs/en/sandboxing)

> "Claude Code includes an intentional escape hatch mechanism that allows commands to run outside the sandbox when necessary. When a command fails due to sandbox restrictions (such as network connectivity issues or incompatible tools), Claude is prompted to analyze the failure and may retry the command with the `dangerouslyDisableSandbox` parameter. Commands that use this parameter go through the normal Claude Code permissions flow requiring user permission to execute."

> "You can disable this escape hatch by setting `'allowUnsandboxedCommands': false` in your sandbox settings. When disabled, the `dangerouslyDisableSandbox` parameter is completely ignored and all commands must run sandboxed or be explicitly listed in `excludedCommands`."

**Direct in-CLI confirmation:** The Bash tool description in this very Claude Code session shows the parameter:

```
"dangerouslyDisableSandbox": "Set this to true to dangerously override sandbox mode and run commands without sandboxing."
```

**Implications:**
- The default escape-hatch behavior means a sandbox bypass requires user approval at runtime — but a user who learned to click through permission prompts will click through this one too. For unattended runs, set `allowUnsandboxedCommands: false`.
- The March 2026 Falco-maintainer demonstration (see threat-models-and-vulnerabilities.md) showed Claude *will* request this escape hatch when blocked.

---

### Finding: Auto-allow mode skips prompts for sandboxable commands; falls back to permission prompts for un-sandboxable ones

**Confidence:** CONFIRMED
**Evidence:** [code.claude.com/docs/en/sandboxing — Sandbox modes](https://code.claude.com/docs/en/sandboxing)

> "**Auto-allow mode**: Bash commands will attempt to run inside the sandbox and are automatically allowed without requiring permission. Commands that cannot be sandboxed (such as those needing network access to non-allowed hosts) fall back to the regular permission flow. Explicit deny rules are always respected, and `rm` or `rmdir` commands that target `/`, your home directory, or other critical system paths still trigger a permission prompt."

> "**Regular permissions mode**: All bash commands go through the standard permission flow, even when sandboxed. This provides more control but requires more approvals."

**April 2026 hardening:**

> "Sandbox auto-allow no longer bypasses the dangerous-path safety check for rm/rmdir targeting /, $HOME, or other critical system directories." — referenced in April 2026 Anthropic release notes via search recon.

**Implications:**
- Auto-allow is the productivity unlock — this is what gets you 84% fewer prompts.
- The system has special hardening for the `rm -rf /` class of mistakes even within the sandbox.

---

### Finding: Auto mode is a separate, stronger primitive than auto-allow — it uses ML classifiers

**Confidence:** CONFIRMED
**Evidence:** [anthropic.com/engineering/claude-code-auto-mode](https://www.anthropic.com/engineering/claude-code-auto-mode)

> "Auto mode is a safety feature for Claude Code that automates permission decisions through model-based classifiers, replacing the need for manual approval of every action. It sits between fully manual review and the risky `--dangerously-skip-permissions` flag."

> "The `--dangerously-skip-permissions` flag disables all permission prompts and lets Claude act freely, which is unsafe in most situations. Auto mode, by contrast, uses intelligent filtering to allow safe actions automatically while blocking potentially dangerous ones — providing autonomy with guardrails rather than complete freedom."

> "Auto mode employs two defensive layers: **Input layer**: A prompt-injection probe screens tool outputs for hijacking attempts before they reach the agent. **Output layer**: A transcript classifier evaluates each action against safety criteria before execution."

> "The classifier uses a two-stage approach: a fast filter flags suspicious actions, then chain-of-thought reasoning reviews flagged items to reduce false positives."

**Where to enable:** `code.claude.com/docs/en/permission-modes#eliminate-prompts-with-auto-mode`

**Anthropic's own caveat:**

> "Auto mode suits developers who would otherwise use `--dangerously-skip-permissions` or face significant approval fatigue. It's not recommended for 'high-stakes infrastructure' where careful human review remains preferable."

**Implications:**
- Auto mode is layered ON TOP of the permission system, not a replacement for the OS-level sandbox. They compose: auto mode reduces prompts within whatever the sandbox already allows.
- The two-stage classifier is itself an LLM call per action — non-trivial latency overhead per tool call. For interactive use this is acceptable; for high-volume agent loops it adds up.

---

### Finding: Documented limitations and known bypass classes

**Confidence:** CONFIRMED
**Evidence:** [code.claude.com/docs/en/sandboxing — Security Limitations](https://code.claude.com/docs/en/sandboxing)

Anthropic explicitly catalogs these:

1. **Network filtering operates on domain allowlist, not packet inspection.** Allowing broad domains like `github.com` may permit data exfiltration via gist or similar mechanisms.

2. **Domain-fronting is a known bypass.** Acknowledged by name in the docs.

3. **Unix socket allowlist can grant catastrophic access.** Allowing `/var/run/docker.sock` "would effectively grant access to the host system through exploiting the docker socket."

4. **Filesystem write to `$PATH` directories or shell rc files is privilege escalation.** Granting write to dirs containing executables in `$PATH`, system configuration directories, or `.bashrc`/`.zshrc` "can lead to code execution in different security contexts."

5. **The Linux `enableWeakerNestedSandbox` mode "considerably weakens security and should only be used in cases where additional isolation is otherwise enforced."** Used to make the sandbox work inside Docker without privileged namespaces.

6. **Built-in file tools (Read/Edit/Write) bypass the sandbox.** They use the permission system directly, not the OS-level sandbox.

7. **Computer-use tools open apps and control the screen — they "run on your actual desktop rather than in an isolated environment."**

8. **Some tools are incompatible with the sandbox.** `watchman`, `docker` are explicitly listed; need to be run via `excludedCommands`.

**Implications:**
- The sandbox is not a complete isolation primitive. It's a kernel-enforced reduction of the attack surface for `Bash`-tool subprocesses.
- The Read/Edit/Write tools still rely on the permission system. An agent told to "read all files in `~/.aws/`" via the Read tool will be gated by the permission prompt, not by Seatbelt.

---

### Finding: The sandbox runtime is open-source and reusable for any agent, not just Claude Code

**Confidence:** CONFIRMED
**Evidence:** [code.claude.com/docs/en/sandboxing — Open source](https://code.claude.com/docs/en/sandboxing)

> "The sandbox runtime is available as an open source npm package for use in your own agent projects... For example, to sandbox an MCP server you could run: `npx @anthropic-ai/sandbox-runtime <command-to-sandbox>`"

**Implications:**
- The same Seatbelt/bubblewrap wrapping can be applied to MCP servers and other agent processes — useful for layered defense.
- Confirms the architecture is process-wrapping, not Claude-Code-specific.

---

## Negative searches

- Searched for whether the macOS proxy runs as root or unprivileged → not documented in current Anthropic sources. Implication: if it requires no elevated privilege (consistent with Seatbelt's design), this is another lightness win vs container/VM approaches.
- Searched for explicit memory/CPU overhead numbers Anthropic has published for the sandbox itself → not found. Anthropic's only quantified claim is the 84% prompt reduction.
- Searched for native Windows support timeline → "planned" but no date given.

## Gaps / follow-ups

- No public technical paper on the seatbelt profile shape Anthropic ships — would be useful to inspect via `~/.claude/sandbox/*.sb` if files are accessible.
- Auto mode classifier accuracy/recall numbers are not published. The "two-stage" architecture is described but no false-positive/false-negative rates.
- The interaction between auto mode + sandbox auto-allow is documented but the precedence rules in conflict cases (auto mode says block, sandbox says allow) are implicit.
