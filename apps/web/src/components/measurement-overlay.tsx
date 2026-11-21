import type { AppRouterClient } from "@snap-scale/api/routers/index";

import { formatMm } from "@/utils/image-url";

type Analysis = NonNullable<
  Awaited<ReturnType<AppRouterClient["images"]["get"]>>["analysis"]
>;
type Point = Analysis["main"]["corners"][number];

const centroid = (pts: Point[]): Point => [
  pts.reduce((s, p) => s + p[0], 0) / pts.length,
  pts.reduce((s, p) => s + p[1], 0) / pts.length,
];

function Shape({
  corners,
  color,
  label,
  unit,
}: {
  corners: Point[];
  color: string;
  label: string;
  unit: number;
}) {
  const [cx, cy] = centroid(corners);
  return (
    <g>
      <polygon
        points={corners.map((p) => p.join(",")).join(" ")}
        fill={color}
        fillOpacity={0.12}
        stroke={color}
        strokeWidth={unit * 0.4}
        strokeLinejoin="round"
      />
      {corners.map(([x, y], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={unit * 1}
          fill={color}
          stroke="white"
          strokeWidth={unit * 0.3}
        />
      ))}
      <text
        x={cx}
        y={cy}
        fill="white"
        stroke="black"
        strokeWidth={unit * 0.5}
        paintOrder="stroke"
        fontSize={unit * 3}
        fontWeight={600}
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {label}
      </text>
    </g>
  );
}

export function MeasurementOverlay({ analysis }: { analysis: Analysis }) {
  const { imageWidth: w, imageHeight: h, main, reference } = analysis;
  const unit = Math.max(w, h) / 120;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 size-full"
    >
      <title>Detected reference and main object</title>
      <Shape
        corners={reference.corners}
        color="#22c55e"
        label={reference.name}
        unit={unit}
      />
      <Shape
        corners={main.corners}
        color="#f97316"
        label={`${formatMm(main.lengthMm)} × ${formatMm(main.widthMm)}`}
        unit={unit}
      />
    </svg>
  );
}
