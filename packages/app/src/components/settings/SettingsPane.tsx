/**
 * Settings pane (D54 / FR-1 / FR-37 / US-009).
 *
 * Replaces the document view in the main editor area when invoked via Cmd-,,
 * the App menu, HelpPopover, or CommandPalette. Sub-tabs separate
 * workspace ("This project") and user-global ("All projects") scopes;
 * each tab acquires its own `HocuspocusProvider` per D48 + binds via
 * `bindConfigDoc` per FR-33.
 *
 * Auto-save (FR-3, D8): per-control commits via `binding.patch`. L1
 * client-side validation gates writes (FR-5 / D45 L1). Per-field reset
 * (FR-4 / FR-21) writes the schema default. Modified-at-scope indicator
 * (FR-3b) shows a colored bar on `'either'` fields whose value differs
 * from the schema default.
 *
 * L3 rejection (D45 L3) from non-pane writers (CLI, MCP, hand-edit)
 * surfaces as a sonner toast + brief field flash, per FR-39 / D56.
 *
 * The Integrations section hosts an "Install in Claude Desktop" row per
 * FR-25 / D22 — opens `<InstallInClaudeDesktopDialog>`.
 */

import { HocuspocusProvider } from '@hocuspocus/provider';
import {
  bindConfigDoc,
  type CC1ConfigValidationRejectedPayload,
  CONFIG_DOC_NAME_USER,
  CONFIG_DOC_NAME_WORKSPACE,
  type Config,
  type ConfigBinding,
  ConfigSchema,
  type ConfigValidationError,
  getFieldMeta,
  humanFormat,
  isKnownConfigError,
} from '@inkeep/open-knowledge-core';
import { Check, RotateCcw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import * as Y from 'yjs';
import { InstallInClaudeDesktopDialog } from '@/components/InstallInClaudeDesktopDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDocumentContext } from '@/editor/DocumentContext';
import { subscribeToConfigValidationRejected } from '@/lib/config-validation-events';
import type { SettingsScope } from '@/lib/use-settings-route';
import {
  buildPatch,
  getEnumOptions,
  getFieldDefault,
  getLeafTypeTag,
  readPath,
  resolveLeafSchema,
} from './schema-walker';

interface SettingsPaneProps {
  scope: SettingsScope;
  onClose: () => void;
  onScopeChange: (scope: SettingsScope) => void;
}

interface SectionDef {
  id: string;
  title: string;
  description: string;
  fields: FieldDef[];
}

interface FieldDef {
  path: string[];
  label: string;
  description?: string;
  /** Optional override: 'enum-toggle' renders enum as a ToggleGroup; default is select-style toggle. */
  control?: 'enum-toggle';
}

const SECTIONS: SectionDef[] = [
  {
    id: 'content',
    title: 'Content',
    description: 'Where Open Knowledge looks for documents.',
    fields: [
      {
        path: ['content', 'dir'],
        label: 'Content directory',
        description: 'Project-relative path containing your markdown files.',
      },
      {
        path: ['content', 'include'],
        label: 'Include patterns',
        description: 'Glob patterns selecting which files are content. One per line.',
      },
      {
        path: ['content', 'exclude'],
        label: 'Exclude patterns',
        description: 'Glob patterns to skip. One per line.',
      },
    ],
  },
  {
    id: 'server',
    title: 'Server',
    description: 'Local server bind and behavior.',
    fields: [
      {
        path: ['server', 'host'],
        label: 'Host',
        description: 'Bind interface (e.g. localhost, 0.0.0.0).',
      },
      {
        path: ['server', 'openOnAgentEdit'],
        label: 'Open preview on agent edit',
        description: 'When enabled, an agent write opens the preview tab if not already open.',
      },
    ],
  },
  {
    id: 'github',
    title: 'GitHub',
    description: 'OAuth app identity for sign-in. Tokens are stored in your OS keychain, not here.',
    fields: [
      {
        path: ['github', 'oauthAppClientId'],
        label: 'OAuth App client ID',
        description:
          'Public client ID for the GitHub OAuth app. Defaults to the published Open Knowledge app.',
      },
    ],
  },
  {
    id: 'preview',
    title: 'Preview',
    description: 'Where the preview tab points when no local UI is running.',
    fields: [
      {
        path: ['preview', 'baseUrl'],
        label: 'Preview base URL',
        description: 'URL of your team’s deployed wiki (workspace-only).',
      },
    ],
  },
  {
    id: 'mcp',
    title: 'MCP',
    description: 'Model Context Protocol agent integration tuning.',
    fields: [
      {
        path: ['mcp', 'autoStart'],
        label: 'Auto-start server',
        description: 'When enabled, `ok mcp` spawns `ok start` automatically.',
      },
      {
        path: ['mcp', 'tools', 'read_document', 'historyDepth'],
        label: 'read_document history depth',
        description: 'How many history entries the agent’s read_document tool returns.',
      },
      {
        path: ['mcp', 'tools', 'search', 'maxResults'],
        label: 'search max results',
        description: 'Cap on results returned by the agent’s search tool.',
      },
    ],
  },
  {
    id: 'appearance',
    title: 'Appearance',
    description: 'UI preferences. Editor toggles continue to write localStorage as a cache.',
    fields: [
      {
        path: ['appearance', 'theme'],
        label: 'Theme',
        description: 'Light, dark, or follow the OS.',
        control: 'enum-toggle',
      },
      {
        path: ['appearance', 'editorModeDefault'],
        label: 'Default editor mode',
        description: 'Which mode new docs open in by default.',
        control: 'enum-toggle',
      },
    ],
  },
];

/**
 * Lifecycle wrapper for one config doc — owns the HocuspocusProvider +
 * ConfigBinding lifetime. Per D48 each config doc gets its own provider;
 * per D59 no client-side y-indexeddb is instantiated.
 */
interface ConfigDocConnection {
  provider: HocuspocusProvider;
  binding: ConfigBinding;
  config: Config;
  synced: boolean;
}

function useConfigDocConnection(
  collabUrl: string | null,
  scope: SettingsScope,
): ConfigDocConnection | null {
  const [state, setState] = useState<ConfigDocConnection | null>(null);

  useEffect(() => {
    if (collabUrl === null) return;
    const docName = scope === 'workspace' ? CONFIG_DOC_NAME_WORKSPACE : CONFIG_DOC_NAME_USER;
    const ydoc = new Y.Doc();
    const provider = new HocuspocusProvider({
      url: collabUrl,
      name: docName,
      document: ydoc,
    });
    const binding = bindConfigDoc(provider, scope);

    let mounted = true;
    const handleSynced = () => {
      if (!mounted) return;
      setState((prev) => {
        if (prev?.provider !== provider) return prev;
        return { ...prev, synced: true, config: binding.current() };
      });
    };
    provider.on('synced', handleSynced);
    const unsubscribe = binding.subscribe((next) => {
      if (!mounted) return;
      setState((prev) => {
        if (prev?.provider !== provider) return prev;
        return prev ? { ...prev, config: next } : prev;
      });
    });

    setState({ provider, binding, config: binding.current(), synced: false });

    return () => {
      mounted = false;
      unsubscribe();
      provider.off('synced', handleSynced);
      binding.dispose();
      provider.destroy();
      ydoc.destroy();
      setState((prev) => (prev?.provider === provider ? null : prev));
    };
  }, [collabUrl, scope]);

  return state;
}

export function SettingsPane({ scope, onClose, onScopeChange }: SettingsPaneProps) {
  const { collabUrl } = useDocumentContext();
  const connection = useConfigDocConnection(collabUrl, scope);

  // Field-flash registry for FR-39 — Settings pane subscribes to L3 broadcasts
  // and triggers brief red flash on the affected field.
  const [flashedPath, setFlashedPath] = useState<string | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToConfigValidationRejected(
      (event: CC1ConfigValidationRejectedPayload) => {
        const isMatchingScope =
          (scope === 'workspace' && event.docName === CONFIG_DOC_NAME_WORKSPACE) ||
          (scope === 'user' && event.docName === CONFIG_DOC_NAME_USER);
        if (!isMatchingScope) return;

        toast.error(humanFormat(event.error), { duration: 8000 });
        const path = firstIssuePath(event.error);
        if (path) {
          setFlashedPath(path);
          if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
          flashTimerRef.current = setTimeout(() => setFlashedPath(null), 600);
        }
      },
    );
    return () => {
      unsubscribe();
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, [scope]);

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden"
      data-testid="settings-pane"
      data-scope={scope}
    >
      <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold">Settings</h1>
          <ToggleGroup
            type="single"
            value={scope}
            onValueChange={(v) => {
              if (v === 'workspace' || v === 'user') onScopeChange(v);
            }}
            aria-label="Settings scope"
            variant="segmented"
            size="sm"
            spacing={1}
            className="bg-muted dark:bg-background p-0.5 rounded-lg"
          >
            <ToggleGroupItem value="workspace" className="text-xs">
              This project
            </ToggleGroupItem>
            <ToggleGroupItem value="user" className="text-xs">
              All projects
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Close settings"
              className="text-muted-foreground"
            >
              <X className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Close</TooltipContent>
        </Tooltip>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {connection === null || !connection.synced ? (
          <SettingsSkeleton />
        ) : (
          <SettingsForm
            scope={scope}
            binding={connection.binding}
            config={connection.config}
            flashedPath={flashedPath}
          />
        )}
      </div>
    </div>
  );
}

