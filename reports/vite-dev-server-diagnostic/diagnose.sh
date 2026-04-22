#!/usr/bin/env bash
#
# Open Knowledge dev-server diagnostic
# ====================================
# Starts the app dev server, gathers signal about processes, listeners,
# localhost DNS, HTTP, and WebSocket behavior, then writes a Markdown report.
#
# Usage (run from anywhere inside a clone of the repo):
#   bash reports/vite-dev-server-diagnostic/diagnose.sh [PORT]
#
# PORT defaults to 5173. The script uses VITE_PORT to aim the server at PORT.
#
# Output:
#   reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-<host>-<ts>.md
#   reports/vite-dev-server-diagnostic/results/server-<host>-<ts>.log
#
# The script NEVER fails hard — individual probe failures are captured as
# report content, so a broken environment still yields a usable diff.

set -u  # NOTE: no `set -e` — probe failures are signal, not reasons to abort

PORT="${1:-5173}"
READY_TIMEOUT_SEC="${READY_TIMEOUT_SEC:-120}"

# --- Locate repo root --------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT" || { echo "Cannot cd to $REPO_ROOT" >&2; exit 2; }

if [[ ! -f "packages/app/package.json" ]]; then
  echo "This does not look like an open-knowledge clone: missing packages/app/package.json" >&2
  exit 2
fi

HOST_TAG="$(hostname -s 2>/dev/null | tr -c 'A-Za-z0-9-' '-' | sed 's/-*$//')"
[[ -z "$HOST_TAG" ]] && HOST_TAG="unknown"
TS="$(date -u +%Y%m%d-%H%M%SZ)"

OUT_DIR="$REPO_ROOT/reports/vite-dev-server-diagnostic/results"
mkdir -p "$OUT_DIR"
OUT="$OUT_DIR/DIAGNOSTIC-$HOST_TAG-$TS.md"
LOG="$OUT_DIR/server-$HOST_TAG-$TS.log"

# --- Markdown helpers --------------------------------------------------------
h1() { printf '\n# %s\n\n'  "$1" >>"$OUT"; }
h2() { printf '\n## %s\n\n' "$1" >>"$OUT"; }
h3() { printf '\n### %s\n\n' "$1" >>"$OUT"; }
p()  { printf '%s\n\n'       "$1" >>"$OUT"; }
kv() { printf -- '- **%s:** `%s`\n' "$1" "${2:-<unset>}" >>"$OUT"; }

# code <lang> — reads stdin into a fenced code block. Usage:
#   echo foo | code text
#   code json <file
#   code text <<EOF
#   ...
#   EOF
code() {
  local lang="${1:-text}"
  printf '```%s\n' "$lang" >>"$OUT"
  cat >>"$OUT"
  printf '\n```\n\n' >>"$OUT"
}

run_cmd() {
  # run_cmd "Label" "shell command as single string"
  local label="$1"; shift
  h3 "$label"
  printf '```text\n$ %s\n' "$*" >>"$OUT"
  { eval "$@" 2>&1 || true; } | head -400 >>"$OUT"
  printf '\n```\n\n' >>"$OUT"
}

# --- Teardown trap -----------------------------------------------------------
SERVER_PID=""
cleanup() {
  local rc=$?
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    # Tear down the whole child tree (bun → bun → node vite → helpers)
    pkill -TERM -P "$SERVER_PID" 2>/dev/null || true
    kill -TERM "$SERVER_PID" 2>/dev/null || true
    for _ in 1 2 3 4 5; do
      kill -0 "$SERVER_PID" 2>/dev/null || break
      sleep 1
    done
    if kill -0 "$SERVER_PID" 2>/dev/null; then
      pkill -KILL -P "$SERVER_PID" 2>/dev/null || true
      kill -KILL "$SERVER_PID" 2>/dev/null || true
    fi
  fi
  # Anything we orphaned
  pkill -TERM -f "node .*node_modules/\\.bin/vite" 2>/dev/null || true
  exit $rc
}
trap cleanup EXIT INT TERM

# --- Header ------------------------------------------------------------------
: >"$OUT"
h1 "Open Knowledge dev-server diagnostic"
kv "Host"            "$HOST_TAG"
kv "Timestamp (UTC)" "$TS"
kv "Repo root"       "$REPO_ROOT"
kv "Target port"     "$PORT"
kv "Ready timeout"   "${READY_TIMEOUT_SEC}s"

