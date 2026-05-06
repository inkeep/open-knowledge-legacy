export function dispatchExternalLinkClick(e: { preventDefault: () => void }, url: string): void {
  const openExternal = window.okDesktop?.shell?.openExternal;
  if (!openExternal) return;
  e.preventDefault();
  void openExternal(url);
}
