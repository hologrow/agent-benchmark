import {
  loadBuiltInPluginHttpRoutesFromLayout,
  setupPlugins,
} from "@/lib/plugins";

/** Runs after dynamic import from instrumentation.ts (Node runtime only). */
export async function runNodeInstrumentation() {
  try {
    await setupPlugins();
    await loadBuiltInPluginHttpRoutesFromLayout();
  } catch (error) {
    console.error("[Instrumentation] setupPlugins failed:", error);
  }
  console.log("[Instrumentation] done");
}
