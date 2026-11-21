import type { AppRouterClient } from "@snap-scale/api/routers/index";

import { formatLength, type Unit } from "@/utils/units";

type Analysis = NonNullable<Awaited<ReturnType<AppRouterClient["images"]["get"]>>["analysis"]>;
type Edge = NonNullable<Analysis["main"]["edges"]>[number];

export function SidesTable({
  title,
  prefix,
  edges,
  unit,
  markUsed = false,
}: {
  markUsed?: boolean;
  title: string;
  prefix: string;
  edges: Edge[];
  unit: Unit;
}) {
  return (
    <div className="grid gap-1">
      <div className="font-medium">{title}</div>
      <table className="w-full text-xs">
        <thead className="text-muted-foreground text-left">
          <tr>
            <th className="font-normal">Side</th>
            <th className="font-normal">Pixels</th>
            <th className="font-normal">Length</th>
            <th className="font-normal">Priority</th>
          </tr>
        </thead>
        <tbody>
          {edges.map((e, i) => (
            <tr
              key={`${e.from}-${e.to}`}
              title={e.reason}
              className={
                markUsed && e.priority >= edges[(i + 2) % 4]!.priority
                  ? "font-semibold"
                  : e.priority <= 2
                    ? "text-muted-foreground"
                    : undefined
              }
            >
              <td>
                {prefix}
                {e.from}–{prefix}
                {e.to}
              </td>
              <td>{Math.round(e.lengthPx)} px</td>
              <td>{formatLength(e.lengthMm, unit)}</td>
              <td>{e.priority}/5</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
