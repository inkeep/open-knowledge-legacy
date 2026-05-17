import type { SharePublishOwner } from '@inkeep/open-knowledge-core';
import { CheckCircle2, ExternalLink, Loader2, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AuthModal } from '@/components/AuthModal';
import { Button } from '@/components/ui/button';
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  Dialog as DialogRoot,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useDocumentContext } from '@/editor/DocumentContext';
import {
  canSubmitPublish,
  copyPostPublishShareUrl,
  extractFolderBasename,
  fetchPublishNameCheck,
  fetchPublishOwners,
  type NameCheckStatus,
  presentPublishError,
  resolveNameCheckStatus,
  sanitizeRepoName,
  submitPublishRequest,
} from '@/lib/share/publish-wizard';
import { runShareAction } from '@/lib/share/run-share-action';
import { useWorkspace } from '@/lib/use-workspace';

const NAME_CHECK_DEBOUNCE_MS = 500;

export interface PublishToGitHubDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PublishToGitHubDialog({ open, onOpenChange }: PublishToGitHubDialogProps) {
  const workspace = useWorkspace();
  const { activeDocName } = useDocumentContext();

  const [owners, setOwners] = useState<SharePublishOwner[] | null>(null);
  const [ownersLoading, setOwnersLoading] = useState(false);
  const [ownersError, setOwnersError] = useState<string | null>(null);
  const [selectedOwner, setSelectedOwner] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [description, setDescription] = useState<string>('');
  const [nameCheck, setNameCheck] = useState<NameCheckStatus>({ kind: 'idle' });
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<{
    message: string;
    next: ReturnType<typeof presentPublishError>['next'];
  } | null>(null);
  const [authOpen, setAuthOpen] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightNameRef = useRef<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const sanitizedName = sanitizeRepoName(name);
  const selectedOwnerEntry = owners?.find((o) => o.login === selectedOwner) ?? null;

