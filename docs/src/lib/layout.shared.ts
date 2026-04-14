import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: 'Open Knowledge',
    },
    links: [
      {
        text: 'Docs',
        url: '/docs',
      },
      {
        text: 'GitHub',
        url: 'https://github.com/inkeep/open-knowledge',
        external: true,
      },
    ],
  };
}
