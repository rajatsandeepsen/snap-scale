import { ORPCError } from "@orpc/server";
import { images, referenceObjects } from "@snap-scale/db/schema/index";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { publicProcedure } from "../index";
import { analyzeImage, MeasureError } from "../measure/analyze";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

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

      let analysis;
      try {
        analysis = await analyzeImage({
          bytes: new Uint8Array(await object.arrayBuffer()),
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
      const [updated] = await context.db
        .update(images)
        .set({ analysis })
        .where(eq(images.id, input.id))
        .returning();
      return updated!;
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const [row] = await context.db
        .select()
        .from(images)
        .where(eq(images.id, input.id));
      if (!row) throw new ORPCError("NOT_FOUND");
      await context.images.delete(row.key);
      await context.db.delete(images).where(eq(images.id, input.id));
      return { id: input.id };
    }),
};
