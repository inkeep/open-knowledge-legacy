import { HocuspocusProvider } from '@hocuspocus/provider';
import {
  bindConfigDoc,
  type CC1ConfigValidationRejectedPayload,
  CONFIG_DOC_NAME_PROJECT,
  CONFIG_DOC_NAME_USER,
  type Config,
  type ConfigBinding,
  ConfigSchema,
  type ConfigValidationError,
  getFieldMeta,
  humanFormat,
  isKnownConfigError,
  type OkignoreBinding,
} from '@inkeep/open-knowledge-core';
import { Check, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { type ControllerRenderProps, type FieldPath, useFormContext } from 'react-hook-form';
import { toast } from 'sonner';
import * as Y from 'yjs';
import { EnableSyncConfirmDialog } from '@/components/EnableSyncConfirmDialog';
import { InstallInClaudeDesktopDialog } from '@/components/InstallInClaudeDesktopDialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDocumentContext } from '@/editor/DocumentContext';
import {
  useEnableSyncWithConfirm,
  useSyncEnabledWriter,
} from '@/hooks/use-enable-sync-with-confirm';
import { useGitSyncStatus } from '@/hooks/use-git-sync-status';
import { useConfigContext } from '@/lib/config-provider';
import { subscribeToConfigValidationRejected } from '@/lib/config-validation-events';
import { useClaudeDesktopIntegration } from '@/lib/handoff/use-claude-desktop-integration';
import { cn } from '@/lib/utils';
import { OkignoreSection } from './OkignoreSection';
import { ProjectTemplatesSection } from './ProjectTemplatesSection';
import {
  getEnumOptions,
  getFieldDefault,
  getLeafTypeTag,
  resolveLeafSchema,
} from './schema-walker';
import type { SlotForwardedProps } from './slot-forwarded-props';
import { UserTemplatesSection } from './UserTemplatesSection';
import { pickFirstIssueForPath, useConfigForm } from './use-config-form';

type Scope = 'user' | 'project';

interface SidebarItem {
  id: string;
  label: string;
}

interface SidebarGroup {
  id: 'user' | 'project' | 'integrations';
  label: string;
  enabled: boolean;
  items: SidebarItem[];
}

interface FieldDef {
  path: string[];
  label: string;
  description?: string;
  control?: 'enum-toggle';
}

const FIELDS_APPEARANCE: FieldDef[] = [
  {
    path: ['appearance', 'theme'],
    label: 'Theme',
    description: 'Light, dark, or follow the OS.',
    control: 'enum-toggle',
  },
];

interface ConfigDocConnection {
  provider: HocuspocusProvider;
  binding: ConfigBinding;
  synced: boolean;
}

function useUserConfigDocConnection(
  collabUrl: string | null,
  enabled: boolean,
): ConfigDocConnection | null {
  const [state, setState] = useState<ConfigDocConnection | null>(null);

  useEffect(() => {
    if (!enabled || collabUrl === null) {
      setState(null);
      return;
    }

    const ydoc = new Y.Doc();
    const provider = new HocuspocusProvider({
      url: collabUrl,
      name: CONFIG_DOC_NAME_USER,
      document: ydoc,
    });
    const binding = bindConfigDoc(provider, 'user');
    const conn: ConfigDocConnection = { provider, binding, synced: false };

    const onSynced = () => {
      setState((prev) => {
        if (prev?.provider !== provider) return prev;
        return { ...prev, synced: true };
      });
    };
    provider.on('synced', onSynced);

    setState(conn);

    return () => {
      provider.off('synced', onSynced);
      binding.dispose();
      provider.destroy();
      ydoc.destroy();
      setState(null);
    };
  }, [collabUrl, enabled]);

  return state;
}

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { collabUrl } = useDocumentContext();
  const userConn = useUserConfigDocConnection(collabUrl, open);
  const { okignoreBinding, okignoreSynced } = useConfigContext();

  const [activeId, setActiveId] = useState<string>('preferences');
  useEffect(() => {
    if (open) setActiveId('preferences');
  }, [open]);

  const hasProject = collabUrl !== null;

  const { desktopPresent } = useClaudeDesktopIntegration();

  const groups: SidebarGroup[] = [
    {
      id: 'user',
      label: 'User',
      enabled: true,
      items: [
        { id: 'preferences', label: 'Preferences' },
        { id: 'user-templates', label: 'User templates' },
      ],
    },
    {
      id: 'project',
      label: 'This project',
      enabled: hasProject,
      items: [
        { id: 'sync', label: 'Sync' },
        { id: 'project-templates', label: 'Templates' },
        { id: 'okignore', label: 'Ignore patterns' },
      ],
    },
    {
      id: 'integrations',
      label: 'Integrations',
      enabled: true,
      items: desktopPresent ? [{ id: 'claude-desktop', label: 'Claude Desktop' }] : [],
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="grid h-[700px] max-h-[calc(100dvh-4rem)] w-[900px] max-w-[calc(100%-2rem)] grid-cols-[220px_1fr] gap-0 overflow-hidden p-0 sm:max-w-[900px]"
        data-testid="settings-dialog"
      >
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">
          Configure user, project, and integration settings.
        </DialogDescription>
        <SettingsSidebar groups={groups} activeId={activeId} onSelect={setActiveId} />
        <div className="min-h-0 overflow-y-auto overscroll-contain subtle-scrollbar p-6">
          <SettingsContent
            activeId={activeId}
            userBinding={userConn?.synced ? userConn.binding : null}
            okignoreBinding={okignoreBinding}
            okignoreSynced={okignoreSynced}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface SettingsSidebarProps {
  groups: SidebarGroup[];
  activeId: string;
  onSelect: (id: string) => void;
}

function SettingsSidebar({ groups, activeId, onSelect }: SettingsSidebarProps) {
  return (
    <aside
      aria-label="Settings sections"
      className="h-full overflow-y-auto overscroll-contain subtle-scrollbar border-r bg-muted/30 px-3 py-4"
    >
      <nav>
        {groups.map((group) => (
          <SettingsSidebarGroup
            key={group.id}
            group={group}
            activeId={activeId}
            onSelect={onSelect}
          />
        ))}
      </nav>
    </aside>
  );
}

function SettingsSidebarGroup({
  group,
  activeId,
  onSelect,
}: {
  group: SidebarGroup;
  activeId: string;
  onSelect: (id: string) => void;
}) {
  if (group.items.length === 0) return null;
  const headerId = `settings-group-${group.id}`;
  const captionId = `${headerId}-caption`;
  return (
    <div className="mb-4">
      <h2
        id={headerId}
        aria-describedby={group.enabled ? undefined : captionId}
        className={cn(
          'mb-1 px-2 text-xs font-semibold uppercase tracking-wide font-mono',
          group.enabled ? 'text-muted-foreground/80' : 'text-muted-foreground/50',
        )}
      >
        {group.label}
      </h2>
      {!group.enabled ? (
        <p id={captionId} className="mb-1 px-2 text-xs italic text-muted-foreground/60">
          Open a project to edit.
        </p>
      ) : null}
      <ul aria-labelledby={headerId} className="space-y-0.5">
        {group.items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              aria-current={activeId === item.id ? 'true' : undefined}
              aria-disabled={group.enabled ? undefined : true}
              tabIndex={group.enabled ? 0 : -1}
              disabled={!group.enabled}
              onClick={() => group.enabled && onSelect(item.id)}
              data-testid={`settings-sidebar-item-${item.id}`}
              className={cn(
                'w-full rounded px-2 py-1.5 text-left text-sm transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'disabled:cursor-not-allowed disabled:opacity-50',
                activeId === item.id && group.enabled
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-accent/50',
              )}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface SettingsContentProps {
  activeId: string;
  userBinding: ConfigBinding | null;
  okignoreBinding: OkignoreBinding | null;
  okignoreSynced: boolean;
}

function SettingsContent({
  activeId,
  userBinding,
  okignoreBinding,
  okignoreSynced,
}: SettingsContentProps) {
  if (activeId === 'preferences') {
    return userBinding ? (
      <BoundSchemaSection
        title="Appearance"
        description="Customize how the editor looks."
        scope="user"
        binding={userBinding}
        fields={FIELDS_APPEARANCE}
      />
    ) : (
      <SectionSkeleton />
    );
  }
  if (activeId === 'sync') {
    return <SyncSection />;
  }
  if (activeId === 'user-templates') {
    return <UserTemplatesSection />;
  }
  if (activeId === 'project-templates') {
    return <ProjectTemplatesSection />;
  }
  if (activeId === 'okignore') {
    return <OkignoreSection binding={okignoreBinding} synced={okignoreSynced} />;
  }
  if (activeId === 'claude-desktop') {
    return <IntegrationsSection />;
  }
  return null;
}

function firstIssuePath(error: ConfigValidationError): string | null {
  if (!isKnownConfigError(error) || error.code !== 'SCHEMA_INVALID') return null;
  const first = error.issues[0];
  if (!first || first.path.length === 0) return null;
  return first.path.map(String).join('.');
}

function SectionSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-4 w-64" />
      <div className="space-y-2">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    </div>
  );
}

interface BoundSchemaSectionProps {
  title: string;
  description: string;
  scope: Scope;
  binding: ConfigBinding;
  fields: FieldDef[];
}

function BoundSchemaSection({
  title,
  description,
  scope,
  binding,
  fields,
}: BoundSchemaSectionProps) {
  const { form, commitField } = useConfigForm(binding);
  const [flashedPath, setFlashedPath] = useState<string | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const docName = scope === 'project' ? CONFIG_DOC_NAME_PROJECT : CONFIG_DOC_NAME_USER;
    const unsubscribe = subscribeToConfigValidationRejected(
      (event: CC1ConfigValidationRejectedPayload) => {
        if (event.docName !== docName) return;

        toast.error(humanFormat(event.error), { duration: 8000 });

        const path = firstIssuePath(event.error);
        if (path) {
          form.setError(path as FieldPath<Config>, {
            type: 'config-validation-rejected',
            message: pickFirstIssueForPath(event.error, path),
          });
          form.setFocus(path as FieldPath<Config>);
          setFlashedPath(path);
          if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
          flashTimerRef.current = setTimeout(() => {
            setFlashedPath(null);
            form.clearErrors(path as FieldPath<Config>);
          }, 600);
        }
      },
    );
    return () => {
      unsubscribe();
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, [scope, form]);

  return (
    <Form {...form}>
      <SchemaSection
        title={title}
        description={description}
        scope={scope}
        fields={fields}
        commitField={commitField}
        flashedPath={flashedPath}
      />
    </Form>
  );
}

interface SchemaSectionProps {
  title: string;
  description: string;
  scope: Scope;
  fields: FieldDef[];
  commitField: (name: FieldPath<Config>) => boolean;
  flashedPath: string | null;
}

function SchemaSection({
  title,
  description,
  scope,
  fields,
  commitField,
  flashedPath,
}: SchemaSectionProps) {
  const titleId = `settings-section-${scope}-title`;
  return (
    <section aria-labelledby={titleId} className="space-y-3">
      <div className="space-y-1">
        <h2 id={titleId} className="text-base font-semibold">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-10">
        {fields.map((field) => (
          <SettingsField
            key={field.path.join('.')}
            field={field}
            scope={scope}
            commitField={commitField}
            isFlashed={flashedPath === field.path.join('.')}
          />
        ))}
      </div>
    </section>
  );
}

function SyncSection() {
  const status = useGitSyncStatus();
  const { projectLocalConfig, projectLocalSynced } = useConfigContext();
  const writer = useSyncEnabledWriter();
  const { confirmOpen, setConfirmOpen, onToggleRequest, onConfirm } =
    useEnableSyncWithConfirm(writer);

  if (status && !status.hasRemote && status.state === 'dormant') {
    return (
      <section
        aria-labelledby="settings-sync-title"
        className="space-y-3"
        data-testid="settings-sync-empty"
      >
        <div className="space-y-1">
          <h2 id="settings-sync-title" className="text-base font-semibold">
            Sync
          </h2>
          <p className="text-sm text-muted-foreground">
            No git remote was detected for this project. Set one up if you would like automatic git
            syncing.
          </p>
        </div>
        <div className="rounded-md border p-3 text-sm text-muted-foreground">
          Add a remote with{' '}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
            git remote add origin &lt;url&gt;
          </code>{' '}
          in this project's directory. This page will update automatically once a remote is
          detected.
        </div>
      </section>
    );
  }

  const enabled = projectLocalConfig?.autoSync?.enabled ?? false;
  const disabledControl = !projectLocalSynced;

  return (
    <section aria-labelledby="settings-sync-title" className="space-y-3">
      <div className="space-y-1">
        <h2 id="settings-sync-title" className="text-base font-semibold">
          Sync
        </h2>
        <p className="text-sm text-muted-foreground">
          Auto-sync pushes/pulls commits to your git remote on intervals and on save. Toggling on
          requires confirmation.
        </p>
      </div>
      <div className="rounded-md border p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <label htmlFor="settings-sync-toggle" className="text-sm font-medium">
              Git auto-sync
            </label>
            <p className="text-muted-foreground text-1sm">
              {enabled
                ? 'Auto-sync is on — your commits push and remote changes pull on intervals.'
                : 'Auto-sync is off — your edits stay local until you commit and push manually.'}
            </p>
          </div>
          <Switch
            id="settings-sync-toggle"
            checked={enabled}
            disabled={disabledControl}
            onCheckedChange={onToggleRequest}
            aria-label={enabled ? 'Disable git auto-sync' : 'Enable git auto-sync'}
            data-testid="settings-sync-toggle"
          />
        </div>
      </div>
      <EnableSyncConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={onConfirm}
      />
    </section>
  );
}

interface SettingsFieldProps {
  field: FieldDef;
  scope: Scope;
  commitField: (name: FieldPath<Config>) => boolean;
  isFlashed: boolean;
}

function SettingsField({ field, scope, commitField, isFlashed }: SettingsFieldProps) {
  'use no memo';
  const form = useFormContext<Config>();
  const leafSchema = resolveLeafSchema(ConfigSchema, field.path);
  const typeTag = leafSchema ? getLeafTypeTag(leafSchema) : undefined;
  const defaultValue = leafSchema ? getFieldDefault(leafSchema) : undefined;
  const enumOptions = leafSchema ? getEnumOptions(leafSchema) : undefined;

  const meta = leafSchema ? getFieldMeta(leafSchema) : undefined;
  const scopeMismatch =
    (meta?.scope === 'project' && scope !== 'project') ||
    (meta?.scope === 'user' && scope !== 'user');

  const dottedName = field.path.join('.') as FieldPath<Config>;

  const [savedTick, setSavedTick] = useState(false);
  const savedTickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (savedTickTimerRef.current) clearTimeout(savedTickTimerRef.current);
    },
    [],
  );

  const flashSavedTick = () => {
    setSavedTick(true);
    if (savedTickTimerRef.current) clearTimeout(savedTickTimerRef.current);
    savedTickTimerRef.current = setTimeout(() => setSavedTick(false), 1200);
  };

  const runCommit = (): boolean => {
    const ok = commitField(dottedName);
    if (ok) flashSavedTick();
    return ok;
  };

  const runCommitIfDirty = (): boolean => {
    if (!form.getFieldState(dottedName).isDirty) return true;
    return runCommit();
  };

  const reset = () => {
    const target = defaultValue === undefined ? null : defaultValue;
    form.setValue(dottedName, target as never, { shouldDirty: false });
    runCommit();
  };

  const wrapperClass = cn('relative', isFlashed && 'animate-settings-flash');

  return (
    <FormField
      control={form.control}
      name={dottedName}
      render={({ field: ctl }) => {
        const showResetButton =
          !scopeMismatch && (defaultValue !== undefined || ctl.value !== undefined);

        return (
          <FormItem className={wrapperClass} data-field={field.path.join('.')} data-scope={scope}>
            <div className="flex items-center justify-between gap-2">
              <FormLabel className="text-sm font-medium">{field.label}</FormLabel>
              {showResetButton ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 text-muted-foreground opacity-60 hover:opacity-100"
                      onClick={reset}
                      aria-label={`Reset ${field.label} to default`}
                    >
                      <RotateCcw className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Reset to default</TooltipContent>
                </Tooltip>
              ) : null}
            </div>
            {field.description ? (
              <FormDescription className="text-muted-foreground text-1sm">
                {field.description}
              </FormDescription>
            ) : null}
            <div className="flex items-center gap-2">
              <FormControl>
                <FieldControlBody
                  field={field}
                  ctl={ctl}
                  typeTag={typeTag}
                  enumOptions={enumOptions}
                  onCommit={runCommitIfDirty}
                />
              </FormControl>
              <SavedIndicator visible={savedTick} />
            </div>
            <FormMessage data-field-error={field.path.join('.')} />
          </FormItem>
        );
      }}
    />
  );
}

interface FieldControlBodyProps {
  field: FieldDef;
  ctl: ControllerRenderProps<Config, FieldPath<Config>>;
  typeTag: string | undefined;
  enumOptions: readonly string[] | undefined;
  onCommit: () => boolean;
}

function FieldControlBody({
  field,
  ctl,
  typeTag,
  enumOptions,
  onCommit,
  ...slotForwarded
}: FieldControlBodyProps & SlotForwardedProps) {
  'use no memo';
  if (typeTag === 'boolean') {
    return (
      <Switch
        {...slotForwarded}
        checked={Boolean(ctl.value)}
        ref={ctl.ref}
        onCheckedChange={(next) => {
          ctl.onChange(next);
          onCommit();
        }}
        onBlur={ctl.onBlur}
      />
    );
  }
  if (typeTag === 'enum' && enumOptions && enumOptions.length > 0) {
    if (field.control === 'enum-toggle' || enumOptions.length <= 4) {
      const { id: forwardedId, ...wrapperSlotProps } = slotForwarded;
      return (
        <ToggleGroup
          {...wrapperSlotProps}
          type="single"
          value={typeof ctl.value === 'string' ? ctl.value : ''}
          ref={ctl.ref}
          onValueChange={(next) => {
            if (!next) return;
            ctl.onChange(next);
            onCommit();
          }}
          onBlur={ctl.onBlur}
          variant="segmented"
          size="sm"
          spacing={1}
          className="bg-muted dark:bg-background p-0.5 rounded-lg"
          aria-label={field.label}
        >
          {enumOptions.map((opt, idx) => (
            <ToggleGroupItem
              key={opt}
              value={opt}
              id={idx === 0 ? forwardedId : undefined}
              className="text-1sm capitalize"
            >
              {opt}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      );
    }
  }
  if (typeTag === 'number' || typeTag === 'int') {
    return <NumberControlBody ctl={ctl} onCommit={onCommit} {...slotForwarded} />;
  }
  if (typeTag === 'array') {
    return <StringArrayControlBody ctl={ctl} onCommit={onCommit} {...slotForwarded} />;
  }
  return <StringControlBody ctl={ctl} onCommit={onCommit} {...slotForwarded} />;
}

function StringControlBody({
  ctl,
  onCommit,
  ...slotForwarded
}: {
  ctl: ControllerRenderProps<Config, FieldPath<Config>>;
  onCommit: () => boolean;
} & SlotForwardedProps) {
  'use no memo';
  return (
    <Input
      {...slotForwarded}
      value={typeof ctl.value === 'string' ? ctl.value : ''}
      ref={ctl.ref}
      onChange={(e) => ctl.onChange(e.target.value)}
      onBlur={() => {
        ctl.onBlur();
        onCommit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onCommit();
        }
      }}
      className="h-8 text-sm"
    />
  );
}

function NumberControlBody({
  ctl,
  onCommit,
  ...slotForwarded
}: {
  ctl: ControllerRenderProps<Config, FieldPath<Config>>;
  onCommit: () => boolean;
} & SlotForwardedProps) {
  'use no memo';
  const [pendingText, setPendingText] = useState(ctl.value === undefined ? '' : String(ctl.value));
  const lastSyncedValueRef = useRef(ctl.value);

  useEffect(() => {
    if (lastSyncedValueRef.current === ctl.value) return;
    setPendingText(ctl.value === undefined ? '' : String(ctl.value));
    lastSyncedValueRef.current = ctl.value;
  }, [ctl.value]);

  const commitText = () => {
    const parsed = Number(pendingText);
    if (!Number.isFinite(parsed)) {
      ctl.onChange(pendingText as unknown as number);
      onCommit();
      return;
    }
    ctl.onChange(parsed);
    onCommit();
    lastSyncedValueRef.current = parsed as unknown as Config[keyof Config];
  };

  return (
    <Input
      {...slotForwarded}
      type="number"
      value={pendingText}
      ref={ctl.ref}
      onChange={(e) => setPendingText(e.target.value)}
      onBlur={() => {
        ctl.onBlur();
        commitText();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commitText();
        }
      }}
      className="h-8 w-28 text-sm tabular-nums"
    />
  );
}

function StringArrayControlBody({
  ctl,
  onCommit,
  ...slotForwarded
}: {
  ctl: ControllerRenderProps<Config, FieldPath<Config>>;
  onCommit: () => boolean;
} & SlotForwardedProps) {
  'use no memo';
  const initial = Array.isArray(ctl.value) ? (ctl.value as string[]).join('\n') : '';
  const [pendingText, setPendingText] = useState(initial);
  const lastSyncedRef = useRef(initial);

  useEffect(() => {
    const incoming = Array.isArray(ctl.value) ? (ctl.value as string[]).join('\n') : '';
    if (incoming === lastSyncedRef.current) return;
    setPendingText(incoming);
    lastSyncedRef.current = incoming;
  }, [ctl.value]);

  const commitText = () => {
    const parsed = pendingText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    ctl.onChange(parsed);
    onCommit();
    lastSyncedRef.current = parsed.join('\n');
  };

  return (
    <textarea
      {...slotForwarded}
      value={pendingText}
      ref={ctl.ref}
      onChange={(e) => setPendingText(e.target.value)}
      onBlur={() => {
        ctl.onBlur();
        commitText();
      }}
      rows={Math.max(2, Math.min(6, pendingText.split('\n').length))}
      className="min-h-16 w-full rounded-md border border-input bg-background px-3 py-1.5 font-mono text-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40"
    />
  );
}

function SavedIndicator({ visible }: { visible: boolean }) {
  return (
    <span role="status" aria-live="polite" className="text-emerald-600">
      {visible ? (
        <>
          <Check aria-hidden="true" className="size-3.5" />
          <span className="sr-only">Saved</span>
        </>
      ) : null}
    </span>
  );
}

function IntegrationsSection() {
  const [installOpen, setInstallOpen] = useState(false);
  const { skillInstalled, refresh } = useClaudeDesktopIntegration();

  return (
    <section aria-labelledby="settings-integrations-title" className="space-y-3">
      <div className="space-y-1">
        <h2 id="settings-integrations-title" className="text-base font-semibold">
          Integrations
        </h2>
        <p className="text-sm text-muted-foreground">
          Connect Open Knowledge to other tools you use.
        </p>
      </div>
      <div className="rounded-md border p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Install in Claude Desktop</div>
            <p className="text-muted-foreground text-1sm">
              Make this knowledge base available as a Claude Skill.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setInstallOpen(true)}
            data-testid="settings-install-claude-desktop"
            className="uppercase font-mono"
          >
            {skillInstalled ? 'Reinstall' : 'Install'}
          </Button>
        </div>
      </div>
      <InstallInClaudeDesktopDialog
        open={installOpen}
        onOpenChange={(next) => {
          setInstallOpen(next);
          if (!next) refresh();
        }}
        reinstall={skillInstalled}
      />
    </section>
  );
}
