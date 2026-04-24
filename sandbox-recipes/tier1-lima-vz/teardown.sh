#!/usr/bin/env bash
# Remove the Lima sandbox VM. Destructive — all state inside the VM is lost.

set -euo pipefail

NAME="${OK_LIMA_NAME:-claude-sandbox}"

if ! command -v limactl >/dev/null 2>&1; then
  echo "Lima not installed."
  exit 0
fi

if ! limactl list --format '{{.Name}}' 2>/dev/null | grep -qx "$NAME"; then
  echo "VM '$NAME' doesn't exist — nothing to tear down."
  exit 0
fi

echo "About to stop and delete VM '$NAME'. This destroys any state inside the VM."
read -r -p "Continue? [y/N] " yn
case "$yn" in
  [yY]*) ;;
  *) echo "Aborted."; exit 0 ;;
esac

limactl stop "$NAME" 2>/dev/null || true
limactl delete "$NAME"
echo "VM '$NAME' deleted."
