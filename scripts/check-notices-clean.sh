#!/usr/bin/env bash
#
# Run the THIRD_PARTY_NOTICES.md generator in --check mode and fail if the
# committed file does not match what the generator would produce against the
# currently-installed `node_modules/`. Mirrors the `check-knip-clean.sh`
# pattern so `bun run check` catches drift before push.

set -euo pipefail

bun scripts/generate-third-party-notices.mjs --check
