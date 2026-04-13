import type { KnipConfig } from 'knip';

export default {
  tags: ['-lintignore'],
  ignoreDependencies: [],
  ignoreIssues: {
    'packages/app/src/components/ui/*': ['exports'],
    'docs/source.config.ts': ['exports'],
  },
  workspaces: {
    'packages/app': {},
    docs: {
      ignoreDependencies: [
        'postcss', // Bundled in Next.js
      ],
    },
  },
} satisfies KnipConfig;
