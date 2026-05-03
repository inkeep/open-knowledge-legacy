import { ArrowRight, CheckCircle2, Copy, Download, Loader2, MoveUpRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  Dialog as DialogRoot,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const INSTALL_COMMAND = 'npx @inkeep/open-knowledge install-skill';
const DOCS_URL = 'https://inkeep.github.io/open-knowledge/guides/install-claude-cowork';

interface InstallInClaudeDesktopDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'downloading' }
  | { kind: 'handed-off'; path?: string }
  | { kind: 'error'; message: string };

function isElectronHost(): boolean {
  return typeof window !== 'undefined' && typeof window.okDesktop?.skill === 'object';
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
  );
}

function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'font-mono tracking-wide uppercase text-primary font-medium text-xs',
        className,
      )}
    >
      {children}
    </p>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-5 w-5 shrink-0 items-center justify-center text-xs font-medium text-muted-foreground font-mono tabular-nums"
    >
      {n.toString().padStart(2, '0')}
    </span>
  );
}

function UploadStepsSection() {
  return (
    <div className="flex flex-col gap-3">
      <SectionLabel>In the Claude Desktop App</SectionLabel>
      <ol className="flex flex-col gap-4 text-sm">
        <li className="flex gap-3">
          <StepNumber n={1} />
          <span>
            Open <strong className="font-medium">Customize</strong> in the sidebar{' '}
            <ArrowRight aria-hidden="true" className="inline h-3 w-3 text-muted-foreground" />{' '}
            <strong className="font-medium">Skills</strong>.
          </span>
        </li>
        <li className="flex gap-3">
          <StepNumber n={2} />
          <span>
            Click{' '}
            <span className="inline-flex items-center justify-center font-medium border h-5 w-5 rounded-md text-xs">
              +
            </span>{' '}
            <ArrowRight aria-hidden="true" className="inline h-3 w-3 text-muted-foreground" />{' '}
            <strong className="font-medium">Create skill</strong>{' '}
            <ArrowRight aria-hidden="true" className="inline h-3 w-3 text-muted-foreground" />{' '}
            <strong className="font-medium">Upload skill</strong>.
          </span>
        </li>
        <li className="flex gap-3">
          <StepNumber n={3} />
          <span>
            Pick <InlineCode>openknowledge.skill</InlineCode> from your{' '}
            <strong className="font-medium">Downloads</strong> folder. It enables automatically.
          </span>
        </li>
      </ol>
      <p className="text-xs text-muted-foreground mt-4">
        Don't see <strong className="font-medium">Skills</strong>? Enable{' '}
        <strong className="font-medium">
          Settings{' '}
          <ArrowRight aria-hidden="true" className="inline h-3 w-3 text-muted-foreground" />{' '}
          Capabilities{' '}
          <ArrowRight aria-hidden="true" className="inline h-3 w-3 text-muted-foreground" /> Code
          execution and file creation
        </strong>{' '}
        first.
      </p>
    </div>
  );
}

