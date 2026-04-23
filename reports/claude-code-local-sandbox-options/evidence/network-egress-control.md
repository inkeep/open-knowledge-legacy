# Evidence: Network egress control (lighter than Squid)

**Dimension:** D6 (Network egress control)
**Date:** 2026-04-22
**Sources:** Anthropic sandbox docs, Anthropic devcontainer init-firewall pattern, Matchlock docs, Apple Container docs

---

## Context

The user has prior experience running Docker with a Squid proxy for network control and found the operational overhead too heavy. This evidence file covers lighter alternatives, ordered roughly from "least operational overhead" to "most powerful but heavier."

---

## Findings

### Finding: Anthropic's built-in sandbox ships its own proxy — no Squid required

**Confidence:** CONFIRMED
**Evidence:** [Anthropic engineering — sandboxing](https://www.anthropic.com/engineering/claude-code-sandboxing)

> "network isolation, by only allowing internet access through a unix domain socket connected to a proxy server running outside the sandbox."

> "The proxy enforces restrictions on the domains that a process can connect to."

How it differs from Squid operationally:
- The proxy is bundled with the sandbox runtime (`@anthropic-ai/sandbox-runtime` npm package per [code.claude.com/docs/en/sandboxing](https://code.claude.com/docs/en/sandboxing)).
- No separate config file like `squid.conf` to maintain — domain allowlist is in `settings.json` under `sandbox.network.*`.
- No separate process to run — the sandbox runtime starts and stops it as part of the bash subprocess lifecycle.
- Communication is via unix domain socket, not TCP — eliminates DNS/listener config.

**Implications:**
- This is the lightest network-egress control available for Claude Code. Zero new processes, zero config files outside Claude's own settings.
- For most threat models, this is sufficient if you don't need the deeper inspection that Squid provides (e.g., body-filtering, transparent intercept).

**Limitation:** Domain-fronting is a documented bypass class. The proxy enforces SNI/Host headers; it does not inspect HTTPS traffic content (would require MITM with certificate trust).

---

### Finding: macOS `pf` rules + a launchd-managed proxy can be a Squid-free, host-level alternative

**Confidence:** INFERRED (no Claude Code-specific source; based on macOS standard tooling)
**Evidence:** macOS includes `pf` (Packet Filter, ported from FreeBSD) as the kernel-level firewall.

The general pattern, applicable to any process including Claude Code:
1. Set environment variables `HTTP_PROXY` / `HTTPS_PROXY` to point at a local lightweight proxy (e.g. `mitmproxy`, `tinyproxy`, or just `socat`-based forwarder).
2. Use `pf` rules to block all outbound from the user account *except* via the proxy.
3. Proxy enforces the allowlist.

This is more involved than Anthropic's built-in sandbox proxy but applies to any process, not just sandboxed bash subprocesses.

**Implications:**
- For users who want one place to define network policy across all dev tools (not just Claude Code), `pf` + a small proxy is the lighter alternative to a Docker+Squid setup.
- Operational cost: one launchd plist + one `pf.conf` snippet + one small proxy. No Docker daemon.
- Drawback: requires sudo to install pf rules; the rules apply per-user/group and need careful scoping.

---

### Finding: Anthropic's official devcontainer init-firewall.sh uses iptables + ipsets

**Confidence:** CONFIRMED
**Evidence:** [code.claude.com/docs/en/devcontainer](https://code.claude.com/docs/en/devcontainer)

> "Custom firewall restricting network access to only necessary services."
> "Restricts outbound connections to whitelisted domains only (npm registry, GitHub, Claude API, etc.)."
> "Allowed outbound connections: The firewall permits outbound DNS and SSH connections."
> "Default-deny policy: Blocks all other external network access."
> "Startup verification: Validates firewall rules when the container initializes."

The script lives in the `claude-code` repo at `.devcontainer/init-firewall.sh` and is a starter-kit example developers can copy and adapt.

**Implications:**
- For Linux/devcontainer use, the iptables + ipset pattern is the canonical approach. Anthropic ships a reference implementation.
- The "startup verification" step is important — a misconfigured allowlist that silently allows everything is worse than no firewall (false sense of security).
- This pattern is essentially what Squid does at L7 but moved to L3/L4 — much lower overhead, but cannot do request body filtering.

---

### Finding: Matchlock provides a MITM proxy specifically for secret injection

**Confidence:** CONFIRMED
**Evidence:** [VirtusLab Matchlock writeup](https://virtuslab.com/blog/ai/matchlock-your-agents-bulletproof-cage)

> "network allowlisting capabilities to control what external connections are permitted"
> "secret injection via MITM proxy"

The pattern is novel and worth describing: instead of mounting `~/.aws/credentials` into the sandbox (where the agent could read and exfiltrate the long-lived credential), Matchlock's proxy:
1. Intercepts HTTPS calls to (e.g.) `*.amazonaws.com`.
2. Adds short-lived credentials at the proxy boundary.
3. The agent never sees the long-lived credential.

This is conceptually closer to what some enterprise secret managers (AWS STS, HashiCorp Vault PKI) do, but applied to the agent boundary instead of the user boundary.

**Implications:**
- For high-stakes use, this is the strongest network model in the recon — the credential never enters the sandbox.
- Operational cost: more than Anthropic's built-in proxy. You install Matchlock; it brings the proxy + microVM together.
- For users on macOS, Matchlock's macOS support story is less crisp than Linux/Firecracker — see macos-microvm-options.md for the verification gap.

---

### Finding: Apple Container's networking is implicit through the container network namespace

**Confidence:** CONFIRMED
**Evidence:** [ses.box hands-on guide](https://www.ses.box/posts/sandbox-claude-apple-container)

The author's recipe shows Apple Container running Claude with bind mounts and `ANTHROPIC_API_KEY` env var. Network egress is not explicitly restricted — by default the container can reach anything the host can reach.

For network restriction inside Apple Container, the user would layer:
- VM-internal `iptables` rules (since each container is its own microVM, they're independently configurable)
- Or use the host-side `pf` rules to constrain the VM's tap interface

**Implications:**
- Apple Container doesn't ship a built-in firewall like Anthropic's devcontainer does. You'd need to add one (small `iptables` script in the container init).
- For "thin sandbox for daily use" (the use case the ses.box author targets), the absence of a firewall is fine — the sandbox is for filesystem isolation primarily. For "untrusted code review," you need to add the network layer yourself.

---

## Comparative footprint table

| Approach | Process count | Config files | Sudo needed | Memory overhead | DNS-level filtering | Body inspection |
|---|---|---|---|---|---|---|
| Anthropic built-in sandbox | 0 extra | 1 (settings.json) | No | Negligible | Yes (allowlist) | No |
| macOS pf + tiny proxy | 1 (proxy) | 2 (pf.conf, proxy conf) | Yes (one-time) | ~10 MB | Yes | Possible |
| Devcontainer + iptables | 1 (docker daemon) | 2 (Dockerfile, init-firewall.sh) | No (inside container) | Docker overhead | Yes | No |
| Matchlock | Several (microVM + proxy) | 1 (matchlock config) | No (Linux); macOS varies | microVM cost | Yes | Yes (for secret injection) |
| Docker + Squid (user's prior setup) | 2+ (docker, squid) | 2+ (Dockerfile, squid.conf) | No (inside container) | Docker + Squid overhead | Yes | Yes |

---

## Negative searches

- Searched for "lightweight squid alternative for AI agent" → mostly turns up `tinyproxy`, `mitmproxy` — both viable but neither Claude Code-specific.
- Searched for an Anthropic-published comparison of their built-in proxy vs Squid → not found.

## Gaps / follow-ups

- The exact format of Anthropic's `sandbox.network.allow` settings is in [code.claude.com/docs/en/settings](https://code.claude.com/docs/en/settings) (not fetched in detail here) — would be the next step for any user implementing this.
- Whether the built-in proxy supports CIDR-level rules (not just domains) is unclear from the recon. Domains-only is fine for typical workloads but limits use cases like "allow my internal corporate API at 10.0.0.0/8."
