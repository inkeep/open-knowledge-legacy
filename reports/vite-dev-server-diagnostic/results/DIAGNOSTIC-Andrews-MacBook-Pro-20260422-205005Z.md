
# Open Knowledge dev-server diagnostic

- **Host:** `Andrews-MacBook-Pro`
- **Timestamp (UTC):** `20260422-205005Z`
- **Repo root:** `/Users/andrew/Documents/code/open-knowledge`
- **Target port:** `5173`
- **Ready timeout:** `120s`

## Prerequisites (bun + node must both be available)

- **bun:** `OK — /Users/andrew/.bun/bin/bun (1.3.11)`
- **node:** `OK — /Users/andrew/.local/state/fnm_multishells/46608_1776888922110/bin/node (v22.18.0)`

## Environment

- **User:** `andrew`
- **Shell:** `/bin/zsh`
- **TERM:** `xterm-256color`
- **LANG:** `en_US.UTF-8`
- **PATH (truncated):** `/Users/andrew/.antigravity/antigravity/bin:/Users/andrew/Library/pnpm:/Users/andrew/.local/state/fnm_multishells/46608_1776888922110/bin:/Users/andrew/.composio:/Users/andrew/.composio:/Users/andrew/.`
- **uname:** `Darwin Andrews-MacBook-Pro.local 25.3.0 Darwin Kernel Version 25.3.0: Wed Jan 28 20:47:03 PST 2026; root:xnu-12377.81.4~5/RELEASE_ARM64_T6031 arm64`
- **macOS:** `26.3 (25D125)`
- **bun:** `/Users/andrew/.bun/bin/bun — 1.3.11`
- **node:** `/Users/andrew/.local/state/fnm_multishells/46608_1776888922110/bin/node — v22.18.0`
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
HEAD:    57b50335
branch:  main
remote:  git@github.com:inkeep/open-knowledge.git
worktree: true

```


### Working tree changes

```text
 D packages/desktop/build/entitlements.mac.plist
 M packages/desktop/build/icon.png
?? reports/orphan-process-prevention/
?? reports/vite-dev-server-diagnostic/

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
- **bun.lock mtime:** `Apr 22 13:42:30 2026`
- **bun.lock size:** `492482 bytes`

## Pre-start stale listeners on port 5173

(nothing listening on 5173)


## Dev server startup

Command: `VITE_PORT=5173 bun run --filter @inkeep/open-knowledge-app dev`

Log file: `/Users/andrew/Documents/code/open-knowledge/reports/vite-dev-server-diagnostic/results/server-Andrews-MacBook-Pro-20260422-205005Z.log`

- **Vite ready:** `yes`
- **Hocuspocus /collab ready:** `yes`
- **Process alive after wait:** `yes`
- **Seconds waited:** `6`

## Process tree


### pgrep -af 'vite|hocus|bun run'

```text
$ pgrep -af 'vite|hocus|bun run' | grep -v -i -E '(claude|cursor-agent|codex)' | head -40
46710
55387
55391
55492
55496
55583

```


### ps -ef (children of 55492)

```text
$ ps -ef | awk -v p=55492 'NR==1 || $2==p || $3==p'
  UID   PID  PPID   C STIME   TTY           TIME CMD
  501 55492 55391   0  1:50PM ??         0:00.01 bun run --filter @inkeep/open-knowledge-app dev
  501 55496 55492   0  1:50PM ??         0:06.24 node /Users/andrew/Documents/code/open-knowledge/node_modules/.bin/vite

```


## Listeners on port 5173


### lsof -iTCP:5173 -sTCP:LISTEN

```text
$ lsof -nP -iTCP:5173 -sTCP:LISTEN
COMMAND   PID   USER   FD   TYPE            DEVICE SIZE/OFF NODE NAME
node    55496 andrew   19u  IPv6 0xad8b8b105971fb6      0t0  TCP [::1]:5173 (LISTEN)

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
HTTP 000  connect=0.000000s  total=0.000209s  bytes=0  remote=:0
--- response headers ---
curl: (7) Failed to connect to 127.0.0.1 port 5173 after 0 ms: Couldn't connect to server
--- response body (first 400 bytes) ---


```


