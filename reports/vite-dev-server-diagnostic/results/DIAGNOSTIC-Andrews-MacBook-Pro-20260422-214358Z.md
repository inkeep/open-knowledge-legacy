
# Open Knowledge dev-server diagnostic

- **Host:** `Andrews-MacBook-Pro`
- **Timestamp (UTC):** `20260422-214358Z`
- **Repo root:** `/Users/andrew/Documents/code/open-knowledge`
- **Target port:** `5173`
- **Ready timeout:** `120s`

## Runtime availability

- **bun (required):** `OK — /Users/andrew/.bun/bin/bun (1.3.11)`
- **node (optional — bun runs node-shebang scripts itself):** `present — /usr/local/bin/node (v24.12.0)`

## Environment

- **User:** `andrew`
- **Shell:** `/bin/zsh`
- **TERM:** `xterm-256color`
- **LANG:** `en_US.UTF-8`
- **PATH (truncated):** `/Users/andrew/.antigravity/antigravity/bin:/Users/andrew/Library/pnpm:/Users/andrew/.local/state/fnm_multishells/46608_1776888922110/bin:/Users/andrew/.composio:/Users/andrew/.composio:/Users/andrew/.`
- **uname:** `Darwin Andrews-MacBook-Pro.local 25.3.0 Darwin Kernel Version 25.3.0: Wed Jan 28 20:47:03 PST 2026; root:xnu-12377.81.4~5/RELEASE_ARM64_T6031 arm64`
- **macOS:** `26.3 (25D125)`
- **bun:** `/Users/andrew/.bun/bin/bun — 1.3.11`
- **node:** `/usr/local/bin/node — v24.12.0`
- **git:** `/opt/homebrew/bin/git — git version 2.47.1`
- **curl:** `/usr/bin/curl — curl 8.7.1 (x86_64-apple-darwin25.0) libcurl/8.7.1 (SecureTransport) LibreSSL/3.3.6 zlib/1.2.12 nghttp2/1.68.0`
- **openssl:** `/opt/homebrew/bin/openssl — OpenSSL 3.6.0 1 Oct 2025 (Library: OpenSSL 3.6.0 1 Oct 2025)`
- **lsof:** `/usr/sbin/lsof`
- **pgrep:** `/usr/bin/pgrep`
- **pkill:** `/usr/bin/pkill`
- **pstree:** `missing`
- **ss:** `missing`
- **netstat:** `/usr/sbin/netstat`
- **dig:** `/usr/bin/dig`
- **dscacheutil:** `/usr/bin/dscacheutil`
- **getent:** `missing`

### Git state

```text
HEAD:    34e99ea5
branch:  chore/vite-dev-server-diagnostic
remote:  git@github.com:inkeep/open-knowledge.git
worktree: true

```


### Working tree changes

```text
 D packages/desktop/build/entitlements.mac.plist
 M packages/desktop/build/icon.png
 M reports/vite-dev-server-diagnostic/REPORT.md
 M reports/vite-dev-server-diagnostic/diagnose.sh
 D reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-210733Z.md
?? reports/orphan-process-prevention/
?? reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z.md

```


## localhost resolution

Vite's default dev-server host is `localhost`. On dual-stack macOS this typically resolves to `::1` first and the TCP listener binds **IPv6-only**. If `localhost` resolves to `127.0.0.1` instead on the target machine (different `/etc/hosts`, alternate resolver order, browser overriding DNS), HTTP + WebSocket connections to `localhost:5173` will silently fail even though `curl http://localhost:5173/` works.


### dscacheutil -q host -a name localhost

```text
$ dscacheutil -q host -a name localhost
name: localhost
ipv6_address: ::1

name: localhost
ip_address: 127.0.0.1


```


### dig +short localhost

```text
$ dig +short localhost A; dig +short localhost AAAA
127.0.0.1
::1

```


### /etc/hosts (localhost lines)

