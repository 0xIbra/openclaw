type SparklineProps = {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
};

export function Sparkline({
  data,
  width = 80,
  height = 28,
  color = "#00d4ff",
  fill = true,
}: SparklineProps) {
  if (data.length < 2) {
    return <svg width={width} height={height} />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return [x, y] as [number, number];
  });

  const polyline = points.map(([x, y]) => `${x},${y}`).join(" ");
  const fillPath =
    `M${points[0][0]},${height} ` +
    points.map(([x, y]) => `L${x},${y}`).join(" ") +
    ` L${points[points.length - 1][0]},${height} Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none">
      {fill && <path d={fillPath} fill={color} fillOpacity={0.1} />}
      <polyline points={polyline} stroke={color} strokeWidth={1.5} fill="none" />
    </svg>
  );
}
