/**
 * AuthModal — GitHub sign-in + git-identity dialog.
 *
 * Sign-in panels:
 *   'device'  — Device Flow (default): shows user_code, polls for completion,
 *               2-minute timeout. Calls POST /api/local-op/auth/login (streaming JSONL).
 *   'pat'     — PAT fallback: text input, validated via POST /api/local-op/auth/pat.
 *
 * Step machine:
 *   'auth' → sign-in panel; on success, probe GET /api/local-op/auth/identity.
 *            If the identity resolution chain returns null, advance to 'identity'; otherwise 'done'.
 *   'identity' → Name + Email fields; POST /api/local-op/auth/set-identity.
 *                Can be entered directly via `initialStep='identity'` (reactive path
 *                from sync status' identityUnresolved nudge) — no sign-in needed.
 *   'done' → close modal.
 *
 * Props:
 *   initialStep — 'auth' (default) or 'identity' to skip sign-in and go straight
 *                 to the identity form.
 *   reauth      — when true, shows "Re-authenticate" heading instead of "Sign in".
 *
 * On success: calls onSuccess(result?) and closes.
 */
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
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

export interface AuthSuccessResult {
  login: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
}

export interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (result: AuthSuccessResult | null) => void;
  /**
   * Which step to open in. 'auth' (default) shows the sign-in panels; 'identity'
   * skips sign-in and goes straight to the Name/Email form. Use 'identity' for
   * the reactive "identity unresolved" nudge from the sync-status badge.
   */
  initialStep?: 'auth' | 'identity';
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

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let sawTerminalEvent = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
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
              sawTerminalEvent = true;
              setPolling(false);
              onSuccess({
                login: event.login,
                name: event.name,
                email: event.email,
                avatarUrl: event.avatarUrl,
              });
              return;
            } else if (event.type === 'error') {
              sawTerminalEvent = true;
              setError(event.message);
              setPolling(false);
              return;
            }
          } catch {
            /* ignore malformed line */
          }
        }
      }
      // Stream ended without a terminal event — fall back to probing auth
      // status. On macOS the keychain prompt can block stdout long enough
      // that the CLI exits before its 'complete' line reaches the client.
      if (!sawTerminalEvent) {
        try {
          const statusRes = await fetch('/api/local-op/auth/status', { method: 'POST' });
          const statusData = (await statusRes.json()) as {
            authenticated?: boolean;
            login?: string;
          };
          if (statusData.authenticated) {
            setPolling(false);
            onSuccess({ login: statusData.login ?? '' });
            return;
          }
        } catch {
          /* ignore — fall through to error */
        }
        setError('Sign-in did not complete — try again');
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

  async function handleSubmit() {
    if (!pat.trim()) {
      setError('Paste a personal access token');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/local-op/auth/pat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pat: pat.trim() }),
      });
      if (!res.ok || !res.body) {
        setError('Invalid token — check that it has repo scope');
        setLoading(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line) as DeviceEvent;
            if (event.type === 'complete') {
              onSuccess({
                login: event.login,
                name: event.name,
                email: event.email,
              });
              setLoading(false);
              return;
            } else if (event.type === 'error') {
              setError(event.message);
              setLoading(false);
              return;
            }
          } catch {
            /* ignore */
          }
        }
      }
      setError('No response — try again');
    } catch {
      setError('Connection error — try again');
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
  /** Optional sign-in handle used as a placeholder hint for the Name input. */
  login?: string;
  /** Optional default name (e.g. from OAuth profile). */
  defaultName?: string;
  /** Optional default email (e.g. from OAuth profile). */
  defaultEmail?: string;
  onSave: (name: string, email: string) => void;
  onSkip: () => void;
}

function IdentityPrompt({ login, defaultName, defaultEmail, onSave, onSkip }: IdentityPromptProps) {
  const [name, setName] = useState(defaultName ?? '');
  const [email, setEmail] = useState(defaultEmail ?? '');
  const namePlaceholder = login ? `Name (e.g. ${login})` : 'Name';

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Set your identity for git commits. This writes{' '}
        <code className="text-xs bg-muted px-1 rounded">user.name</code> and{' '}
        <code className="text-xs bg-muted px-1 rounded">user.email</code> to this repo's local
        config.
      </p>
      <Input placeholder={namePlaceholder} value={name} onChange={(e) => setName(e.target.value)} />
      <Input
        type="email"
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
  initialStep = 'auth',
  reauth,
}: AuthModalProps) {
  const [tab, setTab] = useState<AuthTab>('device');
  const [step, setStep] = useState<AuthStep>(initialStep);
  const [authResult, setAuthResult] = useState<AuthSuccessResult | null>(null);

  // Reset on open. Honors initialStep so callers can jump straight to the
  // identity form (reactive path from the sync-status identity-unresolved nudge).
  useEffect(() => {
    if (open) {
      setTab('device');
      setStep(initialStep);
      setAuthResult(null);
    }
  }, [open, initialStep]);

  /**
   * After sign-in, probe the server's identity chain. Returns true if an
   * identity was resolved (local or global git config), false otherwise.
   * Fails open — a flaky probe shouldn't block the success path.
   */
  async function identityAlreadyResolved(): Promise<boolean> {
    try {
      const res = await fetch('/api/local-op/auth/identity');
      if (!res.ok) return true;
      const data = (await res.json()) as {
        ok?: boolean;
        identity?: { name: string; email: string } | null;
      };
      return Boolean(data.identity);
    } catch {
      return true;
    }
  }

  async function handleAuthSuccess(result: AuthSuccessResult) {
    setAuthResult(result);
    const resolved = await identityAlreadyResolved();
    if (!resolved) {
      setStep('identity');
    } else {
      setStep('done');
      onSuccess?.(result);
      onOpenChange(false);
      toast.success(`Signed in as @${result.login}`);
    }
  }

  async function handleIdentitySave(name: string, email: string) {
    try {
      const res = await fetch('/api/local-op/auth/set-identity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email }),
      });
      if (!res.ok) {
        toast.error('Could not save git identity — try again');
        return;
      }
    } catch {
      toast.error('Could not save git identity — try again');
      return;
    }

    setStep('done');
    if (authResult) {
      onSuccess?.({ ...authResult, name, email });
      toast.success(`Signed in as @${authResult.login}`);
    } else {
      onSuccess?.(null);
      toast.success('Git identity set');
    }
    onOpenChange(false);
  }

  function handleIdentitySkip() {
    setStep('done');
    if (authResult) {
      onSuccess?.(authResult);
      toast.success(`Signed in as @${authResult.login}`);
    } else {
      onSuccess?.(null);
    }
    onOpenChange(false);
  }

  function handleCancel() {
    onOpenChange(false);
  }

  const title =
    step === 'identity' && !authResult
      ? 'Set git identity'
      : reauth
        ? 'Re-authenticate with GitHub'
        : 'Sign in to GitHub';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

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

        {step === 'identity' && (
          <>
            {authResult && <p className="text-sm font-medium">Signed in as @{authResult.login}</p>}
            <IdentityPrompt
              login={authResult?.login}
              defaultName={authResult?.name}
              defaultEmail={authResult?.email}
              onSave={(name, email) => {
                void handleIdentitySave(name, email);
              }}
              onSkip={handleIdentitySkip}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
