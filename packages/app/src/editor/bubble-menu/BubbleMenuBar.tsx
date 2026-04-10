import type { Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { Separator } from '@/components/ui/separator';
import { BlockTypeSelector } from './BlockTypeSelector';
import { InlineFormatButtons } from './InlineFormatButtons';
import { LinkEditPopover } from './LinkEditPopover';

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
  return (
    <BubbleMenu
      editor={editor}
      shouldShow={shouldShowBubbleMenu}
      updateDelay={100}
      className="flex items-center gap-0.5 rounded-lg border bg-background p-1 shadow-md"
    >
      <BlockTypeSelector editor={editor} />
      <Separator orientation="vertical" className="mx-0.5 h-5 data-vertical:self-center" />
      <InlineFormatButtons editor={editor} />
      <Separator orientation="vertical" className="mx-0.5 h-5 data-vertical:self-center" />
      <LinkEditPopover editor={editor} />
    </BubbleMenu>
  );
}
