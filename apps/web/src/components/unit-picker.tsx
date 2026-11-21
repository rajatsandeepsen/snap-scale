import { Button } from "@snap-scale/ui/components/button";

import { setUnit, type Unit, UNITS, useUnit } from "@/utils/units";

export function UnitPicker() {
  const current = useUnit();
  return (
    <fieldset className="flex gap-1">
      <legend className="sr-only">Unit of measure</legend>
      {(Object.keys(UNITS) as Unit[]).map((unit) => (
        <Button
          key={unit}
          size="xs"
          variant={unit === current ? "default" : "outline"}
          aria-pressed={unit === current}
          onClick={() => setUnit(unit)}
        >
          {unit}
        </Button>
      ))}
    </fieldset>
  );
}
