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

All recipes are **experimental**. Tier 0 is most mature (just config files; zero infrastructure). Tier 1 Apple Container recipes are untested end-to-end on my machine — `container` wasn't installed when I wrote them. The matryoshka experiment has a `verify-matryoshka.sh` script that confirms bubblewrap composes with the Apple Container VM kernel — run it first and send me the output before assuming the nested sandbox actually works.

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
