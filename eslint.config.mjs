import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // UI → application service → Windsor service → MCP. Pages and components
    // must never reach the Windsor transport or cache directly.
    files: ["src/app/**", "src/components/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/server/windsor/service",
                "@/server/windsor/client",
                "@/server/windsor/*-transport",
                "@/server/cache/*",
                "@modelcontextprotocol/*",
              ],
              message: "Use an application service in src/server/services instead of calling Windsor directly.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
