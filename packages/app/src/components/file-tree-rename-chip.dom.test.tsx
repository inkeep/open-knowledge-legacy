import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { cleanup } from '@testing-library/react';
import {
  __resetRenameChipForTesting,
  applyRenameChip,
  OK_RENAME_CHIP_ATTR,
  OK_RENAMING_ATTR,
} from './file-tree-rename-chip';

interface PierreRenameRowInit {
  path: string;
  initialValue: string;
}

function buildPierreRenameRow(init: PierreRenameRowInit): {
  row: HTMLElement;
  input: HTMLInputElement;
  content: HTMLElement;
} {
  const row = document.createElement('div');
  row.setAttribute('data-type', 'item');
  row.setAttribute('data-item-path', init.path);

  const icon = document.createElement('div');
  icon.setAttribute('data-item-section', 'icon');
  row.appendChild(icon);

  const content = document.createElement('div');
  content.setAttribute('data-item-section', 'content');
  row.appendChild(content);

  const input = document.createElement('input');
  input.setAttribute('data-item-rename-input', 'true');
  input.setAttribute('aria-label', `Rename ${init.path}`);
  input.value = init.initialValue;
  content.appendChild(input);

  const decoration = document.createElement('div');
  decoration.setAttribute('data-item-section', 'decoration');
  decoration.style.display = 'none';
  row.appendChild(decoration);

  const action = document.createElement('div');
  action.setAttribute('data-item-section', 'action');
  action.style.display = 'none';
  row.appendChild(action);

  document.body.appendChild(row);
  return { row, input, content };
}

function buildPierreShadowRoot(): ShadowRoot {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  return shadow;
}

describe('applyRenameChip — strip extension + inject chip + select basename', () => {
  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  test('strips `.md` from input value and injects a `.md` chip sibling', () => {
    const { input, content } = buildPierreRenameRow({
      path: 'AGENTS.md',
      initialValue: 'AGENTS.md',
    });
    applyRenameChip(document);

    expect(input.value).toBe('AGENTS');
    const chip = content.querySelector(`[${OK_RENAME_CHIP_ATTR}]`);
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toBe('.md');
    expect(chip?.getAttribute('aria-hidden')).toBe('true');
  });

  test('strips `.mdx` from input value and injects a `.mdx` chip sibling', () => {
    const { input, content } = buildPierreRenameRow({
      path: 'notes/ideas.mdx',
      initialValue: 'ideas.mdx',
    });
    applyRenameChip(document);

    expect(input.value).toBe('ideas');
    expect(content.querySelector(`[${OK_RENAME_CHIP_ATTR}]`)?.textContent).toBe('.mdx');
  });

  test('strips non-markdown extensions (jpg, pdf, etc.) with the same lowercase chip', () => {
    const { input, content } = buildPierreRenameRow({
      path: 'images/cat.jpg',
      initialValue: 'cat.jpg',
    });
    applyRenameChip(document);

    expect(input.value).toBe('cat');
    expect(content.querySelector(`[${OK_RENAME_CHIP_ATTR}]`)?.textContent).toBe('.jpg');
  });

  test('selects the basename after stripping (selectionStart=0, selectionEnd=basename length)', () => {
    const { input } = buildPierreRenameRow({
      path: 'README.md',
      initialValue: 'README.md',
    });
    applyRenameChip(document);

    expect(input.value).toBe('README');
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe('README'.length);
  });

  test('folder rows (path ends with `/`) are ignored — no chip, no strip', () => {
    const { input, content } = buildPierreRenameRow({
      path: 'docs/',
      initialValue: 'docs',
    });
    applyRenameChip(document);

    expect(input.value).toBe('docs');
    expect(content.querySelector(`[${OK_RENAME_CHIP_ATTR}]`)).toBeNull();
  });

  test('extension-less files are ignored — no chip, no strip', () => {
    const { input, content } = buildPierreRenameRow({
      path: 'Makefile',
      initialValue: 'Makefile',
    });
    applyRenameChip(document);

    expect(input.value).toBe('Makefile');
    expect(content.querySelector(`[${OK_RENAME_CHIP_ATTR}]`)).toBeNull();
  });

  test('idempotent — repeated calls during the same rename session do not re-strip or re-select', () => {
    const { input, content } = buildPierreRenameRow({
      path: 'AGENTS.md',
      initialValue: 'AGENTS.md',
    });
    applyRenameChip(document);
    expect(input.value).toBe('AGENTS');

    input.value = 'AGENTS-edited';
    input.setSelectionRange(10, 13); // caret somewhere inside the typed text

    applyRenameChip(document);
    expect(input.value).toBe('AGENTS-edited');
    expect(input.selectionStart).toBe(10);
    expect(input.selectionEnd).toBe(13);
    expect(content.querySelectorAll(`[${OK_RENAME_CHIP_ATTR}]`).length).toBe(1);
  });

  test('idempotent across user typing the extension back in (no double-strip)', () => {
    const { input } = buildPierreRenameRow({
      path: 'AGENTS.md',
      initialValue: 'AGENTS.md',
    });
    applyRenameChip(document);
    expect(input.value).toBe('AGENTS');

    input.value = 'AGENTS.md.bak';
    applyRenameChip(document);
    expect(input.value).toBe('AGENTS.md.bak');
  });

  test('survives ShadowRoot context — find works through the open shadow root', () => {
    const shadow = buildPierreShadowRoot();
    const row = document.createElement('div');
    row.setAttribute('data-type', 'item');
    row.setAttribute('data-item-path', 'AGENTS.md');
    const content = document.createElement('div');
    content.setAttribute('data-item-section', 'content');
    row.appendChild(content);
    const input = document.createElement('input');
    input.setAttribute('data-item-rename-input', 'true');
    input.value = 'AGENTS.md';
    content.appendChild(input);
    shadow.appendChild(row);

    applyRenameChip(shadow);

    expect(input.value).toBe('AGENTS');
    expect(content.querySelector(`[${OK_RENAME_CHIP_ATTR}]`)?.textContent).toBe('.md');
  });

  test('no rename input present — no-op', () => {
    const row = document.createElement('div');
    row.setAttribute('data-type', 'item');
    row.setAttribute('data-item-path', 'AGENTS.md');
    const content = document.createElement('div');
    content.setAttribute('data-item-section', 'content');
    row.appendChild(content);
    document.body.appendChild(row);

    expect(() => applyRenameChip(document)).not.toThrow();
    expect(content.querySelector(`[${OK_RENAME_CHIP_ATTR}]`)).toBeNull();
  });
});

