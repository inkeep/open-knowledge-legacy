# Onboarding walkthrough audit — global CLI → first Claude edit

**Date:** 2026-04-14
**Branch audited:** `main@d160ad4` (worktree `dx-exploration`)
**Package version:** `@inkeep/open-knowledge@0.0.1`
**Method:** Empirical walkthrough of the documented happy path in `/tmp/ok-onboarding-test/fresh-project/` (clean `git init`, clean `npm init -y`, installed from local tarball via `npm pack`), plus source code read of `packages/cli/src/commands/{init,start,mcp}.ts` and `packages/cli/package.json`.

## TL;DR

The happy path promised by `README.md` — `bunx @inkeep/open-knowledge init && bunx @inkeep/open-knowledge start` — fails at **four distinct points** for a first-time user today. Two are **P0 blockers** (editor UI silently broken; package not on npm yet); two are **P1 friction** (unfiltered `**/*.md` indexes `node_modules`; port-3000 collision crashes hard).

None of these are hard to fix. The audit is useful because each failure is silent or mis-signalled — a new user won't know why their experience is worse than the README promised.

## Findings, ranked by severity

### F1 (P0) — Browser UI silently broken under npm install

**The bug.** `packages/cli/src/commands/start.ts:99` resolves the React-app asset directory via `import.meta.dirname`. In the source tree this lives in `src/commands/`, and the comment says "npm install: dist/public/ (bundled assets)". But `tsdown` bundles each command into its own chunk — the compiled file is `dist/commands/start.mjs`, so `import.meta.dirname` at runtime is `<install>/dist/commands/`, **not** `<install>/dist/`. All three lookup paths then miss:

| Lookup path (resolved) | Exists? |
|---|---|
| `dist/commands/public` | ❌ |
| `dist/commands/../../app/dist` → `<project-root>/app/dist` | ❌ |
| `dist/commands/../../../app/dist` → parent of project | ❌ |

The actual assets are at `dist/public/` — one level up from where the code looks.

**Observed symptom.** On `open-knowledge start` in a fresh install:
```
[18:01:53] WARN (start): No React app assets found — browser UI will not be available
```
Server continues; HTTP server returns 404 for `/`; user opens http://localhost:3000 and sees nothing.

**Fix.** One line. Prepend `resolve(cliDir, '../public')` to the `assetPaths` array, or `resolve(cliDir, '..', 'public')`. Add a Tier-1 integration test that packs + installs + starts + GETs `/` and expects HTTP 200 with `<html>` body — this test would have caught it.

**Blast radius.** 100% of npm-installed users (global or local) since the tarball was built. Only monorepo dev mode (`bun run dev`) works because the Vite plugin serves assets directly.

---

### F2 (P0) — Package not published to npm; all documented invocations 404

```
$ npm view @inkeep/open-knowledge
npm error 404 Not Found - GET https://registry.npmjs.org/@inkeep%2fopen-knowledge
```

`README.md:14-16` tells users to run `bunx @inkeep/open-knowledge init` and `bunx @inkeep/open-knowledge start` — both fail today. The `.mcp.json` that `init` writes for Claude Code / Cursor / etc. uses `{ command: "npx", args: ["@inkeep/open-knowledge", "mcp"] }` — that also fails.

**Fix.** Either publish, or update the README to the actual install path (clone → `bun install` → `bun packages/cli/dist/cli.mjs start`) until publish is ready.

**Why this is worth flagging alongside F1.** Once F2 is fixed (publish), F1 immediately regresses every new install. Order-of-operations: **fix F1 before first npm publish**, or the first npm release ships a broken editor UI.

---

### F3 (P1) — Default `**/*.md` indexes `node_modules`

In a fresh Node project where the user just ran `npm install @inkeep/open-knowledge`:

```
$ open-knowledge init
Content scaffolded at /private/tmp/ok-onboarding-test/fresh-project/.open-knowledge/
Content:
  Found 294 markdown files in ./
  Scope: include=**/*.md  exclude=(none)
  Sample: .open-knowledge/AGENTS.md, README.md,
          node_modules/@borewit/text-codec/README.md,
          node_modules/@clack/core/CHANGELOG.md, …
```

294 files, the overwhelming majority of them READMEs and CHANGELOGs from dependencies. The `ContentFilter` unions `.gitignore` rules — but a freshly-`git init`-ed project has no `.gitignore` yet. The config defaults (`packages/cli/src/config/schema.ts`) set `include: ["**/*.md"], exclude: []`.

**Downstream consequences:**
- File watcher indexes all 294 files → 294 entries in the editor sidebar
- `search`, `list_documents`, `get_orphans` MCP tools all return mostly-noise
- Watch-event traffic on `node_modules` churn (any `npm install` triggers rescans)
- Shadow-repo commits journal changes to dependency READMEs

**Fix options, from least to most invasive:**
1. **Add `node_modules/**`, `.git/**`, `dist/**`, `build/**`, `.next/**` to the default `exclude` array** in the Zod schema. Low risk; matches the gitignore that every JS project eventually gets.
2. **On `init`, write a starter `.gitignore`** at the project root if none exists.
3. **Change the default `include`** from `**/*.md` to something scoped, e.g. `{docs,notes,.open-knowledge}/**/*.md` — but this breaks the "just works on any repo" story.

Recommend option 1 (the cheapest) combined with a warning at `init` time when >50 files are indexed: "Tracking 294 files — see `.open-knowledge/config.yml` to narrow scope."

---