```text
1:##
2:# Host Database
3:#
4:# localhost is used to configure the loopback interface
5:# when the system is booting.  Do not change this entry.
6:##
7:127.0.0.1	localhost
9:::1             localhost

```


## Proxy / VPN env

```text
(none set)

```


## Dependencies

- **node_modules/:** `present`
- **node_modules/.bin/vite:** `present`
- **packages/app/node_modules/:** `present`
- **bun.lock mtime:** `Apr 22 14:21:15 2026`
- **bun.lock size:** `492482 bytes`

## Pre-start stale listeners on port 5173

(nothing listening on 5173)


## Dev server startup

Command: `VITE_PORT=5173 bun run --filter @inkeep/open-knowledge-app dev`

Log file: `/Users/andrew/Documents/code/open-knowledge/reports/vite-dev-server-diagnostic/results/server-Andrews-MacBook-Pro-20260422-214358Z.log`

- **Vite ready:** `yes`
- **Hocuspocus /collab ready:** `yes`
- **Process alive after wait:** `yes`
- **Seconds waited:** `3`

## Process tree


### pgrep -af 'vite|hocus|bun run'

```text
$ pgrep -af 'vite|hocus|bun run' | grep -v -i -E '(claude|cursor-agent|codex)' | head -40
46710
67806
67817
67948
67954
68043

```


### ps -ef (children of 67948)

```text
$ ps -ef | awk -v p=67948 'NR==1 || $2==p || $3==p'
  UID   PID  PPID   C STIME   TTY           TIME CMD
  501 67948 67817   0  2:43PM ??         0:00.01 bun run --filter @inkeep/open-knowledge-app dev
  501 67954 67948   0  2:43PM ??         0:03.47 node /Users/andrew/Documents/code/open-knowledge/node_modules/.bin/vite

```


## Listeners on port 5173


### lsof -iTCP:5173 -sTCP:LISTEN

```text
$ lsof -nP -iTCP:5173 -sTCP:LISTEN
COMMAND   PID   USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node    67954 andrew   32u  IPv6 0x13b18c255f7941c3      0t0  TCP [::1]:5173 (LISTEN)

```


### netstat -an | grep 5173

```text
$ netstat -an | grep -E '\.5173[^0-9]' | head -20
tcp6       0      0  ::1.5173               *.*                    LISTEN     

```


## HTTP probes


### IPv4 — `http://127.0.0.1:5173/`

```text
curl: (7) Failed to connect to 127.0.0.1 port 5173 after 0 ms: Couldn't connect to server
HTTP 000  connect=0.000000s  total=0.000171s  bytes=0  remote=:0
--- response headers ---
curl: (7) Failed to connect to 127.0.0.1 port 5173 after 0 ms: Couldn't connect to server
--- response body (first 400 bytes) ---


```


### IPv6 — `http://[::1]:5173/`

```text
HTTP 200  connect=0.000272s  total=0.010783s  bytes=672  remote=::1:5173
--- response headers ---
HTTP/1.1 200 OK
Vary: Origin
Content-Type: text/html
Cache-Control: no-cache
Etag: W/"2a0-GeHxsKgWcUhhHk/NSCIwD6rdWYg"
Date: Wed, 22 Apr 2026 21:44:02 GMT
Connection: keep-alive
Keep-Alive: timeout=5

--- response body (first 400 bytes) ---
<!doctype html>
<html lang="en">

<head>
  <script type="module">import { injectIntoGlobalHook } from "/@react-refresh";
injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;</script>

  <script type="module" src="/@vite/client"></script>

  <meta name="color-scheme" content="light dark" />
  <meta charset="UTF-8" />
  <meta name="viewport" conte

```


### localhost — `http://localhost:5173/`

