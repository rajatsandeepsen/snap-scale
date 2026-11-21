import type { AppRouterClient } from "@snap-scale/api/routers/index";

import { markedUrl, imageUrl } from "@/utils/image-url";
import { formatLength, type Unit } from "@/utils/units";

export type Analysis = NonNullable<
  Awaited<ReturnType<AppRouterClient["images"]["get"]>>["analysis"]
>;
type Point = Analysis["main"]["corners"][number];

const centroid = (pts: Point[]): Point => [
  pts.reduce((s, p) => s + p[0], 0) / pts.length,
  pts.reduce((s, p) => s + p[1], 0) / pts.length,
];

/** The marked photo with each object's outline, side lengths and name. */
export function ResultImage({
  id,
  analysis,
  unit,
}: {
  id: string;
  analysis: Analysis;
  unit: Unit;
}) {
  const { imageWidth: w, imageHeight: h, main, reference } = analysis;
  const u = Math.max(w, h) / 100;
  const text = {
    fill: "white",
    stroke: "rgba(0,0,0,0.75)",
    strokeWidth: u * 0.45,
    paintOrder: "stroke",
    fontWeight: 600,
    textAnchor: "middle",
    dominantBaseline: "middle",
  } as const;
  const outline = (corners: Point[], color: string) => (
    <polygon
      points={corners.map((p) => p.join(",")).join(" ")}
      fill={color}
      fillOpacity={0.1}
      stroke={color}
      strokeWidth={u * 0.5}
      strokeLinejoin="round"
    />
  );
  const [mx, my] = centroid(main.corners);
  const [rx, ry] = centroid(reference.corners);

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <img
        src={analysis.markedVersion ? markedUrl(id, analysis.markedVersion) : imageUrl(id)}
        alt={main.name}
        className="block w-full"
      />
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 size-full"
      >
        <title>{`${main.name} and ${reference.name}`}</title>
        {outline(reference.corners, "#22c55e")}
        {outline(main.corners, "#f97316")}
        {main.edges?.map((e) => {
          const [x1, y1] = main.corners[e.from - 1] ?? [0, 0];
          const [x2, y2] = main.corners[e.to - 1] ?? [0, 0];
          return (
            <text
              key={`${e.from}-${e.to}`}
              {...text}
              x={(x1 + x2) / 2}
              y={(y1 + y2) / 2}
              fontSize={u * 2.4}
            >
              {formatLength(e.lengthMm, unit)}
            </text>
          );
        })}
        <text {...text} x={rx} y={ry} fontSize={u * 2}>
          {reference.name}
        </text>
        <text {...text} x={mx} y={my} fontSize={u * 3.6}>
          {main.name}
        </text>
      </svg>
    </div>
  );
}
