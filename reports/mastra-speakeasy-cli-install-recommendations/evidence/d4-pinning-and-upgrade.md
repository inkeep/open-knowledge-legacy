# Evidence: D4 — Version pinning + upgrade UX

**Dimension:** D4 — Do install snippets pin versions? Is there a self-update command? How do they handle drift?
**Date:** 2026-04-20
**Sources:** Mastra docs + CLI source, Speakeasy docs + install.sh + homebrew-tap

---

## Key files / pages referenced

- `packages/cli/package.json` (Mastra) — engines field
- `packages/cli/src/commands/dev/dev.ts` — peer-dep drift check + upgrade nudge
- `packages/cli/src/index.ts` — full subcommand listing
- [speakeasy.com/docs/speakeasy-cli/update](https://www.speakeasy.com/docs/speakeasy-cli/update)
- [speakeasy install.sh VERSION env var](https://raw.githubusercontent.com/speakeasy-api/speakeasy/main/install.sh)
- [speakeasy-api/homebrew-tap versioned formulas](https://github.com/speakeasy-api/homebrew-tap)

---

## Findings

### Finding: Mastra's snippets pin to `@latest` everywhere; drift is detected at runtime via peer-dep mismatch warnings, not via a self-update subcommand

**Confidence:** CONFIRMED
**Evidence:** Mastra docs + `packages/cli/src/index.ts` + `packages/cli/src/commands/dev/dev.ts`

All user-facing docs snippets use `@latest`:

```
npm create mastra@latest
npm install -D ... mastra@latest
npm install @mastra/core@latest zod@^4
```

Both `packages/cli/package.json` and `packages/create-mastra/package.json` declare:

```json
"engines": { "node": ">=22.13.0" }
```

`packages/cli/src/index.ts` subcommand listing — no `update`, `upgrade`, or `self-update` command. Present commands: auth, server, studio, scorers, migrate, init, create, dev, build, start, lint.

Drift-detection is runtime, not explicit. `packages/cli/src/commands/dev/dev.ts`:

```js
const peerDepMismatches = await checkMastraPeerDeps(mastraPackages);
logPeerDepWarnings(peerDepMismatches);
// ... on server crash:
devLogger.warn(`This error may be caused by mismatched package versions. Try running: ${updateCommand}`);
```

**Implications:** Mastra outsources upgrade UX to the package manager. `npm update`, `pnpm up`, `bun update` each have their own semantics; Mastra doesn't wrap them. The peer-dep warning is the only in-product drift signal. For a user with `mastra@1.4.0` and `@mastra/core@1.6.0` installed, the warning fires at `mastra dev` time — not on install.

### Finding: Speakeasy's snippets are unpinned in docs, but install.sh supports VERSION env var, homebrew-tap keeps versioned formulas, and `speakeasy update` is a first-class self-update subcommand

**Confidence:** CONFIRMED
**Evidence:** install.sh, homebrew-tap, update command page

install.sh (line inspection): `VERSION` env var override; falls back to GitHub `/releases/latest` if unset.

[speakeasy-api/homebrew-tap](https://github.com/speakeasy-api/homebrew-tap) contains hundreds of versioned `speakeasy@X.Y.Z.rb` formulas (e.g. `speakeasy@1.761.8.rb`, `speakeasy@1.412.0.rb`), enabling `brew install speakeasy-api/tap/speakeasy@<version>`.

[speakeasy.com/docs/speakeasy-cli/update](https://www.speakeasy.com/docs/speakeasy-cli/update):

> Updates the Speakeasy CLI in-place to the latest version available by downloading from Github and replacing the current binary

Flags: `--timeout`, `--logLevel`.

**Implications:** Speakeasy's upgrade UX is an inversion of Mastra's — because the CLI is a Go binary with no package-manager auto-update integration, the vendor ships an explicit `speakeasy update` that mutates its own binary in-place. This is the standard Go-CLI convention (e.g. gh, flyctl, railway).

---

## Comparative matrix

| Upgrade behavior       | Mastra                                           | Speakeasy                                                                                  |
| ---------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Snippets in docs       | `@latest` everywhere                             | Unpinned (`brew install ...@latest`-equivalent; install.sh defaults to `/releases/latest`) |
| Pinning mechanism      | npm semver in `package.json`                     | `VERSION=<tag>` env var in install.sh; versioned homebrew formulas                         |
| Self-update subcommand | None                                             | `speakeasy update` (replaces binary in-place)                                              |
| Drift detection        | Runtime peer-dep warning (`mastra dev`)          | Not documented (UNCERTAIN)                                                                 |
| Node/Go enforcement    | `engines: { node: '>=22.13.0' }` (both packages) | N/A — Go binary is self-contained                                                          |
| Pin-at-install         | Any PM supports `mastra@X.Y.Z`                   | `brew install ...@X.Y.Z` or `VERSION=X.Y.Z ./install.sh`                                   |

---

## Negative searches

- **Mastra self-update:** No `mastra update` / `mastra upgrade` / `mastra self-update` subcommand in `packages/cli/src/index.ts`. Relies on package-manager update commands.
- **Speakeasy stale-version warnings on run:** Not explicitly documented in the `speakeasy --help` or update-command pages. The existence of `speakeasy update` suggests an in-product nudge may exist but is not confirmed.

---

## Gaps / follow-ups

- **Mastra:** Does it warn on stale `mastra` CLI version vs a newer `create-mastra`? The peer-dep warning is specifically for `@mastra/*` runtime packages; CLI-vs-scaffolder drift is a separate class.
- **Speakeasy:** Does the CLI phone home on startup to check for updates? Would need to inspect source or strace.
- **Both:** Neither documents a rollback story. `speakeasy update` replaces in-place with no backup; `mastra dev` doesn't hold a prior-version reference.

