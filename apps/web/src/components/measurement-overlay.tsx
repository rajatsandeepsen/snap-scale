import type { AppRouterClient } from "@snap-scale/api/routers/index";

import { formatLength, useUnit } from "@/utils/units";

type Analysis = NonNullable<Awaited<ReturnType<AppRouterClient["images"]["get"]>>["analysis"]>;
type Point = Analysis["main"]["corners"][number];
type Edge = NonNullable<Analysis["main"]["edges"]>[number];

const centroid = (pts: Point[]): Point => [
  pts.reduce((s, p) => s + p[0], 0) / pts.length,
  pts.reduce((s, p) => s + p[1], 0) / pts.length,
];

function Shape({
  corners,
  edges,
  prefix,
  color,
  label,
  sideLabel,
  unit,
}: {
  corners: Point[];
  edges?: Edge[];
  prefix: string;
  color: string;
  label: string;
  sideLabel?: (edge: Edge) => string;
  unit: number;
}) {
  const [cx, cy] = centroid(corners);
  const text = {
    fill: "white",
    stroke: "black",
    strokeWidth: unit * 0.4,
    paintOrder: "stroke",
    fontWeight: 600,
    textAnchor: "middle",
    dominantBaseline: "middle",
  } as const;
  return (
    <g>
      <polygon
        points={corners.map((p) => p.join(",")).join(" ")}
        fill={color}
        fillOpacity={0.12}
        stroke={edges ? "none" : color}
        strokeWidth={unit * 0.4}
        strokeLinejoin="round"
      />
      {edges?.map((e) => {
        const [x1, y1] = corners[e.from - 1]!;
        const [x2, y2] = corners[e.to - 1]!;
        return (
          <g key={`${e.from}-${e.to}`}>
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={color}
              strokeWidth={unit * 0.4}
              strokeLinecap="round"
              strokeDasharray={e.priority <= 2 ? `${unit * 1.2} ${unit * 0.8}` : undefined}
            />
            {sideLabel && (
              <text {...text} x={(x1 + x2) / 2} y={(y1 + y2) / 2} fontSize={unit * 2}>
                {sideLabel(e)}
              </text>
            )}
          </g>
        );
      })}
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
      {corners.map(([x, y], i) => {
        const d = Math.hypot(x - cx, y - cy) || 1;
        return (
          <text
            key={i}
            {...text}
            x={x + ((x - cx) / d) * unit * 2.5}
            y={y + ((y - cy) / d) * unit * 2.5}
            fontSize={unit * 2}
          >
            {prefix}
            {i + 1}
          </text>
        );
      })}
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
  const lengthUnit = useUnit();
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 size-full"
    >
      <title>Detected reference and main object</title>
      <Shape
        corners={reference.corners}
        edges={reference.edges}
        prefix="R"
        color="#22c55e"
        label={reference.name}
        unit={unit}
      />
      <Shape
        corners={main.corners}
        edges={main.edges}
        prefix="M"
        sideLabel={(e) => formatLength(e.lengthMm, lengthUnit)}
        color="#f97316"
        label={`${formatLength(main.lengthMm, lengthUnit)} × ${formatLength(main.widthMm, lengthUnit)}`}
        unit={unit}
      />
    </svg>
  );
}
