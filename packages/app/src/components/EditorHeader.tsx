import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDocumentContext } from '@/editor/DocumentContext';
import { useWorkspace } from '@/lib/use-workspace';
import { cn } from '@/lib/utils';
import { PresenceBar } from '@/presence/PresenceBar';
import { BetaBadge } from './BetaBadge';
import { EditorTabs } from './EditorTabs';
import { HelpPopover } from './HelpPopover';
import { OpenInAgentMenu } from './handoff/OpenInAgentMenu';
import { buildHandoffInput } from './handoff/useHandoffDispatch';
import { SettingsButton } from './SettingsButton';
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
  const handoffInput = buildHandoffInput({ docName: activeDocName, workspace });
  const isAssetTarget = activeTarget?.kind === 'asset';

  const assetPath = isAssetTarget ? activeTarget.assetPath : '';
  const assetSlash = assetPath.lastIndexOf('/');
  const assetPrefix = assetSlash === -1 ? '' : assetPath.slice(0, assetSlash);
  const assetFileName = assetSlash === -1 ? assetPath : assetPath.slice(assetSlash + 1);

  const isElectronHost = typeof window !== 'undefined' && window.okDesktop != null;
  const isCollapsed = sidebarState === 'collapsed';

  return (
    <header
      className={cn(
        'flex h-12 shrink-0 items-center bg-muted/20 shadow-[inset_0_-1px_0_var(--border)]',
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
        {isAssetTarget ? (
          <div className="flex min-w-0 items-center gap-2 overflow-hidden text-sm">
            <span className="flex min-w-0 items-center overflow-hidden">
              {assetPrefix && (
                <>
                  <span className="truncate text-muted-foreground/60">{assetPrefix}</span>
                  <span className="shrink-0 px-2 text-muted-foreground/60">/</span>
                </>
              )}
              <span className="shrink-0 font-medium text-foreground">{assetFileName}</span>
            </span>
          </div>
        ) : null}
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
            <TooltipContent>{saving ? 'Saving…' : 'Checkpoint version'}</TooltipContent>
          </Tooltip>
        )}
        {activeDocName && <OpenInAgentMenu input={handoffInput} />}
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
