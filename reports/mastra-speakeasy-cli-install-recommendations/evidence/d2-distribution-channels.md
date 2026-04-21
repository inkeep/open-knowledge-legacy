# Evidence: D2 — Distribution Channels

**Dimension:** D2 — What channels ship the CLI and which is the authoritative source?
**Date:** 2026-04-20
**Sources:** npm registry, GitHub release assets, goreleaser configs, Homebrew tap

---

## Key files / pages referenced

- `npm view mastra@latest` — Mastra CLI package metadata
- `npm view create-mastra@latest` — scaffolder package
- `npm view @mastra/cli` — returns `404 Not Found` (confirmed no scoped CLI package exists)
- [mastra-ai/mastra repo root](https://github.com/mastra-ai/mastra) — no install.sh, Dockerfile, goreleaser, or homebrew-tap sibling
- [speakeasy-api/speakeasy/.goreleaser.yaml](https://github.com/speakeasy-api/speakeasy/blob/main/.goreleaser.yaml)
- [speakeasy-api/homebrew-tap](https://github.com/speakeasy-api/homebrew-tap)
- [speakeasy install.sh (main)](https://raw.githubusercontent.com/speakeasy-api/speakeasy/main/install.sh)
- [sdk-generation-action Dockerfile](https://github.com/speakeasy-api/sdk-generation-action/blob/main/Dockerfile)

---

## Findings

### Finding: Mastra ships npm-only with two bins in two separate packages

**Confidence:** CONFIRMED
**Evidence:** npm registry + mastra-ai/mastra repo root

```
$ npm view mastra@latest
name:    mastra
version: 1.6.0
bin:     { mastra: 'dist/index.js' }
engines: { node: '>=22.13.0' }
repository.directory: packages/cli

$ npm view create-mastra@latest
name:    create-mastra
version: 1.6.0
bin:     { 'create-mastra': 'dist/index.js' }
engines: { node: '>=22.13.0' }

$ npm view @mastra/cli
404 Not Found
```

Repo root of [mastra-ai/mastra](https://github.com/mastra-ai/mastra) has **no** `install.sh`, **no** `Dockerfile` for the CLI, **no** `.goreleaser.yml`, **no** `brew/` directory, **no** adjacent `homebrew-tap` sibling repository.

**Implications:** npm is the single authoritative channel for both the scaffolder (`create-mastra`) and the persistent CLI (`mastra`). Related Mastra runtime components may ship in Docker (AWS Lambda deploy guide references BuildKit flags) but the CLI itself is npm-only. The `@mastra/cli` scope is intentionally unclaimed — Mastra ships as **unscoped** `mastra` and `create-mastra`, matching the React/Vue `create-X` convention.

### Finding: Speakeasy ships a goreleaser-produced Go binary as the single source of truth; every other channel wraps GitHub releases

**Confidence:** CONFIRMED
**Evidence:** `.goreleaser.yaml`, install.sh, homebrew-tap formula

[.goreleaser.yaml](https://github.com/speakeasy-api/speakeasy/blob/main/.goreleaser.yaml) header:

> **No Docker images, NPM packages, or native Linux packages (nfpms)** are configured in this release pipeline.

install.sh derives the download URL:

```
https://github.com/speakeasy-api/speakeasy/releases/download/v${version}/${asset_name}.zip
```

OS detection via `uname -s` (linux/darwin), arch via `uname -m` (amd64/386/arm64). Default install dir `/usr/local/bin`. Checksum validation against `checksums.txt`. No PATH modification.

[speakeasy-api/homebrew-tap/speakeasy.rb](https://github.com/speakeasy-api/homebrew-tap/blob/main/speakeasy.rb) downloads the same GitHub release assets (`speakeasy_darwin_amd64.zip`, `_arm64.zip`, `speakeasy_linux_amd64.zip`, `_arm64.zip`) with per-arch SHA256 checksums.

[sdk-generation-action Dockerfile](https://github.com/speakeasy-api/sdk-generation-action/blob/main/Dockerfile) is `FROM golang:1.24-alpine3.23` — it compiles a **separate** Go orchestrator bundled with Node/Python/Java/Ruby/.NET/PHP toolchains. It does NOT install the standalone `speakeasy` CLI; this is a sibling product, not a redistribution.

The npm `@speakeasy-api/*` scope holds client SDKs only (`@speakeasy-api/speakeasy-client-sdk-typescript`, `@speakeasy-api/speakeasy-typescript-sdk`, `@speakeasy-api/moonshine`, `@speakeasy-api/docs-md`) — none wrap the CLI.

**Implications:** goreleaser → GitHub releases is the one truth. Homebrew, WinGet, Chocolatey, and install.sh are all thin fan-out wrappers producing identical binaries. Speakeasy deliberately skipped an npm-CLI channel despite having heavy npm presence for its SDKs — the decision seems grounded in "Go binary, not a Node wrapper," with no public evidence they evaluated postinstall-binary-download patterns (e.g. esbuild, prisma, @swc/core).

---

## Comparative matrix

| Channel             | Mastra                                          | Speakeasy                                             |
| ------------------- | ----------------------------------------------- | ----------------------------------------------------- |
| npm                 | **Source of truth** (`mastra`, `create-mastra`) | Not shipped — deliberate                              |
| Homebrew            | Not shipped                                     | `speakeasy-api/tap/speakeasy` (wraps GH releases)     |
| install.sh          | Not shipped                                     | `go.speakeasy.com/cli-install.sh` (wraps GH releases) |
| WinGet              | Not shipped                                     | `speakeasy` (goreleaser-emitted)                      |
| Chocolatey          | Not shipped                                     | `speakeasy` (goreleaser-emitted)                      |
| GitHub releases     | `npm publish` only; no signed binaries          | **Source of truth** (signed ZIPs + checksums)         |
| Docker (CLI itself) | Not shipped                                     | Not shipped                                           |
| Docker (CI)         | Not shipped                                     | `sdk-generation-action` (separate Go build)           |

---

## Negative searches

- **Mastra Homebrew tap:** WebSearch for "mastra brew homebrew install.sh curl standalone binary" — only generic Homebrew results + Mastra's npm docs. No mastra-ai/homebrew-\* repo.
- **Mastra install.sh:** No such file in repo root.
- **Speakeasy npm CLI:** `@speakeasy-api/cli` returns 404. Full listing of `@speakeasy-api/*` npm scope contains only SDK packages.
- **Speakeasy Docker image for CLI:** `.goreleaser.yaml` header explicitly disclaims Docker images for the CLI itself.

---

## Gaps / follow-ups

- Whether Mastra considered shipping a standalone binary (e.g. via `bun build --compile` or `pkg`) — no public issue or RFC found.
- Whether Speakeasy's deliberate skip of npm reflects a measured decision or historical inertia — `.goreleaser.yaml` header is declarative but doesn't explain.

