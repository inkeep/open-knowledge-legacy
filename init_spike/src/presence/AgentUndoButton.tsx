import { Undo2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
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
      } catch (e) {
        console.debug('[agent-undo] Status poll failed:', e);
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
    } catch (e) {
      console.error('[agent-undo] Undo request failed:', e);
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
    } catch (e) {
      console.error('[agent-undo] Redo request failed:', e);
    } finally {
      setIsPending(false);
    }
  }, []);

  return { canUndo, canRedo, isPending, undo, redo };
}

export function AgentUndoButton() {
  const { canUndo, isPending, undo } = useAgentUndo();

  // Track false→true transition so the scale+glow animation fires exactly once per enable,
  // not on every re-render. Reset when canUndo returns to false.
  const [justEnabled, setJustEnabled] = useState(false);
  const prevCanUndoRef = useRef(false);
  useEffect(() => {
    if (canUndo && !prevCanUndoRef.current) {
      setJustEnabled(true);
      const timer = setTimeout(() => setJustEnabled(false), 600);
      prevCanUndoRef.current = canUndo;
      return () => clearTimeout(timer);
    }
    prevCanUndoRef.current = canUndo;
  }, [canUndo]);

  const undoState = isPending ? 'pending' : canUndo ? 'ready' : 'disabled';

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={!canUndo || isPending}
      onClick={undo}
      data-undo-state={undoState}
      data-undo-just-enabled={justEnabled ? 'true' : 'false'}
      className="border-agent/50 text-agent hover:bg-agent/10 disabled:opacity-40"
    >
      <Undo2 className="size-3.5" />
      <span>Undo Agent Edit</span>
    </Button>
  );
}
