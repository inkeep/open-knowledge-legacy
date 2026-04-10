import type { Editor } from '@tiptap/react';
import { Bold, Code, Italic, Strikethrough } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const formatActions = [
  {
    name: 'bold',
    icon: Bold,
    command: (editor: Editor) => editor.chain().focus().toggleBold().run(),
    isActive: (editor: Editor) => editor.isActive('bold'),
    shortcut: '⌘B',
  },
  {
    name: 'italic',
    icon: Italic,
    command: (editor: Editor) => editor.chain().focus().toggleItalic().run(),
    isActive: (editor: Editor) => editor.isActive('italic'),
    shortcut: '⌘I',
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
] as const;

export function InlineFormatButtons({ editor }: { editor: Editor }) {
  return (
    <div className="flex items-center gap-0.5">
      {formatActions.map((action) => {
        const Icon = action.icon;
        const active = action.isActive(editor);
        return (
          <Tooltip key={action.name}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={action.name}
                className={active ? 'bg-accent text-primary' : 'text-muted-foreground'}
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