# --- Prerequisites ----------------------------------------------------------
# Surface bun + node availability prominently so a missing runtime is the
# first thing you see when you open the report — not buried under 400 lines.
h2 "Prerequisites (bun + node must both be available)"
missing_prereqs=()
for bin in bun node; do
  if command -v "$bin" >/dev/null 2>&1; then
    kv "$bin" "OK — $(command -v "$bin") ($("$bin" --version 2>&1 | head -1))"
  else
    kv "$bin" "MISSING"
    missing_prereqs+=("$bin")
  fi
done

if (( ${#missing_prereqs[@]} > 0 )); then
  p ":rotating_light: **${missing_prereqs[*]} not on PATH.** The dev server cannot start without these. If either runtime is installed via a version manager (fnm, nvm, volta, mise, asdf), the shell the script runs under may not have loaded the shim — open a fresh terminal, activate the project's node version, then re-run."
  # Show the most common shims so we can tell *which* manager is in play
  h3 "Version manager shims detected"
  code text <<EOF
fnm:   $(command -v fnm   2>/dev/null || echo '(not on PATH)')
nvm:   $([[ -s "$HOME/.nvm/nvm.sh" ]] && echo "$HOME/.nvm/nvm.sh present" || echo '(not found)')
volta: $(command -v volta 2>/dev/null || echo '(not on PATH)')
mise:  $(command -v mise  2>/dev/null || echo '(not on PATH)')
asdf:  $(command -v asdf  2>/dev/null || echo '(not on PATH)')
EOF
fi

# --- Environment -------------------------------------------------------------
h2 "Environment"
kv "User"    "$(whoami 2>&1)"
kv "Shell"   "${SHELL:-unknown}"
kv "TERM"    "${TERM:-unset}"
kv "LANG"    "${LANG:-unset}"
kv "PATH (truncated)" "$(printf '%s' "$PATH" | cut -c1-200)"
kv "uname"   "$(uname -a 2>&1)"

if [[ "$(uname -s)" = "Darwin" ]]; then
  kv "macOS" "$(sw_vers -productVersion 2>/dev/null) ($(sw_vers -buildVersion 2>/dev/null))"
fi

_versioned_tools=(bun node git curl openssl)       # respond to --version
_path_only_tools=(lsof pgrep pkill pstree ss netstat dig dscacheutil getent)
for bin in "${_versioned_tools[@]}"; do
  if command -v "$bin" >/dev/null 2>&1; then
    v="$("$bin" --version 2>&1 | head -1)"
    kv "$bin" "$(command -v "$bin") — $v"
  else
    kv "$bin" "MISSING"
  fi
done
for bin in "${_path_only_tools[@]}"; do
  if command -v "$bin" >/dev/null 2>&1; then
    kv "$bin" "$(command -v "$bin")"
  else
    kv "$bin" "missing"
  fi
done

h3 "Git state"
code text <<EOF
HEAD:    $(git rev-parse --short HEAD 2>&1)
branch:  $(git rev-parse --abbrev-ref HEAD 2>&1)
remote:  $(git config --get remote.origin.url 2>&1)
worktree: $(git rev-parse --is-inside-work-tree 2>&1)
EOF

h3 "Working tree changes"
{ git status --short 2>&1 | head -80; } | code text

# --- DNS + /etc/hosts --------------------------------------------------------
h2 "localhost resolution"
p "Vite's default dev-server host is \`localhost\`. On dual-stack macOS this typically resolves to \`::1\` first and the TCP listener binds **IPv6-only**. If \`localhost\` resolves to \`127.0.0.1\` instead on the target machine (different \`/etc/hosts\`, alternate resolver order, browser overriding DNS), HTTP + WebSocket connections to \`localhost:$PORT\` will silently fail even though \`curl http://localhost:$PORT/\` works."
if command -v dscacheutil >/dev/null 2>&1; then
  run_cmd "dscacheutil -q host -a name localhost" "dscacheutil -q host -a name localhost"
fi
if command -v getent >/dev/null 2>&1; then
  run_cmd "getent hosts localhost" "getent hosts localhost"
fi
if command -v dig >/dev/null 2>&1; then
  run_cmd "dig +short localhost" "dig +short localhost A; dig +short localhost AAAA"
fi
h3 "/etc/hosts (localhost lines)"
{ grep -nE 'localhost|^[[:space:]]*#|^$' /etc/hosts 2>&1 | head -30; } | code text

# --- Proxy / VPN sniff -------------------------------------------------------
h2 "Proxy / VPN env"
{ env | grep -iE '^(https?_proxy|all_proxy|no_proxy|ftp_proxy)=' || echo '(none set)'; } | code text

# --- Dependencies ------------------------------------------------------------
h2 "Dependencies"
kv "node_modules/"                   "$([[ -d node_modules ]] && echo present || echo MISSING)"
kv "node_modules/.bin/vite"          "$([[ -x node_modules/.bin/vite ]] && echo present || echo missing)"
kv "packages/app/node_modules/"      "$([[ -d packages/app/node_modules ]] && echo present || echo missing)"
if [[ -f bun.lock ]]; then
  kv "bun.lock mtime" "$(stat -f '%Sm' bun.lock 2>/dev/null || stat -c '%y' bun.lock 2>/dev/null || echo '?')"
  kv "bun.lock size"  "$(wc -c <bun.lock | tr -d ' ') bytes"
fi

# --- Stale listener check ----------------------------------------------------
h2 "Pre-start stale listeners on port $PORT"
if command -v lsof >/dev/null 2>&1; then
  STALE="$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$STALE" ]]; then
    printf '%s\n' "$STALE" | code text
    # If anything is holding 5173, kill it so we get a clean comparison.
    STALE_PIDS="$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null | sort -u || true)"
    if [[ -n "$STALE_PIDS" ]]; then
      p "Sending SIGTERM to stale listener PIDs: \`$(echo "$STALE_PIDS" | tr '\n' ' ')\`"
      kill -TERM $STALE_PIDS 2>/dev/null || true
      sleep 2
      kill -KILL $STALE_PIDS 2>/dev/null || true
    fi
  else
    p "(nothing listening on $PORT)"
  fi
fi

# --- Start the dev server ----------------------------------------------------
h2 "Dev server startup"
p "Command: \`VITE_PORT=$PORT bun run --filter @inkeep/open-knowledge-app dev\`"
p "Log file: \`$LOG\`"

: >"$LOG"
VITE_PORT="$PORT" bun run --filter @inkeep/open-knowledge-app dev >"$LOG" 2>&1 &
SERVER_PID=$!

# Wait for both readiness markers, or until the process dies, or until timeout.
READY_VITE=0
READY_COLLAB=0
deadline=$(( $(date +%s) + READY_TIMEOUT_SEC ))
waited=0
while [[ $(date +%s) -lt $deadline ]]; do
  if (( READY_VITE == 0 )) && grep -q "VITE .* ready in"            "$LOG" 2>/dev/null; then READY_VITE=1; fi
  if (( READY_COLLAB == 0 )) && grep -q "WebSocket server ready on /collab" "$LOG" 2>/dev/null; then READY_COLLAB=1; fi
  if (( READY_VITE && READY_COLLAB )); then break; fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then break; fi
  sleep 1
  waited=$((waited + 1))
done

kv "Vite ready"                      "$([[ $READY_VITE   = 1 ]] && echo yes || echo NO)"
kv "Hocuspocus /collab ready"        "$([[ $READY_COLLAB = 1 ]] && echo yes || echo NO)"
kv "Process alive after wait"        "$(kill -0 "$SERVER_PID" 2>/dev/null && echo yes || echo NO)"
kv "Seconds waited"                  "$waited"

# --- Process tree ------------------------------------------------------------
h2 "Process tree"
run_cmd "pgrep -af 'vite|hocus|bun run'" "pgrep -af 'vite|hocus|bun run' | grep -v -i -E '(claude|cursor-agent|codex)' | head -40"
if command -v pstree >/dev/null 2>&1 && [[ -n "$SERVER_PID" ]]; then
  run_cmd "pstree -p $SERVER_PID"  "pstree -p $SERVER_PID"
else
  run_cmd "ps -ef (children of $SERVER_PID)" "ps -ef | awk -v p=$SERVER_PID 'NR==1 || \$2==p || \$3==p'"
fi

# --- Port listeners ----------------------------------------------------------
h2 "Listeners on port $PORT"
if command -v lsof >/dev/null 2>&1; then
  run_cmd "lsof -iTCP:$PORT -sTCP:LISTEN" "lsof -nP -iTCP:$PORT -sTCP:LISTEN"
fi
if command -v ss >/dev/null 2>&1; then
  run_cmd "ss -lntp '( sport = :$PORT )'" "ss -lntp '( sport = :$PORT )'"
elif command -v netstat >/dev/null 2>&1; then
  run_cmd "netstat -an | grep $PORT" "netstat -an | grep -E '\\.${PORT}[^0-9]' | head -20"
fi

# --- HTTP probes -------------------------------------------------------------
h2 "HTTP probes"

http_probe() {
  local label="$1"; local url="$2"
  h3 "$label — \`$url\`"
  local body; body="$(mktemp)"
  local line
  line=$(curl -sS -o "$body" --max-time 6 \
           -w "HTTP %{http_code}  connect=%{time_connect}s  total=%{time_total}s  bytes=%{size_download}  remote=%{remote_ip}:%{remote_port}" \
           "$url" 2>&1 || true)
  {
    printf '%s\n' "$line"
    printf -- '--- response headers ---\n'
    curl -sS -I --max-time 6 "$url" 2>&1 | head -20
    printf -- '--- response body (first 400 bytes) ---\n'
    head -c 400 "$body" 2>/dev/null
    printf '\n'
  } | code text
  rm -f "$body"
}
http_probe "IPv4"      "http://127.0.0.1:$PORT/"
http_probe "IPv6"      "http://[::1]:$PORT/"
http_probe "localhost" "http://localhost:$PORT/"
http_probe "API config" "http://localhost:$PORT/api/config"

# --- WebSocket upgrade -------------------------------------------------------
h2 "WebSocket upgrade handshakes"
p "A healthy server returns \`HTTP/1.1 101 Switching Protocols\` for both paths. \`400\`, \`404\`, or connection drop = upgrade handler is not wired."

ws_probe() {
  local label="$1"; local url="$2"
  h3 "$label — \`$url\`"
  local key; key="$(openssl rand -base64 16 2>/dev/null || echo 'dGhlIHNhbXBsZSBub25jZQ==')"
  {
    curl -i -sS --max-time 5 \
      -H "Connection: Upgrade" \
      -H "Upgrade: websocket" \
      -H "Sec-WebSocket-Key: $key" \
      -H "Sec-WebSocket-Version: 13" \
      "$url" 2>&1 | head -20
  } | code text
}
ws_probe "/collab (IPv4)"            "http://127.0.0.1:$PORT/collab"
ws_probe "/collab (IPv6)"            "http://[::1]:$PORT/collab"
ws_probe "/collab (localhost)"       "http://localhost:$PORT/collab"
ws_probe "/collab/keepalive (localhost)" "http://localhost:$PORT/collab/keepalive"

# --- server.lock -------------------------------------------------------------
h2 "server.lock"
if [[ -f .open-knowledge/server.lock ]]; then
  code json <.open-knowledge/server.lock
else
  p "\`.open-knowledge/server.lock\` not present."
fi

# --- Dev server log tails ----------------------------------------------------
h2 "Dev server log (first 60 lines)"
{ head -60 "$LOG" 2>&1 | sed "s|$REPO_ROOT|REPO|g"; } | code text

h2 "Dev server log (last 200 lines)"
{ tail -200 "$LOG" 2>&1 | sed "s|$REPO_ROOT|REPO|g"; } | code text

h2 "Dev server log (collab-related lines)"
{ grep -nE 'collab|hocus|upgrade|WebSocket|websocket|Hocus' "$LOG" 2>&1 | head -80 | sed "s|$REPO_ROOT|REPO|g"; } | code text

# --- Done --------------------------------------------------------------------
h2 "Summary"
{
  printf -- '- node_modules installed: %s\n'      "$([[ -d node_modules ]] && echo yes || echo NO)"
  printf -- '- Vite ready:             %s\n'      "$([[ $READY_VITE   = 1 ]] && echo yes || echo NO)"
  printf -- '- /collab ready:          %s\n'      "$([[ $READY_COLLAB = 1 ]] && echo yes || echo NO)"
  printf -- '- Server process alive:   %s\n'      "$(kill -0 "$SERVER_PID" 2>/dev/null && echo yes || echo NO)"
} | code text

printf '\nDone. Report: %s\n'   "$OUT"
printf 'Server log:   %s\n\n'    "$LOG"
