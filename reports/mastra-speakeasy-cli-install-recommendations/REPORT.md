---
title: "How Mastra.ai and Speakeasy Recommend CLI Installation"
description: "Factual landscape across 9 dimensions of how two TS/Go dev-tool vendors present install UX (pages, channels, dlx, pinning, scaffolding, CI, bins, postinstall-binary patterns, telemetry) — plus a 1P Conclusions section applying the findings to open-knowledge's CLI + Electron desktop direction."
createdAt: 2026-04-20
updatedAt: 2026-04-20
subjects:
  - Mastra.ai
  - Speakeasy
  - npm
  - Homebrew
  - goreleaser
  - electron-builder
  - CLI packaging
  - Open Knowledge
topics:
  - CLI installation UX
  - distribution channels
  - dlx vs permanent install
  - first-run scaffolding
  - postinstall binary distribution
  - CLI telemetry
  - Electron desktop app distribution
  - 1P synthesis
---
# How Mastra.ai and Speakeasy Recommend CLI Installation

**Purpose:** Capture how [[Mastra.ai]] (TypeScript AI agent framework) and [[Speakeasy]] (SDK generator) present their install UX — first-shown command, distribution channels shipped, one-shot vs permanent posture, pinning/upgrade, first-run/auth, CI patterns, bin ergonomics, plus deep dives on postinstall-binary patterns (D8) and telemetry posture (D9). The reader is making concrete packaging + onboarding decisions for `@inkeep/open-knowledge` as it moves toward Electron desktop distribution and wants the factual landscape across competent vendors. A final **Application to Open Knowledge** section applies the findings — explicitly 1P, at user request.

---

## Executive Summary

The two primary vendors sit at opposite ends of the CLI-distribution spectrum, and the split tracks their implementation language almost mechanically.

**Mastra is npm-native.** Its install UX is built around `npm create mastra@latest`, surfaced on the documentation landing page inside a PM tab switcher (npm → pnpm → yarn → bun). There is no standalone "Installation" page; the Quickstart is the install. Two unscoped npm packages ship — `mastra` (persistent CLI) and `create-mastra` (scaffolder) — and there is no Homebrew tap, no `install.sh`, no goreleaser, no Docker image for the CLI. Upgrade is delegated to whichever package manager the user brought: snippets pin to `@latest`; there is no `mastra update` subcommand; drift surfaces as a runtime peer-dependency warning. The CI recommendation is `actions/setup-node@v4` + `npx mastra server deploy --yes`.

**Speakeasy is Go-binary-native.** A single goreleaser pipeline produces signed ZIPs published to GitHub releases; every documented install channel — Homebrew, `install.sh | sh`, WinGet, Chocolatey — is a thin wrapper that fans out to those assets. The `.goreleaser.yaml` header explicitly disclaims npm and Docker images for the CLI. A permanent install is the only option; there is no `npx @speakeasy-api/cli` because the package does not exist. Upgrade is a first-class subcommand (`speakeasy update` mutates the binary in place), and the Homebrew tap keeps hundreds of versioned formulas for pin-at-install workflows. The CI recommendation is the vendor's own `speakeasy-api/sdk-generation-action@v15` — a Docker action that bundles a separate Go orchestrator plus Node, Python, Java, Ruby, .NET, and PHP toolchains inside one image.

**The postinstall-binary landscape (D8)** has four recognizable patterns, and the ecosystem is actively migrating from postinstall-CDN-download (Pattern B — Prisma, Electron, old-sharp) to optionalDependencies-per-platform (Pattern A — esbuild, Bun, turbo, sharp v0.33+). sharp's maintainer Lovell Fuller explicitly cites esbuild as proof-of-concept for the migration. The two constraints that gate adoption are per-platform payload size (unviable above \~60 MB per target; Electron at 90-200 MB per platform cannot use Pattern A) and package-manager support for `os`/`cpu`/`libc` filters (now mature as of npm v9.6.5). For end-user Electron apps specifically, **no major application installs via npm** — VS Code, Obsidian, Cursor, Claude Desktop, Slack, Discord, and Linear all distribute via native installers (DMG, EXE, DEB, RPM, AppImage, Store), with 5 of 7 also shipping Homebrew Cask.

