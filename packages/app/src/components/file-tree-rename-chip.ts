import { getFileExtension } from '@/components/file-tree-rename-validation';

export const OK_RENAME_CHIP_ATTR = 'data-ok-rename-extension-chip';
export const OK_RENAMING_ATTR = 'data-ok-renaming';
const RENAME_STRIPPED_MARKER = 'data-ok-rename-stripped';

let activeRenameExt: string | null = null;
let activeRenameTimer: ReturnType<typeof setTimeout> | null = null;
const ACTIVE_RENAME_TIMEOUT_MS = 5_000;

export const FILE_TREE_RENAME_CHIP_CSS = `
  [data-item-section="content"]:has([data-item-rename-input]) {
    position: relative;
  }
  [data-item-section="content"]:has([${OK_RENAME_CHIP_ATTR}]) [data-item-rename-input] {
    padding-inline-end: 36px;
  }
  [${OK_RENAME_CHIP_ATTR}] {
    position: absolute;
    top: 50%;
    right: 6px;
    transform: translateY(-50%);
    font-size: 0.6875rem;
    line-height: 1;
    letter-spacing: 0.02em;
    color: color-mix(in oklab, var(--muted-foreground) 60%, transparent);
    background: transparent;
    padding: 2px 4px;
    border-radius: 3px;
    pointer-events: none;
    user-select: none;
  }
  /* Pierre's icon decoration keys off the row's data-item-path. The chip's
     value-strip plus Pierre's optimistic commit make the path temporarily
     extensionless, so Pierre swaps the row's [data-icon-token] from
     'markdown' to 'default' until the disk-truth refresh restores .md.
     Cover the wrong icon with a CSS-rendered markdown glyph for the duration.
     applyRenameChip sets the marker on the row when the rename input mounts;
     the sweep in applyRenameChip clears it when the path next includes the
     saved extension (settle / cancel / row recycle to a settled file). */
  [${OK_RENAMING_ATTR}] [data-item-section="icon"] {
    position: relative;
  }
  [${OK_RENAMING_ATTR}] [data-item-section="icon"] [data-icon-token]:not([data-icon-token='markdown']) {
    visibility: hidden;
  }
  [${OK_RENAMING_ATTR}='.md'] [data-item-section="icon"]::before,
  [${OK_RENAMING_ATTR}='.mdx'] [data-item-section="icon"]::before {
    content: '';
    display: block;
    position: absolute;
    inset: 0;
    margin: auto;
    width: 16px;
    height: 16px;
    background-color: currentColor;
    mask: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><path d='M1 12V4h2l2 2.5L7 4h2v8H7V7.5l-2 2-2-2V12zm9-3 3 3.5L16 9h-2V4h-2v5z'/></svg>") center / contain no-repeat;
    pointer-events: none;
  }
`;

export function applyRenameChip(root: ParentNode): void {
  syncRenameOverlay(root);

  const input = root.querySelector<HTMLInputElement>('[data-item-rename-input]');
  if (!input) return;
  const content = input.closest<HTMLElement>('[data-item-section="content"]');
  const row = input.closest<HTMLElement>('[data-type="item"]');
  if (!content || !row) return;

  const treePath = row.dataset.itemPath ?? '';
  if (treePath.endsWith('/')) return;
  const extension = getFileExtension(treePath);
  if (!extension) return;

  upsertChip(content, extension);
  if (row.getAttribute(OK_RENAMING_ATTR) !== extension) {
    row.setAttribute(OK_RENAMING_ATTR, extension);
  }
  setActiveRenameExt(extension);

  if (input.hasAttribute(RENAME_STRIPPED_MARKER)) return;
  stripExtensionFromValue(input, extension);
  input.setAttribute(RENAME_STRIPPED_MARKER, '');
}

function setActiveRenameExt(ext: string): void {
  activeRenameExt = ext;
  if (activeRenameTimer !== null) clearTimeout(activeRenameTimer);
  activeRenameTimer = setTimeout(clearActiveRenameExt, ACTIVE_RENAME_TIMEOUT_MS);
}

function clearActiveRenameExt(): void {
  activeRenameExt = null;
  if (activeRenameTimer !== null) {
    clearTimeout(activeRenameTimer);
    activeRenameTimer = null;
  }
}

/** Test-only — reset the module's in-flight rename state so a fresh test
 *  starts from a known baseline. Not used at runtime. */
export function __resetRenameChipForTesting(): void {
  clearActiveRenameExt();
}

function syncRenameOverlay(root: ParentNode): void {
  const markedRows = root.querySelectorAll<HTMLElement>(`[${OK_RENAMING_ATTR}]`);
  for (const row of markedRows) {
    if (row.querySelector('[data-item-rename-input]')) continue;
    const savedExt = row.getAttribute(OK_RENAMING_ATTR);
    if (!savedExt) {
      row.removeAttribute(OK_RENAMING_ATTR);
      continue;
    }
    const currentPath = row.dataset.itemPath ?? '';
    if (currentPath.toLowerCase().endsWith(savedExt.toLowerCase())) {
      row.removeAttribute(OK_RENAMING_ATTR);
      continue;
    }
    const currentExt = getFileExtension(currentPath);
    if (currentExt && currentExt.toLowerCase() !== savedExt.toLowerCase()) {
      row.removeAttribute(OK_RENAMING_ATTR);
    }
  }

  if (activeRenameExt === null) return;

  const rows = root.querySelectorAll<HTMLElement>('[data-type="item"][data-item-path]');
  let hasExtensionlessRow = false;
  for (const row of rows) {
    const path = row.dataset.itemPath ?? '';
    if (!path || path.endsWith('/')) continue;
    const ext = getFileExtension(path);
    if (!ext) {
      hasExtensionlessRow = true;
      if (
        row.getAttribute('data-item-selected') === 'true' &&
        row.getAttribute(OK_RENAMING_ATTR) !== activeRenameExt
      ) {
        row.setAttribute(OK_RENAMING_ATTR, activeRenameExt);
      }
    }
  }

  const hasOpenInput = !!root.querySelector('[data-item-rename-input]');
  if (!hasExtensionlessRow && !hasOpenInput) {
    clearActiveRenameExt();
  }
}

function upsertChip(content: HTMLElement, label: string): void {
  let chip = content.querySelector<HTMLSpanElement>(`[${OK_RENAME_CHIP_ATTR}]`);
  if (!chip) {
    chip = content.ownerDocument.createElement('span');
    chip.setAttribute(OK_RENAME_CHIP_ATTR, '');
    chip.setAttribute('aria-hidden', 'true');
    content.appendChild(chip);
  }
  if (chip.textContent !== label) chip.textContent = label;
}

function stripExtensionFromValue(input: HTMLInputElement, extension: string): void {
  const currentValue = input.value;
  if (!currentValue.toLowerCase().endsWith(extension.toLowerCase())) return;

  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set;
  if (!nativeSetter) return;

  const stripped = currentValue.slice(0, -extension.length);
  nativeSetter.call(input, stripped);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.setSelectionRange(0, stripped.length);
}
