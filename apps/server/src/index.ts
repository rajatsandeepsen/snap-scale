import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { MAX_IMAGE_BYTES } from "@snap-scale/api/routers/images";
import { appRouter } from "@snap-scale/api/routers/index";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { createContext } from "./context";
import { ENV } from "./env.server";
import { getDb } from "./services";

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: ENV.CORS_ORIGIN || "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
  }),
);
app.use(
  "/*",
  bodyLimit({
    maxSize: MAX_IMAGE_BYTES + 1024 * 1024,
    onError: (c) => c.text("Payload too large", 413),
  }),
);

export const apiHandler = new OpenAPIHandler(appRouter, {
  plugins: [
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }),
  ],
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

export const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

app.use("/*", async (c, next) => {
  const context = await createContext({ context: c });

  const rpcResult = await rpcHandler.handle(c.req.raw, {
    prefix: "/rpc",
    context: context,
  });

  if (rpcResult.matched) {
    return c.newResponse(rpcResult.response.body, rpcResult.response);
  }

  const apiResult = await apiHandler.handle(c.req.raw, {
    prefix: "/api-reference",
    context: context,
  });

  if (apiResult.matched) {
    return c.newResponse(apiResult.response.body, apiResult.response);
  }

  await next();
});

app.get("/images/:id", async (c) => {
  const row = await getDb().query.images.findFirst({
    where: { id: c.req.param("id") },
  });
  if (!row) return c.notFound();
  const onlyIf = new Headers();
  for (const name of ["if-none-match", "if-modified-since"]) {
    const value = c.req.header(name);
    if (value) onlyIf.set(name, value);
  }
  const object = await ENV.IMAGES.get(row.key, { onlyIf });
  if (!object) return c.notFound();
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "private, no-cache");
  if (!("body" in object)) return new Response(null, { status: 304, headers });
  return new Response(object.body, { headers });
});

app.get("/", (c) => {
  return c.text("OK");
});

export default app;
