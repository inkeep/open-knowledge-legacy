import { describe, expect, test } from 'bun:test';
import SRC from './ConsentDialogBody?raw';

describe('ConsentDialogBody module', () => {
  test('exports default component', async () => {
    const mod = await import('./ConsentDialogBody');
    expect(typeof mod.default).toBe('function');
  });
});

describe('ConsentDialogBody — load-bearing structural guards', () => {
  test('Cancel button is type="button" so it does not submit the form', () => {
    expect(SRC).toMatch(
      /<Button[\s\S]{0,200}?type="button"[\s\S]{0,200}?data-testid="consent-cancel"/,
    );
  });

  test('Start button is type="submit" so Enter-on-input routes through onSubmit', () => {
    expect(SRC).toMatch(/<Button type="submit"[\s\S]{0,200}?data-testid="consent-start"/);
  });

  test('onSubmit calls preventDefault to suppress renderer page-reload', () => {
    expect(SRC).toMatch(/function onSubmit[\s\S]{0,200}?e\.preventDefault\(\)/);
  });

  test('onSubmit short-circuits when startDisabled (matches Start click gate)', () => {
    expect(SRC).toMatch(/function onSubmit[\s\S]{0,200}?if \(startDisabled\) return/);
  });

  test('Browse button calls bridge.dialog.openFolder with payload.projectDir as defaultPath', () => {
    expect(SRC).toMatch(
      /bridge\.dialog\.openFolder\(\{\s*defaultPath:\s*payload\.projectDir\s*\}\)/,
    );
  });
});
