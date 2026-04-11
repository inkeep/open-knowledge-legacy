import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom';
import { isNodeSelection, posToDOMRect } from '@tiptap/core';
import type { Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { useRef, useState } from 'react';
import { Separator } from '@/components/ui/separator';
import { BlockTypeSelector } from './BlockTypeSelector';
import { InlineFormatButtons } from './InlineFormatButtons';
import { LinkEditPopover } from './LinkEditPopover';

function shouldShowBubbleMenu({ editor }: { editor: Editor }): boolean {
  if (editor.state.selection.empty) return false;

  // Don't show for node selections (component blocks, images, etc.).
  if (isNodeSelection(editor.state.selection)) return false;

  if (editor.isActive('codeBlock')) return false;
  const { from, to } = editor.state.selection;
  const text = editor.state.doc.textBetween(from, to, ' ');
  if (!text.trim()) return false;
  return true;
}

export function BubbleMenuBar({ editor }: { editor: Editor }) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [tooltipKey, setTooltipKey] = useState(0);
  const stopAutoUpdateRef = useRef<(() => void) | null>(null);

  // Virtual element whose getBoundingClientRect always reflects the current
  // selection position. contextElement lets autoUpdate discover scroll ancestors
  // (including the overflow-y-auto editor container) automatically.
  const virtualEl = {
    getBoundingClientRect: () => {
      try {
        const { from, to } = editor.state.selection;
        return posToDOMRect(editor.view, from, to);
      } catch {
        return new DOMRect();
      }
    },
    contextElement: editor.view.dom,
  };

  const onShow = () => {
    const popup = menuRef.current;
    if (!popup) return;
    stopAutoUpdateRef.current?.();
    stopAutoUpdateRef.current = autoUpdate(virtualEl, popup, () => {
      computePosition(virtualEl, popup, {
        placement: 'top',
        strategy: 'fixed',
        middleware: [offset(8), flip(), shift({ padding: 8 })],
      })
        .then(({ x, y }) => {
          if (popup.isConnected) {
            popup.style.position = 'fixed';
            popup.style.left = `${x}px`;
            popup.style.top = `${y}px`;
          }
        })
        .catch(() => {
          // Position calculation failed (e.g., detached element) — autoUpdate will retry
        });
    });
  };

  const onHide = () => {
    stopAutoUpdateRef.current?.();
    stopAutoUpdateRef.current = null;
    // Bump key to force remount of tooltip-bearing children — prevents "rogue tooltips"
    // that stay open after the bubble menu hides due to portal/z-index timing.
    setTooltipKey((k) => k + 1);
  };

  return (
    <BubbleMenu
      ref={menuRef}
      editor={editor}
      appendTo={() => document.body}
      shouldShow={shouldShowBubbleMenu}
      updateDelay={250}
      options={{ onShow, onHide, strategy: 'fixed' }}
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
