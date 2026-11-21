import { z } from "zod";

import { askJson } from "./analyze";

const SIDE_NAMES = ["1-2", "2-3", "3-4", "4-1"] as const;

const instructions = (referenceName: string, mainName: string) =>
  `The photo has numbered corner markers on two objects: the reference "${referenceName}" (green labels R1-R4) and the main object "${mainName}" (magenta labels M1-M4). Corners are numbered clockwise.

For each object, rate each of its 4 sides (1-2, 2-3, 3-4, 4-1) from 1 to 5 by how trustworthy a length measured between those two markers is:
5 = both markers sit exactly on the object's real corners, and the side is fully visible, sharp, straight and lies flat on the surface both objects rest on.
1 = a marker is off the real corner, or the side is hidden, cut off, blurred, curved or raised off that surface.

Give a short reason (under 12 words) for each side.`;

const sideSchema = {
  type: "object",
  additionalProperties: false,
  required: ["priority", "reason"],
  properties: {
    priority: { type: "integer", enum: [1, 2, 3, 4, 5] },
    reason: { type: "string" },
  },
};
const objectSchema = {
  type: "object",
  additionalProperties: false,
  required: [...SIDE_NAMES],
  properties: Object.fromEntries(SIDE_NAMES.map((s) => [s, sideSchema])),
};
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reference", "main"],
  properties: { reference: objectSchema, main: objectSchema },
};

const side = z.object({
  priority: z.number().int().min(1).max(5),
  reason: z.string(),
});
const sides = z
  .object({ "1-2": side, "2-3": side, "3-4": side, "4-1": side })
  .transform((o) => SIDE_NAMES.map((name) => o[name]));
const output = z.object({ reference: sides, main: sides });

export type SideRating = z.infer<typeof side>;

/** Asks gpt-5 how reliable each numbered side is, so better sides weigh more. */
export async function rateSides(options: {
  bytes: Uint8Array;
  contentType: string;
  apiKey: string;
  referenceName: string;
  mainName: string;
}): Promise<{ reference: SideRating[]; main: SideRating[] }> {
  const json = await askJson({
    apiKey: options.apiKey,
    instructions: instructions(options.referenceName, options.mainName),
    bytes: options.bytes,
    contentType: options.contentType,
    name: "side_priorities",
    schema: SCHEMA,
  });
  return output.parse(json);
}
