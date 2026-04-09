import { useEffect, useRef, useState } from 'react';
import { getProvider } from '@/client/provider';
import { applyMarkdownToDoc, serializeDocToMarkdown } from './markdown';

function readMode(meta: ReturnType<ReturnType<typeof getProvider>['document']['getMap']>): string {
  const mode = meta.get('fileMode');
  return typeof mode === 'string' ? mode : 'editable';
}

function readConflict(
  meta: ReturnType<ReturnType<typeof getProvider>['document']['getMap']>,
): string {
  const conflict = meta.get('syncConflict');
  return typeof conflict === 'string' ? conflict : '';
}

function readSourceOnly(
  meta: ReturnType<ReturnType<typeof getProvider>['document']['getMap']>,
): string {
  const raw = meta.get('rawSource');
  return typeof raw === 'string' ? raw : '';
}

export function SourceEditor() {
  const provider = getProvider();
  const doc = provider.document;
  const xmlFragment = doc.getXmlFragment('default');
  const meta = doc.getMap('metadata');

  const [fileMode, setFileMode] = useState(() => readMode(meta));
  const [conflict, setConflict] = useState(() => readConflict(meta));
  const [draft, setDraft] = useState(() =>
    readMode(meta) === 'source-only'
      ? readSourceOnly(meta)
      : serializeDocToMarkdown(doc, xmlFragment),
  );
  const [baseMarkdown, setBaseMarkdown] = useState(() =>
    readMode(meta) === 'source-only'
      ? readSourceOnly(meta)
      : serializeDocToMarkdown(doc, xmlFragment),
  );
  const [applyError, setApplyError] = useState('');
  const baseMarkdownRef = useRef(baseMarkdown);

  const isDirty = draft !== baseMarkdown;
  const isEditable = fileMode === 'editable';

  useEffect(() => {
    baseMarkdownRef.current = baseMarkdown;
  }, [baseMarkdown]);

  useEffect(() => {
    const refresh = () => {
      const nextMode = readMode(meta);
      const nextConflict = readConflict(meta);
      const nextBase =
        nextMode === 'source-only'
          ? readSourceOnly(meta)
          : serializeDocToMarkdown(doc, xmlFragment);

      setFileMode(nextMode);
      setConflict(nextConflict);
      setBaseMarkdown(nextBase);
      setDraft((current) => (current === baseMarkdownRef.current ? nextBase : current));
    };

    refresh();

    const handleMeta = () => refresh();
    const handleFragment = () => refresh();
    meta.observe(handleMeta);
    xmlFragment.observeDeep(handleFragment);

    return () => {
      meta.unobserve(handleMeta);
      xmlFragment.unobserveDeep(handleFragment);
    };
  }, [doc, meta, xmlFragment]);

  const reloadFromCanonical = () => {
    const nextBase =
      fileMode === 'source-only' ? readSourceOnly(meta) : serializeDocToMarkdown(doc, xmlFragment);
    setBaseMarkdown(nextBase);
    setDraft(nextBase);
    setApplyError('');
  };

  const applyDraft = () => {
    if (!isEditable || conflict) return;

    try {
      doc.transact(() => applyMarkdownToDoc(doc, xmlFragment, draft), 'source-apply');
      const nextBase = serializeDocToMarkdown(doc, xmlFragment);
      setBaseMarkdown(nextBase);
      setDraft(nextBase);
      setApplyError('');
    } catch (error) {
      setApplyError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="source-editor h-full flex flex-col">
      <div className="px-3 py-2 border-b border-border text-xs text-muted-foreground flex items-center justify-between gap-3">
        <span>
          {fileMode === 'editable' ? 'Local markdown draft' : 'Source-only file'}
          {isDirty ? ' · unsaved draft' : ''}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="px-2 py-1 border border-border rounded disabled:opacity-50"
            onClick={reloadFromCanonical}
            disabled={!isDirty}
          >
            Reload
          </button>
          <button
            type="button"
            className="px-2 py-1 border border-border rounded disabled:opacity-50"
            onClick={applyDraft}
            disabled={!isEditable || !isDirty || !!conflict}
          >
            Apply
          </button>
        </div>
      </div>
      {conflict ? (
        <div className="px-3 py-2 text-sm text-red-700 bg-red-50 border-b border-red-200">
          {conflict}
        </div>
      ) : null}
      {applyError ? (
        <div className="px-3 py-2 text-sm text-red-700 bg-red-50 border-b border-red-200">
          {applyError}
        </div>
      ) : null}
      {!isEditable ? (
        <div className="px-3 py-2 text-sm text-amber-800 bg-amber-50 border-b border-amber-200">
          This file is currently source-only. WYSIWYG editing and autosave are disabled for
          unsupported syntax.
        </div>
      ) : null}
      <textarea
        className="flex-1 w-full resize-none bg-transparent p-4 font-mono text-sm outline-none"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        readOnly={!isEditable}
        spellCheck={false}
      />
    </div>
  );
}
