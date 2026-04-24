# Tier 1 — Matryoshka: Anthropic `/sandbox` *inside* Apple Container

**Status: verified on Apple Container v0.11 + macOS 26 Tahoe (2026-04-23).** The `verify-matryoshka.sh` smoke test passes 5/5 in this configuration. Run it yourself before depending on the pattern on a different platform combo — it's the canonical gate. The report's "untested matryoshka pattern" note is now closed; this recipe is the working one.

The thesis from the report: run Claude Code inside an Apple Container microVM *and* have it use its own built-in `/sandbox` (bubblewrap + proxy) inside the VM. Two isolation layers:

- **Outer:** Apple Container microVM (hypervisor boundary against the host).
- **Inner:** Anthropic's bubblewrap-based sandbox inside the Linux guest (process boundary against the agent's own bash subprocess, plus Anthropic's own network proxy enforcing a domain allowlist).

This gives you domain-allowlist network enforcement (via Anthropic's proxy) **without** needing Squid, without needing iptables capabilities, and without trusting the guest-side iptables setup that Tier 1 plain uses.

## What's known, what's not

| Question | Status (as of 2026-04-23 on container v0.11 + macOS 26) |
|---|---|
| Does bubblewrap compose with the Apple Container kernel (Linux 6.18.5 on v0.11)? | **YES**, after the Containerfile fix documented below (setuid bwrap). Default Debian file-caps-based config fails with `"Unexpected capabilities but not setuid"` — fixed by `setcap -r /usr/bin/bwrap && chmod u+s /usr/bin/bwrap`. |
| Does Anthropic's `@anthropic-ai/sandbox-runtime` need capabilities Apple Container doesn't expose? | **No**, but it DOES require `ripgrep` (added to base deps). |
| Can `claude /sandbox` auto-configure inside the container? | **Yes** — the in-container `~/.claude/settings.json` is pre-configured by this image. |
| What does Anthropic mean by "`enableWeakerNestedSandbox` considerably weakens security"? | Still **unclear** — their docs don't enumerate. `verify-matryoshka.sh` confirms bubblewrap spawns and the sandbox runtime echoes correctly, but doesn't measure what's degraded vs strict mode. |

## Files

| File | What it does |
|---|---|
| [`Containerfile`](./Containerfile) | Extends the Tier 1 base image with `@anthropic-ai/sandbox-runtime` preinstalled + a pre-baked `~/.claude/settings.json` enabling `/sandbox` |
| [`settings.json`](./settings.json) | In-container Claude Code settings that enable the built-in sandbox |
| [`verify-matryoshka.sh`](./verify-matryoshka.sh) | Runs inside the container; checks whether bubblewrap works and what sandbox mode activates |
| [`ok-sandbox.sh`](./ok-sandbox.sh) | Wrapper: launches the matryoshka image with proper mounts |

## Smoke-test recipe

```bash
# Build
./build.sh

# Verify the nested-sandbox layer works
container run --rm claude-matryoshka:latest /home/claude/verify-matryoshka.sh

# Expected output:
#   [verify] bubblewrap:  OK (bwrap version X.Y.Z)
#   [verify] user ns:     OK (can spawn)
#   [verify] seccomp:     OK
#   [verify] sandbox-runtime: OK (npx @anthropic-ai/sandbox-runtime echo hello → 'hello')

# If any line fails, the matryoshka pattern isn't working in your environment.
# The fall-back is tier1-apple-container with guest-side iptables.
```

## Session launch

```bash
./ok-sandbox.sh
# Inside the container, /sandbox is already enabled and auto-allow mode is set.
# Claude's bash subprocess runs under bubblewrap; network egress goes through
# Anthropic's proxy enforcing the domain allowlist in settings.json.
```

## Why this is the thesis of the report's recommendation

For the "Docker too heavy" user, this is the cleanest answer to the network-enforcement question:

- **No Squid** (Anthropic ships its own proxy).
- **No host-side pf rules** (proxy runs inside the container).
- **No iptables capability** (bubblewrap uses user namespaces).
- **Real kernel boundary** (Apple Container microVM).
- **Real process boundary inside** (bubblewrap).
- **Disposable** (destroy and rebuild the container when you want).

## Honest caveats

1. **Not validated end-to-end.** Bubblewrap-inside-Apple-Container is a community-proposed pattern; no primary source in my research confirmed it works. Run `verify-matryoshka.sh` before trusting it.
2. **If bubblewrap fails inside the container**, the fall-back is Tier 1 plain (with guest-side iptables) or Anthropic's `enableWeakerNestedSandbox` mode — which Anthropic says "considerably weakens security." Don't silently fall back; know which mode you're in.
3. **Credentials still exposed.** Same caveat as Tier 1: `~/.claude` is mounted into the container. Use a separate Claude account inside for high-assurance work.