### IPv6 — `http://[::1]:5173/`

```text
HTTP 200  connect=0.000272s  total=0.009735s  bytes=672  remote=::1:5173
--- response headers ---
HTTP/1.1 200 OK
Vary: Origin
Content-Type: text/html
Cache-Control: no-cache
Etag: W/"2a0-GeHxsKgWcUhhHk/NSCIwD6rdWYg"
Date: Wed, 22 Apr 2026 20:50:12 GMT
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
HTTP 200  connect=0.000231s  total=0.204248s  bytes=672  remote=::1:5173
--- response headers ---
HTTP/1.1 200 OK
Vary: Origin
Content-Type: text/html
Cache-Control: no-cache
Etag: W/"2a0-GeHxsKgWcUhhHk/NSCIwD6rdWYg"
Date: Wed, 22 Apr 2026 20:50:12 GMT
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
HTTP 200  connect=0.000273s  total=0.386853s  bytes=72  remote=::1:5173
--- response headers ---
HTTP/1.1 200 OK
Vary: Origin
Content-Type: application/json
Cache-Control: no-store
X-Content-Type-Options: nosniff
Date: Wed, 22 Apr 2026 20:50:13 GMT
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
curl: (28) Operation timed out after 5005 milliseconds with 0 bytes received
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: 8qGm2XGtwlpp+jwb4zXe+wSSGDM=


```


### /collab (localhost) — `http://localhost:5173/collab`

```text
curl: (28) Operation timed out after 5004 milliseconds with 0 bytes received
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: 9kL5e/8hIqRTsMYayVIMaClJaW4=


```


### /collab/keepalive (localhost) — `http://localhost:5173/collab/keepalive`

```text
curl: (28) Operation timed out after 5004 milliseconds with 0 bytes received
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: 39Vp8/xvQquqClYqCFLOAKroOoY=


```


## server.lock

```json
{
  "pid": 55496,
  "hostname": "Andrews-MacBook-Pro.local",
  "port": 5173,
  "startedAt": "2026-04-22T20:50:06.446Z",
  "worktreeRoot": "/Users/andrew/Documents/code/open-knowledge"
}
```


## Dev server log (first 60 lines)

```text
@inkeep/open-knowledge-app dev: [hocuspocus] content dir: REPO
@inkeep/open-knowledge-app dev: [collab] configureServer invocation=1 pid=55496
@inkeep/open-knowledge-app dev: [hocuspocus] WebSocket server ready on /collab
@inkeep/open-knowledge-app dev: [hocuspocus] Agent write API at POST /api/agent-write
@inkeep/open-knowledge-app dev: [hocuspocus] Agent markdown write API at POST /api/agent-write-md
@inkeep/open-knowledge-app dev: [file-watcher] Watching REPO for external .md changes (backend: parcel)
@inkeep/open-knowledge-app dev: [shadow-lock] Stale lock detected (pid=54421, host=Andrews-MacBook-Pro.local) — replacing
@inkeep/open-knowledge-app dev: [dev] Shadow repo initialized at REPO/.git/open-knowledge
@inkeep/open-knowledge-app dev: 
@inkeep/open-knowledge-app dev:   VITE v8.0.8  ready in 5409 ms
@inkeep/open-knowledge-app dev: 
@inkeep/open-knowledge-app dev:   ➜  Local:   http://localhost:5173/
@inkeep/open-knowledge-app dev:   ➜  Network: use --host to expose
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-205005Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-205005Z
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-205005Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-205005Z
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-205005Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-205005Z
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-205005Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-205005Z
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-205005Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-205005Z
@inkeep/open-knowledge-app dev: [collab] upgrade received url=/collab protocol=none host=[::1]:5173 origin=none
@inkeep/open-knowledge-app dev: [collab] handleUpgrade starting for /collab
@inkeep/open-knowledge-app dev: [collab] handshake complete for /collab (connections before=1)
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-205005Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-205005Z
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-205005Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-205005Z
@inkeep/open-knowledge-app dev: [collab] upgrade received url=/collab protocol=none host=localhost:5173 origin=none
@inkeep/open-knowledge-app dev: [collab] handleUpgrade starting for /collab
@inkeep/open-knowledge-app dev: [collab] handshake complete for /collab (connections before=1)
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-205005Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-205005Z
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-205005Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-205005Z
@inkeep/open-knowledge-app dev: [collab] upgrade received url=/collab/keepalive protocol=none host=localhost:5173 origin=none
@inkeep/open-knowledge-app dev: [collab] keepalive handleUpgrade starting for /collab/keepalive
@inkeep/open-knowledge-app dev: [collab] keepalive handshake complete for /collab/keepalive
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-205005Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-205005Z

```


