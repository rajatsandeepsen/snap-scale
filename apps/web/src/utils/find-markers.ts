type Point = [number, number];

// Must match the dot colours requested in packages/api/src/measure/markers.ts.
const isGreen = (r: number, g: number, b: number) =>
  g > 150 && g - r > 80 && g - b > 80;
const isMagenta = (r: number, g: number, b: number) =>
  r > 150 && b > 150 && r - g > 90 && b - g > 90;

/** Centroids of the 4 largest green (reference) and magenta (main) blobs. */
export function findMarkers({ data, width, height }: ImageData) {
  const n = width * height;
  // 0 = background, 1 = reference dot, 2 = main dot
  const kind = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r = data[i * 4]!;
    const g = data[i * 4 + 1]!;
    const b = data[i * 4 + 2]!;
    if (isGreen(r, g, b)) kind[i] = 1;
    else if (isMagenta(r, g, b)) kind[i] = 2;
  }

  const blobs: { kind: number; size: number; x: number; y: number }[] = [];
  const maxDot = n * 0.005;
  const stack = new Int32Array(n);
  for (let start = 0; start < n; start++) {
    const k = kind[start]!;
    if (k === 0) continue;
    let top = 0;
    let size = 0;
    let sx = 0;
    let sy = 0;
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    stack[top++] = start;
    kind[start] = 0;
    while (top > 0) {
      const i = stack[--top]!;
      const x = i % width;
      const y = (i - x) / width;
      size++;
      sx += x;
      sy += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (const j of [
        x > 0 ? i - 1 : -1,
        x < width - 1 ? i + 1 : -1,
        y > 0 ? i - width : -1,
        y < height - 1 ? i + width : -1,
      ]) {
        if (j >= 0 && kind[j] === k) {
          kind[j] = 0;
          stack[top++] = j;
        }
      }
    }
    // Keep only dot-like blobs (roughly round, small), not coloured regions of the photo.
    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    const dotLike =
      size <= maxDot && w <= 2 * h && h <= 2 * w && size >= 0.5 * w * h;
    if (dotLike) blobs.push({ kind: k, size, x: sx / size, y: sy / size });
  }

  const pick = (k: number): Point[] | null => {
    const top4 = blobs
      .filter((b) => b.kind === k)
      .sort((a, b) => b.size - a.size)
      .slice(0, 4);
    // All 4 must be real dots, not anti-aliasing specks.
    if (top4.length < 4 || top4[3]!.size < top4[0]!.size / 4) return null;
    return top4.map((b): Point => [b.x, b.y]);
  };

  return { width, height, reference: pick(1), main: pick(2) };
}

export async function loadImageData(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok)
    throw new Error(`Could not load the marked image (${res.status})`);
  const bitmap = await createImageBitmap(await res.blob());
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser");
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
}
