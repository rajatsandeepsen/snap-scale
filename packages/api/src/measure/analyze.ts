import type { Analysis, ReferenceObject } from "@snap-scale/db/schema/images";
import { z } from "zod";

export const MODEL = "gpt-5";

const INSTRUCTIONS = `You identify objects in photos so they can be measured against a reference object of known, standardized size.

1. Identify the MAIN object: the most prominent object the photographer most likely wants measured (not the reference).
2. Identify a REFERENCE object of globally standardized size. Prefer one from the catalog below and set catalog_id and source="catalog". If the visible reference is a standardized product that is not in the catalog, use web search to find its exact real-world dimensions in millimetres, set catalog_id=null and source="web".
3. Give each object a short, visually distinctive name (e.g. "red credit card", "blue notebook") so an image editor can find it in the photo.
4. width_mm and height_mm are the reference's real size.

If there is no clear main object or no standardized reference object, set found=false and explain why in notes. Keep notes to one or two short sentences.`;

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
      required: ["name"],
      properties: { name: { type: "string" } },
    },
    reference: {
      type: "object",
      additionalProperties: false,
      required: ["name", "catalog_id", "source", "width_mm", "height_mm"],
      properties: {
        name: { type: "string" },
        catalog_id: { type: ["string", "null"] },
        source: { type: "string", enum: ["catalog", "web"] },
        width_mm: { type: "number" },
        height_mm: { type: "number" },
      },
    },
  },
};

const modelOutput = z.object({
  found: z.boolean(),
  notes: z.string(),
  main: z.object({ name: z.string() }),
  reference: z.object({
    name: z.string(),
    catalog_id: z.string().nullable(),
    source: z.enum(["catalog", "web"]),
    width_mm: z.number().positive(),
    height_mm: z.number().positive(),
  }),
});

export type Identification = {
  main: { name: string };
  reference: Pick<Analysis["reference"], "name" | "source" | "widthMm" | "heightMm">;
  notes: string;
};

export class MeasureError extends Error {}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

type ResponsesOutput = {
  output?: { type: string; content?: { type: string; text?: string }[] }[];
  error?: { message: string } | null;
};

/** Sends one image to gpt-5 and returns its JSON reply, validated against `schema` by OpenAI. */
export async function askJson(options: {
  apiKey: string;
  instructions: string;
  bytes: Uint8Array;
  contentType: string;
  name: string;
  schema: object;
  webSearch?: boolean;
}): Promise<unknown> {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${options.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      reasoning: { effort: "low" },
      instructions: options.instructions,
      ...(options.webSearch ? { tools: [{ type: "web_search" }] } : {}),
      input: [
        {
          role: "user",
          content: [
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
          name: options.name,
          strict: true,
          schema: options.schema,
        },
      },
    }),
  });
  const body = (await res.json()) as ResponsesOutput;
  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${body.error?.message ?? "unknown"}`);

  const text = body.output
    ?.find((item) => item.type === "message")
    ?.content?.find((c) => c.type === "output_text")?.text;
  if (!text) throw new Error("OpenAI returned no output");
  return JSON.parse(text);
}

export async function identifyObjects(options: {
  bytes: Uint8Array;
  contentType: string;
  catalog: ReferenceObject[];
  apiKey: string;
}): Promise<Identification> {
  const catalog = options.catalog.map(({ id, name, aliases, shape, widthMm, heightMm }) => ({
    id,
    name,
    aliases,
    shape,
    width_mm: widthMm,
    height_mm: heightMm,
  }));

  const json = await askJson({
    apiKey: options.apiKey,
    instructions: `${INSTRUCTIONS}\n\nReference catalog:\n${JSON.stringify(catalog)}`,
    bytes: options.bytes,
    contentType: options.contentType,
    name: "measurement",
    schema: SCHEMA,
    webSearch: true,
  });
  const verdict = z.object({ found: z.boolean(), notes: z.string() }).parse(json);
  if (!verdict.found) throw new MeasureError(verdict.notes || "No reference object found");
  const out = modelOutput.parse(json);
  return {
    main: { name: out.main.name },
    reference: {
      name: out.reference.name,
      source: out.reference.source,
      widthMm: out.reference.width_mm,
      heightMm: out.reference.height_mm,
    },
    notes: out.notes,
  };
}
