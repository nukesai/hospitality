import {
  healthCheck,
  healthInput,
  healthOutput,
  posTrpc,
  publicProcedure,
} from "@nukesai-pos/backend/trpc";

export const healthRouter = posTrpc.router({
  check: publicProcedure
    .meta({ openapi: { method: "GET", path: "/health", tags: ["system"] } })
    .input(healthInput)
    .output(healthOutput) // .output() REQUIRED for OpenAPI procedures
    .query(({ input }) => healthCheck(input)),
});
