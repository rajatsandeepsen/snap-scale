import type {
  Analysis,
  Point,
  ReferenceObject,
} from "@snap-scale/db/schema/images";
import { imageSize } from "image-size";
import { z } from "zod";

import { measureOnPlane, orderClockwise } from "./geometry";

const MODEL = "gpt-5";

const INSTRUCTIONS = `You measure objects in photos using a reference object of known, standardized size.

1. Identify the MAIN object: the most prominent object the photographer most likely wants measured (not the reference).
2. Identify a REFERENCE object of globally standardized size. Prefer one from the catalog below and set catalog_id and source="catalog". If the visible reference is a standardized product that is not in the catalog, use web search to find its exact real-world dimensions in millimetres, set catalog_id=null and source="web".
3. Locate exactly 4 corner points for each object, ordered top-left, top-right, bottom-right, bottom-left as seen in the photo.
   - Reference: the points must sit exactly on its physical corners. For coins and discs, use the corners of the square circumscribing the rim, following the perspective.
   - Main object: the tightest quadrilateral around its outline on the surface it rests on (the same plane as the reference).
   - Coordinates are normalized integers from 0 to 1000: x=0 is the left edge and x=1000 the right edge, y=0 is the top edge and y=1000 the bottom edge.
   - Be as precise as possible; the measurement accuracy depends directly on these points.
4. width_mm and height_mm are the reference's real size; width_mm is the side running from its top-left to its top-right corner.

If there is no clear main object or no standardized reference object, set found=false and explain why in notes. Keep notes to one or two short sentences.`;

const point = {
  type: "object",
  additionalProperties: false,
  required: ["x", "y"],
  properties: { x: { type: "number" }, y: { type: "number" } },
};
const corners = {
  type: "array",
  items: point,
  description: "Exactly 4 points: TL, TR, BR, BL",
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["found", "notes", "main", "reference"],
  properties: {
    found: { type: "boolean" },
    notes: { type: "string" },
    main: {
      type: "object",
      additionalProperties: false,
      required: ["name", "corners"],
      properties: { name: { type: "string" }, corners },
    },
    reference: {
      type: "object",
      additionalProperties: false,
      required: [
        "name",
        "catalog_id",
        "source",
        "width_mm",
        "height_mm",
        "corners",
      ],
      properties: {
        name: { type: "string" },
        catalog_id: { type: ["string", "null"] },
        source: { type: "string", enum: ["catalog", "web"] },
        width_mm: { type: "number" },
        height_mm: { type: "number" },
        corners,
      },
    },
  },
};

const quad = z.array(z.object({ x: z.number(), y: z.number() })).length(4);
const modelOutput = z.object({
  found: z.boolean(),
  notes: z.string(),
  main: z.object({ name: z.string(), corners: quad }),
  reference: z.object({
    name: z.string(),
    catalog_id: z.string().nullable(),
    source: z.enum(["catalog", "web"]),
    width_mm: z.number().positive(),
    height_mm: z.number().positive(),
    corners: quad,
  }),
});

export class MeasureError extends Error {}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function displaySize(bytes: Uint8Array) {
  const { width, height, orientation } = imageSize(bytes);
  if (!width || !height)
    throw new MeasureError("Could not read the image size");
  return orientation && orientation >= 5
    ? { width: height, height: width }
    : { width, height };
}

type ResponsesOutput = {
  output?: { type: string; content?: { type: string; text?: string }[] }[];
  error?: { message: string } | null;
};

export async function analyzeImage(options: {
  bytes: Uint8Array;
  contentType: string;
  catalog: ReferenceObject[];
  apiKey: string;
}): Promise<Analysis> {
  const started = Date.now();
  const { width, height } = displaySize(options.bytes);
  const catalog = options.catalog.map(
    ({ id, name, aliases, shape, widthMm, heightMm }) => ({
      id,
      name,
      aliases,
      shape,
      width_mm: widthMm,
      height_mm: heightMm,
    }),
  );

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${options.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      reasoning: { effort: "medium" },
      instructions: `${INSTRUCTIONS}\n\nReference catalog:\n${JSON.stringify(catalog)}`,
      tools: [{ type: "web_search" }],
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: `Photo size: ${width}x${height} px.` },
            {
              type: "input_image",
              image_url: `data:${options.contentType};base64,${toBase64(options.bytes)}`,
              detail: "high",
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "measurement",
          strict: true,
          schema: SCHEMA,
        },
      },
    }),
  });
  const body = (await res.json()) as ResponsesOutput;
  if (!res.ok)
    throw new Error(
      `OpenAI error ${res.status}: ${body.error?.message ?? "unknown"}`,
    );

  const text = body.output
    ?.find((item) => item.type === "message")
    ?.content?.find((c) => c.type === "output_text")?.text;
  if (!text) throw new Error("OpenAI returned no output");
  const json = JSON.parse(text);
  const verdict = z
    .object({ found: z.boolean(), notes: z.string() })
    .parse(json);
  if (!verdict.found)
    throw new MeasureError(verdict.notes || "No reference object found");
  const out = modelOutput.parse(json);

  const toPx = (points: { x: number; y: number }[]) =>
    orderClockwise(
      points.map(
        ({ x, y }): Point => [(x / 1000) * width, (y / 1000) * height],
      ),
    );
  const referenceCorners = toPx(out.reference.corners);
  const mainCorners = toPx(out.main.corners);
  const size = measureOnPlane(
    referenceCorners,
    [out.reference.width_mm, out.reference.height_mm],
    mainCorners,
  );

  return {
    imageWidth: width,
    imageHeight: height,
    main: { name: out.main.name, corners: mainCorners, ...size },
    reference: {
      name: out.reference.name,
      source: out.reference.source,
      widthMm: out.reference.width_mm,
      heightMm: out.reference.height_mm,
      corners: referenceCorners,
    },
    notes: out.notes,
    model: MODEL,
    durationMs: Date.now() - started,
  };
}
