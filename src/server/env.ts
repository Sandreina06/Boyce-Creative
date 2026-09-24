import "server-only";
import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  // Real Windsor data by default. Demo data is for local development only.
  DATA_SOURCE: z.enum(["windsor", "demo"]).default("windsor"),
  ALLOW_DEMO_DATA: z.enum(["true", "false"]).default("false"),
  WINDSOR_API_KEY: z.string().optional(),
  WINDSOR_MCP_URL: z.string().url().default("https://mcp.windsor.ai/"),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = EnvSchema.parse(process.env);
    // Never serve synthetic numbers in production unless explicitly allowed.
    if (parsed.DATA_SOURCE === "demo" && process.env.NODE_ENV === "production" && parsed.ALLOW_DEMO_DATA !== "true") {
      console.warn("[env] DATA_SOURCE=demo ignored in production — using real Windsor data. Set ALLOW_DEMO_DATA=true to override.");
      parsed.DATA_SOURCE = "windsor";
    }
    if (parsed.DATA_SOURCE === "windsor" && !parsed.WINDSOR_API_KEY) {
      throw new Error(
        "Windsor API key is missing. Add WINDSOR_API_KEY in Railway → Boyce-Creative → Variables (real data only; no demo numbers are shown).",
      );
    }
    cached = parsed;
  }
  return cached;
}
