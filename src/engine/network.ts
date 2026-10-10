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

export interface LabSnapshot {
  version: 1;
  devices: LabDevice[];
  links: LabLink[];
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
  ]
};

export function isValidIPv4(value: string): boolean {
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

export function simulatePing(
  devices: LabDevice[],
  links: LabLink[],
  sourceId: string,
  destinationId: string,
  sequence = 1
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
      event: { id: `evt-${sequence}`, time: new Date().toISOString(), source: source.ip, destination: destination.ip, protocol: "ICMP", status: "delivered", message },
      output: [`PING ${destination.ip} from ${source.ip}`, "Reply from local interface: 0.2 ms", "1 packet transmitted, 1 received."]
    };
  }

  const reachable = connectedComponent(source.id, links).has(destination.id);
  const message = reachable
    ? `ICMP echo reply received from ${destination.ip}`
    : `No route to host ${destination.ip}; packet dropped by the simulated network.`;

  return {
    success: reachable,
    event: {
      id: `evt-${sequence}`,
      time: new Date().toISOString(),
      source: source.ip,
      destination: destination.ip,
      protocol: "ICMP",
      status: reachable ? "delivered" : "dropped",
      message
    },
    output: reachable
      ? [`PING ${destination.ip} from ${source.ip}`, `64 bytes from ${destination.ip}: icmp_seq=${sequence} ttl=63 time=2.4 ms`, "1 packet transmitted, 1 received, 0% packet loss."]
      : [`PING ${destination.ip} from ${source.ip}`, "Request timed out.", "1 packet transmitted, 0 received, 100% packet loss."]
  };
}

export function validateLab(value: unknown): LabSnapshot {
  if (!value || typeof value !== "object") throw new Error("Lab file must contain a JSON object.");
  const candidate = value as Partial<LabSnapshot>;
  if (candidate.version !== 1 || !Array.isArray(candidate.devices) || !Array.isArray(candidate.links)) {
    throw new Error("Unsupported lab format. Expected PacketLab version 1.");
  }

  const ids = new Set<string>();
  for (const device of candidate.devices) {
    if (!device || typeof device.id !== "string" || typeof device.name !== "string" ||
        !["workstation", "router", "server"].includes(String(device.kind)) ||
        typeof device.ip !== "string" || !isValidIPv4(device.ip) ||
        !Number.isFinite(device.x) || !Number.isFinite(device.y)) {
      throw new Error("Lab contains an invalid device.");
    }
    if (ids.has(device.id)) throw new Error("Lab contains duplicate device IDs.");
    ids.add(device.id);
  }

  const linkIds = new Set<string>();
  for (const link of candidate.links) {
    if (!link || typeof link.id !== "string" || typeof link.from !== "string" ||
        typeof link.to !== "string" || link.from === link.to ||
        !ids.has(link.from) || !ids.has(link.to) || linkIds.has(link.id)) {
      throw new Error("Lab contains an invalid link.");
    }
    linkIds.add(link.id);
  }

  return { version: 1, devices: candidate.devices, links: candidate.links };
}
