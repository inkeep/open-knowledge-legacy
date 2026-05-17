import { Share2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDocumentContext } from '@/editor/DocumentContext';
import { useGitSyncStatusDetailed } from '@/hooks/use-git-sync-status';
import { runShareAction } from '@/lib/share/run-share-action';

export interface ShareButtonProps {
  onClickWhenNoRemote: () => void;
}

export function ShareButton({ onClickWhenNoRemote }: ShareButtonProps) {
  const { activeDocName } = useDocumentContext();
  const { status } = useGitSyncStatusDetailed();
  const [busy, setBusy] = useState(false);

  if (!activeDocName) return null;

  const hasRemote = status?.hasRemote === true;

  async function handleClick() {
    if (busy) return;
    if (!activeDocName) return;
    setBusy(true);
    try {
      await runShareAction(
        {
          docName: activeDocName,
          hasRemote,
          onClickWhenNoRemote,
        },
        {
          clipboardWrite: (text) => navigator.clipboard.writeText(text),
          toastSuccess: (msg) => toast.success(msg),
          toastError: (msg) => toast.error(msg),
          logEvent: (msg) => console.log(msg),
        },
      );
    } catch {
      toast.error('Could not construct share URL.');
    }
    setBusy(false);
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Share doc"
          onClick={handleClick}
          disabled={busy}
          className="gap-1.5 text-muted-foreground"
          data-testid="share-button"
        >
          <Share2 className="size-3.5" aria-hidden />
          Share
        </Button>
      </TooltipTrigger>
      <TooltipContent>Share</TooltipContent>
    </Tooltip>
  );
}
