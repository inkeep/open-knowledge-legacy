# Sandbox Recipes for Claude Code (macOS)

Runnable, threat-model-tiered sandboxing for `claude`, from kernel-level Seatbelt (zero overhead) to nested-VM matryoshka. Companion to [reports/claude-code-local-sandbox-options](../reports/claude-code-local-sandbox-options/REPORT.md).

---

## Getting started

### 1. One-command install

```bash
cd ~/Documents/code/open-knowledge            # or wherever you cloned
./sandbox-recipes/bootstrap.sh -y             # installs everything: aliases + PATH scripts
# or pick surfaces explicitly:
./sandbox-recipes/bootstrap.sh --install-aliases             # shell functions only
./sandbox-recipes/bootstrap.sh --install-path                # PATH scripts only
./sandbox-recipes/bootstrap.sh --install-aliases --install-path    # both (redundant but harmonious)
```

What it does:

1. Prompts for a Tier 0 profile (or uses `unattended-trusted` under `-y`).
2. Builds Tier 1 Apple Container + Matryoshka images if `container` is installed.
3. Runs `verify-matryoshka.sh` to confirm the nested sandbox works on your machine.
4. Ensures `~/.ok-projects.sh` exists (shared project registry).
5. Optionally appends alias block to `~/.zshrc` (with backup).
6. Optionally installs launcher symlinks to `~/.local/bin/`.

PATH scripts work in any shell / process that honors `$PATH` — Cursor's integrated terminal, CI, cron, IDE run actions, non-zsh shells. Shell functions give you `ccp` / `ccp-list` (which need shell-level cd), but only work from a zsh session that sourced `~/.zshrc`.

Expect ~2–3 minutes the first time (image builds). Re-runnable safely.

### 2. Reload shell

```bash
source ~/.zshrc
```

### 3. Use it

```bash
ccs                          # Tier 0 — sandboxed claude in current dir
ccs -p ok                    # Tier 0 — cd to open-knowledge, then launch
ccb -p agents                # Tier 1 — boxed claude in agents-private
ccmu -p ok                   # Matryoshka + unattended
ccs -p ok -r abc123          # Project + any claude flag (order doesn't matter)
ccp-list                     # See registered project shortcuts
```

The `-p <project>` flag is explicit so there's no ambiguity with claude's positional prompt. Claude's own `-p` (print mode) is shadowed — use `--print` instead when invoking through these aliases.

Full command reference: **[ALIASES.md](ALIASES.md)**.

---

## Which tier do I want?

| Scenario | Command | Tier | Directory |
|---|---|---|---|
| Daily work, fewer prompts, own code | `ccs` or `ccu` | 0 | [tier0-builtin-sandbox/](tier0-builtin-sandbox/) |
| Unattended overnight on own code | `ccu -p <repo>` | 0 | (same) |
| OSS PR / partner code review | `ccb -p <repo>` | 1 | [tier1-apple-container/](tier1-apple-container/) |
| Strongest isolation without Docker Desktop | `ccmu -p <repo>` | 1 matryoshka | [tier1-matryoshka/](tier1-matryoshka/) |
| Don't have macOS 26? | `ccp <repo>` then manual `limactl shell` | 1 lima | [tier1-lima-vz/](tier1-lima-vz/) |

Full threat-model mapping and tradeoffs: [the report](../reports/claude-code-local-sandbox-options/REPORT.md).

---

## Adding your repos (portability-friendly)

Edit `~/.ok-projects.sh` — **a single source of truth shared by both the shell functions and the PATH scripts**. Bootstrap creates it on first run, seeded with an auto-detected `ok` entry pointing at wherever you cloned `open-knowledge`. Common layouts across devs vary (`~/Documents/code/`, `~/src/`, `~/code/`, `~/workspace/`, `~/dev/`) — nothing is assumed.

```bash
# ~/.ok-projects.sh
_OK_PROJECTS[ok]="<auto-detected by bootstrap>"
_OK_PROJECTS[agents]="$HOME/src/agents-private"      # your own — any layout
_OK_PROJECTS[site]="$HOME/code/my-site"
_OK_PROJECTS[ml]="$HOME/workspace/ml-experiments"
```

