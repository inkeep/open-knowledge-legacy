import type { Locator, Page } from '@playwright/test';

export function sidebarFileButton(page: Page, name: string): Locator {
  const sidebar = page.locator('[data-slot="sidebar-container"]');
  return sidebar.getByText(name, { exact: true });
}
