import type { Point } from "@snap-scale/db/schema/images";

const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export type Quad = [Point, Point, Point, Point];

export function orderClockwise(points: Point[]): Quad {
  if (points.length !== 4) throw new Error("Expected exactly 4 corners");
  const cx = points.reduce((s, p) => s + p[0], 0) / 4;
  const cy = points.reduce((s, p) => s + p[1], 0) / 4;
  const sorted = [...points].sort(
    (a, b) =>
      Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx),
  );
  return sorted as Quad;
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
    if (Math.abs(pr[c]!) < 1e-9)
      throw new Error("Reference corners are degenerate");
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
  return [
    (h[0]! * x + h[1]! * y + h[2]!) / w,
    (h[3]! * x + h[4]! * y + h[5]!) / w,
  ];
}

const edgePairs = (q: Quad) => ({
  a: (dist(q[0], q[1]) + dist(q[3], q[2])) / 2,
  b: (dist(q[1], q[2]) + dist(q[0], q[3])) / 2,
});

/**
 * Rectifies the reference plane using the reference's 4 corners and its real size,
 * then measures the main object's quad on that plane. Assumes both lie on the same plane.
 */
export function measureOnPlane(
  reference: Quad,
  referenceSizeMm: [number, number],
  main: Quad,
): { lengthMm: number; widthMm: number } {
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
  const mm = main.map((p) => project(H, p)) as Quad;
  const { a, b } = edgePairs(mm);
  return { lengthMm: Math.max(a, b), widthMm: Math.min(a, b) };
}