function firstIssuePath(error: ConfigValidationError): string | null {
  if (!isKnownConfigError(error) || error.code !== 'SCHEMA_INVALID') return null;
  const first = error.issues[0];
  if (!first || first.path.length === 0) return null;
  return first.path.map(String).join('.');
}

function SettingsSkeleton() {
  return (
    <div className="space-y-6 p-6">
      {Array.from({ length: 3 }).map((_, sectionIdx) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholder; index is stable across renders
        <div key={sectionIdx} className="space-y-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-64" />
          <div className="space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface SettingsFormProps {
  scope: SettingsScope;
  binding: ConfigBinding;
  config: Config;
  flashedPath: string | null;
}

function SettingsForm({ scope, binding, config, flashedPath }: SettingsFormProps) {
  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      {SECTIONS.map((section) => {
        const visibleFields = section.fields.filter((field) =>
          isFieldVisibleAtScope(field.path, scope),
        );
        if (visibleFields.length === 0) return null;
        return (
          <SettingsSection key={section.id} section={section}>
            {visibleFields.map((field) => (
              <SettingsField
                key={field.path.join('.')}
                field={field}
                scope={scope}
                binding={binding}
                config={config}
                isFlashed={flashedPath === field.path.join('.')}
              />
            ))}
          </SettingsSection>
        );
      })}
      <IntegrationsSection />
    </div>
  );
}

function isFieldVisibleAtScope(path: readonly string[], scope: SettingsScope): boolean {
  const leafSchema = resolveLeafSchema(ConfigSchema, path);
  if (!leafSchema) return true;
  const meta = getFieldMeta(leafSchema);
  if (!meta) return true;
  if (meta.scope === 'workspace' && scope !== 'workspace') return false;
  if (meta.scope === 'user' && scope !== 'user') return false;
  return true;
}

function SettingsSection({
  section,
  children,
}: {
  section: SectionDef;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`settings-${section.id}-title`} className="space-y-3">
      <div className="space-y-1">
        <h2 id={`settings-${section.id}-title`} className="text-base font-semibold">
          {section.title}
        </h2>
        <p className="text-sm text-muted-foreground">{section.description}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

interface SettingsFieldProps {
  field: FieldDef;
  scope: SettingsScope;
  binding: ConfigBinding;
  config: Config;
  isFlashed: boolean;
}

function SettingsField({ field, scope, binding, config, isFlashed }: SettingsFieldProps) {
  const leafSchema = resolveLeafSchema(ConfigSchema, field.path);
  const typeTag = leafSchema ? getLeafTypeTag(leafSchema) : undefined;
  const defaultValue = leafSchema ? getFieldDefault(leafSchema) : undefined;
  const currentValue = readPath(config, field.path);
  const meta = leafSchema ? getFieldMeta(leafSchema) : undefined;
  const enumOptions = leafSchema ? getEnumOptions(leafSchema) : undefined;

  // Modified indicator: field's resolved value differs from default. v0
  // approximation of FR-3b's "set at this scope" semantics — full per-scope
  // detection would require a separate raw-YAML inspection.
  const isModified =
    defaultValue === undefined
      ? currentValue !== undefined && currentValue !== null
      : !valuesEqual(currentValue, defaultValue);

  const fieldId = field.path.join('-');
  const errorId = `${fieldId}-error`;

  const [error, setError] = useState<string | null>(null);

  const commit = (value: unknown): boolean => {
    const patch = buildPatch(field.path, value);
    const result = binding.patch(patch);
    if (!result.ok) {
      setError(humanFormatFirstIssue(result.error));
      return false;
    }
    setError(null);
    return true;
  };

  const reset = () => {
    if (defaultValue === undefined) {
      // No schema default → clear the field via null-as-clear (RFC 7396 spirit).
      commit(null);
    } else {
      commit(defaultValue);
    }
  };

  const indicator = isModified ? (
    <span
      data-modified="true"
      aria-hidden="true"
      className="absolute -left-3 top-1 h-5 w-0.5 rounded-full bg-primary"
    />
  ) : null;

  const wrapperClass = `relative space-y-1 ${isFlashed ? 'animate-settings-flash' : ''}`;

  return (
    <div className={wrapperClass} data-field={field.path.join('.')} data-scope={scope}>
      {indicator}
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={fieldId} className="text-sm font-medium">
          {field.label}
        </label>
        {defaultValue !== undefined || currentValue !== undefined ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground opacity-60 hover:opacity-100"
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
        <p className="text-xs text-muted-foreground">{field.description}</p>
      ) : null}
      <FieldControl
        field={field}
        fieldId={fieldId}
        errorId={error ? errorId : undefined}
        typeTag={typeTag}
        currentValue={currentValue}
        enumOptions={enumOptions}
        onCommit={commit}
        readonlyReason={
          meta?.scope === 'workspace' && scope !== 'workspace'
            ? 'Workspace-only field'
            : meta?.scope === 'user' && scope !== 'user'
              ? 'User-only field'
              : null
        }
      />
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="text-xs text-destructive"
          data-field-error={field.path.join('.')}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface FieldControlProps {
  field: FieldDef;
  fieldId: string;
  errorId?: string;
  typeTag: string | undefined;
  currentValue: unknown;
  enumOptions: readonly string[] | undefined;
  onCommit: (value: unknown) => boolean;
  readonlyReason: string | null;
}

function FieldControl({
  field,
  fieldId,
  errorId,
  typeTag,
  currentValue,
  enumOptions,
  onCommit,
  readonlyReason,
}: FieldControlProps) {
  if (readonlyReason) {
    return (
      <div className="rounded border border-dashed border-muted px-3 py-2 text-xs text-muted-foreground">
        {readonlyReason} — manage this in the other tab.
      </div>
    );
  }

  if (typeTag === 'boolean') {
    return (
      <BooleanControl
        fieldId={fieldId}
        errorId={errorId}
        value={Boolean(currentValue)}
        onCommit={onCommit}
      />
    );
  }
  if (typeTag === 'enum' && enumOptions && enumOptions.length > 0) {
    if (field.control === 'enum-toggle' || enumOptions.length <= 4) {
      return (
        <EnumToggleControl
          fieldId={fieldId}
          errorId={errorId}
          options={enumOptions}
          value={typeof currentValue === 'string' ? currentValue : ''}
          onCommit={onCommit}
        />
      );
    }
  }
  if (typeTag === 'number' || typeTag === 'int') {
    return (
      <NumberControl
        fieldId={fieldId}
        errorId={errorId}
        value={typeof currentValue === 'number' ? currentValue : 0}
        onCommit={onCommit}
      />
    );
  }
  if (typeTag === 'array') {
    return (
      <StringArrayControl
        fieldId={fieldId}
        errorId={errorId}
        value={Array.isArray(currentValue) ? (currentValue as string[]) : []}
        onCommit={onCommit}
      />
    );
  }
  // Default: string-like (text, url, regex-validated string).
  return (
    <StringControl
      fieldId={fieldId}
      errorId={errorId}
      value={typeof currentValue === 'string' ? currentValue : ''}
      onCommit={onCommit}
    />
  );
}

function StringControl({
  fieldId,
  errorId,
  value,
  onCommit,
}: {
  fieldId: string;
  errorId?: string;
  value: string;
  onCommit: (value: unknown) => boolean;
}) {
  const [pending, setPending] = useState(value);
  const [savedTick, setSavedTick] = useState(false);
  const lastCommittedRef = useRef(value);

  useEffect(() => {
    // External update reflects in the input only if the user isn't editing
    // (pending matches the previously-committed value).
    if (pending === lastCommittedRef.current) {
      setPending(value);
      lastCommittedRef.current = value;
    }
  }, [value, pending]);

  const commit = () => {
    if (pending === lastCommittedRef.current) return;
    if (onCommit(pending)) {
      lastCommittedRef.current = pending;
      flashSaved(setSavedTick);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        id={fieldId}
        value={pending}
        onChange={(e) => setPending(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
        aria-describedby={errorId}
        aria-invalid={errorId ? true : undefined}
        className="h-8 text-sm"
      />
      <SavedIndicator visible={savedTick} />
    </div>
  );
}

function NumberControl({
  fieldId,
  errorId,
  value,
  onCommit,
}: {
  fieldId: string;
  errorId?: string;
  value: number;
  onCommit: (value: unknown) => boolean;
}) {
  const [pending, setPending] = useState<string>(String(value));
  const [savedTick, setSavedTick] = useState(false);
  const lastCommittedRef = useRef(String(value));

  useEffect(() => {
    if (pending === lastCommittedRef.current) {
      setPending(String(value));
      lastCommittedRef.current = String(value);
    }
  }, [value, pending]);

  const commit = () => {
    if (pending === lastCommittedRef.current) return;
    const parsed = Number(pending);
    if (!Number.isFinite(parsed)) {
      // Let L1 reject + show a typed error rather than silently swallow.
      onCommit(pending);
      return;
    }
    if (onCommit(parsed)) {
      lastCommittedRef.current = pending;
      flashSaved(setSavedTick);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        id={fieldId}
        type="number"
        value={pending}
        onChange={(e) => setPending(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
        aria-describedby={errorId}
        aria-invalid={errorId ? true : undefined}
        className="h-8 w-28 text-sm"
      />
      <SavedIndicator visible={savedTick} />
    </div>
  );
}

function BooleanControl({
  fieldId,
  errorId,
  value,
  onCommit,
}: {
  fieldId: string;
  errorId?: string;
  value: boolean;
  onCommit: (value: unknown) => boolean;
}) {
  const [savedTick, setSavedTick] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <Switch
        id={fieldId}
        checked={value}
        aria-describedby={errorId}
        onCheckedChange={(next) => {
          if (onCommit(next)) flashSaved(setSavedTick);
        }}
      />
      <SavedIndicator visible={savedTick} />
    </div>
  );
}

function EnumToggleControl({
  fieldId,
  errorId,
  options,
  value,
  onCommit,
}: {
  fieldId: string;
  errorId?: string;
  options: readonly string[];
  value: string;
  onCommit: (value: unknown) => boolean;
}) {
  const [savedTick, setSavedTick] = useState(false);
  return (
    <div className="flex items-center gap-2" id={fieldId} aria-describedby={errorId}>
      <ToggleGroup
        type="single"
        value={value}
        variant="segmented"
        size="sm"
        spacing={1}
        className="bg-muted dark:bg-background p-0.5 rounded-lg"
        onValueChange={(v) => {
          if (!v) return;
          if (onCommit(v)) flashSaved(setSavedTick);
        }}
      >
        {options.map((opt) => (
          <ToggleGroupItem key={opt} value={opt} className="text-xs capitalize">
            {opt}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <SavedIndicator visible={savedTick} />
    </div>
  );
}

function StringArrayControl({
  fieldId,
  errorId,
  value,
  onCommit,
}: {
  fieldId: string;
  errorId?: string;
  value: readonly string[];
  onCommit: (value: unknown) => boolean;
}) {
  const initial = value.join('\n');
  const [pending, setPending] = useState(initial);
  const [savedTick, setSavedTick] = useState(false);
  const lastCommittedRef = useRef(initial);

  useEffect(() => {
    const incoming = value.join('\n');
    if (pending === lastCommittedRef.current) {
      setPending(incoming);
      lastCommittedRef.current = incoming;
    }
  }, [value, pending]);

  const commit = () => {
    if (pending === lastCommittedRef.current) return;
    const parsed = pending
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (onCommit(parsed)) {
      lastCommittedRef.current = pending;
      flashSaved(setSavedTick);
    }
  };

  return (
    <div className="flex items-start gap-2">
      <textarea
        id={fieldId}
        value={pending}
        onChange={(e) => setPending(e.target.value)}
        onBlur={commit}
        rows={Math.max(2, Math.min(6, pending.split('\n').length))}
        aria-describedby={errorId}
        aria-invalid={errorId ? true : undefined}
        className="min-h-16 w-full rounded-md border bg-background px-3 py-1.5 font-mono text-xs"
      />
      <SavedIndicator visible={savedTick} />
    </div>
  );
}

function SavedIndicator({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <span aria-hidden="true" className="text-emerald-600">
      <Check className="size-3.5" />
    </span>
  );
}

function flashSaved(setter: (next: boolean) => void): void {
  setter(true);
  setTimeout(() => setter(false), 1200);
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!valuesEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const aKeys = Object.keys(a as Record<string, unknown>);
    const bKeys = Object.keys(b as Record<string, unknown>);
    if (aKeys.length !== bKeys.length) return false;
    for (const k of aKeys) {
      if (!valuesEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) {
        return false;
      }
    }
    return true;
  }
  return false;
}

function humanFormatFirstIssue(error: ConfigValidationError): string {
  if (isKnownConfigError(error) && error.code === 'SCHEMA_INVALID') {
    const first = error.issues[0];
    if (first) return first.message;
  }
  return humanFormat(error);
}

function IntegrationsSection() {
  const [installOpen, setInstallOpen] = useState(false);
  const [showRow, setShowRow] = useState(true);

  useEffect(() => {
    const desktopBridge =
      typeof window !== 'undefined'
        ? (window as { okDesktop?: { skill?: { detectClaudeDesktop?: () => Promise<boolean> } } })
            .okDesktop
        : undefined;
    const detect = desktopBridge?.skill?.detectClaudeDesktop;
    if (!detect) {
      // Web mode or non-Electron — always show.
      setShowRow(true);
      return;
    }
    let cancelled = false;
    void detect()
      .then((present) => {
        if (!cancelled) setShowRow(present);
      })
      .catch(() => {
        if (!cancelled) setShowRow(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!showRow) return null;

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
            <p className="text-xs text-muted-foreground">
              Make this knowledge base available as a Claude Skill.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setInstallOpen(true)}
            data-testid="settings-install-claude-desktop"
          >
            Install…
          </Button>
        </div>
      </div>
      <InstallInClaudeDesktopDialog open={installOpen} onOpenChange={setInstallOpen} />
    </section>
  );
}
