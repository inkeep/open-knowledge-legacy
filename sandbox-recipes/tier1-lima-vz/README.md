# Tier 1 — Lima (vz driver)

Open-source alternative to Apple Container. [Lima](https://lima-vm.io/) v2.0 is a CNCF-incubating project that manages Linux VMs on macOS. With the `vz` driver it uses Apple's `Virtualization.framework` natively — same hypervisor tech as Apple Container, but a mature CLI and explicit AI-agent hardening features (v2.0 added an MCP server that exposes file/command tools from inside the VM).

## Prerequisites

```bash
brew install lima
```

Requires macOS 13+ (older than Apple Container's macOS 26 requirement — pick Lima if you're not on Tahoe yet).

## Quick start

```bash
./setup.sh                        # provisions the VM one-time
./ok-sandbox.sh                   # opens a claude session inside the VM
./ok-sandbox.sh --unattended      # unattended mode
```

## Files

| File | What it does |
|---|---|
| [`claude-sandbox.yaml`](./claude-sandbox.yaml) | Lima VM config: Debian 12 guest, 4 CPU / 4 GB, vz driver, virtiofs mounts, provision script that installs Node + Claude Code |
| [`setup.sh`](./setup.sh) | One-time VM creation via `limactl create` |
| [`ok-sandbox.sh`](./ok-sandbox.sh) | Opens a shell (or runs `claude`) inside the VM |
| [`teardown.sh`](./teardown.sh) | Removes the VM when you're done |

## What this gets you vs Tier 1 Apple Container

| Axis | Apple Container | Lima vz |
|---|---|---|
| Per-container microVM? | Yes | No — one VM, run multiple claude sessions inside it |
| macOS req | macOS 26 (Tahoe) | macOS 13+ |
| Pre-1.0? | Yes (v0.9) | Lima is v2.x, stable |
| OSS | Yes (Apple) | Yes (CNCF) |
| Capability flags | Not supported | Standard Linux (iptables etc. fully usable) |
| AI-agent hardening primitives | None baked | Lima v2.0 ships MCP server for file/command tool interception |

**Pick Lima if:** you want the iptables allowlist to work cleanly (no `--cap-add` gap), you're not on macOS 26 yet, or you want the CNCF stability guarantees.

**Pick Apple Container if:** you want per-run isolated microVMs (fresh VM each agent invocation) rather than a persistent VM with sessions inside.

## Honest limitations

- Lima VM is persistent — not disposed per agent invocation. If you want that pattern, either teardown + setup each time (slow) or switch to Apple Container.
- Filesystem I/O crosses the hypervisor boundary with the usual ~3x overhead for metadata-heavy workloads (per Infralovers benchmark in the report). Mitigation: clone repos inside the VM rather than bind-mounting from the host.
- This recipe does NOT install a custom firewall (iptables works here, but not wired up — you can add it inside the VM, or enable Anthropic's built-in `/sandbox` once you `claude` in).
