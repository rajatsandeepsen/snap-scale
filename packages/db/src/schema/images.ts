import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export type Point = [x: number, y: number];

export type Analysis = {
  imageWidth: number;
  imageHeight: number;
  main: {
    name: string;
    corners: Point[];
    lengthMm: number;
    widthMm: number;
  };
  reference: {
    name: string;
    source: "catalog" | "web";
    widthMm: number;
    heightMm: number;
    corners: Point[];
  };
  notes: string;
  model: string;
  durationMs: number;
  /** Version of the gpt-image copy with marker dots; corners are in its pixels. */
  markedVersion?: number;
};

export const images = sqliteTable("images", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  analysis: text("analysis", { mode: "json" }).$type<Analysis>(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type Image = typeof images.$inferSelect;

export const referenceObjects = sqliteTable("reference_objects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  aliases: text("aliases").notNull().default(""),
  shape: text("shape", { enum: ["rect", "circle"] }).notNull(),
  widthMm: real("width_mm").notNull(),
  heightMm: real("height_mm").notNull(),
});

export type ReferenceObject = typeof referenceObjects.$inferSelect;
