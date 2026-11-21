import { Button } from "@snap-scale/ui/components/button";
import { ArrowLeftIcon, CameraIcon, CopyIcon, RulerIcon } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { formatLength, type Unit, UNITS } from "@/utils/units";

const COMMON_RATIOS: [string, number][] = [
  ["1:1", 1],
  ["5:4", 5 / 4],
  ["4:3", 4 / 3],
  ["√2 (A paper)", Math.SQRT2],
  ["3:2", 3 / 2],
  ["16:10", 16 / 10],
  ["golden ratio", (1 + Math.sqrt(5)) / 2],
  ["16:9", 16 / 9],
  ["2:1", 2],
];

const formatArea = (mm2: number, unit: Unit) => {
  const f = UNITS[unit].mm ** 2;
  return `${(mm2 / f).toFixed(unit === "mm" ? 0 : Math.max(UNITS[unit].digits, 1))} ${unit}²`;
};

export function NextActions({
  name,
  lengthMm,
  widthMm,
  unit,
  onBack,
  onRemeasure,
}: {
  name: string;
  lengthMm: number;
  widthMm: number;
  unit: Unit;
  onBack: () => void;
  onRemeasure: () => void;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState<string | null>(null);
  const long = Math.max(lengthMm, widthMm);
  const short = Math.min(lengthMm, widthMm);
  const ratio = long / short;
  const near = COMMON_RATIOS.find(([, r]) => Math.abs(ratio / r - 1) < 0.03);
  const L = formatLength(lengthMm, unit);
  const W = formatLength(widthMm, unit);
  const num = (mm: number) => (mm / UNITS[unit].mm).toFixed(UNITS[unit].digits);

  const actions = [
    { key: "area", label: "Area", value: formatArea(lengthMm * widthMm, unit), how: `${L} × ${W}` },
    {
      key: "diagonal",
      label: "Diagonal length",
      value: formatLength(Math.hypot(lengthMm, widthMm), unit),
      how: `√(${num(lengthMm)}² + ${num(widthMm)}²) ${unit}`,
    },
    {
      key: "perimeter",
      label: "Perimeter",
      value: formatLength(2 * (lengthMm + widthMm), unit),
      how: `2 × (${L} + ${W})`,
    },
    {
      key: "ratio",
      label: "Aspect ratio",
      value: `${ratio.toFixed(2)} : 1`,
      how: near ? `close to ${near[0]}` : "long side ÷ short side",
    },
  ];

  return (
    <div className="grid gap-2">
      {actions.map((a) => (
        <button
          key={a.key}
          type="button"
          onClick={() => setOpen(open === a.key ? null : a.key)}
          className="grid gap-0.5 rounded-xl border border-neutral-200 px-4 py-3 text-left transition-colors hover:bg-neutral-50"
        >
          <span className="flex items-center justify-between gap-2 font-medium">
            {a.label}
            {open === a.key && <span className="font-semibold tabular-nums">{a.value}</span>}
          </span>
          {open === a.key && <span className="text-xs text-neutral-500">{a.how}</span>}
        </button>
      ))}
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(`${name}: ${L} × ${W}`);
          toast.success("Copied");
        }}
        className="flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-3 text-left font-medium transition-colors hover:bg-neutral-50"
      >
        <CopyIcon className="size-4" /> Copy dimensions
      </button>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:flex">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeftIcon /> Back
        </Button>
        <Button variant="outline" onClick={onRemeasure}>
          <RulerIcon /> Measure again
        </Button>
        <Button className="col-span-2 sm:ml-auto" onClick={() => navigate("/")}>
          <CameraIcon /> New photo
        </Button>
      </div>
    </div>
  );
}
