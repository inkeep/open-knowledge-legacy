# Shell Aliases for Sandbox Tiers

Short, typeable commands to launch each tier. Matches the `cc` / `cca` / `cco` pattern from [Andrew's .zshrc](../.zshrc).

## Quick start

```bash
# One-time: install Tier 0 profile, build Tier 1 images, print aliases
./sandbox-recipes/bootstrap.sh

# Paste the printed snippet into ~/.zshrc, then:
source ~/.zshrc
```

## Alias set

### Tier 0 (Seatbelt — kernel-level, no container)

| Alias | Command | Use for |
|---|---|---|
| `ccs` | `claude --effort max` | **S**andboxed interactive session — uses whatever's in `~/.claude/settings.json`. Drop-in for `cc`. |
| `ccu` | `claude --dangerously-skip-permissions --effort max` | **U**nattended — safe *because* sandbox is kernel-enforced AND `allowUnsandboxedCommands: false` is set in the `unattended-trusted`/`unattended-hardened` profile. Use for AFK work on your own code. |

### Tier 1 (Apple Container microVM)

| Alias | Command | Use for |
|---|---|---|
| `ccb` | `ok-sandbox.sh` (passes `$PWD`) | **B**oxed — per-container microVM. Real kernel boundary. |
| `ccbu` | `ok-sandbox.sh --unattended` | Boxed + unattended. Inside-container `--dangerously-skip-permissions`. |
| `ccm` | matryoshka `ok-sandbox.sh` | **M**atryoshka — microVM + bubblewrap + Anthropic's proxy. Strongest isolation in this set. |
| `ccmu` | matryoshka `ok-sandbox.sh --unattended` | Matryoshka + unattended. |

### Project + tier combos (extends your existing `cca` / `cco` pattern)

| Alias | What | Where |
|---|---|---|
| `ccso` | `cd ~/Documents/code/open-knowledge && ccs` | Tier 0 in open-knowledge |
| `ccbo` | `cd ~/Documents/code/open-knowledge && ccb` | Tier 1 in open-knowledge |
| `ccmo` | `cd ~/Documents/code/open-knowledge && ccm` | Matryoshka in open-knowledge |
| `ccsa` | `cd ~/Documents/code/agents-private && ccs` | Tier 0 in agents-private |
| `ccba` | `cd ~/Documents/code/agents-private && ccb` | Tier 1 in agents-private |
| `ccma` | `cd ~/Documents/code/agents-private && ccm` | Matryoshka in agents-private |

### Bootstrap

| Alias | What |
|---|---|
| `cc-setup` | Re-run `bootstrap.sh` — rebuild images, switch Tier 0 profile, etc. |

## Mnemonic

```
cc   — claude (base; your existing)
+ s  — sandbox (Seatbelt)
+ u  — unattended (skip-permissions)
+ b  — boxed (Apple Container)
+ m  — matryoshka (nested)
```

Second letter = project suffix (following your `o`/`a` convention for open-knowledge / agents-private).

## Why these shortcuts and not symlinks on PATH?

Considered symlinking each script into `~/.local/bin/ccb` etc. Rejected because:
1. You have the `~/.local/bin` PATH line already, but your existing `cc`/`cca`/`cco` are aliases — aliases keep tier shortcuts visually adjacent to your existing pattern in `.zshrc` (one file to inspect when something's wrong).
2. Function forms (`ccb() { … }`) pass `$@` through cleanly — you can do `ccb --cpu 8 -- --resume <id>` without escape gymnastics.
3. Aliases respect your shell's tab completion for the wrapped command (`claude`).

If you'd rather have them on PATH instead, drop these lines into `~/.local/bin/`:
```bash
ln -sf "$PWD/tier1-apple-container/ok-sandbox.sh"  ~/.local/bin/ccb
ln -sf "$PWD/tier1-matryoshka/ok-sandbox.sh"       ~/.local/bin/ccm
```

## What the aliases reference

```
$_OK_RECIPES = /Users/andrew/Documents/code/open-knowledge/sandbox-recipes
```

If you move the repo, re-run `./bootstrap.sh --print-aliases` from the new location and replace the snippet in your rc.

## How `cc` and the new aliases relate

Your existing `cc` alias uses `--permission-mode bypassPermissions` — that sidesteps Claude Code's own prompts entirely. **That flag is orthogonal to the sandbox.** If you want:

- **Prompts off + no sandbox** → your existing `cc` (current state; this session is running like this).
- **Prompts on + Seatbelt sandbox** → `ccs` (reduces prompts via auto-allow without disabling them).
- **Prompts off + Seatbelt sandbox** → `ccu` (true "AFK safe" — kernel enforces; claude asks nothing).
- **Prompts off + microVM + Seatbelt** → `ccmu` (strongest; for untrusted code).

Think of it as: the OS sandbox lets you safely drop the prompt layer, because the prompts are not load-bearing for safety anymore.