  async function loadOwners() {
    setOwnersLoading(true);
    setOwnersError(null);
    try {
      const res = await fetchPublishOwners();
      if (!res.ok) {
        if (res.error === 'auth-required') {
          setAuthOpen(true);
          setOwnersError('Sign in to GitHub to continue.');
        } else {
          setOwnersError("Couldn't reach GitHub. Try again?");
        }
        setOwnersLoading(false);
        return;
      }
      setOwners(res.owners);
      if (res.owners.length > 0 && selectedOwner === '') {
        setSelectedOwner(res.owners[0]?.login ?? '');
      }
    } catch {
      setOwnersError("Couldn't reach GitHub. Try again?");
    }
    setOwnersLoading(false);
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: open-effect — workspace pulled lazily
  useEffect(() => {
    if (!open) return;
    setNameCheck({ kind: 'idle' });
    setBanner(null);
    setSubmitting(false);
    setOwnersError(null);
    const seededName = sanitizeRepoName(extractFolderBasename(workspace?.contentDir ?? ''));
    setName(seededName);
    setVisibility('private');
    setDescription('');
    if (owners === null) {
      void loadOwners();
    } else if (selectedOwner === '' && owners.length > 0) {
      setSelectedOwner(owners[0]?.login ?? '');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);

    if (selectedOwner === '' || sanitizedName === '') {
      setNameCheck({ kind: 'idle' });
      return;
    }

    setNameCheck({ kind: 'pending' });

    debounceRef.current = setTimeout(async () => {
      const owner = selectedOwner;
      const candidate = sanitizedName;
      inFlightNameRef.current = `${owner}|${candidate}`;
      setNameCheck({ kind: 'checking' });
      try {
        const res = await fetchPublishNameCheck(owner, candidate);
        if (inFlightNameRef.current !== `${owner}|${candidate}`) return;
        setNameCheck(resolveNameCheckStatus(res, owner, candidate));
      } catch {
        if (inFlightNameRef.current !== `${owner}|${candidate}`) return;
        setNameCheck({ kind: 'error', banner: "Couldn't reach GitHub. Try again?" });
      }
    }, NAME_CHECK_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [open, selectedOwner, sanitizedName]);

  function handleAuthSuccess() {
    setAuthOpen(false);
    setOwnersError(null);
    void loadOwners();
  }

  async function handleSubmit() {
    if (!canSubmitPublish({ owner: selectedOwnerEntry, sanitizedName, nameCheck, submitting })) {
      return;
    }
    setSubmitting(true);
    setBanner(null);
    try {
      const res = await submitPublishRequest({
        owner: selectedOwner,
        name: sanitizedName,
        visibility,
        description: description.trim().length > 0 ? description.trim() : undefined,
      });
      if (res.ok) {
        onOpenChange(false);
        if (activeDocName) {
          await copyPostPublishShareUrl(activeDocName, {
            runShareAction,
            clipboardWrite: (text) => navigator.clipboard.writeText(text),
            toastSuccess: (msg) => toast.success(msg),
            toastError: (msg) => toast.error(msg),
            logEvent: (msg) => console.log(msg),
          });
        } else {
          toast.success(`Published to ${res.ownerLogin}/${res.repoName}.`);
        }
        setSubmitting(false);
        return;
      }
      const presentation = presentPublishError(res.error, selectedOwner, sanitizedName);
      setBanner({ message: presentation.banner, next: presentation.next });
      if (presentation.next.kind === 'edit-name') {
        nameInputRef.current?.focus();
        nameInputRef.current?.select();
      } else if (presentation.next.kind === 'reauth') {
        setAuthOpen(true);
      }
    } catch {
      setBanner({
        message: "Couldn't reach GitHub. Try again?",
        next: { kind: 'edit-form' },
      });
    }
    setSubmitting(false);
  }

  function handleAuthorizeInBrowser(authorizeUrl: string) {
    const opener = window.okDesktop?.shell?.openExternal;
    if (opener) {
      void opener(authorizeUrl);
    } else {
      window.open(authorizeUrl, '_blank', 'noopener');
    }
  }

  function handleClose() {
    onOpenChange(false);
  }

  const submitDisabled = !canSubmitPublish({
    owner: selectedOwnerEntry,
    sanitizedName,
    nameCheck,
    submitting,
  });

  return (
    <>
      <DialogRoot open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Publish to GitHub</DialogTitle>
            <DialogDescription>
              Sharing a doc needs a GitHub repository. Create one for this project.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="flex flex-col gap-4">
            <fieldset className="flex flex-col gap-1.5">
              <Label htmlFor="publish-owner">Owner</Label>
              {ownersLoading && owners === null ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" aria-hidden /> Loading...
                </div>
              ) : ownersError ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-destructive">{ownersError}</span>
                  <Button type="button" variant="outline" size="sm" onClick={() => loadOwners()}>
                    Retry
                  </Button>
                </div>
              ) : (
                <Select value={selectedOwner} onValueChange={setSelectedOwner}>
                  <SelectTrigger
                    id="publish-owner"
                    data-testid="publish-owner-trigger"
                    aria-label="Owner"
                  >
                    <SelectValue placeholder="Pick an owner" />
                  </SelectTrigger>
                  <SelectContent>
                    {(owners ?? []).map((o) => (
                      <SelectItem
                        key={o.login}
                        value={o.login}
                        data-testid={`publish-owner-option-${o.login}`}
                      >
                        <span className="flex items-center gap-2">
                          {o.avatarUrl ? (
                            <img
                              src={o.avatarUrl}
                              alt=""
                              aria-hidden
                              className="size-4 rounded-full"
                            />
                          ) : null}
                          <span>{o.login}</span>
                          <span className="text-xs text-muted-foreground">
                            {o.kind === 'user' ? 'you' : 'org'}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </fieldset>

            <fieldset className="flex flex-col gap-1.5">
              <Label htmlFor="publish-name">Repository name</Label>
              <Input
                id="publish-name"
                ref={nameInputRef}
                data-testid="publish-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => {
                  inFlightNameRef.current = null;
                }}
                placeholder="my-knowledge-base"
                autoComplete="off"
                spellCheck={false}
              />
              <div className="flex items-center justify-between gap-3 text-xs" aria-live="polite">
                <span className="text-muted-foreground">
                  {sanitizedName ? (
                    <>
                      Will be created as <code className="font-mono">{sanitizedName}</code>
                    </>
                  ) : (
                    'Pick a name'
                  )}
                </span>
                <NameCheckIndicator status={nameCheck} />
              </div>
            </fieldset>

            <fieldset className="flex flex-col gap-1.5">
              <Label>Visibility</Label>
              <RadioGroup
                value={visibility}
                onValueChange={(value: string) =>
                  setVisibility(value === 'public' ? 'public' : 'private')
                }
                className="grid-cols-2"
                aria-label="Visibility"
              >
                <Label
                  htmlFor="publish-visibility-private"
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-input p-2 text-sm font-normal has-data-checked:border-primary"
                >
                  <RadioGroupItem
                    value="private"
                    id="publish-visibility-private"
                    data-testid="publish-visibility-private"
                  />
                  <span>
                    Private
                    <span className="block text-xs text-muted-foreground">Only collaborators</span>
                  </span>
                </Label>
                <Label
                  htmlFor="publish-visibility-public"
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-input p-2 text-sm font-normal has-data-checked:border-primary"
                >
                  <RadioGroupItem
                    value="public"
                    id="publish-visibility-public"
                    data-testid="publish-visibility-public"
                  />
                  <span>
                    Public
                    <span className="block text-xs text-muted-foreground">Anyone can see</span>
                  </span>
                </Label>
              </RadioGroup>
            </fieldset>

            <fieldset className="flex flex-col gap-1.5">
              <Label htmlFor="publish-description">Description (optional)</Label>
              <Textarea
                id="publish-description"
                data-testid="publish-description"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this knowledge base for?"
              />
            </fieldset>

            {banner && (
              <PublishBanner
                banner={banner}
                onAuthorize={handleAuthorizeInBrowser}
                onRetryPush={handleSubmit}
              />
            )}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={submitDisabled}
              data-testid="publish-submit"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" aria-hidden /> Publishing...
                </>
              ) : (
                'Publish & copy link'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>

      <AuthModal open={authOpen} onOpenChange={setAuthOpen} onSuccess={handleAuthSuccess} />
    </>
  );
}

function PublishBanner({
  banner,
  onAuthorize,
  onRetryPush,
}: {
  banner: {
    message: string;
    next: ReturnType<typeof presentPublishError>['next'];
  };
  onAuthorize: (url: string) => void;
  onRetryPush: () => void;
}) {
  const next = banner.next;
  return (
    <div
      role="alert"
      data-testid="publish-banner"
      className="flex flex-col gap-2 rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm"
    >
      <span>{banner.message}</span>
      {next.kind === 'authorize-org' && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          data-testid="publish-authorize-org"
          onClick={() => onAuthorize(next.authorizeUrl)}
        >
          Authorize in browser <ExternalLink className="ml-1 size-3" aria-hidden />
        </Button>
      )}
      {next.kind === 'retry-push' && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          data-testid="publish-retry-push"
          onClick={onRetryPush}
        >
          Retry push
        </Button>
      )}
    </div>
  );
}

function NameCheckIndicator({ status }: { status: NameCheckStatus }) {
  if (status.kind === 'available') {
    return (
      <span
        data-testid="publish-name-check"
        data-status="available"
        className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"
      >
        <CheckCircle2 className="size-3.5" aria-hidden /> Available
      </span>
    );
  }
  if (status.kind === 'taken') {
    return (
      <span
        data-testid="publish-name-check"
        data-status="taken"
        className="flex items-center gap-1 text-destructive"
      >
        <XCircle className="size-3.5" aria-hidden /> {status.owner}/{status.name} already exists
      </span>
    );
  }
  if (status.kind === 'checking' || status.kind === 'pending') {
    return (
      <span
        data-testid="publish-name-check"
        data-status={status.kind}
        className="flex items-center gap-1 text-muted-foreground"
      >
        <Loader2 className="size-3.5 animate-spin" aria-hidden /> Checking...
      </span>
    );
  }
  if (status.kind === 'error') {
    return (
      <span data-testid="publish-name-check" data-status="error" className="text-destructive">
        {status.banner}
      </span>
    );
  }
  return null;
}
