import { useEffect, useRef, useState } from 'react';
import { getProvider } from '@/client/provider';
import { applyMarkdownToDoc, serializeDocToMarkdown } from './markdown';
import { evaluateSourceDraftGate } from './source-draft';

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

function readCanonicalRevision(
  meta: ReturnType<ReturnType<typeof getProvider>['document']['getMap']>,
): number {
  const revision = meta.get('canonicalRevision');
  if (typeof revision === 'number' && Number.isFinite(revision)) return revision;
  if (typeof revision === 'string') {
    const parsed = Number.parseInt(revision, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
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
  const [canonicalRevision, setCanonicalRevision] = useState(() => readCanonicalRevision(meta));
  const [draftBaseRevision, setDraftBaseRevision] = useState(() => readCanonicalRevision(meta));
  const [applyError, setApplyError] = useState('');
  const baseMarkdownRef = useRef(baseMarkdown);
  const draftRef = useRef(draft);

  const isDirty = draft !== baseMarkdown;
  const isEditable = fileMode === 'editable';
  const gate = evaluateSourceDraftGate({
    isEditable,
    diskConflict: conflict,
    isDirty,
    draftBaseRevision,
    canonicalRevision,
  });

  useEffect(() => {
    baseMarkdownRef.current = baseMarkdown;
  }, [baseMarkdown]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    const refresh = () => {
      const nextMode = readMode(meta);
      const nextConflict = readConflict(meta);
      const nextRevision = readCanonicalRevision(meta);
      const nextBase =
        nextMode === 'source-only'
          ? readSourceOnly(meta)
          : serializeDocToMarkdown(doc, xmlFragment);
      const isDraftClean = draftRef.current === baseMarkdownRef.current;

      setFileMode(nextMode);
      setConflict(nextConflict);
      setCanonicalRevision(nextRevision);
      setBaseMarkdown(nextBase);
      if (isDraftClean) {
        setDraft(nextBase);
        setDraftBaseRevision(nextRevision);
      }
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
    setDraftBaseRevision(canonicalRevision);
    setApplyError('');
  };

  const applyDraft = () => {
    if (!isEditable || conflict) return;
    if (gate.isStale) {
      setApplyError(
        'Source draft is stale because the canonical document changed while this draft was dirty. Reload before applying.',
      );
      return;
    }

    try {
      doc.transact(() => applyMarkdownToDoc(doc, xmlFragment, draft), 'source-apply');
      const nextBase = serializeDocToMarkdown(doc, xmlFragment);
      setBaseMarkdown(nextBase);
      setDraft(nextBase);
      setDraftBaseRevision(canonicalRevision);
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
            disabled={!isDirty && !gate.isStale}
          >
            Reload
          </button>
          <button
            type="button"
            className="px-2 py-1 border border-border rounded disabled:opacity-50"
            onClick={applyDraft}
            disabled={!gate.canApply}
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
      {gate.isStale ? (
        <div className="px-3 py-2 text-sm text-amber-800 bg-amber-50 border-b border-amber-200">
          WYSIWYG changed this document while your source draft was dirty. Reload to continue.
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
