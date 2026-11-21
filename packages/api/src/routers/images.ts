import { ORPCError } from "@orpc/server";
import type { Analysis } from "@snap-scale/db/schema/images";
import { images, referenceObjects } from "@snap-scale/db/schema/index";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { publicProcedure } from "../index";
import {
  type Identification,
  identifyObjects,
  MeasureError,
  MODEL,
} from "../measure/analyze";
import { measureOnPlane, orderClockwise } from "../measure/geometry";
import { drawMarkers, IMAGE_MODEL } from "../measure/markers";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

// Each measure run writes its own copy so overlapping runs cannot mix.
export const markedKey = (id: string, version: number) =>
  `marked/${id}/${version}.png`;

type PendingMarkers = Identification & { durationMs: number };

const point = z.tuple([z.number(), z.number()]);

export const imagesRouter = {
  upload: publicProcedure
    .input(
      z.object({
        file: z
          .instanceof(File)
          .refine(
            (f) => f.size <= MAX_IMAGE_BYTES,
            "Image must be 10 MB or smaller",
          )
          .refine(
            (f) => ALLOWED_IMAGE_TYPES.includes(f.type),
            "Unsupported image type",
          ),
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

  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const [row] = await context.db
        .select()
        .from(images)
        .where(eq(images.id, input.id));
      if (!row) throw new ORPCError("NOT_FOUND");
      return row;
    }),

  /** gpt-5 names the objects, gpt-image draws marker dots; the browser then finds the dots. */
  measure: publicProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const [row] = await context.db
        .select()
        .from(images)
        .where(eq(images.id, input.id));
      if (!row) throw new ORPCError("NOT_FOUND");
      const object = await context.images.get(row.key);
      if (!object) throw new ORPCError("NOT_FOUND");
      const bytes = new Uint8Array(await object.arrayBuffer());

      const started = Date.now();
      let identification: Identification;
      try {
        identification = await identifyObjects({
          bytes,
          contentType: row.contentType,
          catalog: await context.db.select().from(referenceObjects),
          apiKey: context.openaiApiKey,
        });
      } catch (error) {
        if (error instanceof MeasureError) {
          throw new ORPCError("UNPROCESSABLE_CONTENT", {
            message: error.message,
          });
        }
        throw error;
      }
      const marked = await drawMarkers({
        bytes,
        contentType: row.contentType,
        apiKey: context.openaiApiKey,
        referenceName: identification.reference.name,
        mainName: identification.main.name,
      });
      const pending: PendingMarkers = {
        ...identification,
        durationMs: Date.now() - started,
      };
      const version = Date.now();
      await context.images.put(markedKey(row.id, version), marked, {
        httpMetadata: { contentType: "image/png" },
        customMetadata: { pending: JSON.stringify(pending) },
      });
      return { ...pending, version };
    }),

  /** Saves the dot positions the browser found; the size is computed here. */
  saveMarkers: publicProcedure
    .input(
      z.object({
        id: z.string(),
        version: z.number().int(),
        width: z.number().positive(),
        height: z.number().positive(),
        reference: z.array(point).length(4),
        main: z.array(point).length(4),
      }),
    )
    .handler(async ({ input, context }) => {
      const key = markedKey(input.id, input.version);
      const head = await context.images.head(key);
      const raw = head?.customMetadata?.pending;
      if (!raw) throw new ORPCError("NOT_FOUND");
      const pending = JSON.parse(raw) as PendingMarkers;

      const referenceCorners = orderClockwise(input.reference);
      const mainCorners = orderClockwise(input.main);
      const analysis: Analysis = {
        imageWidth: input.width,
        imageHeight: input.height,
        main: {
          name: pending.main.name,
          corners: mainCorners,
          ...measureOnPlane(
            referenceCorners,
            [pending.reference.widthMm, pending.reference.heightMm],
            mainCorners,
          ),
        },
        reference: { ...pending.reference, corners: referenceCorners },
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
      const [row] = await context.db
        .select()
        .from(images)
        .where(eq(images.id, input.id));
      if (!row) throw new ORPCError("NOT_FOUND");
      const marked = await context.images.list({ prefix: `marked/${row.id}/` });
      await context.images.delete([
        row.key,
        ...marked.objects.map((o) => o.key),
      ]);
      await context.db.delete(images).where(eq(images.id, input.id));
      return { id: input.id };
    }),
};
