import { BlockList, isIP } from "node:net";

/**
 * Builds a `net.BlockList` from a comma-separated list of IPs and CIDR
 * ranges (IPv4 and IPv6). Invalid entries throw so a typo in an allow or
 * deny list prevents startup rather than silently changing what is blocked.
 *
 * @param entries - Comma-separated addresses/ranges, e.g.
 *   `"10.0.0.0/8, 192.168.1.5, 2001:db8::/32"`.
 * @returns The populated list, or `undefined` when the input is empty.
 */
export function buildIpList(entries: string): BlockList | undefined {
  const items = entries
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (items.length === 0) return undefined;

  const list = new BlockList();
  for (const item of items) {
    const [address, prefix, ...rest] = item.split("/");
    const family = isIP(address) === 4 ? "ipv4" : isIP(address) === 6 ? "ipv6" : undefined;
    if (!family || rest.length > 0) {
      throw new Error(`Invalid IP list entry "${item}"; expected an IP or CIDR range`);
    }

    if (prefix === undefined) {
      list.addAddress(address, family);
      continue;
    }

    const bits = Number(prefix);
    const maxBits = family === "ipv4" ? 32 : 128;
    if (!Number.isInteger(bits) || bits < 0 || bits > maxBits) {
      throw new Error(`Invalid CIDR prefix in IP list entry "${item}"`);
    }
    list.addSubnet(address, bits, family);
  }
  return list;
}

/**
 * Normalizes an IPv4-mapped IPv6 address (`::ffff:1.2.3.4`) to its IPv4
 * form so it matches IPv4 list entries.
 *
 * @param ip - The address as reported by the socket.
 * @returns The normalized address.
 */
export function normalizeIp(ip: string): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  return mapped && isIP(mapped[1]) === 4 ? mapped[1] : ip;
}
