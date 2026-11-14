import { z } from "zod";

// Environment, parsed once at the edge (golden principle 1).
export const env = z
  .object({
    DATABASE_URL: z.string().url(),
    PORT: z.coerce.number().int().default(3400),
    // M2 per-token limits (docs/design/M2.md); only `npm run perf` overrides them.
    RATE_LIMIT_WRITE_PER_MIN: z.coerce.number().int().positive().default(60),
    RATE_LIMIT_READ_PER_MIN: z.coerce.number().int().positive().default(300),
  })
  .parse(process.env);
