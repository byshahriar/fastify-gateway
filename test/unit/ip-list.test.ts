import { describe, expect, it } from "vitest";
import { buildIpList, normalizeIp } from "@/utils";

describe("buildIpList", () => {
  it("returns undefined for empty input", () => {
    expect(buildIpList("")).toBeUndefined();
    expect(buildIpList("  ,  ")).toBeUndefined();
  });

  it("matches plain IPv4 addresses", () => {
    const list = buildIpList("192.0.2.7, 192.0.2.8");
    expect(list?.check("192.0.2.7", "ipv4")).toBe(true);
    expect(list?.check("192.0.2.9", "ipv4")).toBe(false);
  });

  it("matches IPv4 CIDR ranges", () => {
    const list = buildIpList("10.0.0.0/8");
    expect(list?.check("10.255.1.2", "ipv4")).toBe(true);
    expect(list?.check("11.0.0.1", "ipv4")).toBe(false);
  });

  it("matches IPv6 addresses and ranges", () => {
    const list = buildIpList("2001:db8::/32, ::1");
    expect(list?.check("2001:db8::42", "ipv6")).toBe(true);
    expect(list?.check("::1", "ipv6")).toBe(true);
    expect(list?.check("2001:db9::1", "ipv6")).toBe(false);
  });

  it("rejects malformed entries", () => {
    expect(() => buildIpList("not-an-ip")).toThrow(/Invalid IP list entry/);
    expect(() => buildIpList("10.0.0.0/8/2")).toThrow(/Invalid IP list entry/);
    expect(() => buildIpList("10.0.0.0/33")).toThrow(/Invalid CIDR prefix/);
    expect(() => buildIpList("2001:db8::/129")).toThrow(/Invalid CIDR prefix/);
    expect(() => buildIpList("10.0.0.0/x")).toThrow(/Invalid CIDR prefix/);
  });
});

describe("normalizeIp", () => {
  it("unwraps IPv4-mapped IPv6 addresses", () => {
    expect(normalizeIp("::ffff:192.0.2.7")).toBe("192.0.2.7");
  });

  it("leaves plain IPv4 and IPv6 addresses unchanged", () => {
    expect(normalizeIp("192.0.2.7")).toBe("192.0.2.7");
    expect(normalizeIp("2001:db8::1")).toBe("2001:db8::1");
  });
});