Both `ccs -p <key>` and `ccp <key>` work immediately after saving (no bootstrap re-run needed — the file is sourced on every invocation).

**If you move the open-knowledge repo**, re-run `./sandbox-recipes/bootstrap.sh` from the new location. It'll detect the path mismatch and print a warning telling you to update `~/.ok-projects.sh` manually (non-destructive — bootstrap never silently overwrites a user-managed entry).

---

## What each file / directory does

```
sandbox-recipes/
├── bootstrap.sh              # one-shot install + alias setup
├── README.md                 # you are here
├── ALIASES.md                # full alias reference + examples
├── URL-PATH-RESTRICTIONS.md  # why paths aren't filtered + workarounds
│
├── tier0-builtin-sandbox/    # Tier 0 — Seatbelt (kernel-level, no container)
│   ├── settings-interactive.json           # supervised daily use
│   ├── settings-unattended-trusted.json    # AFK on own code
│   ├── settings-unattended-hardened.json   # strict allowlist
│   ├── install.sh                          # called by bootstrap.sh
│   ├── ok-sandbox.sh                       # wrapper (called by ccs/ccu)
│   └── README.md
│
├── tier1-apple-container/    # Tier 1 — Apple Container microVM
│   ├── Containerfile                       # Debian + Node + Claude + bubblewrap + iptables
│   ├── entrypoint.sh                       # runs firewall-init, drops to claude user
│   ├── firewall-init.sh                    # guest-side iptables allowlist
│   ├── build.sh                            # called by bootstrap.sh
│   ├── ok-sandbox.sh                       # wrapper (called by ccb/ccbu)
│   └── README.md
│
├── tier1-matryoshka/         # Tier 1 — microVM + bubblewrap + Anthropic proxy
│   ├── Containerfile                       # extends tier1 with sandbox-runtime preinstalled
│   ├── settings.json                       # in-container ~/.claude/settings.json
│   ├── verify-matryoshka.sh                # smoke test: confirms bubblewrap composes
│   ├── build.sh                            # called by bootstrap.sh
│   ├── ok-sandbox.sh                       # wrapper (called by ccm/ccmu)
│   └── README.md
│
└── tier1-lima-vz/            # Tier 1 — Lima vz (macOS 13+, CNCF)
    ├── claude-sandbox.yaml                 # Lima VM config
    ├── setup.sh / ok-sandbox.sh / teardown.sh
    └── README.md
```

---

## Status (2026-04-23)

| Tier | Tested on | Status |
|---|---|---|
| 0 | claude 2.1.118 + macOS 26 | ✅ Validated |
| 1 Apple Container | container v0.11 + macOS 26 | ✅ Validated end-to-end (build, firewall allow/deny, entrypoint, non-TTY) |
| 1 Matryoshka | Same | ✅ `verify-matryoshka.sh` passes 5/5 after two Containerfile fixes (setuid bwrap + ripgrep) found during smoke-testing |
| 1 Lima vz | — | ⚠️ Config based on published docs; not yet end-to-end tested (needs `brew install lima`) |

---

## Prerequisites summary

| Tier | Install |
|---|---|
| 0 | `claude` v2.0+ (you have 2.1.118). macOS 13+ for Seatbelt. |
| 1 Apple Container | macOS 26 Tahoe + Apple Silicon, then `container` from [github.com/apple/container/releases](https://github.com/apple/container/releases) + `container system start --enable-kernel-install`. |
| 1 Matryoshka | Same as Tier 1 Apple Container. |
| 1 Lima vz | `brew install lima`. macOS 13+. |

Everything except Lima is auto-detected by `bootstrap.sh`.

---

## Repo-safety notes

- Nothing in here modifies product code (`packages/`, `docs/`, etc.) or build/test config (`turbo.json`, `biome.jsonc`).
- Recipes live outside the turbo graph — no impact on `bun run check` / `bun run build`.
- `bootstrap.sh` only writes to: `~/.claude/settings.json` (backed up), your shell rc (backed up), and container image storage.
