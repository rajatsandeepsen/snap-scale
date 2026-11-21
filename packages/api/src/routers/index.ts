import type { RouterClient } from "@orpc/server";

import { publicProcedure } from "../index";
import { imagesRouter } from "./images";

export const appRouter = {
  healthCheck: publicProcedure.handler(() => {
    return "OK";
  }),
  images: imagesRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
