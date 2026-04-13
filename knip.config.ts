import type { KnipConfig } from 'knip';

export default {
  tags: ['-lintignore'],
  ignoreDependencies: [
    'lint-staged', // not sure if it's false positive
  ],
  ignore: ['tech-probes/**', 'reports/**', 'specs/**'],
  ignoreIssues: {
    'packages/app/src/components/ui/*': ['exports'],
    'docs/source.config.ts': ['exports'],
  },
  workspaces: {
    'packages/app': {
      entry: 'tests/**/*.{test,e2e}.ts',
      project: 'src/**',
      ignoreDependencies: [
        '@tailwindcss/postcss',
        'ws' // false positive
      ],
      ignoreFiles: ['src/server/agent-sim.ts'],
    },
    docs: {
      ignoreDependencies: [
        'postcss', // Bundled in Next.js
      ],
    },
    'packages/cli': {
      ignoreDependencies: [
        'ws', // looks like dynamic import isn't checked
      ],
    },
  },
} satisfies KnipConfig;