describe('applyRenameChip — overlay marker for symptom 2 (icon-flash bridge)', () => {
  beforeEach(() => {
    __resetRenameChipForTesting();
  });
  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
    __resetRenameChipForTesting();
  });

  test('chip-activate stamps the row with data-ok-renaming=<extension>', () => {
    const { row } = buildPierreRenameRow({
      path: 'AGENTS.md',
      initialValue: 'AGENTS.md',
    });
    applyRenameChip(document);

    expect(row.getAttribute(OK_RENAMING_ATTR)).toBe('.md');
  });

  test('after Pierre commits — selected extensionless row gets the marker reapplied', () => {
    const { row, input } = buildPierreRenameRow({
      path: 'AGENTS.md',
      initialValue: 'AGENTS.md',
    });
    applyRenameChip(document);
    expect(row.getAttribute(OK_RENAMING_ATTR)).toBe('.md');

    input.remove();
    row.setAttribute('data-item-path', 'AGENTS-RENAMED');
    row.setAttribute('data-item-selected', 'true');
    row.removeAttribute(OK_RENAMING_ATTR);

    applyRenameChip(document);
    expect(row.getAttribute(OK_RENAMING_ATTR)).toBe('.md');
  });

  test('legitimate extensionless files NEVER pick up the marker mid-rename', () => {
    const makefileRow = document.createElement('div');
    makefileRow.setAttribute('data-type', 'item');
    makefileRow.setAttribute('data-item-path', 'Makefile');
    document.body.appendChild(makefileRow);

    const { input } = buildPierreRenameRow({
      path: 'docs/photo.md',
      initialValue: 'docs/photo.md',
    });
    applyRenameChip(document);

    input.remove();

    applyRenameChip(document);
    expect(makefileRow.getAttribute(OK_RENAMING_ATTR)).toBeNull();

    const renamedRow = document.body.querySelector(
      '[data-item-path="docs/photo.md"]',
    ) as HTMLElement | null;
    expect(renamedRow).not.toBeNull();
    if (!renamedRow) return;
    renamedRow.setAttribute('data-item-path', 'docs/photo-renamed');
    renamedRow.setAttribute('data-item-selected', 'true');
    renamedRow.removeAttribute(OK_RENAMING_ATTR);

    applyRenameChip(document);

    expect(renamedRow.getAttribute(OK_RENAMING_ATTR)).toBe('.md');
    expect(makefileRow.getAttribute(OK_RENAMING_ATTR)).toBeNull();
  });

  test('disk-truth refresh — marker is dropped once the path includes the saved extension', () => {
    const { row, input } = buildPierreRenameRow({
      path: 'AGENTS.md',
      initialValue: 'AGENTS.md',
    });
    applyRenameChip(document);
    expect(row.getAttribute(OK_RENAMING_ATTR)).toBe('.md');

    input.remove();
    row.setAttribute('data-item-path', 'AGENTS-RENAMED');
    row.setAttribute('data-item-selected', 'true');
    row.removeAttribute(OK_RENAMING_ATTR);
    applyRenameChip(document);
    expect(row.getAttribute(OK_RENAMING_ATTR)).toBe('.md');

    row.setAttribute('data-item-path', 'AGENTS-RENAMED.md');
    applyRenameChip(document);
    expect(row.getAttribute(OK_RENAMING_ATTR)).toBeNull();
  });

  test('row recycled to an unrelated file (different extension) — marker is dropped', () => {
    const { row, input } = buildPierreRenameRow({
      path: 'AGENTS.md',
      initialValue: 'AGENTS.md',
    });
    applyRenameChip(document);
    expect(row.getAttribute(OK_RENAMING_ATTR)).toBe('.md');

    input.remove();
    row.setAttribute('data-item-path', 'images/cat.jpg');
    applyRenameChip(document);
    expect(row.getAttribute(OK_RENAMING_ATTR)).toBeNull();
  });

  test('post-settle: module-level activeRenameExt is cleared (Makefile selected later gets no marker)', () => {
    const { row, input } = buildPierreRenameRow({
      path: 'AGENTS.md',
      initialValue: 'AGENTS.md',
    });
    applyRenameChip(document);
    expect(row.getAttribute(OK_RENAMING_ATTR)).toBe('.md');

    input.remove();
    row.setAttribute('data-item-path', 'AGENTS-RENAMED.md'); // disk-truth refresh
    applyRenameChip(document);
    expect(row.getAttribute(OK_RENAMING_ATTR)).toBeNull();

    const makefileRow = document.createElement('div');
    makefileRow.setAttribute('data-type', 'item');
    makefileRow.setAttribute('data-item-path', 'Makefile');
    makefileRow.setAttribute('data-item-selected', 'true');
    document.body.appendChild(makefileRow);

    applyRenameChip(document);
    expect(makefileRow.getAttribute(OK_RENAMING_ATTR)).toBeNull();
  });
});
