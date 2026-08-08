/**
 * Minimal typing for `pino-roll`, which ships no type definitions. Its
 * default export is the transport factory: an async function resolving to
 * the rotating-file destination stream, usable both as a worker transport
 * target and directly in-process (the multi-channel logger does the latter).
 */
declare module "pino-roll" {
  import type { DestinationStream } from "pino";

  interface PinoRollOptions {
    file: string;
    frequency?: string;
    size?: string;
    limit?: { count: number };
    mkdir?: boolean;
    dateFormat?: string;
  }

  export default function pinoRoll(options: PinoRollOptions): Promise<DestinationStream>;
}
