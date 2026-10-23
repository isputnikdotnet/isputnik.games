// The pieces, drawn here rather than borrowed from a font (the glyphs differ
// from one device to the next, and a phone may draw the pawn as an emoji) or
// from a published set (their licences vary). Flat Staunton silhouettes on a
// 45-unit square: White is light with a dark outline, Black dark with light
// detail lines, so both read on either colour of square and on every theme.

const BASE = <rect x="10" y="35" width="25" height="5" rx="1.6" />;

const SHAPES: Record<string, { body: React.ReactNode; detail?: React.ReactNode }> = {
  p: {
    body: (
      <>
        <circle cx="22.5" cy="12.5" r="5" />
        <rect x="17" y="18.5" width="11" height="3.2" rx="1.6" />
        <path d="M18.6 21.7 L15.5 35 H29.5 L26.4 21.7 Z" />
        {BASE}
      </>
    )
  },
  r: {
    body: (
      <>
        <path d="M12 17.5 V9 H16.5 V12.5 H20.2 V9 H24.8 V12.5 H28.5 V9 H33 V17.5 Z" />
        <path d="M14.8 17.5 H30.2 L31.5 35 H13.5 Z" />
        {BASE}
      </>
    ),
    detail: <path d="M14.6 20.5 H30.4 M13.9 31.5 H31.1" />
  },
  b: {
    body: (
      <>
        <circle cx="22.5" cy="7.2" r="2.4" />
        <path d="M22.5 9.6 C17.4 13.4 15.2 18.4 16.6 23.6 H28.4 C29.8 18.4 27.6 13.4 22.5 9.6 Z" />
        <rect x="15.5" y="23.6" width="14" height="3.2" rx="1.6" />
        <path d="M18.2 26.8 L15.8 35 H29.2 L26.8 26.8 Z" />
        {BASE}
      </>
    ),
    detail: <path d="M25.2 13.6 L20.8 19.6" />
  },
  q: {
    body: (
      <>
        <path d="M14.2 28 L10.6 13.4 L17.4 21.4 L16.6 10.4 L22.5 19.4 L28.4 10.4 L27.6 21.4 L34.4 13.4 L30.8 28 Z" />
        <circle cx="10.4" cy="12" r="2.1" />
        <circle cx="16.5" cy="9" r="2.1" />
        <circle cx="22.5" cy="7.4" r="2.1" />
        <circle cx="28.5" cy="9" r="2.1" />
        <circle cx="34.6" cy="12" r="2.1" />
        <rect x="13.5" y="28" width="18" height="3.2" rx="1.6" />
        <path d="M15.6 31.2 L14.4 35 H30.6 L29.4 31.2 Z" />
        {BASE}
      </>
    )
  },
  k: {
    body: (
      <>
        <path d="M21.2 3.5 H23.8 V6.6 H26.8 V9.2 H23.8 V15.6 H21.2 V9.2 H18.2 V6.6 H21.2 Z" />
        <path d="M14.2 26.4 C10.6 20.4 13.4 14.2 22.5 14.8 C31.6 14.2 34.4 20.4 30.8 26.4 Z" />
        <rect x="13.5" y="26.4" width="18" height="3.2" rx="1.6" />
        <path d="M15.6 29.6 L14.4 35 H30.6 L29.4 29.6 Z" />
        {BASE}
      </>
    ),
    detail: <path d="M22.5 15.2 V26" />
  },
  n: {
    body: (
      <>
        <path d="M13.4 35 H31.6 C32.2 27.6 31.4 20.6 28.4 15.6 C26.4 12 23.6 10.2 21.2 10 L20.2 6.6 L18.2 10.4 L16.2 8.2 L16 12.4 C13 14.6 10.6 18.4 9.6 22 C9 24.2 10.6 25.8 12.8 25.2 L15.4 24.2 C16.8 23.6 18.2 22.6 19.6 21.4 C19.8 25.6 16 29.4 13.4 35 Z" />
        {BASE}
      </>
    ),
    detail: (
      <>
        <circle cx="17.2" cy="15.4" r="1.2" className="chess-piece-eye" />
        <path d="M26.6 14.6 C28.6 18.6 29.4 24.6 29 31" />
      </>
    )
  }
};

/** A piece by its letter: "N" a White knight, "q" a Black queen. */
export function ChessPiece({ letter, className }: { letter: string; className?: string }) {
  const shape = SHAPES[letter.toLowerCase()];
  if (!shape) return null;
  const white = letter === letter.toUpperCase();
  return (
    <svg
      className={`chess-piece ${white ? "is-white" : "is-black"}${className ? ` ${className}` : ""}`}
      viewBox="0 0 45 45"
      aria-hidden="true"
      focusable="false"
    >
      <g className="chess-piece-body">{shape.body}</g>
      {shape.detail && <g className="chess-piece-detail">{shape.detail}</g>}
    </svg>
  );
}
