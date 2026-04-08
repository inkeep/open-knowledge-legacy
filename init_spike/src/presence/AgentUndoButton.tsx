import { Undo2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

interface AgentUndoState {
  canUndo: boolean;
  canRedo: boolean;
  isPending: boolean;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

function useAgentUndo(): AgentUndoState {
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isPending, setIsPending] = useState(false);

  // Poll status every 2s
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch('/api/agent-undo-status');
        if (!active) return;
        if (res.ok) {
          const data = (await res.json()) as { canUndo: boolean; canRedo: boolean };
          setCanUndo(data.canUndo);
          setCanRedo(data.canRedo);
        }
      } catch {
        // Silently ignore fetch errors
      }
    };

    poll();
    const interval = setInterval(poll, 2000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const undo = useCallback(async () => {
    setIsPending(true);
    try {
      const res = await fetch('/api/agent-undo', { method: 'POST' });
      if (res.ok) {
        const data = (await res.json()) as { ok: boolean; canUndo: boolean; canRedo: boolean };
        setCanUndo(data.canUndo);
        setCanRedo(data.canRedo);
      }
    } finally {
      setIsPending(false);
    }
  }, []);

  const redo = useCallback(async () => {
    setIsPending(true);
    try {
      const res = await fetch('/api/agent-redo', { method: 'POST' });
      if (res.ok) {
        const data = (await res.json()) as { ok: boolean; canUndo: boolean; canRedo: boolean };
        setCanUndo(data.canUndo);
        setCanRedo(data.canRedo);
      }
    } finally {
      setIsPending(false);
    }
  }, []);

  return { canUndo, canRedo, isPending, undo, redo };
}

export function AgentUndoButton() {
  const { canUndo, isPending, undo } = useAgentUndo();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={!canUndo || isPending}
      onClick={undo}
      className="border-agent/50 text-agent hover:bg-agent/10 disabled:opacity-40"
    >
      <Undo2 className="size-3.5" />
      <span>Undo Agent Edit</span>
    </Button>
  );
}
