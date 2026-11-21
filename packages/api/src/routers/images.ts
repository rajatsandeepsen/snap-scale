import { ORPCError } from "@orpc/server";
import type { Analysis, Edge } from "@snap-scale/db/schema/images";
import { images, referenceObjects } from "@snap-scale/db/schema/index";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import type { Context } from "../context";
import { publicProcedure } from "../index";
import { type Identification, identifyObjects, MeasureError, MODEL } from "../measure/analyze";
import {
  measureOnPlane,
  orderClockwise,
  type Quad,
  rebuildHiddenCorner,
  SIDES,
  sideLengths,
} from "../measure/geometry";
import { drawMarkers, IMAGE_MODEL } from "../measure/markers";
import { rateSides, type SideRating } from "../measure/sides";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

// Each measure run writes its own copy so overlapping runs cannot mix.
export const markedKey = (id: string, version: number) => `marked/${id}/${version}.png`;

type PendingMarkers = Identification & { durationMs: number };

async function loadOriginal(context: Context, id: string) {
  const [row] = await context.db.select().from(images).where(eq(images.id, id));
  if (!row) throw new ORPCError("NOT_FOUND");
  const object = await context.images.get(row.key);
  if (!object) throw new ORPCError("NOT_FOUND");
  return { row, bytes: new Uint8Array(await object.arrayBuffer()) };
}

const point = z.tuple([z.number(), z.number()]);

type Priorities = [number, number, number, number];

const UNRATED: SideRating[] = SIDES.map(() => ({
  priority: 3,
  reason: "Not rated",
}));

const toEdges = (corners: Quad, lengthsMm: number[], ratings: SideRating[]): Edge[] => {
  const px = sideLengths(corners);
  return SIDES.map(([a, b], i) => ({
    from: a + 1,
    to: b + 1,
    lengthPx: px[i]!,
    lengthMm: lengthsMm[i]!,
    priority: ratings[i]!.priority,
    reason: ratings[i]!.reason,
  }));
};

