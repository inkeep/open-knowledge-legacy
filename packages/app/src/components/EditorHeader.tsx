import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useDocumentContext } from '@/editor/DocumentContext';
import { AgentUndoButton } from '@/presence/AgentUndoButton';
import { PresenceBar } from '@/presence/PresenceBar';
import { Markdown } from './icons/markdown';
import { Textbox } from './icons/textbox';

interface EditorHeaderProps {
  isSourceMode: boolean;
  onSourceModeChange: (value: boolean) => void;
}

export function EditorHeader({ isSourceMode, onSourceModeChange }: EditorHeaderProps) {
  const { activeDocName } = useDocumentContext();

  const displayName = activeDocName ? `${activeDocName}.md` : 'No document';

  return (
    <header className="relative flex h-12 shrink-0 items-center border-b">
      <div className="flex items-center gap-1 px-3">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-1 h-4 data-vertical:self-center" />
        <span className="font-mono text-sm text-muted-foreground">{displayName}</span>
      </div>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="pointer-events-auto">
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
            className="bg-muted p-0.5 rounded-lg"
            disabled={!activeDocName}
          >
            <ToggleGroupItem value="visual" aria-label="Visual editor" className="gap-1.5 text-xs">
              <Textbox className="size-4 text-muted-foreground" />
              Visual
            </ToggleGroupItem>
            <ToggleGroupItem
              value="source"
              aria-label="Markdown source"
              className="gap-1.5 text-xs"
            >
              <Markdown className="size-4 text-muted-foreground" />
              Markdown
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>
      <div className="ml-auto flex items-center gap-2 px-3">
        <PresenceBar />
        <AgentUndoButton />
      </div>
    </header>
  );
}