export function InstallInClaudeDesktopDialog({
  open,
  onOpenChange,
}: InstallInClaudeDesktopDialogProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [commandCopied, setCommandCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      setPhase({ kind: 'idle' });
      setCommandCopied(false);
    }
  }, [open]);

  async function handleInstallElectron() {
    setPhase({ kind: 'downloading' });
    const bridge = window.okDesktop?.skill;
    if (!bridge) {
      setPhase({
        kind: 'error',
        message: 'Electron bridge unavailable. Refresh and try again.',
      });
      return;
    }
    const result = await bridge.buildAndOpen();
    if (result.ok) {
      setPhase({ kind: 'handed-off', path: result.path });
    } else {
      const msg = result.message ?? result.reason;
      toast.error(`Install handoff failed: ${msg}`);
      setPhase({
        kind: 'error',
        message:
          result.reason === 'open-failed'
            ? `The Claude Desktop App didn't open the file. Is it installed? (${msg})`
            : `${result.reason}: ${msg}`,
      });
    }
  }

  async function handleCopyCommand() {
    try {
      await navigator.clipboard.writeText(INSTALL_COMMAND);
      setCommandCopied(true);
      setTimeout(() => setCommandCopied(false), 2000);
    } catch (err) {
      toast.error(`Couldn't copy: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const isElectron = isElectronHost();

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-ok-layer-spawned="">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download aria-hidden="true" className="h-4 w-4" />
            Install for Claude Chat & Cowork
          </DialogTitle>
          <DialogDescription>
            Adds the Open Knowledge skill to the{' '}
            <strong className="font-medium text-foreground">Claude Desktop App</strong> so it's
            available in Chat and Cowork sessions.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <div className="flex flex-col gap-6 py-2">
            {/* --------- ELECTRON IDLE: pre-install walkthrough --------- */}
            {phase.kind === 'idle' && isElectron && (
              <>
                <div className="flex flex-col gap-2">
                  <SectionLabel className="text-muted-foreground">Automatic</SectionLabel>
                  <p className="text-sm">
                    We'll build <InlineCode>openknowledge.skill</InlineCode>, save it to{' '}
                    <InlineCode>~/Downloads</InlineCode>, and open the Claude Desktop App for you.
                  </p>
                </div>
                <UploadStepsSection />
              </>
            )}

            {/* --------- WEB IDLE: terminal command walkthrough --------- */}
            {phase.kind === 'idle' && !isElectron && (
              <>
                <div className="flex flex-col gap-2">
                  <SectionLabel>Run this in your terminal</SectionLabel>
                  <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-2">
                    <code className="flex-1 font-mono text-xs">{INSTALL_COMMAND}</code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCopyCommand}
                      aria-label="Copy command"
                      className="h-7 gap-1"
                    >
                      {commandCopied ? (
                        <>
                          <CheckCircle2 aria-hidden="true" className="h-3 w-3" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy aria-hidden="true" className="h-3 w-3" />
                          Copy
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Saves the file to <InlineCode>~/Downloads/openknowledge.skill</InlineCode> and
                    opens the Claude Desktop App. Requires Node.js or Bun on your PATH.
                  </p>
                </div>
                <UploadStepsSection />
              </>
            )}

            {/* --------- DOWNLOADING (Electron only) --------- */}
            {phase.kind === 'downloading' && (
              <div className="flex items-center gap-2 text-sm">
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                Building <InlineCode>openknowledge.skill</InlineCode> and opening the Claude Desktop
                App…
              </div>
            )}

            {/* --------- HANDED-OFF (Electron) --------- */}
            {phase.kind === 'handed-off' && isElectron && (
              <>
                <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
                  <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 text-primary" />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-foreground">
                      File saved & Claude Desktop App opened
                    </span>
                    <code className="font-mono text-xs text-muted-foreground">
                      {phase.path ?? '~/Downloads/openknowledge.skill'}
                    </code>
                  </div>
                </div>
                <UploadStepsSection />
              </>
            )}

            {/* --------- HANDED-OFF (web — user ran CLI themselves) --------- */}
            {phase.kind === 'handed-off' && !isElectron && (
              <>
                <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
                  <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 text-primary" />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-foreground">Download started</span>
                    <span className="text-xs text-muted-foreground">
                      File saves to <InlineCode>~/Downloads/openknowledge.skill</InlineCode>.
                    </span>
                  </div>
                </div>
                <UploadStepsSection />
              </>
            )}

            {/* --------- ERROR --------- */}
            {phase.kind === 'error' && (
              <div className="flex flex-col gap-2 text-sm">
                <span className="text-destructive">{phase.message}</span>
                <a
                  href={DOCS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs underline underline-offset-2 hover:text-foreground"
                >
                  See the full install guide
                </a>
              </div>
            )}
          </div>
        </DialogBody>

        <DialogFooter>
          {phase.kind !== 'error' && (
            <a
              href={DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 self-center text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground sm:mr-auto font-mono tracking-wide uppercase"
            >
              Full guide
              <MoveUpRight aria-hidden="true" className="h-3 w-3" />
            </a>
          )}
          {phase.kind === 'idle' && isElectron && (
            <>
              <Button
                className="uppercase font-mono"
                variant="ghost"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleInstallElectron}>
                <Download aria-hidden="true" className="h-4 w-4" />
                Install
              </Button>
            </>
          )}
          {phase.kind === 'idle' && !isElectron && (
            <Button
              className="uppercase font-mono"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          )}
          {phase.kind === 'error' && isElectron && (
            <>
              <Button
                className="uppercase font-mono"
                variant="ghost"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleInstallElectron}>
                <Download aria-hidden="true" className="h-4 w-4" />
                Try again
              </Button>
            </>
          )}
          {phase.kind === 'downloading' && (
            <Button disabled>
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              Installing…
            </Button>
          )}
          {phase.kind === 'handed-off' && <Button onClick={() => onOpenChange(false)}>Done</Button>}
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}
