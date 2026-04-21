# Evidence: D8 — Postinstall-binary distribution patterns

**Dimension:** D8 — How do npm packages ship pre-compiled binaries, and is npm a viable distribution channel for Electron desktop apps?
**Date:** 2026-04-20
**Sources:** esbuild / Bun / turbo / sharp / @swc/core / Prisma / Electron / @yao-pkg npm registry + GitHub source

---

## Key files / pages referenced

- [esbuild npm package.json](https://github.com/evanw/esbuild/blob/main/npm/esbuild/package.json) — canonical `optionalDependencies` per-platform example
- [esbuild node-install.ts fallback chain](https://github.com/evanw/esbuild/blob/main/lib/npm/node-install.ts)
- [bun package.json via unpkg](https://unpkg.com/bun/package.json) — 12 `@oven/bun-*` optionalDeps
- [turbo packages/turbo/package.json](https://github.com/vercel/turborepo/blob/main/packages/turbo/package.json) — 6 optionalDeps, no postinstall script
- [@swc/core package.json](https://raw.githubusercontent.com/swc-project/swc/main/packages/core/package.json) — napi-rs targets + wasm fallback
- [sharp installation docs (v0.33+)](https://sharp.pixelplumbing.com/install/) + [sharp migration issue #3750](https://github.com/lovell/sharp/issues/3750)
- [Prisma binaries CDN pattern](https://deepwiki.com/prisma/prisma/4-engine-and-binary-management) + [Prisma env vars](https://www.prisma.io/docs/v6/orm/reference/environment-variables-reference)
- [Electron install.js](https://github.com/electron/electron/blob/main/npm/install.js) + [Electron installation docs](https://www.electronjs.org/docs/latest/tutorial/installation)
- [Bun compile docs](https://bun.com/docs/bundler/executables) + [Bun #29120 — macOS code-signature truncation](https://github.com/oven-sh/bun/issues/29120)
- [@yao-pkg/pkg npm](https://www.npmjs.com/package/@yao-pkg/pkg) (active fork of deprecated `@vercel/pkg`)

---

## Findings

### Finding 1: Four distinct patterns exist for shipping native binaries through npm

**Confidence:** CONFIRMED

| Pattern | Representative tools | Mechanism | Install-time network | Works under `npx`/`bunx` |
|---|---|---|---|---|
| **A — optionalDeps per-platform + shim** | esbuild, Bun, turbo, sharp v0.33+ | Per-platform sub-packages declare `os`/`cpu`/`libc`; npm silently skips non-matching; root package `require.resolve`s the matching sub-package at runtime | None (resolved via npm registry only) | Yes (esbuild); mostly (sharp; some packagers drop optionalDeps) |
| **B — postinstall CDN download** | Prisma, Electron (dev-install), sharp ≤ v0.32 | `"postinstall": "node install.js"` fetches platform binary from a non-npm CDN, verifies sha256 | Required (each install) | Fragile — postinstall doesn't always fire in ephemeral installs |
| **B′ — napi-rs validator + WASM fallback** | @swc/core | Postinstall validates native binding loads; installs `@swc/wasm` if it doesn't | Optional (WASM is the fallback) | Yes (WASM path always works) |
| **C — single-file native bundling** | @yao-pkg/pkg, Bun `build --compile`, Node SEA (`node --experimental-sea-config`) | Snapshot JS + runtime into one executable | N/A (output distributed out-of-band) | N/A (not an npm install story) |

### Finding 2: The ecosystem is migrating *from* Pattern B *to* Pattern A
**Confidence:** CONFIRMED
**Evidence:** [sharp issue #3750](https://github.com/lovell/sharp/issues/3750) — Lovell Fuller, sharp's maintainer, cites esbuild as proof-of-concept:

> The approach taken by esbuild has now proven that this is possible [to use only package manager mechanics at install time, without custom scripts, and without downloading binaries from hosts other than those controlled by a package manager].

sharp completed the migration in v0.33 (2024). `libc` filter [landed in npm v9.6.5](https://github.com/npm/npm-install-checks/pull/54), unlocking the musl/glibc split that previously required postinstall logic.

**Why Pattern A wins:**
- Works offline via npm cache (`npm ci --offline`) because no separate download host
- Survives ephemeral-install contexts (`npx`/`bunx`) because there is no postinstall network step
- Supply-chain audit: everything is in the npm registry with sha512 integrity
- Package managers natively understand `os`/`cpu`/`libc` fields

**Why Pattern A's migration caused collateral damage:**
- Lambda/serverless bundlers that drop `optionalDependencies` broke — [sharp issue #4213](https://github.com/lovell/sharp/issues/4213) catalogs the fallout
- Packages targeting platforms outside the declared matrix now hard-fail (sharp lost FreeBSD/termux users; they need explicit matrix coverage)

**esbuild's three-tier fallback** is the reference implementation for surviving packager hostility:
1. `optionalDependencies` provides the binary (happy path)
2. On failure, spawn `installUsingNPM(pkg, subpath, binPath)` to force-install the platform sub-package
3. On failure, direct-fetch from `https://registry.npmjs.org/${pkg}/-/${pkg.replace('@esbuild/', '')}-${packageJSON.version}.tgz` and extract the binary from the tarball

### Finding 3: Per-platform binary sizes vary by orders of magnitude and gate viability for npm distribution
**Confidence:** CONFIRMED
**Evidence:** Per-platform binary sizes from npm registry inspection and documented footprints:

| Tool | Per-platform binary | Platform matrix | Total npm cost per release |
|---|---|---|---|
| esbuild | ~10–12 MB | 25 platforms | ~250–300 MB |
| turbo | ~18 MB | 6 platforms | ~108 MB |
| Bun | ~55 MB (darwin-aarch64) | 12 platforms | ~500+ MB |
| Prisma query engine | ~20–30 MB | ~15 platform strings | (delivered via CDN, not npm) |
| **Electron** | **~90–200 MB** (e.g., v33 linux-x64 ~93 MB; win32-arm64 ~120 MB; [v33.0.2 linux-x64 anomalously 2× others via packaging bug](https://github.com/electron/electron/issues/44409)) | 7+ platforms | **~840 MB+** (not shipped via npm per-platform; postinstall CDN instead) |

**Implication:** npm's per-package tarball limits and user-side install times make Pattern A impractical once per-platform payload exceeds ~60 MB. Electron's per-platform binary alone is larger than Bun's entire matrix. This is why Electron uses Pattern B (postinstall CDN) for dev installs, and why no major Electron app installs via npm for end users — Pattern B is too fragile for non-developer UX.

### Finding 4: No Electron app installable via npm for end users; 7/7 surveyed use native installers
**Confidence:** CONFIRMED (for primary distribution); INFERRED (on the negative claim that no dev-tool npm package exists for each)
**Evidence:**

| App | Primary distribution | Installs via npm? |
|---|---|---|
| VS Code | `.dmg` / `.exe` / `.deb` / `.rpm` / Microsoft Store / Snap / Homebrew Cask | No (end-user) |
| Obsidian | `.dmg` / `.exe` / `.AppImage` / `.deb` / Snap / Homebrew Cask | No |
| Slack | `.dmg` / `.exe` / MAS / MS Store / Snap / `.deb` / Homebrew Cask | No |
| Discord | `.dmg` / `.exe` / `.deb` / Homebrew Cask | No |
| Claude Desktop | `.dmg` / `.exe` / MS Store / Community Homebrew Cask | No |
| Linear | `.dmg` (ToDesktop) / Homebrew Cask | No |
| Cursor | `.dmg` / `.exe` / `.deb` / `.AppImage` / Homebrew Cask | No |

**Quote — [Electron installation docs](https://www.electronjs.org/docs/latest/tutorial/installation):** *"The binary is downloaded by default in the postinstall step every time you install electron from the npm registry."* The `electron` npm package is a development dependency; **there is no npm-facing end-user distribution documented** for any major Electron app.

**Aligned Homebrew-Cask pattern:** 5/7 reference apps ship Homebrew Cask alongside direct download. This is the de-facto secondary channel for macOS, and maps to Speakeasy's brew-first install story from D1/D2 — but expressed through `brew install --cask <app>` instead of `brew install --formula`.

### Finding 5: Single-file bundling (`bun build --compile`, Node SEA, yao-pkg) is NOT production-ready for shipping Electron apps
**Confidence:** CONFIRMED
**Evidence:**
- [Bun issue #29120 (v1.3.12, still open)](https://github.com/oven-sh/bun/issues/29120) — cross-compiled darwin-arm64 binaries emit truncated code signatures requiring manual `codesign --force --deep --sign -` before Gatekeeper accepts them
- Bun `--compile` output is ~57 MB for a hello-world (darwin-arm64, Bun 1.1.30)
- Bun cannot compile an Electron app — Electron is a forked Chromium + Node fork, not a library you statically link. You'd still need electron-builder
- [@yao-pkg/pkg](https://www.npmjs.com/package/@yao-pkg/pkg) (active maintained fork of deprecated `@vercel/pkg`) wraps Node 22's native SEA API via `--sea` flag; this produces standalone Node CLIs but cannot package Electron either

**Implication:** Single-file bundling is an option for a pure-Node CLI but is tangential to shipping a GUI app. For a hybrid CLI + Electron deliverable, it buys nothing over the conventional electron-builder path.

---

## Pattern-to-use-case mapping

| Goal | Use Pattern | Notes |
|---|---|---|
| Ship a native-extension-backed npm library (sharp, @swc) | A (optionalDeps + shim) | Industry standard as of 2024+; provides best DX and offline story |
| Ship a pure-JS CLI over npm | — (no binary needed) | Mastra's pattern; nothing to do |
| Ship a compiled-language CLI (Go, Rust, Zig) with npm as one channel | A (optionalDeps per-platform) | turbo's model; requires goreleaser-like per-platform builds feeding into npm publishing |
| Ship a compiled-language CLI with goreleaser as the one truth | Not npm-distributed | Speakeasy's model; wrappers (brew/winget/choco/install.sh) fan out from GitHub releases |
| Ship a large native binary (Electron dev install) | B (postinstall CDN) | The only way — optionalDeps per-platform cost is too high |
| **Ship an Electron GUI to end users** | **Not npm; use electron-builder + platform installers** | **Universal industry pattern** |

---

## Negative searches

- **npm-installable Electron app for end users** — searched npm registry for `electron`-tag packages targeting end users (not `electron` the dev dependency). Found none among major consumer apps (VS Code, Obsidian, Cursor, etc.).
- **Homebrew tap for Electron npm packages** — confirmed `@electron/packager` and `electron-builder` ship via npm for build-time use, not end-user install.

---

## Gaps / follow-ups

- Full enumeration of npm-installable Electron tools for niche developer use cases (e.g., `npx electron-forge-cli` for scaffolding). Not critical for end-user distribution analysis.
- Bun's `--compile` signing fix timeline — tracked in [#29120](https://github.com/oven-sh/bun/issues/29120); unclear when production-safe.
- Node SEA's production readiness vs `@yao-pkg/pkg` — separate deep dive.
- Whether Prisma's `PRISMA_ENGINES_MIRROR` offline-install bugs ([#25433](https://github.com/prisma/prisma/issues/25433), [#12593](https://github.com/prisma/prisma/issues/12593)) are resolved in v6+ — docs still reference them.
