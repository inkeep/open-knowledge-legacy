import type { KnipConfig } from 'knip';

export default {
  tags: ['-lintignore'],
  ignoreDependencies: [],
  workspaces: {
    'packages/app': {
      ignoreIssues: {
        'src/components/ui/*': ['exports'],
      },
    },
  },
} satisfies KnipConfig;
