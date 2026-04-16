# Evidence: D5 — Collision mitigation patterns

**Dimension:** D5 — How do tools handle collisions, and does npm support multi-bin / aliases?
**Date:** 2026-04-16
**Sources:** npm docs, Cargo docs, Debian fd-find package docs, fd issue #1009

---

## Key sources referenced
- https://docs.npmjs.com/cli/v10/configuring-npm/package-json#bin
- https://doc.rust-lang.org/cargo/reference/cargo-targets.html
- https://github.com/sharkdp/fd/issues/1009
- https://github.com/sharkdp/bat/issues/2455
- https://packages.debian.org/sid/utils/fd-find

---

## Findings

### Finding: npm `"bin"` supports multiple commands per package
**Confidence:** CONFIRMED
**Evidence:** npm docs on the `bin` field — accepts either a string (single bin with the package name) OR an object mapping command-name → script-path. Example from npm docs:
```json
{
  "name": "@scope/my-package",
  "bin": {
    "foo": "./cli-foo.js",
    "bar": "./cli-bar.js"
  }
}
```
Both commands land in `node_modules/.bin/` (or globally on `npm install -g`).
**Implications:** `@inkeep/open-knowledge` can ship BOTH `open-knowledge` (legacy) and `ok` (new short form) during a migration window, allowing users to switch without a breaking version bump.

### Finding: Cargo supports multiple `[[bin]]` targets
**Confidence:** CONFIRMED
**Evidence:** Cargo Book — Targets — a crate can declare multiple `[[bin]] name = "..." path = "..."` entries. ripgrep uses this to ship `rg` despite package being `ripgrep`.
**Implications:** Not directly relevant to npm packaging, but reinforces that the long-package/short-binary split is a first-class concept in modern tooling.

### Finding: When PATH collides, distros rename rather than the project
**Confidence:** CONFIRMED
**Evidence:**
- `fd-find` on Debian installs `/usr/bin/fdfind` because `/usr/bin/fd` was already owned by the `fd` package (an OCaml `fd` file descriptor tool). Debian's packaging script renames the bin. Project README documents the symlink workaround.
- `bat` on Debian < 12 installed as `batcat` for similar reasons; restored to `bat` after the competing Bareos BAT was removed from Debian.
**Implications:** If `@inkeep/open-knowledge` ships `ok` and a future PATH collision arises on a specific distro, the standard playbook is (1) accept distro-side rename, (2) document symlink in README. npm doesn't have this problem because it installs to its own prefix, not `/usr/bin/`.

### Finding: No npm "fallback alias" mechanism
**Confidence:** CONFIRMED
**Evidence:** npm's `bin` is a direct map. No fallback priority, no "use X if Y taken" logic. If two globally installed packages declare the same bin name, the one installed later wins (overwrites the symlink in the npm prefix's `bin/` directory). `npm install -g` prints a warning but does not fail.
**Implications:** Realistically, the risk of shipping `ok` as a bin and having it silently clobbered by a user's earlier `ok` install is near-zero (no popular package claims the bin). But during a migration from `open-knowledge` to `ok`, shipping BOTH keeps users stable.

### Finding: Documented rename stories all survived the migration
**Confidence:** CONFIRMED
**Evidence:**
- `exa` → `eza` (forced-rename community fork after original author became inactive): successful, referenced everywhere.
- `docker-compose` → `docker compose` (absorbed into docker CLI): messy but completed.
- `fd` rename on Debian to `fdfind`: persistent confusion (issue #1009 still tracking after 4+ years), but tool is universally adopted.
**Implications:** Renames work if the community is reached where it lives (README, changelog, blog). The `fdfind` case shows that residual confusion lingers for years; best to get the name right at v1 if possible.

---

## Synthesized mitigation recipe (if user decides to adopt `ok`)
1. **Ship both bins during transition:** `"bin": { "open-knowledge": "./dist/cli.js", "ok": "./dist/cli.js" }`. Zero cost, covers muscle memory.
2. **Primary docs use `ok`:** every README example, `init` command output, MCP registration doc.
3. **One-line deprecation notice in `open-knowledge` invocation:** `[deprecated — use 'ok' instead. Both will work until v2.0]`.
4. **Do NOT rename the package:** `@inkeep/open-knowledge` stays the package name (matches ripgrep pattern). npm-registry search and SEO are preserved; only the bin is short.
5. **Update `.mcp.json` registration template in `init`** to register under `open-knowledge` (server name), invoking `ok mcp` (command).

---

## Gaps / follow-ups
- Did not investigate Homebrew-publish path for the CLI (not yet published to brew per prior reports).
- Did not investigate how `bunx @inkeep/open-knowledge` resolves bin entries when multiple are declared — the first bin field match is typically used, but worth verifying in a real smoke test.
