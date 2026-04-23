#!/usr/bin/env bash
# One-shot bootstrap: prepare all sandbox tiers for use.
#
#   ./bootstrap.sh                          # interactive — asks which Tier 0 profile
#   ./bootstrap.sh unattended-trusted       # install Tier 0 profile non-interactively
#   ./bootstrap.sh --install-aliases        # append aliases to ~/.zshrc (shell functions)
#   ./bootstrap.sh --install-path           # install ccs/ccu/ccb/... to ~/.local/bin
#                                           # (PATH scripts work from Cursor, CI, cron, etc.)
#   ./bootstrap.sh --print-aliases          # only print the alias snippet (don't set up anything)
#   ./bootstrap.sh --skip-build             # skip building Tier 1 images
#   ./bootstrap.sh --yes                    # non-interactive: enable --install-aliases
#                                           # and --install-path with default profile
#
# What it does (in order):
#   1. Install a Tier 0 Claude Code settings profile into ~/.claude/settings.json
#   2. Build the Tier 1 Apple Container image (if `container` is installed)
#   3. Build the Tier 1 Matryoshka image (if `container` is installed)
#   4. If --install-aliases: append the alias block to your shell rc
#   5. If --install-path:    install launcher scripts to ~/.local/bin (or similar)
#   6. Ensure ~/.ok-projects.sh exists (shared registry between rc block + PATH scripts)
#
# Idempotent — re-running is safe. Existing ~/.claude/settings.json and the
# target shell rc file are backed up to .bak.<timestamp> before modification.

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
INSTALL_ALIASES=0
INSTALL_PATH=0
NON_INTERACTIVE=0

log() { printf '\033[1;34m[bootstrap]\033[0m %s\n' "$*" >&2; }
warn() { printf '\033[1;33m[bootstrap]\033[0m %s\n' "$*" >&2; }
err() { printf '\033[1;31m[bootstrap]\033[0m %s\n' "$*" >&2; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    interactive|unattended-trusted|unattended-hardened)
      PROFILE="$1"; shift ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    --print-aliases) PRINT_ONLY=1; shift ;;
    --install-aliases) INSTALL_ALIASES=1; shift ;;
    --install-path) INSTALL_PATH=1; shift ;;
    --yes|-y) NON_INTERACTIVE=1; INSTALL_ALIASES=1; INSTALL_PATH=1; shift ;;
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
#
# Shape:  <tier-cmd> [-p <project>] [claude args...]
#   -p <project>   cd to the registered project before launching
#                  (see _OK_PROJECTS below; list with ccp-list)
#
# Note: claude's own -p (print mode) is shadowed by our -p. To use
# claude's print mode from these aliases, use --print instead.
#
# Tiers: ccs (Seatbelt), ccu (Seatbelt + skip-permissions),
#        ccb (Apple Container), ccbu (+ unattended),
#        ccm (Matryoshka),       ccmu (+ unattended).
# Helpers: ccp <shortcut> (cd only), ccp-list (print registry).
export _OK_RECIPES="$STABLE_DIR"

# ── Project shortcuts: defaults + user registry ──────────────────────────
# Edit ~/.ok-projects.sh to add repos (shared with PATH scripts).
typeset -gA _OK_PROJECTS 2>/dev/null || declare -A _OK_PROJECTS
_OK_PROJECTS[ok]="\$HOME/Documents/code/open-knowledge"
_OK_PROJECTS[agents]="\$HOME/Documents/code/agents-private"
[[ -f "\$HOME/.ok-projects.sh" ]] && source "\$HOME/.ok-projects.sh"

# ── Internal: resolve a project shortcut to an absolute path ──────────────
_ok_resolve_project() {
  local key="\${1:-}"
  [[ -z "\$key" ]] && return 1
  [[ -n "\${_OK_PROJECTS[\$key]:-}" ]] || return 1
  printf '%s' "\${_OK_PROJECTS[\$key]}"
}

