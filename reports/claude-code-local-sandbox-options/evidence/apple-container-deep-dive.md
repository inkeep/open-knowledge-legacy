# Evidence: Apple Container deep dive (follow-up 2026-04-22)

**Dimension:** Tier 1 deep dive — running Claude Code inside Apple Container on macOS 26 Tahoe
**Date:** 2026-04-22
**Sources:** apple/container repo, GitHub discussion #719, CaptainMcCrank/SandboxedClaudeCode, Anil Madhavapeddy's deep dive, Vijay Kodam's monitoring write-up, ses.box recipe

---

## Key sources

- [apple/container repo](https://github.com/apple/container) — official Apple project
- [Discussion #719 — Firewall to block all internet traffic except for domains I allow](https://github.com/apple/container/discussions/719) — primary thread on network restrictions
- [CaptainMcCrank/SandboxedClaudeCode](https://github.com/CaptainMcCrank/SandboxedClaudeCode) — Bubblewrap/Firejail/Apple Container side-by-side
- [Anil Madhavapeddy — Under the hood with Apple's new Containerization framework](https://anil.recoil.org/notes/apple-containerisation) — architectural deep dive
- [Vijay Kodam — Monitoring Claude Code with Apple Containers Instead of Docker](https://vijay.eu/co-authored/claude-code-monitoring-apple-containers/) — concrete recipes
- [ses.box — Sandbox Claude Code on Mac Without Docker Overhead](https://www.ses.box/posts/sandbox-claude-apple-container) — daily-use recipe

---

## Findings

### Finding: Architecture — VM-per-container via Virtualization.framework + Kata Containers, with Apple's own Swift userspace

**Confidence:** CONFIRMED
**Evidence:** [Anil Madhavapeddy's deep dive](https://anil.recoil.org/notes/apple-containerisation)

> "This system spins up a VM per container in order to provide more isolation."

> "Each container receives its own Linux kernel (version 6.12.28 in the tested build)"

> "A custom Swift-based init daemon called `vminitd` runs as the sole filesystem binary, providing RPC interfaces for service management. It's compiled using Swift's static Linux SDK, linking against musl libc."

> "Apple built a complete ext4 filesystem implementation in Swift, used to extract and construct container filesystems from OCI images."

The platform layer is `macOS Virtualization framework + Kata Containers` (Kata 3.26.0 kernel per the v0.9 release notes).

**Implications:**
- The "VM-per-container" claim is structurally true — not marketing. Each container has its own kernel, its own init process, its own filesystem.
- `vminitd` being the only binary means the attack surface inside the VM is minimal — there's no full systemd, no shell unless you put one there.
- The Kata Containers heritage means the security properties are inherited from a multi-year-mature OSS isolation stack.

---

### Finding: Performance — fast cold start, but slow image unpacking is a real cost

**Confidence:** CONFIRMED
**Evidence:** [Anil Madhavapeddy](https://anil.recoil.org/notes/apple-containerisation), [Vijay Kodam](https://vijay.eu/co-authored/claude-code-monitoring-apple-containers/)

Cold start:
> "**Startup time**: ~730ms for Alpine containers (acceptable for development)" — Madhavapeddy

Resource use (Vijay's monitoring stack: 3 containers totaling 640 MB allocated):
> "Actual memory usage at idle was around 216 MB combined."

Image unpacking is the slow path:
> "took 10 minutes on my modern M4 Macbook Air, versus a few seconds on Docker for Mac" (for OCaml/OPAM image)

**Implications:**
- For Claude Code's typical workload (Node + bash + git), startup is sub-second to ~1 second per `container run`. Acceptable for daily use.
- First-time image pull/unpack of complex images (especially with many small files) is dramatically slower than Docker for Mac. Build a minimal Claude Code image and reuse it.
- Per-container allocations of 256 MB are realistic working sizes; idle resident is much smaller.

---

### Finding: Networking model — each container has its own IP, NO bridge network, NO shared DNS

**Confidence:** CONFIRMED
**Evidence:** [Vijay Kodam](https://vijay.eu/co-authored/claude-code-monitoring-apple-containers/), [Discussion #719](https://github.com/apple/container/discussions/719)

> "Apple Containers runs each container as an isolated microVM with no shared DNS or container network."

> "Containers communicate via the host gateway IP `192.168.64.1` (not `localhost`)."

> "Each Apple container runs in its own isolated microVM with its own IP address."

**Implications:**
- This is *different from Docker* in a load-bearing way. If you're used to `docker network` letting containers reach each other by name, that does not exist here.
- Container-to-host: containers reach the host via `192.168.64.1`. Host-to-container: standard port publishing (`-p 8080:8080`).
- For Claude Code specifically: the agent inside the container reaches the Anthropic API outbound just fine via NAT (per CaptainMcCrank's setup using `virtio-net: NAT networking`). Multi-container orchestration would need explicit address coordination.

---

### Finding: There is NO built-in domain-allowlist firewall — and Anthropic's reference firewall does not work as-is

**Confidence:** CONFIRMED
**Evidence:** [Discussion #719](https://github.com/apple/container/discussions/719)

The Apple maintainer (jglogan):
> "With `container`, no other processes are sharing your workload, and for that reason there is no capability restriction."

This means guest-side firewall tools *can* run inside the VM. But:

> "Anthropic's Claude Code reference implementation requiring `--cap-add=NET_ADMIN` and `--cap-add=NET_RAW`, but `container run` doesn't support these flags."

This is a critical operational gap: **the Anthropic devcontainer's `init-firewall.sh` script — which builds the iptables + ipset allowlist — assumes Docker capability flags that Apple Container does not currently expose**.

**Workarounds documented in the discussion:**
1. **Dual-homed Squid proxy** (jamesmacaulay): Squid on both an internal network and the default network; the container is restricted to the internal network only; Squid filters via allowlist. (Note: this is the pattern the user already rejected as "too heavy.")
2. **Guest-side iptables in the container init**: works but doesn't prevent a root-level bypass inside the container — a successful exploit-as-root inside the container can flush rules.
3. **Host-side `pf` rules** filtering vmnet-bridged traffic: open question whether it works effectively, no confirmed recipe in the discussion.
4. **Hypervisor-layer enforcement**: open feature request, not implemented as of this discussion.

**Implications:**
- This is the single biggest operational gap when using Apple Container for Claude Code. You cannot port the Anthropic devcontainer setup directly.
- The lightest workaround that does NOT require Squid is to build an Apple Container image that includes `iptables` + `ipset` and runs the firewall init at container start — accepting that a root-level escalation inside the container could bypass.
- For higher assurance, host-side `pf` rules scoped to the container's vmnet IP are the next step, but this requires sudo on the host and isn't documented in any source surfaced.
- **The Anthropic built-in sandbox's domain-allowlist proxy is the cleanest answer** — run `claude` *inside* Apple Container with `/sandbox` enabled, and the proxy enforces network policy at the bash subprocess level inside the container. This is the matryoshka pattern below.

---

### Finding: The CaptainMcCrank reference implementation is the most complete community recipe

**Confidence:** CONFIRMED
**Evidence:** [CaptainMcCrank/SandboxedClaudeCode](https://github.com/CaptainMcCrank/SandboxedClaudeCode)

The repo provides a `Containerfile` for the Apple Container path with the following design choices:

**Mount strategy:**
| Host Path | Container Path | Access |
|---|---|---|
| `$PWD` | `/workspace` | Read-write |
| `~/.claude` | `/home/claude/.claude` | Read-write |
| `~/.npm` | `/home/claude/.npm` | Read-write |
| `~/.gitconfig` | `/home/claude/.gitconfig` | Read-only |
| `~/.ssh/known_hosts` | `/home/claude/.ssh/known_hosts` | Read-only |

**Network:** "virtio-net: NAT networking" (default Apple Container, no restriction).

**SSH:** `$SSH_AUTH_SOCK` directory is bound to `/run/host-ssh` read-write — agent forwarding rather than mounting private keys.

**GPG limitation noted:** Documentation recommends "making commits outside the container or using the container for unsigned work."

**Customization:** `ARG NODE_VERSION=22` for Node version; `apt-get install` for additional tools.

**What's NOT in this reference:**
- No explicit handling of `--dangerously-skip-permissions`
- No composition with Anthropic's built-in `/sandbox`
- No firewall script

**Implications:**
- This is the strongest starting point if you want a pre-built Containerfile for Claude Code. Fork it and add the firewall layer + sandbox composition yourself.
- The mount-`~/.claude` decision is the credential-exfiltration risk: same caveat as Anthropic's devcontainer applies. To mitigate, either (a) use a separate Claude Code account inside the container, or (b) layer the Anthropic built-in sandbox inside to constrain network egress to just `api.anthropic.com` and your specific domains.
- The SSH agent forwarding pattern is a deliberate tradeoff: keys stay on host but the agent socket is reachable from inside. A compromised process inside can sign arbitrary git commits via your SSH identity.

---

### Finding: Composition with Anthropic's built-in sandbox (the matryoshka pattern) is undocumented but theoretically sound

**Confidence:** UNCERTAIN
**Evidence:** Inferred from the architectures of both products; no first-party source surfaced.

The thesis: install `bubblewrap` + `socat` inside the Apple Container Linux image, run `claude` inside the container with `/sandbox` enabled. The built-in sandbox's bubblewrap-on-Linux path then runs *inside* the microVM, giving you:
- Outer layer: Apple Container microVM (kernel boundary against the host)
- Inner layer: bubblewrap-enforced sandbox profile + Anthropic's network proxy (process-level boundary inside the container)

**Why this should work:**
- The Anthropic built-in sandbox uses bubblewrap on Linux. Apple Container runs Linux. Bubblewrap requires user namespaces, which are standard on the kernel Apple Container ships (6.12.28).
- The sandbox runtime is open-source: `npx @anthropic-ai/sandbox-runtime`. It can be invoked inside any Linux environment that has the dependencies installed.
- The Anthropic docs explicitly note an `enableWeakerNestedSandbox` mode for running inside Docker; the same flag would presumably apply for running inside Apple Container's microVM.

**Why this needs verification:**
- Anthropic's `enableWeakerNestedSandbox` is documented as "considerably weakening security" — what specifically degrades inside an Apple Container microVM (which is more isolated than a plain Docker container) is not documented.
- No public recipe combines both layers.
- The Apple Container's lack of `--cap-add=NET_ADMIN` may also limit bubblewrap's ability to set up its own network namespaces inside the container.

**Implications:**
- This is the strongest theoretical defense-in-depth pattern available on macOS today.
- **Recommendation:** treat this as untested but high-value. Worth running an experiment before relying on it for unattended runs.

---

### Finding: No source recommends Apple Container for unattended use; community patterns are interactive/on-demand

**Confidence:** CONFIRMED
**Evidence:** [Vijay Kodam](https://vijay.eu/co-authored/claude-code-monitoring-apple-containers/), [ses.box guide](https://www.ses.box/posts/sandbox-claude-apple-container), [CaptainMcCrank repo](https://github.com/CaptainMcCrank/SandboxedClaudeCode)

Vijay explicitly:
> "Containers do not auto-start after a Mac restart, so you run them only when you need them."
> "This setup is intended for local development and experimentation only and is not suitable for production use."

The ses.box guide targets "the kind of work where you want to say 'go do it' without babysitting permissions" — a half-step toward unattended, but still framed as interactive.

CaptainMcCrank's repo provides no daemonization, no scheduling.

**The pre-1.0 maturity context (Apple Container itself):**
> "Its stability... is only guaranteed within patch versions... Minor version number releases may include breaking changes until we achieve a 1.0.0 release." — Apple's own README

**Networking limitations on older macOS:**
> "The framework lacks full network isolation capabilities and networking features are 'severely limited' on macOS 15." Full features require macOS 26 (which the user is on).

**Implications:**
- Apple Container is fine for "interactive Claude Code session in an isolated environment" — but the operational ergonomics for "leave it running overnight on tasks" are not yet polished.
- For unattended runs, the gaps to close are: (a) auto-start across reboot, (b) reliable network restriction (the firewall gap), (c) credential strategy that survives the agent being potentially-malicious, (d) someone monitoring the run for stuck states.
- The pre-1.0 caveat is real — minor version breakage is documented. Pin to a specific version and re-test after upgrades.

---

### Finding: The known v0.9 issues catalog

**Confidence:** CONFIRMED
**Evidence:** [Issues page](https://github.com/apple/container/issues), [v0.9 release notes](https://github.com/apple/container/releases/tag/0.9.0), [DevClass coverage](https://devclass.com/2025/06/11/apples-containerization-will-matter-to-developers-but-podman-devs-complain-of-unfixed-issues/)

Documented v0.9 issues / limitations:
1. **`container build` networking bug** — HTTP requests during builds get 403 errors (per ses.box). Workaround: build with Docker, push to local registry, pull into Apple Container.
2. **No `--cap-add` support** — blocks the Anthropic devcontainer firewall recipe (per Discussion #719).
3. **Networking severely limited on macOS 15** — requires macOS 26 for full features (per DevClass).
4. **Image unpacking slow for many-file images** — 10 min for OPAM image (per Madhavapeddy).
5. **No macOS containers** — Linux guests only (per Madhavapeddy). For macOS-guest VMs use Tart or ClodPod.
6. **No GPU passthrough** — for ML workloads, use Lima + krunkit instead.
7. **Pre-1.0 stability caveat** — minor version may break things.
8. **Issue #714** — sandbox client lifecycle bug ("no sandbox client exists: container is stopped"). Fixed status uncertain in this recon.
9. **Rosetta-related issues** — x86_64 emulation has unfixed Rosetta-layer bugs per community reports.

**Implications:**
- Pin to a specific Apple Container version, test before upgrading.
- The build-networking bug + no-`--cap-add` combo means the standard "Dockerfile + iptables firewall" pattern needs adaptation — you can't just use the Anthropic devcontainer Dockerfile out of the box.

---

## Concrete recipe (synthesis — based on community patterns + Anthropic best practices)

Based on the cited sources, here is the cleanest recipe for running Claude Code inside Apple Container on macOS 26 with isolation reasonable for trusted-but-want-fewer-prompts work. **Not yet validated end-to-end.**

```bash
# 1. Install Apple Container (one-time)
# Download .pkg from https://github.com/apple/container/releases
container system start

# 2. Build a Claude Code image (one-time per template change)
# Containerfile (use the CaptainMcCrank reference as a starting point):
cat > Containerfile <<'EOF'
FROM debian:bookworm-slim
ARG NODE_VERSION=22
RUN apt-get update && apt-get install -y \
    ca-certificates curl git jq sudo iptables ipset \
    bubblewrap socat \
 && curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - \
 && apt-get install -y nodejs \
 && npm install -g @anthropic-ai/claude-code \
 && useradd -m -s /bin/bash claude
USER claude
WORKDIR /workspace
EOF

# Note: if `container build` 403 bug bites, build via docker on another host
# and push to a local registry, then container pull from there.
container build -t claude-sandbox .

# 3. Run with workspace + creds + read-only references
container run -it --rm \
  -c 4 -m 4g \
  -v "$PWD:/workspace" \
  -v "$HOME/.claude:/home/claude/.claude" \
  -v "$HOME/.gitconfig:/home/claude/.gitconfig:ro" \
  -e ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  claude-sandbox \
  claude

# 4. Inside the container, enable the built-in sandbox + auto mode
# Either run `/sandbox` interactively, or pre-configure ~/.claude/settings.json
# to set sandbox enabled + permission mode = auto + allowUnsandboxedCommands: false
```

**For unattended runs, additional steps not validated by any source surfaced:**
- Add `--dangerously-skip-permissions` to the `claude` invocation
- Pre-configure `~/.claude/settings.json` inside the container image to set:
  - `sandbox.enabled: true`
  - `sandbox.failIfUnavailable: true` (hard-fail if bubblewrap can't initialize)
  - `sandbox.allowUnsandboxedCommands: false` (disable the escape hatch)
  - `sandbox.network.allow: [list of domains]`
  - permission mode: auto

**Open recipe gaps:**
- The bubblewrap-inside-container layering needs experimentation; see "matryoshka" finding above for the uncertainty.
- A host-side `pf` rule scoped to the Apple Container's vmnet bridge would harden network egress at the host layer; no documented recipe exists.

---

## Negative searches

- Searched for an Apple-published guide to running AI agents in Apple Container → not found. Apple has not positioned this product for AI use cases publicly.
- Searched for documented bubblewrap-inside-Apple-Container experiments → not found. The matryoshka pattern is theoretical at this stage.
- Searched for Anthropic-published guidance on Apple Container as a sandbox tier → not found. Anthropic's docs cover the built-in sandbox and devcontainer but not Apple Container specifically.

## Gaps / follow-ups

- **The matryoshka experiment** (Anthropic built-in `/sandbox` running inside Apple Container) needs a real test before depending on it.
- **A working firewall recipe** that doesn't require Squid: either guest-side iptables (proven-but-bypassable) or host-side `pf` (theoretical) — needs concrete validation.
- **Apple Container v1.0** will likely change capabilities. Re-check this recipe after the 1.0 release.
- **Whether the Anthropic devcontainer's firewall script can be adapted** to work inside an Apple Container (without `--cap-add`) is an open question. May need a fundamentally different network-restriction approach.
