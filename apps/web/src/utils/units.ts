import { useSyncExternalStore } from "react";

export const UNITS = {
  mm: { mm: 1, digits: 0 },
  cm: { mm: 10, digits: 1 },
  m: { mm: 1000, digits: 3 },
  in: { mm: 25.4, digits: 2 },
  ft: { mm: 304.8, digits: 2 },
} as const;

export type Unit = keyof typeof UNITS;

const KEY = "snap-scale:unit";
const DEFAULT: Unit = "cm";
const listeners = new Set<() => void>();

const read = (): Unit => {
  const saved = localStorage.getItem(KEY);
  return saved && saved in UNITS ? (saved as Unit) : DEFAULT;
};

export function setUnit(unit: Unit) {
  localStorage.setItem(KEY, unit);
  for (const listener of listeners) listener();
}

export function useUnit() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read,
    () => DEFAULT,
  );
}

export const formatLength = (mm: number, unit: Unit) =>
  `${(mm / UNITS[unit].mm).toFixed(UNITS[unit].digits)} ${unit}`;
