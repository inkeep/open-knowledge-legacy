import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import { EditorBreadcrumb } from './EditorBreadcrumb';

describe('EditorBreadcrumb (Tier-3 mount)', () => {
  afterEach(() => {
    cleanup();
  });

  test('renders nothing for a null docName', () => {
    const { container } = render(<EditorBreadcrumb docName={null} />);
    expect(container.firstChild).toBeNull();
  });

  test('renders nothing for a project-root docName (no folder prefix)', () => {
    const { container } = render(<EditorBreadcrumb docName="notes" />);
    expect(container.firstChild).toBeNull();
  });

  test('renders folder segments with chevron separators for a nested docName', () => {
    render(<EditorBreadcrumb docName="meetings/2026/q1/notes" />);

    const nav = screen.getByRole('navigation', { name: /breadcrumb/i });
    expect(nav).toBeTruthy();

    const itemEls = nav.querySelectorAll('li[data-slot="breadcrumb-item"]');
    expect(itemEls.length).toBe(3);
    expect(itemEls[0]?.textContent).toBe('meetings');
    expect(itemEls[1]?.textContent).toBe('2026');
    expect(itemEls[2]?.textContent).toBe('q1');

    const separatorEls = nav.querySelectorAll('li[data-slot="breadcrumb-separator"]');
    expect(separatorEls.length).toBe(2);

    const list = nav.querySelector('ol[data-slot="breadcrumb-list"]');
    expect(list?.firstElementChild?.getAttribute('data-slot')).toBe('breadcrumb-item');
  });

  test('renders the basename folder for a one-deep docName', () => {
    render(<EditorBreadcrumb docName="meetings/notes" />);
    const nav = screen.getByRole('navigation', { name: /breadcrumb/i });
    const itemEls = nav.querySelectorAll('li[data-slot="breadcrumb-item"]');
    expect(itemEls.length).toBe(1);
    expect(itemEls[0]?.textContent).toBe('meetings');
    const separatorEls = nav.querySelectorAll('li[data-slot="breadcrumb-separator"]');
    expect(separatorEls.length).toBe(0);
  });

  test('exposes the full segment text via title for truncation reveal', () => {
    render(<EditorBreadcrumb docName="a-very-long-folder-name/another-folder/some-doc" />);
    const nav = screen.getByRole('navigation', { name: /breadcrumb/i });
    const itemEls = Array.from(
      nav.querySelectorAll<HTMLLIElement>('li[data-slot="breadcrumb-item"]'),
    );
    const titleHosts = itemEls.map((li) => li.querySelector('[data-slot="breadcrumb-page"]'));
    expect(titleHosts[0]?.getAttribute('title')).toBe('a-very-long-folder-name');
    expect(titleHosts[1]?.getAttribute('title')).toBe('another-folder');
  });

  test('reactivity: changing docName re-renders with new segments', () => {
    const { rerender } = render(<EditorBreadcrumb docName="alpha/notes" />);
    let nav = screen.getByRole('navigation', { name: /breadcrumb/i });
    let itemEls = nav.querySelectorAll('li[data-slot="breadcrumb-item"]');
    expect(Array.from(itemEls).map((li) => li.textContent)).toEqual(['alpha']);

    rerender(<EditorBreadcrumb docName="beta/gamma/notes" />);
    nav = screen.getByRole('navigation', { name: /breadcrumb/i });
    itemEls = nav.querySelectorAll('li[data-slot="breadcrumb-item"]');
    expect(Array.from(itemEls).map((li) => li.textContent)).toEqual(['beta', 'gamma']);

    rerender(<EditorBreadcrumb docName="notes" />);
    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).toBeNull();
  });

  test('emits no click/hover handlers — breadcrumb is pure display', () => {
    render(<EditorBreadcrumb docName="meetings/notes" />);
    const nav = screen.getByRole('navigation', { name: /breadcrumb/i });
    expect(nav.tagName.toLowerCase()).toBe('nav');
    for (const li of nav.querySelectorAll('li[data-slot="breadcrumb-item"]')) {
      expect(li.tagName.toLowerCase()).toBe('li');
    }
    for (const span of nav.querySelectorAll('[data-slot="breadcrumb-page"]')) {
      expect(span.tagName.toLowerCase()).toBe('span');
      expect(span.getAttribute('href')).toBeNull();
      expect(span.getAttribute('role')).toBeNull();
    }
  });

  test('folder segments do not carry aria-current="page" — only the current page should', () => {
    render(<EditorBreadcrumb docName="meetings/2026/q1/notes" />);
    const nav = screen.getByRole('navigation', { name: /breadcrumb/i });
    const pages = nav.querySelectorAll('[data-slot="breadcrumb-page"]');
    expect(pages.length).toBe(3);
    for (const span of pages) {
      expect(span.getAttribute('aria-current')).toBeNull();
    }
  });
});
