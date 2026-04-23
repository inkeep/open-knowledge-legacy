# Evidence: Resource overhead tiering

**Dimensions:** D8 (Operational ergonomics), D10 (Resource overhead — added per user input)
**Date:** 2026-04-22
**Sources:** OrbStack public claims, Apple Container hands-on benchmark (ses.box), Infralovers head-to-head, microvm-2026 survey

---

## Why this dimension exists

The user reported that prior Docker + Squid attempts were "just too many resources." Resource cost is therefore a first-class axis. This file consolidates everything the recon surfaced about idle and active resource costs across the candidate stacks.

---

## Findings

### Finding: Tier ordering by resource cost (lightest → heaviest)

**Confidence:** INFERRED (synthesis from quantified claims across sources)

| Tier | Approach | Idle RAM | Cold start | Background CPU | Disk |
|---|---|---|---|---|---|
| **0** | Anthropic built-in sandbox (Seatbelt on macOS) | Negligible (no daemon) | Effectively instant (no VM/container to start) | None reported by Anthropic | Negligible (sandbox runtime is npm package) |
| **1** | Apple Container | "No daemon eating RAM in the background" (ses.box) | Sub-second (ses.box) | Not measured | Container image (~hundreds of MB to a few GB depending on image) |
| **1** | Lima `vz` driver | Per-VM RAM (default 4 GB cap, configurable) | ~3-5 s (community reports; not in cited sources) | Single VM process | VM disk image (~hundreds of MB to a few GB) |
| **2** | OrbStack | Single shared VM ("less than 0.1% background CPU usage on Apple Silicon") | "in under a minute" (docs.orbstack.dev), 2 s for K8s startup | <0.1% on Apple Silicon | <10 MB disk out-of-the-box; image storage on top |
| **2** | ClodPod / Tart | Per-VM RAM (5/8 of host RAM split across VMs by default) | Tart VM cold start (~10s typical) | Per-VM CPU when active | macOS guest VM image (~tens of GB) |
| **3** | Docker Desktop + Sandboxes | "2–4 GB of RAM idle" (ses.box) + per-sandbox microVM | "10–30 s" Docker (ses.box) + per-sandbox microVM start | Docker daemon background load | Docker images + microVM images |
| **4** | Matryoshka (host VM + Linux + container) | Sum of all layers | Sum of all layers | Sum of all layers | Sum of all layers |

The single biggest jump is between Tier 0 (no virtualization at all) and Tier 1+ (any virtualization). The next biggest is Docker Desktop's idle daemon cost.

---

### Finding: Apple Container vs Docker Desktop quantified comparison

