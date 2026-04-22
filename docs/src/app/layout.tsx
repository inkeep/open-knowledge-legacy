import { RootProvider } from 'fumadocs-ui/provider/next';
import type { Metadata } from 'next';
import { DM_Sans } from 'next/font/google';
import './global.css';

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Open Knowledge',
  description: 'An agent-native knowledge platform where humans and AI co-create.',
  icons: {
    icon: '/ok-logo.png',
    apple: '/ok-logo.png',
  },
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" suppressHydrationWarning className={dmSans.variable}>
      <body>
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
