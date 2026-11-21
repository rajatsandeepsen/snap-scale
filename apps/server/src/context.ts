import type { Context as ApiContext } from "@snap-scale/api/context";
import type { Context as HonoContext } from "hono";

import { ENV } from "./env.server";
import { getDb } from "./services";

export type CreateContextOptions = {
  context: HonoContext;
};

export async function createContext(_options: CreateContextOptions): Promise<ApiContext> {
  const db = await getDb();
  return {
    db,
    images: ENV.IMAGES,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
