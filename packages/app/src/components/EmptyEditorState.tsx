import { DocumentListSuccessSchema } from '@inkeep/open-knowledge-core';
import { Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { OkBlob } from '@/components/OkBlob';
import { SeedDialog } from '@/components/SeedDialog';
import { Button } from '@/components/ui/button';
import { subscribeToDocumentsChanged } from '@/lib/documents-events';

type SeedStatus = 'loading' | 'has-work' | 'seeded' | 'error';

export function EmptyEditorState() {
  const [seedDialogOpen, setSeedDialogOpen] = useState(false);
  const [documentCount, setDocumentCount] = useState<number | null>(null);
  const [seedStatus, setSeedStatus] = useState<SeedStatus>('loading');
  const [celebrateSignal, setCelebrateSignal] = useState(0);
  // Sticky once true — fetch failures after first success keep the prior count.
  const documentCountResolvedRef = useRef(false);
  // Cleared on unmount so a late burst doesn't fire on a stale component.
  const celebrateTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      const docsPromise = fetch('/api/documents')
        .then(async (res) => {
          const body = (await res.json().catch(() => null)) as unknown;
          if (cancelled) return;
          const success = res.ok ? DocumentListSuccessSchema.safeParse(body) : null;
          if (success?.success) {
            setDocumentCount(success.data.documents.length);
            documentCountResolvedRef.current = true;
          } else if (!documentCountResolvedRef.current) {
            // Fallback on initial fetch failure — safer than pitching onboarding blind.
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
      clearTimeout(celebrateTimerRef.current);
    };
  }, []);

  function handleSeedApplied() {
    // Delayed so the dialog close + toast settle before attention shifts to the blob.
    clearTimeout(celebrateTimerRef.current);
    celebrateTimerRef.current = setTimeout(() => setCelebrateSignal((prev) => prev + 1), 250);
    setSeedStatus('seeded');
    // Apply also creates log.md — refetch so the empty-state copy switches branches in sync.
    fetch('/api/documents')
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as unknown;
        if (!res.ok) return;
        const success = DocumentListSuccessSchema.safeParse(body);
        if (success.success) {
          setDocumentCount(success.data.documents.length);
        }
      })
      .catch(() => {
        /* best-effort — celebration is the priority */
      });
  }

  const showCta = seedStatus === 'has-work';
  // Gate the copy until we know which branch to render — avoids flashing the wrong text.
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
        <Button
          variant="ghost"
          size="sm"
          className="uppercase font-mono text-xs"
          onClick={onCtaClick}
        >
          <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
          Initialize LLM brain
        </Button>
      ) : null}
    </div>
  );
}
