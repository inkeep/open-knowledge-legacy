import { CheckCircle2, Download, ExternalLink, Loader2, MousePointer2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  Dialog as DialogRoot,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * `InstallInClaudeDesktopDialog` — concierge for installing the Open Knowledge
 * skill into Claude Desktop / Cowork. Implements SPEC 2026-04-24 FR9-FR14.
 *
 * Two-click install relies on Claude.app's `.skill` `CFBundleDocumentType` (D21):
 *
 *   1. User clicks "Install" in this dialog → we (Electron) download the pinned
 *      `openknowledge.skill` to ~/Downloads and `shell.openPath(...)` routes it
 *      to Claude Desktop via the OS file association. Web mode: trigger a
 *      browser download; user double-clicks the file in their downloads folder.
 *   2. Claude Desktop's own native install dialog appears; user clicks Install
 *      there. Our dialog transitions to a "follow prompts in Claude" state.
 *
 * Runtime branches on `'okDesktop' in window`:
 *   - Electron: calls `window.okDesktop.skill.downloadAndOpen(pinnedUrl)` which
 *     resolves once Claude has been handed the file. Renderer treats resolve as
 *     "handoff succeeded" and shows the "follow prompts in Claude" state.
 *   - Web: anchor-download the always-latest release asset. No handoff — user
 *     completes the install themselves.
 *
 * Mount pattern: the dialog is kept closed by default; parent controls via
 * `open` / `onOpenChange` like other OK dialogs (see SeedDialog precedent).
 * Trigger surfaces (menu item, hash route, in-app CTA) are a follow-up —
 * this component exposes the prop-controlled visibility the trigger wires up.
 */

const LATEST_RELEASE_ASSET_URL =
  'https://github.com/inkeep/open-knowledge/releases/latest/download/openknowledge.skill';

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

export function InstallInClaudeDesktopDialog({
  open,
  onOpenChange,
}: InstallInClaudeDesktopDialogProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  useEffect(() => {
    if (!open) setPhase({ kind: 'idle' });
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
    const result = await bridge.downloadAndOpen(LATEST_RELEASE_ASSET_URL);
    if (result.ok) {
      setPhase({ kind: 'handed-off', path: result.path });
    } else {
      const msg = result.message ?? result.reason;
      toast.error(`Install handoff failed: ${msg}`);
      setPhase({
        kind: 'error',
        message:
          result.reason === 'open-failed'
            ? `Claude Desktop didn't open the file. Is it installed? (${msg})`
            : `${result.reason}: ${msg}`,
      });
    }
  }

  function handleInstallWeb() {
    // Anchor-download: browsers treat the href + download attribute as a
    // hint to save the file rather than navigate. GitHub's /releases/latest/
    // /download/ URL 302s to the versioned asset; the redirect preserves the
    // download-attribute intent.
    const anchor = document.createElement('a');
    anchor.href = LATEST_RELEASE_ASSET_URL;
    anchor.download = 'openknowledge.skill';
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setPhase({ kind: 'handed-off' });
  }

  const isElectron = isElectronHost();

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-ok-layer-spawned="">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download aria-hidden="true" className="h-4 w-4" />
            Install in Claude Desktop
          </DialogTitle>
          <DialogDescription>
            Open Knowledge isn't installable via <code>npx skills add</code> in Claude Desktop or
            Cowork — Anthropic gates custom skills behind a manual upload. We ship a{' '}
            <code>.skill</code> file that Claude Desktop opens natively on double-click.{' '}
            <a href={DOCS_URL} className="underline" target="_blank" rel="noopener noreferrer">
              Read the guide <ExternalLink aria-hidden="true" className="inline h-3 w-3" />
            </a>
            .
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          {phase.kind === 'idle' && (
            <>
              <ol className="ml-4 list-decimal space-y-1 text-sm">
                <li>
                  Click <strong>Install</strong> below.
                </li>
                {isElectron ? (
                  <li>
                    We'll download <code>openknowledge.skill</code> and open it with Claude Desktop
                    automatically.
                  </li>
                ) : (
                  <li>
                    Your browser will download <code>openknowledge.skill</code>. Double-click it in
                    your Downloads folder to hand it to Claude Desktop.
                  </li>
                )}
                <li>Confirm the install in Claude's native dialog.</li>
              </ol>
              {!isElectron && (
                <p className="text-xs text-muted-foreground">
                  If nothing happens on double-click, right-click the file → <em>Open With</em> →{' '}
                  <em>Claude</em>.
                </p>
              )}
            </>
          )}

          {phase.kind === 'downloading' && (
            <div className="flex items-center gap-2 text-sm">
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              Downloading <code>openknowledge.skill</code> and handing off to Claude Desktop…
            </div>
          )}

          {phase.kind === 'handed-off' && isElectron && (
            <div className="flex items-start gap-2 text-sm">
              <MousePointer2 aria-hidden="true" className="mt-0.5 h-4 w-4 text-primary" />
              <span>
                Handed off to Claude Desktop. Follow the prompts in Claude's install dialog to
                complete setup.
                {phase.path && (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Saved to <code>{phase.path}</code>.
                  </span>
                )}
              </span>
            </div>
          )}

          {phase.kind === 'handed-off' && !isElectron && (
            <div className="flex items-start gap-2 text-sm">
              <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 text-primary" />
              <span>
                Download started. Find <code>openknowledge.skill</code> in your browser's downloads
                and double-click it. Claude Desktop will open its install dialog.
              </span>
            </div>
          )}

          {phase.kind === 'error' && (
            <div className="flex flex-col gap-2 text-sm">
              <span className="text-destructive">{phase.message}</span>
              <a
                href={DOCS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs underline"
              >
                See the full install guide
              </a>
            </div>
          )}
        </div>

        <DialogFooter>
          {(phase.kind === 'idle' || phase.kind === 'error') && (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={() => (isElectron ? handleInstallElectron() : handleInstallWeb())}>
                <Download aria-hidden="true" className="mr-2 h-4 w-4" />
                Install
              </Button>
            </>
          )}
          {phase.kind === 'downloading' && (
            <Button disabled>
              <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
              Installing…
            </Button>
          )}
          {phase.kind === 'handed-off' && <Button onClick={() => onOpenChange(false)}>Done</Button>}
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}