# ── Internal: shared help printers (identical to bin/ok-launcher's) ──────
_ok_print_help() {
  local name="\$1"
  local tier_desc=""
  case "\$name" in
    ccs)  tier_desc="Tier 0 — Seatbelt sandbox (kernel-level, no container)." ;;
    ccu)  tier_desc="Tier 0 — Seatbelt + unattended (--dangerously-skip-permissions)." ;;
    ccb)  tier_desc="Tier 1 — Apple Container microVM (real kernel boundary)." ;;
    ccbu) tier_desc="Tier 1 — Apple Container microVM + unattended." ;;
    ccm)  tier_desc="Tier 1 Matryoshka — microVM + bubblewrap + Anthropic proxy." ;;
    ccmu) tier_desc="Tier 1 Matryoshka + unattended (strongest in this set)." ;;
  esac
  cat >&2 <<HELP
\$name — \$tier_desc

Usage:
  \$name [-p <project>] [claude args...]
  \$name -- [args to claude, bypasses launcher flags]
  \$name --about       # show tier comparison chart
  \$name --help        # this message

Examples:
  \$name                       # launch in current directory
  \$name -p ok                 # cd to project 'ok', then launch
  \$name -p ok -r abc123       # + pass claude's -r (resume session)
  \$name -- --help             # show claude's own help (bypasses launcher)

Project registry: ~/.ok-projects.sh   (list via 'ccp-list')
Claude's -p (print mode) is shadowed by our -p. Use --print instead.
HELP
}

_ok_print_about() {
  cat >&2 <<'ABOUT'
Open Knowledge sandbox-recipes — tier comparison

  Command     Tier                                Permissions     Use for
  ─────────   ─────────────────────────────────   ─────────────   ──────────────────────────────
  cc          (your existing; no sandbox)         bypass prompts  I-know-what-I'm-doing escape
  ccs         Tier 0 — Seatbelt (kernel)          interactive     daily work on trusted code
  ccu         Tier 0 — Seatbelt                   unattended      AFK runs on trusted code
  ccb         Tier 1 — Apple Container microVM    interactive     OSS PR / partner code review
  ccbu        Tier 1 — Apple Container microVM    unattended      unattended untrusted-code
  ccm         Tier 1 — Matryoshka (VM+bubblewrap) interactive     strongest; semi-trusted review
  ccmu        Tier 1 — Matryoshka                 unattended      strongest + AFK

  Shape:      <cmd> [-p <project>] [claude args]
  Project:    -p <key>    (see ~/.ok-projects.sh or run 'ccp-list')
  Helpers:    ccp <key>   (cd only)     ccp-list (show registry)     cc-setup (re-run bootstrap)

  Full docs: \$_OK_RECIPES/ALIASES.md
ABOUT
}

# ── Internal: scan args for --help/--about; print and return 10 if found ─
# Callers treat return=10 as "help handled, don't launch".
_ok_maybe_help() {
  local name="\$1"; shift
  local arg
  for arg in "\$@"; do
    case "\$arg" in
      --) return 0 ;;  # stop scanning; pass-through
      --help|-h) _ok_print_help "\$name"; return 10 ;;
      --about|--tiers) _ok_print_about; return 10 ;;
    esac
  done
}

# ── Internal: extract -p <proj> anywhere in args; cd to project, leave
#             remaining args in a global _OK_REMAINING_ARGS. Returns 0 on
#             success (incl. -p absent), 1 on error (unknown proj, missing val).
_ok_extract_project() {
  local -a remaining=()
  local proj="" dir=""
  while [[ \$# -gt 0 ]]; do
    case "\$1" in
      --)
        shift
        remaining+=("\$@")
        break
        ;;
      -p)
        if [[ -z "\${2:-}" ]] || [[ "\${2:-}" == -* ]]; then
          echo "error: -p requires a project shortcut (see 'ccp-list')" >&2
          return 1
        fi
        if [[ -n "\$proj" ]]; then
          echo "error: -p specified more than once" >&2
          return 1
        fi
        proj="\$2"
        shift 2
        ;;
      *)
        remaining+=("\$1")
        shift
        ;;
    esac
  done
  if [[ -n "\$proj" ]]; then
    if ! dir="\$(_ok_resolve_project "\$proj")"; then
      echo "error: unknown project shortcut: '\$proj'" >&2
      echo "       use 'ccp-list' to see registered shortcuts" >&2
      return 1
    fi
    cd "\$dir" || return 1
  fi
  _OK_REMAINING_ARGS=("\${remaining[@]}")
}

