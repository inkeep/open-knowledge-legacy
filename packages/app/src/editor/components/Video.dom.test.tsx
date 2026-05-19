import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';

const { Video } = await import('./Video.tsx');

describe('Video — YouTube dispatch', () => {
  afterEach(() => {
    cleanup();
  });

  test('renders a native <video> for non-YouTube sources', () => {
    const { container } = render(<Video src="/assets/clip.mp4" controls />);
    expect(container.querySelector('video')).not.toBeNull();
    expect(container.querySelector('.yt-lite')).toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
  });

  test.each([
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    'https://www.youtube.com/embed/dQw4w9WgXcQ',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/v/dQw4w9WgXcQ',
  ])('renders a lite-embed wrapper for %s with the parsed ID in the thumbnail', (src) => {
    const { container } = render(<Video src={src} />);
    const wrapper = container.querySelector('.yt-lite') as HTMLElement | null;
    expect(wrapper).not.toBeNull();
    expect(wrapper?.style.backgroundImage ?? '').toContain('dQw4w9WgXcQ');
    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
  });

  test('clicking the play button mounts the iframe with the expected attributes', () => {
    const { container } = render(<Video src="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />);
    const playBtn = container.querySelector('button[type="button"]');
    expect(playBtn).not.toBeNull();
    fireEvent.click(playBtn as HTMLButtonElement);

    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute('src') ?? '').toContain('/embed/dQw4w9WgXcQ');
    expect(iframe?.getAttribute('referrerpolicy')).toBe('strict-origin-when-cross-origin');
    expect(iframe?.getAttribute('allow') ?? '').toContain('autoplay');
    expect(iframe?.hasAttribute('allowfullscreen')).toBe(true);
  });

  test('routes regular youtube.com paste to the standard host', () => {
    const { container } = render(<Video src="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />);
    fireEvent.click(container.querySelector('button[type="button"]') as HTMLButtonElement);
    expect(container.querySelector('iframe')?.getAttribute('src') ?? '').toContain(
      'www.youtube.com/embed/dQw4w9WgXcQ',
    );
  });

  test('preserves the privacy host when input uses youtube-nocookie.com', () => {
    const { container } = render(
      <Video src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" />,
    );
    fireEvent.click(container.querySelector('button[type="button"]') as HTMLButtonElement);
    expect(container.querySelector('iframe')?.getAttribute('src') ?? '').toContain(
      'www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    );
  });

  test('threads ?t=<seconds> into the iframe as ?start=', () => {
    const { container } = render(<Video src="https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42" />);
    fireEvent.click(container.querySelector('button[type="button"]') as HTMLButtonElement);
    const src = container.querySelector('iframe')?.getAttribute('src') ?? '';
    expect(src).toContain('start=42');
  });

  test('falls back to <video> for malformed YouTube-like URLs', () => {
    const { container } = render(<Video src="https://youtu.be/short" />);
    expect(container.querySelector('.yt-lite')).toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('video')).not.toBeNull();
  });

  test('uses a default title on the lite-embed wrapper when none is provided', () => {
    const { container } = render(<Video src="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />);
    const wrapper = container.querySelector('.yt-lite') as HTMLElement | null;
    expect(wrapper?.getAttribute('data-title')).toBe('YouTube video player');
  });

  test('passes through a custom title to the lite-embed wrapper', () => {
    const { container } = render(
      <Video src="https://www.youtube.com/watch?v=dQw4w9WgXcQ" title="Demo recording" />,
    );
    const wrapper = container.querySelector('.yt-lite') as HTMLElement | null;
    expect(wrapper?.getAttribute('data-title')).toBe('Demo recording');
  });

  test('controls={false} routes to controls=0 on the post-activation iframe', () => {
    const { container } = render(
      <Video src="https://www.youtube.com/watch?v=dQw4w9WgXcQ" controls={false} />,
    );
    fireEvent.click(container.querySelector('button[type="button"]') as HTMLButtonElement);
    expect(container.querySelector('iframe')?.getAttribute('src') ?? '').toContain('controls=0');
  });

  test('loop maps to loop=1&playlist=<id> (YouTube single-video loop convention)', () => {
    const { container } = render(<Video src="https://www.youtube.com/watch?v=dQw4w9WgXcQ" loop />);
    fireEvent.click(container.querySelector('button[type="button"]') as HTMLButtonElement);
    const src = container.querySelector('iframe')?.getAttribute('src') ?? '';
    expect(src).toContain('loop=1');
    expect(src).toContain('playlist=dQw4w9WgXcQ');
  });

  test('playsinline maps to playsinline=1', () => {
    const { container } = render(
      <Video src="https://www.youtube.com/watch?v=dQw4w9WgXcQ" playsinline />,
    );
    fireEvent.click(container.querySelector('button[type="button"]') as HTMLButtonElement);
    expect(container.querySelector('iframe')?.getAttribute('src') ?? '').toContain('playsinline=1');
  });

  test('muted adds mute=1 to the iframe URL', () => {
    const { container } = render(<Video src="https://www.youtube.com/watch?v=dQw4w9WgXcQ" muted />);
    fireEvent.click(container.querySelector('button[type="button"]') as HTMLButtonElement);
    expect(container.querySelector('iframe')?.getAttribute('src') ?? '').toContain('mute=1');
  });

  test('autoplay + muted mounts the iframe eagerly (skips the click facade)', () => {
    const { container } = render(
      <Video src="https://www.youtube.com/watch?v=dQw4w9WgXcQ" autoplay muted />,
    );
    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    const src = iframe?.getAttribute('src') ?? '';
    expect(src).toContain('autoplay=1');
    expect(src).toContain('mute=1');
  });

  test('autoplay without muted falls back to the click facade', () => {
    const { container } = render(
      <Video src="https://www.youtube.com/watch?v=dQw4w9WgXcQ" autoplay />,
    );
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('.yt-lite')).not.toBeNull();
  });

  test('width + height also forward aspectWidth / aspectHeight to the lib', () => {
    const { container } = render(
      <Video src="https://www.youtube.com/watch?v=dQw4w9WgXcQ" width={400} height={300} />,
    );
    const article = container.querySelector('.yt-lite') as HTMLElement | null;
    expect(article?.style.getPropertyValue('--aspect-ratio')).toBe('75%');
  });

  test('width + height set inline aspect-ratio on the lite-embed', () => {
    const { container } = render(
      <Video src="https://www.youtube.com/watch?v=dQw4w9WgXcQ" width={400} height={300} />,
    );
    const wrapper = container.querySelector('.ok-video-youtube') as HTMLElement | null;
    expect(wrapper?.style.width).toBe('400px');
    const article = container.querySelector('.yt-lite') as HTMLElement | null;
    expect(article?.style.aspectRatio).toBe('400 / 300');
  });

  test('width alone keeps the lib default 16/9 aspect ratio', () => {
    const { container } = render(
      <Video src="https://www.youtube.com/watch?v=dQw4w9WgXcQ" width={400} />,
    );
    const wrapper = container.querySelector('.ok-video-youtube') as HTMLElement | null;
    expect(wrapper?.style.width).toBe('400px');
    const article = container.querySelector('.yt-lite') as HTMLElement | null;
    expect(article?.style.aspectRatio).toBe('');
  });

  test('poster overrides the YouTube thumbnail in the wrapper background', () => {
    const customPoster = '/assets/custom-thumb.jpg';
    const { container } = render(
      <Video src="https://www.youtube.com/watch?v=dQw4w9WgXcQ" poster={customPoster} />,
    );
    const wrapper = container.querySelector('.yt-lite') as HTMLElement | null;
    expect(wrapper?.style.backgroundImage ?? '').toContain('custom-thumb.jpg');
    expect(wrapper?.style.backgroundImage ?? '').not.toContain('i.ytimg.com');
  });
});
