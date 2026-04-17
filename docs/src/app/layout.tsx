import { RootProvider } from 'fumadocs-ui/provider/next';
import type { Metadata } from 'next';
import { DM_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import './global.css';

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  icons: {
    icon: '/ok-logo.png',
    apple: '/ok-logo.png',
  },
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={dmSans.variable}>
      <body>
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
