# Shell Aliases for Sandbox Tiers

Short, typeable commands to launch each tier. Project is selected with `-p <shortcut>` so it doesn't collide with claude's positional prompt and works order-independently with any other claude flag.

## Shape

```
<tier-cmd> [-p <project>] [claude args...]
```

`-p` can appear anywhere in the args. All other flags pass through to `claude` (or the Tier 1 wrapper) untouched.

## One-shot install

Two installation surfaces, use either or both:

```bash
./bootstrap.sh --install-aliases    # zsh functions in ~/.zshrc (includes ccp, ccp-list)
./bootstrap.sh --install-path       # PATH scripts in ~/.local/bin (works in Cursor, CI, cron)
./bootstrap.sh -y                   # non-interactive: install BOTH, default profile
```

- **--install-aliases**: appends zsh functions to `~/.zshrc`. You get the full set including `ccp`/`ccp-list` (which can't work as PATH scripts — a child process can't change parent cwd). Works only in zsh sessions that sourced `~/.zshrc`.
- **--install-path**: installs one dispatcher to `~/.local/bin/ok-launcher` with symlinks `ccs`, `ccu`, `ccb`, `ccbu`, `ccm`, `ccmu` all pointing at it. Works from any process that honors `$PATH` (including Cursor's integrated terminal, cron jobs, IDE "run" actions, and bash/sh sessions).
- **Both**: recommended. Redundant but not conflicting — shell functions shadow PATH scripts in interactive shells; PATH scripts take over when functions aren't loaded.

Both flows share `~/.ok-projects.sh` as the project registry. Edit it once; both installations see the update.

Idempotent — re-running replaces the alias block + overwrites launcher symlinks.

## Commands

### Tiers

| Command | Tier | What it launches |
|---|---|---|
| `ccs` | 0 | **s**andbox — `claude --effort max` with Seatbelt |
| `ccu` | 0 | **u**nattended — adds `--dangerously-skip-permissions` (safe because sandbox kernel-enforces + escape hatch disabled) |
| `ccb` | 1 | **b**oxed — Apple Container microVM |
| `ccbu` | 1 | boxed + unattended |
| `ccm` | 1 | **m**atryoshka — microVM + bubblewrap + Anthropic proxy |
| `ccmu` | 1 | matryoshka + unattended |

### Helpers

| Command | What |
|---|---|
| `ccp <shortcut>` | cd to a registered project (no launch) |
| `ccp-list` | print the project registry |
| `cc-setup` | re-run bootstrap (rebuild images, switch Tier 0 profile) |

## Usage examples

```bash
# In current directory (no project flag)
ccs                                 # sandboxed claude in $PWD
ccb                                 # boxed claude in $PWD
ccs -r abc123                       # sandboxed, resume session abc123

# With project shortcut
ccs -p ok                           # cd to 'ok' + sandboxed claude
ccb -p agents                       # cd to 'agents' + boxed claude
ccmu -p site                        # matryoshka unattended in 'site'

# Project + any claude flag (order doesn't matter)
ccs -p ok -r abc123                 # cd to ok, resume session
ccs -r abc123 -p ok                 # same — -p scans all args
ccs -p api --model opus             # cd to api, claude with opus
ccbu -p ml -- --resume xyz          # boxed unattended, pass --resume through

# Non-launch helpers
ccp ok                              # just cd
ccp-list                            # inspect registry
```

## Adding your repos

Open `~/.zshrc`, find the `_OK_PROJECTS` block, add entries:

```bash
_OK_PROJECTS[ok]="$HOME/Documents/code/open-knowledge"       # installed by default
_OK_PROJECTS[agents]="$HOME/Documents/code/agents-private"   # installed by default
_OK_PROJECTS[site]="$HOME/Documents/code/your-site"          # your additions
_OK_PROJECTS[api]="$HOME/Documents/code/your-api"
_OK_PROJECTS[ml]="$HOME/Documents/code/ml-experiments"
```

`source ~/.zshrc` → `ccs -p ml` works immediately. No bootstrap re-run needed.

## Error cases (deliberate — they're guardrails)

```bash
ccs -p                              # error: -p requires a project shortcut
ccs -p -r abc                       # error: next arg is a flag, not a project
ccs -p nonexistent                  # error: unknown project shortcut — with hint to run ccp-list
ccs -p ok -p agents                 # error: -p specified more than once
```

## The `-p` collision with claude's print mode

Claude's own CLI uses `-p` / `--print` for print mode (non-interactive, pipe-friendly output). Our `-p` **consumes the flag before claude sees it**.

To use claude's print mode from these aliases, use the long form:

```bash
ccs --print "summarize the diff"    # → claude --effort max --print "summarize the diff"
ccs -p ok --print "..."             # project + print mode, both work
```

If you forget and type `ccs -p ...` expecting print mode, you'll get an error (if the arg to `-p` doesn't look like a project) — loud, not silent.

