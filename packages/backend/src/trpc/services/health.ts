import { z } from "zod";

export interface HealthInput {
  readonly echo?: string | undefined;
}

// BOTH generic params matter: z.ZodType<Output, Input> — leaving Input to its
// `unknown` default silently widens every tRPC .input() to unknown (the
// client-typing bug caught 2026-08-21 by router-types.type-test.ts).
export const healthInput: z.ZodType<HealthInput, HealthInput> = z.object({
  echo: z.string().max(120).optional(),
});

export interface HealthResult {
  readonly ok: boolean;
  readonly service: string;
  readonly echo: string | null;
}

export const healthOutput: z.ZodType<HealthResult, HealthResult> = z.object({
  ok: z.boolean(),
  service: z.string(),
  echo: z.string().nullable(),
});

/** OpenAPI-exposed: wire-safe output only (no dates, no undefined). */
export function healthCheck(input: { readonly echo?: string | undefined }): HealthResult {
  return { ok: true, service: "nukesai-pos-backend", echo: input.echo ?? null };
}