### F4 (P1) — Port 3000 collision is an uncaught crash

```
Error: listen EADDRINUSE: address already in use ::1:3000
    at Server.setupListenHandle [as _listen2] (node:net:1940:16)
```

Node dumps a stack trace; the user gets no guidance. Port 3000 is one of the most contested ports on developer machines (Rails, Express, Create-React-App, Next.js, Node debugger, and so on). Separately, port 5000 (Apple AirPlay Receiver on macOS) has been the industry's cautionary tale since 2021 — picking a popular port number as the default is a known footgun.

**Fix options:**
1. **Try the configured port; on EADDRINUSE, fall back to a kernel-assigned port** (`port: 0`) and print "Port 3000 was busy — using 3847 instead." The `server.lock` already supports advertising the real port for MCP discovery, so MCP still works.
2. **Change default to a less-contested port** (e.g. 31337, 47200 — any unassigned IANA-dynamic-range default).
3. **Catch EADDRINUSE and print a one-line remediation**: `Port 3000 is in use. Run with --port <N> or free up the port (lsof -i :3000).`

CLAUDE.md already claims "Hocuspocus picks a free kernel-assigned port if requested port is busy." That's true for the Hocuspocus WebSocket listener, but **not** for the outer HTTP server (`start.ts:183`). The two listeners are different.

---

### F5 (P2) — Documentation overstates Bun requirement

`README.md:7` lists `Bun >= 1.3.11` as a prerequisite; `packages/cli/package.json:19` correctly declares `"engines": { "node": ">=22" }`. Empirically the CLI ran clean under `node v22.18.0` via `./node_modules/.bin/open-knowledge`. The prerequisites block should either say "Node 22+ or Bun 1.3.11+" or just "Node 22+."

This matters for reach: asking users to install Bun first is a speed bump that the published CLI doesn't actually require.

---

### F6 (P2) — Disk-only fallback is silent

If a user runs `init` but skips `start`, Claude connects to the MCP server successfully — but in **disk-only mode**: no CRDT sync, no browser UI, no Save Version. From the MCP server's perspective, everything works; the user never realizes they're missing the live-collaboration half of the product.

Suggested fix: when `mcp` starts without finding a live `server.lock` port, emit one line to stderr (visible in Claude Code): `open-knowledge: disk-only mode. Run 'open-knowledge start' in another terminal for live collaboration and browser UI.`

---

### F7 (P3) — No banner call-to-action for the URL

The startup banner shows the URL alongside the version, degraded-boot warnings, and the first-run content preview. For a new user expecting the editor to pop open, the URL is easy to miss in the noise. Vite and Next.js print `ready - press o to open browser` for exactly this reason. `--open` exists but isn't default.

Suggested fix: make `--open` the default on TTY, and add "Press `o` to open the editor in your browser" to the banner.

---

### F8 (P3) — Non-interactive init silently defaults to Claude Code only

`init` in a non-TTY environment (CI, scripted install, piped output) registers MCP for Claude Code and silently skips Cursor / Windsurf / VS Code. This is the opposite of the interactive multiselect. A `--editors all` flag exists; making it the non-TTY default would match user expectations.

## The happy-path timeline, as it actually is today

| Step | What the user runs | What they see | Real state |
|---|---|---|---|
| 1 | `npm install -g @inkeep/open-knowledge` | **404** (F2) | Blocked |
| 2 (after publish) | `open-knowledge init` | `294 markdown files` (F3) | Indexing node_modules |
| 3 | `open-knowledge start` | `EADDRINUSE` if port 3000 taken (F4), else `No React app assets found` (F1) | Server runs; editor UI 404s |
| 4 | Open Claude Code in the project | MCP connects (disk-only silently if step 3 failed, F6) | Works at limited capability |
| 5 | Ask Claude to edit a markdown file | Claude edits disk file; user sees no live UI | "It worked" — but not the pitched experience |

## Recommendations, in the order they'd unblock onboarding

1. **Fix F1** (one-line asset-path fix + tarball smoke test). Non-optional before publish.
2. **Fix F3** (add `node_modules/**`, `.git/**`, `dist/**` to default exclude). Non-optional — prevents the first `init` from looking broken.
3. **Fix F4** (EADDRINUSE fallback to free port). Unblocks the large slice of users with something else on :3000.
4. **Fix F2** (publish to npm). Gated on F1 + F3.
5. **Fix F6** (disk-only stderr note). One-liner; makes the optional-`start` story honest.
6. **Fix F5** (README prerequisites). Docs-only.
7. **F7 / F8** (banner CTA, non-TTY default editors). Polish.

## Unresolved questions worth raising separately

- **Should `start` auto-open a browser?** Out of scope for this audit — the "auto-open UX" thread (claude-auto-open-editor-ux) is investigating that in parallel.
- **Should a user with many projects manage them centrally?** Out of scope here — `multi-project-switching-landscape` thread is investigating.
- **Should `init` be merged into `start`?** `start` already auto-scaffolds `.open-knowledge/` (`start.ts:36-50`) but does NOT register MCP config (`init.ts` branch guarded by `opts.mcp !== false`, called from start with `mcp: false`). Worth considering whether a single `open-knowledge` command that does both is simpler.

## Evidence

- `evidence/start-compiled.mjs.excerpt` — the broken asset-lookup code from the shipped tarball
- `evidence/init-output.txt` — real `init` output showing 294 files
- `evidence/start-port-3000-crash.txt` — the EADDRINUSE crash
- `evidence/npm-view-404.txt` — registry check
