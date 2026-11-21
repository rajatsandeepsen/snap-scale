import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Alchemy from "alchemy";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import "varlock/auto-load";

export const db = Cloudflare.D1.Database("database", {
  migrations: "../../packages/db/src/migrations",
});

export const images = Cloudflare.R2.Bucket("images");

export const server = Cloudflare.Worker("server", {
  main: "../../apps/server/src/index.ts",
  compatibility: {
    flags: ["nodejs_compat"],
  },
  env: {
    DB: db,
    IMAGES: images,
    CORS_ORIGIN: Config.String("CORS_ORIGIN").pipe(Config.withDefault("*")),
    OPENAI_API_KEY: Config.Redacted("OPENAI_API_KEY"),
  },
  dev: {
    port: 3000,
  },
});

export type ServerEnv = Cloudflare.InferEnv<typeof server>;

export default Alchemy.Stack(
  "snap-scale",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const serverWorker = yield* server;
    // In prod, take over the Worker that Workers Builds created so the app is
    // served at snap-scale.<subdomain>.workers.dev.
    const prod = (yield* Alchemy.Stage) === "prod";
    const webWorker = yield* Cloudflare.Website.Vite("web", {
      ...(prod ? { name: "snap-scale" } : {}),
      rootDir: "../../apps/web",
      compatibility: {
        flags: ["nodejs_compat"],
      },
      env: {
        VITE_SERVER_URL: serverWorker.url.as<string>(),
      },
      dev: {
        port: 5173,
      },
    }).pipe(Alchemy.AdoptPolicy.adopt(prod));

    return {
      web: webWorker.url,
      server: serverWorker.url,
    };
  }),
);
