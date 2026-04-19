# Evidence: D3 — Short CLI name conventions

**Dimension:** D3 — What patterns do successful 2-4 char CLIs follow?
**Date:** 2026-04-16
**Sources:** primary READMEs, Cargo.toml, Homebrew formulae, CLI design blogs

---

## Key sources referenced
- https://github.com/BurntSushi/ripgrep (Cargo.toml, README)
- https://github.com/sharkdp/fd (Cargo.toml, README, issue #1009)
- https://github.com/sharkdp/bat (README, issue #2455)
- https://github.com/chmln/sd (README — "search & displace")
- https://github.com/bootandy/dust (README — "du + rust")
- https://github.com/cli/cli (gh)
- https://formulae.brew.sh/formula/ripgrep
- https://formulae.brew.sh/formula/fd
- https://smallstep.com/blog/the-poetics-of-cli-command-names/
- https://clig.dev/
- https://www.atlassian.com/blog/it-teams/10-design-principles-for-delightful-clis

---

## Findings

### Finding: Long-package / short-binary is the dominant pattern in Rust CLI ecosystem
**Confidence:** CONFIRMED
**Evidence:**
- **ripgrep**: Cargo.toml registry name = `ripgrep`, `[[bin]] name = "rg"`. Homebrew formula name = `ripgrep`; installs binary `rg`. README headline: "ripgrep (rg)".
- **fd-find**: Cargo.toml registry name = `fd-find`, binary = `fd`. Debian distributes as package `fd-find` with executable `fdfind` (to avoid an existing `/usr/bin/fd` dependency package); README recommends a user-level symlink `ln -s $(which fdfind) ~/.local/bin/fd`.
- **bat**: single word, but Debian historically distributed as `batcat` due to collision with the Bareos BAT backup tool — collision resolved upstream in Debian 12+ (2023).

**Implications:** Package registry identity (`@inkeep/open-knowledge`) and daily-use binary (`ok`) can and should be decoupled. This is a well-worn pattern, documented in multiple Rust CLI Cargo.toml files and embraced by Homebrew/Debian packaging.

### Finding: npm's `package.json` "bin" field supports arbitrary bin names
**Confidence:** CONFIRMED
**Evidence:** npm docs on `"bin"` field — supports `{ "commandName": "./script.js" }` mapping. Does NOT require the bin name to match the package name. Scoped packages (`@scope/name`) may declare unscoped bin names (e.g., `@anthropic-ai/claude-code` installs the `claude` command).
**Implications:** Shipping `"bin": { "ok": "./dist/cli.js" }` from `@inkeep/open-knowledge` is mechanically supported and idiomatic.

### Finding: 2-char names are reserved for high-frequency tools
**Confidence:** CONFIRMED
**Evidence:** Small Step ("Poetics of CLI Command Names") — "The more niche your command, the longer its name should be. Very short names should be reserved for utilities people use all the time, like `cd`, `ls`, `rg`." Clig.dev — "Keep it short, as users will be typing it all the time. However, don't make it too short: the very shortest commands are best reserved for the common utilities used all the time."
**Implications:** `ok` (2 chars) is appropriate ONLY if the tool is expected to be used many times per shell session. For a knowledge-base CLI that might be invoked 2-5 times per day, 2 chars is aggressive. `okb` or 3-char names are more calibrated to the actual use frequency. However, "aggressive brevity" has marketing value — `gh` (GitHub CLI) is used perhaps once a day by most users yet succeeded with 2 chars because of brand strength.

### Finding: Successful short names are pronounceable or universally-known initials
**Confidence:** CONFIRMED
**Evidence:**
- Pronounceable words: `bat`, `dust`, `bun`, `zed`, `jq` (sometimes read as "jay-queue" but often spoken "jaq")
- Universally-known initials: `gh` (GitHub), `bw` (Bitwarden), `fd` (find)
- Invented / arbitrary: `jj` (Jujutsu VCS — double-j as finger-walk), `eza` (forced rename from `exa`), `hx` (Helix)
- Compounds: `dust` (du+rust), `sd` (search & displace — chmln's README explicitly defines this)
**Implications:** `ok` benefits from universal "okay" recognition — it is pronounceable AND familiar. This is a rare combination: most short CLIs are either invented words or letter-only initials.

### Finding: Docker Compose's rename precedent (`plum` → `fig` → `docker compose`)
**Confidence:** CONFIRMED
**Evidence:** Docker Compose historical note — originally "plum" (awkward to type), renamed to "fig" for smoother finger flow, eventually absorbed into `docker compose` subcommand.
**Implications:** Typability of the bigram/trigram matters. `ok` (O right-index-ish, K right-middle finger on QWERTY) flows smoothly. `okb` requires an additional stretch to B (left index crossing to right home). Neither is bad, but `ok` is more home-row.

### Finding: Collision handling patterns
**Confidence:** CONFIRMED
**Evidence:**
- **Package rename** (upstream): `fd` → package `fd-find` on crates.io and apt
- **Binary rename** (distro-level): Debian installs `fdfind` or `batcat` when `/usr/bin/<name>` is already claimed
- **Upstream fix + revert** (waiting): `bat` regained `/usr/bin/bat` on Debian 12+ after Bareos BAT was removed
- **Symlink workaround** (user-level): fd's README recommends `ln -s $(which fdfind) ~/.local/bin/fd`
- **npm has no fallback alias mechanism**: `package.json` `"bin"` is a one-to-one map. Collision must be handled out-of-band (README, post-install message).
**Implications:** For the `@inkeep/open-knowledge` case, there's no hard collision to handle — this is about choosing a clean primary name, not recovering from one.

---

## Synthesized criteria (from the survey)
1. Length justified by expected use frequency (2 chars = ~daily use per-session minimum).
2. No hard collisions on `which`, `apt search`, `brew search`, `npm view`.
3. Home-row typeable.
4. Pronounceable or known initials.
5. Distinct from parent project registry name (ripgrep/rg split).
6. No strong brand collision (the OKB/Ink.js failure modes).
7. Future-proof for sibling subcommands (e.g., `ok init`, `ok sync`, `ok watch`).
8. npm `"bin"` field carries the short name; scoped package carries the long one.

---

## Gaps / follow-ups
- Windows PowerShell naming conventions not surveyed (rubric non-goal).
