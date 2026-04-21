import type { KnipConfig } from 'knip';

export default {
  tags: ['-lintignore'],
  ignoreDependencies: [
    'lint-staged', // not sure if it's false positive
    'bun-types',
  ],
  ignoreIssues: {
    'packages/app/src/components/ui/*': ['exports'],
    'docs/source.config.ts': ['exports'],
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
  },
  ignoreBinaries: ['printf'],
  workspaces: {
    'packages/app': {
      entry: 'tests/**/*.{test,e2e}.ts',
      project: 'src/**',
      ignoreDependencies: [
        '@tailwindcss/postcss',
        'ws', // false positive
        '@tiptap/extension-collaboration-cursor', // transitive dependency for `y-prosemirror@1.3.7` patch
      ],
      ignoreFiles: ['src/server/agent-sim.ts'],
    },
    'packages/core': {
      entry: ['tests/**/*.ts', 'src/markdown/fixtures/perf/generate.ts'],
    },
    docs: {
      ignoreDependencies: [
        'postcss', // Bundled in Next.js
      ],
    },
    'packages/cli': {
      entry: ['scripts/*.ts', 'tests/**/*.ts'],
      ignoreDependencies: [
        'ws', // looks like dynamic import isn't checked
        '@types/ws',
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
      // Tests are standard Bun unit + integration.
      entry: [
        'src/main/index.ts',
        'src/preload/index.ts',
        'src/utility/server-entry.ts',
        'electron.vite.config.ts',
        'scripts/*.mjs',
        'tests/**/*.test.ts',
      ],
      project: 'src/**',
    },
  },
} satisfies KnipConfig;
