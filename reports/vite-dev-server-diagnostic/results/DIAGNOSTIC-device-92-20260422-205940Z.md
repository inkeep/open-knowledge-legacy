
# Open Knowledge dev-server diagnostic

- **Host:** `device-92`
- **Timestamp (UTC):** `20260422-205940Z`
- **Repo root:** `/Users/Inkeep/Desktop/ok`
- **Target port:** `5173`
- **Ready timeout:** `120s`

## Prerequisites (bun + node must both be available)

- **bun:** `OK — /Users/Inkeep/.bun/bin/bun (1.3.11)`
- **node:** `MISSING`
:rotating_light: **node not on PATH.** The dev server cannot start without these. If either runtime is installed via a version manager (fnm, nvm, volta, mise, asdf), the shell the script runs under may not have loaded the shim — open a fresh terminal, activate the project's node version, then re-run.


### Version manager shims detected

```text
fnm:   /usr/local/bin/fnm
nvm:   (not found)
volta: (not on PATH)
mise:  (not on PATH)
asdf:  (not on PATH)

```


## Environment

- **User:** `Inkeep`
- **Shell:** `/bin/zsh`
- **TERM:** `xterm-256color`
- **LANG:** `unset`
- **PATH (truncated):** `/Users/Inkeep/.bun/bin:/Users/Inkeep/.local/state/fnm_multishells/17313_1776891140605/bin:/usr/local/bin:/System/Cryptexes/App/usr/bin:/usr/bin:/bin:/usr/sbin:/sbin:/var/run/com.apple.security.cryptex`
- **uname:** `Darwin device-92.home 24.2.0 Darwin Kernel Version 24.2.0: Fri Dec  6 18:56:34 PST 2024; root:xnu-11215.61.5~2/RELEASE_ARM64_T6020 arm64`
- **macOS:** `15.2 (24C101)`
- **bun:** `/Users/Inkeep/.bun/bin/bun — 1.3.11`
- **node:** `MISSING`
- **git:** `/usr/local/bin/git — git version 2.45.2`
- **curl:** `/usr/bin/curl — curl 8.7.1 (x86_64-apple-darwin24.0) libcurl/8.7.1 (SecureTransport) LibreSSL/3.3.6 zlib/1.2.12 nghttp2/1.63.0`
- **openssl:** `/usr/local/bin/openssl — OpenSSL 3.3.1 4 Jun 2024 (Library: OpenSSL 3.3.1 4 Jun 2024)`
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
HEAD:    0ae0389b
branch:  chore/vite-dev-server-diagnostic
remote:  git@github.com:inkeep/open-knowledge.git
worktree: true

```


### Working tree changes

```text
?? reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-device-92-20260422-205940Z.md

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

```


### /etc/hosts (localhost lines)

```text
1:##
2:
3:# Host Database
4:
5:#
6:
7:# localhost is used to configure the loopback interface
8:
9:# when the system is booting. Do not change this entry.
10:
11:##
12:
13:127.0.0.1 localhost
15:::1 localhost
16:
20:
21:
22:
23:
24:# Added by Docker Desktop
25:# To allow the same kube context to work on the host and the container:
28:# End of section

```


## Proxy / VPN env

```text
(none set)

```


## Dependencies

- **node_modules/:** `present`
- **node_modules/.bin/vite:** `present`
- **packages/app/node_modules/:** `present`
- **bun.lock mtime:** `Apr 22 22:58:56 2026`
- **bun.lock size:** `492482 bytes`

## Pre-start stale listeners on port 5173

(nothing listening on 5173)


## Dev server startup

Command: `VITE_PORT=5173 bun run --filter @inkeep/open-knowledge-app dev`

Log file: `/Users/Inkeep/Desktop/ok/reports/vite-dev-server-diagnostic/results/server-device-92-20260422-205940Z.log`

- **Vite ready:** `yes`
- **Hocuspocus /collab ready:** `yes`
- **Process alive after wait:** `yes`
- **Seconds waited:** `3`

## Process tree


### pgrep -af 'vite|hocus|bun run'

```text
$ pgrep -af 'vite|hocus|bun run' | grep -v -i -E '(claude|cursor-agent|codex)' | head -40
21759
21863
21867
21910

