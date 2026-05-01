/**
 * AuthModal — GitHub sign-in dialog.
 *
 * Two modes:
 *   'device'  — Device Flow (default): shows user_code, polls for completion,
 *               2-minute timeout. Calls POST /api/local-op/auth/login (streaming JSONL).
 *   'pat'     — PAT fallback: text input, validated via POST /api/local-op/auth/pat.
 *
 * Variant props:
 *   identityPrompt — when true, shows Name + Email fields after sign-in for unset
 *                    git identity (FR38 re-auth variant).
 *   reauth        — when true, shows "Re-authenticate" heading instead of "Sign in".
 *
 * On success: calls onSuccess({ login, name, avatarUrl }) and closes.
 */
import { type ProblemDetails, ProblemDetailsSchema } from '@inkeep/open-knowledge-core';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { type AuthTransport, httpAuthTransport } from '@/lib/transports/auth-transport';
import { consumeAuthEventStream } from './auth-event-stream';
import { Button } from './ui/button';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';

// ── NDJSON event types from /api/local-op/auth/login ──────────────────────────

interface DeviceVerificationEvent {
  type: 'verification';
  user_code: string;
  verification_uri: string;
  expires_in: number;
}

interface DeviceCompleteEvent {
  type: 'complete';
  login: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
}

/**
 * Mid-stream error event per US-005 streaming envelope (D36 c). Replaces the
 * pre-migration `{ type: 'error', message: string }` shape — title is sourced
 * from the typed `problem` payload.
 */
interface DeviceErrorEvent {
  type: 'error';
  problem: ProblemDetails;
}

type DeviceEvent = DeviceVerificationEvent | DeviceCompleteEvent | DeviceErrorEvent;

// ── helpers ───────────────────────────────────────────────────────────────────

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* ignore — clipboard not available */
  }
}

interface AuthSuccessResult {
  login: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
}

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (result: AuthSuccessResult) => void;
  /** Show git identity fields (Name + Email) after sign-in. */
  identityPrompt?: boolean;
  /** Show "Re-authenticate" heading. */
  reauth?: boolean;
  /**
   * Transport for the device-flow subprocess. Defaults to the HTTP path
   * (POST /api/local-op/auth/login) so existing editor / web callers
   * don't change. The Project Navigator passes an IPC transport because
   * its window has no backing API server.
   */
  transport?: AuthTransport;
}

// ── Device Flow panel ─────────────────────────────────────────────────────────

interface DeviceFlowPanelProps {
  onSuccess: (result: AuthSuccessResult) => void;
  onCancel: () => void;
  transport: AuthTransport;
}

const DEVICE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

