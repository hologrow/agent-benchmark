import { NextResponse } from "next/server";
import { pluginRegistry } from "@/lib/plugins";
import { ensureBuiltInPluginsRegistered } from "@/lib/plugins/loader";
import { Capability } from "@/lib/plugins/types";
import { getAllIntegrations } from "@/lib/db";

// GET /api/plugins/discover - Discover all available plugin capabilities
export async function GET() {
  try {
    ensureBuiltInPluginsRegistered();

    // Load config from database (same source as PluginLoader.loadPluginConfigsFromDatabase)
    const integrations = getAllIntegrations();
    for (const integration of integrations) {
      try {
        const config = JSON.parse(integration.config || "{}");
        pluginRegistry.loadConfig(
          integration.type,
          integration.enabled === 1,
          config,
        );
      } catch (e) {
        console.error(
          `[PluginDiscover] Failed to load config: ${integration.type}`,
          e,
        );
      }
    }

    // Get all enabled plugins with IMPORT_TEST_CASES capability
    const importPlugins = pluginRegistry.getEnabledPluginsByCapability(
      Capability.IMPORT_TEST_CASES,
    );

    const importButtons = importPlugins
      .filter((plugin) => {
        return plugin.hasCapability(Capability.IMPORT_TEST_CASES);
      })
      .map((plugin) => {
        const metadata = plugin.getMetadata();
        // TODO: fixme
        const buttonUI = (plugin as any).getImportButtonUI();
        const dialogDef = (plugin as any).getImportDialog();

        if (!buttonUI) {
          return null;
        }

        return {
          pluginId: metadata.id,
          pluginName: metadata.name,
          ...buttonUI,
          dialog: dialogDef,
        };
      })
      .filter((btn): btn is NonNullable<typeof btn> => btn !== null);

    return NextResponse.json({
      capabilities: {
        importTestCases: importButtons,
      },
    });
  } catch (error) {
    console.error("[PluginDiscover] Failed to discover plugins:", error);
    return NextResponse.json(
      { error: "Failed to discover plugins" },
      { status: 500 },
    );
  }
}