## Dev server log (last 200 lines)

```text
@inkeep/open-knowledge-app dev: [hocuspocus] content dir: REPO
@inkeep/open-knowledge-app dev: [collab] configureServer invocation=1 pid=55496
@inkeep/open-knowledge-app dev: [hocuspocus] WebSocket server ready on /collab
@inkeep/open-knowledge-app dev: [hocuspocus] Agent write API at POST /api/agent-write
@inkeep/open-knowledge-app dev: [hocuspocus] Agent markdown write API at POST /api/agent-write-md
@inkeep/open-knowledge-app dev: [file-watcher] Watching REPO for external .md changes (backend: parcel)
@inkeep/open-knowledge-app dev: [shadow-lock] Stale lock detected (pid=54421, host=Andrews-MacBook-Pro.local) — replacing
@inkeep/open-knowledge-app dev: [dev] Shadow repo initialized at REPO/.git/open-knowledge
@inkeep/open-knowledge-app dev: 
@inkeep/open-knowledge-app dev:   VITE v8.0.8  ready in 5409 ms
@inkeep/open-knowledge-app dev: 
@inkeep/open-knowledge-app dev:   ➜  Local:   http://localhost:5173/
@inkeep/open-knowledge-app dev:   ➜  Network: use --host to expose
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-205005Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-205005Z
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-205005Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-205005Z
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-205005Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-205005Z
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-205005Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-205005Z
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-205005Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-205005Z
@inkeep/open-knowledge-app dev: [collab] upgrade received url=/collab protocol=none host=[::1]:5173 origin=none
@inkeep/open-knowledge-app dev: [collab] handleUpgrade starting for /collab
@inkeep/open-knowledge-app dev: [collab] handshake complete for /collab (connections before=1)
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-205005Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-205005Z
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-205005Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-205005Z
@inkeep/open-knowledge-app dev: [collab] upgrade received url=/collab protocol=none host=localhost:5173 origin=none
@inkeep/open-knowledge-app dev: [collab] handleUpgrade starting for /collab
@inkeep/open-knowledge-app dev: [collab] handshake complete for /collab (connections before=1)
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-205005Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-205005Z
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-205005Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-205005Z
@inkeep/open-knowledge-app dev: [collab] upgrade received url=/collab/keepalive protocol=none host=localhost:5173 origin=none
@inkeep/open-knowledge-app dev: [collab] keepalive handleUpgrade starting for /collab/keepalive
@inkeep/open-knowledge-app dev: [collab] keepalive handshake complete for /collab/keepalive
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-205005Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-205005Z
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-205005Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-205005Z

```


## Dev server log (collab-related lines)

```text
1:@inkeep/open-knowledge-app dev: [hocuspocus] content dir: REPO
2:@inkeep/open-knowledge-app dev: [collab] configureServer invocation=1 pid=55496
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

```


## Summary

```text
- node_modules installed: yes
- Vite ready:             yes
- /collab ready:          yes
- Server process alive:   yes

```

