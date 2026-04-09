import { Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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

  // Poll status with exponential backoff on failures.
  // Base interval 2s. Failures double up to a 30s cap; resets on next success.
  // Prevents thundering-herd during server outages.
  useEffect(() => {
    let active = true;
    let timer: number | null = null;
    let currentDelayMs = 2000;
    const BASE_DELAY_MS = 2000;
    const MAX_DELAY_MS = 30_000;

    const scheduleNext = () => {
      if (!active) return;
      timer = setTimeout(poll, currentDelayMs);
    };

    const poll = async () => {
      try {
        const res = await fetch('/api/agent-undo-status');
        if (!active) return;
        if (res.ok) {
          const data = (await res.json()) as { canUndo: boolean; canRedo: boolean };
          setCanUndo(data.canUndo);
          setCanRedo(data.canRedo);
          currentDelayMs = BASE_DELAY_MS; // reset backoff on success
        } else {
          // Non-2xx response — back off (server is reachable but unhealthy)
          currentDelayMs = Math.min(currentDelayMs * 2, MAX_DELAY_MS);
          console.warn('[agent-undo] Status poll returned non-ok:', res.status);
        }
      } catch (e) {
        // Network error — back off more aggressively
        currentDelayMs = Math.min(currentDelayMs * 2, MAX_DELAY_MS);
        console.warn('[agent-undo] Status poll failed (backoff →', currentDelayMs, 'ms):', e);
      }
      scheduleNext();
    };

    poll();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  async function undo() {
    setIsPending(true);
    try {
      const res = await fetch('/api/agent-undo', { method: 'POST' });
      if (res.ok) {
        const data = (await res.json()) as { ok: boolean; canUndo: boolean; canRedo: boolean };
        setCanUndo(data.canUndo);
        setCanRedo(data.canRedo);
      } else {
        console.warn('[agent-undo] Undo request returned non-ok:', res.status);
      }
    } catch (e) {
      console.warn('[agent-undo] Undo request failed:', e);
    } finally {
      setIsPending(false);
    }
  }

  async function redo() {
    setIsPending(true);
    try {
      const res = await fetch('/api/agent-redo', { method: 'POST' });
      if (res.ok) {
        const data = (await res.json()) as { ok: boolean; canUndo: boolean; canRedo: boolean };
        setCanUndo(data.canUndo);
        setCanRedo(data.canRedo);
      } else {
        console.warn('[agent-undo] Redo request returned non-ok:', res.status);
      }
    } catch (e) {
      console.warn('[agent-undo] Redo request failed:', e);
    } finally {
      setIsPending(false);
    }
  }

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