**Confidence:** CONFIRMED
**Evidence:** [ses.box hands-on guide](https://www.ses.box/posts/sandbox-claude-apple-container)

| Metric | Docker Desktop | Apple Container |
|---|---|---|
| Startup | "~10–30s" | "Sub-second" |
| Idle RAM | "2–4 GB" | "No daemon" |

> "Docker eats 2–4 GB of RAM idle... Apple Container: No daemon eating RAM in the background."

**Implications:**
- For a user explicitly avoiding Docker due to resource cost, Apple Container is the most direct lighter substitute *that still gives microVM-per-container isolation*.
- The "no daemon" claim is architectural — Apple Container starts containers on demand using the Virtualization.framework directly, no long-lived background process equivalent to Docker Desktop's `com.docker.backend`.

---

### Finding: OrbStack publishes very low background-resource numbers but is one shared VM

**Confidence:** CONFIRMED
**Evidence:** [orbstack.dev landing page](https://orbstack.dev/), [docs.orbstack.dev/architecture](https://docs.orbstack.dev/architecture)

> "less than 0.1% background CPU usage on Apple Silicon"
> "Less than 10 MB of disk space is used out of the box"

OrbStack's architectural choice: one shared Linux VM with Docker engine + Linux machines coexisting.

> "A Docker engine runs alongside Linux machines in the OrbStack VM."

**Implications:**
- OrbStack is the lightest option *among Docker replacements* — i.e., if you want to keep using Docker CLI workflows but drop Docker Desktop's resource cost.
- The single-shared-VM design is a feature for resource cost (no per-container VM overhead) and a *limitation* for security (kernel exploit in one container compromises all).
- For Claude Code with trusted code, OrbStack is reasonable. For untrusted-code review, it's not the right tier (per Infralovers).

---

### Finding: Filesystem performance is the per-operation cost most users notice

**Confidence:** CONFIRMED
**Evidence:** [Infralovers hands-on test](https://www.infralovers.com/blog/2026-02-15-sandboxing-claude-code-macos/)

> "Crossing the hypervisor boundary for I/O costs roughly 3x performance on metadata-heavy workloads."

Benchmark on M4 Pro (`npm install`):
| Stack | Time |
|---|---|
| Docker Desktop (VZ + sync) | 3.88s |
| OrbStack | 4.22s |
| Lima | 8.99s |
| Native Linux reference | 5.29s |

The author's workaround:
> "Clone repos directly inside the VM where you get native ext4 speed... The ~3x penalty only hits bind mounts crossing the hypervisor boundary."

**Implications:**
- For sustained Claude Code work (lots of file reads/writes by the agent), a 3x slowdown on metadata ops is significant.
- Best practice across all VM-based options: do `git clone` inside the VM, not on the host with bind mount. Trade-off is that the workspace lives in the VM and is harder to introspect with host tooling.
- Anthropic's built-in sandbox does not have this overhead — it's process-level, no hypervisor boundary, files are on the host filesystem natively.

---

### Finding: microVM RAM overhead per VM is ~5 MB plus your guest's actual usage

**Confidence:** CONFIRMED
**Evidence:** [microvm-2026 survey](https://emirb.github.io/blog/microvm-2026/)

For Firecracker:
> "memory overhead <5 MiB"

Boot time:
> "Firecracker NSDI'20 paper" — ~125ms baseline
> "With snapshot-restore" — ~28ms
> Author's observation on modern hardware — ~200ms for minimal Linux 6.18

> "Single-digit percentage CPU overhead even with nested virtualization"

> "Oracle Firecracker/OCI benchmarks showed ~3% CPU overhead even with nested virtualization"

**Implications:**
- The hypervisor overhead is genuinely small in 2026. The cost of "running a microVM" is dominated by your guest OS (kernel + userspace), not the VMM.
- For Claude Code workloads, the practical floor is: minimal Linux kernel + bash + Claude Code + Node ≈ a few hundred MB resident in the VM. Plus the VMM's <5 MB.
- Per-microVM cost is far smaller than Docker Desktop's idle daemon cost. The "microVMs are too heavy" intuition is outdated.

---

### Finding: Boot-time tiers matter for agent-loop UX

**Confidence:** CONFIRMED
**Evidence:** [microvm-2026 survey](https://emirb.github.io/blog/microvm-2026/)

| Boot scenario | Time |
|---|---|
| MicroVM baseline (Firecracker) | ~125 ms |
| With snapshot-restore | ~28 ms |
| FreeBSD (Colin Percival) | <20 ms |
| Author's minimal Linux 6.18 | ~200 ms |
| gVisor | ~50 ms |
| Traditional VM | 30-60 s |
| Kubernetes pod scheduling | 3-15 s |

**Implications:**
- A "spin up a fresh VM per agent task" model is feasible at the ~100-200ms tier. This is what Docker Sandboxes, E2B, and Vercel Sandbox use internally.
- Traditional VMs (UTM with full Ubuntu, VMware Fusion) at 30-60s are too slow for per-task-fresh-VM patterns; they make sense for "boot once, run many tasks."

---

### Finding: Anthropic's built-in sandbox publishes no overhead numbers but is structurally near-zero

**Confidence:** INFERRED (architectural reasoning)
**Evidence:** Anthropic's own description: built on "operating system primitives" with "no overhead of spinning up and managing a container."

The architecture (Seatbelt rules applied to bash subprocess directly) implies:
- No long-running background process beyond what's already there (`claude` CLI itself).
- No kernel allocation beyond what bash + the sandbox profile entail (Seatbelt rules are kernel data structures, ~KB-scale).
- No filesystem image overhead.
- Per-command cost: parsing the rules (negligible) + the kernel-side enforcement on each syscall (a fraction of a percent CPU overhead).

**Implications:**
- For the user's specific concern (Docker too heavy), this is the "negative-space answer" — they can probably get most of what they want from Anthropic's built-in sandbox without reaching for any container/VM at all.
- The 84% prompt reduction Anthropic claims is essentially "free" from a resource perspective.

---

## Decision triggers (resource-cost framing)

When the resource cost of each tier is acceptable:

| Constraint | Tier |
|---|---|
| You want zero overhead beyond Claude Code itself | Anthropic built-in sandbox only |
| You can afford ~one Linux VM (a few hundred MB resident) | Lima `vz` or Apple Container |
| You can afford a single shared Linux VM (low background CPU, no per-container cost) | OrbStack |
| You can afford one per-task ephemeral microVM (~100-200ms cold, ~hundreds of MB resident) | Docker Sandboxes (if you have Docker) or Matchlock |
| You can afford a multi-GB Docker Desktop daemon plus per-sandbox microVMs | Docker Sandboxes (full setup) |
| Resource cost is irrelevant; you want max isolation | Matryoshka (full VM + Linux + container) |

## Negative searches

- Searched for an Anthropic-published Bash-tool benchmark with vs without sandbox enabled → not found.
- Searched for OrbStack RAM numbers (not just CPU/disk) → no specific RAM number on the OrbStack site; community reports range from ~200 MB to >1 GB depending on workloads.

## Gaps / follow-ups

- A single end-to-end benchmark (cold-boot Claude Code in each tier, run a standard agent task, measure resident RAM + CPU + completion time) does not exist publicly. Building one would be valuable.
- Whether Anthropic's sandbox runtime adds measurable per-syscall latency in real Claude Code workloads has no public benchmark.
