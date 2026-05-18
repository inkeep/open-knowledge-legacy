import { Save } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDocumentContext } from '@/editor/DocumentContext';
import { useWorkspace } from '@/lib/use-workspace';
import { cn } from '@/lib/utils';
import { joinWorkspacePath } from '@/lib/workspace-paths';
import { PresenceBar } from '@/presence/PresenceBar';
import { BetaBadge } from './BetaBadge';
import { EditorTabs } from './EditorTabs';
import { HelpPopover } from './HelpPopover';
import { OpenInAgentMenu } from './handoff/OpenInAgentMenu';
import {
  buildFolderHandoffInput,
  buildHandoffInput,
  buildProjectScopedHandoffInput,
  type HandoffDispatchInput,
} from './handoff/useHandoffDispatch';
import { PublishToGitHubDialog } from './PublishToGitHubDialog';
import { SettingsButton } from './SettingsButton';
import { ShareButton } from './ShareButton';
import { SyncStatusBadge } from './SyncStatusBadge';
import { ThemeToggle } from './ThemeToggle';

interface EditorHeaderProps {
  onSaveVersion: () => void;
  saving: boolean;
  onSignIn?: () => void;
  onSetIdentity?: () => void;
  onOpenConflictResolver?: () => void;
}

export function EditorHeader({
  onSaveVersion,
  saving,
  onSignIn,
  onSetIdentity,
  onOpenConflictResolver,
}: EditorHeaderProps) {
  const { activeDocName, activeTarget } = useDocumentContext();
  const { state: sidebarState } = useSidebar();
  const workspace = useWorkspace();
  const [publishOpen, setPublishOpen] = useState(false);
  const handoffInput: HandoffDispatchInput | null = (() => {
    if (activeTarget === null) {
      return buildProjectScopedHandoffInput({ workspace });
    }
    if (activeTarget.kind === 'folder') {
      if (!workspace) return null;
      const folderAbsPath = joinWorkspacePath(
        workspace.contentDir,
        activeTarget.folderPath,
        workspace.pathSeparator,
      );
      return buildFolderHandoffInput({
        folderAbsPath,
        folderRelativePath: activeTarget.folderPath,
        workspace,
      });
    }
    return buildHandoffInput({ docName: activeDocName, workspace });
  })();

  const isElectronHost = typeof window !== 'undefined' && window.okDesktop != null;
  const isCollapsed = sidebarState === 'collapsed';

  return (
    <header
      className={cn(
        'flex h-12 shrink-0 items-center bg-muted/35 shadow-[inset_0_-1px_0_var(--border)]',
        isElectronHost && '[-webkit-app-region:drag]',
        isElectronHost && isCollapsed && 'pl-[78px]',
        isElectronHost &&
          'motion-safe:transition-[padding] motion-safe:duration-200 motion-safe:ease-linear',
      )}
    >
      {/*
        Left zone uses per-child `no-drag` opt-outs (instead of the
        right zone's `[&>*]:` child-combinator) because EditorTabs is a
        direct child whose own root MUST stay draggable so the empty
        space inside the tab strip continues to drag the window. Adding
        a future interactive control here? Apply `[-webkit-app-region:
        no-drag]` (gated on `isElectronHost`) explicitly on the new
        element — the right zone's blanket opt-out is intentionally
        scoped to its zone.
      */}
      <div className="flex min-w-0 flex-1 items-center gap-1 px-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <SidebarTrigger
              className={cn(
                '-ml-1 shrink-0 text-muted-foreground',
                isElectronHost && '[-webkit-app-region:no-drag]',
              )}
            />
          </TooltipTrigger>
          <TooltipContent>
            {sidebarState === 'expanded' ? 'Hide Files' : 'Show Files'}
          </TooltipContent>
        </Tooltip>
        <Separator orientation="vertical" className="mr-1 h-4 shrink-0 data-vertical:self-center" />
        <EditorTabs />
      </div>

      <div
        className={cn(
          'flex shrink-0 items-center justify-end gap-2 px-3',
          isElectronHost && '[&>*]:[-webkit-app-region:no-drag]',
        )}
      >
        {activeDocName && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Checkpoint version"
                onClick={onSaveVersion}
                disabled={saving}
                className="text-muted-foreground"
              >
                <Save className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{saving ? 'Saving' : 'Checkpoint version'}</TooltipContent>
          </Tooltip>
        )}
        <OpenInAgentMenu input={handoffInput} />
        <ShareButton onClickWhenNoRemote={() => setPublishOpen(true)} />
        <PublishToGitHubDialog open={publishOpen} onOpenChange={setPublishOpen} />
        <SyncStatusBadge
          onSignIn={onSignIn}
          onSetIdentity={onSetIdentity}
          onOpenConflictResolver={onOpenConflictResolver}
        />
        <PresenceBar />
        <Separator orientation="vertical" className="h-4 shrink-0 data-vertical:self-center" />
        <BetaBadge />
        <SettingsButton />
        <HelpPopover />
        <ThemeToggle />
      </div>
    </header>
  );
}
