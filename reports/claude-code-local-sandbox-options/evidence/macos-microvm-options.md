# Evidence: macOS microVM stacks for Claude Code isolation

**Dimensions:** D5 (macOS-specific options), D9 (microVMs)
**Date:** 2026-04-22
**Sources:** Apple Container project docs, OrbStack docs, Lima docs + CNCF blog, ClodPod README, Tart docs, hands-on test write-ups

---

## Key sources

- [Apple Container framework](https://github.com/apple/container) (referenced via [ses.box hands-on guide](https://www.ses.box/posts/sandbox-claude-apple-container))
- [OrbStack architecture docs](https://docs.orbstack.dev/architecture)
- [Lima v2.0 release announcement (CNCF blog)](https://www.cncf.io/blog/2025/12/11/lima-v2-0-new-features-for-secure-ai-workflows/)
- [Krunkit VM type for Lima](https://lima-vm.io/docs/config/vmtype/krunkit/)
- [ClodPod (Tart-based macOS VM wrapper for AI agents)](https://github.com/webcoyote/clodpod)
- [Your Container Is Not a Sandbox: The State of MicroVM Isolation in 2026](https://emirb.github.io/blog/microvm-2026/)
- [Sandboxing Claude Code on macOS: What I Actually Found](https://www.infralovers.com/blog/2026-02-15-sandboxing-claude-code-macos/)

---

## Landscape: what microVM stacks exist on macOS in 2026

| Stack | VM tech | Per-agent VMs? | macOS req | Status | Best for |
|---|---|---|---|---|---|
| **Anthropic built-in sandbox** | Kernel-level Seatbelt (no VM) | N/A — process-level | macOS 13+ | Production | Lightest tier; first thing to try |
| **Apple Container** | `Virtualization.framework` (microVM per container) | Yes — one VM per container | macOS 26 (Tahoe) + Apple Silicon | v0.9.0 (Feb 2026), pre-1.0 | "Thinnest possible sandbox" for daily use |
| **OrbStack** | Custom on top of `Virtualization.framework` | No — single shared Linux VM, all containers in it | macOS 13+, Apple Silicon optimal | Production, commercial | Daily Docker/K8s replacement; not for untrusted code per Infralovers |
| **Lima + `vz` driver** | `Virtualization.framework` | One VM per Lima instance | macOS 13+ | CNCF Incubating, v2.0 (Nov 2025) | Open-source devcontainer alternative; explicit AI-agent hardening features |
| **Lima + `krunkit` driver** | `libkrun` (HVF on macOS) | One VM per Lima instance | macOS 14+, Apple Silicon | v2.0 (Nov 2025) | When you need GPU passthrough |
| **ClodPod / Tart** | Tart (`Virtualization.framework`) | Yes — one VM per agent invocation | macOS 13+, Apple Silicon | Active OSS | macOS-guest VMs (you can run Xcode); aggressive VM-per-session model |
| **Docker Sandboxes** | `Virtualization.framework` (microVM per sandbox) | Yes — one microVM per sandbox | macOS 13+ | Production (Docker Inc.) | Strongest devx if you already use Docker |
| **Matchlock** | Firecracker on Linux; macOS path uses host hypervisor | Yes — ephemeral microVM per agent | macOS support exists but Linux is primary | Active OSS (VirtusLab) | Purpose-built for `claude --dangerously-skip-permissions` |

---

## Findings

### Finding: Apple Container is the closest "thin microVM-per-container" model on macOS

**Confidence:** CONFIRMED
**Evidence:** [ses.box guide](https://www.ses.box/posts/sandbox-claude-apple-container), [Apple Container repo](https://github.com/apple/container)

> "Apple's open-source tool for running Linux containers using lightweight virtual machines, written in Swift and optimized for Apple Silicon."

> "each container gets its own micro-VM" — distinguishes it from Docker which "shares a single Linux VM."

**Status:** "Still at v0.9.0 (February 2026). Still pre-1.0, but the runtime is solid."

**Resource overhead vs Docker Desktop (from the same hands-on guide):**

| Metric | Docker Desktop | Apple Container |
|---|---|---|
| Startup | ~10–30s | Sub-second |
| Idle RAM | 2–4 GB | "No daemon" |

> "Docker eats 2–4 GB of RAM idle... Apple Container: No daemon eating RAM in the background."

**Author's verdict for Claude Code:**

> "If you use Claude Code for daily tasks — not heavy development, just the kind of work where you want to say 'go do it' without babysitting permissions — and you're on a Mac with Apple Silicon running macOS 26+, this is the thinnest possible sandbox."

**Known issue:** "`container build` has a known networking bug — HTTP requests during builds get 403 errors." Workaround: build elsewhere, push to a local registry, pull into Apple Container.

**Implications:**
- Apple Container = minimum viable microVM model on macOS. Microsoft of macOS/sandboxing.
- Pre-1.0 — production use should be considered cautiously.
- Requires macOS 26 (Tahoe) — recent OS, Apple Silicon only.
- Standard pattern: bind-mount workspace + `~/.claude` (creds) + read-only `~/Downloads`; everything else is invisible.

---

### Finding: OrbStack uses a single shared Linux VM with VirtioFS — fast for dev, weak for untrusted code

**Confidence:** CONFIRMED
**Evidence:** [OrbStack architecture docs](https://docs.orbstack.dev/architecture), [Infralovers test](https://www.infralovers.com/blog/2026-02-15-sandboxing-claude-code-macos/)

OrbStack's core architecture:

> "a lightweight Linux virtual machine with a shared kernel" — "A Docker engine runs alongside Linux machines in the OrbStack VM."

Resource claims (from [orbstack.dev landing page](https://orbstack.dev/)):

> "less than 0.1% background CPU usage on Apple Silicon"
> "Less than 10 MB of disk space is used out of the box"

**Critical caveat for untrusted code (from Infralovers hands-on test):**

> "OrbStack [is] insufficient for untrusted code. The author noted that bidirectional filesystem sharing 'cannot currently be disabled' per-machine, creating data exposure risks."

**Performance benchmark (M4 Pro, `npm install`):**
- Docker Desktop (VZ + sync): 3.88s
- OrbStack: 4.22s
- Lima: 8.99s
- Native Linux reference: 5.29s

**Implications:**
- OrbStack is the *daily-driver Docker replacement* tier — not the "I want to sandbox an untrusted agent" tier.
- All containers share the OrbStack VM kernel — a kernel exploit from one container compromises all.
- For Claude Code, OrbStack is reasonable when the threat is "Claude makes a mistake" but inadequate when the threat is "this repo has a malicious dependency."

---

### Finding: Lima v2.0 added explicit AI-agent hardening — MCP server + per-VM isolation

**Confidence:** CONFIRMED
**Evidence:** [CNCF Lima v2.0 announcement](https://www.cncf.io/blog/2025/12/11/lima-v2-0-new-features-for-secure-ai-workflows/), [Lima release v2.0.0 GitHub notes](https://github.com/lima-vm/lima/releases/tag/v2.0.0)

> "One of the most notable emerging use cases is to run an AI coding agent inside a VM in order to isolate the agent from direct access to host files and commands. This setup ensures that even if an AI agent is deceived by malicious instructions searched from the Internet (e.g., fake package installations), any potential damage is confined within the VM or limited to files specified to be mounted from the host."

> "Lima now provides Model Context Protocol (MCP) tools for reading, writing, and executing local files using a VM sandbox."

**MCP tools exposed:** `glob`, `list_directory`, `read_file`, `run_shell_command`, `search_file_content`, `write_file` — these intercept the agent's file operations and route them through the VM boundary.

> "Lima's MCP tools are inspired by Google Gemini CLI's built-in tools, and can be used as a secure alternative for those built-in tools."

**Plugin architecture:** Lima v2.0 introduced pluggable VM drivers. Stock options include `vz` (Apple Virtualization.framework), `qemu`, and `krunkit` (libkrun). VM drivers are now hot-swappable.

**Status:** Lima is CNCF Incubating, 20K+ GitHub stars, v2.0 released Nov 2025.

**Implications:**
- Lima is explicitly positioning as the open-source AI-agent VM substrate.
- The MCP server approach is interesting: instead of running the agent inside the VM, you can leave the agent on the host and proxy its file/command tool calls through the VM. Nice for MCP-aware agents (Claude Code is one).
- For Claude Code specifically, two patterns work: (a) install Claude Code inside a Lima VM and run from there, or (b) use Lima's MCP server and have Claude Code on host but tool calls go through VM.

---

### Finding: krunkit (libkrun) is the lightest VMM on macOS but trades features for footprint

**Confidence:** CONFIRMED
**Evidence:** [Lima krunkit docs](https://lima-vm.io/docs/config/vmtype/krunkit/), [microvm-2026 survey](https://emirb.github.io/blog/microvm-2026/)

> "Krunkit builds on libkrun, a library that embeds a VMM so apps can launch processes in a hardware-isolated VM (HVF on macOS, KVM on Linux)."

**Requirements:** Lima >= 2.0, macOS >= 14 (Sonoma+), Apple Silicon (arm64).

**libkrun characteristics from microvm-2026:**

> "sub-200ms startup"
> "transparent socket impersonation (no TAP devices needed)"
> "paravirtualized GPU support on macOS"

**Standout feature:** GPU passthrough via Mesa Venus driver — useful for ML workloads inside the VM, not load-bearing for typical Claude Code work.

**Implications:**
- For pure isolation (no GPU need), `vz` driver gives you everything you need with macOS-native tooling. krunkit shines if you want GPU.
- libkrun's "no TAP device" model means simpler networking setup than traditional QEMU-style microVMs.
- HVF (Hypervisor.framework) is Apple's lower-level virtualization API; Virtualization.framework is the higher-level one. krunkit uses HVF directly; OrbStack/Apple Container/Lima vz use Virtualization.framework.

---

### Finding: Tart-based ClodPod runs each agent in its own macOS VM — ergonomic per-session disposability

**Confidence:** CONFIRMED
**Evidence:** [github.com/webcoyote/clodpod](https://github.com/webcoyote/clodpod)

> "creates a macOS virtual machine sandbox configured to run applications like Claude Code, Open AI Codex, Google Gemini, and Cursor Agent."

VM technology: **Tart**, which provides "macOS and Linux VMs on Apple Silicon" using Apple Virtualization.framework.

> "a three-layer APFS CoW caching system" for efficient VM management.

**Resource model:** "By default, ClodPod allocates 5/8 of host RAM" across VMs; per-instance memory configurable.

**Usage pattern:**
```
clod claude        # Run claude in a VM
clod codex         # Run codex
clod shell         # Drop into shell
clod create myproject --dir project:/path/to/project   # named per-project VM
```

**Author's stated reason for VM-per-agent vs container:**

> "experimented with running AI agents inside docker and podman containers (i.e. in Linux), but as my goal ultimate is to build apps using Xcode, I wanted to stick with OSX."

**Implications:**
- ClodPod is the "VM-per-agent-invocation" pattern — like Docker Sandboxes but native macOS, no Docker dependency.
- The macOS-guest capability is unique — most options here boot Linux. If your work needs macOS userland (Xcode, native macOS tools), ClodPod or Tart-direct is the only path.
- 5/8 of RAM as a default is *aggressive* — fine on a 64GB Mac, painful on a 16GB Mac.

---

### Finding: Docker Sandboxes use Apple Virtualization.framework on macOS — strong devx but requires Docker

**Confidence:** CONFIRMED
**Evidence:** [docker.com/blog/why-microvms](https://www.docker.com/blog/why-microvms-the-architecture-behind-docker-sandboxes/), [Infralovers test](https://www.infralovers.com/blog/2026-02-15-sandboxing-claude-code-macos/)

VMM by platform:
> "macOS: Apple's Hypervisor.framework. Linux: Linux KVM. Windows: Windows Hypervisor Platform."

> "Docker Sandboxes give each agent its own Docker daemon running inside a microVM, fully isolated by the VM boundary."

**Why microVMs over containers (Docker's framing):**

> "Agents need a real Docker environment to do development work, and containers alone don't give you that cleanly. For an autonomous agent that needs to build and run its own Docker containers, which coding agents routinely do, you hit Docker-in-Docker, which requires elevated privileges that undermine the isolation you set up in the first place."

**Disposability model:**

> "Disposable by design. If an agent goes off track, delete the sandbox and start fresh in seconds. There is no state to clean up and nothing to roll back on your host."

(Docker does NOT publish the snapshot/cow implementation details.)

**Infralovers verdict:** Docker Sandboxes "as current frontrunner for interactive development" — but with caveats:

> "Docker Desktop is free only for organizations with fewer than 250 employees AND less than $10M revenue... at ~$21/user/month for Docker Business, a 250-person engineering org is looking at roughly $63K/year."

**Implications for the user (Docker = too heavy):**
- Docker Sandboxes still requires Docker Desktop running. Even though each sandbox is a microVM, Docker Desktop itself is the 2-4GB-RAM daemon you wanted to avoid.
- This option is the strongest *if you're already paying the Docker Desktop overhead*. If you're moving away from Docker because of resource cost, this isn't a fit.

---

### Finding: Matchlock is purpose-built for `claude --dangerously-skip-permissions` — Firecracker on Linux, mixed macOS support

**Confidence:** CONFIRMED (Linux); UNCERTAIN (macOS specifics)
**Evidence:** [VirtusLab Matchlock writeup](https://virtuslab.com/blog/ai/matchlock-your-agents-bulletproof-cage) (web search summary; direct fetch returned empty)

From the search result summary:

> "On Linux, Matchlock launches Firecracker microVMs — the same VMM that powers AWS Lambda. In non-privileged mode, it drops capabilities like SYS_PTRACE and SYS_ADMIN, sets no_new_privs, and installs a seccomp-BPF filter that blocks dangerous syscalls."

> "The workspace is shared via FUSE over vsock, so file access feels native without actually copying files into the VM."

**Network model:** "network allowlisting capabilities to control what external connections are permitted" plus "secret injection via MITM proxy."

**Stated use case:**

> "If your use case is 'I want to run claude --dangerously-skip-permissions safely on my MacBook,' Matchlock is arguably the best answer."

**Distribution:** Homebrew installable, runs locally, no SaaS, no 24-hour limits.

**Implications:**
- Matchlock is the most aggressive purpose-built option. The MITM proxy for secret injection is novel — agent gets short-lived credentials, never the long-lived ones.
- macOS support is claimed but the underlying Firecracker is Linux-only. On macOS the implementation must wrap a different VMM (likely Apple's Hypervisor.framework via libkrun or similar). Worth verifying before adoption.

**Gap:** The original blog post fetch returned empty content — could not extract the macOS architecture detail directly. This is a verification gap; needs source code review before depending on it.

---

### Finding: The "matryoshka" pattern is the 2026 frontier — VM + container + agent

**Confidence:** CONFIRMED
**Evidence:** [microvm-2026 survey](https://emirb.github.io/blog/microvm-2026/)

> "The most powerful pattern emerging in 2026 is nesting containers inside VMs: a host runs a VMM, the VMM runs a Linux kernel, the kernel runs a container runtime, the runtime runs user code."

Defense-in-depth stack:
1. Host OS & KVM (bare metal, minimal packages, hardened)
2. VMM (userspace Rust, 83-106K lines, seccomp-jailed)
3. Guest VM (dedicated kernel, ephemeral)
4. Container Runtime (Podman/OCI images)
5. Untrusted Code (AI agent output)

> "Each layer trusts the layer below it and nothing else."

**Implications for a single-developer Mac setup:**
- Matryoshka is overkill for trusted-code-with-fewer-prompts use cases.
- For high-stakes untrusted-code review, this pattern is what enterprise platforms (E2B, Vercel Sandbox, Fly.io Sprites, Ona) ship.
- On a single Mac, Apple Container *is* the matryoshka pattern: each container gets its own VM, and you can run the agent's tools inside the container.

---

## Negative searches

- Searched for OrbStack microVM-per-container mode → not found; OrbStack confirmed as single-shared-VM design.
- Searched for Apple's official guidance on running AI agents in Apple Container → no first-party Anthropic-equivalent guidance from Apple. Documentation is community-driven.
- Searched for benchmark of Lima `vz` vs Apple Container head-to-head for Claude Code workloads → not found; would need to run own benchmark.

## Gaps / follow-ups

- Matchlock's macOS implementation specifics are not captured here — need to read source or find a primary writeup.
- No published comparative benchmark of Apple Container vs Lima `vz` vs ClodPod for the specific Claude Code workload (cold-start + sustained agent loop). Would be useful to run.
- The Anthropic built-in sandbox composes with these microVMs — running `claude` *inside* an Apple Container while also enabling `/sandbox` is layered defense. Whether Anthropic's sandbox enables inside a microVM is not explicitly documented (the Linux `enableWeakerNestedSandbox` mode hints that nested execution is non-trivial).
