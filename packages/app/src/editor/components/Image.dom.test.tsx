import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

mock.module('react-medium-image-zoom', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));

const { Image } = await import('./Image');

describe('Image — loading-state placeholder (PRD-6638)', () => {
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
    render(<Image src="/assets/cat.png" alt="" width={400} height={300} />);

    const skeleton = screen.queryByTestId('image-loading-skeleton');
    expect(skeleton).not.toBeNull();
  });

  test('reserves layout space matching intrinsic width/height before load', () => {
    render(<Image src="/assets/cat.png" alt="" width={400} height={300} />);

    const slot = screen.queryByTestId('image-slot') as HTMLElement | null;
    expect(slot).not.toBeNull();
    expect(slot?.style.width).toBe('400px');
    expect(slot?.style.aspectRatio).toBe('400 / 300');
  });

  test('reserves layout space when width/height are passed as numeric strings (MDX descriptor path)', () => {
    render(<Image src="/assets/cat.png" alt="" width="400" height="300" />);

    const slot = screen.queryByTestId('image-slot') as HTMLElement | null;
    expect(slot).not.toBeNull();
    expect(slot?.style.width).toBe('400px');
    expect(slot?.style.aspectRatio).toBe('400 / 300');
  });

  test('falls back to aspect-[16/9] when width is a non-numeric string (e.g. "100%")', () => {
    render(<Image src="/assets/cat.png" alt="" width="100%" height={300} />);

    const slot = screen.queryByTestId('image-slot') as HTMLElement | null;
    expect(slot).not.toBeNull();
    expect(slot?.style.width).toBeFalsy();
    expect(slot?.className).toContain('aspect-[16/9]');
  });

  test('removes the placeholder after the inner <img>.load event fires', () => {
    const { container } = render(<Image src="/assets/cat.png" alt="" width={400} height={300} />);

    expect(screen.queryByTestId('image-loading-skeleton')).not.toBeNull();

    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    fireEvent.load(img as HTMLImageElement);

    expect(screen.queryByTestId('image-loading-skeleton')).toBeNull();
  });

  test('dismisses placeholder when the image is already complete at mount (covers cached-success and cached-failure)', () => {
    const ImgProto = (window as Window).HTMLImageElement.prototype;
    const prevComplete = Object.getOwnPropertyDescriptor(ImgProto, 'complete');
    Object.defineProperty(ImgProto, 'complete', { configurable: true, get: () => true });

    try {
      render(<Image src="/assets/cat.png" alt="" width={400} height={300} />);

      expect(screen.queryByTestId('image-loading-skeleton')).toBeNull();
    } finally {
      if (prevComplete) {
        Object.defineProperty(ImgProto, 'complete', prevComplete);
      } else {
        Reflect.deleteProperty(ImgProto, 'complete');
      }
    }
  });

  test('removes the placeholder after the inner <img>.error event fires (broken image)', () => {
    const { container } = render(
      <Image src="/missing-asset.png" alt="" width={400} height={300} />,
    );

    expect(screen.queryByTestId('image-loading-skeleton')).not.toBeNull();

    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    fireEvent.error(img as HTMLImageElement);

    expect(screen.queryByTestId('image-loading-skeleton')).toBeNull();
  });

  test('restores the placeholder when src changes (e.g. AssetPreview switching assets)', () => {
    const { container, rerender } = render(
      <Image src="/assets/a.png" alt="" width={400} height={300} />,
    );

    const firstImg = container.querySelector('img');
    fireEvent.load(firstImg as HTMLImageElement);
    expect(screen.queryByTestId('image-loading-skeleton')).toBeNull();

    rerender(<Image src="/assets/b.png" alt="" width={400} height={300} />);

    expect(screen.queryByTestId('image-loading-skeleton')).not.toBeNull();
  });
});