```text
HTTP 200  connect=0.000208s  total=0.011474s  bytes=672  remote=::1:5173
--- response headers ---
HTTP/1.1 200 OK
Vary: Origin
Content-Type: text/html
Cache-Control: no-cache
Etag: W/"2a0-GeHxsKgWcUhhHk/NSCIwD6rdWYg"
Date: Wed, 22 Apr 2026 21:44:02 GMT
Connection: keep-alive
Keep-Alive: timeout=5

--- response body (first 400 bytes) ---
<!doctype html>
<html lang="en">

<head>
  <script type="module">import { injectIntoGlobalHook } from "/@react-refresh";
injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;</script>

  <script type="module" src="/@vite/client"></script>

  <meta name="color-scheme" content="light dark" />
  <meta charset="UTF-8" />
  <meta name="viewport" conte

```


### API config — `http://localhost:5173/api/config`

```text
HTTP 200  connect=0.000219s  total=0.149104s  bytes=72  remote=::1:5173
--- response headers ---
HTTP/1.1 200 OK
Vary: Origin
Content-Type: application/json
Cache-Control: no-store
X-Content-Type-Options: nosniff
Date: Wed, 22 Apr 2026 21:44:02 GMT
Connection: keep-alive
Keep-Alive: timeout=5

--- response body (first 400 bytes) ---
{"collabUrl":"ws://localhost:5173/collab","previewUrl":null,"port":5173}

```


## WebSocket upgrade handshakes

A healthy server returns `HTTP/1.1 101 Switching Protocols` for both paths. `400`, `404`, or connection drop = upgrade handler is not wired.


### /collab (IPv4) — `http://127.0.0.1:5173/collab`

```text
curl: (7) Failed to connect to 127.0.0.1 port 5173 after 0 ms: Couldn't connect to server

```


### /collab (IPv6) — `http://[::1]:5173/collab`

```text
curl: (28) Operation timed out after 5006 milliseconds with 0 bytes received
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: DSnlgAGpQYlFw2dP4U95DNvLlLo=


```


### /collab (localhost) — `http://localhost:5173/collab`

```text
curl: (28) Operation timed out after 5006 milliseconds with 0 bytes received
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: xTUDrZ/z/sTt/3J1/yYhUfAIJh8=


```


### /collab/keepalive (localhost) — `http://localhost:5173/collab/keepalive`

```text
curl: (28) Operation timed out after 5006 milliseconds with 0 bytes received
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: EwDDAgKsURs3GODgExwvrt0pa40=


```


## Address-family-forced HTTP probes (decisive)

Force curl to resolve `localhost` over IPv4 (`-4`) vs IPv6 (`-6`) and retry the request. If one succeeds and the other refuses, the binding story is settled.


### IPv4-forced (localhost → A record) — `curl -4 http://localhost:5173/`

```text
curl: (7) Failed to connect to localhost port 5173 after 0 ms: Couldn't connect to server
HTTP 000  connect=0.000000s  total=0.000199s  bytes=0  remote=:0
--- exit=7 ---
--- body (first 200 bytes) ---


```


### IPv6-forced (localhost → AAAA record) — `curl -6 http://localhost:5173/`

```text
HTTP 200  connect=0.000239s  total=0.002010s  bytes=672  remote=::1:5173
--- exit=0 ---
--- body (first 200 bytes) ---
<!doctype html>
<html lang="en">

<head>
  <script type="module">import { injectIntoGlobalHook } from "/@react-refresh";
injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSi

```


## Address-family-forced WebSocket probes (decisive)

