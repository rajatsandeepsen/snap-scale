export const IMAGE_MODEL = "gpt-image-2";

const REFERENCE_COLOR = "bright green (#00FF00)";
const MAIN_COLOR = "magenta (#FF00FF)";

// Native base64 (where the runtime has it) keeps Worker CPU time low.
type Base64Uint8Array = typeof Uint8Array & {
  fromBase64?: (b64: string) => Uint8Array;
};
const fromBase64 = (b64: string) =>
  (Uint8Array as Base64Uint8Array).fromBase64?.(b64) ??
  Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export async function drawMarkers(options: {
  bytes: Uint8Array;
  contentType: string;
  apiKey: string;
  referenceName: string;
  mainName: string;
}): Promise<Uint8Array> {
  const form = new FormData();
  form.set("model", IMAGE_MODEL);
  form.set("quality", "high");
  form.set(
    "image",
    new Blob([options.bytes], { type: options.contentType }),
    "photo",
  );
  form.set(
    "prompt",
    `Reproduce this exact photo unchanged, same framing and geometry, and add markers: place a small solid pure ${REFERENCE_COLOR} filled circle exactly on each of the 4 corners of the ${options.referenceName}, and a small solid pure ${MAIN_COLOR} filled circle exactly on each of the 4 corners of the ${options.mainName}. For round objects, put the dots on the corners of the square that tightly encloses it, following the perspective. Exactly 8 dots. Do not move, resize or redraw any object. No other changes.`,
  );
  const res = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { authorization: `Bearer ${options.apiKey}` },
    body: form,
  });
  const body = (await res.json()) as {
    data?: { b64_json?: string }[];
    error?: { message: string } | null;
  };
  const b64 = body.data?.[0]?.b64_json;
  if (!res.ok || !b64)
    throw new Error(
      `OpenAI image error ${res.status}: ${body.error?.message ?? "no image"}`,
    );
  return fromBase64(b64);
}
