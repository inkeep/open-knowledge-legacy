import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

mock.module('@/editor/components/Pdf', () => ({
  Pdf: (props: { src?: string; title?: string; fillContainer?: boolean }) => (
    <div data-testid="pdf-stub" data-src={props.src} data-fill={String(!!props.fillContainer)}>
      pdf:{props.title ?? ''}
    </div>
  ),
}));

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

  test('renders an <audio> player for mediaKind="audio"', () => {
    const { container } = render(<AssetPreview assetPath="assets/song.mp3" mediaKind="audio" />);
    expect(container.querySelector('audio')).not.toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('a[href]')).toBeNull();
  });

  test('dispatches to <Pdf fillContainer> for mediaKind="pdf"', () => {
    const { container } = render(<AssetPreview assetPath="assets/paper.pdf" mediaKind="pdf" />);
    const pdf = container.querySelector('[data-testid="pdf-stub"]') as HTMLElement | null;
    expect(pdf).not.toBeNull();
    expect(pdf?.dataset.src).toContain('paper.pdf');
    expect(pdf?.dataset.fill).toBe('true');
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('audio')).toBeNull();
  });

  test('renders the "Open file" fallback for mediaKind=null', () => {
    const { container } = render(<AssetPreview assetPath="assets/data.csv" mediaKind={null} />);
    const anchor = container.querySelector('a[href]');
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute('href')).toContain('data.csv');
    expect(anchor?.textContent).toMatch(/open file/i);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('audio')).toBeNull();
    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('[data-testid="pdf-stub"]')).toBeNull();
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
