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
    expect(SRC).toMatch(/append\(\s*\{\s*match:\s*''\s*,\s*frontmatter:\s*\{\}\s*\}/);
  });

  test('exposes remove() and move() bindings', () => {
    expect(SRC).toContain('remove(');
    expect(SRC).toContain('move(');
  });

  test('per-row commit writes the WHOLE folders[] array atomically', () => {
    expect(SRC).toContain('FOLDERS_PATH');
    expect(SRC).toMatch(/FOLDERS_PATH\s*=\s*'folders'/);
    expect(SRC).toContain('commitField(FOLDERS_PATH)');
  });

  test('renders four FormFields per row (match / title / description / tags)', () => {
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
    expect(SRC).toContain('getFieldState(FOLDERS_PATH).isDirty');
  });

  test('remove and move handlers commit unconditionally', () => {
    expect(SRC).toContain('runCommit()');
    expect(SRC).toMatch(/handleRemove[\s\S]{0,400}runCommit\(\)/);
    expect(SRC).toMatch(/handleMoveUp[\s\S]{0,200}runCommit\(\)/);
    expect(SRC).toMatch(/handleMoveDown[\s\S]{0,200}runCommit\(\)/);
  });

  test('handleAdd does NOT commit (empty match would fail Zod min(1) immediately)', () => {
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
    expect(SRC).toContain('queueMicrotask');
    expect(SRC).toContain('data-folder-action="remove"');
    expect(SRC).toContain('data-folder-action="add"');
  });
});