function DeviceFlowPanel({ onSuccess, onCancel, transport }: DeviceFlowPanelProps) {
  const [userCode, setUserCode] = useState<string | null>(null);
  const [verificationUri, setVerificationUri] = useState('https://github.com/login/device');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [timeLeft, setTimeLeft] = useState(DEVICE_TIMEOUT_MS);
  const cancelRef = useRef<(() => void) | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function startDeviceFlow() {
    setError(null);
    setPolling(true);
    try {
      const handle = transport.start();
      cancelRef.current = handle.cancel;
      // Manual iterator drive — React Compiler (BuildHIR) does not yet
      // support `for await ... of` lowering, so we walk the iterator with
      // explicit `next()` calls instead.
      const iter = handle.events[Symbol.asyncIterator]();
      let sawTerminal = false;
      let result = await iter.next();
      while (!result.done) {
        const event = result.value;
        if (event.type === 'verification') {
          setUserCode(event.user_code);
          setVerificationUri(event.verification_uri);
          setTimeLeft(event.expires_in * 1000);
          void copyToClipboard(event.user_code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        } else if (event.type === 'complete') {
          sawTerminal = true;
          setPolling(false);
          onSuccess({
            login: event.login,
            name: event.name,
            email: event.email,
            avatarUrl: event.avatarUrl,
          });
          break;
        } else if (event.type === 'error') {
          sawTerminal = true;
          setError(event.message);
          setPolling(false);
          break;
        }
        result = await iter.next();
      }
      if (!sawTerminal) {
        setError('Sign-in stream ended without confirmation — please try again');
        setPolling(false);
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError('Connection error — try again');
      }
      setPolling(false);
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: start device flow once on mount
  useEffect(() => {
    // Defer the start by one microtask so React StrictMode's dev-mode
    // mount→cleanup→remount cycle coalesces into a single start. Without
    // this, the first mount's IPC `:start` fires, the cleanup chains a
    // cancel onto its (still-pending) promise, and the second mount's
    // `:start` reaches main BEFORE the chained cancel — main's
    // single-in-flight guard then rejects the second start with "An auth
    // login operation is already in progress". The microtask defer lets
    // the first mount's cleanup set `cancelled = true` before its start
    // ever fires, leaving only the second mount's start to run.
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      void startDeviceFlow();
    });
    return () => {
      cancelled = true;
      cancelRef.current?.();
      cancelRef.current = null;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!userCode) return;
    const start = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      const remaining = DEVICE_TIMEOUT_MS - elapsed;
      if (remaining <= 0) {
        setTimeLeft(0);
        if (timerRef.current) clearInterval(timerRef.current);
        setError('Code expired — please try again');
      } else {
        setTimeLeft(remaining);
      }
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [userCode]);

  const minutesLeft = Math.floor(timeLeft / 60_000);
  const secondsLeft = Math.floor((timeLeft % 60_000) / 1000);
  const timeLabel = `${minutesLeft}:${secondsLeft.toString().padStart(2, '0')}`;

  return (
    <div className="flex flex-col gap-4">
      {userCode ? (
        <>
          <p className="text-sm text-muted-foreground">
            Open{' '}
            <a
              href={verificationUri}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              {verificationUri}
            </a>{' '}
            and enter this code:
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-center text-2xl font-mono font-bold tracking-widest border rounded-md py-3 bg-muted">
              {userCode}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void copyToClipboard(userCode).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                })
              }
            >
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
              Waiting for authorization…
            </span>
            <span>Expires in {timeLabel}</span>
          </div>
        </>
      ) : (
        <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
          {error ? null : 'Starting sign-in flow…'}
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {polling && (
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      )}
    </div>
  );
}

// ── PAT panel ─────────────────────────────────────────────────────────────────

interface PATpanelProps {
  onSuccess: (result: AuthSuccessResult) => void;
  onCancel: () => void;
}

function PATPanel({ onSuccess, onCancel }: PATpanelProps) {
  const [pat, setPat] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Cancel any in-flight PAT validation when the panel unmounts so the stream
  // reader doesn't keep running and calling setState on an unmounted component.
  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  async function handleSubmit() {
    if (!pat.trim()) {
      setError('Paste a personal access token');
      return;
    }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/local-op/auth/pat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pat: pat.trim() }),
        signal: ac.signal,
      });
      if (!res.ok) {
        // Pre-validation error: emit RFC 9457 problem+json title.
        let message = 'Invalid token — check that it has repo scope';
        try {
          const body = (await res.json()) as unknown;
          const result = ProblemDetailsSchema.safeParse(body);
          if (result.success) message = result.data.title;
        } catch {
          /* keep generic message */
        }
        setError(message);
        setLoading(false);
        return;
      }
      if (!res.body) {
        setError('Invalid token — check that it has repo scope');
        setLoading(false);
        return;
      }
      const terminated = await consumeAuthEventStream(res.body, (line): 'terminal' | 'continue' => {
        // Narrow try/catch to JSON.parse only — event-processing errors
        // propagate instead of being silently swallowed.
        let event: DeviceEvent;
        try {
          event = JSON.parse(line) as DeviceEvent;
        } catch {
          return 'continue';
        }
        if (event.type === 'complete') {
          onSuccess({
            login: event.login,
            name: event.name,
            email: event.email,
          });
          setLoading(false);
          return 'terminal';
        } else if (event.type === 'error') {
          setError(event.problem?.title ?? 'Sign-in error');
          setLoading(false);
          return 'terminal';
        }
        return 'continue';
      });
      if (!terminated) setError('No response — try again');
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError('Connection error — try again');
      }
    }
    setLoading(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Create a token at{' '}
        <a
          href="https://github.com/settings/tokens"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          github.com/settings/tokens
        </a>{' '}
        with <code className="text-xs bg-muted px-1 rounded">repo</code> scope.
      </p>
      <Input
        type="password"
        aria-label="Personal access token"
        placeholder="ghp_…"
        value={pat}
        onChange={(e) => setPat(e.target.value)}
        disabled={loading}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void handleSubmit();
        }}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => void handleSubmit()} disabled={loading}>
          {loading ? 'Validating…' : 'Add token'}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Identity prompt ────────────────────────────────────────────────────────────

