/** Shared shape for integration settings UI (server-loaded registry + client form). */

export type BuiltinIntegrationConfigFieldType =
  | "text"
  | "password"
  | "url"
  | "select"
  | "textarea";

export interface BuiltinIntegrationConfigField {
  name: string;
  label: string;
  type: BuiltinIntegrationConfigFieldType;
  required?: boolean;
  defaultValue?: string | number | boolean;
  placeholder?: string;
  description?: string;
  options?: { label: string; value: string }[];
}

export interface BuiltinIntegrationPluginMeta {
  id: string;
  name: string;
  description: string;
  icon: string;
  capabilities: string[];
  /** Optional “learn more” link in the configure dialog */
  docsUrl?: string;
  configFields: BuiltinIntegrationConfigField[];
}
