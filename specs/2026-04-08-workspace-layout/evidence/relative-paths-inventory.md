---
name: Relative path inventory in init_spike
description: All `../../`-style paths in init_spike source, tests, and docs — verified for migration safety
sources:
  - init_spike/src/server/persistence.ts
  - init_spike/src/server/hocuspocus-plugin.ts
  - init_spike/src/server/persistence.test.ts
  - init_spike/tests/e2e/sync.spec.ts
  - init_spike/tests/e2e/qa-scenarios.spec.ts
  - init_spike/src/editor/plugins/flash-shared.ts
  - init_spike/CLAUDE.md
confidence: HIGH
---

# Relative path inventory — migration safety audit

## Summary

Every `../../`-style path in init_spike resolves relative to a file inside the `init_spike/` tree. None of them reach across into sibling directories at the repo root (no imports from `../reports`, `../specs`, `../docs`, `../meta`, `../evidence` — verified via grep, zero matches).

**Migration implication:** The package root can move anywhere (`init_spike/` → `packages/<name>/`) and the `../../`-style paths continue to work **as long as the folder structure above `src/` is preserved inside the package**. Since the migration only renames the package directory (everything inside stays the same), relative paths are invariant.

## Runtime code paths

### `src/server/persistence.ts`

```ts
// Line 25
const CONTENT_DIR = resolve(import.meta.dirname, '../../content');

// Line 26
const PROJECT_DIR = resolve(import.meta.dirname, '../..');

// Line 51
const tmpIndex = resolve(PROJECT_DIR, '.git/index-wip');
```

- **From:** `init_spike/src/server/persistence.ts`
- **CONTENT_DIR resolves to:** `init_spike/content/`
- **PROJECT_DIR resolves to:** `init_spike/` (the package root)
- **Line 51:** expects `init_spike/.git/index-wip` — but `init_spike/` has **no `.git/`**. The actual `.git/` lives at `open-knowledge/.git/`. This is a **latent bug** — either unreachable code or it silently fails.
- **Post-migration:** After moving to `packages/editor/src/server/persistence.ts`, `../..` resolves to `packages/editor/` — same invariant, still no `.git/`. **Net change: zero.** The latent bug neither heals nor worsens. See D10/R3/NG6 — out of scope for this migration.

### `src/server/hocuspocus-plugin.ts`

```ts
// Lines 30-32
const CONTENT_DIR = resolve(
  import.meta.dirname,
  '../../content',
);

// Line 405 (test reset endpoint)
writeFileSync(resolve(CONTENT_DIR, 'test-doc.md'), '', 'utf-8');
```

- Resolves to `init_spike/content/test-doc.md` today, `packages/editor/content/test-doc.md` after migration
- Also written to gitignore (`.gitignore:16`)

### `src/editor/plugins/flash-shared.ts`

```ts
// Line 5
import type { ActivityEntry } from '../../presence/identity';
```

- Intra-package import: `init_spike/src/editor/plugins/flash-shared.ts` → `init_spike/src/presence/identity.ts`
- **Fully internal to the package.** Unchanged by migration.

## Test paths

### `src/server/persistence.test.ts`

```ts
// Line 7
const CONTENT_DIR = resolve(import.meta.dirname, '../../content');

// Line 12
expect(result).toBe(resolve(CONTENT_DIR, 'test-doc.md'));

// Line 24
expect(() => safeContentPath('../../package.json')).toThrow('Invalid document name');
```

- Line 7: same pattern as runtime code, same migration safety
- Line 24: test asserts that a `../../package.json` path is rejected by `safeContentPath` — this is input validation, not a real path read. No migration concern.

### `tests/e2e/sync.spec.ts`

```ts
// Line 17
const CONTENT_DIR = resolve(__dirname, '../../content');
```

- From `init_spike/tests/e2e/sync.spec.ts`, `../..` = `init_spike/`, then `content/` = fixture dir
- Post-migration: `packages/editor/tests/e2e/` → `../..` = `packages/editor/`, still correct

### `tests/e2e/qa-scenarios.spec.ts`

```ts
// Line 16
const CONTENT_DIR = resolve(__dirname, '../../content');
```

- Same pattern as sync.spec.ts

## Documentation path refs (CLAUDE.md)

```markdown
# init_spike/CLAUDE.md lines 45, 141-148

- The research reports in `../../reports/` have deep analysis — read them when the spec references them.

## Research references

If you hit a wall, check these reports for context:
- `../../reports/source-toggle-architecture/` — source toggle options
- `../../reports/peritext-on-yjs-feasibility/` — Yjs v14 delta protocol
- `../../reports/markdown-roundtrip-fidelity-tiptap/` — round-trip fix recipes
- `../../reports/crdt-mcp-filesystem-bridge/` — file watcher + persistence
- `../../reports/yjs-dual-key-shimmer-analysis/` — shimmer prevention analysis
- `../../reports/parcel-watcher-crdt-disk-bridge/` — @parcel/watcher for disk bridge
- `../../specs/2026-04-07-bidirectional-observer-sync/SPEC.md` — bidirectional observer sync spec
- `../../specs/2026-04-08-presence-awareness-ux/SPEC.md` — presence & awareness UX spec (S5 v0)
```

- **These are markdown doc links, not runtime imports.**
- From `init_spike/CLAUDE.md`, `../../reports/` = `open-knowledge/reports/` (root of repo). Works today.
- **Post-migration options:**
  - **Option A (D6/D7):** Content migrates to root `open-knowledge/AGENTS.md`. Links rewrite from `../../reports/` to `./reports/` (root-relative). Mechanical.
  - **Option B:** Keep a `packages/editor/README.md` with these links. From `packages/editor/`, `../../reports/` resolves to `open-knowledge/reports/` — still correct, no rewrite needed.
- **D6 decision (open for user confirmation):** Root AGENTS.md + symlink is canonical. Fold content in, rewrite links to `./reports/`. Drop `init_spike/CLAUDE.md` as standalone file.

## Other references in CLAUDE.md

```markdown
- Check `~/.claude/oss-repos/` for local copies of key repos (yjs, y-prosemirror, tiptap, hocuspocus, y-codemirror.next, etc.)
```

- Home-absolute path (`~/.claude/oss-repos/`) — unchanged by migration.

## Imports from sibling directories: zero

Verified via grep on `init_spike/src/` and `init_spike/tests/` for patterns `../(reports|specs|docs|meta|evidence)`:
- **Result: no matches**

Verified reverse — grep on `docs/src/` for imports from `init_spike/`:
- **Result: no matches**

Verified on `init_spike/src/` for imports from `../docs`:
- **Result: no matches**

## Verdict

Runtime code is migration-invariant. Only markdown doc links and CI/tooling path strings need mechanical updates. No runtime file-system reads break.
