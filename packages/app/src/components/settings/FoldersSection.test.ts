/**
 * Source-level guards for FoldersSection.
 *
 * Repo convention (see SettingsPane.test.ts, CommandPalette.test.ts): full
 * DOM + interaction coverage lives in Playwright stress tests; these guards
 * pin the structural invariants — useFieldArray wiring, append/remove/move
 * shape, atomic-array commit semantics, TagPillInput integration — that a
 * silent refactor would otherwise break without a runtime signal.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, 'FoldersSection.tsx'), 'utf8');

describe('FoldersSection module', () => {
  test('exports FoldersSection component', async () => {
    const mod = await import('./FoldersSection');
    expect(typeof mod.FoldersSection).toBe('function');
  });
});

describe('FoldersSection source-level guards', () => {
  test('imports useFieldArray from react-hook-form', () => {
    expect(SRC).toMatch(/from\s+['"]react-hook-form['"]/);
    expect(SRC).toContain('useFieldArray');
  });

  test('invokes useFieldArray with control + name=folders', () => {
    expect(SRC).toContain('useFieldArray({');
    expect(SRC).toContain('control: form.control');
    expect(SRC).toMatch(/name:\s*'folders'/);
  });

  test('append seeds new row with empty match + empty frontmatter', () => {
    // The exact append shape is the contract — passing a different shape
    // (e.g. omitting frontmatter, or seeding match with placeholder text)
    // would change the L1 rejection semantics for new rows.
    expect(SRC).toMatch(/append\(\s*\{\s*match:\s*''\s*,\s*frontmatter:\s*\{\}\s*\}/);
  });

  test('exposes remove() and move() bindings', () => {
    expect(SRC).toContain('remove(');
    expect(SRC).toContain('move(');
  });

  test('per-row commit writes the WHOLE folders[] array atomically', () => {
    // The atomic-full-array contract is load-bearing.
    // Per-row blur must funnel through commitField at the top-level
    // 'folders' path — never per-row paths like 'folders.0.match'.
    expect(SRC).toContain('FOLDERS_PATH');
    expect(SRC).toMatch(/FOLDERS_PATH\s*=\s*'folders'/);
    expect(SRC).toContain('commitField(FOLDERS_PATH)');
  });

  test('renders four FormFields per row (match / title / description / tags)', () => {
    // Path strings are the contract — RHF's Controller registers a field
    // by name. Drift on any of these silently re-paths the form state.
    // Regex (not toContain) to avoid biome's noTemplateCurlyInString warning
    // on string literals containing `${...}`.
    expect(SRC).toMatch(/`folders\.\$\{index\}\.match`/);
    expect(SRC).toMatch(/`folders\.\$\{index\}\.frontmatter\.title`/);
    expect(SRC).toMatch(/`folders\.\$\{index\}\.frontmatter\.description`/);
    expect(SRC).toMatch(/`folders\.\$\{index\}\.frontmatter\.tags`/);
  });

  test('tags row uses TagPillInput', () => {
    expect(SRC).toMatch(/from\s+['"]@\/components\/ui\/tag-pill-input['"]/);
    expect(SRC).toContain('TagPillInput');
  });

  test('section root carries data-testid and folder rows are indexable', () => {
    expect(SRC).toContain('data-testid="settings-folders-section"');
    expect(SRC).toMatch(/data-folder-row=\{index\}/);
  });

  test('Add button calls append with shouldFocus so the new match input gets focus', () => {
    expect(SRC).toMatch(/shouldFocus:\s*true/);
  });

  test('Move-up disabled on row 0; Move-down disabled on last row', () => {
    expect(SRC).toMatch(/disabled=\{index === 0\}/);
    expect(SRC).toMatch(/disabled=\{index >= total - 1\}/);
  });

  test('Remove button aria-label references the row state', () => {
    // The label uses the current match value when available, falling back
    // to a generic phrasing when the row is fresh/empty.
    expect(SRC).toMatch(/aria-label=\{removeLabel\}/);
    expect(SRC).toContain('Remove untitled folder rule');
  });

  test('Move-up / Move-down buttons have aria-label', () => {
    expect(SRC).toMatch(/aria-label=\{`Move folder rule \$\{index \+ 1\} up`\}/);
    expect(SRC).toMatch(/aria-label=\{`Move folder rule \$\{index \+ 1\} down`\}/);
  });

  test('flashedPath drives animate-settings-flash on the match FormItem', () => {
    expect(SRC).toContain('animate-settings-flash');
    expect(SRC).toContain('flashedPath === matchPath');
  });

  test('Add button has Plus icon + visible label', () => {
    expect(SRC).toMatch(/from\s+['"]lucide-react['"]/);
    expect(SRC).toContain('Plus');
    expect(SRC).toContain('Add folder rule');
  });

  test('blur dirty-skip guard avoids no-op commits', () => {
    // After a successful commit, the harness re-baselines the array;
    // a subsequent blur on an unchanged field should NOT issue another
    // binding.patch. The guard reads getFieldState(FOLDERS_PATH).isDirty.
    expect(SRC).toContain('getFieldState(FOLDERS_PATH).isDirty');
  });

  test('remove and move handlers commit unconditionally', () => {
    // remove/move always mutate the array, so they bypass the dirty
    // guard and call runCommit / commitField directly.
    expect(SRC).toContain('runCommit()');
    expect(SRC).toMatch(/handleRemove[\s\S]{0,400}runCommit\(\)/);
    expect(SRC).toMatch(/handleMoveUp[\s\S]{0,200}runCommit\(\)/);
    expect(SRC).toMatch(/handleMoveDown[\s\S]{0,200}runCommit\(\)/);
  });

  test('handleAdd does NOT commit (empty match would fail Zod min(1) immediately)', () => {
    // Negative guard: a refactor that adds runCommit/commitField to
    // handleAdd would make every Add click trigger an L1 rejection on
    // the empty-match seed and confuse the user. The first commit must
    // happen on the first valid match blur, not on Add.
    const handleAddIdx = SRC.indexOf('const handleAdd');
    expect(handleAddIdx).toBeGreaterThan(-1);
    const after = SRC.slice(handleAddIdx);
    const next = after.indexOf('const handleRemove');
    const block = next > -1 ? after.slice(0, next) : after;
    expect(block).not.toContain('runCommit(');
    expect(block).not.toContain('commitField(');
  });

  test('uses shadcn FormField / FormControl / FormMessage', () => {
    expect(SRC).toMatch(/from\s+['"]@\/components\/ui\/form['"]/);
    expect(SRC).toMatch(/<FormField\b/);
    expect(SRC).toMatch(/<FormControl\b/);
    expect(SRC).toMatch(/<FormMessage\b/);
  });

  test("uses 'use no memo' opt-out for Controller render-prop ref-access", () => {
    expect(SRC).toContain("'use no memo'");
  });

  test('does NOT use forwardRef / memo / useMemo / useCallback (React Compiler)', () => {
    expect(SRC).not.toContain('forwardRef');
    expect(SRC).not.toMatch(/\bmemo\s*\(/);
    expect(SRC).not.toContain('useMemo');
    expect(SRC).not.toContain('useCallback');
  });
});

describe('FoldersSection accessibility guards', () => {
  test('<ol> carries role="list" so Tailwind v4 list-style:none reset does not strip Safari VoiceOver semantics', () => {
    expect(SRC).toMatch(/<ol\b[^>]*role="list"/);
  });

  test('row index span is aria-hidden (decorative duplicate of <li> position)', () => {
    expect(SRC).toMatch(/<span[^>]*aria-hidden="true"[\s\S]{0,80}#\{index \+ 1\}/);
  });

  test('Remove button restores focus after row removal (no body-focus regression)', () => {
    // After remove(i), the focused trash button vanishes with its <li>.
    // Without a queueMicrotask focus restore, focus drops to <body> and
    // the user must Tab through the page to return to the section.
    expect(SRC).toContain('queueMicrotask');
    expect(SRC).toContain('data-folder-action="remove"');
    expect(SRC).toContain('data-folder-action="add"');
  });
});
