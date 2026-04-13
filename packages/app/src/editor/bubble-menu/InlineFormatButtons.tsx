import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import { Bold, Code, Highlighter, Italic, Strikethrough, Underline } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const formatActions = [
  {
    name: 'bold',
    icon: Bold,
    command: (editor: Editor) => editor.chain().focus().toggleBold().run(),
    isActive: (editor: Editor) => editor.isActive('strong'),
    shortcut: '⌘B',
  },
  {
    name: 'italic',
    icon: Italic,
    command: (editor: Editor) => editor.chain().focus().toggleItalic().run(),
    isActive: (editor: Editor) => editor.isActive('emphasis'),
    shortcut: '⌘I',
  },
  {
    name: 'underline',
    icon: Underline,
    command: (editor: Editor) => editor.chain().focus().toggleUnderline().run(),
    isActive: (editor: Editor) => editor.isActive('underline'),
    shortcut: '⌘U',
  },
  {
    name: 'strikethrough',
    icon: Strikethrough,
    command: (editor: Editor) => editor.chain().focus().toggleStrike().run(),
    isActive: (editor: Editor) => editor.isActive('strike'),
    shortcut: '⌘⇧X',
  },
  {
    name: 'code',
    icon: Code,
    command: (editor: Editor) => editor.chain().focus().toggleCode().run(),
    isActive: (editor: Editor) => editor.isActive('code'),
    shortcut: '⌘E',
  },
  {
    name: 'highlight',
    icon: Highlighter,
    command: (editor: Editor) => editor.chain().focus().toggleHighlight().run(),
    isActive: (editor: Editor) => editor.isActive('highlight'),
    shortcut: '⌘⇧H',
  },
] as const;

export function InlineFormatButtons({ editor }: { editor: Editor }) {
  const activeStates = useEditorState({
    editor,
    selector: (ctx) =>
      Object.fromEntries(formatActions.map((action) => [action.name, action.isActive(ctx.editor)])),
  });

  return (
    <div className="flex items-center gap-0.5">
      {formatActions.map((action) => {
        const Icon = action.icon;
        const active = activeStates[action.name];
        return (
          <Tooltip key={action.name}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={action.name}
                className={active ? 'bg-accent text-primary' : 'text-accent-foreground'}
                onMouseDown={(e) => {
                  e.preventDefault();
                  action.command(editor);
                }}
              >
                <Icon className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={8}>
              <span className="capitalize">{action.name}</span>
              <kbd className="ml-1.5 text-[10px] opacity-60">{action.shortcut}</kbd>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