**The telemetry landscape (D9)** is predominantly OPT-OUT-by-default (10 of 13 surveyed tools), with a clear quality hierarchy. [Turborepo](https://turborepo.dev/docs/telemetry) is the single best-practice reference: three equivalent opt-out paths (subcommand, env var, `DO_NOT_TRACK=1`), a debug mode, a dedicated docs page with data-collection disclosure, and explicit exclusion of names/paths/logs. VS Code's 4-level `telemetry.telemetryLevel` is the reference for desktop/Electron granularity (separate consent axes for crash vs error vs usage). Mastra sits significantly below this bar: unconditional PostHog wiring with a single env-var opt-out, no docs page, no `DO_NOT_TRACK` honoring, no crash/usage split. Speakeasy's **email-only opt-out** ("contact [info@speakeasy.com](mailto:info@speakeasy.com)") is the worst-case anti-pattern.

**Both vendors ship only the full product name as the bin.** Neither Mastra's `mastra` nor Speakeasy's `speakeasy` has a registered short alias. Both gate CI prompts via either `--yes` flags (Mastra) or env-var auth tokens (Speakeasy's `SPEAKEASY_API_KEY`, Mastra's `MASTRA_API_TOKEN`). First-run scope diverges dramatically: Mastra's `create-mastra` writes a full project layout including `AGENTS.md`, `CLAUDE.md`, and editor MCP configs for Cursor (project + `cursor-global` scopes), Windsurf, VS Code, and Antigravity; Speakeasy's `quickstart` writes one `.speakeasy/workflow.yaml`.

**Key Findings:**

- **Install-page ordering tracks the default PM:** Mastra leads with npm in a 4-way tab switcher; Speakeasy leads with Homebrew in a fixed prose list (brew → curl | sh → winget → choco → manual).
- **Single authoritative channel per vendor:** npm for Mastra, goreleaser → GitHub releases for Speakeasy. Every other visible channel is a wrapper.
- **dlx-first vs install-first posture is determined by language:** an npm package enables `npx/bunx/pnpm dlx` naturally; a Go binary has no equivalent, so Speakeasy requires a permanent install (gated behind account creation).
- **Self-update subcommand is a binary-world convention:** Speakeasy ships `speakeasy update`; Mastra ships none and delegates upgrade to the package manager.
- **CI philosophies diverge:** Mastra = `actions/setup-node@v4` + `npx mastra` (BYO Node environment); Speakeasy = vendor Docker action bundling everything.
- **Neither vendor registered a short bin alias.** The `ok` + `open-knowledge` dual-bin pattern is uncommon in this peer set but justified by open-knowledge's longer product name.
- **Pattern A (optionalDeps per-platform) is the trajectory** for shipping native binaries through npm — sharp migrated in 2024 citing esbuild; works offline; survives `bunx`/`npx` ephemeral-install contexts; platform matrix gaps hard-fail rather than falling back.
- **No Electron app installs via npm for end users.** 7 of 7 surveyed Electron apps use native installers; 5 of 7 ship Homebrew Cask as a secondary channel.
- **Opt-out telemetry is the industry default; Turbo + VS Code are the gold-standard references.** Turbo is the only surveyed tool honoring `DO_NOT_TRACK=1`. VS Code's 4-level granularity separates crash from usage consent. Mastra (unconditional PostHog, no docs page, no debug mode) falls significantly short of this bar.

---

## Research Rubric

| #      | Dimension                                                    | Depth    | Priority | Status   |
| ------ | ------------------------------------------------------------ | -------- | -------- | -------- |
| D1     | Canonical "Installation" page ordering + default PM          | Deep     | P0       | Covered  |
| D2     | Distribution channels shipped; authoritative source of truth | Deep     | P0       | Covered  |
| D3     | One-shot runner vs permanent install posture                 | Deep     | P0       | Covered  |
| D4     | Version pinning + upgrade UX                                 | Moderate | P1       | Covered  |
| D5     | First-run + auth + project scaffolding                       | Moderate | P1       | Covered  |
| D6     | CI / non-interactive install                                 | Light    | P2       | Covered  |
| D7     | Short-name / bin ergonomics                                  | Light    | P2       | Covered  |
| D8     | Postinstall-binary distribution patterns                     | Deep     | P0       | Covered  |
| D9     | CLI + desktop telemetry patterns                             | Deep     | P0       | Covered  |
| ~~DX~~ | ~~In-product browser preview handoff~~ — dropped mid-run     | —        | —        | Descoped |

**Stance.** D1-D9 are Factual / 3P-only. The **Application to Open Knowledge** section at the end is explicitly Conclusions / 1P — added at user request mid-run to apply the 3P evidence to open-knowledge's CLI + Electron desktop trajectory. The separation is preserved so a future reader can cleanly use the D1-D9 findings for a different product without inheriting the open-knowledge-specific synthesis.

---

## Detailed Findings

### D1 — Canonical Installation Page

**Finding:** Mastra leads with `npm create mastra@latest` inside a PM tab switcher on the docs landing page. [Speakeasy](https://www.speakeasy.com/docs/speakeasy-reference/cli/getting-started) leads with `brew install speakeasy-api/tap/speakeasy` in a fixed prose list.

**Evidence:** [evidence/d1-install-page.md](evidence/d1-install-page.md)

**Implications:**

- Mastra's landing-page-as-install-page collapses two docs pages into one. The tab switcher across npm/pnpm/yarn/bun costs zero extra ceremony for the user but signals "we know you're in the Node ecosystem."
- Speakeasy's fixed prose ordering signals "we know you're not in any one ecosystem" — the ordering is macOS-first, generic-Unix-second, Windows-third.
- Neither vendor uses OS auto-detection. Both require the user to self-select, which avoids a brittle JS-based detection step but forces a choice.

**Decision triggers (when this matters):**

- If your CLI has multiple equivalent PMs (Node ecosystem), a tab switcher reduces copy-paste friction.
- If your CLI distributes through OS-native channels (brew / winget / choco) that have no "equivalent," a prose list is sufficient and honest.

### D2 — Distribution Channels

**Finding:** Mastra ships npm-only with two unscoped packages (`mastra`, `create-mastra`), no Homebrew tap, no `install.sh`, no Docker for the CLI. Speakeasy ships via goreleaser → GitHub releases, with Homebrew, install.sh, WinGet, Chocolatey all wrapping those release assets — and no npm CLI package. Confirmed by `npm view @mastra/cli` → 404 and Speakeasy's `.goreleaser.yaml` header: *"No Docker images, NPM packages, or native Linux packages (nfpms) are configured in this release pipeline."*

**Evidence:** [evidence/d2-distribution-channels.md](evidence/d2-distribution-channels.md)

**Implications:**

- Each vendor has exactly one distribution truth. The "wrapper of wrappers" pattern in Speakeasy's stack means a release cut = one goreleaser pipeline; every package manager catches up automatically.
- Mastra's choice to skip binary distribution means users without Node cannot install the CLI. This is consistent with the product (a TypeScript agent framework that assumes Node anyway).
- Speakeasy's choice to skip npm despite having heavy npm SDK presence is deliberate, not inertia. No public evidence they evaluated `postinstall` binary-download patterns (prisma / esbuild / @swc/core).

**Decision triggers:**

- If your CLI is written in Node/TS and your users are already in Node: npm-only is sufficient and idiomatic.
- If your CLI is a cross-platform binary: goreleaser → GitHub releases as the one truth + wrappers is the canonical pattern.
- The choice to layer both (npm wrapper on a Go binary via postinstall) is possible but not taken by either vendor — see D8 for the broader pattern landscape.

### D3 — One-shot vs Permanent

**Finding:** Mastra's default on-ramp is one-shot (`npm create mastra@latest` + `npx mastra` as equal-status to `npm i -g mastra`). Speakeasy requires a permanent install, and its [Introduction page](https://www.speakeasy.com/docs/introduction) sequences sign-up → install — the account gate precedes the install docs.

**Evidence:** [evidence/d3-one-shot-vs-permanent.md](evidence/d3-one-shot-vs-permanent.md)

**Implications:**

- Mastra's posture enables zero-signup evaluation. A prospective user runs `npm create mastra@latest`, sees the scaffolded project, and never touches a credential unless they want platform deploy.
- Speakeasy's account-first funnel routes every installer through the vendor's platform. This is self-interested design — every install creates a potential lead — and it raises evaluation friction for curious users.
- The divergence is structurally forced: an npm package supports dlx naturally; a Go binary does not. The "account first" choice is independent of that and is orthogonal — Speakeasy could ship `curl | sh` without gating on signup but chooses the gate.

**Decision triggers:**

- If your CLI is Node-based and you want viral evaluation: a dlx-first on-ramp is cheap and idiomatic.
- If your CLI is a Go binary, you can still offer zero-signup by shipping a standalone `install.sh` (which Speakeasy does) — the signup gate is a separate product decision.

### D4 — Version Pinning + Upgrade UX

**Finding:** Mastra's docs snippets use `@latest` everywhere; there is no `mastra update` subcommand; drift is reported at runtime via peer-dep warnings (`packages/cli/src/commands/dev/dev.ts` calls `checkMastraPeerDeps` on `mastra dev`). Speakeasy's snippets are also unpinned by default but [install.sh supports a `VERSION=` env var](https://raw.githubusercontent.com/speakeasy-api/speakeasy/main/install.sh), the [homebrew-tap](https://github.com/speakeasy-api/homebrew-tap) keeps versioned formulas, and [`speakeasy update`](https://www.speakeasy.com/docs/speakeasy-cli/update) is a first-class subcommand that replaces the binary in place.

**Evidence:** [evidence/d4-pinning-and-upgrade.md](evidence/d4-pinning-and-upgrade.md)

**Implications:**

- Mastra delegates upgrade to the package manager. This is the npm-ecosystem convention, and it avoids a subcommand that would duplicate `npm update` / `pnpm up` / `bun update` semantics.
- Speakeasy's `update` subcommand is the standard Go-CLI convention (gh, flyctl, railway). Without it, a Go-binary user has no ecosystem-native upgrade path.
- Both vendors leave rollback un-documented. `speakeasy update` replaces in place with no backup; Mastra's drift warning fires at runtime but doesn't offer a self-healing action.

**Decision triggers:**

- If your CLI is a Node package: rely on the PM, add a runtime drift detector, don't write a self-update subcommand.
- If your CLI is a standalone binary: shipping a `<cli> update` subcommand is table stakes.

### D5 — First-Run + Auth + Project Scaffolding

**Finding:** Mastra's `create-mastra` runs a [`@clack/prompts`](https://www.npmjs.com/package/@clack/prompts) interactive flow that scaffolds a full project — `src/mastra/**`, `.env` or `.env.example`, `AGENTS.md`, `CLAUDE.md`, editor `mcp.json` for Cursor (project + `cursor-global` scopes), Windsurf, VS Code, and Antigravity — and auto-installs `@mastra/libsql`, `@mastra/memory`, `@mastra/loggers`, `@mastra/observability`. Auth is a separate `mastra auth login` command that opens a browser and stores credentials at `~/.mastra/credentials.json` (mode 0600 inside a 0700 directory). Speakeasy's `quickstart` writes exactly one file (`.speakeasy/workflow.yaml`) plus a browser-based `speakeasy auth login` flow. CI auth for both vendors is an environment variable (`MASTRA_API_TOKEN` + `MASTRA_ORG_ID` for Mastra, `SPEAKEASY_API_KEY` for Speakeasy).

**Evidence:** [evidence/d5-first-run-auth-scaffolding.md](evidence/d5-first-run-auth-scaffolding.md)

**Implications:**

- Mastra's scaffolder is doing extra work beyond install: it's bundling agent-project onboarding (editor MCP integration, agent-instruction files) into the first-run flow. This is consistent with Mastra's positioning as an AI agent framework with deep IDE integration.
- Speakeasy's scope is narrower and more conservative: one config file, auth, then `speakeasy run`. This keeps the scaffolder simple and easy to reason about.
- Mastra's `--mcp <editor>` flag omits Claude Code. Users on Claude Code must hand-wire `.mcp.json`. Given Claude Code's growth, this is a notable omission.
- Mastra wires PostHog telemetry unconditionally in `packages/cli/src/index.ts` — see D9 for the full posture analysis.

**Decision triggers:**

- If the CLI is a scaffolder for a broader developer ecosystem (AI agents, apps, SDKs), Mastra's "write everything the user will need" pattern lowers assembly friction.
- If the CLI is a specialized tool with a narrow workflow, Speakeasy's "one file, no surprises" pattern is easier to maintain and reason about.

### D6 — CI Patterns

**Finding:** Mastra has no vendor GitHub Action; the recommended CI snippet is `actions/setup-node@v4` with `node-version: '22'` + `cache: 'npm'`, then `npx mastra server deploy --yes` with `MASTRA_API_TOKEN` as a secret. Speakeasy's blessed CI is `uses: speakeasy-api/sdk-generation-action@v15` — a Docker action that compiles its own Go orchestrator and bundles every SDK-target language toolchain (Node, Python, Java, Ruby, .NET, PHP) into one image.

**Evidence:** [evidence/d6-ci-patterns.md](evidence/d6-ci-patterns.md)

**Implications:**

- Mastra's CI story is BYO-Node-environment. It's lightweight and ecosystem-idiomatic but leaves CI determinism in the user's hands (`@latest` resolves at deploy time unless the user pinned `mastra@X.Y.Z` in their `package.json`).
- Speakeasy's Action is heavy but self-contained. Pinning the action tag (`@v15`) locks the entire sandbox — a different kind of determinism than Mastra's.
- Both vendors require a non-interactive auth path. Mastra makes it an explicit CLI flag (`--yes` on every prompting command); Speakeasy makes it an env-var replacement for the browser login.

**Decision triggers:**

- If your CI users already have Node set up and you don't need language-polyglot tooling: Mastra's pattern is minimal and ergonomic.
- If your CI needs to produce outputs in many languages (SDK gen, codegen): a vendor-branded Docker action amortizes the toolchain installation and locks determinism.

### D7 — Short-Name / Bin Ergonomics

**Finding:** Mastra ships two bins across two packages (`mastra` + `create-mastra`); no short alias; no multi-bin package. Speakeasy ships one bin (`speakeasy`); no short alias; overridable at install time via `BINARY_NAME=` env var in install.sh but no doc recommends a rename. Speakeasy's Homebrew formula installs shell completions for bash, zsh, and fish alongside the binary.

**Evidence:** [evidence/d7-short-name-bin.md](evidence/d7-short-name-bin.md)

**Implications:**

- Both vendors follow the "full product name" convention. Neither uses the `ripgrep` → `rg`, `bat` → `bat`, `fd-find` → `fd`, or `open-knowledge` → `ok` short-alias pattern.
- Mastra's split into two packages is unusual (most frameworks use one bin with a `create` subcommand) but optimized for `npm create mastra` as the single discoverable one-liner.
- Speakeasy's shell completions are a higher-leverage UX investment when the CLI has many subcommands. Mastra may not ship completions; not inspected.

**Decision triggers:**

- If your CLI has a small command surface and a short, memorable name (`gh`, `fly`, `vercel`), a short alias has low marginal value.
- If your CLI's name is long or multi-word (`open-knowledge`, `speakeasy-api`), registering a short alias alongside the full name has clear UX value.
- Shell completions are table stakes for a binary CLI with many subcommands; node CLIs often skip them because npm's `npx <bin>` interferes with completion.

### D8 — Postinstall-Binary Distribution Patterns

**Finding:** Four distinct patterns exist for shipping native or compiled-language binaries through npm. The ecosystem is actively migrating from Pattern B (postinstall CDN download — Prisma, Electron, old-sharp) to Pattern A (optionalDependencies per-platform — esbuild, Bun, turbo, sharp v0.33+), with sharp's v0.33 migration in 2024 as the signal event: maintainer Lovell Fuller in [issue #3750](https://github.com/lovell/sharp/issues/3750) cites esbuild as proof-of-concept for relying "only on package manager mechanics at install time, without custom scripts." Pattern A wins for offline installs (pure npm cache), ephemeral contexts (`npx`/`bunx`), and supply-chain auditing — but per-platform payload caps it at \~60 MB/platform, which is why Electron (90-200 MB/platform) remains on Pattern B for dev installs and, critically, **does not distribute via npm for end users at all**. 7 of 7 surveyed Electron apps (VS Code, Obsidian, Slack, Discord, Claude Desktop, Linear, Cursor) ship native installers; 5 of 7 also ship Homebrew Cask as a secondary channel. Single-file bundling via `bun build --compile`, Node SEA, or `@yao-pkg/pkg` (the active fork of deprecated `@vercel/pkg`) is tangential — it applies to standalone CLIs, not Electron GUIs, and as of Bun 1.3.12 has unresolved macOS code-signature truncation ([issue #29120](https://github.com/oven-sh/bun/issues/29120)) blocking production use.

**Evidence:** [evidence/d8-postinstall-binaries.md](evidence/d8-postinstall-binaries.md)

**Implications:**

- For a pure-JS CLI (Mastra's shape), no postinstall-binary question exists. The npm package ships only JS.
- For a Go/Rust/Zig CLI wanting a parallel npm channel alongside goreleaser, Pattern A (per-platform optionalDeps) is the industry-standard path. turbo's `@turbo/darwin-arm64` / `@turbo/linux-x64` etc. is the cleanest reference.
- For a native-extension-backed JS library (sharp, @swc, @parcel/watcher), Pattern A is now best practice; Pattern B is legacy.
- **For an Electron end-user app, npm is not a viable distribution channel.** The pattern doesn't exist. Distribute via electron-builder → native installers (DMG/EXE/DEB/AppImage/Store) + optional Homebrew Cask.

**Decision triggers:**

- Pure-JS CLI → ignore this dimension.
- Native-extension library → Pattern A (optionalDeps + shim with runtime `require.resolve`).
- Cross-platform compiled-language CLI → Pattern A if per-platform < 60 MB; otherwise goreleaser + wrappers (Speakeasy pattern, see D2).
- Electron GUI → electron-builder + native installers. Do not try to ship via npm for end users.

**Remaining uncertainty:** Whether production-grade Electron apps ever ship a secondary npm-installable variant for headless/dev use alongside the native installer — inferred negative across the 7 surveyed apps but not exhaustively confirmed.

### D9 — CLI + Desktop Telemetry Patterns

**Finding:** Opt-out is the overwhelming default (10 of 13 surveyed tools). [Turborepo](https://turborepo.dev/docs/telemetry) is the single gold-standard reference because it ships three equivalent opt-out paths — subcommand (`turbo telemetry disable`), env var (`TURBO_TELEMETRY_DISABLED=1`), and `DO_NOT_TRACK=1` (the only surveyed tool to honor it; Homebrew explicitly rejected the proposal in [PR #6745](https://github.com/Homebrew/brew/pull/6745)). Turbo also exposes a debug mode (`TURBO_TELEMETRY_DEBUG=1` prints payload without sending), a dedicated docs page with data-collection disclosure, and explicit exclusion of names/paths/logs. VS Code's [`telemetry.telemetryLevel`](https://code.visualstudio.com/docs/configure/telemetry) four-level setting (`all`/`error`/`crash`/`off`) is the reference for desktop-app granularity — separating crash from usage consent is the industry-leading pattern. **Mastra sits significantly below this bar:** unconditional PostHog wiring with `MASTRA_TELEMETRY_DISABLED=1` as the only opt-out, no docs page, no first-run banner, no debug mode, no `DO_NOT_TRACK` honoring, no crash/usage split. **Speakeasy's email-only opt-out** ("contact [info@speakeasy.com](mailto:info@speakeasy.com)") is the worst-case anti-pattern. Endpoints vary: PostHog (Mastra) is not dominant — most vendors self-host (Vercel for Next.js/Turbo/Vercel CLI; `checkpoint.prisma.io`; InfluxDB for Homebrew; Azure Application Insights for VS Code).

**Evidence:** [evidence/d9-telemetry.md](evidence/d9-telemetry.md)

**Implications:**

- Opt-out default is tolerated by the ecosystem *if* coupled with multi-path opt-out + debug mode + docs page. Opt-out without these is substandard.
- Opt-in default is rare but defensible for high-sensitivity contexts (Prisma's crash reports, Storybook's crash reports, `gh-copilot`). Obsidian ships zero telemetry by default — the strictest posture and the one the open-knowledge Electron spec aligns with.
- Crash reporting and usage telemetry are separable consent axes. Conflating them (Cursor's single "Privacy Mode" toggle) is the anti-pattern; separating them (VS Code 4-level, Prisma per-crash, Storybook opt-in-for-crashes) is the leading pattern.
- Mastra's unconditional-PostHog-plus-hardcoded-API-key implementation is a GDPR risk for EU users (opt-out analytics beyond "strictly necessary" is contested under EU case law).

**Decision triggers:**

- Shipping a CLI that collects any telemetry → match at minimum the Turbo + Next.js baseline: multi-path opt-out, docs page with data-collection list, debug mode, exclude names/paths/logs.
- Shipping a desktop/Electron app → add crash/usage split (VS Code 4-level or Prisma per-crash) + settings UI toggle + enterprise policy lever.
- Zero-telemetry-by-default (Obsidian model) is the strictest posture and is compatible with the Electron spec's NG3.
- Never use email-only opt-out; it flunks both UX and regulatory tests.

**Remaining uncertainty:** Whether Cursor's exact analytics vendors (PostHog? Segment? Amplitude?) are disclosed anywhere public; Mastra's GDPR posture relative to EU opt-in-consent norms; whether `gh` (main CLI) collects any telemetry (no docs, no env var — inferred absent).

---

## Cross-cutting Patterns

**1. Language determines distribution architecture.** TS/Node → npm-native single channel. Go → goreleaser → GitHub releases + wrappers. Neither vendor tried to cross the divide (no `postinstall` binary-download wrapper, no dual-channel pattern). D8 confirms the divide is technical: per-platform payload size and ecosystem support for `os`/`cpu`/`libc` filters gate the choice.

**2. "Single source of truth" is the overriding principle.** Both vendors deliberately avoid duplicating publication effort. Mastra could ship via Homebrew (there's no technical blocker to a `brew install mastra` that runs `npm i -g mastra`); Speakeasy could ship an npm wrapper. Both choose not to.

**3. Account gating is independent of language.** Mastra chose zero-signup `npm create`; Speakeasy chose sign-up-first. This is a product decision, not a technical one.

**4. `@latest` is the default in every copy-paste snippet across both vendors.** Neither vendor ships pinned-by-default install commands, and both provide mechanisms for the careful user to pin. The assumption is "you'll get the latest and it'll be fine" — an ecosystem-level convention in both npm and Homebrew that neither vendor pushes back on.

**5. Neither vendor invests in short bin aliases.** The pattern that `open-knowledge` adopted (full name + short alias `ok`) is uncommon in this peer set but well-precedented in compiled-language CLIs (ripgrep → rg, fd-find → fd, bat → bat).

**6. The ecosystem trajectory for native-binary npm packages is Pattern A (optionalDeps).** sharp v0.33 (2024) is the signal migration; esbuild is the reference implementation. Pattern B (postinstall CDN) survives only where per-platform payload exceeds \~60 MB (Electron, large native extensions).

**7. No Electron app ships via npm for end users; this is a hard ecosystem boundary.** 7 of 7 reference apps use native installers; 5 of 7 also publish Homebrew Cask. The `electron` npm package is dev-only.

**8. Telemetry opt-out is the ecosystem default but quality varies by 10×.** Turbo + VS Code + Next.js establish the bar; Mastra + Speakeasy + Cursor fall significantly short on transparency (docs page, debug mode, data-collection disclosure) even when their opt-out mechanism works.

**9. Obsidian's zero-telemetry-by-default is the strictest and most privacy-aligned posture.** The Electron spec's NG3 adopts this model, which simplifies the design space: no opt-out UX to engineer because there's nothing shipped by default.

---

## Application to Open Knowledge (Conclusions, 1P)

> **Stance note.** This section explicitly departs from the Factual / 3P stance of D1-D9. The user requested it mid-run to apply the 3P findings to open-knowledge's CLI + Electron desktop trajectory. D1-D9 remain usable on their own for any other product; this section builds on them without modifying them.

### Context: where open-knowledge is

**Shipped today (main, as of 2026-04-20):**

- `@inkeep/open-knowledge` npm CLI with [[packages/cli/src/cli|`open-knowledge`]] + newly-added [[packages/cli/src/cli|`ok`]] bins (this PR)
- Distribution: bunx / npx / pnpm dlx + global install via bun / npm / pnpm
- MCP stdio server auto-spawns `ok start` as a detached sibling process per `specs/2026-04-16-zero-ceremony-resume/`
- `open-knowledge init` writes MCP configs for Claude Code (`.mcp.json`), Cursor, VS Code, Codex (`.codex/config.toml`), Windsurf, and Claude Desktop — broader editor coverage than Mastra's `--mcp <editor>` enum
- No telemetry today

**Locked by `specs/2026-04-11-electron-desktop-app/SPEC.md` (Draft; gating V0-20 in the "Later" bucket):**

- electron-vite + electron-builder toolchain
- Distribution: signed DMG via direct download + GitHub Releases for auto-update via electron-updater
- Apple Developer Program ($99/yr) + Azure Trusted Signing (\~$120/yr) for code signing
- Install-on-quit auto-update pattern (Obsidian / Claude Desktop model; not Slack-style "Restart now" nags)
- **Opt-in telemetry only — Obsidian model, default off** (NG3)
- NEVER Mac App Store distribution (NG2; sandbox incompatible with `@parcel/watcher` + `simple-git`)
- G5: CLI coexists with the desktop app; both ship in parallel
- G4: Desktop first-launch auto-registers MCP with Claude Desktop / Cursor / Continue

**Not in v0 scope (per `projects/v0-launch/PROJECT.md`):** Electron native distribution, multi-project switching, full-text search, cloud SaaS, multi-human concurrent editing. V0-20 desktop build prep is owned by Andrew and parked until the Electron spec promotes from Draft.

### How the evidence maps

**D1 + D3 (install page + dlx posture).** Open-knowledge's current install UX is a bunx/npx/pnpm dlx matrix plus `bun i -g / npm i -g / pnpm add -g`. This matches Mastra's PM-agnostic-but-npm-first tab-switcher pattern, modulo the tab widget itself. The current README does the same work in prose. **No change required for the CLI side.** For the desktop app when it ships: follow the 5/7-reference-app pattern — direct DMG download as primary, Homebrew Cask as secondary. There's no precedent for OS auto-detection in either Mastra (tab switcher) or Speakeasy (prose list), so a single "Download for your platform" button with OS-detected primary + a "Other platforms" disclosure is the max ambition worth chasing.

**D2 + D8 (distribution channels + postinstall patterns).** Mastra's npm-only posture is the right fit for open-knowledge's Node/TS CLI — already matches. The Electron spec's locked `electron-builder → DMG → GitHub Releases` pipeline is the industry-universal pattern for end-user Electron distribution; D8's survey of 7/7 reference apps confirms there is no viable alternative. **Do not attempt to ship the desktop app via npm.** Pattern B (postinstall-download-Electron) would produce a developer-grade install flow for a non-developer persona (P1 in the Electron spec is "documentation author, no terminal"). `bun build --compile` is blocked by [oven-sh/bun#29120](https://github.com/oven-sh/bun/issues/29120) macOS code-signature truncation and doesn't apply to Electron GUIs anyway.

**D4 (pinning + upgrade).** CLI upgrade stays delegated to the package manager — Mastra's model. The Electron spec's locked `electron-updater` handles desktop auto-update. Worth considering: an `ok update` subcommand that delegates to `npm i -g @inkeep/open-knowledge@latest` when invoked from a globally-installed context, with a helpful message when invoked from `npx`/`bunx` ("this is an ephemeral install; re-run `npx @inkeep/open-knowledge@latest` to upgrade"). This is optional; Mastra ships without it. A minimal sibling capability is `ok --version` parity with a doc-page about upgrading.

**D5 (first-run + MCP + auth).** Open-knowledge's `init` already does more than Mastra's `create-mastra` on the editor-MCP axis: Claude Code is covered (Mastra skips it); Claude Desktop is covered (Mastra skips it); Codex's `.codex/config.toml` is covered (Mastra has no analog); Windsurf and VS Code are covered (parity). This is a concrete UX lead over Mastra. **Preserve and extend it** as new editors emerge (e.g. Zed MCP integration). Desktop first-launch (per Electron spec G4) should reuse the same init codepath — the MCP-config writes are not desktop-vs-CLI-specific. Auth: open-knowledge has no platform auth today; the `/auth/login` infrastructure (browser device-flow, credentials at `~/.open-knowledge/auth.yml` mode 0600, `GITHUB_TOKEN`-style env-var override) is already built and mirrors Mastra/Speakeasy's pattern.

**D6 (CI).** Current CI uses turbo + GitHub Actions with per-package tasks. No vendor "setup-open-knowledge" action is needed — open-knowledge is homogeneous Node/TS; `actions/setup-bun@v2` is sufficient for CI users. The Speakeasy-style all-language Docker action is over-engineered for this shape.

**D7 (short-name bin).** `ok` + `open-knowledge` shipped this session. The peer evidence (neither Mastra nor Speakeasy has a short alias) cuts both ways: the pattern is uncommon enough that the docs need to explicitly surface "`ok` is an alias for `open-knowledge`" in every install snippet; but the long product name (`open-knowledge` is 14 characters vs `mastra` at 6 and `speakeasy` at 9) justifies the alias in a way neither peer's name does. Precedent from compiled-language CLIs (ripgrep → rg, fd-find → fd) supports the choice. **Already shipped; no further action beyond docs.**

**D9 + Electron spec NG3 (telemetry).** The Electron spec already locks this to opt-in-only / Obsidian-model, which is *stricter* than every OPT-OUT-default tool in D9's survey. Implementation path:

1. **Ship nothing until there's a concrete reason to add it.** The Obsidian model is "zero telemetry; only the update check, and that is also disableable." Match it.
2. **When telemetry is added (e.g., to measure MCP-stdio adoption or crash rates):** implement the full Turbo/VS Code playbook from day one rather than retrofitting. Specifically:
   - `ok telemetry enable/disable/status` subcommand
   - `OK_TELEMETRY_DISABLED=1` env var (redundant with opt-in-default but useful for "don't even ask" CI contexts)
   - `DO_NOT_TRACK=1` honored (Turbo is the only surveyed tool doing this — easy differentiator)
   - `OK_TELEMETRY_DEBUG=1` prints payload to stderr without sending
   - Dedicated `/docs/telemetry` page listing every event + example payload + exclusion list
   - First-launch consent banner in the desktop app (not auto-opt-in; explicit prompt with "Yes / No / Learn more")
   - Separate crash reporting (via `@sentry/electron` + Electron's Crashpad) from usage telemetry — each independently gateable
3. **Do not repeat Mastra's mistakes.** Unconditional PostHog with a hardcoded API key, no docs page, no `DO_NOT_TRACK` honoring — these are the specific gaps the reference patterns fill. The bar is trivial to clear.

### Ranked recommendations for the desktop transition

1. **Ship what's already locked; resist re-derivation.** The Electron spec is highly specified (Electron 41+, electron-builder, signed DMG, GitHub Releases, install-on-quit updates, opt-in telemetry). The D1-D9 evidence confirms the direction is correct. V0-20 (desktop build prep) can proceed without re-debating distribution strategy. **Confidence: high.**

2. **Keep the CLI npm-only after desktop ships.** Mastra's npm-only pattern remains the right fit for the P2 developer persona and the P3 AI-agent-via-MCP persona. Do not ship a Homebrew tap for the CLI unless users specifically ask; it adds maintenance without addressing a real pain point. **Confidence: high.**

3. **Ship Homebrew Cask for the desktop app when the signed DMG exists.** 5 of 7 reference Electron apps do this (Obsidian, Slack, Discord, Claude Desktop, Linear, Cursor — via community casks). It's a PR to `homebrew-cask` once the DMG URL and signature are stable. Adds `brew install --cask open-knowledge` as a second install path with zero ongoing cost. **Confidence: high.**

4. **Preserve open-knowledge's broader `init`-MCP-config coverage as a product advantage.** The fact that `open-knowledge init` writes configs for Claude Code, Claude Desktop, Codex, and other editors Mastra's `--mcp` enum omits is a concrete lead worth calling out in docs. **Confidence: high.**

5. **When telemetry is added, implement the full Turbo/VS Code playbook.** Specifically honor `DO_NOT_TRACK=1` on day one (Turbo is the only surveyed tool doing this; it's a measurable differentiator). Crash and usage are separate consent axes. Ship the docs page + debug mode from the start. **Confidence: high; contingent on telemetry actually being added.**

6. **Delay a self-update subcommand (`ok update`).** Mastra ships none; the package-manager upgrade path works. Revisit only if users report confusion about how to upgrade. **Confidence: medium.**

7. **Do not build a vendor CI Action.** Open-knowledge is homogeneous Node/TS and doesn't benefit from Speakeasy's polyglot-toolchain Docker pattern. `actions/setup-bun@v2` + standard turbo invocations is the right shape. **Confidence: high.**

8. **Document the `ok` short alias prominently in every install snippet.** The peer set (Mastra, Speakeasy) doesn't use aliases, so users coming from those ecosystems won't expect one. Every README / install-doc / MCP-config example should show both forms or explicitly note `ok` as the alias. **Confidence: high.**

### What Mastra got right to copy (and avoid)

- **Copy:** Zero-signup `npm create`-style on-ramp (no account gate before first use). Open-knowledge already has this.
- **Copy:** Scaffolded editor MCP configs on first run. Open-knowledge already covers more editors than Mastra.
- **Avoid:** Unconditional telemetry wiring with a hardcoded key and no docs page. The Electron spec's opt-in-only posture already rules this out.
- **Avoid:** The two-package `create-X` split (Mastra's `create-mastra` + `mastra`). Open-knowledge's unified `ok init` + `ok start` subcommand model is cleaner for a dual-mode CLI + desktop app.

### What Speakeasy got right to copy (and avoid)

- **Copy (when desktop ships):** The pattern of a single release pipeline fanning out to multiple channels. electron-builder + electron-updater + Homebrew Cask is the Electron-ecosystem analog of Speakeasy's goreleaser + multiple wrappers.
- **Copy:** Shell completions (bash, zsh, fish) alongside the CLI binary if the command surface grows. Not needed today but cheap to add when subcommand count crosses \~10.
- **Avoid:** Account-gated install. Open-knowledge's local-first posture (`specs/2026-04-11-electron-desktop-app/` G9: no outgoing network calls in default config except the auto-update check) is incompatible with Speakeasy's "sign up first."
- **Avoid:** Email-only telemetry opt-out. Already ruled out by NG3.
- **Avoid:** Vendor-branded Docker CI action bundling polyglot toolchains. Over-engineered for a homogeneous Node/TS product.

---

## Limitations & Open Questions

### Dimensions not fully covered

- **In-product browser preview handoff** (originally proposed as D8; dropped mid-run at user request). `.claude/launch.json` schema, Cursor browser pane, Claude Desktop MCP UI, VS Code Simple Browser, Windsurf, and Codex preview integrations remain open. Recommended as a standalone follow-up report.
- **Mastra telemetry opt-out quality** — only the single env var documented in source; no CLI subcommand or config setting to check status.
- **Stale-version warnings at runtime** — Mastra has peer-dep drift checks; Speakeasy's `speakeasy update` may have stale-version nudges but not documented.
- **Cursor's exact analytics vendor stack** — "telemetry and usage data" stated but not itemized publicly.

### Out of scope (per rubric)

- Runtime behavior of the tools — agent quality, SDK correctness.
- Pricing / licensing of Mastra or Speakeasy.
- Windows-specific install nuances (open-knowledge doesn't target Windows in v0; neither vendor's docs deeply treat Windows beyond listing WinGet/Chocolatey for Speakeasy).

### Gaps where evidence was thin

- **Speakeasy auth mechanism** — "A browser window will open" is the extent of the public doc; whether it's OAuth device flow, redirect-with-token, or similar is not pinned.
- **Mastra CLI shell completions** — not inspected; absence is inferred.
- **Both vendors' rollback semantics on upgrade** — undocumented.
- **Vite telemetry stance** — no docs page found; inferred telemetry-free but not confirmed via source sweep.
- **`gh` main CLI telemetry** — no privacy page, no env var documented; inferred telemetry-free (only `gh-copilot` extension is documented).
- **VS Code's `DO_NOT_TRACK` support** — not documented as honored; would need source-level confirmation.
- **Bun `--compile` code-signature fix timeline** — [#29120](https://github.com/oven-sh/bun/issues/29120) open as of v1.3.12; timeline unclear.

---

## References

### Evidence Files

- [evidence/d1-install-page.md](evidence/d1-install-page.md) — First-shown command, tab order, PM precedence
- [evidence/d2-distribution-channels.md](evidence/d2-distribution-channels.md) — npm, Homebrew, goreleaser, install.sh, Docker
- [evidence/d3-one-shot-vs-permanent.md](evidence/d3-one-shot-vs-permanent.md) — dlx vs install posture
- [evidence/d4-pinning-and-upgrade.md](evidence/d4-pinning-and-upgrade.md) — `@latest`, `VERSION=`, `speakeasy update`, peer-dep drift
- [evidence/d5-first-run-auth-scaffolding.md](evidence/d5-first-run-auth-scaffolding.md) — `@clack/prompts`, `.mastra/credentials.json`, `.speakeasy/workflow.yaml`, editor MCP configs
- [evidence/d6-ci-patterns.md](evidence/d6-ci-patterns.md) — `actions/setup-node@v4` vs `speakeasy-api/sdk-generation-action`
- [evidence/d7-short-name-bin.md](evidence/d7-short-name-bin.md) — Bin names, aliases, shell completions
- [evidence/d8-postinstall-binaries.md](evidence/d8-postinstall-binaries.md) — esbuild / Bun / turbo / Prisma / Electron / sharp / @swc / yao-pkg patterns
- [evidence/d9-telemetry.md](evidence/d9-telemetry.md) — Mastra / Speakeasy / Next.js / Astro / Homebrew / Turbo / VS Code / Cursor telemetry postures

### External Sources — Mastra

- [Mastra docs (Quickstart-on-landing)](https://mastra.ai/docs)
- [Mastra Quickstart guide](https://mastra.ai/guides/getting-started/quickstart)
- [Mastra manual install](https://mastra.ai/docs/getting-started/manual-install)
- [create-mastra reference](https://mastra.ai/reference/cli/create-mastra)
- [mastra CLI reference](https://mastra.ai/reference/cli/mastra)
- [Mastra platform deploy (CI)](https://mastra.ai/guides/deployment/mastra-platform)
- [mastra-ai/mastra GitHub repo](https://github.com/mastra-ai/mastra)
- [mastra on npm](https://www.npmjs.com/package/mastra)
- [create-mastra on npm](https://www.npmjs.com/package/create-mastra)

### External Sources — Speakeasy

- [Speakeasy Getting Started](https://www.speakeasy.com/docs/speakeasy-reference/cli/getting-started)
- [Speakeasy Introduction (sign-up-first)](https://www.speakeasy.com/docs/introduction)
- [speakeasy quickstart reference](https://www.speakeasy.com/docs/speakeasy-cli/quickstart)
- [speakeasy update reference](https://www.speakeasy.com/docs/speakeasy-cli/update)
- [speakeasy run reference](https://www.speakeasy.com/docs/speakeasy-reference/cli/run)
- [speakeasy-api/speakeasy GitHub repo](https://github.com/speakeasy-api/speakeasy)
- [install.sh (main)](https://raw.githubusercontent.com/speakeasy-api/speakeasy/main/install.sh)
- [speakeasy-api/homebrew-tap](https://github.com/speakeasy-api/homebrew-tap)
- [speakeasy.rb Homebrew formula](https://github.com/speakeasy-api/homebrew-tap/blob/main/speakeasy.rb)
- [.goreleaser.yaml](https://github.com/speakeasy-api/speakeasy/blob/main/.goreleaser.yaml)
- [sdk-generation-action](https://github.com/speakeasy-api/sdk-generation-action)
- [Speakeasy Product Security (telemetry policy)](https://www.speakeasy.com/legal/product-security)

### External Sources — Postinstall Patterns (D8)

- [esbuild npm package.json](https://github.com/evanw/esbuild/blob/main/npm/esbuild/package.json)
- [esbuild node-install.ts fallback chain](https://github.com/evanw/esbuild/blob/main/lib/npm/node-install.ts)
- [bun package.json via unpkg](https://unpkg.com/bun/package.json)
- [turbo packages/turbo/package.json](https://github.com/vercel/turborepo/blob/main/packages/turbo/package.json)
- [@swc/core package.json](https://raw.githubusercontent.com/swc-project/swc/main/packages/core/package.json)
- [sharp installation docs (v0.33+)](https://sharp.pixelplumbing.com/install/)
- [sharp migration issue #3750](https://github.com/lovell/sharp/issues/3750)
- [Prisma engine/binary management (DeepWiki)](https://deepwiki.com/prisma/prisma/4-engine-and-binary-management)
- [Electron installation docs](https://www.electronjs.org/docs/latest/tutorial/installation)
- [Bun compile docs](https://bun.com/docs/bundler/executables)
- [Bun issue #29120 — macOS signature truncation](https://github.com/oven-sh/bun/issues/29120)
- [@yao-pkg/pkg npm](https://www.npmjs.com/package/@yao-pkg/pkg)

### External Sources — Telemetry (D9)

- [Next.js Telemetry](https://nextjs.org/telemetry)
- [Astro Telemetry](https://astro.build/telemetry/)
- [Vercel CLI Telemetry](https://vercel.com/docs/cli/about-telemetry)
- [Homebrew Analytics](https://docs.brew.sh/Analytics)
- [Homebrew PR #6745 — DO\_NOT\_TRACK rejected](https://github.com/Homebrew/brew/pull/6745)
- [Turborepo Telemetry](https://turborepo.dev/docs/telemetry)
- [Prisma CLI Telemetry](https://www.prisma.io/docs/v6/orm/tools/prisma-cli)
- [Storybook Telemetry](https://storybook.js.org/docs/configure/telemetry)
- [VS Code Telemetry](https://code.visualstudio.com/docs/configure/telemetry)
- [@vscode/extension-telemetry](https://github.com/microsoft/vscode-extension-telemetry)
- [Cursor Privacy](https://cursor.com/privacy)
- [consoledonottrack.com discussion on HN](https://news.ycombinator.com/item?id=27746587)

### Related Research (see-also)

- [[reports/zero-config-bunx-cli-packaging/REPORT]] — Prior art on open-knowledge's own CLI packaging decisions (Storybook, Prisma Studio, Vite as peers — complementary to this report's Mastra/Speakeasy focus).
- [[reports/cli-command-name-ok-okb/REPORT]] — Short-name collision audit motivating the `ok` bin alias choice (companion to D7 here).
- [[reports/electron-desktop-app-operations-2025/REPORT]] — Electron versioning, signing, auto-update, CI, security (reference for D8's Electron claims + Application section's auto-update + code-signing details).
- [[reports/mcp-server-auto-install-harnesses/REPORT]] — How MCP servers integrate with editor config files (Claude Code, Cursor, VS Code, Windsurf, Codex, Claude Desktop).
- [[specs/2026-04-11-electron-desktop-app/SPEC]] — The locked Electron direction this report's Application section grounds against.

### Downstream specs (derived from this report)

- [[specs/2026-04-20-cli-distribution-and-install-ux/SPEC]] — Decision-codification spec that turns this report's "Application to Open Knowledge" recommendations into 14 numbered decisions (LOCKED + NEVER + NOT NOW + Future Work). Companion to the parent Electron spec; reconciles `specs/2026-04-08-cli-packaging` NG conflicts.

