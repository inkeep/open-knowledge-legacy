import { DocumentListSuccessSchema } from '@inkeep/open-knowledge-core';
import { Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { OkBlob } from '@/components/OkBlob';
import { SeedDialog } from '@/components/SeedDialog';
import { Button } from '@/components/ui/button';
import { subscribeToDocumentsChanged } from '@/lib/documents-events';

export function EmptyEditorState() {
  const [seedDialogOpen, setSeedDialogOpen] = useState(false);
  const [documentCount, setDocumentCount] = useState<number | null>(null);
  const [celebrateSignal, setCelebrateSignal] = useState(0);
  const documentCountResolvedRef = useRef(false);
  const celebrateTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const res = await fetch('/api/documents');
        const body = (await res.json().catch(() => null)) as unknown;
        if (cancelled) return;
        const success = res.ok ? DocumentListSuccessSchema.safeParse(body) : null;
        if (success?.success) {
          setDocumentCount(countEntries(success.data.documents));
          documentCountResolvedRef.current = true;
        } else if (!documentCountResolvedRef.current) {
          setDocumentCount(1);
          documentCountResolvedRef.current = true;
        }
      } catch {
        if (!cancelled && !documentCountResolvedRef.current) {
          setDocumentCount(1);
          documentCountResolvedRef.current = true;
        }
      }
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
    clearTimeout(celebrateTimerRef.current);
    celebrateTimerRef.current = setTimeout(() => setCelebrateSignal((prev) => prev + 1), 250);
    fetch('/api/documents')
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as unknown;
        if (!res.ok) return;
        const success = DocumentListSuccessSchema.safeParse(body);
        if (success.success) {
          setDocumentCount(countEntries(success.data.documents));
        }
      })
      .catch(() => {});
  }

  const messageReady = documentCount !== null;
  const isOnboarding = documentCount === 0;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
      <OkBlob size={80} celebrateSignal={celebrateSignal} />
      {messageReady ? (
        isOnboarding ? (
          <OnboardingMessage onCtaClick={() => setSeedDialogOpen(true)} />
        ) : (
          <NoSelectionMessage />
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

function countEntries(entries: ReadonlyArray<{ kind?: unknown }>): number {
  return entries.filter((entry) => entry.kind === 'document' || entry.kind === 'folder').length;
}

function OnboardingMessage({ onCtaClick }: { onCtaClick: () => void }) {
  return (
    <div className="flex max-w-sm flex-col items-center gap-3 text-center">
      <h2 className="text-base font-medium">Welcome to Open Knowledge</h2>
      <p className="text-sm text-muted-foreground">
        Pick a starter pack to scaffold a folder layout — or skip and start writing in the sidebar.
        Packs ship with templates and agent-readable descriptions so AI tools work with your vault
        out of the box.
      </p>
      <Button className="mt-1" onClick={onCtaClick}>
        <Sparkles aria-hidden="true" className="h-4 w-4" />
        Pick a starter pack
      </Button>
    </div>
  );
}

function NoSelectionMessage() {
  return (
    <div className="flex flex-col items-center gap-3">
      <span className="select-none text-sm text-muted-foreground">Select a document to edit</span>
    </div>
  );
}
