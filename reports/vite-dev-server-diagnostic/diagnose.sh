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

# --- Runtime availability ---------------------------------------------------
# Surface bun presence prominently — bun IS required to start the dev server.
# node is not: bun's `bun run` interprets `#!/usr/bin/env node` shebangs on
# `node_modules/.bin/*` shims itself, so the Vite dev server boots even on a
# box with no node on PATH (verified empirically — `lsof` reports the listener
# owner as `bun`, not `node`, despite `ps` echoing the shebang argv0 as
# `node` for compatibility). node is still reported here for completeness.
h2 "Runtime availability"
if command -v bun >/dev/null 2>&1; then
  kv "bun (required)" "OK — $(command -v bun) ($(bun --version 2>&1 | head -1))"
  bun_missing=0
else
  kv "bun (required)" "MISSING"
  bun_missing=1
fi
if command -v node >/dev/null 2>&1; then
  kv "node (optional — bun runs node-shebang scripts itself)" "present — $(command -v node) ($(node --version 2>&1 | head -1))"
else
  kv "node (optional — bun runs node-shebang scripts itself)" "not on PATH (not a blocker)"
fi

if (( bun_missing )); then
  p ":rotating_light: **bun not on PATH.** The dev server cannot start without bun. If bun is installed via a version manager (mise, asdf, proto) the shell the script runs under may not have loaded its shim — open a fresh terminal, activate the project's toolchain, then re-run."
  # Show the most common shims so we can tell *which* manager is in play
  h3 "Version manager shims detected"
  code text <<EOF
mise:  $(command -v mise  2>/dev/null || echo '(not on PATH)')
asdf:  $(command -v asdf  2>/dev/null || echo '(not on PATH)')
proto: $(command -v proto 2>/dev/null || echo '(not on PATH)')
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

# --- Address-family-forced probes (the decisive test) ----------------------
# Forces curl to use IPv4 or IPv6 when resolving `localhost`, independent of
# the libc resolver's preferred order. Three distinct outcomes across the pair:
#   -4 OK, -6 OK   → listener is dual-stack; problem is NOT address family
#   -4 fail, -6 OK → listener is IPv6-only (baseline); a browser preferring
#                    IPv4 will never connect despite the server being "up"
#   -4 OK, -6 fail → listener is IPv4-only or IPv6 loopback is disabled
#   -4 fail, -6 fail → neither loopback reaches the server; firewall / VPN
h2 "Address-family-forced HTTP probes (decisive)"
p "Force curl to resolve \`localhost\` over IPv4 (\`-4\`) vs IPv6 (\`-6\`) and retry the request. If one succeeds and the other refuses, the binding story is settled."
HTTP_V4_RC=99
HTTP_V6_RC=99
http_probe_af() {
  local label="$1" flag="$2" url="$3"
  h3 "$label — \`curl $flag $url\`"
  local body; body=$(mktemp)
  local line rc
  line=$(curl "$flag" -sS -o "$body" --max-time 6 \
    -w "HTTP %{http_code}  connect=%{time_connect}s  total=%{time_total}s  bytes=%{size_download}  remote=%{remote_ip}:%{remote_port}" \
    "$url" 2>&1)
  rc=$?
  LAST_CURL_RC=$rc
  {
    printf '%s\n' "$line"
    printf -- '--- exit=%d ---\n' "$rc"
    printf -- '--- body (first 200 bytes) ---\n'
    head -c 200 "$body" 2>/dev/null
    printf '\n'
  } | code text
  rm -f "$body"
}
http_probe_af "IPv4-forced (localhost → A record)"    "-4" "http://localhost:$PORT/"
HTTP_V4_RC=$LAST_CURL_RC
http_probe_af "IPv6-forced (localhost → AAAA record)" "-6" "http://localhost:$PORT/"
HTTP_V6_RC=$LAST_CURL_RC

