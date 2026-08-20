import { z } from "zod";

export const healthInput: z.ZodType<{ echo?: string | undefined }> = z.object({
  echo: z.string().max(120).optional(),
});

export interface HealthResult {
  readonly ok: boolean;
  readonly service: string;
  readonly echo: string | null;
}

export const healthOutput: z.ZodType<HealthResult> = z.object({
  ok: z.boolean(),
  service: z.string(),
  echo: z.string().nullable(),
});

/** OpenAPI-exposed: wire-safe output only (no dates, no undefined). */
export function healthCheck(input: { readonly echo?: string | undefined }): HealthResult {
  return { ok: true, service: "nukesai-pos-backend", echo: input.echo ?? null };
}
