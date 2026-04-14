import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useDocumentContext } from '@/editor/DocumentContext';
import { AgentUndoButton } from '@/presence/AgentUndoButton';
import { PresenceBar } from '@/presence/PresenceBar';
import { Markdown } from './icons/markdown';
import { Textbox } from './icons/textbox';
import { ThemeToggle } from './ThemeToggle';

interface EditorHeaderProps {
  isSourceMode: boolean;
  onSourceModeChange: (value: boolean) => void;
}

export function EditorHeader({ isSourceMode, onSourceModeChange }: EditorHeaderProps) {
  const { activeDocName } = useDocumentContext();

  const displayName = activeDocName ? `${activeDocName}.md` : 'No document';

  return (
    <header className="flex h-12 shrink-0 items-center border-b">
      <div className="flex flex-1 items-center gap-1 px-3 min-w-0">
        <SidebarTrigger className="-ml-1 shrink-0 text-muted-foreground" />
        <Separator orientation="vertical" className="mr-1 h-4 shrink-0 data-vertical:self-center" />
        <span className="text-sm text-muted-foreground truncate min-w-0">{displayName}</span>
      </div>
      <ToggleGroup
        type="single"
        value={isSourceMode ? 'source' : 'visual'}
        onValueChange={(v) => {
          if (v) onSourceModeChange(v === 'source');
        }}
        aria-label="Editor mode"
        variant="segmented"
        size="sm"
        spacing={1}
        className="bg-muted dark:bg-background p-0.5 rounded-lg shrink-0"
        disabled={!activeDocName}
      >
        <ToggleGroupItem value="visual" aria-label="Visual editor" className="gap-1.5 text-xs">
          <Textbox className="size-4 text-muted-foreground" />
          Visual
        </ToggleGroupItem>
        <ToggleGroupItem value="source" aria-label="Markdown source" className="gap-1.5 text-xs">
          <Markdown className="size-4 text-muted-foreground" />
          Markdown
        </ToggleGroupItem>
      </ToggleGroup>
      <div className="flex flex-1 items-center justify-end gap-2 px-3">
        <PresenceBar />
        <AgentUndoButton />
        <Separator orientation="vertical" className="h-4 shrink-0 data-vertical:self-center" />
        <ThemeToggle />
      </div>
    </header>
  );
}
