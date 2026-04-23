#!/usr/bin/env bash
# One-shot bootstrap: prepare all sandbox tiers for use.
#
#   ./bootstrap.sh                          # interactive — asks which Tier 0 profile
#   ./bootstrap.sh unattended-trusted       # install Tier 0 profile non-interactively
#   ./bootstrap.sh --print-aliases          # only print the alias snippet
#   ./bootstrap.sh --skip-build             # skip building Tier 1 images
#
# What it does (in order):
#   1. Install a Tier 0 Claude Code settings profile into ~/.claude/settings.json
#   2. Build the Tier 1 Apple Container image (if `container` is installed)
#   3. Build the Tier 1 Matryoshka image (if `container` is installed)
#   4. Print a ready-to-paste alias block for your shell rc
#
# Idempotent — re-running is safe.

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Resolve the "stable" recipes path for aliases. If we're running from a git
# worktree (common when iterating on this PR), the aliases should point at the
# main repo — worktree dirs get cleaned up, but the main repo stays.
resolve_stable_dir() {
  local current="$DIR"
  if command -v git >/dev/null 2>&1 && git -C "$current" rev-parse --show-toplevel >/dev/null 2>&1; then
    local worktree_root main_git_dir main_repo_root
    worktree_root="$(git -C "$current" rev-parse --show-toplevel)"
    main_git_dir="$(git -C "$current" rev-parse --git-common-dir)"
    # git-common-dir is the main .git (file or dir); the main repo root is its parent
    main_repo_root="$(cd "$(dirname "$main_git_dir")" && pwd)"
    if [[ "$worktree_root" != "$main_repo_root" ]]; then
      # In a worktree: aliases should point at the main repo's sandbox-recipes
      local rel_from_worktree="${current#$worktree_root/}"
      local stable="$main_repo_root/$rel_from_worktree"
      if [[ -d "$stable" ]]; then
        echo "$stable"
        return
      fi
    fi
  fi
  echo "$current"
}

STABLE_DIR="$(resolve_stable_dir)"
PROFILE=""
SKIP_BUILD=0
PRINT_ONLY=0

log() { printf '\033[1;34m[bootstrap]\033[0m %s\n' "$*" >&2; }
warn() { printf '\033[1;33m[bootstrap]\033[0m %s\n' "$*" >&2; }
err() { printf '\033[1;31m[bootstrap]\033[0m %s\n' "$*" >&2; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    interactive|unattended-trusted|unattended-hardened)
      PROFILE="$1"; shift ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    --print-aliases) PRINT_ONLY=1; shift ;;
    --help|-h)
      head -n 18 "$0" | tail -n 16
      exit 0
      ;;
    *) err "Unknown arg: $1"; exit 64 ;;
  esac
done

print_aliases() {
  local note=""
  if [[ "$STABLE_DIR" != "$DIR" ]]; then
    note=$'\n'"# Note: detected a git worktree; aliases point at the main repo path"$'\n'"# ($STABLE_DIR) so they keep working after the worktree is cleaned up."
  fi
  cat <<EOF
# ---- Open Knowledge sandbox-recipes shortcuts ----
# Generated: $(date +%Y-%m-%d)${note}
export _OK_RECIPES="$STABLE_DIR"

# Tier 0 — Seatbelt sandbox (kernel-level, no container).
# Sandbox config lives in ~/.claude/settings.json; this alias just invokes claude.
alias ccs='claude --effort max'
alias ccu='claude --dangerously-skip-permissions --effort max'

# Tier 1 — Apple Container microVM.
ccb()  { "\$_OK_RECIPES/tier1-apple-container/ok-sandbox.sh" "\$@"; }
ccbu() { "\$_OK_RECIPES/tier1-apple-container/ok-sandbox.sh" --unattended "\$@"; }

# Tier 1 Matryoshka — microVM + bubblewrap + Anthropic proxy.
ccm()  { "\$_OK_RECIPES/tier1-matryoshka/ok-sandbox.sh" "\$@"; }
ccmu() { "\$_OK_RECIPES/tier1-matryoshka/ok-sandbox.sh" --unattended "\$@"; }

# Project + tier combos (cd then launch) — matches your existing cca/cco pattern.
alias ccso='cd \$HOME/Documents/code/open-knowledge && ccs'
alias ccbo='cd \$HOME/Documents/code/open-knowledge && ccb'
alias ccmo='cd \$HOME/Documents/code/open-knowledge && ccm'
alias ccsa='cd \$HOME/Documents/code/agents-private && ccs'
alias ccba='cd \$HOME/Documents/code/agents-private && ccb'
alias ccma='cd \$HOME/Documents/code/agents-private && ccm'

# Re-run bootstrap (rebuild images, switch Tier 0 profile, etc.)
alias cc-setup='"\$_OK_RECIPES/bootstrap.sh"'
# ---- end sandbox-recipes ----
EOF
}

