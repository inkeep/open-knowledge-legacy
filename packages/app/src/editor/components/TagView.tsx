import { FRONTMATTER_TAG_VALUE_RE } from '@inkeep/open-knowledge-core';
import type { NodeViewProps } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { NodeViewWrapper } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover.tsx';
import { PropPanel } from '../components/PropPanel.tsx';
import type { JsxComponentDescriptor } from '../registry/types.ts';
import { consumeAutoOpen } from '../slash-command/component-items.tsx';

const tagInlineDescriptor = {
  name: 'Tag',
  surface: 'canonical',
  hasChildren: false,
  isSelfClosing: true,
  category: 'content',
  description: 'Inline tag',
  props: [
    {
      name: 'value',
      type: 'string',
      required: true,
      autoFocus: true,
      description: 'Tag name (without #)',
    },
  ],
} as unknown as JsxComponentDescriptor;

interface EmptyTagPlaceholderProps {
  hint: string;
}

function EmptyTagPlaceholder({ hint }: EmptyTagPlaceholderProps) {
  return (
    <span
      className="tag tag-placeholder inline-flex items-center rounded-sm border border-dashed border-muted-foreground/40 bg-muted/30 px-1.5 py-0.5 text-xs italic text-muted-foreground hover:bg-muted/60 cursor-pointer"
      data-component-type="tag-placeholder"
    >
      {hint}
    </span>
  );
}

interface RenderedTagChipProps {
  value: string;
}

function RenderedTagChip({ value }: RenderedTagChipProps) {
  return (
    <a className="tag" data-tag={value} href={`#tag/${value}`}>
      #{value}
    </a>
  );
}

export function TagView({ node, selected, getPos, editor }: NodeViewProps) {
  const value = typeof node.attrs.value === 'string' ? node.attrs.value : '';
  const [popoverOpen, setPopoverOpen] = useState(false);
  const wasSelected = useRef(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (selected && !wasSelected.current) {
      const pos = typeof getPos === 'function' ? (getPos() ?? 0) : 0;
      consumeAutoOpen(pos);
      setPopoverOpen(true);
    } else if (!selected && wasSelected.current) {
      setPopoverOpen(false);
      setValidationError(null);
    }
    wasSelected.current = selected;
  }, [selected, getPos]);

  return (
    <NodeViewWrapper as="span" className={selected ? 'tag-inline-selected' : undefined}>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <span className="tag-inline-trigger" data-component-type="tag-inline">
            {value ? <RenderedTagChip value={value} /> : <EmptyTagPlaceholder hint="#tag-name" />}
          </span>
        </PopoverTrigger>
        <PopoverContent
          className="z-60 w-72 p-0"
          side="bottom"
          align="start"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            editor.view.focus();
          }}
        >
          <div className="text-xs font-medium text-muted-foreground px-3 pt-2">Tag Properties</div>
          <PropPanel
            descriptor={tagInlineDescriptor}
            values={{ value }}
            onChange={(propName, nextValue) => {
              if (propName !== 'value') return;
              const next = typeof nextValue === 'string' ? nextValue : '';
              if (next !== '' && !FRONTMATTER_TAG_VALUE_RE.test(next)) {
                setValidationError(
                  `Tag must match ${FRONTMATTER_TAG_VALUE_RE.source} (letter then word/-//).`,
                );
                return;
              }
              setValidationError(null);
              const p = typeof getPos === 'function' ? getPos() : undefined;
              if (typeof p !== 'number') return;
              const curNode = editor.state.doc.nodeAt(p);
              if (!curNode || curNode.type.name !== 'tag') return;
              const tr = editor.state.tr.setNodeMarkup(p, null, {
                ...curNode.attrs,
                value: next,
              });
              tr.setSelection(NodeSelection.create(tr.doc, p));
              editor.view.dispatch(tr);
            }}
          />
          {validationError ? (
            <div
              className="px-3 pb-2 text-xs text-destructive"
              data-testid="tag-validation-error"
              role="alert"
            >
              {validationError}
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
    </NodeViewWrapper>
  );
}
