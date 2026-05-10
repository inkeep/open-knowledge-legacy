import type { KnipConfig } from 'knip';

export default {
  tags: ['-lintignore'],
  ignoreDependencies: [
    'lint-staged', // not sure if it's false positive
    'husky',
  ],
  ignoreBinaries: ['printf'],
  ignoreIssues: {
    'packages/app/src/components/ui/*': ['exports'],
    'docs/source.config.ts': ['exports'],
    'packages/app/src/editor/extensions/internal-link.ts': ['exports', 'types'],
    'packages/app/src/editor/clipboard/serialize.ts': ['types'],
    '{tech-probes,reports,specs}/**': ['files'],
    'packages/core/src/desktop-bridge.ts': ['files'],
    'packages/desktop/src/shared/ipc-events.ts': ['files'],
    'packages/app/src/components/CloneDialog.tsx': ['files'],
    'docs/content/**/*.mdx': ['files'],
    'packages/app/src/components/McpConsentDialogBody.tsx': ['duplicates'],
    'packages/core/src/extensions/list.ts': ['duplicates'],
    'packages/desktop/src/main/auto-updater.ts': ['types'],
    'packages/core/src/schemas/api.type-tests.ts': ['files'],
    'packages/server/src/http/request-validation.ts': ['exports', 'types'],
    'packages/server/src/http/error-response.ts': ['exports'],
    'packages/app/src/editor/http-client.ts': ['types'],
  },
  workspaces: {
    'packages/app': {
      entry: ['src/**/*.test.{ts,tsx}', 'tests/**/*.{test,e2e}.ts', 'tests/perf/lib/*.ts'],
      project: 'src/**',
      ignoreDependencies: [
        '@tailwindcss/postcss',
        '@tiptap/extension-collaboration-cursor', // transitive dependency for `y-prosemirror@1.3.7` patch
        '@hookform/resolvers', // intentionally installed but uninstantiated (resolver-less); kept for parity with agents-private and future schema-bound dialogs
        'fuzzysort', // installed by PR #361 (workspace omnibar search) ahead of the consumer wire-up; same idiom as @hookform/resolvers
      ],
      ignoreFiles: ['src/server/agent-sim.ts'],
    },
    'packages/core': {
      entry: [
        'src/**/*.test.ts',
        'tests/**/*.ts',
        'src/markdown/fixtures/perf/generate.ts',
        'scripts/*.ts',
      ],
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
      ignoreFiles: ['src/mcp/tools/frontmatter-patch.ts'],
    },
    'packages/cli': {
      entry: ['src/**/*.test.ts', 'scripts/*.ts', 'tests/**/*.ts'],
      ignoreDependencies: [
        '@inkeep/open-knowledge-app', // the CLI's `build:assets` script runs `cp -r ../app/dist dist/public`
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
