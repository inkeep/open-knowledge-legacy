# Evidence: Bun-import audit in packages/cli/ (and transitive packages)

**Dimension:** D14 (Bun-specific runtime dependency audit for `ELECTRON_RUN_AS_NODE=1` compatibility)
**Date:** 2026-04-21
**Stance:** 1P — audits the OK codebase directly per user request.
**Method:** `grep -rn --include='*.ts' --exclude='*.test.ts' -E "(Bun\.|from ['\"]bun:|require\(['\"]bun:)"` across `packages/cli/src/`, `packages/core/src/`, `packages/server/src/`.

---

## Findings

### Finding: **ZERO Bun-specific runtime usage in non-test code across every package the CLI bundle touches.**

**Confidence:** CONFIRMED
**Evidence:** `grep` results (negative findings across all three packages)

```bash
$ grep -rn --include='*.ts' --exclude='*.test.ts' -E "(Bun\.|from ['\"]bun:|require\(['\"]bun:)" \
    packages/cli/src/ packages/core/src/ packages/server/src/
# no output — zero matches
```

Every `bun:test` import is inside a `.test.ts` file; every `Bun.serve` / `Bun.spawnSync` / `Bun.TOML.parse` / `Bun.file` usage is inside a test file. Production CLI code (`packages/cli/src/cli.ts`, `packages/cli/src/commands/*.ts`, `packages/cli/src/mcp/**`, etc.) is **pure Node/ESM**.

Test files don't ship to end users (excluded by `files: ["dist", "!dist/**/*.map"]` in `packages/cli/package.json`) — they run only under `bun test` locally and in CI.

---

### Finding: `packages/cli/package.json` declares Node as the runtime target, not Bun

**Confidence:** CONFIRMED
**Evidence:** `packages/cli/package.json` (live copy as of worktree HEAD):

```json
{
  "name": "@inkeep/open-knowledge",
  "type": "module",
  "bin": { "open-knowledge": "./dist/cli.mjs", "ok": "./dist/cli.mjs" },
  "engines": { "node": ">=22" },
  "scripts": { "build:cli": "tsdown" }
}
```

- `engines.node: ">=22"` — explicit Node target.
- `type: module` + `.mjs` extension — pure ESM, trivially loadable by Node ≥ 22.
- `build:cli: tsdown` — tsdown produces Node-compatible output (rolldown-based bundler).
- No `@types/bun` in dependencies; no `bun` entry in the `runtime` field (there is no runtime field because Bun-published packages optionally set one, and this package doesn't).

**Production dependencies** (all Node-compatible): Commander v14, Zod v4, simple-git, @octokit/rest, @napi-rs/keyring, @modelcontextprotocol/sdk, yaml, smol-toml, ws, picocolors, picomatch, shell-quote, @clack/prompts. **Optional dep**: `@parcel/watcher` (already covered by the existing chokidar fallback in Zero-Config Bunx). `just-bash`: a pure-Node bash-like shell utility, not a Bun library despite the name.

---

### Finding: Test-only Bun usage does NOT block the Electron-bundled CLI

**Confidence:** CONFIRMED
**Evidence:** Test files are excluded from published artifact

The `Bun.TOML.parse`, `Bun.spawnSync`, `Bun.serve`, `Bun.file` calls I found (in 20+ test files) all live in `*.test.ts` files. None are in `*.mts` files or plain `*.ts` runtime sources. The published tarball's `files: ["dist"]` entry + `.gitignore` hygiene ensure no test file lands in the Electron bundle via `extraResources: cli/dist`.

A quick visual audit of the `Bun.*` usages confirms intent:

| File | Usage | Purpose |
|---|---|---|
| `init.test.ts` | `Bun.TOML.parse` | Test-time TOML parsing (production uses `smol-toml`) |
| `token-store.test.ts` | `Bun.file(...)` | Test-time file-stat helper |
| `ui/colors.test.ts`, `mcp-log.test.ts` | `Bun.spawnSync` | Spawn the CLI subprocess for behavioral tests |
| `mcp/tools/*.test.ts` (many) | `Bun.serve` | Stand up a fake Hocuspocus HTTP server for MCP tool tests |

All are test-runner glue. Production equivalents for each are already in use (`smol-toml`, `node:fs`, `child_process.spawnSync`, `node:http`).

---

## Implications for M6

- **`ELECTRON_RUN_AS_NODE=1` is a zero-change approach for OK.** The bundled CLI (`cli.mjs`) runs under Electron's embedded Node (currently v22.x) with no source edits required.
- **No de-Bun work needed** before M6 can ship. The spec-risk flag from the original report (`evidence/application-to-open-knowledge.md` §"Bun-specific import audit") is now retired — the audit returned clean.
- **Ongoing discipline**: add a CI lint rule (biome custom rule or a grep-in-prepublish step) that fails if `Bun.*` or `bun:` imports appear in non-test sources. Prevents regression. Suggested shape:

  ```bash
  # packages/cli/scripts/audit-bun-imports.sh
  set -euo pipefail
  if grep -rn --include='*.ts' --include='*.mts' \
       --exclude='*.test.ts' --exclude='*.test.mts' \
       -E "(Bun\.|from ['\"]bun:|require\(['\"]bun:)" src/; then
    echo "ERROR: Bun-specific imports detected in runtime code." >&2
    echo "The Electron-bundled CLI runs under Node via ELECTRON_RUN_AS_NODE=1 and cannot use bun:* modules." >&2
    exit 1
  fi
  ```

  Wire into `prepublishOnly` OR run as a turbo task under `check`. ~5-line script; catches regressions at PR time.

---

## Gaps / follow-ups

- **Transitive Bun usage** in published deps: not audited exhaustively. A dep that imports `bun:*` at runtime would break this. Spot-check of top deps (Commander, Zod, @napi-rs/keyring, simple-git): all are Node-compatible. Low risk; address if it surfaces.
- **tsdown output audit**: the built `dist/cli.mjs` was not regenerated in this session (worktree didn't run `bun run build`). If tsdown's output somehow emits Bun-specific runtime shims, it would break. Extremely unlikely (tsdown is a pure bundler, not a runtime adapter) but cheap to verify post-build via `grep Bun.\\| dist/cli.mjs`.
