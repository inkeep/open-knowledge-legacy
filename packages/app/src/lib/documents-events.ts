const DOCUMENTS_CHANGED_EVENT = 'open-knowledge:documents-changed';

export function emitDocumentsChanged(): void {
  window.dispatchEvent(new CustomEvent(DOCUMENTS_CHANGED_EVENT));
}

export function subscribeToDocumentsChanged(onChange: () => void): () => void {
  const listener = () => onChange();
  window.addEventListener(DOCUMENTS_CHANGED_EVENT, listener);
  return () => window.removeEventListener(DOCUMENTS_CHANGED_EVENT, listener);
}
