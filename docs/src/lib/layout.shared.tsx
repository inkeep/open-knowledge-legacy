import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import Image from 'next/image';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <>
          <Image src="/ok-logo.png" alt="Open Knowledge" width={24} height={24} />
          Open Knowledge
        </>
      ),
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
