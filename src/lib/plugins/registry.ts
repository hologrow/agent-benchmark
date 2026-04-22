/**
 * Plugin Registry - Capability Mode
 *
 * Responsible for managing all plugin registration, discovery and config management
 */

import { IPlugin, PluginMetadata, PluginConfig, Capability, CapabilityType } from './types';

/**
 * Plugin Registry
 */
class PluginRegistry {
  private plugins: Map<string, IPlugin> = new Map();
  private configs: Map<string, PluginConfig> = new Map();

  /**
   * Register plugin
   * @param plugin Plugin instance
   */
  register(plugin: IPlugin): void {
    const metadata = plugin.getMetadata();

    if (this.plugins.has(metadata.id)) {
      console.warn(`[PluginRegistry] Plugin ${metadata.id} already exists, will be overwritten`);
    }

    this.plugins.set(metadata.id, plugin);
    console.log(`[PluginRegistry] Plugin registered: ${metadata.name} (${metadata.id})`);
  }

  /**
   * Register plugin class
   * @param PluginClass Plugin class
   */
  registerClass(PluginClass: new () => IPlugin): void {
    const plugin = new PluginClass();
    this.register(plugin);
  }

  /**
   * Get all registered plugins
   */
  getAllPlugins(): IPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get plugin by ID
   */
  getPlugin(id: string): IPlugin | undefined {
    return this.plugins.get(id);
  }

  /**
   * Get plugin metadata
   */
  getPluginMetadata(id: string): PluginMetadata | undefined {
    const plugin = this.plugins.get(id);
    return plugin?.getMetadata();
  }

  /**
   * Get all plugin metadata
   */
  getAllMetadata(): PluginMetadata[] {
    return this.getAllPlugins().map((p) => p.getMetadata());
  }

  /**
   * Check if plugin exists
   */
  hasPlugin(id: string): boolean {
    return this.plugins.has(id);
  }

  // ========== Capability Queries ==========

  /**
   * Get all plugins supporting specified capability
   */
  getPluginsByCapability(capability: Capability): IPlugin[] {
    return this.getAllPlugins().filter((p) => p.hasCapability(capability));
  }

  /**
   * Get enabled plugins supporting specified capability
   */
  getEnabledPluginsByCapability(capability: Capability): IPlugin[] {
    return this.getEnabledPlugins().filter((p) => p.hasCapability(capability));
  }

  /**
   * Get first enabled plugin supporting specified capability
   */
  getFirstEnabledPluginByCapability<T extends Capability>(
    capability: T
  ): (IPlugin & CapabilityType<T>) | undefined {
    const plugin = this.getEnabledPlugins().find((p) => p.hasCapability(capability));
    return plugin as (IPlugin & CapabilityType<T>) | undefined;
  }

  // ========== Config Management ==========

  /**
   * Load plugin config
   */
  loadConfig(pluginId: string, enabled: boolean, config: Record<string, unknown>): void {
    this.configs.set(pluginId, { pluginId, enabled, config });

    // Also update plugin instance config
    const plugin = this.plugins.get(pluginId);
    if (plugin) {
      plugin.setConfig(config);
    }
  }

  /**
   * Get plugin config
   */
  getConfig(pluginId: string): PluginConfig | undefined {
    return this.configs.get(pluginId);
  }

  /**
   * Check if plugin is enabled
   */
  isEnabled(pluginId: string): boolean {
    const config = this.configs.get(pluginId);
    return config?.enabled ?? false;
  }

  /**
   * Get enabled plugins
   */
  getEnabledPlugins(): IPlugin[] {
    return this.getAllPlugins().filter((p) => {
      const config = this.configs.get(p.getMetadata().id);
      return config?.enabled ?? false;
    });
  }

  /**
   * Validate plugin config
   */
  validateConfig(pluginId: string, config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      return { valid: false, errors: ['Plugin does not exist'] };
    }
    return plugin.validateConfig(config);
  }

  /**
   * Test plugin connection
   */
  async testConnection(pluginId: string): Promise<{ success: boolean; message?: string }> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      return { success: false, message: 'Plugin does not exist' };
    }

    try {
      return await plugin.testConnection();
    } catch (error) {
      return {
        success: false,
        message: `Test failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Initialize all enabled plugins
   */
  async initializeEnabledPlugins(): Promise<void> {
    const enabledPlugins = this.getEnabledPlugins();
    for (const plugin of enabledPlugins) {
      if (plugin.initialize) {
        try {
          await plugin.initialize();
          console.log(`[PluginRegistry] Plugin initialized: ${plugin.getMetadata().id}`);
        } catch (error) {
          console.error(`[PluginRegistry] Plugin initialization failed: ${plugin.getMetadata().id}`, error);
        }
      }
    }
  }
}

// Export singleton instance
export const pluginRegistry = new PluginRegistry();