```


### ps -ef (children of 21863)

```text
$ ps -ef | awk -v p=21863 'NR==1 || $2==p || $3==p'
  UID   PID  PPID   C STIME   TTY           TIME CMD
  502 21863 21759   0 10:59PM ttys008    0:00.00 bun run --filter @inkeep/open-knowledge-app dev
  502 21867 21863   0 10:59PM ttys008    0:03.32 node /Users/Inkeep/Desktop/ok/node_modules/.bin/vite

```


## Listeners on port 5173


### lsof -iTCP:5173 -sTCP:LISTEN

```text
$ lsof -nP -iTCP:5173 -sTCP:LISTEN
COMMAND   PID   USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
bun     21867 Inkeep    7u  IPv6 0xa3483144a1ba651e      0t0  TCP [::1]:5173 (LISTEN)

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
HTTP 000  connect=0.000000s  total=0.000196s  bytes=0  remote=:0
--- response headers ---
curl: (7) Failed to connect to 127.0.0.1 port 5173 after 0 ms: Couldn't connect to server
--- response body (first 400 bytes) ---


```


### IPv6 — `http://[::1]:5173/`

```text
HTTP 200  connect=0.000228s  total=0.012087s  bytes=672  remote=::1:5173
--- response headers ---
HTTP/1.1 200 OK
Vary: Origin
Content-Type: text/html
Cache-Control: no-cache
ETag: W/"2a0-GeHxsKgWcUhhHk/NSCIwD6rdWYg"
Date: Wed, 22 Apr 2026 20:59:44 GMT
Content-Length: 0

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
HTTP 200  connect=0.000172s  total=2.610324s  bytes=672  remote=::1:5173
--- response headers ---
HTTP/1.1 200 OK
Vary: Origin
Content-Type: text/html
Cache-Control: no-cache
ETag: W/"2a0-GeHxsKgWcUhhHk/NSCIwD6rdWYg"
Date: Wed, 22 Apr 2026 20:59:46 GMT
Content-Length: 0

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
HTTP 200  connect=0.000170s  total=0.007484s  bytes=72  remote=::1:5173
--- response headers ---
HTTP/1.1 200 OK
Vary: Origin
Content-Type: application/json
Cache-Control: no-store
X-Content-Type-Options: nosniff
Date: Wed, 22 Apr 2026 20:59:46 GMT
Content-Length: 0

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
curl: (28) Operation timed out after 5004 milliseconds with 0 bytes received

```


### /collab (localhost) — `http://localhost:5173/collab`

```text
curl: (28) Operation timed out after 5006 milliseconds with 0 bytes received

```


### /collab/keepalive (localhost) — `http://localhost:5173/collab/keepalive`

```text
curl: (28) Operation timed out after 5006 milliseconds with 0 bytes received

```


## server.lock

```json
{
  "pid": 21867,
  "hostname": "device-92.home",
  "port": 5173,
  "startedAt": "2026-04-22T20:59:41.301Z",
  "worktreeRoot": "/Users/Inkeep/Desktop/ok"
}
```


## Dev server log (first 60 lines)