interface IdentityPromptProps {
  login: string;
  onSave: (name: string, email: string) => void;
  onSkip: () => void;
}

function IdentityPrompt({ login, onSave, onSkip }: IdentityPromptProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Before syncing, set your identity for git commits:
      </p>
      <Input
        aria-label="Name"
        placeholder={`Name (e.g. ${login})`}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Input
        type="email"
        aria-label="Email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <div className="flex gap-2">
        <Button
          className="flex-1"
          onClick={() => onSave(name.trim(), email.trim())}
          disabled={!name.trim() || !email.trim()}
        >
          Save
        </Button>
        <Button variant="ghost" onClick={onSkip}>
          Skip
        </Button>
      </div>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

type AuthTab = 'device' | 'pat';
type AuthStep = 'auth' | 'identity' | 'done';

export function AuthModal({
  open,
  onOpenChange,
  onSuccess,
  identityPrompt,
  reauth,
  transport,
}: AuthModalProps) {
  // Default to the HTTP path so existing editor / web callers don't need
  // to change. Navigator passes its IPC transport explicitly.
  const resolvedTransport = transport ?? httpAuthTransport();
  const [tab, setTab] = useState<AuthTab>('device');
  const [step, setStep] = useState<AuthStep>('auth');
  const [authResult, setAuthResult] = useState<AuthSuccessResult | null>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setTab('device');
      setStep('auth');
      setAuthResult(null);
    }
  }, [open]);

  function handleAuthSuccess(result: AuthSuccessResult) {
    setAuthResult(result);
    if (identityPrompt && (!result.name || !result.email)) {
      setStep('identity');
    } else {
      setStep('done');
      onSuccess?.(result);
      onOpenChange(false);
      toast.success(`Signed in as @${result.login}`);
    }
  }

  function handleIdentitySave(name: string, email: string) {
    // Persist git identity via the correct endpoint (best-effort).
    // /api/local-op/auth/set-identity writes to repo-local git config and
    // nudges the sync engine to re-probe so the unresolved-identity UI
    // banner clears on the next push cycle.
    void fetch('/api/local-op/auth/set-identity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email }),
    }).catch(() => {
      /* ignore */
    });

    const result = { ...(authResult ?? { login: '' }), name, email };
    setStep('done');
    onSuccess?.(result);
    onOpenChange(false);
    toast.success(`Signed in as @${result.login}`);
  }

  function handleIdentitySkip() {
    if (!authResult) return;
    setStep('done');
    onSuccess?.(authResult);
    onOpenChange(false);
    toast.success(`Signed in as @${authResult.login}`);
  }

  function handleCancel() {
    onOpenChange(false);
  }

  const title = reauth ? 'Re-authenticate with GitHub' : 'Sign in to GitHub';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <DialogBody>
          {step === 'auth' && (
            <>
              {/* Tab selector */}
              <div className="flex gap-1 border-b pb-2 mb-1">
                <Button
                  variant={tab === 'device' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setTab('device')}
                >
                  GitHub App
                </Button>
                <Button
                  variant={tab === 'pat' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setTab('pat')}
                >
                  Token
                </Button>
              </div>

              {tab === 'device' ? (
                <DeviceFlowPanel
                  onSuccess={handleAuthSuccess}
                  onCancel={handleCancel}
                  transport={resolvedTransport}
                />
              ) : (
                <PATPanel onSuccess={handleAuthSuccess} onCancel={handleCancel} />
              )}
            </>
          )}

          {step === 'identity' && authResult && (
            <>
              <p className="text-sm font-medium">Signed in as @{authResult.login}</p>
              <IdentityPrompt
                login={authResult.login}
                onSave={handleIdentitySave}
                onSkip={handleIdentitySkip}
              />
            </>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
