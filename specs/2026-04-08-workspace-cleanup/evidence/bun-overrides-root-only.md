---
name: Bun overrides are root-only — dead config in packages/app
description: Verification that bun ignores `overrides` in workspace child package.json. The child override in packages/app is inert but current lockfile shows no manifest bug — bun's solver already reconciled codemirror to single versions.
sources:
  - https://bun.sh/docs/install/overrides
  - https://github.com/npm/cli/issues/4517
  - packages/app/package.json:62-65
  - bun.lock (canonical resolution grep)
confidence: CONFIRMED
---

# Bun overrides: root-only, child overrides silently ignored

## Bun's docs (primary source)

From [bun.sh/docs/install/overrides](https://bun.sh/docs/install/overrides):

> Bun supports npm's `"overrides"` and Yarn's `"resolutions"` in `package.json`. These are mechanisms for specifying a version range for *metadependencies*—the dependencies of your dependencies.
>
> **Note:** Bun currently only supports top-level `"overrides"`. [Nested overrides](https://docs.npmjs.com/cli/v9/configuring-npm/package-json#overrides) are not supported.

## npm convention (load-bearing citation)

Bun aims for npm compat. The authoritative citation for "overrides are root-only in workspaces" is [npm/cli#4517 — "Document that overrides are only considered when in the root package.json"](https://github.com/npm/cli/issues/4517). The community consensus (verified via WebSearch this session): **"In a monorepo with workspaces, overrides may only be defined in the project root package.json. Overrides within workspace package.json files are ignored."**

## The shipped state in open-knowledge

`packages/app/package.json:62-65` (baseline `1ec2e23`):

```json
"overrides": {
  "@codemirror/state": "$@codemirror/state",
  "@codemirror/view": "$@codemirror/view"
}
```

This is a workspace child, not the root. Per the references above, bun ignores this block entirely. The override is **inert** — it exists but has no effect on dependency resolution.

## Current lockfile state (no manifest bug)

**Important correction from earlier draft:** The earlier draft claimed the root `bun.lock` showed "duplicate resolved versions" of `@codemirror/state` based on this grep:

```bash
# WRONG — extracts transitive dep range declarations, not resolved versions
grep -o '"@codemirror/state": "[^"]*"' bun.lock | sort -u
```

That methodology is incorrect. The lines it extracts (e.g., `"@codemirror/state": "^6.0.0"`, `"@codemirror/state": "^6.6.0"`) are **dep range declarations inside transitive packages' dependency metadata** — e.g., `@codemirror/language` declares `"@codemirror/state": "^6.0.0"` in its own `dependencies` block as a peer range. These are not resolved installations; they're the ranges bun's solver had to reconcile.

The **canonical resolution grep** (matching the lockfile's resolved package entries):

```bash
grep -E '^\s+"@codemirror/state":\s*\[' bun.lock
```

returns exactly **one line**:

```
"@codemirror/state": ["@codemirror/state@6.6.0", "", { ... }, "sha512-..."]
```

Same for `@codemirror/view`:

```bash
grep -E '^\s+"@codemirror/view":\s*\[' bun.lock
```

returns exactly **one line**:

```
"@codemirror/view": ["@codemirror/view@6.41.0", "", { ... }, "sha512-..."]
```

**Bun's solver reconciled all 7 distinct `@codemirror/view` range declarations** (`^6.0.0`, `^6.17.0`, `^6.23.0`, `^6.27.0`, `^6.35.0`, `^6.37.0`, `^6.41.0`) **to a single resolved version**. The child-level `packages/app` override contributed nothing to this — it's been ignored the whole time.

If the methodology of counting distinct range declarations were valid, `@codemirror/view` would be "7x duplicated" today. It isn't. It's one copy.

## What's still worth fixing

The override is dead code in the wrong place. Moving it to root is valid for two reasons:

1. **Correct location per bun/npm convention.** Root is where overrides belong.
2. **Latent-defect prevention.** If a future dep pulls in a codemirror range the solver can't reconcile to a single version, a working root-level override catches it. The current dead override would not — a debugging dead-end waiting to happen.

But this is **dead-config cleanup**, not a bug fix:
- No current CRDT sync failure
- No silent y-codemirror.next StateField binding bug
- No source-mode editor desync
- The source-mode editor works today; the lockfile proves it

## Fix: move to root + add hoist anchors

```json
// Root package.json
"devDependencies": {
  "@codemirror/state": "^6.6.0",
  "@codemirror/view": "^6.41.0",
  ...
},
"overrides": {
  "@codemirror/state": "$@codemirror/state",
  "@codemirror/view": "$@codemirror/view"
}
```

Remove the `overrides` block from `packages/app/package.json`.

### Why hoist anchors

The `$@codemirror/state` syntax is bun/npm's "defer to the top-level direct dep" — it says "use whichever version the root workspace's `dependencies` or `devDependencies` resolves." Bun docs don't explicitly document this syntax for root-level overrides when the root has no direct codemirror dep. To eliminate the uncertainty, add the packages to root `devDependencies` as hoist anchors. This gives the deferral syntax something to defer to and makes the semantics definitionally work.

Version ranges come from `packages/app/package.json:19-20`.

### Alternative (fallback if hoist anchors have unintended effects)

Replace `$` syntax with concrete version pins:

```json
"overrides": {
  "@codemirror/state": "^6.6.0",
  "@codemirror/view": "^6.41.0"
}
```

Downside: stale pins. When `packages/app` bumps codemirror, the root override has to be manually updated. Hoist anchors track automatically.

### Verification post-install

```bash
rm -rf node_modules bun.lock
bun install
grep -E '^\s+"@codemirror/state":\s*\[' bun.lock   # → expect one line
grep -E '^\s+"@codemirror/view":\s*\[' bun.lock    # → expect one line
```

Both should already return one line today; the fix is positional (correct location) + preventive, not curative.
