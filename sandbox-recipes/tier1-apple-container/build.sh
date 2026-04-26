#!/usr/bin/env bash
# Build the Claude Code sandbox image for Apple Container.
#
# Known issue: `container build` in v0.9 has an HTTP 403 bug during build-time fetches.
# If you hit it, the workaround is to build elsewhere (Docker) and pull into
# Apple Container via a local registry. See "Fallback" section below.

set -euo pipefail

TAG="${OK_SANDBOX_TAG:-claude-sandbox:latest}"
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
echo "Next: ./ok-sandbox.sh to run Claude Code inside."
echo ""
echo "Note: container v0.9's 'HTTP 403 during build' bug appears fixed in v0.11."
echo "If you hit it anyway: build with docker, push to a local registry, and"
echo "pull into Apple Container. See the original evidence file for the recipe."