export const imagesRouter = {
  upload: publicProcedure
    .input(
      z.object({
        file: z
          .instanceof(File)
          .refine((f) => f.size <= MAX_IMAGE_BYTES, "Image must be 10 MB or smaller")
          .refine((f) => ALLOWED_IMAGE_TYPES.includes(f.type), "Unsupported image type"),
      }),
    )
    .handler(async ({ input, context }) => {
      const id = crypto.randomUUID();
      const ext = input.file.name.split(".").pop()?.toLowerCase() ?? "bin";
      const key = `uploads/${id}.${ext}`;

      await context.images.put(key, await input.file.arrayBuffer(), {
        httpMetadata: { contentType: input.file.type },
        customMetadata: { filename: input.file.name },
      });

      try {
        const [row] = await context.db
          .insert(images)
          .values({
            id,
            key,
            filename: input.file.name,
            contentType: input.file.type,
            size: input.file.size,
          })
          .returning();
        return row!;
      } catch (error) {
        await context.images.delete(key);
        throw error;
      }
    }),

  list: publicProcedure.handler(({ context }) =>
    context.db.select().from(images).orderBy(desc(images.createdAt)).limit(50),
  ),

  get: publicProcedure.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
    const [row] = await context.db.select().from(images).where(eq(images.id, input.id));
    if (!row) throw new ORPCError("NOT_FOUND");
    return row;
  }),

  /** gpt-5 names the main object, other candidates and a reference with its real size. */
  identify: publicProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const { row, bytes } = await loadOriginal(context, input.id);
      try {
        return await identifyObjects({
          bytes,
          contentType: row.contentType,
          catalog: await context.db.select().from(referenceObjects),
          apiKey: context.openaiApiKey,
        });
      } catch (error) {
        if (error instanceof MeasureError) {
          throw new ORPCError("UNPROCESSABLE_CONTENT", { message: error.message });
        }
        throw error;
      }
    }),

  /** gpt-image draws marker dots on the chosen main object and reference; the browser then finds them. */
  mark: publicProcedure
    .input(
      z.object({
        id: z.string(),
        identification: z.object({
          main: z.object({ name: z.string().min(1), alternatives: z.array(z.string()) }),
          reference: z.object({
            name: z.string().min(1),
            source: z.enum(["catalog", "web"]),
            widthMm: z.number().positive(),
            heightMm: z.number().positive(),
          }),
          notes: z.string(),
        }),
      }),
    )
    .handler(async ({ input, context }) => {
      const { row, bytes } = await loadOriginal(context, input.id);
      const started = Date.now();
      const marked = await drawMarkers({
        bytes,
        contentType: row.contentType,
        apiKey: context.openaiApiKey,
        referenceName: input.identification.reference.name,
        mainName: input.identification.main.name,
      });
      const pending: PendingMarkers = {
        ...input.identification,
        durationMs: Date.now() - started,
      };
      const version = Date.now();
      await context.images.put(markedKey(row.id, version), marked, {
        httpMetadata: { contentType: "image/png" },
        customMetadata: { pending: JSON.stringify(pending) },
      });
      return { version };
    }),

  saveMarkers: publicProcedure
    .input(
      z.object({
        id: z.string(),
        version: z.number().int(),
        width: z.number().positive(),
        height: z.number().positive(),
        reference: z.array(point).length(4),
        main: z.array(point).length(4),
        /** Marked image with the corners numbered, in the order sent above. */
        annotated: z
          .instanceof(File)
          .refine((f) => f.size <= MAX_IMAGE_BYTES, "Image too large")
          .refine((f) => ALLOWED_IMAGE_TYPES.includes(f.type)),
      }),
    )
    .handler(async ({ input, context }) => {
      const key = markedKey(input.id, input.version);
      const head = await context.images.head(key);
      const raw = head?.customMetadata?.pending;
      if (!raw) throw new ORPCError("NOT_FOUND");
      const pending = JSON.parse(raw) as PendingMarkers;

      const detectedReference = orderClockwise(input.reference);
      const mainCorners = orderClockwise(input.main);
      const ratings = await rateSides({
        bytes: new Uint8Array(await input.annotated.arrayBuffer()),
        contentType: input.annotated.type,
        apiKey: context.openaiApiKey,
        referenceName: pending.reference.name,
        mainName: pending.main.name,
      }).catch((error) => {
        console.error("Side rating failed", error);
        return { reference: UNRATED, main: UNRATED };
      });
      const { quad: referenceCorners, rebuilt } = rebuildHiddenCorner(
        detectedReference,
        ratings.reference.map((r) => r.priority) as Priorities,
      );
      const { mainSidesMm, referenceSidesMm, ...size } = measureOnPlane(
        referenceCorners,
        [pending.reference.widthMm, pending.reference.heightMm],
        mainCorners,
        ratings.main.map((r) => r.priority) as Priorities,
      );
      const analysis: Analysis = {
        imageWidth: input.width,
        imageHeight: input.height,
        main: {
          name: pending.main.name,
          corners: mainCorners,
          ...size,
          edges: toEdges(mainCorners, mainSidesMm, ratings.main),
        },
        reference: {
          ...pending.reference,
          corners: referenceCorners,
          edges: toEdges(referenceCorners, referenceSidesMm, ratings.reference),
          ...(rebuilt === null ? {} : { rebuiltCorner: rebuilt + 1 }),
        },
        notes: pending.notes,
        model: `${MODEL} + ${IMAGE_MODEL}`,
        durationMs: pending.durationMs,
        markedVersion: input.version,
      };
      const [updated] = await context.db
        .update(images)
        .set({ analysis })
        .where(eq(images.id, input.id))
        .returning();
      if (!updated) throw new ORPCError("NOT_FOUND");
      return updated;
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const [row] = await context.db.select().from(images).where(eq(images.id, input.id));
      if (!row) throw new ORPCError("NOT_FOUND");
      const marked = await context.images.list({ prefix: `marked/${row.id}/` });
      await context.images.delete([row.key, ...marked.objects.map((o) => o.key)]);
      await context.db.delete(images).where(eq(images.id, input.id));
      return { id: input.id };
    }),
};
