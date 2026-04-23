# Tier 0 — Anthropic's built-in sandbox

Lightest option. On macOS, this uses Seatbelt (kernel-level, no container or VM) applied to Claude Code's bash subprocess. Ships its own domain-allowlist network proxy — no Squid needed.

## Three profiles

| File | Posture | When to use |
|---|---|---|
| [`settings-interactive.json`](./settings-interactive.json) | Sandbox on, auto-allow, escape hatch available | Daily supervised work. You're at the keyboard. |
| [`settings-unattended-trusted.json`](./settings-unattended-trusted.json) | Sandbox on, auto mode, escape hatch **disabled** | Leaving Claude running on your own code while AFK. |
| [`settings-unattended-hardened.json`](./settings-unattended-hardened.json) | Strict network allowlist, no unsandboxed commands, `failIfUnavailable: true` | Untrusted-code work where you want Tier 0 as first defense (pair with Tier 1 for real isolation). |

## Install

```bash
./install.sh interactive        # or: unattended-trusted, unattended-hardened
```

The script backs up your existing `~/.claude/settings.json` to `~/.claude/settings.json.bak.<timestamp>` before overwriting.

## Activation

After installing the settings:

```bash
claude                          # Launch Claude Code
> /sandbox                      # (inside Claude) enable sandbox; pick 'auto-allow'
```

For unattended runs, add `--dangerously-skip-permissions` — it's safe *because* the sandbox is enforced at the kernel level and the escape hatch is disabled. From the report: Trail of Bits' whole thesis is that `--dangerously-skip-permissions` is fine *if* the blast radius is bounded.

## What this does NOT cover

- Doesn't isolate Claude's built-in Read/Edit/Write tools — they go through the permission system, not Seatbelt.
- Doesn't protect Claude Code's own credentials from exfiltration over allowed domains.
- Doesn't stop a malicious project from reading your SSH keys or dotfiles (the sandbox's default read posture is broad).

For those, go up to Tier 1.

## Dry-run validation

```bash
jq . settings-interactive.json >/dev/null && echo "valid"
jq . settings-unattended-trusted.json >/dev/null && echo "valid"
jq . settings-unattended-hardened.json >/dev/null && echo "valid"
```

## Source of truth

Schema and option names come from [code.claude.com/docs/en/settings](https://code.claude.com/docs/en/settings) and [code.claude.com/docs/en/sandboxing](https://code.claude.com/docs/en/sandboxing). If Anthropic renames any key between Claude Code versions, these templates may drift — the canonical source wins.
