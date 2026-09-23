import "server-only";
import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DATA_SOURCE: z.enum(["windsor", "demo"]).default("demo"),
  WINDSOR_API_KEY: z.string().optional(),
  WINDSOR_MCP_URL: z.string().url().default("https://mcp.windsor.ai/"),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = EnvSchema.parse(process.env);
    if (parsed.DATA_SOURCE === "windsor" && !parsed.WINDSOR_API_KEY) {
      throw new Error("DATA_SOURCE=windsor requires WINDSOR_API_KEY");
    }
    cached = parsed;
  }
  return cached;
}
