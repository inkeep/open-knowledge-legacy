import { ImageResponse } from 'next/og';
import { buildSplashViewModel, type SplashView } from '@/lib/share-splash';

export const dynamic = 'force-static';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Open in Open Knowledge';

interface OgImageProps {
  params: Promise<{ encoded: string }>;
}

const BG = '#fbf9f4';
const TEXT = '#1a1a1a';
const MUTED = '#71717a';
const ACCENT = '#3685ff';

export default async function OgImage({ params }: OgImageProps) {
  const { encoded } = await params;
  const view = buildSplashViewModel(encoded);

  return renderShareOgImage(view, await loadDmSans());
}

interface FontPair {
  light: ArrayBuffer;
  medium: ArrayBuffer;
}

export function renderShareOgImage(view: SplashView, fonts: FontPair | null): ImageResponse {
  const fontsArg = fonts
    ? [
        { name: 'DM Sans', data: fonts.light, weight: 300 as const, style: 'normal' as const },
        { name: 'DM Sans', data: fonts.medium, weight: 500 as const, style: 'normal' as const },
      ]
    : undefined;

  const body = view.kind === 'ok' ? <OkCard view={view} /> : <FallbackCard view={view} />;

  return new ImageResponse(body, {
    ...size,
    fonts: fontsArg,
    headers: {
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}

interface OkCardProps {
  view: Extract<SplashView, { kind: 'ok' }>;
}

function OkCard({ view }: OkCardProps) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: BG,
        padding: '64px 72px',
        fontFamily: 'DM Sans',
        color: TEXT,
      }}
    >
      <Wordmark />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 28,
          maxWidth: 1056,
        }}
      >
        <FilenameWithScribble filename={view.filename} />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            fontSize: 28,
            fontWeight: 500,
            color: MUTED,
          }}
        >
          <span>{view.repoPath}</span>
          {view.isDefaultBranch ? null : (
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                marginLeft: 18,
                color: TEXT,
              }}
            >
              <span style={{ color: MUTED, opacity: 0.5, marginRight: 18 }}>•</span>
              on&nbsp;<span style={{ fontWeight: 500 }}>{view.branch}</span>
            </span>
          )}
        </div>
      </div>

      <CtaRow />
    </div>
  );
}

interface FallbackCardProps {
  view: Extract<SplashView, { kind: 'unsupported-version' | 'invalid' }>;
}

function FallbackCard({ view }: FallbackCardProps) {
  const headline =
    view.kind === 'unsupported-version'
      ? 'Update Open Knowledge to open this share.'
      : 'Open in Open Knowledge — Share a doc.';

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: BG,
        padding: '64px 72px',
        fontFamily: 'DM Sans',
        color: TEXT,
      }}
    >
      <Wordmark />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          maxWidth: 1056,
        }}
      >
        <h1
          style={{
            fontSize: 64,
            fontWeight: 300,
            lineHeight: 1.05,
            letterSpacing: '-0.02em',
            margin: 0,
          }}
        >
          {headline}
        </h1>
      </div>

      <CtaRow />
    </div>
  );
}

function Wordmark() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          backgroundColor: ACCENT,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 22,
          fontWeight: 500,
          color: '#ffffff',
          marginRight: 14,
        }}
      >
        OK
      </div>
      <span
        style={{
          fontSize: 22,
          fontWeight: 500,
          letterSpacing: '-0.01em',
          color: TEXT,
        }}
      >
        Open Knowledge
      </span>
    </div>
  );
}

function CtaRow() {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '14px 22px',
          backgroundColor: ACCENT,
          color: '#ffffff',
          borderRadius: 12,
          fontSize: 22,
          fontWeight: 500,
        }}
      >
        <span style={{ marginRight: 12 }}>Open in Open Knowledge</span>
        <span style={{ fontSize: 24, lineHeight: 1 }}>→</span>
      </div>
    </div>
  );
}

interface FilenameProps {
  filename: string;
}

function FilenameWithScribble({ filename }: FilenameProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <h1
        style={{
          fontSize: 88,
          fontWeight: 300,
          lineHeight: 1.05,
          letterSpacing: '-0.02em',
          margin: 0,
          color: TEXT,
          overflowWrap: 'break-word',
        }}
      >
        {filename}
      </h1>
      {/* biome-ignore lint/a11y/noSvgWithoutTitle: rendered to PNG by satori; consumers see flat raster bytes, ARIA never reaches an a11y tree, and a <title> child shows as visible text in satori's output. */}
      <svg
        width={800}
        height={20}
        viewBox="0 0 286 14"
        fill="none"
        preserveAspectRatio="none"
        style={{ marginTop: 8 }}
      >
        <path
          d="M3 11C45 3.5 91.5 1.5 143 5.5C194.5 9.5 241 7 283 3"
          stroke={ACCENT}
          strokeWidth="5"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

const DM_SANS_LIGHT_URL =
  'https://fonts.gstatic.com/s/dmsans/v15/rP2tp2ywxg089UriI5-g4vlH9VoD8CmcqZG40F9JadbnoEwAo69EBlec.ttf';
const DM_SANS_MEDIUM_URL =
  'https://fonts.gstatic.com/s/dmsans/v15/rP2tp2ywxg089UriI5-g4vlH9VoD8CmcqZG40F9JadbnoEwAoa9EBlec.ttf';

async function loadDmSans(): Promise<FontPair | null> {
  try {
    const [light, medium] = await Promise.all([
      fetch(DM_SANS_LIGHT_URL).then((r) => (r.ok ? r.arrayBuffer() : null)),
      fetch(DM_SANS_MEDIUM_URL).then((r) => (r.ok ? r.arrayBuffer() : null)),
    ]);
    if (!light || !medium) return null;
    return { light, medium };
  } catch {
    return null;
  }
}
