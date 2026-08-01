import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/**
 * Compares two secrets in constant time. Both inputs are hashed first, so
 * comparison cost is independent of their content and length — a mismatch
 * reveals nothing about the expected value, including how long it is.
 *
 * @param a - First value.
 * @param b - Second value.
 * @returns `true` when the values are equal.
 */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}
