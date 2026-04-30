import type { KnipConfig } from 'knip';

export default {
  tags: ['-lintignore'],
  ignoreDependencies: [
    'lint-staged', // not sure if it's false positive
  ],
  ignoreIssues: {
    'packages/app/src/components/ui/*': ['exports'],
    'docs/source.config.ts': ['exports'],
    // InternalLinkOptions must be exported so tsc can emit the
    // `sharedExtensions` type without TS4023 "cannot be named" — the type
    // leaks into sharedExtensions' inferred shape via LinkFidelity.extend<>.
    // Knip can't see this usage because it's in a type-inference boundary.
    'packages/app/src/editor/extensions/internal-link.ts': ['exports', 'types'],
    '{tech-probes,reports,specs}/**': ['files'],
    // Canonical shape of the Electron bridge contract. Kept as a documentation
    // anchor per packages/core/src/index.ts — the runtime consumer is a
    // duplicated copy at packages/desktop/src/shared/bridge-contract.ts
    // (TypeScript module augmentation through workspace barrels proved
    // brittle under moduleResolution:bundler). Knip can't see this indirect
    // use because the file is only referenced by humans + tests.
    'packages/core/src/desktop-bridge.ts': ['files'],
    // Event channel map — the contract is consumed via string literals and
    // the typed IPC wrappers. Knip doesn't follow the full discriminated
    // union back to the string literals on each channel.
    'packages/desktop/src/shared/ipc-events.ts': ['files'],
    // Clone-from-GitHub dialog. Currently unmounted — NavigatorApp is the
    // only intended consumer (desktop clone flow, not yet wired). Kept
    // in-tree as the canonical clone surface so future wiring is a
    // one-line import rather than a re-implementation.
    'packages/app/src/components/CloneDialog.tsx': ['files'],
    // MDX docs pages — rendered by the Fumadocs site's file-system route
    // discovery. They're referenced from `docs/content/overview.mdx`
    // (card grid) and `docs/content/guides/meta.json` (sidebar order), but
    // knip can't follow the MDX cross-refs / meta.json include list for
    // the docs workspace's default entry discovery. Silencing the warning
    // here is the whole-workspace pattern we already use for the
    // bridge-contract + ipc-events duplicated-by-design files.
    'docs/content/guides/open-in-agent-desktop.mdx': ['files'],
    'docs/content/guides/agent-activity-panel.mdx': ['files'],
    'docs/content/guides/install-claude-cowork.mdx': ['files'],
    'docs/content/guides/assets-and-embeds.mdx': ['files'],
    'docs/content/guides/component-blocks.mdx': ['files'],
  },
  ignoreBinaries: ['printf'],
  workspaces: {
    // Co-located src/**/*.test.{ts,tsx} files: knip auto-discovers these via
    // the package's main entry (src/index.ts) only when `exports.default`
    // resolves to src/. After PR #320 made workspace deps emit conditional
    // exports with `default → dist/index.mjs`, knip walks the bundled output
    // and co-located test files become unreachable. Each workspace below
    // explicitly adds them to `entry` to restore pre-#320 reachability.
    'packages/app': {
      // Co-located src test files (post-#320 dist exports) + standalone
      // `bun`-driven perf driver (+ its scenario library). Without the perf
      // entries, knip marks `ProfilerPhase` / `ProfilerRenderEvent` types
      // "unused" because `tests/perf/*.ts` sits outside the default
      // `*.{test,e2e}.ts` scan. See `tests/perf/profile.ts` header.
      entry: [
        'src/**/*.test.{ts,tsx}',
        'tests/**/*.{test,e2e}.ts',
        'tests/integration/idb-preload.ts', // bunfig.toml `[test] preload`
        'tests/perf/profile.ts',
        'tests/perf/lib/*.ts',
      ],
      project: 'src/**',
      ignoreDependencies: [
        '@tailwindcss/postcss',
        '@tiptap/extension-collaboration-cursor', // transitive dependency for `y-prosemirror@1.3.7` patch
      ],
      ignoreFiles: ['src/server/agent-sim.ts'],
    },
    'packages/core': {
      entry: ['src/**/*.test.ts', 'tests/**/*.ts', 'src/markdown/fixtures/perf/generate.ts'],
      project: 'src/**',
    },
    docs: {
      ignoreDependencies: [
        'postcss', // Bundled in Next.js
      ],
    },
    'packages/server': {
      entry: ['src/**/*.test.ts'],
      project: 'src/**',
    },
    'packages/cli': {
      entry: ['src/**/*.test.ts', 'scripts/*.ts', 'tests/**/*.ts'],
      ignoreDependencies: [
        '@inkeep/open-knowledge-app', // the CLI's `build:assets` script runs `cp -r ../app/dist dist/public`
      ],
      ignoreFiles: [
        'src/mcp/tools.ts', // historical reference stub; live registry is src/mcp/tools/index.ts
      ],
    },
    'packages/desktop': {
      // Electron's three runtime entry points — each is a separate process,
      // bundled separately by electron-vite (see electron.vite.config.ts).
      // Without these listed, knip walks only the default entry points and
      // mis-flags every exported symbol on the import graph as unused.
      // Tests are standard Bun unit + integration — `.test.ts` and `.test.mjs`
      // (the .mjs form is used for tests that import root-level `.mjs`
      // scripts, e.g. `tests/unit/verify-keyring-driver.test.mjs` importing
      // `scripts/verify-keyring-in-packaged-dmg.mjs`; omitting the `.mjs`
      // entry makes knip mis-flag both the test AND the script it drives).
      entry: [
        'src/main/index.ts',
        'src/preload/index.ts',
        'src/utility/server-entry.ts',
        'src/**/*.test.ts',
        'electron.vite.config.ts',
        'scripts/*.mjs',
        'tests/**/*.test.ts',
        'tests/**/*.test.mjs',
      ],
      project: 'src/**',
    },
  },
} satisfies KnipConfig;
