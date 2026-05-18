import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/ui/tooltip';

const COPIED_RESET_MS = 1500;

export function CopyButton({ copyContent }: { copyContent: string }) {
  const [copied, setCopied] = useState(false);
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetRef.current !== null) clearTimeout(resetRef.current);
    };
  }, []);

  const handleClick = () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(copyContent).then(
          () => {
            setCopied(true);
            if (resetRef.current !== null) clearTimeout(resetRef.current);
            resetRef.current = setTimeout(() => setCopied(false), COPIED_RESET_MS);
          },
          () => {},
        );
      }
    } catch {}
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={copied ? 'Copied!' : 'Copy'}
          onClick={handleClick}
          data-slot="prop-panel-copy"
        >
          {copied ? (
            <Check className="size-3.5" aria-hidden="true" />
          ) : (
            <Copy className="size-3.5" aria-hidden="true" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{copied ? 'Copied!' : 'Copy'}</TooltipContent>
    </Tooltip>
  );
}
