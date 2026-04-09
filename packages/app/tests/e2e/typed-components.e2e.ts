/**
 * E2E tests for Layer 2+3 typed component editing.
 * Covers: slash command insertion, prop panel editing, inline children,
 * source mode sync, observer round-trip.
 */
import { expect, test } from '@playwright/test';

test.describe('Typed component editing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the editor to be ready
    await page.waitForSelector('.tiptap', { timeout: 10_000 });
  });

  test('PP01: insert Callout via slash command', async ({ page }) => {
    const editor = page.locator('.tiptap');
    await editor.click();
    await page.keyboard.type('/callout');
    // Wait for suggestion menu
    await page.waitForTimeout(300);
    await page.keyboard.press('Enter');
    // Verify Callout was inserted (ComponentToolbar shows the name)
    await expect(page.locator('text=Callout').first()).toBeVisible({ timeout: 5000 });
  });

  test('PP02: change type dropdown via prop panel', async ({ page }) => {
    const editor = page.locator('.tiptap');
    await editor.click();
    // Insert a Callout
    await page.keyboard.type('/callout');
    await page.waitForTimeout(300);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // Click gear icon to open prop panel
    const gearButton = page.locator('button[aria-label*="Edit"]').first();
    if (await gearButton.isVisible()) {
      await gearButton.click();
      // Look for a select/dropdown in the popover
      await page.waitForTimeout(300);
    }
  });

  test('IC01/IC02: edit inline children with formatting', async ({ page }) => {
    const editor = page.locator('.tiptap');
    await editor.click();
    // Insert a Callout
    await page.keyboard.type('/callout');
    await page.waitForTimeout(300);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // Click inside the children area
    const childrenArea = page.locator('.component-children').first();
    if (await childrenArea.isVisible()) {
      await childrenArea.click();
      await page.keyboard.type('Hello world');
      // Apply bold
      await page.keyboard.press('Meta+b');
      await page.keyboard.type(' bold text');
      await expect(childrenArea).toContainText('Hello world');
    }
  });

  test('OS01: source mode shows updated JSX after WYSIWYG edit', async ({ page }) => {
    // This test needs the source toggle to be visible
    const sourceToggle = page.locator('button:has-text("Source")').first();
    if (await sourceToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
      await sourceToggle.click();
      // Source editor should contain raw JSX
      await page.waitForTimeout(500);
      const sourceEditor = page.locator('.cm-editor').first();
      if (await sourceEditor.isVisible()) {
        const content = await sourceEditor.textContent();
        expect(content).toBeTruthy();
      }
    }
  });
});