# ── Tier 0: Seatbelt sandbox (kernel-level, no container) ────────────────
ccs() {
  _ok_maybe_help ccs "\$@"; local rc=\$?; [[ \$rc == 10 ]] && return 0
  _OK_REMAINING_ARGS=()
  _ok_extract_project "\$@" || return
  command claude --effort max "\${_OK_REMAINING_ARGS[@]}"
}
ccu() {
  _ok_maybe_help ccu "\$@"; local rc=\$?; [[ \$rc == 10 ]] && return 0
  _OK_REMAINING_ARGS=()
  _ok_extract_project "\$@" || return
  command claude --dangerously-skip-permissions --effort max "\${_OK_REMAINING_ARGS[@]}"
}

# ── Tier 1: Apple Container microVM ──────────────────────────────────────
ccb() {
  _ok_maybe_help ccb "\$@"; local rc=\$?; [[ \$rc == 10 ]] && return 0
  _OK_REMAINING_ARGS=()
  _ok_extract_project "\$@" || return
  "\$_OK_RECIPES/tier1-apple-container/ok-sandbox.sh" "\${_OK_REMAINING_ARGS[@]}"
}
ccbu() {
  _ok_maybe_help ccbu "\$@"; local rc=\$?; [[ \$rc == 10 ]] && return 0
  _OK_REMAINING_ARGS=()
  _ok_extract_project "\$@" || return
  "\$_OK_RECIPES/tier1-apple-container/ok-sandbox.sh" --unattended "\${_OK_REMAINING_ARGS[@]}"
}

# ── Tier 1 Matryoshka: microVM + bubblewrap + Anthropic proxy ────────────
ccm() {
  _ok_maybe_help ccm "\$@"; local rc=\$?; [[ \$rc == 10 ]] && return 0
  _OK_REMAINING_ARGS=()
  _ok_extract_project "\$@" || return
  "\$_OK_RECIPES/tier1-matryoshka/ok-sandbox.sh" "\${_OK_REMAINING_ARGS[@]}"
}
ccmu() {
  _ok_maybe_help ccmu "\$@"; local rc=\$?; [[ \$rc == 10 ]] && return 0
  _OK_REMAINING_ARGS=()
  _ok_extract_project "\$@" || return
  "\$_OK_RECIPES/tier1-matryoshka/ok-sandbox.sh" --unattended "\${_OK_REMAINING_ARGS[@]}"
}

# ── Project helpers ───────────────────────────────────────────────────────
ccp() {
  local dir
  if dir="\$(_ok_resolve_project "\${1:-}")"; then
    cd "\$dir"
  else
    echo "[ok] unknown project shortcut: \${1:-<empty>}" >&2
    echo "Use 'ccp-list' to see registered shortcuts." >&2
    return 1
  fi
}
ccp-list() {
  # zsh-native (the aliases target zsh). Bash users: replace \${(k)arr} with \${!arr[@]}.
  local k
  for k in \${(k)_OK_PROJECTS}; do
    printf '%-12s %s\n' "\$k" "\${_OK_PROJECTS[\$k]}"
  done
}

# ── Re-run bootstrap (rebuild images, switch Tier 0 profile, etc.) ────────
alias cc-setup='"\$_OK_RECIPES/bootstrap.sh"'
# ---- end sandbox-recipes ----
EOF
}

detect_shell_rc() {
  # Pick the shell rc file based on $SHELL. Fall back to ~/.zshrc if uncertain.
  case "${SHELL:-}" in
    */zsh)  echo "$HOME/.zshrc" ;;
    */bash) echo "$HOME/.bashrc" ;;
    *)      echo "$HOME/.zshrc" ;;   # macOS default bias
  esac
}

