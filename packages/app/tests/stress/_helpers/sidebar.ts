/**
 * Sidebar interaction helpers.
 *
 * Locators must be scoped to `[data-slot="sidebar-container"]` to avoid
 * Playwright strict-mode violations against the EditorHeader, which displays
 * the active document name as text and would otherwise also match.
 *
 * Hash-URL navigation (PR #185) is the preferred cold-nav path — reach for
 * `page.goto(`${BASE}/#/${docName}`)` first. `sidebarFileButton` exists for
 * tests that exercise the click-the-sidebar user journey explicitly.
 */

import type { Locator, Page } from '@playwright/test';

/**
 * Sidebar-scoped locator for the file-row button matching `name` exactly.
 * Use for tests that need to click through the sidebar user journey.
 */
export function sidebarFileButton(page: Page, name: string): Locator {
  const sidebar = page.locator('[data-slot="sidebar-container"]');
  return sidebar.getByText(name, { exact: true });
}
