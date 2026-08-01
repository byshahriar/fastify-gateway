import type { configSchema } from "@/config/schema";

type SchemaProperties = (typeof configSchema)["properties"];

/**
 * Typed view of the validated configuration, derived from the config schema.
 * Adding a property to the schema updates this type automatically.
 */
export type GatewayConfig = {
  -readonly [K in keyof SchemaProperties]: SchemaProperties[K]["type"] extends "number"
    ? number
    : SchemaProperties[K]["type"] extends "boolean"
      ? boolean
      : string;
};
