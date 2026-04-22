import { getBuiltinIntegrationPlugins } from "@/lib/plugins/get-builtin-integration-plugins";
import { SettingsPageClient } from "./settings-page-client";

export default function SettingsPage() {
  const builtinPlugins = getBuiltinIntegrationPlugins();
  return <SettingsPageClient builtinPlugins={builtinPlugins} />;
}
