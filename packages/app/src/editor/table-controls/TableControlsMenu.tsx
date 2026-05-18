import type { Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Columns3,
  Grid2x2X,
  TableProperties,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getFindReplaceState } from '../find-replace/tiptap-find-replace-extension';

interface TableAction {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  command: (editor: Editor) => void;
}

const rowActions: TableAction[] = [
  {
    name: 'addRowBefore',
    icon: ArrowUp,
    label: 'Add row above',
    command: (editor) => editor.chain().focus().addRowBefore().run(),
  },
  {
    name: 'addRowAfter',
    icon: ArrowDown,
    label: 'Add row below',
    command: (editor) => editor.chain().focus().addRowAfter().run(),
  },
  {
    name: 'deleteRow',
    icon: Trash2,
    label: 'Delete row',
    command: (editor) => editor.chain().focus().deleteRow().run(),
  },
];

const columnActions: TableAction[] = [
  {
    name: 'addColumnBefore',
    icon: ArrowLeft,
    label: 'Add column left',
    command: (editor) => editor.chain().focus().addColumnBefore().run(),
  },
  {
    name: 'addColumnAfter',
    icon: ArrowRight,
    label: 'Add column right',
    command: (editor) => editor.chain().focus().addColumnAfter().run(),
  },
  {
    name: 'deleteColumn',
    icon: Trash2,
    label: 'Delete column',
    command: (editor) => editor.chain().focus().deleteColumn().run(),
  },
];

const tableActions: TableAction[] = [
  {
    name: 'toggleHeaderRow',
    icon: TableProperties,
    label: 'Toggle header row',
    command: (editor) => editor.chain().focus().toggleHeaderRow().run(),
  },
  {
    name: 'toggleHeaderColumn',
    icon: Columns3,
    label: 'Toggle header column',
    command: (editor) => editor.chain().focus().toggleHeaderColumn().run(),
  },
  {
    name: 'deleteTable',
    icon: Grid2x2X,
    label: 'Delete table',
    command: (editor) => editor.chain().focus().deleteTable().run(),
  },
];

function shouldShowTableControls({ editor }: { editor: Editor }): boolean {
  if (getFindReplaceState(editor.state).query) return false;
  return editor.isActive('table');
}

function ActionButton({ action, editor }: { action: TableAction; editor: Editor }) {
  const Icon = action.icon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={action.label}
          className="text-muted-foreground"
          onMouseDown={(e) => {
            e.preventDefault();
            action.command(editor);
          }}
        >
          <Icon className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={8}>
        {action.label}
      </TooltipContent>
    </Tooltip>
  );
}

export function TableControlsMenu({ editor }: { editor: Editor }) {
  return (
    <BubbleMenu
      editor={editor}
      data-testid="table-controls-menu"
      shouldShow={shouldShowTableControls}
      updateDelay={100}
      className="flex items-center gap-0.5 rounded-lg border bg-background p-1 shadow-md"
    >
      {rowActions.map((action) => (
        <ActionButton key={action.name} action={action} editor={editor} />
      ))}
      <Separator orientation="vertical" className="mx-0.5 h-5 data-vertical:self-center" />
      {columnActions.map((action) => (
        <ActionButton key={action.name} action={action} editor={editor} />
      ))}
      <Separator orientation="vertical" className="mx-0.5 h-5 data-vertical:self-center" />
      {tableActions.map((action) => (
        <ActionButton key={action.name} action={action} editor={editor} />
      ))}
    </BubbleMenu>
  );
}
