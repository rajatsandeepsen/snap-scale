type Point = [x: number, y: number];

/** Draws "R1".."R4" and "M1".."M4" next to each marker so gpt-5 can refer to sides by number. */
export async function annotateCorners(
  image: ImageData,
  reference: Point[],
  main: Point[],
): Promise<File> {
  const canvas = new OffscreenCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser");
  ctx.putImageData(image, 0, 0);

  const size = Math.max(image.width, image.height) / 40;
  ctx.font = `bold ${size}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = size / 8;

  const label = (corners: Point[], prefix: string, fill: string) => {
    const cx = corners.reduce((s, p) => s + p[0], 0) / corners.length;
    const cy = corners.reduce((s, p) => s + p[1], 0) / corners.length;
    corners.forEach(([x, y], i) => {
      const d = Math.hypot(x - cx, y - cy) || 1;
      const lx = x + ((x - cx) / d) * size * 1.4;
      const ly = y + ((y - cy) / d) * size * 1.4;
      const text = `${prefix}${i + 1}`;
      const w = ctx.measureText(text).width + size * 0.5;
      ctx.fillStyle = fill;
      ctx.strokeStyle = "black";
      ctx.beginPath();
      ctx.roundRect(lx - w / 2, ly - size * 0.65, w, size * 1.3, size * 0.3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "black";
      ctx.fillText(text, lx, ly);
    });
  };
  label(reference, "R", "#00FF00");
  label(main, "M", "#FF00FF");

  const blob = await canvas.convertToBlob({
    type: "image/jpeg",
    quality: 0.85,
  });
  return new File([blob], "annotated.jpg", { type: "image/jpeg" });
}
