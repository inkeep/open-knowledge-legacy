import type { NodeViewProps } from '@tiptap/core';
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';
import { Check, ChevronDown, Code2, Copy, Eye, EyeOff, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { OPT_OUT_ATTR } from '../clipboard/index.ts';
import { ResizeHandles } from '../components/ResizeHandles.tsx';
import { CODE_BLOCK_LANGUAGES, normalizeCodeLanguage } from './code-block-languages';
import {
  addMetaToken,
  metaHasToken,
  PREVIEWABLE_LANGUAGES,
  parsePreviewHeight,
  parsePreviewWidth,
  removeMetaToken,
  setMetaKeyValue,
  shouldShowPreview,
} from './code-block-meta';

export const PREVIEW_IFRAME_HEADER = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' data:; img-src data:; font-src data:; connect-src 'none'; frame-src 'none'; child-src 'none'; form-action 'none'; base-uri 'none';">
<style>
  html, body { scrollbar-width: thin; scrollbar-color: rgba(115,115,115,0.4) transparent; }
  html::-webkit-scrollbar, body::-webkit-scrollbar,
  *::-webkit-scrollbar { width: 8px; height: 8px; }
  html::-webkit-scrollbar-track, body::-webkit-scrollbar-track,
  *::-webkit-scrollbar-track { background: transparent; }
  html::-webkit-scrollbar-thumb, body::-webkit-scrollbar-thumb,
  *::-webkit-scrollbar-thumb { background: rgba(115,115,115,0.4); border-radius: 4px; }
  html::-webkit-scrollbar-thumb:hover, body::-webkit-scrollbar-thumb:hover,
  *::-webkit-scrollbar-thumb:hover { background: rgba(115,115,115,0.6); }
</style>`;

const PLAIN_TEXT = 'plaintext';

function useCursorInside(editor: NodeViewProps['editor'], getPos: NodeViewProps['getPos']) {
  const [inside, setInside] = useState(false);
  useEffect(() => {
    const compute = () => {
      const pos = typeof getPos === 'function' ? getPos() : undefined;
      if (typeof pos !== 'number') return;
      const node = editor.state.doc.nodeAt(pos);
      if (!node) return;
      const { from, to } = editor.state.selection;
      const start = pos;
      const end = pos + node.nodeSize;
      const next = from < end && to > start;
      setInside((prev) => (prev === next ? prev : next));
    };
    compute();
    editor.on('selectionUpdate', compute);
    return () => {
      if (!editor.isDestroyed) editor.off('selectionUpdate', compute);
    };
  }, [editor, getPos]);
  return inside;
}

export function CodeBlockView({ node, updateAttributes, editor, getPos, selected }: NodeViewProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const copyResetRef = useRef<number | null>(null);
  const previewWrapperRef = useRef<HTMLDivElement | null>(null);
  const rawLanguage = (node.attrs.language as string | null) ?? null;
  const rawMeta = (node.attrs.meta as string | null) ?? null;
  const rawMetaRef = useRef(rawMeta);
  useEffect(() => {
    rawMetaRef.current = rawMeta;
  }, [rawMeta]);
  const normalized = normalizeCodeLanguage(rawLanguage);
  const currentLabel = !rawLanguage
    ? 'Plain'
    : (CODE_BLOCK_LANGUAGES.find((l) => l.value === normalized)?.label ?? rawLanguage);
  const previewToggled = metaHasToken(rawMeta, 'preview');
  const previewRenderable = normalized ? PREVIEWABLE_LANGUAGES.has(normalized) : false;
  const previewActive = shouldShowPreview(normalized, rawMeta);
  const previewHeight = previewActive ? parsePreviewHeight(rawMeta) : null;
  const previewWidth = previewActive ? parsePreviewWidth(rawMeta) : null;
  const codeVisible = !previewActive || showCode;

  useEffect(
    () => () => {
      if (copyResetRef.current !== null) window.clearTimeout(copyResetRef.current);
    },
    [],
  );

  const editable = editor.isEditable;
  const cursorInside = useCursorInside(editor, getPos);

  const handleCopy = () => {
    const text = node.textContent;
    const flipSuccess = () => {
      setCopied(true);
      if (copyResetRef.current !== null) window.clearTimeout(copyResetRef.current);
      copyResetRef.current = window.setTimeout(() => setCopied(false), 1200);
    };
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(flipSuccess, () => {});
      }
    } catch {}
  };

  const handleDelete = () => {
    const pos = typeof getPos === 'function' ? getPos() : undefined;
    if (typeof pos !== 'number') return;
    try {
      editor.chain().focus().setNodeSelection(pos).deleteSelection().run();
    } catch (err) {
      if (!(err instanceof RangeError)) throw err;
      console.warn('[CodeBlockView] delete failed — position race', err);
    }
  };

  const handleTogglePreview = () => {
    const next = previewToggled
      ? removeMetaToken(rawMeta, 'preview')
      : addMetaToken(rawMeta, 'preview');
    updateAttributes({ meta: next });
  };

  const handleResizeEnd = (size: { width: number; height: number }) => {
    const w = `${Math.round(size.width)}px`;
    const h = `${Math.round(size.height)}px`;
    const withHeight = setMetaKeyValue(rawMetaRef.current, 'h', h);
    const next = setMetaKeyValue(withHeight, 'w', w);
    updateAttributes({ meta: next });
  };

  return (
    <NodeViewWrapper
      className="ok-codeblock relative my-3"
      data-language={rawLanguage ?? undefined}
      data-cursor-inside={cursorInside ? 'true' : undefined}
      data-selected={selected ? 'true' : undefined}
      data-preview={previewActive ? 'true' : undefined}
      data-code-visible={codeVisible ? 'true' : 'false'}
    >
      {previewActive ? (
        // biome-ignore lint/a11y/noStaticElementInteractions: stopPropagation required so resize-handle drags don't bubble into PM
        <div
          ref={previewWrapperRef}
          className={cn(
            'ok-codeblock-preview',
            codeVisible ? 'ok-codeblock-preview--with-code' : 'ok-codeblock-preview--solo',
          )}
          contentEditable={false}
          style={{
            ...(previewHeight ? { height: previewHeight } : {}),
            ...(previewWidth ? { width: previewWidth } : {}),
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <iframe
            title="HTML preview"
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            srcDoc={PREVIEW_IFRAME_HEADER + node.textContent}
            className="ok-codeblock-preview-frame"
          />
          <ResizeHandles
            targetRef={previewWrapperRef}
            bounds={{
              minWidth: 192,
              maxWidth: Math.round(window.innerWidth * 0.9),
              minHeight: 128,
              maxHeight: Math.round(window.innerHeight * 0.9),
            }}
            onResize={(size) => {
              const el = previewWrapperRef.current;
              if (!el) return;
              el.style.width = `${size.width}px`;
              el.style.height = `${size.height}px`;
            }}
            onResizeEnd={handleResizeEnd}
          />
        </div>
      ) : null}

      {/* `<pre>` is ALWAYS mounted so PM's contentDOM has a stable host — we
          hide via CSS only (`data-code-visible="false"`) rather than
          conditional render. Keeps caret stability, undo history, and any
          decorations from churning when the user collapses the code. */}
      <pre
        className={cn(
          'ok-codeblock-pre m-0 overflow-x-auto px-5 py-4 font-mono text-sm leading-relaxed',
          previewActive && codeVisible ? 'rounded-b-lg' : null,
          !previewActive ? 'rounded-lg' : null,
        )}
        aria-hidden={!codeVisible || undefined}
      >
        <NodeViewContent<'code'>
          as="code"
          className={cn(
            'hljs block whitespace-pre bg-transparent p-0',
            rawLanguage ? `language-${rawLanguage}` : undefined,
          )}
        />
      </pre>

      {/* biome-ignore lint/a11y/noStaticElementInteractions: stopPropagation required inside PM NodeView */}
      <div
        className="ok-codeblock-chrome"
        contentEditable={false}
        onMouseDown={(e) => e.stopPropagation()}
        {...{ [OPT_OUT_ATTR]: 'true' }}
      >
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={!editable}
              className="ok-codeblock-chrome-btn ok-codeblock-chrome-lang"
              aria-label={`Code block language: ${currentLabel}. Click to change.`}
            >
              <span>{currentLabel}</span>
              {editable ? <ChevronDown className="size-3 opacity-60" aria-hidden="true" /> : null}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={6} className="w-56 p-0">
            <Command
              filter={(value, search) => {
                if (!search) return 1;
                return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
              }}
            >
              <CommandInput placeholder="Filter languages" />
              <CommandList>
                <CommandEmpty>No language match.</CommandEmpty>
                <CommandGroup>
                  {CODE_BLOCK_LANGUAGES.map((lang) => {
                    const isActive =
                      lang.value === PLAIN_TEXT
                        ? !rawLanguage || normalized === PLAIN_TEXT
                        : normalized === lang.value;
                    return (
                      <CommandItem
                        key={lang.value}
                        value={`${lang.label} ${lang.value} ${lang.aliases?.join(' ') ?? ''}`}
                        onSelect={() => {
                          const next = lang.value === PLAIN_TEXT ? null : lang.value;
                          updateAttributes({ language: next });
                          setOpen(false);
                          editor.commands.focus();
                        }}
                      >
                        <span className="flex-1">{lang.label}</span>
                        {isActive ? <Check className="size-3.5" aria-hidden="true" /> : null}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {previewActive ? (
          <button
            type="button"
            className="ok-codeblock-chrome-btn"
            data-active={showCode ? 'true' : undefined}
            aria-pressed={showCode}
            aria-label={showCode ? 'Hide code' : 'Show code'}
            onClick={() => setShowCode((v) => !v)}
          >
            <Code2 className="size-3.5" />
          </button>
        ) : null}

        {editable && previewRenderable ? (
          <button
            type="button"
            className="ok-codeblock-chrome-btn"
            data-active={previewToggled ? 'true' : undefined}
            aria-pressed={previewToggled}
            aria-label={previewToggled ? 'Hide HTML preview' : 'Show HTML preview'}
            onClick={handleTogglePreview}
          >
            {previewToggled ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
        ) : null}

        <button
          type="button"
          className="ok-codeblock-chrome-btn"
          aria-label={copied ? 'Copied' : 'Copy code'}
          onClick={handleCopy}
        >
          {copied ? (
            <Check className="size-3.5" aria-hidden="true" />
          ) : (
            <Copy className="size-3.5" aria-hidden="true" />
          )}
        </button>

        {editable ? (
          <button
            type="button"
            className="ok-codeblock-chrome-btn ok-codeblock-chrome-btn--delete"
            aria-label="Delete code block"
            onClick={handleDelete}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </NodeViewWrapper>
  );
}
