/**
 * Settings pane.
 *
 * Replaces the document view in the main editor area when invoked via Cmd-,,
 * the App menu, HelpPopover, or CommandPalette. Sub-tabs separate
 * project ("This project") and user-global ("User") scopes;
 * each tab acquires its own `HocuspocusProvider` and binds via
 * `bindConfigDoc`.
 *
 * Auto-save: per-control commits via `binding.patch`. Client-side L1
 * validation gates writes; invalid commits never mutate Y.Text. Per-field
 * reset writes the schema default. Modified-at-scope indicator shows a
 * colored bar on `'either'` fields whose value differs from the schema
 * default.
 *
 * Form harness: a single `useForm<Config>` instance owned by
 * `useConfigForm(binding)` (D64 LOCKED resolver-less); external Y.Text
 * updates merge in via `binding.subscribe → form.reset({keepDirtyValues:
 * true, keepDirty: true, keepTouched: true})` (D65 LOCKED). Each
 * `SettingsField` wraps its body in a shadcn `FormField` whose
 * render-prop dispatches on the schema-walker's type tag.
 *
 * L3 rejection from non-pane writers (CLI, MCP, hand-edit) surfaces as a
 * sonner toast + brief field flash.
 *
 * The Integrations section hosts an "Install in Claude Desktop" row that
 * opens `<InstallInClaudeDesktopDialog>`.
 */

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
} from '@inkeep/open-knowledge-core';
import { Check, RotateCcw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { type ControllerRenderProps, type FieldPath, useFormContext } from 'react-hook-form';
import { toast } from 'sonner';
import * as Y from 'yjs';
import { InstallInClaudeDesktopDialog } from '@/components/InstallInClaudeDesktopDialog';
import { Button } from '@/components/ui/button';
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
import { subscribeToConfigValidationRejected } from '@/lib/config-validation-events';
import type { SettingsScope } from '@/lib/use-settings-route';
import {
  getEnumOptions,
  getFieldDefault,
  getLeafTypeTag,
  resolveLeafSchema,
} from './schema-walker';
import { useConfigForm } from './use-config-form';

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
        description: 'URL of your team’s deployed wiki (project-only).',
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
 * ConfigBinding lifetime. Each config doc gets its own provider; no
 * client-side y-indexeddb is instantiated.
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
    const docName = scope === 'project' ? CONFIG_DOC_NAME_PROJECT : CONFIG_DOC_NAME_USER;
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

  // The next-themes bridge for `appearance.theme` lives in <ConfigProvider>
  // (mounted at App root) — it's app-wide, not pane-scoped, so chrome
  // controls and external file edits propagate to next-themes whether
  // Settings is open or not.

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
              if (v === 'project' || v === 'user') onScopeChange(v);
            }}
            aria-label="Settings scope"
            variant="segmented"
            size="sm"
            spacing={1}
            className="bg-muted dark:bg-background p-0.5 rounded-lg"
          >
            <ToggleGroupItem value="project" className="text-xs">
              This project
            </ToggleGroupItem>
            <ToggleGroupItem value="user" className="text-xs">
              User
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
          <BoundSettingsForm scope={scope} binding={connection.binding} />
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

interface BoundSettingsFormProps {
  scope: SettingsScope;
  binding: ConfigBinding;
}

/**
 * Mounts the harness (`useConfigForm`) once per binding identity and
 * wraps the form in shadcn's `<Form>` (which is RHF's `FormProvider`).
 * Splitting from `SettingsPane` keeps the hook out of the loading branch
 * (`connection === null || !synced`) so we don't `useForm` on a binding
 * that hasn't synced yet.
 *
 * Owns the CC1 `'config-validation-rejected'` subscription (FR-39) and
 * the per-field flash state, since both need access to the `form`
 * instance — `form.setError` populates the inline FormMessage,
 * `form.setFocus` puts focus on the offending field, and the flash
 * triggers the `animate-settings-flash` CSS animation on the FormItem
 * wrapper.
 */