```text
@inkeep/open-knowledge-app dev: [hocuspocus] content dir: REPO
@inkeep/open-knowledge-app dev: [collab] configureServer invocation=1 pid=21867
@inkeep/open-knowledge-app dev: [hocuspocus] WebSocket server ready on /collab
@inkeep/open-knowledge-app dev: [hocuspocus] Agent write API at POST /api/agent-write
@inkeep/open-knowledge-app dev: [hocuspocus] Agent markdown write API at POST /api/agent-write-md
@inkeep/open-knowledge-app dev: [file-watcher] Watching REPO for external .md changes (backend: parcel)
@inkeep/open-knowledge-app dev: [shadow-lock] Stale lock detected (pid=18622, host=device-92.home) — replacing
@inkeep/open-knowledge-app dev: [dev] Shadow repo initialized at REPO/.git/open-knowledge
@inkeep/open-knowledge-app dev: 
@inkeep/open-knowledge-app dev:   VITE v8.0.8  ready in 2847 ms
@inkeep/open-knowledge-app dev: 
@inkeep/open-knowledge-app dev:   ➜  Local:   http://localhost:5173/
@inkeep/open-knowledge-app dev:   ➜  Network: use --host to expose
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-device-92-20260422-205940Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-device-92-20260422-205940Z
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-device-92-20260422-205940Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-device-92-20260422-205940Z
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-device-92-20260422-205940Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-device-92-20260422-205940Z
@inkeep/open-knowledge-app dev: [collab] upgrade received url=/collab protocol=none host=localhost:5173 origin=http://localhost:5173
@inkeep/open-knowledge-app dev: [collab] handleUpgrade starting for /collab
@inkeep/open-knowledge-app dev: [collab] handshake complete for /collab (connections before=1)
@inkeep/open-knowledge-app dev: [collab] upgrade received url=/collab protocol=none host=localhost:5173 origin=http://localhost:5173
@inkeep/open-knowledge-app dev: [collab] handleUpgrade starting for /collab
@inkeep/open-knowledge-app dev: [collab] handshake complete for /collab (connections before=1)
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-device-92-20260422-205940Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-device-92-20260422-205940Z
@inkeep/open-knowledge-app dev: [collab] upgrade received url=/collab protocol=none host=[::1]:5173 origin=none
@inkeep/open-knowledge-app dev: [collab] handleUpgrade starting for /collab
@inkeep/open-knowledge-app dev: [collab] handshake complete for /collab (connections before=1)
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-device-92-20260422-205940Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-device-92-20260422-205940Z
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-device-92-20260422-205940Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-device-92-20260422-205940Z
@inkeep/open-knowledge-app dev: [collab] upgrade received url=/collab protocol=none host=localhost:5173 origin=none
@inkeep/open-knowledge-app dev: [collab] handleUpgrade starting for /collab
@inkeep/open-knowledge-app dev: [collab] handshake complete for /collab (connections before=1)
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-device-92-20260422-205940Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-device-92-20260422-205940Z
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-device-92-20260422-205940Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-device-92-20260422-205940Z
@inkeep/open-knowledge-app dev: [collab] upgrade received url=/collab/keepalive protocol=none host=localhost:5173 origin=none
@inkeep/open-knowledge-app dev: [collab] keepalive handleUpgrade starting for /collab/keepalive
@inkeep/open-knowledge-app dev: [collab] keepalive handshake complete for /collab/keepalive
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-device-92-20260422-205940Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-device-92-20260422-205940Z

```


## Dev server log (last 200 lines)

```text
@inkeep/open-knowledge-app dev: [hocuspocus] content dir: REPO
@inkeep/open-knowledge-app dev: [collab] configureServer invocation=1 pid=21867
@inkeep/open-knowledge-app dev: [hocuspocus] WebSocket server ready on /collab
@inkeep/open-knowledge-app dev: [hocuspocus] Agent write API at POST /api/agent-write
@inkeep/open-knowledge-app dev: [hocuspocus] Agent markdown write API at POST /api/agent-write-md
@inkeep/open-knowledge-app dev: [file-watcher] Watching REPO for external .md changes (backend: parcel)
@inkeep/open-knowledge-app dev: [shadow-lock] Stale lock detected (pid=18622, host=device-92.home) — replacing
@inkeep/open-knowledge-app dev: [dev] Shadow repo initialized at REPO/.git/open-knowledge
@inkeep/open-knowledge-app dev: 
@inkeep/open-knowledge-app dev:   VITE v8.0.8  ready in 2847 ms
@inkeep/open-knowledge-app dev: 
@inkeep/open-knowledge-app dev:   ➜  Local:   http://localhost:5173/
@inkeep/open-knowledge-app dev:   ➜  Network: use --host to expose
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-device-92-20260422-205940Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-device-92-20260422-205940Z
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-device-92-20260422-205940Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-device-92-20260422-205940Z
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-device-92-20260422-205940Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-device-92-20260422-205940Z
@inkeep/open-knowledge-app dev: [collab] upgrade received url=/collab protocol=none host=localhost:5173 origin=http://localhost:5173
@inkeep/open-knowledge-app dev: [collab] handleUpgrade starting for /collab
@inkeep/open-knowledge-app dev: [collab] handshake complete for /collab (connections before=1)
@inkeep/open-knowledge-app dev: [collab] upgrade received url=/collab protocol=none host=localhost:5173 origin=http://localhost:5173
@inkeep/open-knowledge-app dev: [collab] handleUpgrade starting for /collab
@inkeep/open-knowledge-app dev: [collab] handshake complete for /collab (connections before=1)
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-device-92-20260422-205940Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-device-92-20260422-205940Z
@inkeep/open-knowledge-app dev: [collab] upgrade received url=/collab protocol=none host=[::1]:5173 origin=none
@inkeep/open-knowledge-app dev: [collab] handleUpgrade starting for /collab
@inkeep/open-knowledge-app dev: [collab] handshake complete for /collab (connections before=1)
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-device-92-20260422-205940Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-device-92-20260422-205940Z
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-device-92-20260422-205940Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-device-92-20260422-205940Z
@inkeep/open-knowledge-app dev: [collab] upgrade received url=/collab protocol=none host=localhost:5173 origin=none
@inkeep/open-knowledge-app dev: [collab] handleUpgrade starting for /collab
@inkeep/open-knowledge-app dev: [collab] handshake complete for /collab (connections before=1)
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-device-92-20260422-205940Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-device-92-20260422-205940Z
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-device-92-20260422-205940Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-device-92-20260422-205940Z
@inkeep/open-knowledge-app dev: [collab] upgrade received url=/collab/keepalive protocol=none host=localhost:5173 origin=none
@inkeep/open-knowledge-app dev: [collab] keepalive handleUpgrade starting for /collab/keepalive
@inkeep/open-knowledge-app dev: [collab] keepalive handshake complete for /collab/keepalive
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-device-92-20260422-205940Z.md
@inkeep/open-knowledge-app dev: [file-watcher] Applied external change: reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-device-92-20260422-205940Z
@inkeep/open-knowledge-app dev: [file-watcher] Dispatching: update REPO/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-device-92-20260422-205940Z.md

```


