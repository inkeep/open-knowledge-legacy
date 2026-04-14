import { HomeLayout } from 'fumadocs-ui/layouts/home';
import type { ReactNode } from 'react';
import { baseOptions } from '@/lib/layout.shared';

export default function Layout({ children }: { children: ReactNode }) {
  const base = baseOptions();
  return (
    <HomeLayout
      {...base}
      nav={{
        ...base.nav,
        transparentMode: 'top',
      }}
    >
      {children}
    </HomeLayout>
  );
}
