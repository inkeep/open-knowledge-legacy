# Tier 1 — Apple Container

Run Claude Code inside a per-container microVM on macOS 26 Tahoe via [Apple's Container project](https://github.com/apple/container). Uses `Virtualization.framework` + Kata Containers — real kernel boundary against your host, no Docker Desktop daemon.

## Prerequisites

- macOS 26 (Tahoe) + Apple Silicon (no Intel support; older macOS has "severely limited" networking per Apple).
- `container` installed: download `.pkg` from [github.com/apple/container/releases](https://github.com/apple/container/releases), double-click, then:
  ```bash
  container system start
  ```
- Your Anthropic API key in `$ANTHROPIC_API_KEY`, OR your existing `~/.claude/` will be mounted so you're already logged in.

## Quick start

```bash
# One-time: build the image
./build.sh

# Each session: run Claude Code inside the microVM
./ok-sandbox.sh              # interactive
./ok-sandbox.sh --unattended # adds --dangerously-skip-permissions + firewall tightening
```

## Files

| File | What it does |
|---|---|
| [`Containerfile`](./Containerfile) | Debian Bookworm + Node 22 + Claude Code + bubblewrap/socat (for matryoshka) + iptables/ipset (for firewall) |
| [`entrypoint.sh`](./entrypoint.sh) | Runs as root on container start: initializes guest-side firewall, then drops to `claude` user |
| [`firewall-init.sh`](./firewall-init.sh) | iptables allowlist ruleset — blocks all outbound except the allowlist |
| [`build.sh`](./build.sh) | Wraps `container build` |
| [`ok-sandbox.sh`](./ok-sandbox.sh) | Wraps `container run` with the standard mount strategy |

## What you get

- **Kernel boundary:** each run is a microVM with its own Linux 6.12.28 kernel. Container escape requires a hypervisor CVE, not a runc or kernel namespace CVE.
- **Filesystem isolation:** only `$PWD` (rw), `~/.claude` (rw), `~/.gitconfig` (ro) are visible inside. Your `~/.ssh`, `~/.aws`, browser cookies, etc. are structurally unreachable.
- **Guest-side network allowlist:** iptables default-deny with allowlist applied at container start. See [firewall-init.sh](./firewall-init.sh) for the list.

## Known limitations

- `container run` doesn't support `--cap-add`. The firewall runs *inside* the container as root and before dropping to the `claude` user — a successful root-level exploit inside the VM could flush the iptables rules. This is guest-side iptables, not hypervisor-level enforcement.
- `container build` has a networking bug in v0.9 where HTTP fetches during build get 403s. Workaround documented in [build.sh](./build.sh): build with docker if the bug hits you, push to a local registry, pull into Apple Container.
- Pre-1.0 stability: Apple's own README warns minor versions may break things. Pin a version.

## What's NOT included

- **Host-side network enforcement** (`pf` rules scoped to the vmnet bridge) — open research question per the report; no documented recipe.
- **Credential isolation.** `~/.claude` is mounted into the container; the Anthropic devcontainer caveat applies here too — a compromised project can exfiltrate Claude credentials over any allowed domain. For credential isolation, see [tier1-matryoshka/](../tier1-matryoshka/) (layers Anthropic's built-in sandbox *inside* the Apple Container).
- **Auto-start across reboot** — run it as needed; no launchd plist.

## Smoke test

```bash
./build.sh
container run --rm claude-sandbox:latest /home/claude/firewall-init.sh --dry-run
# should print the iptables rules it would apply, without applying them
```
