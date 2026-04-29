type DocPanelTab = 'outline' | 'backlinks' | 'forward-links' | 'graph';

const DOC_PANEL_TAB_EVENT = 'open-knowledge:doc-panel-tab';
let pendingRequestedTab: DocPanelTab | null = null;

interface DocPanelTabDetail {
  tab: DocPanelTab;
}

export function consumePendingDocPanelTabRequest(): DocPanelTab | null {
  const next = pendingRequestedTab;
  pendingRequestedTab = null;
  return next;
}

export function requestDocPanelTab(
  tab: DocPanelTab,
  target: Pick<Window, 'dispatchEvent'> | EventTarget = typeof window === 'undefined'
    ? new EventTarget()
    : window,
): void {
  pendingRequestedTab = tab;
  target.dispatchEvent(
    new CustomEvent<DocPanelTabDetail>(DOC_PANEL_TAB_EVENT, {
      detail: { tab },
    }),
  );
}

export function subscribeToDocPanelTabRequests(
  onRequest: (tab: DocPanelTab) => void,
  target: Pick<Window, 'addEventListener' | 'removeEventListener'> | EventTarget = typeof window ===
  'undefined'
    ? new EventTarget()
    : window,
): () => void {
  const listener = (event: Event) => {
    const tab =
      event instanceof CustomEvent
        ? (event as CustomEvent<DocPanelTabDetail>).detail?.tab
        : undefined;
    if (tab) onRequest(tab);
  };
  target.addEventListener(DOC_PANEL_TAB_EVENT, listener as EventListener);
  return () => target.removeEventListener(DOC_PANEL_TAB_EVENT, listener as EventListener);
}
