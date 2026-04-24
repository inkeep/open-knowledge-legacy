#!/usr/bin/env bash
# Provision the Lima VM for Claude Code sandbox. One-time operation.

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAME="${OK_LIMA_NAME:-claude-sandbox}"

if ! command -v limactl >/dev/null 2>&1; then
  echo "Lima not installed. Run: brew install lima" >&2
  exit 1
fi

# Check if already exists
if limactl list --format '{{.Name}}' 2>/dev/null | grep -qx "$NAME"; then
  echo "VM '$NAME' already exists. To recreate, run: ./teardown.sh && ./setup.sh"
  echo "To start an existing VM: limactl start $NAME"
  exit 0
fi

echo "Creating Lima VM '$NAME' from $DIR/claude-sandbox.yaml..."
echo "First-boot provisioning installs Node.js 22 + Claude Code; expect ~2-3 minutes."
echo ""

limactl create --name "$NAME" "$DIR/claude-sandbox.yaml"
limactl start "$NAME"

echo ""
echo "VM '$NAME' ready."
echo "Run: ./ok-sandbox.sh    # to open a Claude Code session inside"
echo "Or:  limactl shell $NAME      # plain shell"
