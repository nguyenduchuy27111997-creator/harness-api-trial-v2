import { z } from "zod";

// Environment, parsed once at the edge (golden principle 1).
export const env = z
  .object({
    DATABASE_URL: z.string().url(),
    PORT: z.coerce.number().int().default(3400),
  })
  .parse(process.env);
