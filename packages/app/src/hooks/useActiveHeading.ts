import { useEffect, useRef, useState } from 'react';

/**
 * Tracks which heading is currently "active" based on scroll position.
 *
 * Uses a capturing scroll listener on document to catch scrolling inside any
 * container (including the editor's inner overflow-y-auto div). A heading is
 * active when it is the last one whose top edge has scrolled past the viewport
 * top (top <= 0). When nothing has scrolled past yet the first heading is used
 * as the default, so the top heading is always highlighted at the top of the page.
 *
 * Requires heading DOM elements to have `id` attributes matching the slugs,
 * which the HeadingAnchors TipTap extension provides.
 *
 * Disabled (returns undefined) in source mode since CodeMirror headings
 * don't have real DOM id attributes.
 */
export function useActiveHeading(slugs: string[], isSourceMode = false): string | undefined {
  const [activeSlug, setActiveSlug] = useState<string | undefined>(undefined);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (isSourceMode || slugs.length === 0) {
      setActiveSlug(undefined);
      return;
    }

    function compute() {
      let result: string | undefined;

      for (const slug of slugs) {
        const el = document.getElementById(slug);
        if (!el) continue;
        // Active = last heading whose top has scrolled past the viewport top.
        // 1px tolerance handles sub-pixel rounding.
        if (el.getBoundingClientRect().top <= 1) {
          result = slug;
        }
      }

      // Nothing scrolled past yet (top of page) — default to the first heading.
      if (result === undefined) {
        result = slugs[0];
      }

      setActiveSlug(result);
    }

    function handleScroll() {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        compute();
      });
    }

    // capture: true catches scroll events from any element, including the
    // editor's inner overflow-y-auto container
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