Same idea for the `/collab` upgrade — forces the address family independent of resolution order. A healthy upgrade has `HTTP/1.1 101 Switching Protocols` in the output (curl will still `exit 28` because it waits for frames that never come after the upgrade — that's expected).


### IPv4-forced — `curl -4 http://localhost:5173/collab`

```text
curl: (7) Failed to connect to localhost port 5173 after 0 ms: Couldn't connect to server

```


### IPv6-forced — `curl -6 http://localhost:5173/collab`

```text
curl: (28) Operation timed out after 3006 milliseconds with 0 bytes received
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: SOqK3aes1/IHHcjCzfNyHi8A1jU=


```


## Runtime DNS resolution (what bun / Vite's `listen()` sees)

`dns.lookup` is what Node / bun calls internally when you pass a hostname to `http.listen()`. Whether the listener lands on IPv4, IPv6, or both is decided by the resolver order here, not the system shell's `getent` / `dscacheutil`.

```text
-- default order --
  single: {
  address: "::1",
  family: 6,
}
  all:    [
  {
    address: "::1",
    family: 6,
  }, {
    address: "127.0.0.1",
    family: 4,
  }
]
-- after setDefaultResultOrder("ipv4first") --
  single: {
  address: "127.0.0.1",
  family: 4,
}
  all:    [
  {
    address: "127.0.0.1",
    family: 4,
  }, {
    address: "::1",
    family: 6,
  }
]
-- after setDefaultResultOrder("verbatim") --
  single: {
  address: "::1",
  family: 6,
}
  all:    [
  {
    address: "::1",
    family: 6,
  }, {
    address: "127.0.0.1",
    family: 4,

```


## Loopback interface sanity

Confirms both `127.0.0.1/8` and `::1/128` are bound on the loopback interface. If either is missing, the kernel cannot route traffic on that address family regardless of where Vite bound.


### ifconfig lo0

```text
$ ifconfig lo0 2>/dev/null || ifconfig lo 2>/dev/null
lo0: flags=8049<UP,LOOPBACK,RUNNING,MULTICAST> mtu 16384
	options=1203<RXCSUM,TXCSUM,TXSTATUS,SW_TIMESTAMP>
	inet 127.0.0.1 netmask 0xff000000
	inet6 ::1 prefixlen 128 
	inet6 fe80::1%lo0 prefixlen 64 scopeid 0x1 
	nd6 options=201<PERFORMNUD,DAD>

```


### IPv4 loopback ping

```text
PING 127.0.0.1 (127.0.0.1): 56 data bytes
64 bytes from 127.0.0.1: icmp_seq=0 ttl=64 time=0.095 ms

--- 127.0.0.1 ping statistics ---
1 packets transmitted, 1 packets received, 0.0% packet loss

```


### IPv6 loopback ping

```text
PING6(56=40+8+8 bytes) ::1 --> ::1
16 bytes from ::1, icmp_seq=0 hlim=64 time=0.103 ms

--- ::1 ping6 statistics ---
1 packets transmitted, 1 packets received, 0.0% packet loss

```


## macOS Application Firewall

Rare but real — if ALF is on and bun / node are not allow-listed, inbound connections (including loopback in some setups) can be dropped.


### socketfilterfw --getglobalstate

```text
$ /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate 2>&1
Firewall is disabled. (State = 0)

```


### socketfilterfw --getstealthmode

```text
$ /usr/libexec/ApplicationFirewall/socketfilterfw --getstealthmode 2>&1
Firewall stealth mode is off

```


### socketfilterfw --getblockall

```text
$ /usr/libexec/ApplicationFirewall/socketfilterfw --getblockall 2>&1
Firewall has block all state set to disabled.

```


## server.lock

```json
{
  "pid": 67954,
  "hostname": "Andrews-MacBook-Pro.local",
  "port": 5173,
  "startedAt": "2026-04-22T21:43:59.022Z",
  "worktreeRoot": "/Users/andrew/Documents/code/open-knowledge"
}
```


## Dev server log (first 60 lines)

```text
@inkeep/open-knowledge-app dev: [hocuspocus] content dir: REPO
@inkeep/open-knowledge-app dev: [collab] configureServer invocation=1 pid=67954
@inkeep/open-knowledge-app dev: [hocuspocus] WebSocket server ready on /collab
@inkeep/open-knowledge-app dev: [hocuspocus] Agent write API at POST /api/agent-write
@inkeep/open-knowledge-app dev: [hocuspocus] Agent markdown write API at POST /api/agent-write-md
@inkeep/open-knowledge-app dev: [file-watcher] Watching REPO for external .md changes (backend: parcel)
@inkeep/open-knowledge-app dev: [shadow-lock] Stale lock detected (pid=66964, host=Andrews-MacBook-Pro.local) — replacing
@inkeep/open-knowledge-app dev: [dev] Shadow repo initialized at REPO/.git/open-knowledge
@inkeep/open-knowledge-app dev: 
@inkeep/open-knowledge-app dev:   VITE v8.0.8  ready in 2903 ms
@inkeep/open-knowledge-app dev: 
@inkeep/open-knowledge-app dev:   ➜  Local:   http://localhost:5173/
@inkeep/open-knowledge-app dev:   ➜  Network: use --host to expose
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z
@inkeep/open-knowledge-app dev: [collab] upgrade received url=/collab protocol=none host=[::1]:5173 origin=none
@inkeep/open-knowledge-app dev: [collab] handleUpgrade starting for /collab
@inkeep/open-knowledge-app dev: [collab] handshake complete for /collab (connections before=1)
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z
@inkeep/open-knowledge-app dev: [collab] upgrade received url=/collab protocol=none host=localhost:5173 origin=none
@inkeep/open-knowledge-app dev: [collab] handleUpgrade starting for /collab
@inkeep/open-knowledge-app dev: [collab] handshake complete for /collab (connections before=1)
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z
@inkeep/open-knowledge-app dev: [collab] upgrade received url=/collab/keepalive protocol=none host=localhost:5173 origin=none
@inkeep/open-knowledge-app dev: [collab] keepalive handleUpgrade starting for /collab/keepalive
@inkeep/open-knowledge-app dev: [collab] keepalive handshake complete for /collab/keepalive
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z
@inkeep/open-knowledge-app dev: [collab] upgrade received url=/collab protocol=none host=localhost:5173 origin=none
@inkeep/open-knowledge-app dev: [collab] handleUpgrade starting for /collab
@inkeep/open-knowledge-app dev: [collab] handshake complete for /collab (connections before=1)
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z

```


## Dev server log (last 200 lines)

```text
@inkeep/open-knowledge-app dev: [hocuspocus] content dir: REPO
@inkeep/open-knowledge-app dev: [collab] configureServer invocation=1 pid=67954
@inkeep/open-knowledge-app dev: [hocuspocus] WebSocket server ready on /collab
@inkeep/open-knowledge-app dev: [hocuspocus] Agent write API at POST /api/agent-write
@inkeep/open-knowledge-app dev: [hocuspocus] Agent markdown write API at POST /api/agent-write-md
@inkeep/open-knowledge-app dev: [file-watcher] Watching REPO for external .md changes (backend: parcel)
@inkeep/open-knowledge-app dev: [shadow-lock] Stale lock detected (pid=66964, host=Andrews-MacBook-Pro.local) — replacing
@inkeep/open-knowledge-app dev: [dev] Shadow repo initialized at REPO/.git/open-knowledge
@inkeep/open-knowledge-app dev: 
@inkeep/open-knowledge-app dev:   VITE v8.0.8  ready in 2903 ms
@inkeep/open-knowledge-app dev: 
@inkeep/open-knowledge-app dev:   ➜  Local:   http://localhost:5173/
@inkeep/open-knowledge-app dev:   ➜  Network: use --host to expose
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z
@inkeep/open-knowledge-app dev: [collab] upgrade received url=/collab protocol=none host=[::1]:5173 origin=none
@inkeep/open-knowledge-app dev: [collab] handleUpgrade starting for /collab
@inkeep/open-knowledge-app dev: [collab] handshake complete for /collab (connections before=1)
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z
@inkeep/open-knowledge-app dev: [collab] upgrade received url=/collab protocol=none host=localhost:5173 origin=none
@inkeep/open-knowledge-app dev: [collab] handleUpgrade starting for /collab
@inkeep/open-knowledge-app dev: [collab] handshake complete for /collab (connections before=1)
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z
@inkeep/open-knowledge-app dev: [collab] upgrade received url=/collab/keepalive protocol=none host=localhost:5173 origin=none
@inkeep/open-knowledge-app dev: [collab] keepalive handleUpgrade starting for /collab/keepalive
@inkeep/open-knowledge-app dev: [collab] keepalive handshake complete for /collab/keepalive
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z
@inkeep/open-knowledge-app dev: [collab] upgrade received url=/collab protocol=none host=localhost:5173 origin=none
@inkeep/open-knowledge-app dev: [collab] handleUpgrade starting for /collab
@inkeep/open-knowledge-app dev: [collab] handshake complete for /collab (connections before=1)
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-214358Z

```


## Dev server log (collab-related lines)

```text
1:@inkeep/open-knowledge-app dev: [hocuspocus] content dir: REPO
2:@inkeep/open-knowledge-app dev: [collab] configureServer invocation=1 pid=67954
3:@inkeep/open-knowledge-app dev: [hocuspocus] WebSocket server ready on /collab
4:@inkeep/open-knowledge-app dev: [hocuspocus] Agent write API at POST /api/agent-write
5:@inkeep/open-knowledge-app dev: [hocuspocus] Agent markdown write API at POST /api/agent-write-md
24:@inkeep/open-knowledge-app dev: [collab] upgrade received url=/collab protocol=none host=[::1]:5173 origin=none
25:@inkeep/open-knowledge-app dev: [collab] handleUpgrade starting for /collab
26:@inkeep/open-knowledge-app dev: [collab] handshake complete for /collab (connections before=1)
31:@inkeep/open-knowledge-app dev: [collab] upgrade received url=/collab protocol=none host=localhost:5173 origin=none
32:@inkeep/open-knowledge-app dev: [collab] handleUpgrade starting for /collab
33:@inkeep/open-knowledge-app dev: [collab] handshake complete for /collab (connections before=1)
38:@inkeep/open-knowledge-app dev: [collab] upgrade received url=/collab/keepalive protocol=none host=localhost:5173 origin=none
39:@inkeep/open-knowledge-app dev: [collab] keepalive handleUpgrade starting for /collab/keepalive
40:@inkeep/open-knowledge-app dev: [collab] keepalive handshake complete for /collab/keepalive
45:@inkeep/open-knowledge-app dev: [collab] upgrade received url=/collab protocol=none host=localhost:5173 origin=none
46:@inkeep/open-knowledge-app dev: [collab] handleUpgrade starting for /collab
47:@inkeep/open-knowledge-app dev: [collab] handshake complete for /collab (connections before=1)

```


## Verdict

**HTTP: IPv6-only** (matches the committed baseline). `curl -4 http://localhost:5173/` is refused; `curl -6 http://localhost:5173/` succeeds. A browser that resolves `localhost` to `127.0.0.1` first (Happy Eyeballs tilt, `dns.setDefaultResultOrder('ipv4first')`, browser extension, corporate DNS) will silently fail to connect. Decisive fix candidate: set `server.host: '127.0.0.1'` (or `'0.0.0.0'`) in `packages/app/vite.config.ts` so the listener binds IPv4 too.

**WebSocket /collab: IPv6-only** (matches the committed baseline). `curl -4 http://localhost:5173/collab` is refused; `curl -6 http://localhost:5173/collab` succeeds. A browser that resolves `localhost` to `127.0.0.1` first (Happy Eyeballs tilt, `dns.setDefaultResultOrder('ipv4first')`, browser extension, corporate DNS) will silently fail to connect. Decisive fix candidate: set `server.host: '127.0.0.1'` (or `'0.0.0.0'`) in `packages/app/vite.config.ts` so the listener binds IPv4 too.


## Summary

```text
- node_modules installed: yes
- Vite ready:             yes
- /collab ready:          yes
- Server process alive:   yes
- HTTP IPv4 localhost:    unreachable
- HTTP IPv6 localhost:    reachable
- WS   IPv4 /collab:      failed
- WS   IPv6 /collab:      101-upgrade

```

