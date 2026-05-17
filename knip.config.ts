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
    'packages/app/src/lib/perf/index.ts': ['exports', 'types'],
    'packages/app/src/lib/perf/env-override.ts': ['types'],
    'packages/app/src/lib/perf/mark.ts': ['types'],
    'packages/app/src/editor/typing-burst-detector.ts': ['exports', 'types'],
    'packages/server/src/bridge-intake.ts': ['types'],
    'packages/core/src/schemas/api.type-tests.ts': ['files'],
    'packages/server/src/http/request-validation.ts': ['exports', 'types'],
    'packages/server/src/http/error-response.ts': ['exports'],
    'packages/app/src/editor/http-client.ts': ['types'],
    'biome-plugins/__fixtures__/**': ['files'],
    'scripts/compute-next-beta.mjs': ['files'],
    'scripts/compute-next-beta.test.mjs': ['files'],
    'scripts/bun-install-ci.test.mjs': ['files'],
    'docs/src/lib/share-splash.ts': ['exports', 'types'],
    'packages/app/src/components/PublishToGitHubDialog.tsx': ['types'],
    'packages/app/src/components/ShareButton.tsx': ['types'],
    'packages/app/src/components/ShareReceiveDialog.tsx': ['types'],
    'packages/app/src/lib/share/clone-controller.ts': ['types'],
    'packages/app/src/lib/share/publish-wizard.ts': ['exports', 'types'],
    'packages/app/src/lib/share/receive-flow.ts': ['types'],
    'packages/app/src/lib/share/run-share-action.ts': ['types'],
    'packages/cli/src/commands/share/owners.ts': ['types'],
    'packages/cli/src/commands/share/publish.ts': ['types'],
    'packages/desktop/src/main/url-scheme.ts': ['types'],
    'packages/desktop/src/shared/bridge-contract.ts': ['types'],
    'packages/server/src/share/git-context.ts': ['types'],
    'docs/src/app/d/[encoded]/opengraph-image.test.ts': ['files'],
    'docs/src/lib/share-splash.test.ts': ['files'],
  },
  workspaces: {
    'packages/app': {
      entry: [
        'src/**/*.test.{ts,tsx}',
        'tests/**/*.{test,e2e}.ts',
        'tests/perf/lib/*.ts',
        'tests/dom/**/*.ts',
      ],
      project: 'src/**',
      ignoreDependencies: [
        '@tailwindcss/postcss',
        '@tiptap/extension-collaboration-cursor', // transitive dependency for `y-prosemirror@1.3.7` patch
        '@hookform/resolvers', // intentionally installed but uninstantiated (resolver-less); kept for parity with agents-private and future schema-bound dialogs
        'fuzzysort', // installed by PR #361 (workspace omnibar search) ahead of the consumer wire-up; same idiom as @hookform/resolvers
        '@testing-library/jest-dom', // side-effect import (`import '@testing-library/jest-dom'`) registers matchers
        'highlight.js', // lowlight's peer dependency — never imported here directly, but lowlight's grammar registrations resolve through it
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
      entry: ['source.config.ts'],
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
