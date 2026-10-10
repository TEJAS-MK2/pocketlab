export type DeviceKind = "workstation" | "router" | "server";

export interface LabDevice {
  id: string;
  name: string;
  kind: DeviceKind;
  ip: string;
  /** Optional for legacy version-one files; missing values migrate to true. */
  interfaceUp?: boolean;
  x: number;
  y: number;
}

export interface LabLink {
  id: string;
  from: string;
  to: string;
  /** Optional for legacy version-one files; missing values migrate to true. */
  up?: boolean;
}

export interface LabPacketHop {
  deviceId: string;
  name: string;
  ip: string;
}

export type LabPacketStepStatus = "pass" | "blocked" | "info";

export interface LabPacketStep {
  id: string;
  stage: "endpoint" | "interface" | "link" | "route" | "neighbor" | "forward" | "firewall" | "delivery" | "drop";
  status: LabPacketStepStatus;
  deviceId?: string;
  deviceName?: string;
  message: string;
}

export interface LabPacketEvent {
  id: string;
  time: string;
  source: string;
  destination: string;
  protocol: "ICMP" | "DNS" | "TCP" | "SYSTEM";
  status: "delivered" | "dropped" | "info";
  message: string;
  trace: LabPacketHop[];
  /** Explainable local-only simulation decisions; optional for legacy event records. */
  steps?: LabPacketStep[];
}

export const MAX_LAB_DEVICES = 200;
export const MAX_LAB_LINKS = 2000;

export interface LabSnapshot {
  version: 1;
  devices: LabDevice[];
  links: LabLink[];
  blockedDeviceIds: string[];
}

export const starterLab: LabSnapshot = {
  version: 1,
  devices: [
    { id: "ws-01", name: "WORKSTATION-01", kind: "workstation", ip: "192.168.10.10", interfaceUp: true, x: 18, y: 43 },
    { id: "rt-01", name: "EDGE-ROUTER", kind: "router", ip: "192.168.10.1", interfaceUp: true, x: 49, y: 43 },
    { id: "srv-01", name: "WEB-SERVER", kind: "server", ip: "192.168.10.20", interfaceUp: true, x: 80, y: 43 }
  ],
  links: [
    { id: "ln-01", from: "ws-01", to: "rt-01", up: true },
    { id: "ln-02", from: "rt-01", to: "srv-01", up: true }
  ],
  blockedDeviceIds: []
};

export function isValidDeviceName(value: unknown, maxLength = 64): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength &&
    !/[\u0000-\u001f\u007f]/.test(value);
}

export function isValidIPv4(value: string): boolean {
  if (typeof value !== "string") return false;
  const parts = value.split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    const number = Number(part);
    return number >= 0 && number <= 255 && String(number) === part;
  });
}

