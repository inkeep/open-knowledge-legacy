# Evidence: Devcontainers + Docker (the "heavy reference" tier)

**Dimensions:** D3 (Containerization)
**Date:** 2026-04-22
**Sources:** Anthropic official devcontainer docs, Trail of Bits hardened devcontainer, Docker Sandboxes blog, archived community projects

---

## Key sources

- [Development containers — Claude Code Docs](https://code.claude.com/docs/en/devcontainer) — official Anthropic devcontainer
- [trailofbits/claude-code-devcontainer](https://github.com/trailofbits/claude-code-devcontainer) — hardened variant for security audits
- [Docker Sandboxes for Claude Code](https://www.docker.com/products/docker-sandboxes/) — Docker's microVM offering
- [textcortex/claude-code-sandbox (archived)](https://github.com/textcortex/claude-code-sandbox) — early community PoC

---

## Findings

### Finding: Anthropic's official devcontainer ships a firewall init script with a domain allowlist

**Confidence:** CONFIRMED
**Evidence:** [code.claude.com/docs/en/devcontainer](https://code.claude.com/docs/en/devcontainer)

> "The container's enhanced security measures (isolation and firewall rules) allow you to run `claude --dangerously-skip-permissions` to bypass permission prompts for unattended operation."

Components of the official setup:
- `.devcontainer/devcontainer.json` — controls container settings, extensions, mounts
- `.devcontainer/Dockerfile` — Node 20 base + dev tools (git, ZSH, fzf)
- `.devcontainer/init-firewall.sh` — establishes network rules

Firewall behavior:
> "Precise access control: Restricts outbound connections to whitelisted domains only (npm registry, GitHub, Claude API, etc.). Allowed outbound connections: The firewall permits outbound DNS and SSH connections. Default-deny policy: Blocks all other external network access. Startup verification: Validates firewall rules when the container initializes."

**Critical caveat from Anthropic itself:**

> "While the devcontainer provides substantial protections, no system is completely immune to all attacks. When executed with `--dangerously-skip-permissions`, devcontainers don't prevent a malicious project from exfiltrating anything accessible in the devcontainer including Claude Code credentials. We recommend only using devcontainers when developing with trusted repositories. Always maintain good security practices and monitor Claude's activities."

**Implications:**
- The official devcontainer is the canonical "containerization for Claude Code" answer.
- The firewall is the load-bearing security feature — without it, isolation is moot.
- "Trusted repositories only" means: a devcontainer is NOT sufficient for "I just got sent a strange repo, let me let Claude take a look at it."

---

### Finding: Trail of Bits hardened the official devcontainer specifically for untrusted code review

**Confidence:** CONFIRMED
**Evidence:** [github.com/trailofbits/claude-code-devcontainer](https://github.com/trailofbits/claude-code-devcontainer)

Stated purpose:

> "Built at Trail of Bits for security audit workflows."

Use cases:

> "Security audits: Review client code without risking your host"
> "Untrusted repositories: Explore unknown codebases safely"

Core hardening:

> "Running Claude with `bypassPermissions` on your host machine is risky — it can execute any command without confirmation. This devcontainer provides filesystem isolation so you get the productivity benefits of unrestricted Claude without risking your host system."

Threat model:

> "The primary threat this project addresses is Claude Code running arbitrary commands on your host machine. When `bypassPermissions` is enabled, Claude executes shell commands, installs packages, and modifies files without confirmation. On a host machine this means it can modify your shell config, `rm -rf` outside the project directory, or abuse locally stored credentials."

Documented coverage gaps (what is NOT sandboxed):

> "This devcontainer provides filesystem isolation but not complete sandboxing. Not sandboxed: Network (full outbound by default), git identity (`~/.gitconfig` mounted read-only), SSH agent (socket forwarded, keys stay on host), Docker socket (not mounted by default)."

Optional add-on: iptables-based network isolation rules for higher-threat work.

**Implications:**
- The Trail of Bits variant is a known-good starting point for untrusted-code review on Linux/Docker.
- Even this hardened variant defaults to full outbound network — turning on the iptables option is essential when reviewing untrusted code.
- SSH agent forwarding is a *deliberate* trade-off: your SSH keys stay on the host but Claude can use the agent to access remote git. An exfiltration vector if the agent is compromised, but a usability win.

---

### Finding: Docker Sandboxes use microVMs internally — closest "containers + microVM" production product

**Confidence:** CONFIRMED
**Evidence:** [docker.com/blog/docker-sandboxes...](https://www.docker.com/blog/docker-sandboxes-run-claude-code-and-other-coding-agents-unsupervised-but-safely/), [docker.com/blog/why-microvms](https://www.docker.com/blog/why-microvms-the-architecture-behind-docker-sandboxes/)

> "Each agent runs inside a dedicated microVM"

> "Hypervisor-based isolation significantly reduces host risk"

Per-platform VMM:
> "macOS: Apple's Hypervisor.framework. Linux: Linux KVM. Windows: Windows Hypervisor Platform."

Distinguishing capability vs traditional containers:

> "Coding agents can build and run Docker containers inside the MicroVM. They have no access to the host Docker daemon."
> "Docker Sandboxes are the only sandboxing solution we're aware of that allows coding agents to build and run Docker containers while remaining isolated from the host system."

> "If an agent goes off the rails, delete the sandbox and spin up a fresh one in seconds"

**Resource caveat:** Docker Sandboxes still requires Docker Desktop running on the host. Per [Infralovers test](https://www.infralovers.com/blog/2026-02-15-sandboxing-claude-code-macos/):

> "Docker Sandboxes requires separate microVM instances per sandbox (cumulative RAM cost)."

Plus the licensing constraint:

> "Docker Desktop is free only for organizations with fewer than 250 employees AND less than $10M revenue... at ~$21/user/month for Docker Business, a 250-person engineering org is looking at roughly $63K/year."

**Implications:**
- Docker Sandboxes is the "best of both worlds" pitch: container ergonomics + VM isolation. Real architectural advantage over plain containers.
- Heavy: Docker Desktop daemon (2-4 GB idle RAM) + per-sandbox microVM cost on top.
- Free for individual/small-org use but commercial pricing for orgs >250 employees.
- For users explicitly avoiding Docker due to resource cost, this is not the answer regardless of the microVM upgrade — Docker Desktop itself is the resource cost.

---

### Finding: Older community Docker-based sandboxes (textcortex) have been archived and superseded

**Confidence:** CONFIRMED
**Evidence:** [github.com/textcortex/claude-code-sandbox](https://github.com/textcortex/claude-code-sandbox)

> "This was an early PoC and is now archived. Follow Spritz for the continuation of this vision."

Original design:
> "Run Claude Code as an autonomous agent inside Docker containers with automatic GitHub integration. Bypass all permissions safely."

Architecture:
- Docker/Podman for isolated execution
- Auto-forwarding of API keys, GitHub tokens, git config
- Per-session git branch (`claude/[timestamp]`)
- Browser-based terminal at `http://localhost:3456`
- Default Ubuntu 22.04 image with Node, Python, Claude Code

**Implications:**
- Useful as an early-pattern reference, but not maintained.
- The "files copied not mounted" pattern (true isolation but slower) is one design knob; most modern sandboxes prefer bind mounts with hypervisor-level filesystem boundaries.
- Spritz is the named successor — out of scope to evaluate here but worth checking if Docker-based community sandboxes are part of the consideration set.

---

### Finding: Container escapes happen — multiple 2024-2025 CVEs reached the host from inside containers

**Confidence:** CONFIRMED
**Evidence:** [microvm-2026 survey](https://emirb.github.io/blog/microvm-2026/)

The microvm-2026 survey enumerates 2024-2025 container-escape CVEs and frames the security boundary argument:

> "Linux containers are a packaging and resource control mechanism. Namespaces and cgroups restrict what a process can see... But every container on a host shares the same kernel. A kernel exploit, a rogue capability, a mis-mounted socket, and you're root on the host."

Documented CVEs cited:
- **CVE-2024-21626** ("Leaky Vessels"): "container escape in runc and buildkit gives access to host filesystem"
- **CVE-2025-23266** ("NVIDIAScape"): "3-line Dockerfile, CVSS 9.0" leading to privilege escalation
- **CVE-2025-31133**: "runc masked path race condition: attacker replaces `/dev/null` with symlink, tricks runc into bind-mounting arbitrary host paths"
- **CVE-2025-38617**: "Linux kernel packet socket use-after-free: only needs CAP_NET_RAW... enables full container escape"
- **CVE-2025-9074** (Docker Desktop, August 2025): "CVSS 9.3... Docker Desktop's internal Engine API to any container at 192.168.65.7:2375 without authentication."

Conclusion of the survey author:
> "Every one of these gave an attacker a path from inside a container to the host."

> "In the container model, every layer is a software convention enforced by the shared kernel... In the microVM model, the security boundary is hardware virtualization: Intel VT-x / AMD-V."

**Implications:**
- Containerization is a real boundary, but a software boundary against a shared kernel. CVEs in runc, BuildKit, and the kernel itself periodically punch through it.
- The frequency of these escapes is high enough (multi-CVE per year) that "rely on containers as the only boundary" is an active risk for untrusted-code review.
- The microVM tier exists precisely because the container tier has provably failed at the security-boundary job over multiple years.

---

## Negative searches

- Searched for an Anthropic-published comparison of devcontainer vs built-in `/sandbox` → not found. Anthropic ships both but does not publish a guidance matrix comparing them.
- Searched for "Spritz" (the textcortex successor) → no prominent results in this recon; would need targeted lookup if community Docker sandbox is part of the choice set.

## Gaps / follow-ups

- The Anthropic devcontainer's exact firewall allowlist (which domains beyond the named ones) is not in the docs — needs reading the `init-firewall.sh` source on the `claude-code` repo.
- Whether the Anthropic built-in sandbox can run *inside* a devcontainer effectively (composing both layers) is documented for Linux via the `enableWeakerNestedSandbox` flag, but the security trade-off is explicitly weak.
