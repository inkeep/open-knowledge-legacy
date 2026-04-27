import { Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { OkBlob } from '@/components/OkBlob';
import { SeedDialog } from '@/components/SeedDialog';
import { Button } from '@/components/ui/button';
import { subscribeToDocumentsChanged } from '@/lib/documents-events';

type SeedStatus = 'loading' | 'has-work' | 'seeded' | 'error';

/**
 * Landing state when no document is selected. Branches on file count:
 * - **Onboarding** (zero files): warm welcome + primary CTA to set up the
 *   three-layer starter structure
 * - **No selection** (files exist): "select a document to edit" with a
 *   subtle CTA only if the starter scaffold hasn't been applied yet
 *
 * The CTA is hidden once `/api/seed/plan` reports nothing left to do — the
 * signal is filesystem-derived, so it survives refreshes and respects
 * scaffolding done via the CLI or another window. Initial loading hides the
 * CTA until both fetches resolve, avoiding the flicker of seeing the button
 * pop in and immediately disappear on an already-seeded workspace.
 *
 * Works in both the Electron desktop app and the web editor — the SeedDialog
 * internally routes to IPC when `window.okDesktop` is present, otherwise to
 * the `/api/seed/*` HTTP endpoints.
 */
export function EmptyEditorState() {
  const [seedDialogOpen, setSeedDialogOpen] = useState(false);
  const [documentCount, setDocumentCount] = useState<number | null>(null);
  const [seedStatus, setSeedStatus] = useState<SeedStatus>('loading');
  const [celebrateSignal, setCelebrateSignal] = useState(0);
  // Tracks whether we've successfully resolved the document count at least
  // once. On fetch failure the fallback below pitches the "has files" copy,
  // but only on the *first* load — subsequent transient failures shouldn't
  // overwrite a previously-good count.
  const documentCountResolvedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      const docsPromise = fetch('/api/documents')
        .then(async (res) => {
          const data = (await res.json().catch(() => null)) as {
            ok: boolean;
            documents?: unknown[];
          } | null;
          if (cancelled) return;
          if (res.ok && data?.ok && Array.isArray(data.documents)) {
            setDocumentCount(data.documents.length);
            documentCountResolvedRef.current = true;
          } else if (!documentCountResolvedRef.current) {
            // Fall back to "files exist" copy on fetch failure — safer than
            // pitching onboarding to a workspace whose contents we couldn't
            // read.
            setDocumentCount(1);
            documentCountResolvedRef.current = true;
          }
        })
        .catch(() => {
          if (!cancelled && !documentCountResolvedRef.current) {
            setDocumentCount(1);
            documentCountResolvedRef.current = true;
          }
        });

      const planPromise = (async () => {
        const okDesktop = typeof window !== 'undefined' ? window.okDesktop : undefined;
        try {
          const result = okDesktop?.seed
            ? await okDesktop.seed.plan()
            : await fetch('/api/seed/plan').then((r) => r.json());
          if (cancelled) return;
          if (!result?.ok) {
            setSeedStatus('error');
            return;
          }
          const hasWork = result.plan.created.length > 0 || result.plan.configEdits.length > 0;
          setSeedStatus(hasWork ? 'has-work' : 'seeded');
        } catch {
          if (!cancelled) setSeedStatus('error');
        }
      })();

      await Promise.all([docsPromise, planPromise]);
    }

    void refresh();
    const unsubscribe = subscribeToDocumentsChanged((channels) => {
      if (channels.includes('files')) void refresh();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  function handleSeedApplied() {
    // Delay the burst so the dialog's close animation + toast settle before
    // the blob bursts — without this gap the celebration starts while
    // attention is still on the dismissing modal and the moment is missed.
    setTimeout(() => setCelebrateSignal((prev) => prev + 1), 250);
    setSeedStatus('seeded');
    // The apply also creates log.md, so the doc count will tick up — refetch
    // so the empty-state copy transitions to the "has files" branch in sync
    // with the celebration.
    fetch('/api/documents')
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as {
          ok: boolean;
          documents?: unknown[];
        } | null;
        if (res.ok && data?.ok && Array.isArray(data.documents)) {
          setDocumentCount(data.documents.length);
        }
      })
      .catch(() => {
        /* swallow — celebration is the priority, count refresh is best-effort */
      });
  }

  const showCta = seedStatus === 'has-work';
  // Hide message text until we know which branch to render — keeps the empty
  // state from flashing the wrong copy on slow networks. The blob alone is a
  // friendly placeholder for the brief loading window.
  const messageReady = documentCount !== null && seedStatus !== 'loading';
  const isOnboarding = documentCount === 0;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
      <OkBlob size={80} celebrateSignal={celebrateSignal} />
      {messageReady ? (
        isOnboarding ? (
          <OnboardingMessage onCtaClick={() => setSeedDialogOpen(true)} showCta={showCta} />
        ) : (
          <NoSelectionMessage onCtaClick={() => setSeedDialogOpen(true)} showCta={showCta} />
        )
      ) : null}
      <SeedDialog
        open={seedDialogOpen}
        onOpenChange={setSeedDialogOpen}
        onSeedApplied={handleSeedApplied}
      />
    </div>
  );
}

function OnboardingMessage({ onCtaClick, showCta }: { onCtaClick: () => void; showCta: boolean }) {
  return (
    <div className="flex max-w-sm flex-col items-center gap-3 text-center">
      <h2 className="text-base font-medium">Welcome to your LLM brain</h2>
      <p className="text-sm text-muted-foreground">
        A space for working with AI agents. Start with a curated layer structure — or create your
        own files in the sidebar.
      </p>
      {showCta ? (
        <Button className="mt-1" onClick={onCtaClick}>
          <Sparkles aria-hidden="true" className="h-4 w-4" />
          Initialize LLM brain
        </Button>
      ) : null}
    </div>
  );
}

function NoSelectionMessage({ onCtaClick, showCta }: { onCtaClick: () => void; showCta: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <span className="select-none text-sm text-muted-foreground">Select a document to edit</span>
      {showCta ? (
        <Button variant="ghost" size="sm" className="text-xs" onClick={onCtaClick}>
          <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
          Initialize LLM brain
        </Button>
      ) : null}
    </div>
  );
}
