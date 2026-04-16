# Markdown pipeline fixtures

Canonical fixture corpus for the markdown pipeline. Established by the
markdown-pipeline-engineering-health spec (2026-04-16) to replace two
scattered locations (`packages/app/tests/fixtures/` and
`packages/app/tests/fidelity/fixtures/`) with a single discoverable root.

## Layout

```
fixtures/
├── index.ts         — typed loader API (TypeScript)
├── commonmark/      — reserved (CommonMark examples come from npm
│                      `commonmark.json` package today; slot reserved
│                      for future inline fixtures)
├── gfm/             — GFM extension examples (tables, strikethrough,
│                      task lists, autolinks)
├── mdx/             — MDX crash-taxonomy + related fixtures
├── wiki-links/      — reserved (wiki-link fixtures, future)
├── frontmatter/     — reserved (YAML frontmatter fixtures, future)
├── ng-pinned/       — reserved (NG1-NG11 byte-identity fixtures, future)
└── perf/            — pinned synthetic corpus (100/1K/5K/10K/20K blocks)
                      + large-realistic legacy fixture (see perf/README.md)
```

## Load via the typed API

```ts
import {
  loadGfmExamples,
  loadMdxCrashTaxonomy,
  loadLargeRealistic,
  loadPerfFixture,      // pinned synthetic corpus (R1/R18)
  PERF_BLOCK_COUNTS,
  fixturePath,
} from '../../../core/src/markdown/fixtures';
```

Relative imports keep Bun's module-resolution predictable inside nested
worktrees (see CLAUDE.md "Worktree isolation" — `bun` walks upward for
workspace packages).

## Do not inline fixture data in test files

`fixtures-isolation.test.ts` scans for inline fixture content duplication.
If you find yourself pasting a multi-line markdown string into a test,
add a fixture file here instead — the test will tell you where.
