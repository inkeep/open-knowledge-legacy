import { describe, expect, test } from 'bun:test';
import SRC from './EditorBreadcrumb?raw';

describe('EditorBreadcrumb module', () => {
  test('exports the EditorBreadcrumb component', async () => {
    const mod = await import('./EditorBreadcrumb');
    expect(typeof mod.EditorBreadcrumb).toBe('function');
  });

  test('returns null for nullish docName', async () => {
    const { EditorBreadcrumb } = await import('./EditorBreadcrumb');
    expect(EditorBreadcrumb({ docName: null })).toBeNull();
  });

  test('returns null for project-root docName (no folder prefix)', async () => {
    const { EditorBreadcrumb } = await import('./EditorBreadcrumb');
    expect(EditorBreadcrumb({ docName: 'notes' })).toBeNull();
    expect(EditorBreadcrumb({ docName: '' })).toBeNull();
  });
});

describe('EditorBreadcrumb source-level guards', () => {
  test('derives folder segments via the shared tabParts parser', () => {
    expect(SRC).toMatch(/from\s+['"]@\/editor\/editor-tabs['"]/);
    expect(SRC).toContain('tabParts(docName,');
  });

  test('renders nothing at the project root', () => {
    expect(SRC).toContain('if (!docName) return null');
    expect(SRC).toContain('if (!prefix) return null');
  });

  test('uses the shadcn Breadcrumb primitive (Breadcrumb + List + Item + Page + Separator)', () => {
    expect(SRC).toMatch(
      /import\s+\{[\s\S]*?Breadcrumb[\s\S]*?\}\s+from\s+['"]@\/components\/ui\/breadcrumb['"]/,
    );
    expect(SRC).toContain('Breadcrumb');
    expect(SRC).toContain('BreadcrumbList');
    expect(SRC).toContain('BreadcrumbItem');
    expect(SRC).toContain('BreadcrumbPage');
    expect(SRC).toContain('BreadcrumbSeparator');
  });

  test('separator is BreadcrumbSeparator — NOT a raw ChevronRight import', () => {
    expect(SRC).not.toMatch(
      /import\s+\{[^}]*\bChevronRight\b[^}]*\}\s+from\s+['"]lucide-react['"]/,
    );
    expect(SRC).not.toMatch(/<ChevronRight\b/);
  });

  test('uses BreadcrumbPage primitive — pure display, never the link variant', () => {
    expect(SRC).toContain('BreadcrumbPage');
    const importLine = SRC.match(
      /import\s*\{[^}]*\}\s*from\s*['"]@\/components\/ui\/breadcrumb['"]/,
    );
    expect(importLine?.[0]).not.toMatch(/\bBreadcrumbLink\b/);
    expect(SRC).not.toMatch(/<BreadcrumbLink\b/);
  });

  test('uses the shared text-xs + text-muted-foreground/70 token pair', () => {
    expect(SRC).toContain('text-muted-foreground/70');
    expect(SRC).toContain('text-xs');
  });

  test('per-segment truncation surfaces a title tooltip for full text', () => {
    expect(SRC).toMatch(/title=\{segment\}/);
    expect(SRC).toContain('truncate');
  });

  test('pure display — no onClick / onMouseEnter / role="button" navigation handlers', () => {
    expect(SRC).not.toContain('onClick');
    expect(SRC).not.toContain('onMouseEnter');
    expect(SRC).not.toMatch(/role=['"]button['"]/);
  });
});