if (( PRINT_ONLY )); then
  print_aliases
  exit 0
fi

# ============================================================
# Step 1: Tier 0 profile install
# ============================================================

if [[ -z "$PROFILE" ]]; then
  log "Which Tier 0 profile would you like installed to ~/.claude/settings.json?"
  log ""
  log "  1) interactive          — supervised use; escape hatch available"
  log "  2) unattended-trusted   — AFK on YOUR OWN code; escape hatch disabled"
  log "  3) unattended-hardened  — strict allowlist (only api.anthropic.com)"
  log "  4) skip                 — I'll pick later or I've already installed one"
  log ""
  read -r -p "[bootstrap] Choice [1-4]: " choice
  case "$choice" in
    1) PROFILE=interactive ;;
    2) PROFILE=unattended-trusted ;;
    3) PROFILE=unattended-hardened ;;
    4) PROFILE="" ;;
    *) err "Invalid choice"; exit 64 ;;
  esac
fi

if [[ -n "$PROFILE" ]]; then
  log "Installing Tier 0 profile: $PROFILE"
  "$DIR/tier0-builtin-sandbox/install.sh" "$PROFILE"
  log "Tier 0 profile installed."
else
  warn "Skipping Tier 0 profile install."
fi

# ============================================================
# Step 2: Tier 1 image builds
# ============================================================

if (( SKIP_BUILD )); then
  warn "--skip-build set; skipping container image builds."
elif ! command -v container >/dev/null 2>&1; then
  warn "'container' CLI not installed; skipping Tier 1 image builds."
  warn "Install Apple Container from https://github.com/apple/container/releases, then re-run."
else
  if ! container system status 2>&1 | grep -q running; then
    log "Apple Container service not running; starting with --enable-kernel-install..."
    container system start --enable-kernel-install
  fi

  log "Building Tier 1 Apple Container image..."
  "$DIR/tier1-apple-container/build.sh" >/dev/null
  log "  ✓ claude-sandbox:latest"

  log "Building Tier 1 Matryoshka image..."
  "$DIR/tier1-matryoshka/build.sh" >/dev/null
  log "  ✓ claude-matryoshka:latest"

  log "Running matryoshka verify (will catch any kernel / capability regressions)..."
  if container run --rm claude-matryoshka:latest /home/claude/verify-matryoshka.sh >/dev/null 2>&1; then
    log "  ✓ matryoshka verify PASS"
  else
    warn "  ✗ matryoshka verify FAIL — run ./tier1-matryoshka/verify-matryoshka.sh for details."
  fi
fi

# ============================================================
# Step 3: Print alias snippet
# ============================================================

log ""
log "Setup complete. Paste this into your ~/.zshrc (or ~/.bashrc):"
log ""
echo "# ─────────────────── copy below ───────────────────"
print_aliases
echo "# ─────────────────── copy above ───────────────────"
log ""
log "After pasting, reload your shell:  source ~/.zshrc"
log ""
log "Then: try 'ccs' (Tier 0 sandbox) or 'ccb' (Tier 1 Apple Container)."

# Warn if the path looks like a worktree (ephemeral)
if [[ "$STABLE_DIR" == *".claude/worktrees/"* ]]; then
  log ""
  warn "Heads up: the path above points at a git worktree."
  warn "Worktrees get cleaned up — aliases will break when this one is removed."
  warn "After your PR merges, re-run bootstrap.sh from the main repo to regenerate"
  warn "the aliases with a stable path."
fi
