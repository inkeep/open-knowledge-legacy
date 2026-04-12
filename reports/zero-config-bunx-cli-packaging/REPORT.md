---
title: "Zero-Config bunx CLI Packaging: Making open-knowledge 'Just Work' from Claude Code Desktop"
description: "How to make `bunx @inkeep/open-knowledge` a single zero-config command that starts the collaboration server, file watcher, and serves the React editor — with embedded frontend distribution, native addon portability, and Claude Code Desktop MCP integration."
createdAt: 2026-04-11
updatedAt: 2026-04-11
subjects:
  - open-knowledge
  - bunx
  - npx
  - Claude Code Desktop
  - MCP
  - Storybook
  - Prisma Studio
topics:
  - CLI packaging
  - embedded frontend
  - zero-config developer tools
  - native addon portability
---

# Zero-Config bunx CLI Packaging: Making open-knowledge "Just Work" from Claude Code Desktop

**Purpose:** Determine what's needed to make `bunx @inkeep/open-knowledge` a single zero-config command that starts the collaboration server, file watcher, and serves the React editor UI — optimized for Claude Code Desktop as the primary consumer. The reader cares about: (1) what concrete changes are needed, (2) what risks exist (especially with native addons), and (3) how the MCP integration fits together.

---

## Executive Summary

Making `bunx @inkeep/open-knowledge` "just work" requires **three small changes** and **one architectural decision**:

