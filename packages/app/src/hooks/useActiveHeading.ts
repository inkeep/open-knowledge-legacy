import { useEffect, useRef, useState } from 'react';

export function useActiveHeading(slugs: string[], isSourceMode = false): string | undefined {
  const [activeSlug, setActiveSlug] = useState<string | undefined>(undefined);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (isSourceMode || slugs.length === 0) {
      setActiveSlug(undefined);
      return;
    }

    function compute() {
      const midY = window.innerHeight / 2;
      let scrolledPast: string | undefined; // last heading above the viewport
      let topHalf: string | undefined; // first heading visible in the top half

      for (const slug of slugs) {
        const el = document.getElementById(slug);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top < 0) {
          scrolledPast = slug;
        } else if (topHalf === undefined && top < midY) {
          topHalf = slug;
        }
      }

      setActiveSlug(topHalf ?? scrolledPast ?? slugs[0]);
    }

    function handleScroll() {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        compute();
      });
    }

    document.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    compute();

    return () => {
      document.removeEventListener('scroll', handleScroll, { capture: true });
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [slugs, isSourceMode]);

  return activeSlug;
}
