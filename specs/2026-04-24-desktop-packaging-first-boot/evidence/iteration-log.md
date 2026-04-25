# Iteration log — packaged first-boot fix

## Iteration 1 — 2026-04-24 (type-stripping)

**Build:** worktree, `bun run build:dir`, arm64-only.

**Before fix:** `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING` on `@inkeep/open-knowledge-server/src/index.ts`.

**Fix applied:** tsdown → `dist/index.mjs` for server + core; conditional `exports` (`development` → `src/*.ts`, `default` → `dist/*.mjs`); `--publish never` for `build:mac` scripts; arm64-only `electron-builder.yml` target.

**Observed:** main process loads, Navigator doesn't appear. New crash surfaced — see iteration 2.

## Iteration 2 — 2026-04-24 (missing peer dep `y-protocols`)

**Crash:**

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'y-protocols' imported from
/Applications/Open Knowledge.app/Contents/Resources/app.asar/node_modules/
  @tiptap/y-tiptap/dist/y-tiptap.js
```

**Root cause.** `@tiptap/y-tiptap` declares `y-protocols` as a **peer dependency**. In bun's workspace, `y-protocols` gets installed at the repo-root `node_modules/` because `@hocuspocus/server` (a regular dep of `packages/server`) also depends on it. Electron-builder's bun-mode walker (`• note: bun does not support any CLI for dependency tree extraction, utilizing file traversal collector instead`) does NOT follow peer deps — it only walks regular `dependencies`. So the asar gets `@tiptap/y-tiptap/dist/` but no `y-protocols/` sibling.

**Why dev works.** `cd packages/app && bun run dev` uses bun's resolver, which walks upward through all ancestor `node_modules/` directories — so `y-protocols` at repo root is found. The packaged asar has no such ancestor chain.

**Fix.** Promote `y-protocols` to a direct runtime `dependencies` of `packages/server`. Forces bun to resolve + place it where electron-builder's walker finds it during the server-package traversal.

**Applied.** *(see commit)*

## Iteration 3 — 2026-04-24 (renderer assets 404 under `file://`)

**Observed:** utility process boots cleanly, server responds (`GET /api/pages` returns 32 aang docs), but renderer window is blank. DevTools Network tab shows `index.html` loads `200 OK` from `file:///Applications/Open%20Knowledge.app/Contents/Resources/app/index.html`, but **every** hashed asset referenced in `<script src="/assets/*.js">` and `<link href="/assets/*.css">` fails with `net::ERR_FILE_NOT_FOUND`. Console: 13 errors, 1 warning. Renderer DOM mounts `<div id="root">` but never hydrates.

**Root cause.** `packages/app/vite.config.ts` has no `base` setting, so Vite defaults to `base: '/'`. The built `index.html` references assets as absolute paths (`/assets/foo.js`). Under `file://`, absolute paths resolve to the filesystem root, not the app bundle — Electron's `loadFile(…/app/index.html)` asks for `file:///assets/foo.js` which doesn't exist.

**Why dev works.** Dev mode serves the renderer via Vite's HTTP server at `http://localhost:5173/`. `GET /assets/foo.js` → 200. Electron dev mode uses `loadURL(rendererDevUrl)` → HTTP → absolute paths work.

**Why no prior milestone caught this.** Every packaged-DMG test in M1–M6 either never launched the app (CI only ran `--dir` or test matrices) or hit the earlier type-stripping crash first. Nobody has ever loaded `index.html` from the packaged asar in a running renderer.

**Fix.** Add `base: './'` to `packages/app/vite.config.ts`. Generates relative paths. Works identically under HTTP (browser resolves relative to current URL) and `file://` (resolves relative to the bundle path). No regression for `ok ui`.

## Iteration 4 — 2026-04-24 (Yjs double-import warning — deferred)

**Observed (stderr):**
```
Yjs was already imported. This breaks constructor checks and will lead to issues!
 - https://github.com/yjs/yjs/issues/438
```

**Hypothesis.** `@hocuspocus/server` resolves via its `default.import` condition → ESM, and our server bundle resolves yjs via ESM too — so they should share one copy. But `@hocuspocus/server/package.json` also has a `main: dist/hocuspocus-server.cjs` fallback; if any dep resolves via `require()` (CJS), Node's module cache treats the .cjs + .mjs copies as distinct modules.