function BoundSettingsForm({ scope, binding }: BoundSettingsFormProps) {
  const { form, commitField } = useConfigForm(binding);
  const [flashedPath, setFlashedPath] = useState<string | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToConfigValidationRejected(
      (event: CC1ConfigValidationRejectedPayload) => {
        const isMatchingScope =
          (scope === 'workspace' && event.docName === CONFIG_DOC_NAME_WORKSPACE) ||
          (scope === 'user' && event.docName === CONFIG_DOC_NAME_USER);
        if (!isMatchingScope) return;

        const message = humanFormat(event.error);
        toast.error(message, { duration: 8000 });

        const path = firstIssuePath(event.error);
        if (path) {
          form.setError(path as FieldPath<Config>, {
            type: 'config-validation-rejected',
            message,
          });
          form.setFocus(path as FieldPath<Config>);
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
  }, [scope, form]);

  return (
    <Form {...form}>
      <SettingsForm scope={scope} commitField={commitField} flashedPath={flashedPath} />
    </Form>
  );
}

interface SettingsFormProps {
  scope: SettingsScope;
  commitField: (name: FieldPath<Config>) => boolean;
  flashedPath: string | null;
}

function SettingsForm({ scope, commitField, flashedPath }: SettingsFormProps) {
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
                commitField={commitField}
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
  if (meta.scope === 'project' && scope !== 'project') return false;
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
  commitField: (name: FieldPath<Config>) => boolean;
  isFlashed: boolean;
}

function SettingsField({ field, scope, commitField, isFlashed }: SettingsFieldProps) {
  'use no memo';
  const form = useFormContext<Config>();
  const leafSchema = resolveLeafSchema(ConfigSchema, field.path);
  const typeTag = leafSchema ? getLeafTypeTag(leafSchema) : undefined;
  const defaultValue = leafSchema ? getFieldDefault(leafSchema) : undefined;
  const meta = leafSchema ? getFieldMeta(leafSchema) : undefined;
  const enumOptions = leafSchema ? getEnumOptions(leafSchema) : undefined;

  const dottedName = field.path.join('.') as FieldPath<Config>;

  const [savedTick, setSavedTick] = useState(false);

  /**
   * Run `commitField` (the harness-owned binding.patch + form.setError /
   * form.clearErrors path) and flash the SavedIndicator on success. The
   * value committed is whatever currently lives in the form at `name` —
   * call sites are responsible for writing the desired value via
   * `ctl.onChange` (per-control commits) or `form.setValue` (reset path)
   * BEFORE invoking `runCommit`.
   */
  const runCommit = (): boolean => {
    const ok = commitField(dottedName);
    if (ok) flashSaved(setSavedTick);
    return ok;
  };

  /**
   * Reset writes the schema default (or `null` for fields with no
   * default — null-as-clear preserves RFC 7396 semantics) into form
   * state, then commits via the harness. `shouldDirty: false` so the
   * field doesn't end up flagged as dirty after reset.
   */
  const reset = () => {
    const target = defaultValue === undefined ? null : defaultValue;
    form.setValue(dottedName, target as never, { shouldDirty: false });
    runCommit();
  };

  const readonlyReason: string | null =
    meta?.scope === 'project' && scope !== 'project'
      ? "This field can only be set per-project. Switch to the 'This project' tab to edit it."
      : meta?.scope === 'user' && scope !== 'user'
        ? "This field can only be set globally. Switch to the 'User' tab to edit it."
        : null;

  const wrapperClass = `relative space-y-1 ${isFlashed ? 'animate-settings-flash' : ''}`;

  return (
    <FormField
      control={form.control}
      name={dottedName}
      render={({ field: ctl }) => {
        // Modified indicator + reset-button visibility derive from the
        // form's reactive value (`ctl.value`) so they update in lockstep
        // with user edits, external Y.Text updates, and resets.
        const isModified =
          defaultValue === undefined
            ? ctl.value !== undefined && ctl.value !== null
            : !valuesEqual(ctl.value, defaultValue);
        const showResetButton =
          !readonlyReason && (defaultValue !== undefined || ctl.value !== undefined);
        const indicator = isModified ? (
          <span
            data-modified="true"
            aria-hidden="true"
            className="absolute -left-3 top-1 h-5 w-0.5 rounded-full bg-primary"
          />
        ) : null;

        return (
          <FormItem className={wrapperClass} data-field={field.path.join('.')} data-scope={scope}>
            {indicator}
            <div className="flex items-baseline justify-between gap-2">
              <FormLabel className="text-sm font-medium">{field.label}</FormLabel>
              {showResetButton ? (
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
              <FormDescription className="text-xs text-muted-foreground">
                {field.description}
              </FormDescription>
            ) : null}
            {readonlyReason ? (
              // `role="note"` so screen readers announce this as explanatory
              // text rather than treating the dangling label as broken.
              <div
                role="note"
                className="rounded border border-dashed border-muted px-3 py-2 text-xs text-muted-foreground"
              >
                {readonlyReason}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <FormControl>
                  <FieldControlBody
                    field={field}
                    ctl={ctl}
                    typeTag={typeTag}
                    enumOptions={enumOptions}
                    onCommit={runCommit}
                  />
                </FormControl>
                <SavedIndicator visible={savedTick} />
              </div>
            )}
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
  /**
   * Commits the field's CURRENT form value via the harness's
   * `commitField`. Call sites must write the desired value through
   * `ctl.onChange` BEFORE invoking — the commit reads from form state.
   */
  onCommit: () => boolean;
}

/**
 * Type-tag-driven dispatch for the inner control element. Returns a
 * single React element so the wrapping `<FormControl>` (Radix Slot)
 * can forward `id`, `aria-describedby`, and `aria-invalid` to the
 * underlying DOM input.
 *
 * `'use no memo'` opts out of React Compiler memoization because RHF's
 * `ControllerRenderProps` exposes a `ref` field; the compiler heuristic
 * flags every property access on objects with `ref` as ref-access during
 * render. The control bodies below use the same opt-out for the same
 * reason.
 */
function FieldControlBody({ field, ctl, typeTag, enumOptions, onCommit }: FieldControlBodyProps) {
  'use no memo';
  if (typeTag === 'boolean') {
    return (
      <Switch
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
      return (
        <ToggleGroup
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
          {enumOptions.map((opt) => (
            <ToggleGroupItem key={opt} value={opt} className="text-xs capitalize">
              {opt}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      );
    }
  }
  if (typeTag === 'number' || typeTag === 'int') {
    return <NumberControlBody ctl={ctl} onCommit={onCommit} />;
  }
  if (typeTag === 'array') {
    return <StringArrayControlBody ctl={ctl} onCommit={onCommit} />;
  }
  return <StringControlBody ctl={ctl} onCommit={onCommit} />;
}

/**
 * String-typed text input. Form value IS the displayed text — no local
 * presentation buffer needed. Commits on blur or Enter.
 */
function StringControlBody({
  ctl,
  onCommit,
}: {
  ctl: ControllerRenderProps<Config, FieldPath<Config>>;
  onCommit: () => boolean;
}) {
  'use no memo';
  return (
    <Input
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

/**
 * Number-typed input. Form value is a `number`; the textbox needs a
 * string presentation buffer so the user can type intermediate text
 * (`'1.'`, `'-'`) without it parsing prematurely. The local `pendingText`
 * resyncs with `ctl.value` whenever the user isn't actively editing.
 */
function NumberControlBody({
  ctl,
  onCommit,
}: {
  ctl: ControllerRenderProps<Config, FieldPath<Config>>;
  onCommit: () => boolean;
}) {
  'use no memo';
  const [pendingText, setPendingText] = useState(ctl.value === undefined ? '' : String(ctl.value));
  const lastSyncedValueRef = useRef(ctl.value);

  useEffect(() => {
    // Pull a remote update into the textbox iff the user isn't mid-edit
    // (pendingText still matches the previously-synced value).
    if (lastSyncedValueRef.current === ctl.value) return;
    setPendingText(ctl.value === undefined ? '' : String(ctl.value));
    lastSyncedValueRef.current = ctl.value;
  }, [ctl.value]);

  const commitText = () => {
    const parsed = Number(pendingText);
    if (!Number.isFinite(parsed)) {
      // Let L1 reject + show a typed FormMessage error rather than silently swallow.
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
      className="h-8 w-28 text-sm"
    />
  );
}

/**
 * String-array textarea. Form value is `string[]`; the textarea displays
 * a newline-joined string. Local `pendingText` resyncs with `ctl.value`
 * whenever the user isn't actively editing. Commit splits on newlines,
 * trims each entry, and filters empty lines.
 */
function StringArrayControlBody({
  ctl,
  onCommit,
}: {
  ctl: ControllerRenderProps<Config, FieldPath<Config>>;
  onCommit: () => boolean;
}) {
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
      value={pendingText}
      ref={ctl.ref as unknown as React.Ref<HTMLTextAreaElement>}
      onChange={(e) => setPendingText(e.target.value)}
      onBlur={() => {
        ctl.onBlur();
        commitText();
      }}
      rows={Math.max(2, Math.min(6, pendingText.split('\n').length))}
      className="min-h-16 w-full rounded-md border bg-background px-3 py-1.5 font-mono text-xs"
    />
  );
}

function SavedIndicator({ visible }: { visible: boolean }) {
  // Live region — auto-save replaces an explicit Save button, so this
  // checkmark IS the save confirmation. Polite announcement so screen
  // readers say "Saved" without interrupting other speech (WCAG 4.1.3).
  // Always render the wrapper so the SR-only text node is present at
  // mount time; the visible checkmark is the only thing that toggles.
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

function _humanFormatFirstIssue(error: ConfigValidationError): string {
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
