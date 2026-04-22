/**
 * Plugin Base Class
 *
 * Provides default implementation for plugins, plugins can inherit from this class
 */

import {
  IPlugin,
  PluginMetadata,
  Capability,
} from './types';

export abstract class BasePlugin implements IPlugin {
  protected config: Record<string, unknown> = {};
  protected metadata: PluginMetadata;

  constructor(
    metadata: Omit<PluginMetadata, 'capabilities'> & {
      capabilities?: Capability[];
    },
  ) {
    this.metadata = {
      capabilities: [],
      ...metadata,
    };
  }

  getMetadata(): PluginMetadata {
    return this.metadata;
  }

  getConfig(): Record<string, unknown> {
    return this.config;
  }

  setConfig(config: Record<string, unknown>): void {
    this.config = config;
  }

  validateConfig(_config: Record<string, unknown>): {
    valid: boolean;
    errors?: string[];
  } {
    return { valid: true };
  }

  hasCapability(capability: Capability): boolean {
    return this.metadata.capabilities.includes(capability);
  }

  // Optional lifecycle hooks
  async initialize?(): Promise<void> {}
  async destroy?(): Promise<void> {}

  abstract testConnection(): Promise<{ success: boolean; message?: string }>;
}

/**
 * Capability-based plugin base class
 * Type-safe implementation of specific capabilities
 */
export abstract class CapabilityPlugin<
  T extends Record<Capability, unknown>
> extends BasePlugin {
  protected capabilityImpl: Partial<T> = {};

  /**
   * Register capability implementation
   */
  protected registerCapability<K extends keyof T>(
    capability: K,
    implementation: T[K]
  ): void {
    this.capabilityImpl[capability] = implementation;
    if (!this.metadata.capabilities.includes(capability as Capability)) {
      this.metadata.capabilities.push(capability as Capability);
    }
  }

  /**
   * Get capability implementation
   */
  getCapability<K extends keyof T>(capability: K): T[K] | undefined {
    return this.capabilityImpl[capability] as T[K] | undefined;
  }
}