## Dev server log (collab-related lines)

```text
1:@inkeep/open-knowledge-app dev: [hocuspocus] content dir: REPO
2:@inkeep/open-knowledge-app dev: [collab] configureServer invocation=1 pid=21867
3:@inkeep/open-knowledge-app dev: [hocuspocus] WebSocket server ready on /collab
4:@inkeep/open-knowledge-app dev: [hocuspocus] Agent write API at POST /api/agent-write
5:@inkeep/open-knowledge-app dev: [hocuspocus] Agent markdown write API at POST /api/agent-write-md
20:@inkeep/open-knowledge-app dev: [collab] upgrade received url=/collab protocol=none host=localhost:5173 origin=http://localhost:5173
21:@inkeep/open-knowledge-app dev: [collab] handleUpgrade starting for /collab
22:@inkeep/open-knowledge-app dev: [collab] handshake complete for /collab (connections before=1)
23:@inkeep/open-knowledge-app dev: [collab] upgrade received url=/collab protocol=none host=localhost:5173 origin=http://localhost:5173
24:@inkeep/open-knowledge-app dev: [collab] handleUpgrade starting for /collab
25:@inkeep/open-knowledge-app dev: [collab] handshake complete for /collab (connections before=1)
28:@inkeep/open-knowledge-app dev: [collab] upgrade received url=/collab protocol=none host=[::1]:5173 origin=none
29:@inkeep/open-knowledge-app dev: [collab] handleUpgrade starting for /collab
30:@inkeep/open-knowledge-app dev: [collab] handshake complete for /collab (connections before=1)
35:@inkeep/open-knowledge-app dev: [collab] upgrade received url=/collab protocol=none host=localhost:5173 origin=none
36:@inkeep/open-knowledge-app dev: [collab] handleUpgrade starting for /collab
37:@inkeep/open-knowledge-app dev: [collab] handshake complete for /collab (connections before=1)
42:@inkeep/open-knowledge-app dev: [collab] upgrade received url=/collab/keepalive protocol=none host=localhost:5173 origin=none
43:@inkeep/open-knowledge-app dev: [collab] keepalive handleUpgrade starting for /collab/keepalive
44:@inkeep/open-knowledge-app dev: [collab] keepalive handshake complete for /collab/keepalive

```


## Summary

```text
- node_modules installed: yes
- Vite ready:             yes
- /collab ready:          yes
- Server process alive:   yes

```

