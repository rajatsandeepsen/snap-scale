import type { Point } from "@snap-scale/db/schema/images";

const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export type Quad = [Point, Point, Point, Point];

export function orderClockwise(points: Point[]): Quad {
  if (points.length !== 4) throw new Error("Expected exactly 4 corners");
  const cx = points.reduce((s, p) => s + p[0], 0) / 4;
  const cy = points.reduce((s, p) => s + p[1], 0) / 4;
  const sorted = [...points].sort(
    (a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx),
  );
  const start = sorted.reduce(
    (best, p, i) => (p[0] + p[1] < sorted[best]![0] + sorted[best]![1] ? i : best),
    0,
  );
  return [...sorted.slice(start), ...sorted.slice(0, start)] as Quad;
}

/** Sides as corner index pairs: 1-2, 2-3, 3-4, 4-1. */
export const SIDES = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
] as const;

export const sideLengths = (q: Quad) =>
  SIDES.map(([a, b]) => dist(q[a], q[b])) as [number, number, number, number];

type Priorities = [number, number, number, number];

/** The higher-priority of two opposite sides; averaged only when they tie. */
const best = (l1: number, p1: number, l2: number, p2: number) =>
  p1 > p2 ? l1 : p2 > p1 ? l2 : (l1 + l2) / 2;

/**
 * When both sides at one corner rate 2 or lower and the other two sides rate higher,
 * that corner is likely hidden or overlapped, so it is rebuilt from the other three
 * as a parallelogram. Returns the 0-based index of the rebuilt corner, if any.
 */
export function rebuildHiddenCorner(
  q: Quad,
  priorities: Priorities,
): { quad: Quad; rebuilt: number | null } {
  for (let i = 0; i < 4; i++) {
    const before = priorities[(i + 3) % 4]!;
    const after = priorities[i]!;
    const others = [priorities[(i + 1) % 4]!, priorities[(i + 2) % 4]!];
    if (before <= 2 && after <= 2 && others.every((p) => p > 2)) {
      const prev = q[(i + 3) % 4]!;
      const next = q[(i + 1) % 4]!;
      const opposite = q[(i + 2) % 4]!;
      const quad = [...q] as Quad;
      quad[i] = [prev[0] + next[0] - opposite[0], prev[1] + next[1] - opposite[1]];
      return { quad, rebuilt: i };
    }
  }
  return { quad: q, rebuilt: null };
}

/** Solves for the 3x3 homography (h33 = 1) mapping each src corner onto its dst corner. */
export function homography(src: Quad, dst: Quad): number[] {
  const rows: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i]!;
    const [u, v] = dst[i]!;
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let c = 0; c < 8; c++) {
    let pivot = c;
    for (let r = c + 1; r < 8; r++) {
      if (Math.abs(rows[r]![c]!) > Math.abs(rows[pivot]![c]!)) pivot = r;
    }
    [rows[c], rows[pivot]] = [rows[pivot]!, rows[c]!];
    const pr = rows[c]!;
    if (Math.abs(pr[c]!) < 1e-9) throw new Error("Reference corners are degenerate");
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const row = rows[r]!;
      const f = row[c]! / pr[c]!;
      for (let k = c; k < 9; k++) row[k]! -= f * pr[k]!;
    }
  }
  return [...rows.map((row, i) => row[8]! / row[i]!), 1];
}

export function project(h: number[], [x, y]: Point): Point {
  const w = h[6]! * x + h[7]! * y + h[8]!;
  return [(h[0]! * x + h[1]! * y + h[2]!) / w, (h[3]! * x + h[4]! * y + h[5]!) / w];
}

const edgePairs = (q: Quad) => ({
  a: (dist(q[0], q[1]) + dist(q[3], q[2])) / 2,
  b: (dist(q[1], q[2]) + dist(q[0], q[3])) / 2,
});

/**
 * Rectifies the reference plane using the reference's 4 corners and its real size,
 * then measures each side of the main object's quad on that plane. Assumes both lie
 * on the same plane. Of each pair of opposite sides, the one with the higher
 * `mainPriorities` value sets that dimension.
 */
export function measureOnPlane(
  reference: Quad,
  referenceSizeMm: [number, number],
  main: Quad,
  mainPriorities: Priorities = [1, 1, 1, 1],
) {
  const long = Math.max(...referenceSizeMm);
  const short = Math.min(...referenceSizeMm);
  const ref = edgePairs(reference);
  const [w, h] = ref.a >= ref.b ? [long, short] : [short, long];
  const H = homography(reference, [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ]);
  const mainSidesMm = sideLengths(main.map((p) => project(H, p)) as Quad);
  const [p1, p2, p3, p4] = mainPriorities;
  const a = best(mainSidesMm[0], p1, mainSidesMm[2], p3);
  const b = best(mainSidesMm[1], p2, mainSidesMm[3], p4);
  return {
    lengthMm: Math.max(a, b),
    widthMm: Math.min(a, b),
    mainSidesMm,
    referenceSidesMm: [w, h, w, h] as [number, number, number, number],
  };
}
