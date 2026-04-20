import { useEffect, useState } from 'react';

const DOC_PANEL_SHEET_BREAKPOINT = 960;
const DOC_PANEL_COLLAPSE_BREAKPOINT = 1024;

type DocPanelLayout = 'panel' | 'sheet';

export function useDocPanelLayout() {
  const [layout, setLayout] = useState<DocPanelLayout>(() =>
    window.innerWidth < DOC_PANEL_SHEET_BREAKPOINT ? 'sheet' : 'panel',
  );
  const [autoCollapse, setAutoCollapse] = useState(
    () =>
      window.innerWidth >= DOC_PANEL_SHEET_BREAKPOINT &&
      window.innerWidth < DOC_PANEL_COLLAPSE_BREAKPOINT,
  );

  useEffect(() => {
    const sheetMql = window.matchMedia(`(max-width: ${DOC_PANEL_SHEET_BREAKPOINT - 1}px)`);
    const collapseMql = window.matchMedia(`(max-width: ${DOC_PANEL_COLLAPSE_BREAKPOINT - 1}px)`);

    const update = () => {
      const isSheet = sheetMql.matches;
      setLayout(isSheet ? 'sheet' : 'panel');
      setAutoCollapse(!isSheet && collapseMql.matches);
    };

    sheetMql.addEventListener('change', update);
    collapseMql.addEventListener('change', update);
    return () => {
      sheetMql.removeEventListener('change', update);
      collapseMql.removeEventListener('change', update);
    };
  }, []);

  return { layout, autoCollapse };
}
