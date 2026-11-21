import { type Database, createDb } from "@snap-scale/db";

import { ENV } from "./env.server";

export function getDb(): Database {
  return createDb(ENV);
}
