import { useEffect, useState } from 'react';

/** File sidebar switches to push-mode (translate, no backdrop) below this width. */
const SIDEBAR_SHEET_BREAKPOINT = 1280;

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < SIDEBAR_SHEET_BREAKPOINT);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${SIDEBAR_SHEET_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < SIDEBAR_SHEET_BREAKPOINT);
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}
