import { afterEach, describe, expect, test } from 'bun:test';
import type { FrontmatterType } from '@inkeep/open-knowledge-core';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { type AddDraft, AddPropertyRow } from './FrontmatterRow';
import { DEFAULT_VALUE_FOR_TYPE } from './PropertyWidgets';

const TYPE_PICKER_LABEL: Record<FrontmatterType, string> = {
  text: 'Text',
  number: 'Number',
  boolean: 'Checkbox',
  date: 'Date',
  list: 'List',
};

const ALL_TYPE_PICKS = Object.entries(TYPE_PICKER_LABEL) as Array<[FrontmatterType, string]>;

function PropertyPanelHarness({
  initialType = 'text' as FrontmatterType,
}: {
  initialType?: FrontmatterType;
}) {
  const [draft, setDraft] = useState<AddDraft>(() => ({
    name: '',
    type: initialType,
    value: initialType === 'boolean' ? false : '',
    error: null,
  }));
  return (
    <AddPropertyRow
      draft={draft}
      onChangeName={(name) => setDraft((p) => ({ ...p, name, error: null }))}
      onChangeType={(type) => {
        const defaultValue =
          type === 'date' ? new Date().toISOString().slice(0, 10) : DEFAULT_VALUE_FOR_TYPE[type];
        setDraft((p) => ({ ...p, type, value: defaultValue, error: null }));
      }}
      onChangeValue={(value) => setDraft((p) => ({ ...p, value }))}
      onCommit={() => {}}
      onCancel={() => {}}
    />
  );
}

function FolderDefaultsHarness({
  initialType = 'text' as FrontmatterType,
}: {
  initialType?: FrontmatterType;
}) {
  const [draft, setDraft] = useState<AddDraft>(() => ({
    name: '',
    type: initialType,
    value: initialType === 'boolean' ? false : '',
    error: null,
  }));
  return (
    <AddPropertyRow
      draft={draft}
      onChangeName={(name) => setDraft((p) => ({ ...p, name, error: null }))}
      onChangeType={(type) => {
        const defaultValue =
          type === 'date' ? new Date().toISOString().slice(0, 10) : DEFAULT_VALUE_FOR_TYPE[type];
        setDraft((p) => ({ ...p, type, value: defaultValue, error: null }));
      }}
      onChangeValue={(value) => setDraft((p) => ({ ...p, value }))}
      onCommit={() => {}}
      onCancel={() => {}}
    />
  );
}

describe('AddPropertyRow — typing target stays focused after type change (PropertyPanel consumer)', () => {
  afterEach(() => {
    cleanup();
  });

  test('autoFocus lands on the name input on first mount (sanity)', () => {
    render(<PropertyPanelHarness />);
    expect(document.activeElement?.getAttribute('data-testid')).toBe('add-property-name-input');
  });

  test.each(
    ALL_TYPE_PICKS,
  )('after picking %s, the next keystrokes reach the name input', async (_type, label) => {
    const user = userEvent.setup();
    render(<PropertyPanelHarness />);
    await user.click(screen.getByTestId('type-icon-button'));
    await user.click(await screen.findByText(label));

    await user.keyboard('prop_name');

    const nameInput = screen.getByTestId('add-property-name-input') as HTMLInputElement;
    expect(nameInput.value).toBe('prop_name');
  });

  test('focus stays on name input — and partial typing is preserved — when type is changed after partial name entry', async () => {
    const user = userEvent.setup();
    render(<PropertyPanelHarness />);
    await user.keyboard('my_prop');
    await user.click(screen.getByTestId('type-icon-button'));
    await user.click(await screen.findByText('Number'));

    const nameInput = screen.getByTestId('add-property-name-input') as HTMLInputElement;
    expect(document.activeElement?.getAttribute('data-testid')).toBe('add-property-name-input');
    expect(nameInput.value).toBe('my_prop');
  });
});

describe('AddPropertyRow — typing target stays focused after type change (FolderDefaultsCard consumer)', () => {
  afterEach(() => {
    cleanup();
  });

  test.each(
    ALL_TYPE_PICKS,
  )('after picking %s, the next keystrokes reach the name input', async (_type, label) => {
    const user = userEvent.setup();
    render(<FolderDefaultsHarness />);
    await user.click(screen.getByTestId('type-icon-button'));
    await user.click(await screen.findByText(label));

    await user.keyboard('prop_name');

    const nameInput = screen.getByTestId('add-property-name-input') as HTMLInputElement;
    expect(nameInput.value).toBe('prop_name');
  });
});
