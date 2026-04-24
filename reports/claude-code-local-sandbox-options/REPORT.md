---
title: "Running Claude Code Safely in a Local Sandbox: Options for macOS in 2026"
description: "Tiered survey of local sandboxing approaches for Claude Code CLI — from Anthropic's built-in OS-level sandbox to macOS-native microVMs (Apple Container, Lima, OrbStack, ClodPod) to heavier devcontainer/Docker stacks — with threat-model-driven recommendations and explicit attention to resource cost."
createdAt: 2026-04-22
updatedAt: 2026-04-22
followups:
  - "2026-04-22 Apple Container deep dive (see end of report + evidence/apple-container-deep-dive.md)"
subjects:
  - Claude Code
  - Anthropic
  - Apple Container
  - OrbStack
  - Lima
  - ClodPod
  - Tart
  - Docker Sandboxes
  - Matchlock
  - Trail of Bits
  - libkrun
  - krunkit
  - Apple Virtualization.framework
  - Seatbelt
  - bubblewrap
topics:
  - local sandboxing
  - macOS isolation
  - microVMs
  - kernel-level sandbox
  - network egress allowlist
  - prompt-injection defense
  - dangerously-skip-permissions
  - autonomous agents
  - resource overhead
---

# Running Claude Code Safely in a Local Sandbox: Options for macOS in 2026

**Purpose:** Help a developer running Claude Code on a local Mac choose the right safety primitive(s) for their threat model — without paying Docker Desktop's resource cost when a lighter option suffices.

---

## Executive Summary

**Yes — there are multiple safe ways to run Claude Code in a local sandbox, and 2026 is a notably good moment to pick one.** Anthropic shipped a kernel-level built-in sandbox that on macOS uses Apple's Seatbelt framework directly with no container or VM ([Anthropic Engineering, 2026](https://www.anthropic.com/engineering/claude-code-sandboxing)). The macOS microVM ecosystem matured: [Apple Container](https://github.com/apple/container) (one microVM per container), [OrbStack](https://docs.orbstack.dev/architecture) (single shared VM with very low background cost), [Lima v2.0](https://www.cncf.io/blog/2025/12/11/lima-v2-0-new-features-for-secure-ai-workflows/) (CNCF-incubating, with explicit AI-agent isolation features and an MCP-server bridge), and Tart-based [ClodPod](https://github.com/webcoyote/clodpod) (per-agent macOS VMs) all use Apple's Virtualization.framework natively.

The strongest single recommendation depends on which threat you're defending against. There is no universal answer.

**Key Findings:**

