/** Small drawn flag – flag emojis show up as plain "DE" letters on Windows. Sized by attributes, not CSS. */
export function GermanFlag({ width = 18 }: { width?: number }) {
  return (
    <svg
      viewBox="0 0 5 3"
      width={width}
      height={(width * 3) / 5}
      style={{ borderRadius: 2, flexShrink: 0 }}
      role="img"
      aria-label="Deutschland / Germany"
    >
      <rect width="5" height="1" y="0" fill="#000" />
      <rect width="5" height="1" y="1" fill="#DD0000" />
      <rect width="5" height="1" y="2" fill="#FFCE00" />
    </svg>
  );
}
