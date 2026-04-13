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
      project: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
      ignoreDependencies: [
        'shadcn',
        'tailwind-scrollbar',
        'tailwindcss',
        'tw-animate-css',
        '@fontsource-variable/inter',
        '@fontsource-variable/jetbrains-mono',
        '@tailwindcss/postcss'
      ],
    },
    docs: {
      ignoreDependencies: [
        'postcss', // Bundled in Next.js
      ],
    },
    'packages/cli': {
      entry: 'src/cli.ts',
    },
  },
} satisfies KnipConfig;