ALIAS_BLOCK_START="# ---- Open Knowledge sandbox-recipes shortcuts ----"
ALIAS_BLOCK_END="# ---- end sandbox-recipes ----"

# Symlinks we install to PATH — all point at the same ok-launcher dispatcher.
LAUNCHER_NAMES=(ccs ccu ccb ccbu ccm ccmu)

detect_bin_dir() {
  # Prefer ~/.local/bin if on PATH, else fall back through common choices.
  if [[ ":$PATH:" == *":$HOME/.local/bin:"* ]]; then
    echo "$HOME/.local/bin"; return
  fi
  if [[ ":$PATH:" == *":$HOME/bin:"* ]]; then
    echo "$HOME/bin"; return
  fi
  # Last resort — not on PATH but conventional
  echo "$HOME/.local/bin"
}

ensure_ok_projects_file() {
  local target="$HOME/.ok-projects.sh"
  if [[ -f "$target" ]]; then
    log "~/.ok-projects.sh already exists — leaving as-is (add entries there)."
    return
  fi
  cat > "$target" <<'EOF'
# ~/.ok-projects.sh
# Sourced by both the zshrc alias block and the ~/.local/bin launcher scripts.
# Add project shortcuts here. Keys are arbitrary; values are absolute paths.
#
# _OK_PROJECTS is already declared by the time this file runs.

# _OK_PROJECTS[site]="$HOME/Documents/code/your-site"
# _OK_PROJECTS[api]="$HOME/Documents/code/your-api"
# _OK_PROJECTS[ml]="$HOME/Documents/code/ml-experiments"
EOF
  log "Created ~/.ok-projects.sh (add your own repos there)."
}

install_launcher_to_path() {
  local bin_dir
  bin_dir="$(detect_bin_dir)"
  local launcher_src="$STABLE_DIR/bin/ok-launcher"
  local launcher_dst="$bin_dir/ok-launcher"

  if [[ ! -f "$launcher_src" ]]; then
    err "Missing launcher source: $launcher_src"
    return 1
  fi

  mkdir -p "$bin_dir"

  # Warn if $bin_dir isn't on PATH so users don't hit a silent fail.
  if [[ ":$PATH:" != *":$bin_dir:"* ]]; then
    warn "$bin_dir is NOT on your PATH."
    warn "Add this to ~/.zshrc:   export PATH=\"\$HOME/.local/bin:\$PATH\""
  fi

  # Write the dispatcher with SANDBOX_RECIPES baked in.
  sed "s|@@SANDBOX_RECIPES@@|$STABLE_DIR|g" "$launcher_src" > "$launcher_dst"
  chmod +x "$launcher_dst"
  log "Installed dispatcher: $launcher_dst"

  # Symlink each alias name at $bin_dir.
  local name
  for name in "${LAUNCHER_NAMES[@]}"; do
    ln -sf "$launcher_dst" "$bin_dir/$name"
    log "  symlinked: $bin_dir/$name -> ok-launcher"
  done

  log ""
  log "PATH scripts installed. Try from any shell (Cursor terminal, CI, etc.):"
  log "    ccs -p ok            # Tier 0 in open-knowledge"
  log "    ccb -p agents        # Tier 1 in agents-private"
  log ""
  log "Note: 'ccp' / 'ccp-list' remain as zsh functions (cd-only, can't be PATH scripts)."
}

