import type { KnipConfig } from 'knip';

export default {
  tags: ['-lintignore'],
  ignoreDependencies: [
    'lint-staged', // not sure if it's false positive
  ],
  ignoreIssues: {
    'packages/app/src/components/ui/*': ['exports'],
    'docs/source.config.ts': ['exports'],
    'packages/app/src/editor/extensions/internal-link.ts': ['exports', 'types'],
    '{tech-probes,reports,specs}/**': ['files'],
    'packages/core/src/desktop-bridge.ts': ['files'],
    'packages/desktop/src/shared/ipc-events.ts': ['files'],
    'packages/app/src/components/CloneDialog.tsx': ['files'],
    'docs/content/guides/open-in-agent-desktop.mdx': ['files'],
    'docs/content/guides/agent-activity-panel.mdx': ['files'],
    'docs/content/guides/install-claude-cowork.mdx': ['files'],
    'docs/content/guides/properties.mdx': ['files'],
    'docs/content/guides/component-blocks.mdx': ['files'],
    'docs/content/guides/assets-and-embeds.mdx': ['files'],
  },
  ignoreBinaries: ['printf'],
  workspaces: {
    'packages/app': {
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
        '@hookform/resolvers', // intentionally installed but uninstantiated (resolver-less); kept for parity with agents-private and future schema-bound dialogs
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
        'src/mcp/tools/frontmatter-patch.ts',
      ],
    },
    'packages/desktop': {
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
