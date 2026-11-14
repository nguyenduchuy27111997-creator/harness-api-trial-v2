import { z } from "@hono/zod-openapi";

export const LimitSchema = z
  .string()
  .regex(/^\d+$/, "must be an integer from 1 to 100")
  .transform(Number)
  .refine((n) => n >= 1 && n <= 100, "must be an integer from 1 to 100")
  .optional();

const CursorShape = z.object({
  c: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/),
  i: z.uuid(),
});
export type Cursor = z.infer<typeof CursorShape>;

export const encodeCursor = (c: Cursor) => Buffer.from(JSON.stringify({ c: c.c, i: c.i })).toString("base64url");

// Returns null when the text is not a cursor this API made.
export function decodeCursor(text: string): Cursor | null {
  try {
    const parsed = CursorShape.strict().safeParse(JSON.parse(Buffer.from(text, "base64url").toString("utf8")));
    if (!parsed.success) return null;
    // Date.parse accepts impossible dates (2024-02-31), so require an exact round-trip.
    const ms = parsed.data.c.slice(0, 23);
    const d = new Date(`${ms}Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString() !== `${ms}Z`) return null;
    return parsed.data;
  } catch {
    return null;
  }
}
