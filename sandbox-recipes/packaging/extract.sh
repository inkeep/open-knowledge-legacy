#!/usr/bin/env bash
# Extract sandbox-recipes/ into a standalone repo ready for publishing.
#
# Run from the root of the open-knowledge clone (on `main`, after PR #291 is merged):
#
#   git subtree split --prefix=sandbox-recipes -b claude-sandbox-extracted
#   ./sandbox-recipes/packaging/extract.sh [target-dir]
#
# Default target-dir: $HOME/Documents/code/claude-sandbox
#
# What this does:
#   1. Clones the 'claude-sandbox-extracted' branch into <target-dir>
#   2. Renames branch to main, removes the origin remote
#   3. Copies install.sh.template → <target-dir>/install.sh (the curl target)
#   4. Copies README.template.md → <target-dir>/README.md (standalone framing)
#   5. Writes a minimal MIT LICENSE
#   6. Applies small genericization patches (remove the auto-detected 'ok' default)
#
# After it runs:
#   cd <target-dir> && gh repo create inkeep/claude-sandbox --private --source=. --push
#
# See PUBLISHING.md for the full playbook.

set -euo pipefail

TARGET="${1:-$HOME/Documents/code/claude-sandbox}"
BRANCH="${CC_EXTRACT_BRANCH:-claude-sandbox-extracted}"
PACKAGING_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_REPO="$(cd "$PACKAGING_DIR/../.." && pwd)"

log() { printf '\033[1;34m[extract]\033[0m %s\n' "$*" >&2; }
warn() { printf '\033[1;33m[extract]\033[0m %s\n' "$*" >&2; }
err() { printf '\033[1;31m[extract]\033[0m %s\n' "$*" >&2; }

# ── Preflight ────────────────────────────────────────────────────────────

if [[ -e "$TARGET" ]]; then
  err "Target already exists: $TARGET"
  err "Remove it first (or pass a different target-dir as the first arg) and re-run."
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  err "git not installed."
  exit 1
fi

if ! git -C "$SOURCE_REPO" rev-parse --verify "$BRANCH" >/dev/null 2>&1; then
  err "Branch '$BRANCH' not found in $SOURCE_REPO."
  err ""
  err "Run this first, from the open-knowledge repo root:"
  err "  git subtree split --prefix=sandbox-recipes -b $BRANCH"
  exit 1
fi

# ── Step 1: Clone the split branch ───────────────────────────────────────

log "Cloning '$BRANCH' from $SOURCE_REPO → $TARGET"
git clone --quiet --branch "$BRANCH" --single-branch "$SOURCE_REPO" "$TARGET"

cd "$TARGET"
git branch -m "$BRANCH" main
git remote remove origin 2>/dev/null || true
log "Branch renamed to main, origin removed."

# ── Step 2: Write install.sh (curl target) ───────────────────────────────

log "Writing install.sh (curl target)"
cp "$PACKAGING_DIR/install.sh.template" "$TARGET/install.sh"
chmod +x "$TARGET/install.sh"

# ── Step 3: Write README.md (standalone framing) ─────────────────────────

log "Writing README.md (standalone framing)"
mv "$TARGET/README.md" "$TARGET/README-open-knowledge.md.bak" 2>/dev/null || true
cp "$PACKAGING_DIR/README.template.md" "$TARGET/README.md"

# ── Step 4: Write MIT LICENSE ────────────────────────────────────────────

log "Writing MIT LICENSE"
cat > "$TARGET/LICENSE" <<EOF
MIT License

Copyright (c) $(date +%Y) Inkeep

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
EOF

# ── Step 5: Genericization patches ───────────────────────────────────────

log "Applying genericization patches"

# In bootstrap.sh: drop the auto-detected 'ok' default (standalone users aren't
# necessarily in an open-knowledge context). Replace with empty registry + hint.
if [[ -f "$TARGET/bootstrap.sh" ]]; then
  # Remove the "Auto-detected open-knowledge location" seeding in ensure_cc_projects_file.
  # We don't auto-register 'ok' — leave the template with commented examples only.
  # Users add their own keys via ~/.cc-projects.sh.
  python3 <<PY
import re
with open("$TARGET/bootstrap.sh") as f: content = f.read()

# Replace the "Auto-detected open-knowledge location" default.
pattern = re.compile(
    r'# Auto-detected open-knowledge location \(from your bootstrap run\):\n'
    r'_CC_PROJECTS\[ok\]="\\\$ok_path"',
    re.MULTILINE
)
replacement = '# Add a default shortcut for this repo\'s location (optional):\n# _CC_PROJECTS[sandbox]="\\\$ok_path"'
content = pattern.sub(replacement, content, count=1)

# Update the log message too.
content = content.replace(
    "Created ~/.cc-projects.sh with detected 'ok' = \\\$ok_path",
    "Created ~/.cc-projects.sh (add your repos there)"
)

with open("$TARGET/bootstrap.sh", "w") as f: f.write(content)
PY
  log "  patched bootstrap.sh (removed auto-detected 'ok' default)"
fi

# ── Step 6: Sanity checks ────────────────────────────────────────────────

log "Sanity checks on extracted repo..."
if ! bash -n "$TARGET/bootstrap.sh"; then
  err "bootstrap.sh has a syntax error after patching. Please review."
  exit 1
fi
if ! zsh -n "$TARGET/bin/cc-launcher"; then
  err "cc-launcher has a syntax error."
  exit 1
fi

# Remove leftover references to open-knowledge-specific paths in docs.
grep -rln "open-knowledge" "$TARGET/"*.md 2>/dev/null | while read -r f; do
  warn "  $f still references 'open-knowledge' — review before going public"
done

log ""
log "Extracted to: $TARGET"
log ""
log "Next steps:"
log "  cd $TARGET"
log "  git add -A && git commit -m 'feat: standalone claude-sandbox (extracted from open-knowledge PR #291)'"
log "  gh repo create inkeep/claude-sandbox --private --source=. --push --description 'Tiered Claude Code sandboxing for macOS'"
log ""
log "When ready for public:"
log "  gh repo edit inkeep/claude-sandbox --visibility public --accept-visibility-change-consequences"
log ""
log "See packaging/PUBLISHING.md for the full playbook (in the source repo, not the extracted one)."