append_aliases_to_rc() {
  local rc="$1"

  # Detect any existing block so we can replace, not duplicate.
  if [[ -f "$rc" ]] && grep -qF "$ALIAS_BLOCK_START" "$rc" 2>/dev/null; then
    log "Existing sandbox-recipes block found in $rc — replacing in place."
    local ts bak tmp
    ts="$(date +%Y%m%d-%H%M%S)"
    bak="$rc.bak.$ts"
    tmp="$rc.tmp.$ts"
    cp -p "$rc" "$bak"
    # Delete lines from ALIAS_BLOCK_START through ALIAS_BLOCK_END (inclusive).
    # awk is portable and doesn't rely on GNU sed.
    awk -v start="$ALIAS_BLOCK_START" -v end="$ALIAS_BLOCK_END" '
      $0 == start { in_block = 1; next }
      in_block && $0 == end { in_block = 0; next }
      !in_block { print }
    ' "$rc" > "$tmp"
    mv "$tmp" "$rc"
    log "Backed up previous version to $bak"
  elif [[ -f "$rc" ]]; then
    local ts bak
    ts="$(date +%Y%m%d-%H%M%S)"
    bak="$rc.bak.$ts"
    cp -p "$rc" "$bak"
    log "Backed up $rc → $bak"
  fi

  # Append the new block with a leading blank line for readability.
  {
    printf '\n'
    print_aliases
  } >> "$rc"

  log "Appended sandbox-recipes alias block to $rc"
}

if (( PRINT_ONLY )); then
  print_aliases
  exit 0
fi

# ============================================================
# Step 1: Tier 0 profile install
# ============================================================

if [[ -z "$PROFILE" ]]; then
  if (( NON_INTERACTIVE )); then
    PROFILE="unattended-trusted"
    log "Non-interactive: defaulting to Tier 0 profile '$PROFILE'"
  else
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
# Step 3: Ensure shared project registry file
# ============================================================

ensure_ok_projects_file

# ============================================================
# Step 4: Install (or print) the alias block in shell rc
# ============================================================

RC_FILE="$(detect_shell_rc)"

if (( ! INSTALL_ALIASES )) && (( ! INSTALL_PATH )) && (( ! NON_INTERACTIVE )); then
  log ""
  log "Installation options:"
  log "  [a] Shell aliases in $RC_FILE  (zsh functions: ccs, ccu, ccb, ccbu, ccm, ccmu, ccp, ccp-list)"
  log "  [p] PATH scripts in ~/.local/bin (ccs, ccu, ccb, ccbu, ccm, ccmu — work from Cursor, CI, cron)"
  log "  [b] Both  (recommended)"
  log "  [n] Neither — I'll install manually"
  read -r -p "[bootstrap] Choice [a/p/B/n]: " choice
  case "${choice:-b}" in
    [aA]*) INSTALL_ALIASES=1 ;;
    [pP]*) INSTALL_PATH=1 ;;
    [bB]*|"") INSTALL_ALIASES=1; INSTALL_PATH=1 ;;
    [nN]*) ;;
    *) err "Invalid choice"; exit 64 ;;
  esac
fi

log ""
if (( INSTALL_ALIASES )); then
  append_aliases_to_rc "$RC_FILE"
fi

# ============================================================
# Step 5: Install PATH scripts (launchers in ~/.local/bin)
# ============================================================

if (( INSTALL_PATH )); then
  install_launcher_to_path
fi

log ""
if (( INSTALL_ALIASES || INSTALL_PATH )); then
  log "Setup complete."
  if (( INSTALL_ALIASES )); then
    log "  - Reload shell to pick up functions:  source $RC_FILE"
  fi
  if (( INSTALL_PATH )); then
    log "  - PATH scripts active now (new shell picks them up automatically)."
  fi
else
  log "Setup complete. Nothing installed to shell — here's the alias snippet to paste manually:"
  log ""
  echo "# ─────────────────── copy below ───────────────────"
  print_aliases
  echo "# ─────────────────── copy above ───────────────────"
  log ""
  log "Paste into your shell rc, then:  source $RC_FILE"
fi

# Warn if the path points at an ephemeral worktree dir
if [[ "$STABLE_DIR" == *".claude/worktrees/"* ]]; then
  log ""
  warn "Heads up: the aliases point at a git worktree path."
  warn "Worktrees get cleaned up — aliases will break when this one is removed."
  warn "After your PR merges, re-run bootstrap.sh from the main repo to regenerate"
  warn "the aliases with a stable path."
fi