export function connectedComponent(startId: string, links: LabLink[]): Set<string> {
  const visited = new Set<string>([startId]);
  const queue = [startId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const link of links) {
      const next = link.from === current ? link.to : link.to === current ? link.from : null;
      if (next && !visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }

  return visited;
}

export interface PingResult {
  success: boolean;
  event: LabPacketEvent;
  output: string[];
}

function createEventId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return `evt-${globalThis.crypto.randomUUID()}`;
  return `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

/** Stable locally administered MAC-like address for illustrating simulated ARP, never a real NIC address. */
export function simulatedMacAddress(deviceId: string): string {
  let hash = 2166136261;
  for (let index = 0; index < deviceId.length; index += 1) {
    hash ^= deviceId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const bytes = [2, 0x50, (hash >>> 24) & 255, (hash >>> 16) & 255, (hash >>> 8) & 255, hash & 255];
  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join(":");
}

function packetStep(
  id: string,
  stage: LabPacketStep["stage"],
  status: LabPacketStepStatus,
  message: string,
  device?: LabDevice
): LabPacketStep {
  return {
    id, stage, status, message,
    ...(device ? { deviceId: device.id, deviceName: device.name } : {})
  };
}

export function simulatePing(
  devices: LabDevice[],
  links: LabLink[],
  sourceId: string,
  destinationId: string,
  sequence = 1,
  blockedDeviceIds: string[] = []
): PingResult {
  const source = devices.find((device) => device.id === sourceId);
  const destination = devices.find((device) => device.id === destinationId);

  if (!source || !destination) {
    throw new Error("Choose a source and destination that exist in this lab.");
  }

  const sourceHop: LabPacketHop = { deviceId: source.id, name: source.name, ip: source.ip };
  const downEndpoint = [source, destination].find((device) => device.interfaceUp === false);
  if (downEndpoint) {
    const message = `Interface eth0 is administratively down on ${downEndpoint.name}; packet dropped.`;
    const steps = [
      packetStep("step-1", "endpoint", "pass", `Validated source ${source.ip} and destination ${destination.ip}.`, source),
      packetStep("step-2", "interface", "blocked", message, downEndpoint)
    ];
    return {
      success: false,
      event: {
        id: createEventId(), time: new Date().toISOString(), source: source.ip, destination: destination.ip,
        protocol: "ICMP", status: "dropped", message, trace: downEndpoint.id === source.id ? [sourceHop] : [], steps
      },
      output: [`PING ${destination.ip} from ${source.ip}`, message, "1 packet transmitted, 0 received, 100% packet loss."]
    };
  }

  if (source.id === destination.id) {
    const message = "Source and destination are the same device.";
    const steps = [
      packetStep("step-1", "endpoint", "pass", `Source and destination ${source.ip} resolve to the same virtual interface.`, source),
      packetStep("step-2", "delivery", "pass", "Reply handled locally; no virtual link traversal or router hop was needed.", source)
    ];
    return {
      success: true,
      event: {
        id: createEventId(), time: new Date().toISOString(), source: source.ip, destination: destination.ip,
        protocol: "ICMP", status: "delivered", message, trace: [sourceHop], steps
      },
      output: [`PING ${destination.ip} from ${source.ip}`, "Reply from local interface: 0.2 ms", "1 packet transmitted, 1 received."]
    };
  }

  const devicesById = new Map(devices.map((device) => [device.id, device]));
  const allRoute = findPath(devices, links, source.id, destination.id);
  const activeDevices = devices.filter((device) => device.interfaceUp !== false);
  const activeIds = new Set(activeDevices.map((device) => device.id));
  const activeLinks = links.filter((link) => link.up !== false && activeIds.has(link.from) && activeIds.has(link.to));
  const route = findPath(activeDevices, activeLinks, source.id, destination.id);
  if (!route) {
    const downHop = allRoute?.map((id) => devicesById.get(id)).find((device) => device?.interfaceUp === false);
    const downLink = allRoute ? links.find((link) => link.up === false && allRoute.some((_, index) =>
      index < allRoute.length - 1 && ((allRoute[index] === link.from && allRoute[index + 1] === link.to) ||
      (allRoute[index] === link.to && allRoute[index + 1] === link.from))
    )) : undefined;
    const message = downHop
      ? `Interface eth0 is administratively down on ${downHop.name}; no usable path remains to ${destination.ip}.`
      : downLink
        ? `Link ${downLink.id} is administratively down; no usable path remains to ${destination.ip}.`
        : `No route to host ${destination.ip}; packet dropped by the simulated network.`;
    const steps = [
      packetStep("step-1", "endpoint", "pass", `Validated source ${source.ip} and destination ${destination.ip}.`, source),
      downHop
        ? packetStep("step-2", "interface", "blocked", message, downHop)
        : downLink
          ? packetStep("step-2", "link", "blocked", message)
          : packetStep("step-2", "route", "blocked", `No path exists in the current virtual link graph from ${source.name} to ${destination.name}.`, source),
      packetStep("step-3", "drop", "blocked", "The simulated packet was discarded before reaching the destination.")
    ];
    return {
      success: false,
      event: {
        id: createEventId(), time: new Date().toISOString(), source: source.ip, destination: destination.ip,
        protocol: "ICMP", status: "dropped", message, trace: [], steps
      },
      output: [`PING ${destination.ip} from ${source.ip}`, message, "1 packet transmitted, 0 received, 100% packet loss."]
    };
  }
  const plannedTrace: LabPacketHop[] = route.flatMap((id) => {
    const device = devicesById.get(id);
    return device ? [{ deviceId: device.id, name: device.name, ip: device.ip }] : [];
  });
  const trace: LabPacketHop[] = [sourceHop];
  const steps: LabPacketStep[] = [
    packetStep("step-1", "endpoint", "pass", `Validated source ${source.ip} and destination ${destination.ip}.`, source),
    packetStep("step-2", "route", "pass", `Selected a ${route.length - 1}-link path: ${plannedTrace.map((hop) => hop.name).join(" -> ")}.`, source)
  ];
  let ttl = 64;

  // Model each hop in order. The MAC-like values are illustrative and are not hardware addresses.
  for (let index = 0; index < route.length - 1; index += 1) {
    const current = devicesById.get(route[index]);
    const next = devicesById.get(route[index + 1]);
    if (!current || !next) continue;

    // A transit router decrements TTL when forwarding, not when a packet merely crosses a link.
    if (index > 0 && current.kind === "router") {
      const before = ttl;
      ttl = Math.max(0, ttl - 1);
      steps.push(packetStep(
        `step-${steps.length + 1}`, "forward", ttl > 0 ? "pass" : "blocked",
        `Router forwarding decision at ${current.name}: TTL ${before} -> ${ttl}.`,
        current
      ));
      if (ttl === 0) {
        const message = `Time to live exceeded at ${current.name}; the packet was dropped before forwarding.`;
        steps.push(packetStep(`step-${steps.length + 1}`, "drop", "blocked", message, current));
        return {
          success: false,
          event: {
            id: createEventId(), time: new Date().toISOString(), source: source.ip, destination: destination.ip,
            protocol: "ICMP", status: "dropped", message, trace, steps
          },
          output: [
            `PING ${destination.ip} from ${source.ip}`,
            `Time to live exceeded at ${current.name}.`,
            "1 packet transmitted, 0 received, 100% packet loss."
          ]
        };
      }
    }

    steps.push(packetStep(
      `step-${steps.length + 1}`, "neighbor", "info",
      `Simulated ARP lookup: ${current.name} resolved next-hop ${next.ip} to illustrative address ${simulatedMacAddress(next.id)}.`,
      current
    ));
    trace.push({ deviceId: next.id, name: next.name, ip: next.ip });
  }

  if (blockedDeviceIds.includes(destination.id)) {
    const message = `Blocked by simulated firewall policy for ${destination.name}.`;
    steps.push(packetStep(
      `step-${steps.length + 1}`, "firewall", "blocked",
      `Simulated destination deny rule matched ${destination.name} (${destination.ip}); ICMP was dropped.`,
      destination
    ));
    return {
      success: false,
      event: {
        id: createEventId(), time: new Date().toISOString(), source: source.ip, destination: destination.ip,
        protocol: "ICMP", status: "dropped", message, trace, steps
      },
      output: [`PING ${destination.ip} from ${source.ip}`, "Firewall policy denied the simulated packet.", "1 packet transmitted, 0 received, policy drop."]
    };
  }

  const message = `ICMP echo reply received from ${destination.ip}`;
  const hops = route.length - 1;
  steps.push(packetStep(
    `step-${steps.length + 1}`, "delivery", "pass",
    `Simulated ICMP echo reply delivered to ${source.name}; estimated one-way link latency is ${Math.max(1, hops * 1.2).toFixed(1)} ms per direction.`,
    destination
  ));
  return {
    success: true,
    event: {
      id: createEventId(), time: new Date().toISOString(), source: source.ip, destination: destination.ip,
      protocol: "ICMP", status: "delivered", message, trace, steps
    },
    output: [
      `PING ${destination.ip} from ${source.ip}`,
      `64 bytes from ${destination.ip}: icmp_seq=${sequence} ttl=${ttl} time=${Math.max(1, hops * 1.2).toFixed(1)} ms`,
      "1 packet transmitted, 1 received, 0% packet loss."
    ]
  };
}

export function validateLab(value: unknown): LabSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Lab file must contain a JSON object.");
  }
  const candidate = value as Partial<LabSnapshot>;
  if (candidate.version !== 1 || !Array.isArray(candidate.devices) || !Array.isArray(candidate.links)) {
    throw new Error("Unsupported lab format. Expected PacketLab version 1.");
  }
  if (candidate.devices.length > MAX_LAB_DEVICES) {
    throw new Error(`Lab may contain at most ${MAX_LAB_DEVICES} devices.`);
  }
  if (candidate.links.length > MAX_LAB_LINKS) {
    throw new Error(`Lab may contain at most ${MAX_LAB_LINKS.toLocaleString("en-US")} links.`);
  }

  const ids = new Set<string>();
  const ips = new Set<string>();
  for (const device of candidate.devices) {
    if (!device || typeof device.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(device.id) ||
        !isValidDeviceName(device.name, 64) ||
        !["workstation", "router", "server"].includes(String(device.kind)) ||
        typeof device.ip !== "string" || !isValidIPv4(device.ip) ||
        (device.interfaceUp !== undefined && typeof device.interfaceUp !== "boolean") ||
        !Number.isFinite(device.x) || !Number.isFinite(device.y) || device.x < 0 || device.x > 100 || device.y < 0 || device.y > 100) {
      throw new Error("Lab contains an invalid device.");
    }
    if (ids.has(device.id)) throw new Error("Lab contains duplicate device IDs.");
    if (ips.has(device.ip)) throw new Error("Lab contains duplicate device IP addresses.");
    ids.add(device.id);
    ips.add(device.ip);
  }

  const linkIds = new Set<string>();
  const connections = new Set<string>();
  for (const link of candidate.links) {
    if (!link || typeof link.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(link.id) ||
        typeof link.from !== "string" || typeof link.to !== "string" || link.from === link.to ||
        !ids.has(link.from) || !ids.has(link.to) || linkIds.has(link.id) ||
        (link.up !== undefined && typeof link.up !== "boolean")) {
      throw new Error("Lab contains an invalid link.");
    }
    const connectionKey = [link.from, link.to].sort().join("\\0");
    if (connections.has(connectionKey)) {
      throw new Error("Lab contains duplicate or reversed-duplicate links.");
    }
    linkIds.add(link.id);
    connections.add(connectionKey);
  }

  const blockedDeviceIds = candidate.blockedDeviceIds ?? [];
  if (!Array.isArray(blockedDeviceIds) || blockedDeviceIds.some((id) => typeof id !== "string" || !ids.has(id)) ||
      new Set(blockedDeviceIds).size !== blockedDeviceIds.length) {
    throw new Error("Lab contains an invalid firewall rule.");
  }
  return {
    version: 1,
    devices: candidate.devices.map((device) => ({
      id: device.id, name: device.name.trim(), kind: device.kind, ip: device.ip,
      interfaceUp: device.interfaceUp !== false, x: device.x, y: device.y
    })),
    links: candidate.links.map((link) => ({ id: link.id, from: link.from, to: link.to, up: link.up !== false })),
    blockedDeviceIds: [...blockedDeviceIds]
  };
}
export function findPath(devices: LabDevice[], links: LabLink[], sourceId: string, destinationId: string): string[] | null {
  const ids = new Set(devices.map((device) => device.id));
  if (!ids.has(sourceId) || !ids.has(destinationId)) return null;
  const previous = new Map<string, string | null>([[sourceId, null]]);
  const queue = [sourceId];
  while (queue.length) {
    const current = queue.shift()!;
    if (current === destinationId) break;
    for (const link of links) {
      const next = link.from === current ? link.to : link.to === current ? link.from : null;
      if (next && ids.has(next) && !previous.has(next)) {
        previous.set(next, current);
        queue.push(next);
      }
    }
  }
  if (!previous.has(destinationId)) return null;
  const path: string[] = [];
  let current: string | null = destinationId;
  while (current !== null) {
    path.unshift(current);
    current = previous.get(current) ?? null;
  }
  return path;
}

export interface SubnetResult {
  network: string;
  netmask: string;
  broadcast: string;
  firstHost: string;
  lastHost: string;
  usableHosts: number;
  prefix: number;
}

function intToIPv4(value: number): string {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join(".");
}

export function calculateSubnet(input: string): SubnetResult | null {
  const match = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/.exec(input.trim());
  if (!match || !isValidIPv4(match[1])) return null;
  const prefix = Number(match[2]);
  if (prefix < 0 || prefix > 32) return null;
  const octets = match[1].split(".").map(Number);
  const address = (((octets[0] * 256 + octets[1]) * 256 + octets[2]) * 256 + octets[3]) >>> 0;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (address & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const usableHosts = prefix === 32 ? 1 : prefix === 31 ? 2 : Math.max(0, broadcast - network - 1);
  return {
    network: intToIPv4(network),
    netmask: intToIPv4(mask),
    broadcast: intToIPv4(broadcast),
    firstHost: prefix >= 31 ? intToIPv4(network) : intToIPv4(network + 1),
    lastHost: prefix >= 31 ? intToIPv4(broadcast) : intToIPv4(broadcast - 1),
    usableHosts,
    prefix
  };
}
