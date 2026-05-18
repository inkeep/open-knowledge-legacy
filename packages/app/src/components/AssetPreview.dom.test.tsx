import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { AssetPreview } = await import('./AssetPreview');

describe('AssetPreview — image loading-state placeholder (PRD-6638)', () => {
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let consoleWarnSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  test('renders a loading-state placeholder before the <img>.load event fires', () => {
    render(<AssetPreview assetPath="assets/cat.png" mediaKind="image" />);

    const skeleton = screen.queryByTestId('image-loading-skeleton');
    expect(skeleton).not.toBeNull();
  });

  test('reserves layout space via fallback aspect-[16/9] className when no intrinsic dimensions are supplied', () => {
    render(<AssetPreview assetPath="assets/cat.png" mediaKind="image" />);

    const slot = screen.queryByTestId('image-slot') as HTMLElement | null;
    expect(slot).not.toBeNull();
    expect(slot?.className).toContain('aspect-[16/9]');
  });

  test('removes the placeholder and releases the aspect-ratio constraint after the inner <img>.load event fires', () => {
    const { container } = render(<AssetPreview assetPath="assets/cat.png" mediaKind="image" />);

    expect(screen.queryByTestId('image-loading-skeleton')).not.toBeNull();

    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    fireEvent.load(img as HTMLImageElement);

    expect(screen.queryByTestId('image-loading-skeleton')).toBeNull();

    const slotAfterLoad = screen.queryByTestId('image-slot') as HTMLElement | null;
    expect(slotAfterLoad).not.toBeNull();
    expect(slotAfterLoad?.className).not.toContain('aspect-[16/9]');
  });

  test('restores the placeholder when assetPath changes (sidebar asset switching)', () => {
    const { container, rerender } = render(
      <AssetPreview assetPath="assets/a.png" mediaKind="image" />,
    );

    const firstImg = container.querySelector('img');
    fireEvent.load(firstImg as HTMLImageElement);
    expect(screen.queryByTestId('image-loading-skeleton')).toBeNull();

    rerender(<AssetPreview assetPath="assets/b.png" mediaKind="image" />);

    expect(screen.queryByTestId('image-loading-skeleton')).not.toBeNull();
    const slot = screen.queryByTestId('image-slot') as HTMLElement | null;
    expect(slot?.className).toContain('aspect-[16/9]');
  });
});
