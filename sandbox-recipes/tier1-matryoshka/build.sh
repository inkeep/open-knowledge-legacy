#!/usr/bin/env bash
# Build the matryoshka sandbox image.

set -euo pipefail

TAG="${OK_SANDBOX_TAG:-claude-matryoshka:latest}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v container >/dev/null 2>&1; then
  echo "Apple 'container' CLI not found on PATH." >&2
  echo "Install: download .pkg from https://github.com/apple/container/releases" >&2
  echo "Then: container system start" >&2
  exit 1
fi

echo "Building $TAG from $DIR/Containerfile..."
container build -t "$TAG" -f "$DIR/Containerfile" "$DIR"

echo ""
echo "Built: $TAG"
echo ""
echo "Verify the matryoshka layer works before using:"
echo "  container run --rm $TAG /home/claude/verify-matryoshka.sh"
echo ""
echo "Then launch:"
echo "  ./ok-sandbox-matryoshka.sh"
