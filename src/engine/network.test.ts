import { describe, expect, it } from "vitest";
import { calculateSubnet, connectedComponent, findPath, isValidDeviceName, isValidIPv4, simulatedMacAddress, simulatePing, starterLab, validateLab, type LabDevice, type LabLink } from "./network";

describe("device name validation", () => {
  it("accepts useful names and rejects blank, overlong, and control-character names", () => {
    expect(isValidDeviceName("WORKSTATION-01")).toBe(true);
    expect(isValidDeviceName("  WORKSTATION-01  ")).toBe(true);
    expect(isValidDeviceName("  ")).toBe(false);
    expect(isValidDeviceName("N".repeat(49), 48)).toBe(false);
    expect(isValidDeviceName(["HOST", "INJECTED"].join(String.fromCharCode(10)))).toBe(false);
    expect(isValidDeviceName("HOST" + String.fromCharCode(127))).toBe(false);
    expect(isValidDeviceName(null)).toBe(false);
  });
});

describe("IPv4 validation", () => {
  it("accepts canonical IPv4 addresses", () => {
    expect(isValidIPv4("192.168.1.1")).toBe(true);
    expect(isValidIPv4("0.0.0.0")).toBe(true);
    expect(isValidIPv4("255.255.255.255")).toBe(true);
  });

  it("returns false for a non-string runtime input", () => {
    expect(isValidIPv4(null as unknown as string)).toBe(false);
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
    expect(result.event.trace.map((hop) => hop.name)).toEqual(["WORKSTATION-01", "EDGE-ROUTER", "WEB-SERVER"]);
    expect(result.event.trace.map((hop) => hop.ip)).toEqual(["192.168.10.10", "192.168.10.1", "192.168.10.20"]);
  });

  it("reports route-aware TTL and deterministic per-hop latency", () => {
    const multiHop = simulatePing(starterLab.devices, starterLab.links, "ws-01", "srv-01");
    expect(multiHop.output.join("\\n")).toContain("ttl=63 time=2.4 ms");

    const direct = simulatePing(starterLab.devices, [
      ...starterLab.links,
      { id: "ln-direct", from: "ws-01", to: "srv-01" }
    ], "ws-01", "srv-01");
    expect(direct.output.join("\\n")).toContain("ttl=64 time=1.2 ms");
  });

  it("explains simulated neighbor resolution and decrements TTL at intermediate routers only", () => {
    const result = simulatePing(starterLab.devices, starterLab.links, "ws-01", "srv-01");
    expect(result.event.steps?.some((step) => step.message.includes("Simulated ARP lookup"))).toBe(true);
    expect(result.event.steps?.some((step) => step.message.includes("TTL 64 -> 63"))).toBe(true);
    expect(result.event.steps?.at(-1)?.stage).toBe("delivery");
    expect(simulatedMacAddress("rt-01")).toBe(simulatedMacAddress("rt-01"));
    expect(simulatedMacAddress("rt-01")).toMatch(/^02:50:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}$/);
    expect(simulatedMacAddress("rt-01")).not.toBe(simulatedMacAddress("srv-01"));
  });

  it("drops packets when the TTL expires at a transit router", () => {
    const source: LabDevice = { id: "source", name: "SOURCE", kind: "workstation", ip: "10.1.0.1", x: 0, y: 50 };
    const routers: LabDevice[] = Array.from({ length: 64 }, (_, index) => ({
      id: `router-${index + 1}`,
      name: `ROUTER-${index + 1}`,
      kind: "router",
      ip: `10.0.0.${index + 1}`,
      x: (index + 1) * 100 / 65,
      y: 50
    }));
    const destination: LabDevice = { id: "destination", name: "DESTINATION", kind: "server", ip: "10.2.0.1", x: 100, y: 50 };
    const devices: LabDevice[] = [source, ...routers, destination];
    const links: LabLink[] = devices.slice(0, -1).map((device, index) => ({
      id: `link-${index + 1}`, from: device.id, to: devices[index + 1].id
    }));
    const result = simulatePing(devices, links, source.id, destination.id);

    expect(result.success).toBe(false);
    expect(result.event.status).toBe("dropped");
    expect(result.event.message).toContain("Time to live exceeded at ROUTER-64");
    expect(result.event.trace.at(-1)?.name).toBe("ROUTER-64");
    expect(result.output.join("\\n")).toContain("100% packet loss");
  });

  it("records firewall decisions in the event history", () => {
    const result = simulatePing(starterLab.devices, starterLab.links, "ws-01", "srv-01", 1, ["srv-01"]);
    expect(result.success).toBe(false);
    expect(result.event.steps?.some((step) => step.stage === "firewall" && step.status === "blocked")).toBe(true);
    expect(result.event.steps?.at(-1)?.message).toContain("ICMP was dropped");
  });

  it("explains a disconnected topology as a route failure", () => {
    const result = simulatePing(starterLab.devices, [], "ws-01", "srv-01");
    expect(result.event.steps?.some((step) => step.stage === "route" && step.status === "blocked")).toBe(true);
  });

  it("drops a ping when the path is disconnected", () => {
    const result = simulatePing(starterLab.devices, [], "ws-01", "srv-01");
    expect(result.success).toBe(false);
    expect(result.event.status).toBe("dropped");
    expect(result.output.join("\n")).toContain("100% packet loss");
    expect(result.event.trace).toEqual([]);
  });

  it("delivers a same-device ping", () => {
    const result = simulatePing(starterLab.devices, starterLab.links, "ws-01", "ws-01");
    expect(result.success).toBe(true);
    expect(result.event.status).toBe("delivered");
    expect(result.event.trace.map((hop) => hop.deviceId)).toEqual(["ws-01"]);
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
      version: 1, devices: starterLab.devices, links: [{ ...starterLab.links[0], id: "l".repeat(65) }]
    })).toThrow("invalid link");
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

  it("rejects blank or terminal-unsafe IDs and names with control characters", () => {
    expect(() => validateLab({ version: 1, devices: [{ ...starterLab.devices[0], id: " " }], links: [] }))
      .toThrow("invalid device");
    expect(() => validateLab({ version: 1, devices: [{ ...starterLab.devices[0], id: "bad id" }], links: [] }))
      .toThrow("invalid device");
    expect(() => validateLab({ version: 1, devices: [{ ...starterLab.devices[0], name: "  " }], links: [] }))
      .toThrow("invalid device");
    expect(() => validateLab({ version: 1, devices: [{ ...starterLab.devices[0], name: ["HOST", "INJECTED"].join(String.fromCharCode(10)) }], links: [] }))
      .toThrow("invalid device");
    expect(() => validateLab({ version: 1, devices: starterLab.devices, links: [{ id: "bad id", from: "ws-01", to: "rt-01" }] }))
      .toThrow("invalid link");
  });

  it("trims imported device names", () => {
    const imported = validateLab({
      version: 1,
      devices: [{ ...starterLab.devices[0], name: "  LAB-HOST  " }],
      links: []
    });
    expect(imported.devices[0].name).toBe("LAB-HOST");
  });

  it("accepts a lab at the 200-device and 2,000-link limits", () => {
    const devices = Array.from({ length: 200 }, (_, index) => ({
      ...starterLab.devices[0],
      id: `device-${index}`,
      name: `DEVICE-${index}`,
      ip: `10.0.0.${index + 1}`,
      x: (index % 20) * 5,
      y: Math.floor(index / 20) * 10
    }));
    const links = Array.from({ length: 2000 }, (_, index) => {
      const fromIndex = index % 200;
      const offset = Math.floor(index / 200) + 1;
      return {
        id: `edge-${index}`,
        from: `device-${fromIndex}`,
        to: `device-${(fromIndex + offset) % 200}`
      };
    });
    const validated = validateLab({ version: 1, devices, links });
    expect(validated.devices).toHaveLength(200);
    expect(validated.links).toHaveLength(2000);
  });

  it("rejects workspaces with excessive link counts", () => {
    expect(() => validateLab({
      version: 1,
      devices: starterLab.devices,
      links: Array.from({ length: 2001 }, (_, index) => ({ id: `link-${index}`, from: "ws-01", to: "rt-01" }))
    })).toThrow("2,000 links");
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

  it("handles /0, /31 and /32 prefixes", () => {
    expect(calculateSubnet("255.255.255.255/0")).toEqual({
      network: "0.0.0.0",
      netmask: "0.0.0.0",
      broadcast: "255.255.255.255",
      firstHost: "0.0.0.1",
      lastHost: "255.255.255.254",
      usableHosts: 4294967294,
      prefix: 0
    });
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
    expect(result.event.trace.map((hop) => hop.deviceId)).toEqual(["ws-01", "rt-01", "srv-01"]);
  });

  it("keeps old version-one imports compatible without firewall rules", () => {
    const oldFormat = { version: 1 as const, devices: starterLab.devices, links: starterLab.links };
    expect(validateLab(oldFormat).blockedDeviceIds).toEqual([]);
  });

  it("rejects firewall rules referencing missing devices", () => {
    expect(() => validateLab({ ...starterLab, blockedDeviceIds: ["not-a-device"] })).toThrow("invalid firewall rule");
  });
});
