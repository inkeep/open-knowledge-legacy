import { DocumentListSuccessSchema } from '@inkeep/open-knowledge-core';
import { ArrowRightIcon, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AgentHandoffGrid } from '@/components/empty-state/AgentHandoffGrid';
import { EmptyStateHeader } from '@/components/empty-state/EmptyStateHeader';
import { KeyboardHintsFooter } from '@/components/empty-state/KeyboardHintsFooter';
import { filterVisibleEntries } from '@/components/file-tree-utils';
import { PackCardGrid } from '@/components/PackCardGrid';
import { SeedDialog } from '@/components/SeedDialog';
import { Button } from '@/components/ui/button';
import { emitCreateTopLevelFile } from '@/lib/create-file-events';
import type { OkPackId } from '@/lib/desktop-bridge-types';
import { subscribeToDocumentsChanged } from '@/lib/documents-events';

export function EmptyEditorState() {
  const [seedDialogOpen, setSeedDialogOpen] = useState(false);
  const [seedDialogInitialPackId, setSeedDialogInitialPackId] = useState<OkPackId | undefined>(
    undefined,
  );
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

  function handleDialogOpenChange(next: boolean) {
    setSeedDialogOpen(next);
    if (!next) setSeedDialogInitialPackId(undefined);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-6 subtle-scrollbar">
      {messageReady ? (
        isOnboarding ? (
          <OnboardingView
            celebrateSignal={celebrateSignal}
            onPackSelect={(packId) => {
              setSeedDialogInitialPackId(packId);
              setSeedDialogOpen(true);
            }}
          />
        ) : (
          <AgentHandoffView
            celebrateSignal={celebrateSignal}
            onAddStarterPack={() => {
              setSeedDialogOpen(true);
            }}
          />
        )
      ) : null}
      <SeedDialog
        open={seedDialogOpen}
        onOpenChange={handleDialogOpenChange}
        onSeedApplied={handleSeedApplied}
        initialPackId={seedDialogInitialPackId}
      />
    </div>
  );
}

export function countEntries(
  entries: ReadonlyArray<{ kind?: unknown; docName?: string; path?: string }>,
): number {
  return filterVisibleEntries(entries).filter(
    (entry) => entry.kind === 'document' || entry.kind === 'folder',
  ).length;
}

function OnboardingView({
  celebrateSignal,
  onPackSelect,
}: {
  celebrateSignal: number;
  onPackSelect: (packId: OkPackId) => void;
}) {
  return (
    <div className="flex w-full flex-col gap-10 py-12 max-w-5xl my-auto">
      <EmptyStateHeader
        title="Let's set up your project."
        subtitle="Pick a starter pack to scaffold folders, templates, and AI-readable rules."
        celebrateSignal={celebrateSignal}
      />
      {/* Group the grid + escape hatch in their own tight container so the
          link sits close beneath the cards while the header above keeps the
          parent's wider `gap-10` breathing room. */}
      <div className="flex w-full flex-col gap-3">
        <PackCardGrid onPackSelect={onPackSelect} />
        {/* Escape hatch for users who don't want a scaffolded layout — fires
            the same window-level event the sidebar toolbar uses, so the new
            file lands with the standard inline-rename flow (sidebar handles
            focus + navigation). */}
        <Button
          variant="link"
          className="text-muted-foreground font-normal justify-end"
          size="sm"
          onClick={emitCreateTopLevelFile}
        >
          or start from scratch <ArrowRightIcon aria-hidden="true" className="size-3" />
        </Button>
      </div>
    </div>
  );
}

function AgentHandoffView({
  celebrateSignal,
  onAddStarterPack,
}: {
  celebrateSignal: number;
  onAddStarterPack: () => void;
}) {
  return (
    <div className="flex w-full flex-col gap-10 py-12 max-w-5xl my-auto">
      <EmptyStateHeader
        title="Open in your favorite AI editor."
        subtitle="Select a file from the sidebar, or pick where to edit alongside your agent."
        celebrateSignal={celebrateSignal}
      />
      <div className="flex w-full flex-col gap-4">
        <AgentHandoffGrid />
        <div className="flex w-full items-center justify-between gap-4">
          <Button
            onClick={onAddStarterPack}
            variant="link"
            size="xs"
            className="font-mono text-2xs uppercase tracking-wider text-muted-foreground font-normal hover:text-foreground hover:no-underline"
          >
            <Plus aria-hidden="true" className="size-3" />
            Add a starter pack
          </Button>
          <KeyboardHintsFooter />
        </div>
      </div>
    </div>
  );
}
