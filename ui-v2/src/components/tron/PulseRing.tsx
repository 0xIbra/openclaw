type PulseRingProps = {
  color?: string;
  size?: number;
};

export function PulseRing({ color = "#00d4ff", size = 8 }: PulseRingProps) {
  return (
    <span className="relative inline-flex" style={{ width: size, height: size }}>
      <span
        className="absolute animate-pulse-ring rounded-full w-full h-full"
        style={{ backgroundColor: color, opacity: 0.75 }}
      />
      <span
        className="relative rounded-full"
        style={{ width: size, height: size, backgroundColor: color }}
      />
    </span>
  );
}
