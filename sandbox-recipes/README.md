# Sandbox Recipes for Claude Code (macOS)

Runnable artifacts companion to [reports/claude-code-local-sandbox-options](../reports/claude-code-local-sandbox-options/REPORT.md). Each directory is a tier from that report, with drop-in configs / scripts you can experiment with.

## Which tier do I want?

| Scenario | Tier | Directory |
|---|---|---|
| "I trust this code; I just want fewer permission prompts" | 0 | [tier0-builtin-sandbox/](tier0-builtin-sandbox/) |
| "Unattended overnight run on my own trusted code" | 0 | [tier0-builtin-sandbox/](tier0-builtin-sandbox/) (`settings-unattended-*.json`) |
| "Reviewing a semi-trusted repo (OSS PR, partner code)" | 1 | [tier1-apple-container/](tier1-apple-container/) |
| "I want the strongest isolation available without Docker Desktop" | 1 (matryoshka) | [tier1-matryoshka/](tier1-matryoshka/) |
| "Open-source alternative to Apple Container" | 1 | [tier1-lima-vz/](tier1-lima-vz/) |

Full threat-model mapping and tradeoffs live in the report; this directory is the "I want to try one of these right now" companion.

## Status

- **Tier 0** (Anthropic's built-in sandbox) — most mature; just config files. No infrastructure overhead.
- **Tier 1 Apple Container** — *validated 2026-04-23 on Apple Container v0.11 + macOS 26 Tahoe*. Build + entrypoint + guest-side iptables allowlist all confirmed working end-to-end. Allowed domains pass (`api.anthropic.com`, `github.com`), denied domains blocked (`example.com`, `cloudflare.com`).
- **Tier 1 Matryoshka** — *validated 2026-04-23 on same config*. `verify-matryoshka.sh` passes 5/5 after two Containerfile fixes discovered during smoke-testing: (a) bubblewrap needs setuid (Debian file-caps default fails with `"Unexpected capabilities but not setuid"` against the Apple Container guest kernel), (b) `@anthropic-ai/sandbox-runtime` requires `ripgrep`.
- **Tier 1 Lima vz** — config is based on published Lima v2.0 docs; not end-to-end tested. `./setup.sh` should work; report back if it doesn't.

## Path-level network restrictions

None of these recipes do URL-path filtering (e.g., "allow `github.com/inkeep/*` only") — they all do domain-level. See [URL-PATH-RESTRICTIONS.md](URL-PATH-RESTRICTIONS.md) for four options (the best for the GitHub case is fine-grained PATs at the auth layer, not network layer).

## Prerequisites

| Tier | Install |
|---|---|
| Tier 0 | Nothing beyond `claude` itself (v2.0+). Requires macOS 13+ for Seatbelt. |
| Tier 1 Apple Container | `container` from https://github.com/apple/container/releases + macOS 26 Tahoe + Apple Silicon. |
| Tier 1 Lima vz | `brew install lima` + macOS 13+. |

## Repo-safety notes

- Nothing here modifies product code (`packages/`, `docs/site/`). This directory is purely additive.
- No build integration: these recipes live outside turbo/biome. They're config + shell scripts.
- Secrets: no templates mount long-lived credentials unless the recipe explicitly documents the tradeoff.