## Mnemonic

```
cc + s    sandbox (Seatbelt)
cc + u    unattended (skip-permissions — safe because sandbox is kernel-enforced)
cc + b    boxed (Apple Container microVM)
cc + m    matryoshka (microVM + bubblewrap + Anthropic proxy)
     + u  append to b / m   same but --dangerously-skip-permissions inside
cc + p    project helper (cd only, or list)
  -p KEY  cd to a registered project before launching any tier
```

## How this interacts with your existing `cc` alias

Your `.zshrc` has:

```bash
alias cc="claude --permission-mode bypassPermissions --effort max"
alias cca='cd ~/Documents/code/agents-private && cc'
alias cco='cd ~/Documents/code/open-knowledge && cc'
```

The new aliases are **additive** — existing ones untouched:

| Your existing | New equivalent | Difference |
|---|---|---|
| `cc` | (keep) | Unsandboxed, bypasses prompts. Your "I know what I'm doing" escape hatch. |
| `cco` | `ccs -p ok` or `ccu -p ok` | Sandboxed at OS level. `ccs` keeps claude's prompts; `ccu` drops them safely. |
| `cca` | `ccs -p agents` or `ccu -p agents` | Same. |

You can delete `cca`/`cco` if you want to migrate, or keep alongside. Bootstrap won't touch them.

## When to use each

| Task | Command |
|---|---|
| Daily work on your own code (fewer prompts, safety net) | `ccs` or `ccu` |
| Unattended overnight on your own code | `ccu -p <repo>` |
| OSS PR / partner code review | `ccb -p <repo>` |
| Reviewing actively suspicious code | `ccmu -p <repo>` |
| Quick navigation (no claude) | `ccp <shortcut>` |

## Path-filtering note

Network allowlist in all tiers is **domain-level**, not URL-path. See [URL-PATH-RESTRICTIONS.md](URL-PATH-RESTRICTIONS.md) for the four options (spoiler: fine-grained GitHub PAT for github.com/org scoping).

## Shared project registry: `~/.ok-projects.sh`

Bootstrap creates this file on first install. Edit it to add repos — both the zsh functions and the PATH scripts source it:

```bash
# ~/.ok-projects.sh
_OK_PROJECTS[site]="$HOME/Documents/code/your-site"
_OK_PROJECTS[api]="$HOME/Documents/code/your-api"
_OK_PROJECTS[ml]="$HOME/Documents/code/ml-experiments"
```

No bootstrap re-run needed. No double-maintenance between zshrc and PATH scripts.

## Under the hood — the PATH install

`--install-path` installs exactly:

- `~/.local/bin/ok-launcher` (copy of the dispatcher template, with `SANDBOX_RECIPES` absolute path baked in)
- `~/.local/bin/ccs` → symlink to `ok-launcher`
- `~/.local/bin/ccu` → symlink
- `~/.local/bin/ccb` → symlink
- `~/.local/bin/ccbu` → symlink
- `~/.local/bin/ccm` → symlink
- `~/.local/bin/ccmu` → symlink

Each symlink runs the same script, which dispatches on `${0:t}` (its own basename) to pick the tier. Moving the repo? Re-run `bootstrap.sh --install-path` to regenerate `ok-launcher` with the new absolute path.

`ccp` / `ccp-list` / `cc-setup` stay as zsh functions only — they manipulate the parent shell's state and can't be packaged as PATH scripts.
