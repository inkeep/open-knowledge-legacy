import type { KnipConfig } from 'knip';

export default {
  tags: ['-lintignore'],
  ignoreDependencies: [],
  ignoreIssues: {
    'packages/app/src/components/ui/*': ['exports'],
    'docs/source.config.ts': ['exports'],
  },
  workspaces: {
    'packages/app': {
      project: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
      ignoreDependencies: [
        'shadcn',
        'tailwind-scrollbar',
        'tailwindcss',
        'tw-animate-css',
        '@fontsource-variable/inter',
        '@fontsource-variable/jetbrains-mono',
      ],
    },
    docs: {
      ignoreDependencies: [
        'postcss', // Bundled in Next.js
      ],
    },
  },
} satisfies KnipConfig;
