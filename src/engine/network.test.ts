import { describe, expect, it } from "vitest";
import { connectedComponent, isValidIPv4, simulatePing, starterLab, validateLab } from "./network";

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
