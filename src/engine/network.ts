export type DeviceKind = "workstation" | "router" | "server";

export interface LabDevice {
  id: string;
  name: string;
  kind: DeviceKind;
  ip: string;
  x: number;
  y: number;
}

export interface LabLink {
  id: string;
  from: string;
  to: string;
}

export interface LabPacketEvent {
  id: string;
  time: string;
  source: string;
  destination: string;
  protocol: "ICMP" | "DNS" | "TCP" | "SYSTEM";
  status: "delivered" | "dropped" | "info";
  message: string;
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
    { id: "ws-01", name: "WORKSTATION-01", kind: "workstation", ip: "192.168.10.10", x: 18, y: 43 },
    { id: "rt-01", name: "EDGE-ROUTER", kind: "router", ip: "192.168.10.1", x: 49, y: 43 },
    { id: "srv-01", name: "WEB-SERVER", kind: "server", ip: "192.168.10.20", x: 80, y: 43 }
  ],
  links: [
    { id: "ln-01", from: "ws-01", to: "rt-01" },
    { id: "ln-02", from: "rt-01", to: "srv-01" }
  ],
  blockedDeviceIds: []
};

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

  if (source.id === destination.id) {
    const message = "Source and destination are the same device.";
    return {
      success: true,
      event: { id: createEventId(), time: new Date().toISOString(), source: source.ip, destination: destination.ip, protocol: "ICMP", status: "delivered", message },
      output: [`PING ${destination.ip} from ${source.ip}`, "Reply from local interface: 0.2 ms", "1 packet transmitted, 1 received."]
    };
  }

  if (blockedDeviceIds.includes(destination.id)) {
    const message = "Blocked by simulated firewall policy for " + destination.name + ".";
    return {
      success: false,
      event: { id: createEventId(), time: new Date().toISOString(), source: source.ip, destination: destination.ip, protocol: "ICMP", status: "dropped", message },
      output: ["PING " + destination.ip + " from " + source.ip, "Firewall policy denied the simulated packet.", "1 packet transmitted, 0 received, policy drop."]
    };
  }

  const route = findPath(devices, links, source.id, destination.id);
  const reachable = route !== null;
  const message = reachable
    ? `ICMP echo reply received from ${destination.ip}`
    : `No route to host ${destination.ip}; packet dropped by the simulated network.`;

  return {
    success: reachable,
    event: {
      id: createEventId(),
      time: new Date().toISOString(),
      source: source.ip,
      destination: destination.ip,
      protocol: "ICMP",
      status: reachable ? "delivered" : "dropped",
      message
    },
    output: reachable
      ? [`PING ${destination.ip} from ${source.ip}`, `64 bytes from ${destination.ip}: icmp_seq=${sequence} ttl=${Math.max(1, 64 - ((route?.length ?? 1) - 1))} time=${Math.max(1, ((route?.length ?? 1) - 1) * 1.2).toFixed(1)} ms`, "1 packet transmitted, 1 received, 0% packet loss."]
      : [`PING ${destination.ip} from ${source.ip}`, "Request timed out.", "1 packet transmitted, 0 received, 100% packet loss."]
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
        typeof device.name !== "string" || device.name.trim().length === 0 || device.name.length > 64 || /[\u0000-\u001f\u007f]/.test(device.name) ||
        !["workstation", "router", "server"].includes(String(device.kind)) ||
        typeof device.ip !== "string" || !isValidIPv4(device.ip) ||
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
        !ids.has(link.from) || !ids.has(link.to) || linkIds.has(link.id)) {
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
      id: device.id, name: device.name.trim(), kind: device.kind, ip: device.ip, x: device.x, y: device.y
    })),
    links: candidate.links.map((link) => ({ id: link.id, from: link.from, to: link.to })),
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
