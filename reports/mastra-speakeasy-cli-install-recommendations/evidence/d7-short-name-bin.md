# Evidence: D7 — Short-name / bin ergonomics

**Dimension:** D7 — What's the long/short command? Multiple bins? Aliases? Shell completions?
**Date:** 2026-04-20
**Sources:** npm package metadata + homebrew formula + CLI source

---

## Key files / pages referenced

- `packages/cli/package.json` (Mastra)
- `packages/create-mastra/package.json` (Mastra)
- `packages/cli/src/index.ts` — Commander `.name()`
- [speakeasy-api/homebrew-tap/speakeasy.rb](https://github.com/speakeasy-api/homebrew-tap/blob/main/speakeasy.rb)
- speakeasy install.sh — `BINARY_NAME` default

---

## Findings

### Finding: Mastra ships two bins across two separate packages — `mastra` and `create-mastra` — no short alias, no multi-bin per package

**Confidence:** CONFIRMED
**Evidence:** package.json bin fields + Commander `.name()`

```json
// packages/cli/package.json
"bin": { "mastra": "./dist/index.js" }

// packages/create-mastra/package.json
"bin": { "create-mastra": "./dist/index.js" }
```

`packages/cli/src/index.ts`:

```js
program.name('mastra').version(...)
```

No short alias like `m` or `mst`. No multi-bin package (e.g. `{ mastra: ..., m: ... }`). Each package publishes a single singleton bin.

**Implications:** Mastra follows the React/Vue `create-X` convention strictly. The scaffolder-vs-CLI split into two packages is unusual (many frameworks ship one bin with a `create` subcommand — e.g. `next create`, `astro create`), but it optimizes for the discoverable `npm create mastra` one-liner at the cost of maintaining two packages.

### Finding: Speakeasy ships a single bin named `speakeasy`; no short alias; Homebrew installs shell completions (bash/zsh/fish) alongside

**Confidence:** CONFIRMED
**Evidence:** homebrew formula + install.sh default

[speakeasy.rb](https://github.com/speakeasy-api/homebrew-tap/blob/main/speakeasy.rb):

> installs the binary plus shell completion files (bash, zsh, and fish)

install.sh env:

```bash
BINARY_NAME=${BINARY_NAME:-"speakeasy"}
```

The env var is overridable (a user could rename to `spk` at install time), but the default everywhere is the full `speakeasy`. No short alias mentioned in any CLI reference doc.

**Implications:** Speakeasy matches the gh / flyctl / supabase / railway convention — full name, no short alias, but ship shell completions out-of-the-box. Shell completions are a bigger UX lever when the CLI has many subcommands — Speakeasy has `quickstart`, `run`, `auth`, `studio`, `update`, `configure`, etc., which benefit from tab-completion.

---

## Comparative matrix

| Bin ergonomics            | Mastra                                               | Speakeasy                                              |
| ------------------------- | ---------------------------------------------------- | ------------------------------------------------------ |
| Primary bin name          | `mastra`                                             | `speakeasy`                                            |
| Scaffolder bin            | `create-mastra` (separate package)                   | Not a separate bin — `speakeasy quickstart` subcommand |
| Short alias               | None                                                 | None                                                   |
| Multiple bins per package | No                                                   | No                                                     |
| Shell completions         | Not inspected (Node CLIs typically don't ship these) | Yes — bash, zsh, fish (via Homebrew)                   |
| Naming philosophy         | Full product name + `create-X` convention            | Full product name only                                 |

---

## Negative searches

- **Mastra ****`m`**** alias:** Not present in any inspected `package.json`.
- **Speakeasy ****`spk`**** alias:** Not present. Overridable via install.sh `BINARY_NAME` env var but no doc recommends it.

---

## Gaps / follow-ups

- Whether either vendor has considered shipping a short alias alongside the long one (the `open-knowledge` → `ok` pattern in the open-knowledge repo, the `ripgrep` → `rg` pattern, etc.). No public RFC or issue in either repo.
- Whether Mastra ships shell completions — not inspected. If not, that's a gap relative to Speakeasy / gh / flyctl.

