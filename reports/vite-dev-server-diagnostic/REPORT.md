# Vite dev-server diagnostic — baseline findings and triage script

Open Knowledge MCP unavailable in this session; this file was written with native tools.

## TL;DR

Running `bun run --filter @inkeep/open-knowledge-app dev` on the working machine (Andrew's Mac, macOS 26.3, Darwin 25.3.0 arm64) came up clean: Vite ready in ~5 s, Hocuspocus `/collab` ready, HTTP `200` on the root, `/api/config` returns the expected JSON, and all three WebSocket paths (`/collab` over both IPv4 and IPv6, `/collab/keepalive`) return `101 Switching Protocols`. Baseline report: [results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-205005Z.md](results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-205005Z.md).

The single most interesting signal from the baseline — and the leading hypothesis for why Dima's machine "doesn't fully work" — is that **the Vite listener is IPv6-only**. On the working machine:

- `lsof` reports one listener: `node ... TCP [::1]:5173 (LISTEN)` (IPv6 loopback only; no IPv4).
- `curl http://127.0.0.1:5173/` → `curl: (7) Failed to connect … Couldn't connect to server`.
- `curl http://[::1]:5173/` → `200 OK`.
- `curl http://localhost:5173/` → `200 OK`, but only because macOS resolves `localhost` → `::1` first (`dscacheutil -q host -a name localhost` returns both `::1` and `127.0.0.1`; the libc resolver picks `::1`).

Anything that prefers IPv4 — a browser configured to force IPv4, a `/etc/hosts` where `localhost` maps only to `127.0.0.1`, an IPv6-disabled machine, a corporate proxy that strips IPv6, a browser extension — will silently fail to connect even though the server "is up."

Why it binds IPv6-only: `packages/app/vite.config.ts` sets `server.port` but not `server.host`. Vite's default host is `localhost`, and Node's `http.listen(port, 'localhost')` on macOS resolves to `::1` and binds IPv6-only. This is a well-known Vite/Node behavior, not specific to this repo.

## Hypothesis ranked list

1. **localhost resolution mismatch on Dima's machine.** The loading page works / browser shows it loading but something never connects. Most likely surface: WebSocket to `/collab` fails because the browser's IPv4 path to `127.0.0.1:5173` has nothing to connect to. Check Dima's `getent`/`dscacheutil` output and the `lsof` listener line in his diagnostic.
2. **Something already bound on 5173 on Dima's machine** (another Vite, another dev server, leftover process). The script kills pre-existing listeners before starting; if Dima runs without the script and the orphan is still holding the port, Vite will either bind to `5174` silently (because `strictPort` is `false` when `VITE_PORT` is unset — see `vite.config.ts:86`) or fail.
3. **Missing / partial `bun install`.** Dima has no `node_modules/.bin/vite` → `vite: command not found` (we hit this here once today already). The script reports this explicitly.
4. **Corporate proxy / VPN intercepting loopback.** Rare but real; `HTTP_PROXY`/`ALL_PROXY` env vars capture that.
5. **`/collab/keepalive` regression.** A recent fix landed for this (`57b50335 fix(app): route /collab/keepalive as bare WS in Vite dev plugin #280`). If Dima is on a branch that predates it, keepalive will 400 / drop. The script probes it explicitly.

## What the script collects

`reports/vite-dev-server-diagnostic/diagnose.sh` is a single bash file, no network deps, self-contained teardown. It produces `results/DIAGNOSTIC-<host>-<ts>.md` containing:

- macOS + bun + node + git versions, PATH, HEAD SHA, working-tree status.
- `localhost` resolution (`dscacheutil` + `dig` + `/etc/hosts`).
- Proxy / VPN env vars.
- Presence of `node_modules` / `node_modules/.bin/vite` / `packages/app/node_modules`.
- Stale listener on target port (and kills it before starting).
- Full dev-server startup: times out at 120 s with readiness markers for Vite and `/collab`.
- Process tree + `lsof`/`ss`/`netstat` listener list on the port.
- HTTP GET on `http://127.0.0.1:5173/`, `http://[::1]:5173/`, `http://localhost:5173/`, and `/api/config`, each with headers + first 400 body bytes + timing.
- WebSocket upgrade handshakes to `/collab` over IPv4, IPv6, and localhost, plus `/collab/keepalive` — expects `HTTP/1.1 101 Switching Protocols`.
- `.open-knowledge/server.lock` dump.
- First 60 / last 200 / collab-filtered tails of the dev-server log.

On successful run, the report ends with a one-screen summary. Probe failures don't abort the script — they become content in the report, so a partially-broken environment still gives us a diff.

## Instructions for Dima

Copy-pasteable. Assumes a clone of `inkeep/open-knowledge` at the same SHA (`main`, or whichever branch you're collaborating on).

```bash
# from the repo root
bun install                                              # only if you haven't already
bash reports/vite-dev-server-diagnostic/diagnose.sh      # produces the markdown report
# If port 5173 isn't free on your box, pass another:
#   bash reports/vite-dev-server-diagnostic/diagnose.sh 5199
```

The script prints the output path at the end, e.g.:

```
Done. Report: /Users/dima/…/reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Dimas-Machine-<ts>.md
Server log:   /Users/dima/…/reports/vite-dev-server-diagnostic/results/server-Dimas-Machine-<ts>.log
```

Send both files back.

### Browser sanity tests to run by hand after the script finishes

The script tears the server down at the end. For the browser checks, start the server yourself (`bun run --filter @inkeep/open-knowledge-app dev`), then in each browser open DevTools → Network → WS filter and load `http://localhost:5173/`:

1. **Chrome/Arc:** does a WS connect to `ws://localhost:5173/collab`? Does it return `101`? Does it get subsequent binary frames, or hang?
2. **Safari:** same check. Safari has historically been pickier about loopback + IPv6 and is worth an explicit A/B.
3. **Try `http://[::1]:5173/`** in whichever browser fails on `localhost`. If `[::1]` works but `localhost` doesn't, that's confirmation of the IPv6-only-binding hypothesis.
4. **Try `http://127.0.0.1:5173/`.** If this works, Vite is binding dual-stack or IPv4-only on Dima's box and our hypothesis is wrong. If it hangs/errors, IPv6 is the story.

If it IS the IPv6-binding story, the one-line fix is:

```ts
// packages/app/vite.config.ts
server: {
  host: '127.0.0.1',        // or '0.0.0.0' if you want LAN access
  port: vitePort ?? 5173,
  …
}
```

Do NOT land that without understanding downstream effects on `/api/config`'s `collabUrl` (which reflects the request `Host`), Playwright's `VITE_PORT=13579` config, and anything else that assumed `localhost` resolves symmetrically on both sides. It's a hypothesis-confirmation fix, not a commit-ready one.

## How to compare my baseline vs Dima's report

Every probe section has a stable header. Once Dima's file arrives:

```bash
diff -u \
  reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Andrews-MacBook-Pro-*.md \
  reports/vite-dev-server-diagnostic/results/DIAGNOSTIC-Dimas-*.md \
  | less
```

Sections to read first, in order of signal:

1. **HTTP probes** — IPv4 vs IPv6 vs localhost. Any of the three failing where my baseline has `200 OK` is the diff.
2. **WebSocket upgrade handshakes** — anything other than `HTTP/1.1 101 Switching Protocols` in the first five lines of a section means upgrade isn't wired.
3. **Listeners on port 5173** — `IPv6 [::1]:5173` (IPv6-only, matches baseline) vs `IPv4 *:5173` vs `IPv6 *:5173` vs nothing at all are four distinct failure modes.
4. **Dev server log (collab-related lines)** — the `[collab] configureServer invocation=N pid=M` line tells us if the plugin initialized more than once (`specs/.../hocuspocus-plugin.ts:276` warns on >1); the `[collab] upgrade received …` / `handleUpgrade starting` / `handshake complete` trio tells us how far each WS upgrade got.
5. **localhost resolution + /etc/hosts** — divergence here confirms or rules out the IPv6 hypothesis.

## Artifacts in this directory

- `diagnose.sh` — the probe script.
- `REPORT.md` — this file.
- `results/DIAGNOSTIC-Andrews-MacBook-Pro-20260422-205005Z.md` — baseline from the working machine. (The script also writes `server-<host>-<ts>.log` beside it — the raw dev-server stdout — but `*.log` is repo-`.gitignore`d, so it only exists locally. The collab-filtered / first-60 / last-200 tails are embedded in the `.md` report itself.)

## Script layout (quick tour)

The report sections are produced in this order; the first two are the ones to read first:

1. **Prerequisites** — `bun` + `node` availability, with version-manager shim sniff (fnm/nvm/volta/mise/asdf) emitted only when either is missing, so "I thought I had node" is caught before the rest of the report even loads.
2. **Environment** — full tool inventory, macOS version, `git` state, working-tree changes.
3. **localhost resolution** — `dscacheutil` / `dig` / `/etc/hosts` entries for the IPv6-vs-IPv4 story.
4. **Proxy / VPN env** — flags `HTTP_PROXY` / `ALL_PROXY` that can intercept loopback.
5. **Dependencies** — `node_modules/` and `node_modules/.bin/vite` presence checks.
6. **Pre-start stale listeners** — if anything is already bound on the target port, the script reports it and kills it before starting, so the run is a clean A/B.
7. **Dev server startup** — launches in the background, waits up to 120 s for both "Vite ready" and `/collab ready`, tees the raw log to `results/server-*.log`.
8. **Process tree** — `pgrep -af`, children of the bun root PID.
9. **Listeners on port** — `lsof` / `ss` / `netstat` — the line that reveals IPv6-only vs dual-stack vs IPv4-only binding.
10. **HTTP probes** — IPv4 / IPv6 / localhost / `/api/config`.
11. **WebSocket upgrade handshakes** — `/collab` over IPv4 + IPv6 + localhost, plus `/collab/keepalive`.
12. **server.lock** — the `.open-knowledge/server.lock` dump.
13. **Dev server log** — first 60 / last 200 / collab-filtered tails of the raw stdout+stderr.
14. **Summary** — four-line TL;DR: `node_modules`, Vite ready, `/collab` ready, process alive.
