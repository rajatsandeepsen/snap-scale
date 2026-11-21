import type { Database } from "@snap-scale/db";

export type Context = {
  db: Database;
  images: R2Bucket;
};
