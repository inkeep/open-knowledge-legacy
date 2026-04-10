import type { HocuspocusProvider } from '@hocuspocus/provider';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { AgentUndoButton } from '@/presence/AgentUndoButton';
import { PresenceBar } from '@/presence/PresenceBar';
import { Markdown } from './icons/markdown';
import { Textbox } from './icons/textbox';

interface EditorHeaderProps {
  provider: HocuspocusProvider | null;
  isSourceMode: boolean;
  onSourceModeChange: (value: boolean) => void;
}

export function EditorHeader({ provider, isSourceMode, onSourceModeChange }: EditorHeaderProps) {
  return (
    <header className="flex h-10 shrink-0 items-center gap-2 border-b">
      <div className="flex items-center gap-1 px-3">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-1 h-4 data-vertical:self-center" />
        <span className="font-mono text-sm text-muted-foreground">untitled.md</span>
      </div>
      <div className="ml-auto flex items-center gap-2 px-3">
        <PresenceBar provider={provider} />
        <fieldset
          className="m-0 flex items-center gap-1 rounded-md border p-0.5"
          aria-label="Editor mode"
        >
          <Button
            variant={!isSourceMode ? 'default' : 'ghost'}
            size="sm"
            aria-pressed={!isSourceMode}
            onClick={() => onSourceModeChange(false)}
          >
            <Textbox className="size-6" />
            Visual editor
          </Button>
          <Button
            variant={isSourceMode ? 'default' : 'ghost'}
            size="sm"
            aria-pressed={isSourceMode}
            onClick={() => onSourceModeChange(true)}
          >
            <Markdown className="size-6" />
            Markdown
          </Button>
        </fieldset>
        <AgentUndoButton />
      </div>
    </header>
  );
}
