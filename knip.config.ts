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
    docs: {
      ignoreDependencies: [
        'postcss', // Bundled in Next.js
      ],
    },
    'packages/cli': {
      entry: 'scripts/*.ts',
      ignoreDependencies: [
        'ws', // looks like dynamic import isn't checked
        '@types/ws',
      ],
    },
  },
} satisfies KnipConfig;
