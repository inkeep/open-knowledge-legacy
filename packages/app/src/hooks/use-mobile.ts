import { useEffect, useState } from 'react';

/** File sidebar switches to push-mode (translate, no backdrop) below this width. */
const SIDEBAR_PUSH_BREAKPOINT = 1280;

/**
 * Reactive boolean: true when the viewport is narrower than the sidebar's
 * push-mode breakpoint (1280px).
 *
 * The "Mobile" name is historical (shadcn convention) and now misleading —
 * 1280px catches laptops in narrow windows, split-screen setups, and small
 * external displays, not just phones/touch devices. Read this hook as
 * "is the sidebar in push-mode?" rather than "is this a mobile device?".
 *
 * Sole consumer today is `Sidebar` / `SidebarProvider` / `SidebarInset` in
 * `components/ui/sidebar.tsx`. The hook's narrow blast radius is why the
 * file/symbol names weren't renamed alongside `SIDEBAR_PUSH_BREAKPOINT`.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < SIDEBAR_PUSH_BREAKPOINT);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${SIDEBAR_PUSH_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < SIDEBAR_PUSH_BREAKPOINT);
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}
