import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { RootProvider } from 'fumadocs-ui/provider/next';
import type { ReactNode } from 'react';
import { source } from '@/lib/source';
import './global.css';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <RootProvider>
          <DocsLayout tree={source.pageTree} nav={{ title: 'Open Knowledge' }}>
            {children}
          </DocsLayout>
        </RootProvider>
      </body>
    </html>
  );
}
