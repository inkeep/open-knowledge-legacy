# Shell Aliases for Sandbox Tiers

Short, typeable commands to launch each tier, parameterized by project. Designed to scale to 10+ repos without alias combinatorial explosion.

## Shape

```
<tier-cmd> [project] [extra args...]
```

If the first arg matches a registered project shortcut, the function `cd`s there first. Otherwise all args pass through to `claude` (or the tier wrapper).

## One-shot install

```bash
./bootstrap.sh --install-aliases     # or --yes for fully non-interactive
# Installs Tier 0 profile, builds Tier 1 images, appends the alias block
# to ~/.zshrc (with backup). Re-runnable; won't double-append.
source ~/.zshrc
```

## The commands

### Tiers

| Command | Tier | What it launches |
|---|---|---|
| `ccs [project]` | 0 | **s**andbox — `claude --effort max` with Seatbelt sandbox from your settings |
| `ccu [project]` | 0 | **u**nattended — adds `--dangerously-skip-permissions`; safe because sandbox is kernel-enforced + escape hatch disabled in settings |
| `ccb [project]` | 1 | **b**oxed — Apple Container microVM |
| `ccbu [project]` | 1 | boxed + unattended (`--dangerously-skip-permissions` inside the microVM) |
| `ccm [project]` | 1 | **m**atryoshka — microVM + bubblewrap + Anthropic proxy |
| `ccmu [project]` | 1 | matryoshka + unattended |

### Helpers

| Command | What |
|---|---|
| `ccp <shortcut>` | cd to a registered project (no launch) |
| `ccp-list` | print the project registry |
| `cc-setup` | re-run bootstrap (rebuild images, switch Tier 0 profile, etc.) |

## Adding more projects

Open `~/.zshrc`, find the `_OK_PROJECTS` block, and add entries:

```bash
_OK_PROJECTS[ok]="$HOME/Documents/code/open-knowledge"     # default
_OK_PROJECTS[agents]="$HOME/Documents/code/agents-private" # default
_OK_PROJECTS[site]="$HOME/Documents/code/your-site"        # your own
_OK_PROJECTS[api]="$HOME/Documents/code/your-api"
_OK_PROJECTS[ml]="$HOME/Documents/code/ml-experiments"
```

Then `source ~/.zshrc`. No re-running bootstrap needed — the registry is just an associative array the tier functions look up.

## Usage examples

```bash
# In current directory
ccs                          # sandboxed claude in $PWD
ccb                          # boxed claude in $PWD
ccm --unattended             # args pass through to the tier wrapper

# With project shortcut
ccs ok                       # cd to open-knowledge + sandboxed claude
ccb agents                   # cd to agents-private + boxed claude
ccmu site                    # cd to site + matryoshka unattended

# With project + claude args
ccs ok --resume abc123       # cd to ok, resume session abc123
ccbu api -- --continue       # cd to api, boxed+unattended, continue last session

# Just cd, no launch (useful for shell navigation)
ccp ok                       # cd to open-knowledge
ccp agents                   # cd to agents-private

# Inspect what's registered
ccp-list
# ok           /Users/andrew/Documents/code/open-knowledge
# agents       /Users/andrew/Documents/code/agents-private
```

## Mnemonic

```
cc + s   sandbox (Seatbelt)
cc + u   unattended (skip-permissions — safe because sandbox is kernel-enforced)
cc + b   boxed (Apple Container microVM)
cc + m   matryoshka (microVM + bubblewrap + Anthropic proxy)
     + u append to b / m   same but --dangerously-skip-permissions inside
cc + p   project helper (cd only, or list)
```

Three letters max. Project is a positional arg, not encoded in the name.

## How this interacts with your existing `cc` alias

Your existing `.zshrc` has:

```bash
alias cc="claude --permission-mode bypassPermissions --effort max"
alias cca='cd ~/Documents/code/agents-private && cc'
alias cco='cd ~/Documents/code/open-knowledge && cc'
```

The new aliases are **additive** and orthogonal:

| Your existing | New equivalent | Difference |
|---|---|---|
| `cc` | (keep it) | Unsandboxed, bypasses prompts. Kept as the "I know what I'm doing" escape hatch. |
| `cco` | `ccs ok` or `ccu ok` | Sandboxed at OS level. `ccs` keeps claude's prompts; `ccu` drops them (safe because kernel enforces). |
| `cca` | `ccs agents` or `ccu agents` | Same. |

You can delete `cca`/`cco` if you want to migrate, or keep them alongside. The bootstrap won't touch them.

## When to use each

| Task | Command |
|---|---|
| Daily work on code you wrote (fewer prompts, safety net) | `ccs` or `ccu` |
| Unattended overnight run on your own code | `ccu` |
| Reviewing an OSS PR / dep you don't fully trust | `ccb <project>` |
| Reviewing code you actively suspect (supply-chain evaluation) | `ccmu <project>` |
| Quick navigation (no claude session) | `ccp <project>` |

## Path-filtering note

The network allowlist in all tiers is **domain-level**, not URL-path-level. `github.com` means all of GitHub, not just `github.com/inkeep/*`. See [URL-PATH-RESTRICTIONS.md](URL-PATH-RESTRICTIONS.md) for the four options (spoiler: use a fine-grained GitHub PAT for org scoping — it's cleaner than any network-layer trick).

## If you'd rather have shortcuts on PATH

The functions are zsh-native. If you want them as standalone scripts (accessible from any shell, inside Cursor's terminal, from cron, etc.):

```bash
mkdir -p ~/.local/bin
ln -sf "$_OK_RECIPES/tier1-apple-container/ok-sandbox.sh"  ~/.local/bin/ok-boxed
ln -sf "$_OK_RECIPES/tier1-matryoshka/ok-sandbox.sh"       ~/.local/bin/ok-matryoshka
```

Those scripts don't do project resolution (they mount `$PWD` directly), so you'd `cd` before invoking. Project shortcuts are a shell-level concern.