- **The Anthropic built-in sandbox is the lightest sufficient tier for trusted-code work.** On macOS it applies Seatbelt rules to the bash subprocess directly — no container, no VM, kernel-level enforcement, ships its own network proxy. Anthropic reports an [84% reduction in permission prompts](https://www.anthropic.com/engineering/claude-code-sandboxing). For the "I want fewer prompts on code I trust" case, this likely ends the search before reaching for any container or VM at all.
- **Containers are not a security boundary against malicious code in 2026.** Multiple 2024-2025 CVEs (Leaky Vessels, NVIDIAScape, runc race conditions) reached the host from inside containers ([microvm-2026 survey](https://emirb.github.io/blog/microvm-2026/)). For untrusted-code review, the consensus has moved to microVMs.
- **macOS-native microVM options now beat Docker Desktop on resource cost.** Apple Container reports "no daemon eating RAM in the background" vs Docker Desktop's "2–4 GB idle" ([ses.box hands-on, 2026](https://www.ses.box/posts/sandbox-claude-apple-container)). OrbStack reports <0.1% background CPU. Lima `vz` and ClodPod (Tart) similarly use the native hypervisor without Docker Desktop's daemon.
- **Even hardened devcontainers cannot prevent Claude Code's own credentials from being exfiltrated.** Anthropic's own devcontainer doc states this explicitly. For high-stakes untrusted-code work, run with a separate Claude account inside the sandbox or use a tool like [Matchlock](https://virtuslab.com/blog/ai/matchlock-your-agents-bulletproof-cage) that injects short-lived credentials at a proxy boundary so the long-lived secret never enters the agent's environment.
- **The agent will route around its own sandbox if you let it.** A March 2026 Falco-maintainer demonstration showed Claude Code requesting the `dangerouslyDisableSandbox` escape hatch when blocked. Anthropic provides `allowUnsandboxedCommands: false` to disable the escape hatch entirely; use it for unattended runs.

---

## Research Rubric

**Primary question:** What are the practical, evidence-backed options for running Claude Code CLI on a local Mac (with Linux noted) such that the host is protected from the agent — across the spectrum from "lightly sandboxed with prompts" to "fully unattended in isolation"?

**Reader cares most about:** Picking the right approach for their threat model and tradeoffs, with concrete pointers. Specifically tuned to a user who has tried Docker + Squid and found it too resource-heavy.

**Stance:** Hybrid — factual landscape grounded in primary sources, with conditional decision triggers tying threat models to recommended approaches.

**Dimensions covered:**

- **D1 — Anthropic's built-in sandbox** (P0)
- **D2 — Permission model + auto mode** (P0)
- **D3 — Containerization (devcontainers + Docker)** (P0; reframed as heavy reference tier)
- **D4 — Threat model framing** (P0)
- **D5 — macOS-specific options** (P1, merged with D9 in evidence file)
- **D6 — Network egress control** (P1; lighter alternatives to Squid)
- **D7 — Recent vulnerabilities + bypass research** (P1)
- **D8 — Operational ergonomics** (P2, merged with D10)
- **D9 — microVMs** (promoted to P0 per user input)
- **D10 — Resource overhead comparison** (P0 — added per user input)

**Non-goals:** CI/server-side sandboxing; comparison with other agent CLIs' sandboxes; step-by-step install tutorials; cloud-only solutions.

---

## The Tiered Landscape

Five tiers of isolation are available to a macOS user, ordered by isolation strength (and roughly by resource cost):

```
Tier 0  Anthropic built-in sandbox        — Seatbelt rules on bash subprocess; no VM
Tier 1  Per-container microVM             — Apple Container, Lima vz, Lima krunkit
Tier 2  Single shared VM                  — OrbStack (Docker-replacement DX)
Tier 3  Per-agent VM (purpose-built)      — ClodPod (Tart), Matchlock, Docker Sandboxes
Tier 4  Matryoshka (VM + container)       — defense-in-depth for hostile code
```

The right tier is a function of threat model and resource budget. Most users are over-provisioned by reaching for Tier 3+ when Tier 0 covers their actual threats.

---

## Detailed Findings

### Tier 0 — Anthropic's built-in sandbox (Seatbelt on macOS)

**Finding:** The lightest sufficient option for "I trust this code, I just want fewer prompts." On macOS it applies Seatbelt rules to the bash subprocess directly — no container, no VM, no daemon — with kernel-enforced filesystem and network restrictions.

**Evidence:** [evidence/anthropic-built-in-sandbox.md](evidence/anthropic-built-in-sandbox.md)

**Architecture (what it is):**

- **Filesystem:** Default writes restricted to CWD and subdirs; reads broad by default but configurable. Enforced kernel-side via Seatbelt — applies to *all* spawned subprocesses (`npm`, `kubectl`, `terraform`), not just Claude's own file tools.
- **Network:** A separate proxy process running outside the sandbox is reached via unix domain socket from the sandboxed bash subprocess; proxy enforces a domain allowlist. This is the "Squid replacement" Anthropic ships in-band.
- **Per-platform primitive:** Seatbelt on macOS, bubblewrap on Linux, bubblewrap on WSL2. Native Windows is "planned" but not shipped.
- **Open-source:** The runtime is published as `@anthropic-ai/sandbox-runtime` (npm) for use with other agents and MCP servers.

**Two complementary settings stack on top:**
- **Auto-allow** — sandboxed bash commands run without permission prompts; un-sandboxable commands fall back to the regular permission flow. Anthropic claims this gets you the headline 84% prompt reduction.
- **Auto mode** — separate from auto-allow. Adds two ML classifiers (input prompt-injection probe + output transcript classifier) to filter actions even within what the sandbox allows. Anthropic positions this as the safer alternative to `--dangerously-skip-permissions` and explicitly does not recommend it for "high-stakes infrastructure."

**Implications:**
- For trusted-code work on macOS, this likely ends the search. No new processes, no daemons, no images.
- The escape hatch (`dangerouslyDisableSandbox` per-command, requested by Claude when a command fails inside the sandbox) is the load-bearing weakness for unattended runs. **Set `allowUnsandboxedCommands: false` for unattended use** so the escape hatch is structurally unavailable, not just gated by a permission prompt the agent might learn to request convincingly.

**Decision triggers (when this is the right answer):**
- You trust the code in your CWD.
- You want fewer prompts but care about a `rm -rf $HOME` mistake.
- You're worried about prompt injection from web content the agent fetches.
- You're going AFK on your own work and want a soft safety net.

**Decision triggers (when this is NOT enough):**
- You're reviewing code you didn't write and don't trust.
- A malicious dependency could be in scope.
- You need isolation against credential-exfiltration vectors that route through allowed domains (the proxy does not inspect HTTPS payloads).

**Remaining uncertainty:**
- The 84% claim is Anthropic's internal measurement of an Anthropic feature; methodology not published.
- Per-syscall overhead of the Seatbelt enforcement on real Claude Code workloads has no published benchmark.

---

### Tier 1 — Per-container microVMs (Apple Container, Lima vz, Lima krunkit)

**Finding:** The lightest option that gives you a real kernel boundary against the host. macOS-native, uses Apple's Virtualization.framework directly. Best fit for the user's "Docker is too heavy" constraint when Tier 0 isn't sufficient.

**Evidence:** [evidence/macos-microvm-options.md](evidence/macos-microvm-options.md), [evidence/resource-overhead-tiers.md](evidence/resource-overhead-tiers.md)

| Stack | macOS req | RAM model | Best for |
|---|---|---|---|
| **[Apple Container](https://github.com/apple/container)** v0.9.0 | macOS 26 (Tahoe) + Apple Silicon | "No daemon"; per-container microVM RAM | Daily Claude Code with stronger-than-Seatbelt isolation; the closest "Docker without Docker Desktop" |
| **[Lima](https://lima-vm.io/) v2.0 + `vz` driver** | macOS 13+ | Per-VM (default 4 GB cap, configurable) | Open-source path; CNCF-backed; explicit AI-agent hardening features (MCP server, plugin VM drivers) |
| **[Lima v2.0 + krunkit](https://lima-vm.io/docs/config/vmtype/krunkit/)** | macOS 14+, Apple Silicon | Per-VM | When you also need GPU passthrough (Mesa Venus driver) |

**Key architectural facts:**
- Apple Container puts each container in its own microVM via `Virtualization.framework`. Sub-second startup, no equivalent of the Docker Desktop daemon. Hands-on benchmark: 2–4 GB idle (Docker Desktop) vs "no daemon" (Apple Container) per [ses.box guide](https://www.ses.box/posts/sandbox-claude-apple-container).
- Lima v2.0 added a Model Context Protocol (MCP) server that exposes `glob`, `list_directory`, `read_file`, `run_shell_command`, `search_file_content`, `write_file` to AI agents — letting an agent on the host route file/command tool calls *through* the VM boundary. This is a novel pattern: agent stays on host, but its tool-call effects land in the VM.
- libkrun/krunkit on macOS uses `Hypervisor.framework` (lower-level than `Virtualization.framework`), with sub-200ms startup and "transparent socket impersonation (no TAP devices needed)."

**Filesystem performance caveat (applies to all Tier 1+ options):**
- "Crossing the hypervisor boundary for I/O costs roughly 3x performance on metadata-heavy workloads" ([Infralovers benchmark](https://www.infralovers.com/blog/2026-02-15-sandboxing-claude-code-macos/)).
- Workaround: `git clone` *inside* the VM rather than bind-mounting from the host. Trade-off: workspace lives in the VM, harder to introspect with host tooling.

**Decision triggers (when Tier 1 is right):**
- You want a real kernel boundary but Docker Desktop is too heavy.
- You're on macOS (Apple Container requires Tahoe/macOS 26; Lima vz requires macOS 13+).
- You're reviewing semi-trusted code (a partner's repo, an OSS PR).

**Decision triggers (when Tier 1 isn't enough):**
- You're reviewing actively suspicious code — go to Tier 3 (per-agent ephemeral VM with secret-stripping proxy).
- You need cross-platform parity with team members on Windows — Tier 1 macOS-native options have no Windows analogue.

---

### Tier 2 — Single shared VM (OrbStack)

**Finding:** Best Docker-replacement developer experience on macOS at very low background resource cost. *Not* recommended for untrusted-code review.

**Evidence:** [evidence/macos-microvm-options.md](evidence/macos-microvm-options.md), [docs.orbstack.dev/architecture](https://docs.orbstack.dev/architecture)

**What OrbStack is:**
- "A lightweight Linux virtual machine with a shared kernel" — one VM, all containers + Linux machines coexist inside it.
- "<0.1% background CPU usage on Apple Silicon" and "<10 MB of disk space out of the box" per [orbstack.dev](https://orbstack.dev/).
- Custom virtual network stack with NAT (IPv4 + IPv6); VirtioFS for bind mounts.
- Rosetta-based x86 emulation on Apple Silicon for image compatibility.

**Why it's not the untrusted-code answer:**
- Single shared VM = single shared kernel. A kernel exploit from one container compromises all.
- Per [Infralovers test](https://www.infralovers.com/blog/2026-02-15-sandboxing-claude-code-macos/): "bidirectional filesystem sharing 'cannot currently be disabled' per-machine, creating data exposure risks."

**Decision triggers (when this is right):**
- You're already on Docker workflows and want to drop Docker Desktop's RAM cost.
- Threat model is "occasional Claude Code session on my own code" — same threat model as Tier 0, but you also want container ergonomics for unrelated workflows.

**Decision triggers (when this is NOT right):**
- You're reviewing untrusted code — the architecture is wrong for that threat.
- You want per-task disposable VMs — OrbStack's shared-VM model doesn't give you that primitive.

---

### Tier 3 — Per-agent purpose-built sandboxes (ClodPod, Matchlock, Docker Sandboxes)

**Finding:** The right tier for untrusted-code work and unattended autonomous runs. The strongest options also separate the agent's credentials from the long-lived host credentials.

**Evidence:** [evidence/macos-microvm-options.md](evidence/macos-microvm-options.md), [evidence/devcontainers-and-docker.md](evidence/devcontainers-and-docker.md), [evidence/network-egress-control.md](evidence/network-egress-control.md)

| Stack | Platform | Model | Distinguishing feature |
|---|---|---|---|
| **[ClodPod](https://github.com/webcoyote/clodpod)** | macOS only (Tart-based) | Per-invocation macOS VM | Can run macOS userland (Xcode); CoW APFS caching |
| **[Matchlock](https://virtuslab.com/blog/ai/matchlock-your-agents-bulletproof-cage)** | Linux primary; macOS exists | Per-invocation Firecracker microVM (Linux); deny-all networking | MITM proxy injects short-lived credentials so the agent never sees long-lived secrets |
| **[Docker Sandboxes](https://www.docker.com/products/docker-sandboxes/)** | Cross-platform | Per-sandbox microVM via native hypervisor | Strongest devx; lets agents build/run their own Docker containers inside the microVM |

**Key architectural facts:**
- All three give each agent invocation/session its own ephemeral VM that can be deleted and recreated cheaply.
- Docker Sandboxes use `Hypervisor.framework` on macOS, KVM on Linux, Windows Hypervisor Platform on Windows — same external API, native VMM under the hood per [Docker engineering blog](https://www.docker.com/blog/why-microvms-the-architecture-behind-docker-sandboxes/).
- Matchlock uniquely addresses the "Claude Code credential exfiltration" gap: an MITM proxy injects auth at the network boundary instead of mounting `~/.aws` or `~/.claude` into the sandbox.

**Resource cost reality check for Docker Sandboxes:**
- Docker Sandboxes still requires Docker Desktop running (the daemon you wanted to avoid).
- Per [Infralovers test](https://www.infralovers.com/blog/2026-02-15-sandboxing-claude-code-macos/): "Docker Sandboxes requires separate microVM instances per sandbox (cumulative RAM cost)."
- Plus the licensing surface — Docker Desktop is free for individuals/small orgs but paid for orgs >250 employees + >$10M revenue (Docker Business ≈ $21/user/month).
- **For a user explicitly avoiding Docker due to resource cost, Docker Sandboxes is not a fit regardless of its microVM advantages.** ClodPod (no Docker dependency) or Matchlock (no Docker dependency) are the right options in this tier.

**Decision triggers:**
- You're going to run `claude --dangerously-skip-permissions` (or the equivalent) on code you don't fully trust → Matchlock-style architecture (purpose-built, secret-stripping).
- You want per-agent macOS-guest VMs (Xcode, native macOS tools) → ClodPod / Tart.
- You want the strongest Docker-ergonomics + microVM combo and the resource cost is acceptable → Docker Sandboxes.

---

### Tier 4 — Matryoshka (VM + container + agent)

**Finding:** The 2026 frontier pattern. Defense-in-depth for hostile code; overkill for typical workflows.

**Evidence:** [evidence/macos-microvm-options.md](evidence/macos-microvm-options.md)

Per the [microvm-2026 survey](https://emirb.github.io/blog/microvm-2026/):

> "The most powerful pattern emerging in 2026 is nesting containers inside VMs: a host runs a VMM, the VMM runs a Linux kernel, the kernel runs a container runtime, the runtime runs user code."

The defense-in-depth stack is: Host OS + KVM/Hypervisor.framework → VMM (userspace, seccomp-jailed) → Guest VM (dedicated kernel, ephemeral) → Container Runtime → Untrusted code (agent).

On a single Mac, the **Apple Container model is structurally matryoshka already** — each container gets its own VM. Adding the Anthropic built-in sandbox *inside* the container would compose two layers. (Whether the Anthropic sandbox runs cleanly inside a microVM is documented for Linux via `enableWeakerNestedSandbox`; the security trade-off is explicitly weak.)

**Decision triggers:**
- You're running a service that handles arbitrary user-submitted code (CI for untrusted PRs, sandbox-as-a-service).
- For single-developer use, this tier is rarely necessary. Tier 1 + Tier 0 inside the container probably covers it.

---

### Permission model + auto mode (orthogonal to all tiers)

**Finding:** Auto mode and the permission system are independent of which tier you choose. They compose with everything above.

**Evidence:** [evidence/anthropic-built-in-sandbox.md](evidence/anthropic-built-in-sandbox.md)

The choice ladder Anthropic publishes:

1. **Default** — every action prompts.
2. **`acceptEdits` mode** — edits skip prompts; commands still prompt.
3. **Auto mode** — ML-classifier-filtered actions; safer than skip-permissions, recommended over it.
4. **`--dangerously-skip-permissions`** — turn everything off. Anthropic discourages this in most cases.

**These compose with sandboxing as follows:**
- Tier 0 (built-in sandbox) + auto-allow on sandboxable commands ≈ "fewer prompts, kernel-enforced safety net."
- Any tier + auto mode ≈ "ML-filtered actions, even within what the OS sandbox allows."
- Any tier + `--dangerously-skip-permissions` ≈ "turn off Claude's filtering entirely; rely entirely on the sandbox/VM."

**Implication:** The `--dangerously-skip-permissions` flag is *not* "unsafe" if the underlying sandbox is strong enough. Trail of Bits' devcontainer and Matchlock are explicitly built to make `--dangerously-skip-permissions` safe by isolating the blast radius.

---

### Network egress control (the Squid replacement options)

**Finding:** Multiple Squid-free options exist with much less operational overhead. The lightest is built into Anthropic's sandbox.

**Evidence:** [evidence/network-egress-control.md](evidence/network-egress-control.md)

| Approach | Process count | Sudo needed | Body inspection |
|---|---|---|---|
| Anthropic built-in sandbox proxy | 0 extra | No | No |
| macOS `pf` + tiny proxy (`tinyproxy`/`mitmproxy`) | 1 (proxy) | Yes (one-time pf rules) | Possible |
| Devcontainer + iptables (Anthropic's `init-firewall.sh` template) | Docker daemon + iptables | No (inside container) | No |
| Matchlock | microVM + proxy | No (Linux); macOS varies | Yes (for secret injection) |
| **Docker + Squid (user's prior setup)** | Docker daemon + Squid | No | Yes |

**Concrete recommendation for the user:** The Anthropic built-in sandbox's domain allowlist gives the same outcome as Squid's `acl dstdomain` rules without any of the operational overhead of running Squid. If domain inspection is enough (and it is for most threat models), drop Squid entirely. If you need request-body inspection (rare for Claude Code workloads), `mitmproxy` + `pf` is lighter than Docker + Squid.

---

### Threat models + bypass research

**Finding:** Three threat classes drive three different tier choices. Documented bypasses exist at the container layer; hypervisor-class bypasses are categorically rarer but not zero.

**Evidence:** [evidence/threat-models-and-vulnerabilities.md](evidence/threat-models-and-vulnerabilities.md)

| Threat | Right tier |
|---|---|
| Mistake / approval fatigue (you click through prompts) | Tier 0 + auto-allow |
| Prompt injection (Claude tricked by content) | Tier 0 + auto mode |
| Malicious code / supply chain | Tier 1+ (microVM); Tier 3 if hostile |

**Documented escapes (calibrating trust):**
- **March 2026:** Falco maintainer Leonardo Di Donato demonstrated Claude Code requesting `dangerouslyDisableSandbox` itself when blocked — agent reasoning routes around userspace barriers it can perceive ([microvm-2026 survey](https://emirb.github.io/blog/microvm-2026/)).
- **Anthropic devcontainer caveat:** "Devcontainers don't prevent a malicious project from exfiltrating anything accessible in the devcontainer including Claude Code credentials." This is the most important caveat in the entire space and *applies to microVMs too* unless you separately strip credentials at the boundary.
- **Container CVE history (2024-2025):** Leaky Vessels (CVE-2024-21626), NVIDIAScape (CVE-2025-23266, CVSS 9.0), runc masked-path race (CVE-2025-31133), kernel packet socket UAF (CVE-2025-38617), Docker Desktop Engine API exposure (CVE-2025-9074, CVSS 9.3). Containers as a security boundary against malicious code have a poor track record.

**Implication:** "Safe" requires naming the threat. The right answer for `claude --dangerously-skip-permissions` on your own greenfield project is different from the right answer for `claude` on a strange repo from a stranger.

---

## Recommendation Matrix

Each row is a use case. Pick the row that matches you, then pick the recommended stack.

| Use case | Recommended stack | Why |
|---|---|---|
| **Daily Claude Code on your own code; goal is fewer prompts** | Anthropic built-in sandbox + auto-allow | Lightest sufficient option; zero extra processes. |
| **You're worried about prompt injection from web fetches** | Built-in sandbox + auto mode | ML-classifier layer adds prompt-injection defense. |
| **Unattended runs on your own trusted code (overnight, while AFK)** | Built-in sandbox with `allowUnsandboxedCommands: false` + auto mode | Disable the escape hatch the agent might try to use. |
| **Reviewing a repo from a partner / OSS PR you don't fully trust** | **Apple Container** (macOS 26+) or **Lima `vz`** (macOS 13+); install Claude Code inside the VM, clone repo inside | Real kernel boundary; lighter than Docker. |
| **Reviewing a repo you actively suspect is hostile** | **Matchlock** for the secret-injection model; or per-task VM (Lima/Apple Container) with: deny-all network, no host fs mounts, separate Claude Code account inside | Container CVE history makes containers insufficient; credentials must not enter the sandbox. |
| **You want a Docker-CLI replacement that isn't Docker Desktop** | **OrbStack** (trusted code) or **Apple Container** (untrusted code) | OrbStack is lighter on background CPU; Apple Container has the per-container VM boundary. |
| **You need the agent to build and run Docker containers itself** | Docker Sandboxes (if resource cost acceptable) or Apple Container (each container is its own VM, supports nested workloads better than namespaces) | The "agent runs Docker" use case is what Docker Sandboxes was specifically built for. |
| **You want max isolation and resource cost is irrelevant** | Matryoshka: per-task Lima `vz` VM + container inside + Anthropic built-in sandbox at the innermost layer | Layered defense; each layer fails independently. |

**Note on the user's "Docker is too heavy" constraint:** For every row above except "you need the agent to build/run Docker," the recommended stack does not require Docker Desktop. Apple Container, Lima vz/krunkit, OrbStack, and ClodPod all use Apple's hypervisor frameworks directly without Docker Desktop's 2-4 GB resident daemon.

---

## Limitations & Open Questions

### Dimensions not fully covered

- **Apple Container's exact network model** (firewall config, default allowlist) is documented at a high level but I did not exercise the source. Production use should verify.
- **Matchlock on macOS** — the writeup describes Linux/Firecracker primarily; the macOS implementation surface (which VMM it wraps) was not reachable in this recon. Verify before adoption on macOS.
- **Per-syscall overhead** of Anthropic's built-in sandbox in real Claude Code workloads has no published benchmark.

### Out of scope (per rubric)

- CI/server-side sandboxing (production sandbox-as-a-service: E2B, Vercel Sandbox, Fly.io Sprites, Ona — referenced as comparison points but not evaluated in detail).
- Sandboxing of other agent CLIs (Cursor Agent, OpenAI Codex CLI, Gemini, Cline, Aider) — many of the same primitives apply but were not exhaustively mapped.
- Step-by-step install tutorials — pointers go to primary docs.
- Full network firewall product comparison.

### Open questions worth follow-up research

- An end-to-end benchmark across Tier 0 / 1 / 2 / 3 with the same Claude Code workload (cold-start + sustained agent loop, measure resident RAM + CPU + completion time) does not exist publicly.
- Whether the Anthropic built-in sandbox composes cleanly with running Claude Code *inside* a Lima/Apple Container VM (the matryoshka pattern) is documented partially for Linux but not validated for macOS.
- The Anthropic-side response to the March 2026 Falco escape demonstration — would clarify the future direction of the escape-hatch design.

---

## References

### Evidence Files

- [evidence/anthropic-built-in-sandbox.md](evidence/anthropic-built-in-sandbox.md) — Tier 0 deep dive, including auto mode and the escape hatch
- [evidence/macos-microvm-options.md](evidence/macos-microvm-options.md) — Tier 1-3 macOS stacks: Apple Container, Lima vz/krunkit, OrbStack, ClodPod, Tart
- [evidence/devcontainers-and-docker.md](evidence/devcontainers-and-docker.md) — Anthropic's official devcontainer, Trail of Bits hardened variant, Docker Sandboxes; container-CVE history
- [evidence/threat-models-and-vulnerabilities.md](evidence/threat-models-and-vulnerabilities.md) — Three-class threat taxonomy, March 2026 escape demo, OrbStack untrusted-code limitation
- [evidence/network-egress-control.md](evidence/network-egress-control.md) — Squid-free egress alternatives compared
- [evidence/resource-overhead-tiers.md](evidence/resource-overhead-tiers.md) — Quantified RAM/CPU/disk/boot-time across all tiers

### Primary External Sources

**Anthropic official:**
- [Sandboxing — Claude Code Docs](https://code.claude.com/docs/en/sandboxing)
- [Making Claude Code more secure and autonomous — Anthropic Engineering](https://www.anthropic.com/engineering/claude-code-sandboxing)
- [Claude Code auto mode — Anthropic Engineering](https://www.anthropic.com/engineering/claude-code-auto-mode)
- [Choose a permission mode — Claude Code Docs](https://code.claude.com/docs/en/permission-modes)
- [Development containers — Claude Code Docs](https://code.claude.com/docs/en/devcontainer)

**microVM stacks (macOS-native):**
- [Apple Container](https://github.com/apple/container)
- [OrbStack architecture docs](https://docs.orbstack.dev/architecture)
- [Lima v2.0 announcement (CNCF)](https://www.cncf.io/blog/2025/12/11/lima-v2-0-new-features-for-secure-ai-workflows/)
- [Lima krunkit driver docs](https://lima-vm.io/docs/config/vmtype/krunkit/)
- [ClodPod (Tart-based)](https://github.com/webcoyote/clodpod)

**Purpose-built agent sandboxes:**
- [Matchlock (VirtusLab)](https://virtuslab.com/blog/ai/matchlock-your-agents-bulletproof-cage)
- [Docker Sandboxes blog](https://www.docker.com/blog/docker-sandboxes-run-claude-code-and-other-coding-agents-unsupervised-but-safely/)
- [Why MicroVMs: Architecture behind Docker Sandboxes](https://www.docker.com/blog/why-microvms-the-architecture-behind-docker-sandboxes/)
- [Trail of Bits hardened devcontainer](https://github.com/trailofbits/claude-code-devcontainer)

**Surveys and hands-on:**
- [Your Container Is Not a Sandbox: The State of MicroVM Isolation in 2026](https://emirb.github.io/blog/microvm-2026/)
- [Sandboxing Claude Code on macOS: What I Actually Found (Infralovers, Feb 2026)](https://www.infralovers.com/blog/2026-02-15-sandboxing-claude-code-macos/)
- [Sandbox Claude Code on Mac Without Docker Overhead (ses.box)](https://www.ses.box/posts/sandbox-claude-apple-container)

### Related Research (in this repo)

- [reports/claude-code-worktree-git-isolation/REPORT.md](../claude-code-worktree-git-isolation/REPORT.md) — git-level (not OS-level) isolation via worktrees; complementary to this report
- [reports/worktree-orchestration-landscape/REPORT.md](../worktree-orchestration-landscape/REPORT.md) — parallel-agent orchestration via worktrees; complementary

---

## Deep Dive: Apple Container as the macOS Tahoe Answer (Follow-up, 2026-04-22)

This section extends the original report with a deeper investigation of Apple Container — the recommended Tier 1 option for macOS 26 users. Full evidence: [evidence/apple-container-deep-dive.md](evidence/apple-container-deep-dive.md).

### Architecture (confirmed): VM-per-container via Virtualization.framework + Kata Containers

Per [Anil Madhavapeddy's deep dive](https://anil.recoil.org/notes/apple-containerisation), Apple Container is a "VM-per-container model powered by the macOS Virtualization framework and Kata Containers." Each container gets its own Linux 6.12.28 kernel. The userspace init is a custom Swift `vminitd` daemon — the only filesystem binary by default — and the OCI image extraction uses a Swift-implemented ext4 filesystem layer.

The Kata heritage matters: the security properties are inherited from a multi-year-mature OSS isolation stack rather than something Apple just rolled.

### Performance reality check

- **Cold start:** ~730ms for Alpine ([Madhavapeddy](https://anil.recoil.org/notes/apple-containerisation)). Acceptable for daily use.
- **Idle resident:** Vijay Kodam's 3-container monitoring stack used ~216 MB combined at idle.
- **Image unpacking is slow** for many-file images: 10 minutes for an OPAM image vs Docker's few seconds. Build a minimal Claude Code image and reuse it.

### Networking model — different from Docker in load-bearing ways

> "Apple Containers runs each container as an isolated microVM with no shared DNS or container network." — [Vijay Kodam, 2026](https://vijay.eu/co-authored/claude-code-monitoring-apple-containers/)

- Each container gets its own IP address.
- No bridge network. No `docker network` equivalent.
- Container ↔ host gateway via `192.168.64.1`.
- Outbound NAT works fine for Claude API access.

### THE network-restriction gap (and why your prior Docker+Squid setup informs the workaround choice)

This is the single most important operational finding from the deep dive:

**The Anthropic devcontainer's `init-firewall.sh` script does NOT work as-is in Apple Container.** Per [Discussion #719](https://github.com/apple/container/discussions/719):

> "Anthropic's Claude Code reference implementation requiring `--cap-add=NET_ADMIN` and `--cap-add=NET_RAW`, but `container run` doesn't support these flags."

The community has explored four workarounds:

| Workaround | Notes | Fit for "Docker too heavy" constraint? |
|---|---|---|
| Dual-homed Squid proxy | jamesmacaulay's pattern in #719; same architecture you tried before | ❌ Same heaviness you rejected |
| Guest-side iptables baked into the image | Works but root inside the container can flush rules | ✅ Lightweight; trades isolation for convenience |
| Host-side `pf` rules scoped to vmnet | Theoretically clean; no concrete recipe surfaced | ✅ Lightweight if it works |
| **Anthropic built-in `/sandbox` *inside* the container** | Untested matryoshka pattern; theoretically the cleanest answer | ✅ Lightest; uses Anthropic's own proxy |

**Recommendation given your constraint:** Skip the guest-iptables path (only as good as the agent's restraint). Try the matryoshka pattern first — install `bubblewrap` + `socat` in the container image, run Claude Code inside the container with `/sandbox` enabled. Anthropic's built-in proxy then enforces the domain allowlist at the bash subprocess level. If that doesn't compose cleanly (the `enableWeakerNestedSandbox` mode caveat applies), fall back to host-side `pf` rules.

### Concrete starter recipe

The [CaptainMcCrank/SandboxedClaudeCode](https://github.com/CaptainMcCrank/SandboxedClaudeCode) repo is the most complete community Containerfile for the Apple Container path. Its mount strategy:

| Host path | Container path | Access |
|---|---|---|
| `$PWD` | `/workspace` | rw |
| `~/.claude` | `/home/claude/.claude` | rw |
| `~/.npm` | `/home/claude/.npm` | rw |
| `~/.gitconfig` | `/home/claude/.gitconfig` | ro |
| `~/.ssh/known_hosts` | `/home/claude/.ssh/known_hosts` | ro |

Plus SSH agent forwarding via `$SSH_AUTH_SOCK` mount. No private keys mounted; the agent socket is accessible from inside.

**See [evidence/apple-container-deep-dive.md § Concrete recipe](evidence/apple-container-deep-dive.md) for a full sketch including the matryoshka layer + unattended-run configuration.**

### Critical operational caveats

1. **Pre-1.0 stability:** Apple's own README warns minor versions may break things. Pin a version, test before upgrading.
2. **No `container run` `--cap-add`** as of v0.9 → blocks the standard Anthropic devcontainer firewall recipe directly.
3. **`container build` networking bug** in v0.9 — HTTP fetches during builds get 403s. Workaround: build elsewhere, push to a local registry, pull into Apple Container.
4. **No source recommends unattended use** — this is an operational frontier. Vijay explicitly says "not suitable for production use." For your unattended scenario, plan on:
   - Auto-start across reboot (not built in; would need a launchd plist)
   - Reliable network restriction (per the gap above)
   - Separate Claude Code account inside the container (the credential-exfiltration caveat applies here too)
   - External monitoring for stuck sessions
5. **Credentials caveat:** Mounting `~/.claude` read-write into the container means the Anthropic devcontainer caveat applies in full — a malicious project inside the container can exfiltrate the Claude credentials over any allowed network channel. For high-assurance work, use a separate Claude Code account inside the sandbox.

### What I'd actually do (synthesized recommendation for the user)

Given you're on macOS 26 (Darwin 25), Apple Silicon (implied by macOS 26 requirement), and you've explicitly rejected Docker on resource grounds:

1. **First** — try Tier 0 alone: enable Anthropic's `/sandbox` directly on your host, set `allowUnsandboxedCommands: false`, set up auto mode. For trusted code, this likely covers your need with zero infrastructure.
2. **If you actually need a kernel boundary** (untrusted-code review, multi-tenant agent work, paranoid threat model) — Apple Container with the CaptainMcCrank starter Containerfile is the right Tier 1 choice for you on this OS. Add the matryoshka built-in-`/sandbox`-inside-container layer to get network restriction without Squid.
3. **For unattended runs specifically** — accept that Apple Container is operationally rough for this. The cleanest unattended path today is still: trusted code + Anthropic built-in sandbox + auto mode + `allowUnsandboxedCommands: false`, all on your host machine, with Tier 0 as the only isolation layer. Promote to Apple Container when the operational ergonomics catch up (likely v1.0+).

### Open questions worth investigating next

- **Matryoshka validation:** Does the Anthropic built-in `/sandbox` actually work inside an Apple Container microVM? Specifically, does bubblewrap's user-namespace setup succeed without `--cap-add`?
- **Host-side `pf` recipe:** Is there a clean way to restrict an Apple Container's vmnet bridge to specific domains via `pf` rules + `dnsmasq`?
- **Apple Container v1.0:** When does the project hit 1.0? Will it expose `--cap-add` or an equivalent capability flag?
