/**
 * Plugin Loader
 *
 * Responsible for loading and initializing all plugins at app startup.
 * Built-in plugins: directory layout under `built-in/<id>/` (see fs scan + registry below).
 */

import { existsSync, readdirSync } from "fs";
import { join } from "path";
import type { IPlugin } from "./types";
import { builtInPluginEntry as langfuseEntry } from "./built-in/langfuse/index";
import { builtInPluginEntry as larkEntry } from "./built-in/lark/index";
import { pluginRegistry } from "./registry";
import { getAllIntegrations } from "../db";
import { registerPluginHttpHandler } from "./registerRoutes";

/** Bundled factory for register / ensure helpers. */
export type BuiltInPluginFactory = { id: string; create: () => IPlugin };

const BUILT_IN_REGISTRY: Record<string, BuiltInPluginFactory> = {
  lark: larkEntry,
  langfuse: langfuseEntry,
};

const BUILT_IN_LAYOUT_ROOT = join(process.cwd(), "src/lib/plugins/built-in");

/**
 * `built-in/<name>/` 下的子目录名（与 {@link BUILT_IN_LAYOUT_ROOT} 扫描规则一致）。
 * 开发环境有 `src/` 时走磁盘；否则回退为 {@link BUILT_IN_REGISTRY} 的 id（如 standalone 无源码树）。
 */
export function getBuiltInPluginLayoutDirNames(): string[] {
  const dirNames = existsSync(BUILT_IN_LAYOUT_ROOT)
    ? readdirSync(BUILT_IN_LAYOUT_ROOT, { withFileTypes: true })
        .filter(
          (d) =>
            d.isDirectory() &&
            !d.name.startsWith("_") &&
            d.name !== "node_modules",
        )
        .map((d) => d.name)
    : Object.keys(BUILT_IN_REGISTRY);
  return [...dirNames].sort();
}

export async function loadBuiltInPluginHttpRoutesFromLayout(): Promise<void> {
  for (const name of getBuiltInPluginLayoutDirNames()) {
    try {
      const handler = await import(`./built-in/${name}/routes`);
      registerPluginHttpHandler(name, handler.default || handler);
    } catch (e) {
      const err = e as NodeJS.ErrnoException & { message?: string };
      const notFound =
        err?.code === "MODULE_NOT_FOUND" ||
        err?.code === "ERR_MODULE_NOT_FOUND" ||
        (typeof err?.message === "string" &&
          err.message.includes("Cannot find module"));
      if (notFound) {
        continue;
      }
      console.warn(
        `[PluginLoader] plugin-http-routes for "${name}" failed:`,
        e,
      );
    }
  }
}

/**
 * Ordered list: directory names from fs (when cwd has `src/`), intersected with {@link BUILT_IN_REGISTRY}.
 */
export function getBuiltInPluginFactoriesFromLayout(): BuiltInPluginFactory[] {
  const dirNames = getBuiltInPluginLayoutDirNames();

  const list: BuiltInPluginFactory[] = [];
  for (const name of dirNames) {
    const factory = BUILT_IN_REGISTRY[name];
    if (!factory) {
      console.warn(
        `[PluginLoader] Built-in folder "${name}" is not registered in loader.ts BUILT_IN_REGISTRY — add import and entry`,
      );
      continue;
    }
    list.push(factory);
  }
  return list;
}

/**
 * Register all built-in plugins (overwrites registry entries for these ids).
 * Used by {@link setupPlugins} at server startup.
 */
export function registerBuiltInPlugins(): void {
  console.log("[PluginLoader] Registering built-in plugins...");

  for (const { create } of getBuiltInPluginFactoriesFromLayout()) {
    pluginRegistry.register(create());
  }

  console.log("[PluginLoader] Built-in plugins registered");
}

/**
 * Idempotent: register each built-in only if missing.
 * Use in API routes when instrumentation may not have run (e.g. cold isolate).
 */
export function ensureBuiltInPluginsRegistered(): void {
  for (const { id, create } of getBuiltInPluginFactoriesFromLayout()) {
    if (!pluginRegistry.hasPlugin(id)) {
      pluginRegistry.register(create());
    }
  }
}

/**
 * Load plugin configs from database
 */
export function loadPluginConfigsFromDatabase(): void {
  console.log("[PluginLoader] Loading plugin configs from database...");

  try {
    const integrations = getAllIntegrations();

    for (const integration of integrations) {
      // Load integration as plugin config
      try {
        const config = JSON.parse(integration.config || "{}");
        pluginRegistry.loadConfig(
          integration.type,
          integration.enabled === 1,
          config,
        );
        console.log(
          `[PluginLoader] Config loaded: ${integration.name} (${integration.type}), enabled=${integration.enabled === 1}`,
        );
      } catch (e) {
        console.error(
          `[PluginLoader] Failed to load config: ${integration.type}`,
          e,
        );
      }
    }
  } catch (error) {
    console.error(
      "[PluginLoader] Failed to load configs from database:",
      error,
    );
  }
}

/**
 * Initialize all enabled plugins
 */
export async function initializePlugins(): Promise<void> {
  console.log("[PluginLoader] Initializing enabled plugins...");
  await pluginRegistry.initializeEnabledPlugins();
  console.log("[PluginLoader] Plugins initialized");
}

/**
 * Complete plugin loading process
 */
export async function setupPlugins(): Promise<void> {
  registerBuiltInPlugins();
  loadPluginConfigsFromDatabase();
  await initializePlugins();
}
