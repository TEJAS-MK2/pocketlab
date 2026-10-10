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

  it("delivers a same-device ping", () => {
    const result = simulatePing(starterLab.devices, starterLab.links, "ws-01", "ws-01");
    expect(result.success).toBe(true);
    expect(result.event.status).toBe("delivered");
    expect(result.output.join("\\n")).toContain("1 packet transmitted, 1 received.");
  });

  it("generates unique event IDs even after the visible event list would be capped", () => {
    const ids = Array.from({ length: 150 }, () =>
      simulatePing(starterLab.devices, starterLab.links, "ws-01", "srv-01", 1).event.id
    );
    expect(new Set(ids).size).toBe(150);
  });

  it("rejects missing endpoints", () => {
    expect(() => simulatePing(starterLab.devices, starterLab.links, "missing", "srv-01")).toThrow();
  });
});

describe("lab file validation", () => {
  it("accepts the starter lab", () => {
    expect(validateLab(starterLab).devices).toHaveLength(3);
  });

  it("rejects non-object JSON input", () => {
    expect(() => validateLab(null)).toThrow("Lab file must contain a JSON object.");
    expect(() => validateLab([])).toThrow("Lab file must contain a JSON object.");
    expect(() => validateLab("not an object")).toThrow("Lab file must contain a JSON object.");
  });

  it("rejects duplicate IP addresses", () => {
    const invalid = {
      ...starterLab,
      devices: starterLab.devices.map((device, index) => index === 1
        ? { ...device, ip: starterLab.devices[0].ip }
        : device)
    };
    expect(() => validateLab(invalid)).toThrow("duplicate device IP");
  });

  it("rejects duplicate and reversed-duplicate links", () => {
    const devices = starterLab.devices;
    expect(() => validateLab({
      version: 1,
      devices,
      links: [
        { id: "link-one", from: "ws-01", to: "rt-01" },
        { id: "link-two", from: "ws-01", to: "rt-01" }
      ]
    })).toThrow("duplicate or reversed-duplicate links");
    expect(() => validateLab({
      version: 1,
      devices,
      links: [
        { id: "link-one", from: "ws-01", to: "rt-01" },
        { id: "link-two", from: "rt-01", to: "ws-01" }
      ]
    })).toThrow("duplicate or reversed-duplicate links");
  });

  it("rejects overlong names and IDs and labs over 200 devices", () => {
    expect(() => validateLab({
      version: 1, devices: [{ ...starterLab.devices[0], name: "N".repeat(65) }], links: []
    })).toThrow("invalid device");
    expect(() => validateLab({
      version: 1, devices: [{ ...starterLab.devices[0], id: "i".repeat(65) }], links: []
    })).toThrow("invalid device");
    expect(() => validateLab({
      version: 1, devices: Array.from({ length: 201 }, (_, i) => ({ ...starterLab.devices[0], id: `d${i}`, ip: `10.0.${Math.floor(i / 254)}.${i % 254 + 1}` })), links: []
    })).toThrow("200 devices");
  });

  it("returns only known fields from imported data", () => {
    const dirty = JSON.parse(JSON.stringify(starterLab)) as Record<string, unknown>;
    dirty.unexpectedRoot = true;
    (dirty.devices as Array<Record<string, unknown>>)[0].unexpectedDeviceField = true;
    (dirty.links as Array<Record<string, unknown>>)[0].unexpectedLinkField = true;
    const clean = validateLab(dirty);
    expect(clean).toEqual(starterLab);
    expect("unexpectedDeviceField" in clean.devices[0]).toBe(false);
    expect("unexpectedLinkField" in clean.links[0]).toBe(false);
    expect("unexpectedRoot" in clean).toBe(false);
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


describe("simulated firewall rules", () => {
  it("drops a reachable ping when the destination is blocked", () => {
    const result = simulatePing(starterLab.devices, starterLab.links, "ws-01", "srv-01", 1, ["srv-01"]);
    expect(result.success).toBe(false);
    expect(result.event.status).toBe("dropped");
    expect(result.event.message).toContain("simulated firewall policy");
  });

  it("keeps old version-one imports compatible without firewall rules", () => {
    const oldFormat = { version: 1 as const, devices: starterLab.devices, links: starterLab.links };
    expect(validateLab(oldFormat).blockedDeviceIds).toEqual([]);
  });

  it("rejects firewall rules referencing missing devices", () => {
    expect(() => validateLab({ ...starterLab, blockedDeviceIds: ["not-a-device"] })).toThrow("invalid firewall rule");
  });
});