1. **Include the React app in the npm package** — add a build-time copy step (`cp -r ../app/dist dist/public`) and update the asset path resolution in `start.ts` to check `dist/public/` first. The React app is only 2MB; total package size would be ~8MB (comparable to Next.js, far smaller than Storybook's 20-28MB).

2. **Add a native addon fallback** — `@parcel/watcher` has a [documented bunx failure mode](https://github.com/oven-sh/bun/issues/19282) where platform binaries don't install in ephemeral contexts. Move it to `optionalDependencies` and add chokidar v4/v5 (~185KB, pure JS) as a guaranteed fallback. This is the single biggest risk to the zero-config story.

3. **Fix asset path resolution** — add `resolve(cliDir, 'public')` as the first path in `start.ts`'s asset resolution array, so bundled assets are found when running from an npm cache directory.

4. **Keep MCP stdio and `start` as separate commands** — Claude Code manages MCP server lifecycle automatically (auto-starts on session, auto-stops on close). The `start` command is for humans who want the browser UI. They serve different consumers and should remain separate processes.

**The end-to-end user flow becomes:**
- **One-time setup:** `npx @inkeep/open-knowledge init` (scaffolds `.open-knowledge/`, registers MCP in `.mcp.json`)
- **For AI agent access:** Open Claude Code Desktop → MCP tools available automatically
- **For collaborative editing:** `bunx @inkeep/open-knowledge` → server starts, open `http://localhost:1773`

**Key Findings:**

- **The architecture is already sound.** The single-command startup pattern (HTTP + WebSocket + static assets + file watcher in one process) matches industry standards (Storybook, Vite, Docusaurus).
- **Package size is a non-issue.** At ~8MB, open-knowledge is lean compared to peers. npm has no practical size constraint for CLI packages.
- **bunx and npx both handle scoped packages correctly.** `bunx @inkeep/open-knowledge` resolves the bin entry and runs `dist/cli.mjs` with no special flags needed.
- **@parcel/watcher is the only portability risk.** Every other dependency works in ephemeral install contexts. A tiered fallback eliminates this risk entirely.
- **Claude Code Desktop's MCP lifecycle is already zero-config.** Once `.mcp.json` exists, Claude Code handles everything — no manual server management.

---

## Research Rubric

| # | Dimension | Depth | Priority |
|---|-----------|-------|----------|
| D1 | Embedded frontend distribution | Deep | P0 |
| D2 | bunx vs npx ergonomics | Deep | P0 |
| D3 | Single-command server+UI startup patterns | Moderate | P0 |
| D4 | Claude Code Desktop MCP integration | Deep | P0 |
| D5 | Native addon portability (@parcel/watcher) | Moderate | P1 |
| D6 | Asset bundling build pipeline | Moderate | P1 |

**Non-goals:** Config schema design, MCP tool signatures, init scaffolding, Windows support, Docker packaging.

---

## Detailed Findings

### D1: Embedded Frontend Distribution

**Finding:** Pre-building the React app and including it in the CLI package's `dist/` directory is the industry standard pattern — and open-knowledge's app is small enough that size is irrelevant.

**Evidence:** [evidence/embedded-frontend-distribution.md](evidence/embedded-frontend-distribution.md)

[Storybook](https://storybook.js.org/) prebundles its entire manager UI inside `@storybook/core` (~28MB). [Prisma Studio](https://www.prisma.io/docs/studio/integrations/embedding) originally shipped as a CLI that served a pre-built React UI from a bundled directory — the exact pattern open-knowledge should follow. TinaCMS serves its admin UI at `http://localhost:3000/admin/index.html` from pre-built assets in the npm package.

open-knowledge's React app build is remarkably compact:
- `index-*.js`: 1.9MB (Vite-bundled React + TipTap + CodeMirror)
- `index-*.css`: 77KB (Tailwind CSS)
- `index.html` + `favicon.svg`: ~1KB
- **Total: 2MB**

Combined with the CLI dist (6.1MB), the published package would be ~8MB — comparable to `next` (8MB), far smaller than `storybook` (20MB) or `@storybook/core` (28MB).

The current `start.ts` resolves assets at monorepo-relative paths (`../../app/dist`), which breaks when installed via bunx. The fix is a one-line addition: check `resolve(cliDir, 'public')` first — this finds the bundled assets when running from an npm cache directory.

**Remaining uncertainty:** None. The pattern is proven and the implementation is straightforward.

---

### D2: bunx vs npx Ergonomics

**Finding:** Both `bunx @inkeep/open-knowledge` and `npx @inkeep/open-knowledge` work out-of-the-box with the current package configuration. bunx is ~11x faster for remote packages.

**Evidence:** [evidence/bunx-npx-ergonomics.md](evidence/bunx-npx-ergonomics.md)

The package is `@inkeep/open-knowledge` with `"bin": { "open-knowledge": "./dist/cli.mjs" }`. Both package runners resolve scoped packages to their bin entry automatically — no `--package` flag needed.

| Aspect | bunx | npx |
|--------|------|-----|
| Scoped package resolution | ✓ Automatic | ✓ Automatic |
| Version pinning | `bunx @inkeep/open-knowledge@0.2.0` | `npx @inkeep/open-knowledge@0.2.0` |
| ESM support | ✓ `"type": "module"` works | ✓ `"type": "module"` works |
| Long-running servers | ✓ Waits for process exit | ✓ Waits for process exit |
| Speed (cached) | ~100x faster | Baseline |
| Speed (remote first-run) | ~11x faster | Baseline |
| optionalDeps install | Usually works, [known issues](https://github.com/oven-sh/bun/issues/19282) | Works unless `--no-optional` |

The init command currently registers MCP with `npx` (not `bunx`) — this is the correct default because npx is available in any Node.js environment, while bunx requires Bun.

**Remaining uncertainty:** First-run download time with the ~8MB package hasn't been benchmarked. Expected to be acceptable (npm CDN is fast).

---

### D3: Single-Command Server+UI Startup Patterns

**Finding:** open-knowledge already implements the single-command pattern correctly. The architecture matches industry standards and the `start` command is the default Commander.js command.

**Evidence:** [evidence/single-command-startup-patterns.md](evidence/single-command-startup-patterns.md)

The `start` command wires up five components in a single process:
1. **Hocuspocus CRDT server** — collaboration, persistence, reconciliation
2. **HTTP server** (`node:http`) — API routes + static asset serving
3. **WebSocket server** (`ws`) — CRDT sync for `/collab` path
4. **Static asset serving** (`sirv`) — pre-built React app with SPA fallback, gzip, immutable caching
5. **File watcher** (`@parcel/watcher`) — external edit detection + reconciliation

This is leaner than peers — raw `node:http` instead of Express, `sirv` instead of full middleware, `@parcel/watcher` instead of chokidar. The `start` command is registered as the default (`{ isDefault: true }`), so `bunx @inkeep/open-knowledge` runs it directly.

The graceful shutdown handler (SIGINT/SIGTERM) works correctly for both direct execution and bunx/npx child process scenarios.

**Decision triggers:**
- Auto-port-finding (incrementing when default port is occupied) would improve resilience but isn't blocking.
- A `--quiet` flag for automation contexts (suppress banner) is a nice-to-have.

**Remaining uncertainty:** None on the startup pattern itself.

---

### D4: Claude Code Desktop MCP Integration

**Finding:** The MCP integration is already correctly implemented. Claude Code manages server lifecycle automatically — no manual steps after `.mcp.json` exists. The `start` and `mcp` commands should remain separate processes serving different consumers.

**Evidence:** [evidence/claude-code-desktop-integration.md](evidence/claude-code-desktop-integration.md)

Claude Code supports three MCP scopes:

| Scope | Stored in | Shared | Use case |
|-------|-----------|--------|----------|
| Local | `~/.claude.json` | No | Personal dev servers |
| Project | `.mcp.json` (repo root) | Yes, via VCS | Team-shared tools ← **what open-knowledge uses** |
| User | `~/.claude.json` | No | Global personal tools |

`open-knowledge init` correctly writes to `.mcp.json` (project scope). When a user opens the project in Claude Code Desktop, the MCP server auto-starts via `npx @inkeep/open-knowledge mcp`. The `.mcp.json` format is a cross-client standard — it also works with [Cursor](https://cursor.sh/), VS Code Copilot, and Amazon Q.

**Why `start` and `mcp` should stay separate:**
- **`mcp`** is agent-facing: lightweight stdio process, auto-managed by Claude Code (starts with session, stops on close).
- **`start`** is human-facing: long-lived HTTP + WebSocket server with browser UI.
- The MCP server opportunistically connects to Hocuspocus if running, but works independently for disk-only operations.
- Having `mcp` auto-start the collab server would fight the stdio lifecycle model (Claude Code kills child processes on session end — taking the server with it).

**Claude Code also supports HTTP MCP transport** (`claude mcp add --transport http <name> <url>`). This means the `start` command could serve MCP over HTTP at `/mcp` on the same port as the React app. However, this requires the server to be running first, while stdio is zero-config. The recommendation is: keep stdio as default, consider HTTP as an optional mode later.

**The zero-config dream is achievable today:**
1. Team commits `.mcp.json` to the repo (one-time, already done by `init`)
2. Developer opens Claude Code Desktop → MCP tools available automatically
3. For browser UI: run `bunx @inkeep/open-knowledge` in a terminal

**Remaining uncertainty:** Claude Code plugin marketplace listing could further reduce setup friction, but the current approach is already low-friction.

---

### D5: Native Addon Portability (@parcel/watcher)

**Finding:** `@parcel/watcher` has a documented failure mode with bunx that could break the zero-config experience. A tiered fallback to chokidar v4/v5 eliminates this risk entirely.

**Evidence:** [evidence/native-addon-portability.md](evidence/native-addon-portability.md)

`@parcel/watcher` distributes pre-built binaries via 13 platform-specific optionalDependencies (the "napi triples" pattern). Each binary is 320-550KB. The runtime resolution tries `require('@parcel/watcher-${platform}-${arch}')` and throws if no binary is found.

**The critical risk:** [oven-sh/bun#19282](https://github.com/oven-sh/bun/issues/19282) documents that `bunx @tailwindcss/cli` fails with "No prebuild or local build of @parcel/watcher found" — the same package open-knowledge depends on. The ephemeral install context doesn't always resolve platform-specific optionalDependencies.

Tools that use @parcel/watcher without a fallback (Tailwind v4, Nx) suffer from this. Tools that use chokidar (Vite, webpack, Docusaurus) don't have this problem.

**Recommended approach:**

```typescript
// In file-watcher.ts
async function createWatcher(dir, callback) {
  try {
    const { subscribe } = await import('@parcel/watcher');
    return subscribe(dir, callback);
  } catch {
    console.warn('[watcher] @parcel/watcher unavailable, falling back to chokidar');
    const { watch } = await import('chokidar');
    return watch(dir, { ignoreInitial: true });
  }
}
```

In `package.json`:
- Move `@parcel/watcher` from `dependencies` to `optionalDependencies`
- Add `chokidar` (v4 or v5) to `dependencies`

This gives @parcel/watcher's superior performance when available (most installs) while guaranteeing the CLI works in every environment.

**Decision triggers:**
- If open-knowledge is always installed via `bun install` (not bunx), the risk is lower — bun's full installer handles optionalDeps better than bunx's ephemeral context.
- If the primary distribution is `bunx`, the fallback is essential.

**Remaining uncertainty:** The exact bunx failure rate is unknown — it may depend on bun version, OS, and cache state. But the fix is cheap and the risk is real.

---

### D6: Asset Bundling Build Pipeline

**Finding:** Three changes to the build pipeline are needed: a build-time copy script, an updated `files` field, and one additional asset path in `start.ts`.

**Evidence:** [evidence/asset-bundling-build-pipeline.md](evidence/asset-bundling-build-pipeline.md)

**Current state:**
- `tsdown` bundles `core` + `server` into `dist/`, externalizes `@parcel/watcher` and `simple-git`
- `"files": ["dist"]` publishes only `dist/`
- No step builds or copies the React app

**Required changes:**

1. **Build scripts** in `packages/cli/package.json`:
```json
{
  "scripts": {
    "build:app": "cd ../app && bun run build",
    "build:cli": "tsdown",
    "build:assets": "cp -r ../app/dist dist/public",
    "build": "bun run build:app && bun run build:cli && bun run build:assets",
    "prepublishOnly": "bun run build && bun run test"
  }
}
```

2. **Asset path resolution** in `packages/cli/src/commands/start.ts`:
```typescript
const assetPaths = [
  resolve(cliDir, 'public'),           // npm install: bundled assets
  resolve(cliDir, '../../app/dist'),    // monorepo dev (from src/)
  resolve(cliDir, '../../../app/dist'), // monorepo dev (from dist/)
];
```

3. **`files` field** stays `["dist"]` — no change needed since `dist/public/` is inside `dist/`.

**Published package structure:**
```
dist/
├── cli.mjs           (6.1MB — CLI entry point + bundled core/server)
├── index.mjs          (programmatic API)
├── *.d.mts            (type declarations)
└── public/            (2MB — React app)
    ├── index.html
    ├── favicon.svg
    └── assets/
        ├── index-*.js  (1.9MB)
        └── index-*.css (77KB)
```

Verify with: `npm pack --dry-run`

**Remaining uncertainty:** None. The implementation is mechanical.

---

## Recommendations

### Immediate (required for bunx to work)

1. **Add build-time asset copy** — 3 new build scripts in CLI `package.json`
2. **Fix asset path resolution** — add `resolve(cliDir, 'public')` as first entry
3. **Add @parcel/watcher fallback** — tiered approach with chokidar v4/v5

### Near-term (improves the experience)

4. **Auto-init on first start** — if `.open-knowledge/` doesn't exist when `start` runs, auto-scaffold it (skip MCP registration in this mode). Reduces the flow to a single command.
5. **Auto-port-finding** — increment port if default is occupied, like Vite does.

### Future (optional improvements)

6. **MCP HTTP transport on `start`** — serve MCP protocol at `/mcp` alongside the React UI. Enables multi-client MCP access without a separate stdio process.
7. **Claude Code plugin** — bundle both MCP server and `start` as a plugin for fully automatic setup. Uses `.claude/launch.json` for the preview server.

---

## Limitations & Open Questions

### Dimensions Not Fully Covered
- **Windows support:** The `cp -r` build step assumes Unix. Cross-platform build scripts would need `shx` or a Node.js copy utility.
- **Docker/CI packaging:** Not investigated. The ephemeral bunx install may have different behavior in container environments.

### Out of Scope (per Rubric)
- Config schema design (already implemented)
- MCP tool signatures (covered in PR #40)
- Init scaffolding patterns (covered in `onboarding-multiproject-ux` report)

### Open Questions
- Should the `mcp` command also be able to auto-start Hocuspocus internally (embedding it in the MCP process) for environments where running a separate `start` process isn't practical?
- Should the package ship a `.claude/launch.json` template for Claude Code Desktop's preview feature?
- Is there demand for `npx @inkeep/open-knowledge` without Bun installed, or is Bun a prerequisite for the target audience?

---

## References

### Evidence Files
- [evidence/embedded-frontend-distribution.md](evidence/embedded-frontend-distribution.md) — How tools bundle pre-built frontends in npm packages
- [evidence/bunx-npx-ergonomics.md](evidence/bunx-npx-ergonomics.md) — Package runner behavior, scoped package resolution, performance
- [evidence/single-command-startup-patterns.md](evidence/single-command-startup-patterns.md) — Industry patterns for server+UI startup
- [evidence/claude-code-desktop-integration.md](evidence/claude-code-desktop-integration.md) — MCP scopes, lifecycle, transport options
- [evidence/native-addon-portability.md](evidence/native-addon-portability.md) — @parcel/watcher failure modes and fallback strategies
- [evidence/asset-bundling-build-pipeline.md](evidence/asset-bundling-build-pipeline.md) — Build orchestration for monorepo asset bundling

### External Sources
- [bunx documentation](https://bun.sh/docs/pm/bunx) — Official bunx behavior and flags
- [Claude Code MCP documentation](https://code.claude.com/docs/en/mcp) — MCP server configuration and lifecycle
- [oven-sh/bun#19282](https://github.com/oven-sh/bun/issues/19282) — bunx failure with @parcel/watcher
- [Storybook blog: bloat fixed](https://storybook.js.org/blog/storybook-bloat-fixed/) — Storybook's approach to package size
- [Prisma Studio embedding](https://www.prisma.io/docs/studio/integrations/embedding) — Prisma's evolution from CLI-served to embeddable UI
- [MCP Transports specification](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports) — stdio vs HTTP transport tradeoffs

### Related Research
- [reports/npm-global-cli-packaging/](../npm-global-cli-packaging/) — Prior report on CLI packaging architecture (Commander.js, config, monorepo publishing)
- [reports/onboarding-multiproject-ux/](../onboarding-multiproject-ux/) — Init scaffolding, multi-project switching, agent context loading
