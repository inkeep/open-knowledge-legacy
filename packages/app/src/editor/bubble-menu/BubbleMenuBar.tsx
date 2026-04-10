import { isNodeSelection } from '@tiptap/core';
import type { Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { Separator } from '@/components/ui/separator';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BlockTypeSelector } from './BlockTypeSelector';
import { InlineFormatButtons } from './InlineFormatButtons';
import { LinkEditPopover } from './LinkEditPopover';

function shouldShowBubbleMenu({ editor }: { editor: Editor }): boolean {
  // Don't show if selection is empty
  if (editor.state.selection.empty) return false;

  // Don't show for node selections (component blocks, images, etc.).
  // BubbleMenu is a text-formatting toolbar — bold/italic/link controls don't
  // apply to block-level nodes. Without this, clicking a typed component's
  // toolbar (which creates a NodeSelection via setNodeSelection) would show
  // the bubble menu floating near the component with irrelevant controls.
  if (isNodeSelection(editor.state.selection)) return false;

  // Don't show inside code blocks
  if (editor.isActive('codeBlock')) return false;

  // Don't show if only whitespace is selected
  const { from, to } = editor.state.selection;
  const text = editor.state.doc.textBetween(from, to, ' ');
  if (!text.trim()) return false;

  return true;
}

export function BubbleMenuBar({ editor }: { editor: Editor }) {
  return (
    <BubbleMenu
      editor={editor}
      shouldShow={shouldShowBubbleMenu}
      updateDelay={100}
      className="flex items-center gap-0.5 rounded-lg border bg-background p-1 shadow-md"
    >
      <TooltipProvider>
        <BlockTypeSelector editor={editor} />
        <Separator orientation="vertical" className="mx-0.5 h-5 data-vertical:self-center" />
        <InlineFormatButtons editor={editor} />
        <Separator orientation="vertical" className="mx-0.5 h-5 data-vertical:self-center" />
        <LinkEditPopover editor={editor} />
      </TooltipProvider>
    </BubbleMenu>
  );
}