h2 "Address-family-forced WebSocket probes (decisive)"
p "Same idea for the \`/collab\` upgrade — forces the address family independent of resolution order. A healthy upgrade has \`HTTP/1.1 101 Switching Protocols\` in the output (curl will still \`exit 28\` because it waits for frames that never come after the upgrade — that's expected)."
WS_V4_RC=99
WS_V6_RC=99
ws_probe_af() {
  local label="$1" flag="$2" url="$3"
  h3 "$label — \`curl $flag $url\`"
  local key out
  key=$(openssl rand -base64 16 2>/dev/null || echo 'dGhlIHNhbXBsZSBub25jZQ==')
  out=$(curl "$flag" -i -sS --max-time 3 \
    -H "Connection: Upgrade" -H "Upgrade: websocket" \
    -H "Sec-WebSocket-Key: $key" -H "Sec-WebSocket-Version: 13" \
    "$url" 2>&1)
  printf '%s\n' "$out" | head -10 | code text
  if printf '%s' "$out" | grep -q "101 Switching Protocols"; then
    LAST_WS_RC=0
  else
    LAST_WS_RC=1
  fi
}
ws_probe_af "IPv4-forced" "-4" "http://localhost:$PORT/collab"
WS_V4_RC=$LAST_WS_RC
ws_probe_af "IPv6-forced" "-6" "http://localhost:$PORT/collab"
WS_V6_RC=$LAST_WS_RC

