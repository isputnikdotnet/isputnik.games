// A member as a coloured initial: the games server knows names, not photos.
// The colour comes from the id, so the same person is the same colour on
// every screen and every visit.
const COLOURS = ["#f2b84b", "#e9a0b6", "#9cc3e6", "#c7b0ea", "#9fd3b4", "#f0a27a"];

function colourOf(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return COLOURS[hash % COLOURS.length];
}

export function Avatar({ id, name, size = 40 }: { id: string; name: string; size?: number }) {
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? "?";
  return (
    <span
      className="avatar"
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42), background: colourOf(id) }}
    >
      {initial}
    </span>
  );
}
