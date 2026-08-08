/**
 * Readers for the handful of options consumed before `@fastify/env` runs (the
 * Fastify factory and the shutdown timer). Unlike schema-validated config, a
 * malformed value here would otherwise degrade silently — e.g. a non-numeric
 * `REQUEST_TIMEOUT_MS` coerces to `NaN`, which Fastify accepts as `0`,
 * disabling the slow-client timeout without any error. These readers fail
 * fast instead, matching the rest of the configuration.
 */

/**
 * Reads a finite, non-negative numeric environment variable.
 *
 * @param name - Environment variable name.
 * @param fallback - Value used when the variable is unset or empty.
 * @param min - Minimum accepted value (inclusive); defaults to 0.
 * @returns The parsed number.
 * @throws Error When the value is present but not a finite number `>= min`.
 */
export function envNumber(name: string, fallback: number, min = 0): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value) || value < min) {
    throw new Error(`Invalid ${name}: expected a number >= ${min}, got "${raw}"`);
  }
  return value;
}

/**
 * Reads an environment variable constrained to a fixed set of values.
 *
 * @param name - Environment variable name.
 * @param allowed - Accepted values.
 * @param fallback - Value used when the variable is unset or empty.
 * @returns The validated value.
 * @throws Error When the value is present but not in `allowed`.
 */
export function envEnum<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;

  if ((allowed as readonly string[]).includes(raw)) return raw as T;
  throw new Error(`Invalid ${name}: expected one of ${allowed.join(", ")}, got "${raw}"`);
}

/**
 * Reads a boolean environment variable accepting only `"true"` or `"false"`.
 *
 * @param name - Environment variable name.
 * @param fallback - Value used when the variable is unset or empty.
 * @returns The parsed boolean.
 * @throws Error When the value is present but not `"true"` or `"false"`.
 */
export function envBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;

  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new Error(`Invalid ${name}: expected "true" or "false", got "${raw}"`);
}
