const CREATE_TOP_LEVEL_FILE_EVENT = 'open-knowledge:create-top-level-file';

export function emitCreateTopLevelFile(): void {
  window.dispatchEvent(new CustomEvent(CREATE_TOP_LEVEL_FILE_EVENT));
}

export function subscribeToCreateTopLevelFile(onRequest: () => void): () => void {
  const listener = () => onRequest();
  window.addEventListener(CREATE_TOP_LEVEL_FILE_EVENT, listener);
  return () => window.removeEventListener(CREATE_TOP_LEVEL_FILE_EVENT, listener);
}
