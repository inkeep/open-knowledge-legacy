# Evidence: Monorepo Publishing Patterns

**Dimension:** Monorepo publishing patterns
**Date:** 2026-04-08
**Sources:** Next.js, tiptap, Effect-TS, Yarn Berry, create-t3-app, tsup monorepo structures; @changesets/cli docs; npm registry

---

## Key files / pages referenced

- Next.js `packages/create-next-app/package.json` — workspace publish pattern
- tiptap `packages/` — 50+ packages with changesets
- @changesets/cli documentation — three-step versioning flow
- npm registry search for `open-knowledge` — name taken (v0.1.0, 2018)
- npm lifecycle scripts documentation — prepublishOnly vs prepack

---

## Findings

### Finding: Publish directly from a workspace (Option A) is the simplest starting path
**Confidence:** CONFIRMED
**Evidence:** create-next-app, create-t3-app, tsup all publish from workspace subdirectories

Rename `init_spike/` or just change its `name` field, add `bin`/`files`/`exports`, remove `private: true`, and publish. No restructuring needed.

### Finding: `packages/` restructuring is premature — server and editor are tightly coupled
**Confidence:** INFERRED
**Evidence:** Server code imports from `../editor/extensions/frontmatter` and `../editor/extensions/shared`

Splitting into `packages/cli`, `packages/editor`, `packages/server` requires extracting shared code first. Only one package needs publishing now. Restructure when a second publishable package is needed.

### Finding: `@open-knowledge` npm scope is available — `open-knowledge` unscoped name is taken
**Confidence:** CONFIRMED
**Evidence:** npm registry

`open-knowledge` (v0.1.0, 2018) is taken. The `@open-knowledge` scope is unclaimed. Register the npm org to claim the scope.

Scoped package with unscoped command:
```json
{
  "name": "@open-knowledge/cli",
  "bin": { "open-knowledge": "./dist/cli.js" }
}
```

Users: `npx @open-knowledge/cli` or `npm i -g @open-knowledge/cli && open-knowledge start`.

### Finding: Manual `npm publish` is sufficient — adopt changesets when complexity warrants it
**Confidence:** CONFIRMED
**Evidence:** Changesets adoption patterns

Changesets shine with multiple packages (tiptap: 50+, Effect-TS: 30+) and CI automation. For one package with one maintainer, manual publish is simpler. Migration to changesets is trivial later (`npx changeset init`).

### Finding: `prepublishOnly` is the correct lifecycle hook for build + test gates
**Confidence:** CONFIRMED
**Evidence:** create-next-app, tsup, concurrently all use `prepublishOnly`

`prepublishOnly` runs ONLY before `npm publish` (not on `npm install`). Pattern: `"prepublishOnly": "bun run build && bun run test"`.

### Finding: `npm pack` is the best local testing method — tests the exact published artifact
**Confidence:** CONFIRMED
**Evidence:** npm documentation

```bash
npm pack                     # creates .tgz
npm pack --dry-run           # lists files without creating archive
cd /tmp && npm install /path/to/pkg.tgz  # test install
```

Also: `npx .` runs the bin from current directory. `bun run src/cli.ts` runs source directly without building.

### Finding: `publishConfig.access: "public"` avoids needing `--access public` on every publish
**Confidence:** CONFIRMED
**Evidence:** npm docs, common pattern in scoped packages

```json
{
  "publishConfig": { "access": "public" }
}
```

Scoped packages are private by default on npm. This field makes it public permanently.

---

## Gaps / follow-ups

* Root package.json should add `"workspaces": ["init_spike", "docs"]` for proper workspace resolution
