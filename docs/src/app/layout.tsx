import { RootProvider } from 'fumadocs-ui/provider/next';
import { DM_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import './global.css';

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
});

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={dmSans.variable}>
      <body>
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
