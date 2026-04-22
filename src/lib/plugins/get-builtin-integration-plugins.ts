import "server-only";

import { cache } from "react";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import type { BuiltinIntegrationPluginMeta } from "./builtin-integration-plugins.types";

/**
 * Reads `integration.schema.json` from each `built-in/<plugin>/` directory.
 * App Router has no `getStaticProps`; this runs on the server when the RSC tree
 * renders (including at build time for static pages), then data is passed as props
 * into client components — same idea as getStaticProps + props, different API.
 */
export const getBuiltinIntegrationPlugins = cache(
  function getBuiltinIntegrationPlugins(): BuiltinIntegrationPluginMeta[] {
    const builtInDir = join(process.cwd(), "src/lib/plugins/built-in");
    const plugins: BuiltinIntegrationPluginMeta[] = [];

    if (!existsSync(builtInDir)) {
      return plugins;
    }

    for (const name of readdirSync(builtInDir)) {
      const dir = join(builtInDir, name);
      if (!statSync(dir).isDirectory()) continue;
      const schemaPath = join(dir, "integration.schema.json");
      if (!existsSync(schemaPath)) continue;

      let parsed: unknown;
      try {
        parsed = JSON.parse(readFileSync(schemaPath, "utf8"));
      } catch (e) {
        throw new Error(`Invalid JSON: ${schemaPath}: ${e}`);
      }
      if (!parsed || typeof parsed !== "object") {
        throw new Error(`Invalid schema root: ${schemaPath}`);
      }
      const o = parsed as Record<string, unknown>;
      if (
        typeof o.id !== "string" ||
        typeof o.name !== "string" ||
        !Array.isArray(o.configFields)
      ) {
        throw new Error(
          `integration.schema.json missing id, name, or configFields[]: ${schemaPath}`,
        );
      }
      plugins.push(parsed as BuiltinIntegrationPluginMeta);
    }

    plugins.sort((a, b) => a.id.localeCompare(b.id));
    return plugins;
  },
);
