import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  derivePreviewPaths,
  parseRows,
  readShowAdvanced,
  writeShowAdvanced,
} from './OkignoreSection';

const SECTION_SRC = readFileSync(join(__dirname, 'OkignoreSection.tsx'), 'utf8');
const PANE_SRC = readFileSync(join(__dirname, 'SettingsDialog.tsx'), 'utf8');
const CONFIG_PROVIDER_SRC = readFileSync(
  join(__dirname, '..', '..', 'lib', 'config-provider.tsx'),
  'utf8',
);

describe('OkignoreSection module', () => {
  test('exports OkignoreSection component', async () => {
    const mod = await import('./OkignoreSection');
    expect(typeof mod.OkignoreSection).toBe('function');
  });

  test('exports parseRows helper for empty-state detection', async () => {
    const mod = await import('./OkignoreSection');
    expect(typeof mod.parseRows).toBe('function');
  });
});

describe('OkignoreSection source-level guards', () => {
  test('renders Ignore patterns heading + ARIA label', () => {
    expect(SECTION_SRC).toContain('Ignore patterns');
    expect(SECTION_SRC).toContain('aria-labelledby="settings-okignore-title"');
    expect(SECTION_SRC).toContain('id="settings-okignore-title"');
  });

  test('empty-state copy is plain-language and avoids the word "gitignore"', () => {
    const visibleSrc = SECTION_SRC.replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(?<!:)\/\/[^\n]*/g, '')
      .replace(/PRIMER_HREF\s*=\s*['"][^'"]*['"]/g, '');
    expect(visibleSrc).not.toMatch(/gitignore/i);
  });

  test('renders empty-state hint about hiding files', () => {
    expect(SECTION_SRC).toContain('No patterns yet');
    expect(SECTION_SRC).toContain('Hide files and folders');
  });

  test('exposes a primer link for users who want to learn pattern syntax', () => {
    expect(SECTION_SRC).toContain('PRIMER_HREF');
    expect(SECTION_SRC).toContain('Learn more about patterns');
    expect(SECTION_SRC).toMatch(/target="_blank"/);
    expect(SECTION_SRC).toMatch(/rel="noreferrer noopener"/);
  });

  test('renders a loading skeleton until the binding has synced', () => {
    expect(SECTION_SRC).toContain('binding === null || !synced');
    expect(SECTION_SRC).toMatch(/from\s+['"]@\/components\/ui\/skeleton['"]/);
    expect(SECTION_SRC).toContain('OkignoreSectionSkeleton');
  });

  test('uses shadcn Input + Button for the add-pattern affordance', () => {
    expect(SECTION_SRC).toMatch(/from\s+['"]@\/components\/ui\/input['"]/);
    expect(SECTION_SRC).toMatch(/from\s+['"]@\/components\/ui\/button['"]/);
    expect(SECTION_SRC).toContain('Add pattern');
  });

  test('add-pattern button is disabled until the user types something non-blank', () => {
    expect(SECTION_SRC).toMatch(/disabled=\{pending\.trim\(\)\.length\s*===\s*0\}/);
  });

  test('Enter key on the add-input commits via the same path as the button', () => {
    expect(SECTION_SRC).toMatch(/onKeyDown=/);
    expect(SECTION_SRC).toMatch(/e\.key\s*===\s*'Enter'/);
    expect(SECTION_SRC).toContain('e.preventDefault()');
  });

  test('commit goes through binding.patch with bytes from the pure serializer', () => {
    expect(SECTION_SRC).toContain('binding.current()');
    expect(SECTION_SRC).toContain('binding.patch(');
    expect(SECTION_SRC).toMatch(/serializeOkignoreDoc\(/);
  });

  test('subscribes to binding text updates and re-derives rows on every change', () => {
    expect(SECTION_SRC).toContain('binding.subscribe(');
    expect(SECTION_SRC).toMatch(/parseOkignoreDoc\(text\)/);
    expect(SECTION_SRC).toMatch(/listPatterns\(doc\)/);
  });

  test('renders existing patterns as a divided list of editable rows', () => {
    expect(SECTION_SRC).toContain('settings-okignore-list');
    expect(SECTION_SRC).toContain('settings-okignore-row');
    expect(SECTION_SRC).toMatch(/font-mono/);
  });

  test('each row exposes a remove (×) button wired to onRemove', () => {
    expect(SECTION_SRC).toContain('settings-okignore-remove');
    expect(SECTION_SRC).toMatch(/aria-label=\{`Remove \$\{pattern\.text\}`\}/);
    expect(SECTION_SRC).toMatch(/onClick=\{\(\)\s*=>\s*onRemove\(patternIndex\)\}/);
  });

  test('each row commits an edit on focus-out via the binding', () => {
    expect(SECTION_SRC).toMatch(/onBlur=/);
    expect(SECTION_SRC).toMatch(/handleCommit/);
    expect(SECTION_SRC).toMatch(/lastSyncedRef/);
    expect(SECTION_SRC).toMatch(/focusedRef/);
  });

  test('Enter key commits via the same path as blur (uses currentTarget.blur)', () => {
    expect(SECTION_SRC).toMatch(/e\.key === 'Enter'/);
    expect(SECTION_SRC).toContain('e.preventDefault()');
    expect(SECTION_SRC).toMatch(/\(e\.currentTarget as HTMLInputElement\)\.blur\(\)/);
  });

  test('Escape key reverts the draft to the last synced value', () => {
    expect(SECTION_SRC).toMatch(/e\.key === 'Escape'/);
    expect(SECTION_SRC).toMatch(/setDraft\(lastSyncedRef\.current\)/);
  });

  test('exposes a drag handle on every row using @dnd-kit/sortable', () => {
    expect(SECTION_SRC).toContain('settings-okignore-drag-handle');
    expect(SECTION_SRC).toMatch(/from\s+['"]@dnd-kit\/sortable['"]/);
    expect(SECTION_SRC).toMatch(/useSortable\(\{\s*id:\s*sortableId/);
    expect(SECTION_SRC).toMatch(/GripVertical/);
  });

  test('wraps the row list in DndContext + SortableContext (vertical strategy)', () => {
    expect(SECTION_SRC).toMatch(/<DndContext/);
    expect(SECTION_SRC).toMatch(/<SortableContext/);
    expect(SECTION_SRC).toMatch(/verticalListSortingStrategy/);
    expect(SECTION_SRC).toMatch(/closestCenter/);
  });

  test('reorder handler delegates to the pure reorderPatterns op', () => {
    expect(SECTION_SRC).toContain('handleDragEnd');
    expect(SECTION_SRC).toMatch(/reorderPatterns\(doc,\s*fromIndex,\s*toIndex\)/);
  });

  test('add / remove / edit go through the pure structural ops, not ad-hoc string surgery', () => {
    expect(SECTION_SRC).toMatch(/appendPattern\(doc,\s*trimmed\)/);
    expect(SECTION_SRC).toMatch(/removePatternAt\(doc,\s*patternIndex\)/);
    expect(SECTION_SRC).toMatch(/editPatternAt\(doc,\s*patternIndex,\s*trimmed\)/);
  });

  test('per-row SavedIndicator flashes a green check on commit (matches SettingsDialog pattern)', () => {
    expect(SECTION_SRC).toContain('settings-okignore-saved-indicator');
    expect(SECTION_SRC).toMatch(/text-emerald-600/);
    expect(SECTION_SRC).toMatch(/SAVED_FLASH_MS/);
    expect(SECTION_SRC).toMatch(/triggerFlash\(/);
    expect(SECTION_SRC).toMatch(/role="status"/);
    expect(SECTION_SRC).toMatch(/aria-live="polite"/);
    expect(SECTION_SRC).toContain('Saved');
  });

  test('flash timer is cleared on unmount to avoid setState on torn-down components', () => {
    expect(SECTION_SRC).toMatch(/flashTimerRef/);
    expect(SECTION_SRC).toMatch(/clearTimeout\(flashTimerRef\.current\)/);
  });

  test('parseRows is implemented in terms of the pure parser (single source of truth)', () => {
    expect(SECTION_SRC).toMatch(/export function parseRows/);
    expect(SECTION_SRC).toMatch(/listPatterns\(parseOkignoreDoc\(text\)\)/);
  });

  test('does NOT route through the shadcn form harness — stays a sibling of SyncSection / IntegrationsSection', () => {
    expect(SECTION_SRC).not.toMatch(/from\s+['"]@\/components\/ui\/form['"]/);
    expect(SECTION_SRC).not.toMatch(/<FormField\b/);
    expect(SECTION_SRC).not.toMatch(/useConfigForm\(/);
  });

  test('does NOT instantiate its own HocuspocusProvider (binding lives at ConfigProvider)', () => {
    expect(SECTION_SRC).not.toMatch(/HocuspocusProvider/);
    expect(SECTION_SRC).not.toMatch(/new\s+Y\.Doc\b/);
  });
});

describe('OkignoreSection wiring in SettingsDialog', () => {
  test('imports OkignoreSection from a sibling module', () => {
    expect(PANE_SRC).toMatch(/from\s+['"]\.\/OkignoreSection['"]/);
    expect(PANE_SRC).toContain('OkignoreSection');
  });

  test('renders OkignoreSection under THIS PROJECT in the "Ignore patterns" sidebar item (D12 LOCKED)', () => {
    expect(PANE_SRC).toMatch(/activeId\s*===\s*['"]okignore['"]\s*\)[\s\S]*?<OkignoreSection\b/);
  });

  test('reads the binding + sync state from the ConfigProvider context', () => {
    expect(PANE_SRC).toMatch(/from\s+['"]@\/lib\/config-provider['"]/);
    expect(PANE_SRC).toContain('useConfigContext');
    expect(PANE_SRC).toMatch(/okignoreBinding/);
    expect(PANE_SRC).toMatch(/okignoreSynced/);
  });
});

describe('ConfigProvider okignore wiring', () => {
  test('mounts a Hocuspocus provider on __config__/okignore alongside the existing config docs', () => {
    expect(CONFIG_PROVIDER_SRC).toContain('CONFIG_DOC_NAME_OKIGNORE');
    expect(CONFIG_PROVIDER_SRC).toContain('bindOkignoreDoc');
    expect(CONFIG_PROVIDER_SRC).toContain('makeOkignoreBinding');
  });

  test('exposes okignoreBinding + okignoreSynced through the context', () => {
    expect(CONFIG_PROVIDER_SRC).toContain('okignoreBinding: OkignoreBinding | null');
    expect(CONFIG_PROVIDER_SRC).toContain('okignoreSynced: boolean');
  });

  test('tracks the provider synced event via the standard "synced" listener', () => {
    expect(CONFIG_PROVIDER_SRC).toMatch(/provider\.on\('synced'/);
    expect(CONFIG_PROVIDER_SRC).toMatch(/provider\.off\('synced'/);
  });

  test('cleans up the okignore binding + provider on unmount', () => {
    expect(CONFIG_PROVIDER_SRC).toMatch(/okignoreScoped\.cleanup\(\)/);
  });

  test('does NOT attach a client-side IndexedDB persistence layer', () => {
    expect(CONFIG_PROVIDER_SRC).not.toMatch(/IndexeddbPersistence/);
    expect(CONFIG_PROVIDER_SRC).not.toMatch(/createClientPersistence/);
  });
});

describe('parseRows helper', () => {
  test('returns an empty array for an empty body', () => {
    expect(parseRows('')).toEqual([]);
  });

  test('returns an empty array for a body of only blank lines', () => {
    expect(parseRows('\n\n  \n\t\n')).toEqual([]);
  });

  test('returns an empty array for a body of only comments', () => {
    expect(parseRows('# header\n# another comment\n')).toEqual([]);
  });

  test('returns each non-comment, non-blank line as a row, trimmed', () => {
    expect(parseRows('drafts/\n*.draft.md\n')).toEqual(['drafts/', '*.draft.md']);
  });

  test('skips comment lines interleaved with patterns', () => {
    expect(parseRows('# header\ndrafts/\n\n# section 2\n*.tmp\n')).toEqual(['drafts/', '*.tmp']);
  });

  test('strips leading and trailing whitespace from rows (display layer convenience)', () => {
    expect(parseRows('  drafts/  \n\t*.tmp\t\n')).toEqual(['drafts/', '*.tmp']);
  });

  test('treats a leading "#" character as a comment (no support for escaped # patterns in v1)', () => {
    expect(parseRows('# not a row\n#also-comment\nactual\n')).toEqual(['actual']);
  });
});

describe('OkignoreSection — US-009 heuristic warnings', () => {
  test('imports the heuristic checker from the pure module', () => {
    expect(SECTION_SRC).toMatch(/from\s+['"]\.\/okignore-warnings['"]/);
    expect(SECTION_SRC).toContain('checkHeuristicWarnings');
  });

  test('warning indicator is rendered next to row inputs and the add input', () => {
    expect(SECTION_SRC).toContain('settings-okignore-warning-indicator');
    expect(SECTION_SRC).toContain('WarningIndicator');
  });

  test('warnings are debounced ~150ms via a useEffect timer (per FR7 perceptual budget)', () => {
    expect(SECTION_SRC).toContain('HEURISTIC_DEBOUNCE_MS');
    expect(SECTION_SRC).toMatch(/HEURISTIC_DEBOUNCE_MS\s*=\s*150/);
    expect(SECTION_SRC).toContain('useDebouncedHeuristicWarnings');
  });

  test('warning indicator surfaces tooltip with all warning messages (shadcn Tooltip)', () => {
    expect(SECTION_SRC).toMatch(/from\s+['"]@\/components\/ui\/tooltip['"]/);
    expect(SECTION_SRC).toContain('TooltipTrigger');
    expect(SECTION_SRC).toContain('TooltipContent');
    expect(SECTION_SRC).toMatch(/AlertTriangle/);
  });

  test('warnings are non-blocking — commit still happens regardless of warnings array', () => {
    expect(SECTION_SRC).not.toMatch(/if\s*\(\s*warnings\.length\s*>\s*0\s*\)\s*return/);
    expect(SECTION_SRC).not.toMatch(/warnings\.length\s*>\s*0\s*&&[^\n]*binding\.patch/);
  });

  test('warning input gets an amber border but stays usable (no disabled state)', () => {
    expect(SECTION_SRC).toMatch(/border-amber-500\/60/);
    expect(SECTION_SRC).not.toMatch(/warnings\.length\s*>\s*0\s*\|\|\s*pending\.trim/);
  });
});

describe('OkignoreSection — US-009 L3 rejection routing', () => {
  test('subscribes to subscribeToConfigValidationRejected and filters by docName', () => {
    expect(SECTION_SRC).toMatch(/subscribeToConfigValidationRejected/);
    expect(SECTION_SRC).toContain('CONFIG_DOC_NAME_OKIGNORE');
    expect(SECTION_SRC).toMatch(/event\.docName\s*!==\s*CONFIG_DOC_NAME_OKIGNORE/);
  });

  test('routes matching rejections into the binding via notifyRejection', () => {
    expect(SECTION_SRC).toMatch(/binding\.notifyRejection\(event\.error\)/);
  });

  test('local rejection state is driven by binding.subscribeRejection', () => {
    expect(SECTION_SRC).toContain('binding.subscribeRejection');
    expect(SECTION_SRC).toContain('setRejection');
  });

  test('rejection banner renders an alert with the offending detail and lineNumber', () => {
    expect(SECTION_SRC).toContain('settings-okignore-rejection-banner');
    expect(SECTION_SRC).toContain('Pattern syntax error');
    expect(SECTION_SRC).toMatch(
      /rejection\.lineNumber\s*\?\s*` \(line \$\{rejection\.lineNumber\}\)`/,
    );
  });

  test('rejection banner uses a destructive color treatment (matches existing settings-flash UX)', () => {
    expect(SECTION_SRC).toMatch(/border-destructive/);
    expect(SECTION_SRC).toMatch(/text-destructive/);
    expect(SECTION_SRC).toMatch(/bg-destructive/);
  });

  test('rejection banner auto-dismisses after REJECTION_BANNER_MS via a cleanup-aware timer', () => {
    expect(SECTION_SRC).toContain('REJECTION_BANNER_MS');
    expect(SECTION_SRC).toMatch(/REJECTION_BANNER_MS\s*=\s*5000/);
    expect(SECTION_SRC).toMatch(/rejectionTimerRef/);
    expect(SECTION_SRC).toMatch(/clearTimeout\(rejectionTimerRef\.current\)/);
  });

  test('AddPatternRow flashes red briefly when a rejection arrives', () => {
    expect(SECTION_SRC).toContain('useRejectionFlash');
    expect(SECTION_SRC).toContain('REJECTION_FLASH_MS');
    expect(SECTION_SRC).toMatch(/REJECTION_FLASH_MS\s*=\s*600/);
    expect(SECTION_SRC).toMatch(/data-rejection-flashing/);
    expect(SECTION_SRC).toMatch(/border-destructive/);
  });

  test('rejection routing only fires for the okignore docName (does NOT swallow project/user rejections)', () => {
    expect(SECTION_SRC).toMatch(/event\.docName\s*!==\s*CONFIG_DOC_NAME_OKIGNORE\)\s*return/);
  });

  test('error-formatting uses humanFormat as the fallback for unknown error codes', () => {
    expect(SECTION_SRC).toContain('humanFormat');
    expect(SECTION_SRC).toContain('isKnownConfigError');
  });
});

describe('OkignoreSection — US-010 Show advanced toggle (source-level)', () => {
  test('exports the localStorage helpers used by the hook', () => {
    expect(SECTION_SRC).toMatch(/export function readShowAdvanced/);
    expect(SECTION_SRC).toMatch(/export function writeShowAdvanced/);
  });

  test('uses the spec-locked localStorage key (D14)', () => {
    expect(SECTION_SRC).toMatch(/SHOW_ADVANCED_LS_KEY\s*=\s*['"]okignore-show-advanced['"]/);
  });

  test('readShowAdvanced + writeShowAdvanced are wrapped in try/catch (real R3 boundary)', () => {
    expect(SECTION_SRC).toMatch(/function readShowAdvanced[\s\S]*?try\s*\{[\s\S]*?\}\s*catch/);
    expect(SECTION_SRC).toMatch(/function writeShowAdvanced[\s\S]*?try\s*\{[\s\S]*?\}\s*catch/);
  });

  test('toggle button uses aria-pressed reflecting the on/off state', () => {
    expect(SECTION_SRC).toContain('settings-okignore-show-advanced-toggle');
    expect(SECTION_SRC).toMatch(/aria-pressed=\{enabled\}/);
  });

  test('toggle label flips between "Show advanced" and "Hide advanced"', () => {
    expect(SECTION_SRC).toMatch(/enabled\s*\?\s*'Hide advanced'\s*:\s*'Show advanced'/);
  });

  test('raw-text editor is rendered ONLY when the toggle is on (replaces list/empty-state)', () => {
    expect(SECTION_SRC).toMatch(/showAdvanced\s*\?\s*\(?\s*<OkignoreAdvancedEditor/);
    expect(SECTION_SRC).toMatch(/:\s*isEmpty\s*\?\s*\(?\s*<OkignoreEmptyState/);
  });

  test('raw-text textarea uses the monospace settings textarea styling', () => {
    expect(SECTION_SRC).toMatch(/data-testid="settings-okignore-advanced-textarea"/);
    expect(SECTION_SRC).toMatch(/font-mono/);
  });

  test('raw-text textarea binds to the binding text prop and commits via binding.patch', () => {
    expect(SECTION_SRC).toMatch(/function OkignoreAdvancedEditor[\s\S]*?text:\s*string/);
    expect(SECTION_SRC).toMatch(/binding\.patch\(next\)/);
    expect(SECTION_SRC).toMatch(/binding\.patch\(draftRef\.current\)/);
  });

  test('raw-text commits are debounced via RAW_TEXT_COMMIT_MS in the 300-500ms range (per FR3)', () => {
    expect(SECTION_SRC).toMatch(/RAW_TEXT_COMMIT_MS\s*=\s*(3\d\d|4\d\d|500)/);
    expect(SECTION_SRC).toMatch(/scheduleCommit/);
    expect(SECTION_SRC).toMatch(/setTimeout\([\s\S]*?RAW_TEXT_COMMIT_MS\)/);
  });

  test('raw-text editor uses focusedRef + lastSyncedRef pattern (no remote-stomp during typing)', () => {
    expect(SECTION_SRC).toMatch(
      /function OkignoreAdvancedEditor[\s\S]*?focusedRef\.current[\s\S]*?lastSyncedRef\.current/,
    );
  });

  test('blur flushes any pending debounced commit immediately', () => {
    expect(SECTION_SRC).toMatch(/onBlur=[\s\S]*?flushCommit/);
    expect(SECTION_SRC).toMatch(/const\s+flushCommit\s*=\s*\(\)\s*=>/);
  });

  test('unmount flushes any pending commit (toggle-off does not drop typed content)', () => {
    expect(SECTION_SRC).toMatch(
      /return\s*\(\)\s*=>\s*\{[\s\S]*?clearTimeout\(commitTimerRef\.current\)/,
    );
    expect(SECTION_SRC).toMatch(/binding\.patch\(draftRef\.current\)/);
  });

  test('raw-text editor does NOT engage the structural ops (no parse/serialize at this boundary)', () => {
    const editorSlice = SECTION_SRC.match(/function OkignoreAdvancedEditor[\s\S]*?^}/m)?.[0] ?? '';
    expect(editorSlice).not.toMatch(/appendPattern\b/);
    expect(editorSlice).not.toMatch(/editPatternAt\b/);
    expect(editorSlice).not.toMatch(/removePatternAt\b/);
    expect(editorSlice).not.toMatch(/reorderPatterns\b/);
    expect(editorSlice).not.toMatch(/serializeOkignoreDoc\b/);
    expect(editorSlice).not.toMatch(/parseOkignoreDoc\b/);
  });

  test('toggle is rendered alongside the editor (always visible regardless of mode)', () => {
    expect(SECTION_SRC).toMatch(/<ShowAdvancedToggle\s+enabled=\{showAdvanced\}/);
    expect(SECTION_SRC).toMatch(/onToggle=\{[\s\S]*?setShowAdvanced\(!showAdvanced\)/);
  });
});

describe('OkignoreSection — US-010 localStorage trust-boundary (mutation-pass via public interface)', () => {
  let storage: Map<string, string>;
  const originalLocalStorage = (globalThis as unknown as { localStorage?: unknown }).localStorage;

  beforeEach(() => {
    storage = new Map<string, string>();
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => {
        storage.set(k, v);
      },
      removeItem: (k: string) => {
        storage.delete(k);
      },
      clear: () => {
        storage.clear();
      },
      key: () => null,
      get length() {
        return storage.size;
      },
    } as Storage;
  });

  afterEach(() => {
    if (originalLocalStorage === undefined) {
      delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
    } else {
      (globalThis as unknown as { localStorage: unknown }).localStorage = originalLocalStorage;
    }
  });

  test('readShowAdvanced returns false when key is unset (default-off)', () => {
    expect(readShowAdvanced()).toBe(false);
  });

  test('readShowAdvanced returns true when key is set to "true"', () => {
    storage.set('okignore-show-advanced', 'true');
    expect(readShowAdvanced()).toBe(true);
  });

  test('readShowAdvanced returns false when key is set to anything other than "true"', () => {
    storage.set('okignore-show-advanced', 'false');
    expect(readShowAdvanced()).toBe(false);
    storage.set('okignore-show-advanced', '1');
    expect(readShowAdvanced()).toBe(false);
    storage.set('okignore-show-advanced', '');
    expect(readShowAdvanced()).toBe(false);
  });

  test('writeShowAdvanced(true) persists "true"', () => {
    writeShowAdvanced(true);
    expect(storage.get('okignore-show-advanced')).toBe('true');
  });

  test('writeShowAdvanced(false) persists "false" (so a previous "true" is cleared)', () => {
    storage.set('okignore-show-advanced', 'true');
    writeShowAdvanced(false);
    expect(storage.get('okignore-show-advanced')).toBe('false');
    expect(readShowAdvanced()).toBe(false);
  });

  test('round-trip: write(true) then read returns true', () => {
    writeShowAdvanced(true);
    expect(readShowAdvanced()).toBe(true);
  });

  test('readShowAdvanced returns false when localStorage is undefined (SSR safety)', () => {
    delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
    expect(readShowAdvanced()).toBe(false);
  });

  test('writeShowAdvanced silently no-ops when localStorage is undefined', () => {
    delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
    expect(() => writeShowAdvanced(true)).not.toThrow();
  });

  test('readShowAdvanced returns false when getItem throws (Safari private mode)', () => {
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: () => {
        throw new Error('SecurityError: localStorage unavailable in private mode');
      },
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    } as Storage;
    expect(readShowAdvanced()).toBe(false);
  });

  test('writeShowAdvanced silently no-ops when setItem throws (quota exceeded)', () => {
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    } as Storage;
    expect(() => writeShowAdvanced(true)).not.toThrow();
  });
});

describe('OkignoreSection — US-011 per-row pattern preview (source-level)', () => {
  test('PatternRowInput threads filePaths and renders <PatternPreview />', () => {
    expect(SECTION_SRC).toMatch(/function PatternRowInput\(/);
    expect(SECTION_SRC).toMatch(/filePaths: ReadonlyArray<string>/);
    expect(SECTION_SRC).toMatch(/<PatternPreview count=\{previewCount\} \/>/);
  });

  test('PatternRowInput uses useDebouncedPreview against the input draft', () => {
    expect(SECTION_SRC).toMatch(/useDebouncedPreview\(draft, filePaths\)/);
  });

  test('AddPatternRow threads filePaths and renders <PatternPreview /> for the typing input', () => {
    expect(SECTION_SRC).toMatch(/function AddPatternRow\(/);
    const addRow = SECTION_SRC.slice(SECTION_SRC.indexOf('function AddPatternRow('));
    expect(addRow).toMatch(/filePaths: ReadonlyArray<string>/);
    expect(addRow).toMatch(/useDebouncedPreview\(pending, filePaths\)/);
    expect(addRow).toMatch(/<PatternPreview count=\{previewCount\}/);
  });

  test('OkignoreEmptyState forwards filePaths into AddPatternRow', () => {
    const empty = SECTION_SRC.slice(SECTION_SRC.indexOf('function OkignoreEmptyState('));
    expect(empty).toMatch(/filePaths: ReadonlyArray<string>/);
    expect(empty).toMatch(/<AddPatternRow[\s\S]*?filePaths=\{filePaths\}/);
  });

  test('OkignorePatternList forwards filePaths into rows AND AddPatternRow', () => {
    const list = SECTION_SRC.slice(SECTION_SRC.indexOf('function OkignorePatternList('));
    expect(list).toMatch(/filePaths: ReadonlyArray<string>/);
    expect(list).toMatch(/<SortablePatternRow[\s\S]*?filePaths=\{filePaths\}/);
    expect(list).toMatch(/<AddPatternRow[\s\S]*?filePaths=\{filePaths\}/);
  });

  test('OkignoreSectionBody calls usePageList and derives filePaths via derivePreviewPaths', () => {
    expect(SECTION_SRC).toMatch(/usePageList\(\)/);
    expect(SECTION_SRC).toMatch(/derivePreviewPaths\(pages, pageMeta, assetPaths\)/);
  });

  test('imports countMatches from the okignore-preview module (not a duplicate ignore() instantiation)', () => {
    expect(SECTION_SRC).toMatch(/from '\.\/okignore-preview'/);
    expect(SECTION_SRC).toMatch(/countMatches/);
    expect(SECTION_SRC).not.toMatch(/from 'ignore'/);
  });

  test('PREVIEW_DEBOUNCE_MS is 150ms (matches FR7 perceptual budget)', () => {
    expect(SECTION_SRC).toMatch(/const PREVIEW_DEBOUNCE_MS = 150;/);
  });

  test('useDebouncedPreview wires setTimeout with PREVIEW_DEBOUNCE_MS, not a literal magic number', () => {
    expect(SECTION_SRC).toMatch(
      /setTimeout\([\s\S]*?countMatches\(trimmed, filePaths\)[\s\S]*?\}, PREVIEW_DEBOUNCE_MS\)/,
    );
  });

  test('useDebouncedPreview returns null on empty input so PatternPreview hides gracefully', () => {
    expect(SECTION_SRC).toMatch(/trimmed\.length === 0[\s\S]{0,80}setCount\(null\)/);
  });

  test('PatternPreview renders the FR7 caveat label "(some may already be hidden by other rules)"', () => {
    expect(SECTION_SRC).toMatch(/\(some may already be hidden by other rules\)/);
  });

  test('PatternPreview uses muted styling for matches 0', () => {
    const preview = SECTION_SRC.slice(SECTION_SRC.indexOf('function PatternPreview('));
    expect(preview).toMatch(/isZero[\s\S]{0,60}text-muted-foreground/);
  });

  test('PatternPreview pluralizes correctly (1 file vs N files)', () => {
    expect(SECTION_SRC).toMatch(/count === 1 \? 'file' : 'files'/);
  });

  test('PatternPreview exposes data-testid="settings-okignore-preview" + state attrs for e2e', () => {
    const preview = SECTION_SRC.slice(SECTION_SRC.indexOf('function PatternPreview('));
    expect(preview).toMatch(/data-testid="settings-okignore-preview"/);
    expect(preview).toMatch(/data-preview-state="visible"/);
    expect(preview).toMatch(/data-preview-state="hidden"/);
    expect(preview).toMatch(/data-preview-count=/);
  });

  test('derivePreviewPaths reattaches docExt to docName for documents and passes assetPaths through', () => {
    const pages = new Set<string>(['drafts/foo', 'index']);
    const pageMeta = new Map<string, { docExt?: string }>([
      ['drafts/foo', { docExt: '.md' }],
      ['index', { docExt: '.mdx' }],
    ]);
    const assetPaths = new Set<string>(['images/diagram.png']);
    const result = derivePreviewPaths(pages, pageMeta, assetPaths);
    expect(result).toContain('drafts/foo.md');
    expect(result).toContain('index.mdx');
    expect(result).toContain('images/diagram.png');
    expect(result).toHaveLength(3);
  });

  test('derivePreviewPaths defaults missing docExt to .md', () => {
    const pages = new Set<string>(['orphan']);
    const pageMeta = new Map<string, { docExt?: string }>();
    const result = derivePreviewPaths(pages, pageMeta, new Set());
    expect(result).toEqual(['orphan.md']);
  });

  test('derivePreviewPaths returns an empty array on empty inputs', () => {
    expect(derivePreviewPaths(new Set(), new Map(), new Set())).toEqual([]);
  });
});

describe('OkignoreSection — US-012 nested-error toast routing (source-level)', () => {
  test('imports subscribeToConfigIgnoreNestedError from the dedicated event-bus module', () => {
    expect(SECTION_SRC).toMatch(
      /import \{ subscribeToConfigIgnoreNestedError \} from '@\/lib\/config-ignore-nested-error-events';/,
    );
  });

  test('imports the sonner toast helper for surfacing nested-error notifications', () => {
    expect(SECTION_SRC).toMatch(/import \{ toast \} from 'sonner';/);
  });

  test('OkignoreSectionBody subscribes via useEffect with empty deps (mounts once for the section lifetime)', () => {
    const body = SECTION_SRC.slice(SECTION_SRC.indexOf('function OkignoreSectionBody('));
    expect(body).toMatch(/return subscribeToConfigIgnoreNestedError\(\(event\) => \{[\s\S]*?\}\);/);
    expect(body).toMatch(
      /useEffect\(\(\) => \{\s*return subscribeToConfigIgnoreNestedError\(\(event\) => \{[\s\S]*?\}\);\s*\}, \[\]\);/,
    );
  });

  test('toast.error renders the project-relative path in the title and the error in the description', () => {
    const body = SECTION_SRC.slice(SECTION_SRC.indexOf('function OkignoreSectionBody('));
    expect(body).toMatch(/toast\.error\(`Nested \.okignore error in \$\{event\.path\}`,/);
    expect(body).toMatch(/description: event\.error,/);
  });

  test('toast deduplicates per-path via a stable id so a watcher loop does NOT spam the toast queue', () => {
    const body = SECTION_SRC.slice(SECTION_SRC.indexOf('function OkignoreSectionBody('));
    expect(body).toMatch(/id: `okignore-nested-error:\$\{event\.path\}`,/);
  });

  test('toast is non-blocking with a bounded duration (auto-dismiss)', () => {
    const body = SECTION_SRC.slice(SECTION_SRC.indexOf('function OkignoreSectionBody('));
    expect(body).toMatch(/duration: \d+,/);
  });
});

describe('SystemDocSubscriber — US-012 nested-error CC1 routing', () => {
  const SUBSCRIBER_SRC = readFileSync(join(__dirname, '..', 'SystemDocSubscriber.tsx'), 'utf8');

  test('imports emitConfigIgnoreNestedError from the dedicated event-bus module', () => {
    expect(SUBSCRIBER_SRC).toMatch(
      /import \{ emitConfigIgnoreNestedError \} from '@\/lib\/config-ignore-nested-error-events';/,
    );
  });

  test('wires onConfigIgnoreNestedError handler in dispatchCC1Stateless', () => {
    expect(SUBSCRIBER_SRC).toMatch(
      /onConfigIgnoreNestedError:\s*\(p\) => \{\s*emitConfigIgnoreNestedError\(p\);\s*\},/,
    );
  });

  test('cc1.ts dispatcher exposes onConfigIgnoreNestedError handler slot', () => {
    const cc1Src = readFileSync(join(__dirname, '..', '..', 'lib', 'cc1.ts'), 'utf8');
    expect(cc1Src).toMatch(
      /onConfigIgnoreNestedError\?:\s*\(payload: CC1ConfigIgnoreNestedErrorPayload\) => void;/,
    );
    expect(cc1Src).toMatch(/parseCC1ConfigIgnoreNestedError/);
  });
});
