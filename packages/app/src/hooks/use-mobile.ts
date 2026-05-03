import { useEffect, useState } from 'react';

const SIDEBAR_PUSH_BREAKPOINT = 1280;

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