**Status.** Warning only — not a blocker for the current blank-renderer issue. Deferred to a follow-up iteration once the renderer is rendering and we can observe if constructor-check failures actually break CRDT behavior in the packaged app. Listed in the spec's R3-adjacent risks.

## Iteration 5 — 2026-04-24 (keychain prompts at first launch — UX concern)

**Observed.** Two "Open Knowledge wants to access key '@inkeep/open-knowledge-desktop Safe Storage' in your keychain" dialogs appear at first launch before the Navigator is visible.

**Root cause.** `scripts/target-fuses.mjs` sets `EnableCookieEncryption: true`. Electron uses `safeStorage` to encrypt the Chromium cookie store on disk; on macOS, that requires Keychain access, which triggers the system password prompt on first use.

**Why this is wrong for our app.** We have no cookies. No external auth, no session tokens, no tracking. The Chromium cookie jar is empty; encrypting it protects nothing. M5's real keyring substrate (`@napi-rs/keyring`) is the authoritative secrets path for any future auth — it prompts only at the moment of an auth action, not at app start.

**Fix.** Flip `EnableCookieEncryption: false` in `scripts/target-fuses.mjs`. Defers keychain prompting to the first actual auth action (via `@napi-rs/keyring`, when we ship one).

**Decision.** Pending user approval — see SPEC.md §6 D5 (to be added if user agrees).

## Iteration 6 — 2026-04-24 (CI-only: combined `bun run` + `&&` ships stale workspace state)

**Observed.** First green CI build (run 24920389870) produced a DMG that crashes on every launch with the **original** type-stripping error, despite the fix being in HEAD. Asar inspection: `node_modules/@inkeep/open-knowledge-server/package.json` inside the asar is the **pre-fix** version (no `development` condition, no `default → dist/index.mjs`, no `files` field, no `y-protocols` dep, no `build` script). `dist/` directory absent. Local DMG built from the same commit boots correctly and has the new package.json + dist/ in its asar.

**Investigation.** Added DEBUG checkpoints at four points: post-install, post-turbo-build, pre-electron-builder, post-electron-builder. Run 24923907843:
- POST-INSTALL: `packages/server/package.json` has new content ✓; symlink `node_modules/@inkeep/open-knowledge-server` → `packages/server` ✓.
- POST-TURBO-BUILD: same ✓; `packages/server/dist/index.mjs` exists (520 KB) ✓.
- PRE-ELECTRON-BUILDER: same ✓; `packages/desktop/node_modules/` minimal (only `@vitejs`, `vite`); realpath resolution still correct.
- POST-ELECTRON-BUILDER: asar has the **new** package.json + `dist/` ✓.

**Critical finding.** The DEBUG run produced a correct asar. Difference vs the failing run: the failing run invoked `bun run build:mac:unsigned` (a single `bun run` of a script that chains `bun run build:desktop && electron-builder ...` via `&&`). The DEBUG run split that into two separate workflow steps: one `bun run build:desktop`, then a separate `bunx electron-builder ...`. Same commands, different shell-process boundary.

**Hypothesis.** `bun run script-with-&&` either caches workspace state at the moment its wrapper opens the script, or electron-builder's bun-mode walker reads from a snapshot taken before turbo's build outputs land. Across an `&&` chain inside one `bun run`, the second command sees the pre-build snapshot. As separate workflow steps, each `bun run` / `bunx` re-evaluates current disk state and electron-builder picks up the fresh package.json + dist/.

**Fix.** Inline `electron-vite build` and `electron-builder` as **separate** workflow steps in `desktop-build.yml`. Drop the `bun run build:mac:unsigned` invocation. Same step layout for signed and unsigned modes — only the `electron-builder` flags differ.

**Open question (SPEC §10 OQ5).** Why does `bun run` + `&&` show stale state for electron-builder's bun-mode walker on `macos-26` CI runners but NOT on local macOS? Possibly bun version skew, runner image quirk, or a race in bun's workspace symlink refresh that's serialized differently in interactive vs CI shells. Worth filing upstream if reproducible — but the workaround (split steps) is sufficient for shipping.

**Applied via commit.** `desktop-build.yml`'s `Build + package DMG` step replaced with two-step `Build electron-vite bundles` + `Package DMG`.

