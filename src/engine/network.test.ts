import { describe, expect, it } from "vitest";
import { calculateSubnet, connectedComponent, findPath, isValidIPv4, simulatePing, starterLab, validateLab } from "./network";

describe("IPv4 validation", () => {
  it("accepts canonical IPv4 addresses", () => {
    expect(isValidIPv4("192.168.1.1")).toBe(true);
    expect(isValidIPv4("0.0.0.0")).toBe(true);
    expect(isValidIPv4("255.255.255.255")).toBe(true);
  });

  it("rejects malformed and non-canonical addresses", () => {
    for (const ip of ["256.1.1.1", "192.168.1", "1.2.3.04", "1.2.-1.4", "host.local"]) {
      expect(isValidIPv4(ip)).toBe(false);
    }
  });
});

describe("network connectivity simulation", () => {
  it("finds devices connected by multiple links", () => {
    expect(connectedComponent("ws-01", starterLab.links).has("srv-01")).toBe(true);
  });

  it("delivers a ping across a connected topology", () => {
    const result = simulatePing(starterLab.devices, starterLab.links, "ws-01", "srv-01");
    expect(result.success).toBe(true);
    expect(result.event.status).toBe("delivered");
    expect(result.output.join("\n")).toContain("0% packet loss");
  });

  it("drops a ping when the path is disconnected", () => {
    const result = simulatePing(starterLab.devices, [], "ws-01", "srv-01");
    expect(result.success).toBe(false);
    expect(result.event.status).toBe("dropped");
    expect(result.output.join("\n")).toContain("100% packet loss");
  });

  it("rejects missing endpoints", () => {
    expect(() => simulatePing(starterLab.devices, starterLab.links, "missing", "srv-01")).toThrow();
  });
});

describe("lab file validation", () => {
  it("accepts the starter lab", () => {
    expect(validateLab(starterLab).devices).toHaveLength(3);
  });

  it("rejects device coordinates outside the topology canvas", () => {
    const invalid = {
      version: 1 as const,
      devices: [{ ...starterLab.devices[0], x: 101 }],
      links: []
    };
    expect(() => validateLab(invalid)).toThrow("Lab contains an invalid device.");
  });

  it("rejects duplicate device IDs", () => {
    const invalid = {
      version: 1 as const,
      devices: [starterLab.devices[0], { ...starterLab.devices[1], id: starterLab.devices[0].id }],
      links: []
    };
    expect(() => validateLab(invalid)).toThrow("Lab contains duplicate device IDs.");
  });

  it("rejects links that point to missing devices", () => {
    expect(() => validateLab({
      version: 1,
      devices: starterLab.devices,
      links: [{ id: "bad-link", from: "ws-01", to: "not-here" }]
    })).toThrow("Lab contains an invalid link.");
  });

  it("rejects unsupported versions", () => {
    expect(() => validateLab({ version: 99, devices: [], links: [] })).toThrow("Unsupported lab format.");
  });
});


describe("route discovery", () => {
  it("returns the shortest path through connected devices", () => {
    expect(findPath(starterLab.devices, starterLab.links, "ws-01", "srv-01")).toEqual(["ws-01", "rt-01", "srv-01"]);
  });

  it("returns null when a device is missing or disconnected", () => {
    expect(findPath(starterLab.devices, [], "ws-01", "srv-01")).toBeNull();
    expect(findPath(starterLab.devices, starterLab.links, "missing", "srv-01")).toBeNull();
  });
});

describe("CIDR subnet calculator", () => {
  it("calculates a /24 network correctly", () => {
    expect(calculateSubnet("192.168.10.44/24")).toEqual({
      network: "192.168.10.0",
      netmask: "255.255.255.0",
      broadcast: "192.168.10.255",
      firstHost: "192.168.10.1",
      lastHost: "192.168.10.254",
      usableHosts: 254,
      prefix: 24
    });
  });

  it("handles /31 and /32 prefixes", () => {
    expect(calculateSubnet("10.0.0.0/31")?.usableHosts).toBe(2);
    expect(calculateSubnet("10.0.0.1/32")?.usableHosts).toBe(1);
  });

  it("rejects malformed CIDR inputs", () => {
    for (const input of ["192.168.1.1", "256.1.1.1/24", "10.0.0.1/33", "10.0.0.1/-1"]) {
      expect(calculateSubnet(input)).toBeNull();
    }
  });
});
