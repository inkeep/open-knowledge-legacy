import type { KnipConfig } from 'knip';

export default {
  tags: ['-lintignore'],
  ignoreDependencies: [

  ],
  ignoreIssues: {
    'packages/app/src/components/ui/*': ['exports'],
  },
} satisfies KnipConfig;
