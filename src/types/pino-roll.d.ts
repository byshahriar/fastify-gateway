/**
 * Minimal typing for `pino-roll`, which ships no type definitions. Its
 * default export is the transport factory: an async function resolving to
 * the rotating-file destination stream, usable both as a worker transport
 * target and directly in-process (the multi-channel logger does the latter).
 */
declare module "pino-roll" {
  import type { DestinationStream } from "pino";

  interface PinoRollOptions {
    /**
     * Base file path; rotated files are suffixed with the rotation index.
     */
    file: string;
    /**
     * Time-based rotation interval, e.g. `"daily"`, `"hourly"`.
     */
    frequency?: string;
    /**
     * Size-based rotation threshold, e.g. `"10m"`.
     */
    size?: string;
    /**
     * Retention: number of most recent rotated files to keep.
     */
    limit?: { count: number };
    /**
     * Creates the destination directory if it does not exist.
     */
    mkdir?: boolean;
    /**
     * Date format used in rotated file names.
     */
    dateFormat?: string;
  }

  export default function pinoRoll(options: PinoRollOptions): Promise<DestinationStream>;
}