# --- Runtime DNS resolution (what bun / Vite's listen() sees) --------------
h2 "Runtime DNS resolution (what bun / Vite's \`listen()\` sees)"
p "\`dns.lookup\` is what Node / bun calls internally when you pass a hostname to \`http.listen()\`. Whether the listener lands on IPv4, IPv6, or both is decided by the resolver order here, not the system shell's \`getent\` / \`dscacheutil\`."
{ bun -e '
  const dns = require("node:dns");
  const { promisify } = require("node:util");
  const lookup = promisify(dns.lookup);
  const lookupAll = (h) => promisify(dns.lookup)(h, { all: true });
  (async () => {
    try {
      console.log("-- default order --");
      console.log("  single:", await lookup("localhost"));
      console.log("  all:   ", await lookupAll("localhost"));
      dns.setDefaultResultOrder("ipv4first");
      console.log("-- after setDefaultResultOrder(\"ipv4first\") --");
      console.log("  single:", await lookup("localhost"));
      console.log("  all:   ", await lookupAll("localhost"));
      dns.setDefaultResultOrder("verbatim");
      console.log("-- after setDefaultResultOrder(\"verbatim\") --");
      console.log("  single:", await lookup("localhost"));
      console.log("  all:   ", await lookupAll("localhost"));
    } catch (err) { console.error("ERR:", err && err.message || err); process.exit(1); }
  })();
' 2>&1 | head -40; } | code text

# --- Loopback interface & ping sanity --------------------------------------
h2 "Loopback interface sanity"
p "Confirms both \`127.0.0.1/8\` and \`::1/128\` are bound on the loopback interface. If either is missing, the kernel cannot route traffic on that address family regardless of where Vite bound."
if command -v ifconfig >/dev/null 2>&1; then
  run_cmd "ifconfig lo0" "ifconfig lo0 2>/dev/null || ifconfig lo 2>/dev/null"
elif command -v ip >/dev/null 2>&1; then
  run_cmd "ip addr show lo" "ip addr show lo"
fi
h3 "IPv4 loopback ping"
{ (ping -c 1 -W 1000 127.0.0.1 2>&1 || ping -c 1 -w 1 127.0.0.1 2>&1) | head -5; } | code text
h3 "IPv6 loopback ping"
{ (ping6 -c 1 ::1 2>&1 || ping -c 1 -W 1000 ::1 2>&1 || ping -c 1 -w 1 ::1 2>&1) | head -5; } | code text

# --- macOS Application Firewall -------------------------------------------
if [[ "$(uname -s)" = "Darwin" && -x /usr/libexec/ApplicationFirewall/socketfilterfw ]]; then
  h2 "macOS Application Firewall"
  p "Rare but real — if ALF is on and bun / node are not allow-listed, inbound connections (including loopback in some setups) can be dropped."
  run_cmd "socketfilterfw --getglobalstate" "/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate 2>&1"
  run_cmd "socketfilterfw --getstealthmode" "/usr/libexec/ApplicationFirewall/socketfilterfw --getstealthmode 2>&1"
  run_cmd "socketfilterfw --getblockall" "/usr/libexec/ApplicationFirewall/socketfilterfw --getblockall 2>&1"
fi

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

# --- Verdict ----------------------------------------------------------------
# Classify based on the four address-family outcomes (HTTP + WS, IPv4 + IPv6).
# Exit codes from the helpers: 0 = reachable / upgrade succeeded; nonzero = not.
verdict_for_pair() {
  local v4="$1" v6="$2" kind="$3" url="$4"
  if   (( v4 == 0 && v6 == 0 )); then
    echo "**$kind: dual-stack reachable.** Both IPv4 and IPv6 loopback reach \`$url\`. The address-family hypothesis is ruled out for this transport — look elsewhere (browser cache, extensions, mismatched port, browser console errors)."
  elif (( v4 != 0 && v6 == 0 )); then
    echo "**$kind: IPv6-only** (matches the committed baseline). \`curl -4 $url\` is refused; \`curl -6 $url\` succeeds. A browser that resolves \`localhost\` to \`127.0.0.1\` first (Happy Eyeballs tilt, \`dns.setDefaultResultOrder('ipv4first')\`, browser extension, corporate DNS) will silently fail to connect. Decisive fix candidate: set \`server.host: '127.0.0.1'\` (or \`'0.0.0.0'\`) in \`packages/app/vite.config.ts\` so the listener binds IPv4 too."
  elif (( v4 == 0 && v6 != 0 )); then
    echo "**$kind: IPv4-only** — unusual. Baseline is IPv6-only. \`curl -4 $url\` succeeds; \`curl -6\` fails. Either Vite is already bound to \`127.0.0.1\` / \`0.0.0.0\` on this box, or \`::1\` is missing from the loopback interface. Check the _Loopback interface sanity_ section for \`::1/128\` on \`lo0\`."
  else
    echo "**$kind: neither loopback address family reaches \`$url\`.** If \`Vite ready\` + \`/collab ready\` + the lsof listener lines all show yes, traffic is being dropped between the client and the listener. Candidates: macOS Application Firewall (see section), a VPN with aggressive split-tunneling or loopback interception (Tailscale, Cloudflare WARP, Little Snitch), or IPv6 disabled at the interface level."
  fi
}
h2 "Verdict"
p "$(verdict_for_pair $HTTP_V4_RC $HTTP_V6_RC "HTTP"              "http://localhost:$PORT/")"
p "$(verdict_for_pair $WS_V4_RC   $WS_V6_RC   "WebSocket /collab" "http://localhost:$PORT/collab")"

# --- Done --------------------------------------------------------------------
h2 "Summary"
{
  printf -- '- node_modules installed: %s\n'      "$([[ -d node_modules ]] && echo yes || echo NO)"
  printf -- '- Vite ready:             %s\n'      "$([[ $READY_VITE   = 1 ]] && echo yes || echo NO)"
  printf -- '- /collab ready:          %s\n'      "$([[ $READY_COLLAB = 1 ]] && echo yes || echo NO)"
  printf -- '- Server process alive:   %s\n'      "$(kill -0 "$SERVER_PID" 2>/dev/null && echo yes || echo NO)"
  printf -- '- HTTP IPv4 localhost:    %s\n'      "$([[ $HTTP_V4_RC -eq 0 ]] && echo reachable || echo unreachable)"
  printf -- '- HTTP IPv6 localhost:    %s\n'      "$([[ $HTTP_V6_RC -eq 0 ]] && echo reachable || echo unreachable)"
  printf -- '- WS   IPv4 /collab:      %s\n'      "$([[ $WS_V4_RC   -eq 0 ]] && echo 101-upgrade || echo failed)"
  printf -- '- WS   IPv6 /collab:      %s\n'      "$([[ $WS_V6_RC   -eq 0 ]] && echo 101-upgrade || echo failed)"
} | code text

printf '\nDone. Report: %s\n'   "$OUT"
printf 'Server log:   %s\n\n'    "$LOG"
