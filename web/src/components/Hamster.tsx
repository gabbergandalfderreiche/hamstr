type Mood = "sparkle" | "happy" | "wink";

type HamsterProps = {
  mood?: Mood;
  size?: number;
  /** Show the Bitcoin coin in its paws. */
  coin?: boolean;
  /** Little anime sparkles around the hamster. */
  sparkles?: boolean;
  className?: string;
  title?: string;
};

const FUR = "#F4A04A";
const FUR_DARK = "#E2832C";
const CREAM = "#FFF1DC";
const PINK = "#FFB3C1";
const INK = "#2A1A10";

function Eye({ cx, cy, mood, side }: { cx: number; cy: number; mood: Mood; side: "left" | "right" }) {
  const closed = mood === "happy" || (mood === "wink" && side === "right");
  if (closed) {
    return (
      <path
        d={`M${cx - 12} ${cy + 3} Q${cx} ${cy - 11} ${cx + 12} ${cy + 3}`}
        stroke={INK}
        strokeWidth={4.5}
        strokeLinecap="round"
        fill="none"
      />
    );
  }
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={13} ry={16} fill={INK} />
      <ellipse cx={cx} cy={cy + 6} rx={9} ry={8} fill="#7A3E17" />
      <circle cx={cx + 4} cy={cy - 6} r={5.2} fill="#fff" />
      <circle cx={cx - 5} cy={cy + 7} r={2.4} fill="#fff" />
    </g>
  );
}

function Sparkle({ x, y, s, color }: { x: number; y: number; s: number; color: string }) {
  return (
    <path
      d={`M${x} ${y - s} Q${x + s * 0.18} ${y - s * 0.18} ${x + s} ${y} Q${x + s * 0.18} ${y + s * 0.18} ${x} ${y + s} Q${x - s * 0.18} ${y + s * 0.18} ${x - s} ${y} Q${x - s * 0.18} ${y - s * 0.18} ${x} ${y - s}Z`}
      fill={color}
    />
  );
}

/** The Hamstr mascot: a chibi anime hamster that stuffs its cheeks with Bitcoin. */
export function Hamster({
  mood = "sparkle",
  size = 240,
  coin = true,
  sparkles = false,
  className,
  title = "Hamstr Maskottchen",
}: HamsterProps) {
  return (
    <svg
      viewBox="0 0 240 240"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={title}
    >
      {sparkles && (
        <g className="hamster-sparkles">
          <Sparkle x={36} y={56} s={11} color="#F7931A" />
          <Sparkle x={206} y={46} s={8} color={PINK} />
          <Sparkle x={214} y={150} s={10} color="#F7931A" />
          <Sparkle x={24} y={160} s={7} color={PINK} />
        </g>
      )}

      <ellipse cx={120} cy={222} rx={70} ry={9} fill={INK} opacity={0.08} />

      {/* ears */}
      <circle cx={64} cy={80} r={21} fill={FUR} />
      <circle cx={176} cy={80} r={21} fill={FUR} />
      <circle cx={65} cy={82} r={12} fill={PINK} />
      <circle cx={175} cy={82} r={12} fill={PINK} />

      {/* feet */}
      <ellipse cx={88} cy={213} rx={17} ry={9} fill={FUR_DARK} />
      <ellipse cx={152} cy={213} rx={17} ry={9} fill={FUR_DARK} />

      {/* body */}
      <ellipse cx={120} cy={146} rx={82} ry={72} fill={FUR} />
      <path d="M104 78 Q120 70 136 78 Q128 96 120 98 Q112 96 104 78Z" fill={FUR_DARK} opacity={0.55} />
      <ellipse cx={120} cy={170} rx={54} ry={44} fill={CREAM} />

      {/* stuffed cheeks */}
      <ellipse cx={70} cy={150} rx={31} ry={25} fill={CREAM} />
      <ellipse cx={170} cy={150} rx={31} ry={25} fill={CREAM} />
      <ellipse cx={72} cy={145} rx={13} ry={7} fill={PINK} opacity={0.8} />
      <ellipse cx={168} cy={145} rx={13} ry={7} fill={PINK} opacity={0.8} />

      {/* face */}
      <Eye cx={92} cy={120} mood={mood} side="left" />
      <Eye cx={148} cy={120} mood={mood} side="right" />
      <path d="M115 136 Q120 132 125 136 Q122 141 120 141 Q118 141 115 136Z" fill="#F07C93" />
      <path
        d="M110 145 Q115 151 120 145 Q125 151 130 145"
        stroke={INK}
        strokeWidth={2.6}
        strokeLinecap="round"
        fill="none"
      />

      {coin ? (
        <g>
          <circle cx={120} cy={182} r={25} fill="#F7931A" stroke="#D9770C" strokeWidth={3} />
          <circle cx={120} cy={182} r={18} fill="none" stroke="#FFD08A" strokeWidth={1.5} opacity={0.8} />
          <text
            x={120}
            y={191}
            textAnchor="middle"
            fontSize={26}
            fontWeight={800}
            fill="#fff"
            fontFamily="system-ui, sans-serif"
          >
            ₿
          </text>
          <ellipse cx={97} cy={180} rx={11} ry={9} fill={FUR} />
          <ellipse cx={143} cy={180} rx={11} ry={9} fill={FUR} />
          <circle cx={97} cy={180} r={3.5} fill={PINK} />
          <circle cx={143} cy={180} r={3.5} fill={PINK} />
        </g>
      ) : (
        <g>
          <ellipse cx={100} cy={178} rx={11} ry={9} fill={FUR} />
          <ellipse cx={140} cy={178} rx={11} ry={9} fill={FUR} />
        </g>
      )}
    </svg>
  );
}
