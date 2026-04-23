#!/usr/bin/env bash

# Wrapper script installed at /usr/local/bin/ok (symlink into the
# Open Knowledge.app bundle). Re-uses the bundled Electron runtime as
# a Node host via ELECTRON_RUN_AS_NODE=1 — no separate Node install
# required on the user machine. Derived from VS Code's code.sh
# (github.com/microsoft/vscode/blob/main/resources/darwin/bin/code.sh).
#
# See specs/2026-04-21-m6-cli-and-mcp-wiring/SPEC.md §6 (M6a).

function app_realpath() {
  SOURCE=$1
  while [ -h "$SOURCE" ]; do
    DIR=$(dirname "$SOURCE")
    SOURCE=$(readlink "$SOURCE")
    [[ $SOURCE != /* ]] && SOURCE=$DIR/$SOURCE
  done
  SOURCE_DIR="$( cd -P "$( dirname "$SOURCE" )" >/dev/null 2>&1 && pwd )"
  echo "${SOURCE_DIR%%${SOURCE_DIR#*.app}}"
}

# APP_BUNDLE_DIR test hook for AC2.12 fixtures — production never
# sets this; the wrapper always derives APP_PATH from its own
# realpath. Fixture tests set APP_BUNDLE_DIR to a path whose
# Contents/Resources/cli/dist/cli.mjs does not exist to exercise
# the self-diagnosing error branch below.
if [ -n "$APP_BUNDLE_DIR" ]; then
  APP_PATH="$APP_BUNDLE_DIR"
else
  APP_PATH="$(app_realpath "${BASH_SOURCE[0]}")"
fi

if [ -z "$APP_PATH" ]; then
  # Symlink resolution failed — install integrity broken (e.g., the wrapper
  # was copied outside the .app, or readlink chain runs into a foreign
  # target). Mirror the bundle-missing branch (Pass 0 Major #10): two-line
  # stderr (human-readable + machine-readable JSON) and exit 69 so MCP
  # clients can surface this distinctly from generic failures, and
  # operators have a structured signal in the diagnostic JSONL.
  echo "Open Knowledge CLI cannot find its app bundle. Reinstall from the Open Knowledge DMG." >&2
  echo "{\"error\":\"ok-wrapper-resolution-failed\",\"hint\":\"The ok.sh wrapper could not resolve its enclosing .app bundle. The symlink chain may be broken. Reinstall from the DMG or re-run Install Command-Line Tools… from the File menu.\",\"source\":\"${BASH_SOURCE[0]}\"}" >&2
  exit 69
fi

CONTENTS="$APP_PATH/Contents"
ELECTRON="$CONTENTS/MacOS/Open Knowledge"
CLI="$CONTENTS/Resources/cli/dist/cli.mjs"

# Self-diagnose the drag-to-Trash lifecycle (D-M6-R6 / AC2.12): if
# either the bundled CLI or the Electron binary is missing, the .app
# has been deleted after MCP clients wrote the wrapper path into
# their configs. Emit a two-line stderr — first line human-readable
# for clients that surface stderr raw, second line machine-readable
# JSON for clients that parse it — and exit 69 (EX_UNAVAILABLE) so
# MCP clients surface the state distinctly from generic failures.
if [ ! -f "$CLI" ] || [ ! -x "$ELECTRON" ]; then
  echo "Open Knowledge has been removed. Reinstall from the Open Knowledge DMG." >&2
  echo '{"error":"ok-bundle-missing","hint":"Open Knowledge app appears to have been removed. Reinstall from the DMG, or remove OK entries from your MCP config and rerun ok init."}' >&2
  exit 69
fi

# Sanitize NODE_OPTIONS the user may have set for their own projects
# — they would otherwise be inherited into the Electron-as-Node
# process and can crash with "--require of ESM". Re-export under a
# scoped name so the CLI can opt to honor them explicitly (VS Code
# pattern). Quote the expansion so that multi-token values like
# `NODE_OPTIONS='--require /tmp/x.js'` are captured verbatim instead
# of being re-split on whitespace (Review Pass 0 Minor #15).
export OK_NODE_OPTIONS="$NODE_OPTIONS"
unset NODE_OPTIONS

ELECTRON_RUN_AS_NODE=1 "$ELECTRON" "$CLI" "$@"
exit $?
