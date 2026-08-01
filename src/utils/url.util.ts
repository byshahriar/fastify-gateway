/**
 * Returns a URL safe to log: any embedded userinfo (`user:pass@`) is removed.
 * A service URL configured as `https://user:pass@host` would otherwise leak
 * credentials into the boot log.
 *
 * @param raw - The URL to sanitize.
 * @returns The URL without userinfo, or the input unchanged if unparseable.
 */
export function redactUrlCredentials(raw: string): string {
  try {
    const url = new URL(raw);
    if (!url.username && !url.password) return raw;
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return raw;
  }
}
