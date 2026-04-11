import type { Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { useState } from 'react';
import { Separator } from '@/components/ui/separator';
import { BlockTypeSelector } from './BlockTypeSelector';
import { InlineFormatButtons } from './InlineFormatButtons';
import { LinkEditPopover } from './LinkEditPopover';

function getScrollParent(node: Element | null): HTMLElement | Window {
  let el = node?.parentElement ?? null;
  while (el && el !== document.body) {
    const { overflowY } = window.getComputedStyle(el);
    if (overflowY === 'auto' || overflowY === 'scroll') return el as HTMLElement;
    el = el.parentElement;
  }
  return window;
}

function shouldShowBubbleMenu({ editor }: { editor: Editor }): boolean {
  // Don't show if selection is empty
  if (editor.state.selection.empty) return false;

  // Don't show inside code blocks
  if (editor.isActive('codeBlock')) return false;

  // Don't show if only whitespace is selected
  const { from, to } = editor.state.selection;
  const text = editor.state.doc.textBetween(from, to, ' ');
  if (!text.trim()) return false;

  return true;
}

export function BubbleMenuBar({ editor }: { editor: Editor }) {
  const [tooltipKey, setTooltipKey] = useState(0);

  return (
    <BubbleMenu
      editor={editor}
      appendTo={() => document.body}
      shouldShow={shouldShowBubbleMenu}
      updateDelay={100}
      options={{
        onHide: () => setTooltipKey((k) => k + 1),
        strategy: 'fixed',
        scrollTarget: getScrollParent(editor.view.dom),
      }}
      className="z-50 flex items-center gap-0.5 rounded-lg border bg-background p-1 shadow-md"
    >
      <BlockTypeSelector editor={editor} />
      <Separator orientation="vertical" className="mx-0.5 h-5 data-vertical:self-center" />
      <InlineFormatButtons key={tooltipKey} editor={editor} />
      <Separator orientation="vertical" className="mx-0.5 h-5 data-vertical:self-center" />
      <LinkEditPopover key={`${tooltipKey}-link`} editor={editor} />
    </BubbleMenu>
  );
}
