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
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
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

interface DeviceErrorEvent {
  type: 'error';
  message: string;
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
}

// ── Device Flow panel ─────────────────────────────────────────────────────────

interface DeviceFlowPanelProps {
  onSuccess: (result: AuthSuccessResult) => void;
  onCancel: () => void;
}

const DEVICE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

function DeviceFlowPanel({ onSuccess, onCancel }: DeviceFlowPanelProps) {
  const [userCode, setUserCode] = useState<string | null>(null);
  const [verificationUri, setVerificationUri] = useState('https://github.com/login/device');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [timeLeft, setTimeLeft] = useState(DEVICE_TIMEOUT_MS);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function startDeviceFlow(ac: AbortController) {
    setError(null);
    setPolling(true);
    try {
      const res = await fetch('/api/local-op/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json: true }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        setError('Failed to start sign-in — try again');
        setPolling(false);
        return;
      }

      const terminated = await consumeAuthEventStream(res.body, (line): 'terminal' | 'continue' => {
        try {
          const event = JSON.parse(line) as DeviceEvent;
          if (event.type === 'verification') {
            setUserCode(event.user_code);
            setVerificationUri(event.verification_uri);
            setTimeLeft(event.expires_in * 1000);
            void copyToClipboard(event.user_code).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          } else if (event.type === 'complete') {
            setPolling(false);
            onSuccess({
              login: event.login,
              name: event.name,
              email: event.email,
              avatarUrl: event.avatarUrl,
            });
            return 'terminal';
          } else if (event.type === 'error') {
            setError(event.message);
            setPolling(false);
            return 'terminal';
          }
        } catch {
          /* ignore malformed line */
        }
        return 'continue';
      });

      if (!terminated) {
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
    const ac = new AbortController();
    abortRef.current = ac;
    void startDeviceFlow(ac);

    return () => {
      ac.abort();
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
      if (!res.ok || !res.body) {
        setError('Invalid token — check that it has repo scope');
        setLoading(false);
        return;
      }
      const terminated = await consumeAuthEventStream(res.body, (line): 'terminal' | 'continue' => {
        try {
          const event = JSON.parse(line) as DeviceEvent;
          if (event.type === 'complete') {
            onSuccess({
              login: event.login,
              name: event.name,
              email: event.email,
            });
            setLoading(false);
            return 'terminal';
          } else if (event.type === 'error') {
            setError(event.message);
            setLoading(false);
            return 'terminal';
          }
        } catch {
          /* ignore */
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
}: AuthModalProps) {
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
    // Persist git identity via config endpoint (best-effort)
    void fetch('/api/local-op/auth/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ setIdentity: { name, email } }),
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
                <DeviceFlowPanel onSuccess={handleAuthSuccess} onCancel={handleCancel} />
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
