import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import {
  Activity, ArrowRight, Check, CircleHelp,
  Command, Cpu, Download, FileUp, Filter, Globe, Laptop, Link2, Network,
  Play, Plus, RadioTower, RotateCcw, Save, Server, ShieldCheck, TerminalSquare,
  Trash2, Waypoints, X
} from "lucide-react";
import {
  type DeviceKind, type LabDevice, type LabPacketEvent, type LabSnapshot,
  MAX_LAB_DEVICES, MAX_LAB_LINKS, calculateSubnet, connectedComponent, findPath, isValidDeviceName, isValidIPv4, simulatePing, starterLab, validateLab
} from "./engine/network";

const STORAGE_KEY = "packetlab.workspace.v1";
const INVALID_BACKUP_KEY = `${STORAGE_KEY}.invalid-backup`;
const deviceIcon = (kind: DeviceKind) => kind === "router" ? RadioTower : kind === "server" ? Server : Laptop;

function readSavedLab(): { lab: LabSnapshot; notice: string } {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { lab: starterLab, notice: "Starter topology loaded" };
    return { lab: validateLab(JSON.parse(raw)), notice: "Saved lab restored from this device" };
  } catch {
    let backedUp = false;
    if (raw !== null) {
      try {
        localStorage.setItem(INVALID_BACKUP_KEY, raw);
        backedUp = true;
      } catch {
        // Preserve the starter lab if storage is unavailable; never overwrite the invalid original here.
      }
    }
    return {
      lab: starterLab,
      notice: raw === null
        ? "Local storage unavailable — starter topology loaded"
        : backedUp
          ? `Saved lab was invalid; raw data backed up under ${INVALID_BACKUP_KEY}`
          : "Saved lab was invalid; raw backup could not be written"
    };
  }
}

export default function App() {
  const [startup] = useState(readSavedLab);
  const [lab, setLab] = useState<LabSnapshot>(startup.lab);
  const [events, setEvents] = useState<LabPacketEvent[]>([]);
  const [terminal, setTerminal] = useState<string[]>(["PacketLab terminal v0.1.0", "Simulation environment ready.", "Type help to view available commands."]);
  const [command, setCommand] = useState("");
  const [selectedSource, setSelectedSource] = useState(() => lab.devices[0]?.id ?? "");
  const [selectedDestination, setSelectedDestination] = useState(() => lab.devices.find((device) => device.kind === "server" && device.id !== lab.devices[0]?.id)?.id ?? lab.devices.find((device) => device.id !== lab.devices[0]?.id)?.id ?? lab.devices[0]?.id ?? "");
  const [notice, setNotice] = useState(startup.notice);
  const [activeTab, setActiveTab] = useState<"topology" | "packets">("topology");
  const [activePath, setActivePath] = useState<string[]>([]);
  const [filter, setFilter] = useState("all");
  const [eventQuery, setEventQuery] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const draggingDevice = useRef<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editIp, setEditIp] = useState("");
  const [subnetInput, setSubnetInput] = useState("192.168.10.0/24");
  const [missionSubnetDone, setMissionSubnetDone] = useState(false);
  const subnet = useMemo(() => calculateSubnet(subnetInput), [subnetInput]);

  const selected = lab.devices.find((device) => device.id === selectedSource);
  useEffect(() => {
    setEditName(selected?.name ?? "");
    setEditIp(selected?.ip ?? "");
  }, [selected?.id, selected?.name, selected?.ip]);
  const reachableCount = useMemo(
    () => selected ? connectedComponent(selected.id, lab.links).size : 0,
    [lab.links, selected?.id]
  );
  const normalizedEventQuery = eventQuery.trim().toLowerCase();
  const visibleEvents = events.filter((event) => {
    if (filter !== "all" && event.status !== filter) return false;
    if (!normalizedEventQuery) return true;
    const searchableValues = [
      event.source, event.destination, event.protocol, event.status, event.message,
      ...event.trace.flatMap((hop) => [hop.name, hop.ip, hop.deviceId])
    ];
    return searchableValues.some((value) => value.toLowerCase().includes(normalizedEventQuery));
  });
  const missionSource = lab.devices.find((device) => device.id === "ws-01");
  const missionDestination = lab.devices.find((device) => device.id === "srv-01");
  const missionPingDone = events.some((event) =>
    event.protocol === "ICMP" &&
    event.status === "delivered" &&
    event.trace[0]?.deviceId === missionSource?.id &&
    event.trace[event.trace.length - 1]?.deviceId === missionDestination?.id
  );
  const missionPath = missionSource && missionDestination
    ? findPath(lab.devices, lab.links, missionSource.id, missionDestination.id)
    : null;
  const missionRouteLabel = missionPath
    ? "Route: " + missionPath.map((id) => lab.devices.find((device) => device.id === id)?.name ?? id).join(" -> ")
    : null;
  const missionRouteDone = missionRouteLabel !== null && terminal.includes(missionRouteLabel);
  const missionProgress = [missionPingDone, missionRouteDone, missionSubnetDone].filter(Boolean).length;

  function persist(next: LabSnapshot) {
    setLab(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setNotice("Saved locally on this device");
    } catch {
      setNotice("Storage unavailable — export your lab to keep a copy");
    }
  }

  function addDevice(kind: DeviceKind) {
    if (lab.devices.length >= MAX_LAB_DEVICES) {
      setNotice(`This lab has reached the ${MAX_LAB_DEVICES}-device limit.`);
      return;
    }
    const usedIPs = new Set(lab.devices.map((device) => device.ip));
    const host = Array.from({ length: 253 }, (_, index) => index + 2)
      .find((octet) => !usedIPs.has(`192.168.10.${octet}`));
    if (!host) {
      setNotice("The 192.168.10.0/24 address pool is full.");
      return;
    }
    const grid = [12, 31, 50, 69, 88].flatMap((x) => [22, 50, 78].map((y) => ({ x, y })));
    const canvasBounds = canvasRef.current?.getBoundingClientRect();
    const minXSpacing = canvasBounds ? (120 / canvasBounds.width) * 100 : 18;
    const minYSpacing = canvasBounds ? (100 / canvasBounds.height) * 100 : 31;
    const position = grid.find(({ x, y }) => lab.devices.every((device) =>
      Math.abs(device.x - x) >= minXSpacing || Math.abs(device.y - y) >= minYSpacing
    ));
    if (!position) {
      setNotice("No free non-overlapping topology position is available.");
      return;
    }
    const count = lab.devices.filter((device) => device.kind === kind).length + 1;
    const prefix = kind === "router" ? "rt" : kind === "server" ? "srv" : "ws";
    const device: LabDevice = {
      id: `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
      name: `${kind === "router" ? "ROUTER" : kind === "server" ? "SERVER" : "WORKSTATION"}-${String(count).padStart(2, "0")}`,
      kind,
      ip: `192.168.10.${host}`,
      x: position.x,
      y: position.y
    };
    persist({ ...lab, devices: [...lab.devices, device] });
    setSelectedSource(device.id);
    setNotice(`${device.name} added to the lab`);
  }

  function saveSelectedDevice() {
    if (!selected) return;
    const name = editName.trim();
    const ip = editIp.trim();
    if (!isValidDeviceName(name, 48)) { setNotice("Device names must be 1–48 characters and cannot contain control characters."); return; }
    if (!isValidIPv4(ip)) { setNotice("Enter a valid canonical IPv4 address."); return; }
    if (lab.devices.some((device) => device.id !== selected.id && device.ip === ip)) { setNotice("Another device already uses that IPv4 address."); return; }
    persist({ ...lab, devices: lab.devices.map((device) => device.id === selected.id ? { ...device, name, ip } : device) });
    setNotice("Device properties saved locally");
  }

  function deleteSelectedDevice() {
    if (!selected) return;
    const removedName = selected.name;
    const remaining = lab.devices.filter((device) => device.id !== selected.id);
    const next = { ...lab, devices: remaining, links: lab.links.filter((link) => link.from !== selected.id && link.to !== selected.id) };
    persist(next);
    setSelectedSource(remaining[0]?.id ?? "");
    setSelectedDestination(remaining.find((device) => device.id !== remaining[0]?.id)?.id ?? remaining[0]?.id ?? "");
    setNotice(removedName + " and its links were removed");
  }

  function toggleFirewall(deviceId: string) {
    const blocked = lab.blockedDeviceIds.includes(deviceId);
    const next = blocked ? lab.blockedDeviceIds.filter((id) => id !== deviceId) : [...lab.blockedDeviceIds, deviceId];
    persist({ ...lab, blockedDeviceIds: next });
    const name = lab.devices.find((device) => device.id === deviceId)?.name ?? deviceId;
    setNotice(blocked ? "Firewall now allows traffic to " + name : "Firewall now blocks traffic to " + name);
  }

  function deleteLink(linkId: string) {
    persist({ ...lab, links: lab.links.filter((link) => link.id !== linkId) });
    setNotice("Network link removed");
  }

  function handleDeviceKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, deviceId: string) {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]
    };
    const movement = moves[event.key];
    if (!movement) return;
    event.preventDefault();
    const step = event.shiftKey ? 5 : 2;
    const [dx, dy] = movement.map((value) => value * step);
    const next = {
      ...lab,
      devices: lab.devices.map((device) => device.id === deviceId
        ? { ...device, x: Math.max(5, Math.min(95, device.x + dx)), y: Math.max(12, Math.min(88, device.y + dy)) }
        : device)
    };
    persist(next);
    setNotice("Topology position moved with keyboard");
  }

  function handleCanvasPointerDown(event: PointerEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const deviceElement = target.closest<HTMLButtonElement>(".canvas-device");
    const id = deviceElement?.dataset.deviceId;
    if (!id) return;
    draggingDevice.current = id;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleCanvasPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const id = draggingDevice.current;
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!id || !bounds || bounds.width === 0 || bounds.height === 0) return;
    const x = Math.max(5, Math.min(95, ((event.clientX - bounds.left) / bounds.width) * 100));
    const y = Math.max(12, Math.min(88, ((event.clientY - bounds.top) / bounds.height) * 100));
    setLab((previous) => ({ ...previous, devices: previous.devices.map((device) => device.id === id ? { ...device, x, y } : device) }));
  }

  function handleCanvasPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!draggingDevice.current) return;
    draggingDevice.current = null;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(lab)); setNotice("Topology position saved locally"); }
    catch { setNotice("Storage unavailable — export your lab to keep a copy"); }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function connectDevices() {
    if (!lab.devices.some((device) => device.id === selectedSource) || !lab.devices.some((device) => device.id === selectedDestination)) {
      setNotice("Choose two devices that exist in this lab");
      return;
    }
    if (selectedSource === selectedDestination) {
      setNotice("Choose two different devices to create a link");
      return;
    }
    const exists = lab.links.some((link) =>
      (link.from === selectedSource && link.to === selectedDestination) ||
      (link.to === selectedSource && link.from === selectedDestination)
    );
    if (exists) { setNotice("Those devices are already connected"); return; }
    if (lab.links.length >= MAX_LAB_LINKS) {
      setNotice(`This lab has reached the ${MAX_LAB_LINKS.toLocaleString("en-US")}-link limit.`);
      return;
    }
    persist({ ...lab, links: [...lab.links, { id: `ln-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`, from: selectedSource, to: selectedDestination }] });
    setNotice("Network link created");
  }

  function runPing(sourceId = selectedSource, destinationId = selectedDestination, typedCommand?: string) {
    const echoedCommand = typedCommand ?? `ping ${sourceId} ${destinationId}`;
    try {
      const result = simulatePing(lab.devices, lab.links, sourceId, destinationId, events.length + 1, lab.blockedDeviceIds);
      setActivePath(result.event.trace.map((hop) => hop.deviceId));
      setEvents((previous) => [result.event, ...previous].slice(0, 100));
      setTerminal((previous) => [...previous, `$ ${echoedCommand}`, ...result.output].slice(-120));
      setActiveTab("packets");
      setNotice(result.success ? "Simulation completed · packet delivered" : "Simulation completed · packet dropped");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Simulation failed";
      setTerminal((previous) => [...previous, `$ ${echoedCommand}`, `Error: ${message}`].slice(-120));
      setNotice(message);
    }
  }

  function runQuickPing() {
    const source = lab.devices.find((device) => device.id === selectedSource) ?? lab.devices[0];
    const destination = lab.devices.find((device) => device.id === selectedDestination && device.id !== source?.id)
      ?? lab.devices.find((device) => device.id !== source?.id);
    if (!source || !destination) {
      setNotice("Quick ping needs at least two virtual devices.");
      return;
    }
    runCommand(`ping ${source.id} ${destination.id}`);
  }

  function runCommand(raw = command) {
    const input = raw.trim();
    if (!input) return;
    const [verb, ...args] = input.split(/\s+/);
    const output: string[] = [`$ ${input}`];
    if (verb === "help") {
      output.push("help                 Show this command list", "devices              List virtual devices", "ip <device-id>       Show a device address", "ping <source> <dest> Simulate an ICMP echo request", "route <src> <dest>   Trace a simulated path hop-by-hop", "table <device-id>    Inspect directly connected routes", "dns <device-id>      Resolve a lab device name", "http <server-id>     Request a simulated web page", "clear                Clear terminal output");
    } else if (verb === "devices") {
      output.push(...lab.devices.map((device) => `${device.id.padEnd(12)} ${device.ip.padEnd(16)} ${device.name}`));
    } else if (verb === "ip" && args.length === 1) {
      const device = lab.devices.find((item) => item.id === args[0]);
      output.push(device ? `${device.name}: ${device.ip}/24` : "Device not found.");
    } else if (verb === "ping" && args.length === 2) {
      const resolveEndpoint = (value: string) => lab.devices.find((device) => device.id === value || device.ip === value);
      const source = resolveEndpoint(args[0]);
      const destination = resolveEndpoint(args[1]);
      if (!source || !destination) {
        if (!source) output.push(`Error: Unknown ping source "${args[0]}". Use a device ID or IPv4 address.`);
        if (!destination) output.push(`Error: Unknown ping destination "${args[1]}". Use a device ID or IPv4 address.`);
        setTerminal((previous) => [...previous, ...output].slice(-120));
      } else {
        runPing(source.id, destination.id, input);
      }
      setCommand("");
      return;
    } else if (verb === "route" && args.length === 2) {
      const resolveEndpoint = (value: string) => lab.devices.find((device) => device.id === value || device.ip === value);
      const source = resolveEndpoint(args[0]);
      const destination = resolveEndpoint(args[1]);
      const path = source && destination ? findPath(lab.devices, lab.links, source.id, destination.id) : null;
      setActivePath(path ?? []);
      if (path) {
        output.push("Route: " + path.map((id) => lab.devices.find((device) => device.id === id)?.name ?? id).join(" -> "));
        output.push(...path.map((id, index) => {
          const device = lab.devices.find((item) => item.id === id);
          return `Hop ${String(index + 1).padStart(2, "0")}  ${(device?.name ?? id).padEnd(20)} ${device?.ip ?? "unknown"}  ${device?.kind ?? "device"}`;
        }));
      } else {
        output.push("No simulated route between those devices.");
      }
    } else if (verb === "table" && args.length === 1) {
      const target = lab.devices.find((device) => device.id === args[0] || device.ip === args[0]);
      if (!target) {
        output.push(`Device "${args[0]}" not found. Use a device ID or IPv4 address.`);
      } else {
        const adjacentIds = lab.links.flatMap((link) => link.from === target.id ? [link.to] : link.to === target.id ? [link.from] : []);
        output.push(`Routing table for ${target.name} (${target.ip})`);
        output.push("TYPE     DESTINATION        NEXT HOP            INTERFACE");
        if (adjacentIds.length) {
          output.push(...adjacentIds.map((id) => {
            const neighbor = lab.devices.find((device) => device.id === id);
            return `DIRECT   ${neighbor?.ip.padEnd(19) ?? "unknown".padEnd(19)} ${neighbor?.name.padEnd(19) ?? "unknown".padEnd(19)} eth0`;
          }));
        } else output.push("No directly connected routes.");
        output.push("Note: this is a simulated, directly-connected routing table.");
      }
    } else if (verb === "dns" && args.length === 1) {
      const device = lab.devices.find((item) => item.id === args[0] || item.name.toLowerCase() === args[0].toLowerCase());
      output.push(device ? device.name.toLowerCase().replace(/[^a-z0-9-]+/g, "-") + ".lab -> " + device.ip + " (simulated DNS)" : "Name not found in the simulated lab.");
    } else if (verb === "http" && args.length === 1) {
      const device = lab.devices.find((item) => item.id === args[0]);
      if (!device || device.kind !== "server") output.push("HTTP target must be a virtual server ID.");
      else if (findPath(lab.devices, lab.links, selectedSource, device.id)) output.push("HTTP/1.1 200 OK", "Content-Type: text/plain", "PacketLab simulated web service is online.");
      else output.push("Connection failed: no simulated route to server.");
    } else if (verb === "clear") {
      setTerminal([]);
      setCommand("");
      return;
    } else {
      output.push("Unknown command or invalid arguments. Type help.");
    }
    setTerminal((previous) => [...previous, ...output].slice(-120));
    setCommand("");
  }

  function exportPacketEvents() {
    if (events.length === 0) return;
    const report = {
      version: 1,
      exportedAt: new Date().toISOString(),
      simulationOnly: true,
      events
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "packetlab-packet-events.json";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Packet event report exported");
  }

  function exportLab() {
    const blob = new Blob([JSON.stringify(lab, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "packetlab-lab.json";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Lab exported");
  }

  async function importLab(file?: File) {
    if (!file) return;
    try {
      if (file.size > 1_000_000) throw new Error("Lab files must be smaller than 1 MB.");
      const parsed = validateLab(JSON.parse(await file.text()));
      persist(parsed);
      setSelectedSource(parsed.devices[0]?.id ?? "");
      setSelectedDestination(parsed.devices.find((device) => device.id !== parsed.devices[0]?.id)?.id ?? parsed.devices[0]?.id ?? "");
      setEvents([]);
      setNotice("Lab imported and validated");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not import lab file");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function resetLab() {
    const hasUnsavedConfiguration = JSON.stringify(lab) !== JSON.stringify(starterLab);
    if (hasUnsavedConfiguration && !window.confirm("Reset PacketLab to the starter topology? This will replace your current local lab configuration.")) {
      setNotice("Reset cancelled — your current lab is unchanged");
      return;
    }
    persist(starterLab);
    setEvents([]);
    setSelectedSource("ws-01");
    setSelectedDestination("srv-01");
    setActivePath([]);
    setNotice("Starter topology restored");
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand" role="img" aria-label="PacketLab"><span className="brand-mark"><Waypoints size={19} /></span><span>packet<span className="brand-light">lab</span></span><span className="version">PREVIEW 0.1</span></div>
        <div className="topbar-center"><span className="live-dot" /> LOCAL SIMULATION <span className="topbar-divider">/</span> WORKSPACE</div>
        <div className="topbar-actions"><span className="local-status"><ShieldCheck size={14} /> Local-only</span><button className="icon-button" title="Reset lab" aria-label="Reset lab" onClick={resetLab}><RotateCcw size={16} /></button><button className="primary-button" onClick={exportLab}><Download size={15} /> Export lab</button></div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <div className="section-label">WORKSPACE</div>
          <button className={activeTab === "topology" ? "nav-item active" : "nav-item"} onClick={() => setActiveTab("topology")}><Network size={16} /> Network studio <span className="nav-count">{lab.devices.length}</span></button>
          <button className="nav-item" onClick={() => setActiveTab("packets")}><Activity size={16} /> Packet observatory <span className="nav-count">{events.length}</span></button>
          <div className="side-divider" />
          <div className="section-heading"><span>LAB DEVICES</span><button className="tiny-icon" title="Add workstation" aria-label="Add workstation" onClick={() => addDevice("workstation")}><Plus size={15} /></button></div>
          <div className="device-list">{lab.devices.map((device) => {
            const Icon = deviceIcon(device.kind);
            return <button key={device.id} className={selectedSource === device.id ? "device-row selected" : "device-row"} onClick={() => setSelectedSource(device.id)}><span className={`device-icon ${device.kind}`}><Icon size={15} /></span><span className="device-copy"><strong>{device.name}</strong><small>{device.ip}</small></span><span className="device-state" /></button>;
          })}</div>
          <div className="side-divider" />
          <div className="section-label">ADD TO LAB</div>
          <button className="add-row" onClick={() => addDevice("workstation")}><Laptop size={15} /> Workstation <Plus size={14} /></button>
          <button className="add-row" onClick={() => addDevice("router")}><RadioTower size={15} /> Router <Plus size={14} /></button>
          <button className="add-row" onClick={() => addDevice("server")}><Server size={15} /> Server <Plus size={14} /></button>
          <div className="sidebar-bottom"><div className="storage-card"><ShieldCheck size={17} /><div><strong>Your lab stays yours</strong><span>Data saved in this browser</span></div><Check size={14} /></div><div className="side-foot"><span>PACKETLAB COMMUNITY EDITION</span><CircleHelp size={14} /></div></div>
        </aside>

        <main className="main-area">
          <div className="page-heading"><div><div className="eyebrow">NETWORK ENVIRONMENT <span>•</span> LAB-001</div><h1>Network studio</h1><p>Build a topology. Send packets. See what happens.</p></div><div className="heading-actions"><button className="secondary-button" onClick={() => fileInput.current?.click()}><FileUp size={15} /> Import lab</button><input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(event) => void importLab(event.target.files?.[0])} /><button className="secondary-button" onClick={connectDevices}><Link2 size={15} /> Connect selected</button></div></div>

          <div className="metrics-row"><div className="metric"><span className="metric-icon"><Cpu size={16} /></span><div><span>VIRTUAL DEVICES</span><strong>{String(lab.devices.length).padStart(2, "0")}</strong></div></div><div className="metric"><span className="metric-icon"><Link2 size={16} /></span><div><span>NETWORK LINKS</span><strong>{String(lab.links.length).padStart(2, "0")}</strong></div></div><div className="metric"><span className="metric-icon"><Globe size={16} /></span><div><span>REACHABLE FROM SOURCE</span><strong>{String(reachableCount).padStart(2, "0")} <small>/ {lab.devices.length}</small></strong></div></div><div className="metric"><span className="metric-icon"><Activity size={16} /></span><div><span>PACKETS OBSERVED</span><strong>{String(events.length).padStart(2, "0")}</strong></div></div></div>

          <section className="panel topology-panel">
            <div className="panel-header"><div><span className="panel-kicker">01 / TOPOLOGY</span><h2>Virtual network</h2></div><div className="panel-tools"><span className="canvas-legend"><i className="legend-line" /> Link <i className="legend-dot" /> Device</span><button className="tiny-icon" title="Reset starter topology" aria-label="Reset starter topology" onClick={resetLab}><RotateCcw size={15} /></button></div></div>
            <div className="topology-canvas" ref={canvasRef} onPointerDown={handleCanvasPointerDown} onPointerMove={handleCanvasPointerMove} onPointerUp={handleCanvasPointerUp} onPointerCancel={handleCanvasPointerUp}>
              <div className="canvas-grid" />
              <svg className="link-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Network connections">{lab.links.map((link) => {
                const from = lab.devices.find((device) => device.id === link.from);
                const to = lab.devices.find((device) => device.id === link.to);
                if (!from || !to) return null;
                const onPath = activePath.some((_, index) => index < activePath.length - 1 && ((activePath[index] === link.from && activePath[index + 1] === link.to) || (activePath[index] === link.to && activePath[index + 1] === link.from)));
                return <g key={link.id}><line x1={from.x} y1={from.y} x2={to.x} y2={to.y} className={onPath ? "network-link on-path" : "network-link"} /></g>;
              })}</svg>
              {lab.links.map((link) => {
                const from = lab.devices.find((device) => device.id === link.from);
                const to = lab.devices.find((device) => device.id === link.to);
                return from && to
                  ? <span key={`${link.id}-marker`} className="link-node-marker" style={{ left: `${(from.x + to.x) / 2}%`, top: `${(from.y + to.y) / 2}%` }} />
                  : null;
              })}
              {lab.devices.map((device) => {
                const Icon = deviceIcon(device.kind);
                return <button key={device.id} className={`canvas-device ${selectedSource === device.id ? "is-selected" : ""} ${activePath.includes(device.id) ? "on-path" : ""}`} data-device-id={device.id} style={{ left: `${device.x}%`, top: `${device.y}%`, touchAction: "none" }} onClick={() => setSelectedSource(device.id)} onKeyDown={(event) => handleDeviceKeyDown(event, device.id)} aria-label={`Select ${device.name}`} aria-describedby="topology-keyboard-hint" title="Use arrow keys to move; hold Shift to move faster"><span className={`canvas-device-icon ${device.kind}`}><Icon size={20} /></span><strong>{device.name}</strong><small>{device.ip}</small><span className="canvas-device-port" /></button>;
              })}
              <div className="canvas-label canvas-label-top"><span className="status-pip" /> SIMULATION READY</div><div className="canvas-label canvas-label-bottom">LAN / 192.168.10.0/24</div>
            </div>
            <div className="topology-footer"><span><span className="status-pip" /> All systems simulated</span><span id="topology-keyboard-hint">Drag devices or focus one and use arrow keys · saved locally</span></div>
          </section>

          <section className="panel console-panel">
            <div className="panel-header"><div><span className="panel-kicker">02 / COMMAND LINE</span><h2><TerminalSquare size={17} /> Virtual terminal</h2><span className="field-hint">Commands: help, devices, ip, ping, route, dns, http, clear</span></div><div className="panel-tools"><span className="terminal-badge">SANDBOXED</span><button className="tiny-icon" title="Clear terminal" aria-label="Clear terminal" onClick={() => setTerminal([])}><Trash2 size={15} /></button></div></div>
            <div className="terminal-output" role="log" aria-live="polite" aria-relevant="additions" aria-atomic="false">{terminal.map((line, index) => <div key={`${index}-${line}`} className={line.startsWith("$") ? "terminal-line command-line" : "terminal-line"}>{line}</div>)}</div>
            <form className="terminal-input" onSubmit={(event) => { event.preventDefault(); runCommand(); }}><span className="prompt-symbol">›</span><input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="Type a command… (try help)" aria-label="Virtual terminal command" autoComplete="off" /><button type="submit" title="Run command" aria-label="Run command"><ArrowRight size={17} /></button></form>
            <div className="quick-commands"><span>QUICK RUN</span><button onClick={() => runCommand("devices")}>devices</button><button onClick={runQuickPing}>ping {selectedSource || "source"} {selectedDestination || "destination"}</button><button onClick={() => runCommand(`route ${selectedSource} ${selectedDestination}`)}>route selected</button><button onClick={() => runCommand("dns srv-01")}>dns srv-01</button><button onClick={() => runCommand("http srv-01")}>http srv-01</button><button onClick={() => runCommand("help")}>help</button></div>
          </section>

          <section className="panel mission-panel">
            <div className="panel-header"><div><span className="panel-kicker">03 / GUIDED EXERCISE</span><h2><ShieldCheck size={16} /> First response: connectivity</h2></div><span className="mission-progress">{missionProgress}/3 COMPLETE</span></div>
            <p className="mission-intro">Work through a small defensive-networking checklist. Everything runs inside the simulator; no real hosts are contacted.</p>
            <div className="mission-objectives">
              <div className={missionPingDone ? "mission-objective done" : "mission-objective"}><span className="mission-check">{missionPingDone ? <Check size={13} /> : "01"}</span><div><strong>Confirm end-to-end connectivity</strong><small>Send a simulated ICMP echo from the workstation to the web server.</small></div><button className="secondary-button" onClick={() => runPing("ws-01", "srv-01")}>{missionPingDone ? "Run again" : "Run ping"}</button></div>
              <div className={missionRouteDone ? "mission-objective done" : "mission-objective"}><span className="mission-check">{missionRouteDone ? <Check size={13} /> : "02"}</span><div><strong>Explain the packet path</strong><small>Trace the route through the virtual edge router.</small></div><button className="secondary-button" onClick={() => runCommand("route ws-01 srv-01")}>{missionRouteDone ? "Trace again" : "Trace route"}</button></div>
              <div className={missionSubnetDone ? "mission-objective done" : "mission-objective"}><span className="mission-check">{missionSubnetDone ? <Check size={13} /> : "03"}</span><div><strong>Check the LAN subnet</strong><small>Verify a /24 has a 255.255.255.0 mask and 254 usable host addresses.</small></div><button className="secondary-button" onClick={() => { if (subnet?.prefix === 24 && subnet.netmask === "255.255.255.0" && subnet.usableHosts === 254) { setMissionSubnetDone(true); setNotice("Subnet objective complete"); } else { setMissionSubnetDone(false); setNotice("Set a valid /24 subnet with 254 usable hosts first"); } }}>{missionSubnetDone ? "Verified" : "Verify subnet"}</button></div>
            </div>
            <div className="mission-footer">{missionProgress === 3 ? "Exercise complete — you checked connectivity, route discovery, and subnet capacity." : "Hint: use the route and subnet tools to explain why a packet can or cannot reach its destination."}</div>
          </section>
        </main>

        <aside className="inspector">
          <div className="inspector-header"><div><span className="panel-kicker">INSPECTOR</span><h2>Traffic monitor</h2></div><button className="tiny-icon" title="Filter events" aria-label="Filter events" onClick={() => setFilter(filter === "all" ? "dropped" : filter === "dropped" ? "delivered" : "all")}><Filter size={15} /></button></div>
          <div className="inspector-tabs"><button className={activeTab === "topology" ? "active" : ""} onClick={() => setActiveTab("topology")}><Waypoints size={14} /> Overview</button><button className={activeTab === "packets" ? "active" : ""} onClick={() => setActiveTab("packets")}><Activity size={14} /> Packets <span>{events.length}</span></button></div>
          <div className="inspector-content">
            {activeTab === "topology" ? <><div className="inspector-block"><div className="section-heading"><span>SIMULATION CONTROL</span><span className="small-muted">ICMP</span></div><label className="field-label" htmlFor="source-select">Source device</label><select id="source-select" value={selectedSource} onChange={(event) => setSelectedSource(event.target.value)}>{lab.devices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}</select><label className="field-label" htmlFor="destination-select">Destination device</label><select id="destination-select" value={selectedDestination} onChange={(event) => setSelectedDestination(event.target.value)}>{lab.devices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}</select><button className="run-button" onClick={() => runPing()}><Play size={15} fill="currentColor" /> Run ping simulation</button><p className="field-hint">Simulated traffic only. No packets leave this browser.</p></div><div className="inspector-block"><div className="section-heading"><span>SELECTED DEVICE</span><span className="small-muted">DETAILS</span></div>{selected ? <div className="selected-device"><span className={`device-icon large ${selected.kind}`}>{(() => { const Icon = deviceIcon(selected.kind); return <Icon size={20} />; })()}</span><div><strong>{selected.name}</strong><span>{selected.kind.toUpperCase()}</span></div></div> : <p className="empty-state">Select a device in the topology.</p>}{selected && <><div className="detail-list"><div><span>IPv4 address</span><strong>{selected.ip}</strong></div><div><span>Subnet</span><strong>255.255.255.0</strong></div><div><span>Interface</span><strong>eth0</strong></div><div><span>Connectivity</span><strong className="detail-ok"><span className="status-pip" /> Virtual</strong></div></div><div className="device-editor"><div className="section-heading"><span>EDIT PROPERTIES</span><span className="small-muted">LOCAL</span></div><label className="field-label" htmlFor="device-name">Device name</label><input id="device-name" className="property-input" value={editName} maxLength={48} onChange={(event) => setEditName(event.target.value)} /><label className="field-label" htmlFor="device-ip">IPv4 address</label><input id="device-ip" className="property-input" value={editIp} inputMode="decimal" onChange={(event) => setEditIp(event.target.value)} /><div className="property-actions"><button className="secondary-button" onClick={saveSelectedDevice}><Save size={13} /> Save</button><button className="danger-button" onClick={deleteSelectedDevice}><Trash2 size={13} /> Remove</button></div></div></>}</div><div className="inspector-block"><div className="section-heading"><span>NETWORK LINKS</span><span className="small-muted">{lab.links.length} TOTAL</span></div>{lab.links.length ? lab.links.map((link) => <div className="link-editor-row" key={link.id}><span>{lab.devices.find((device) => device.id === link.from)?.name ?? link.from} <ArrowRight size={11} /> {lab.devices.find((device) => device.id === link.to)?.name ?? link.to}</span><button className="tiny-icon" title="Remove network link" aria-label={`Remove link ${link.id}`} onClick={() => deleteLink(link.id)}><X size={13} /></button></div>) : <p className="empty-state compact">No links. Select two devices and connect them.</p>}</div><div className="inspector-block"><div className="section-heading"><span>SIMULATED FIREWALL</span><span className="small-muted">DENY LIST</span></div><p className="field-hint">Block or allow traffic to a virtual device. Rules are saved with this lab.</p>{lab.devices.map((device) => {
  const ruleHits = events.filter((event) =>
    event.status === "dropped" &&
    event.message.startsWith("Blocked by simulated firewall policy") &&
    event.trace[event.trace.length - 1]?.deviceId === device.id
  ).length;
  return <div className="firewall-rule-row" key={device.id}><div><strong>{device.name}</strong><small>{device.ip}</small><small className="firewall-hit-count">{ruleHits} logged hit{ruleHits === 1 ? "" : "s"}</small></div><button className={lab.blockedDeviceIds.includes(device.id) ? "firewall-toggle blocked" : "firewall-toggle"} onClick={() => toggleFirewall(device.id)}>{lab.blockedDeviceIds.includes(device.id) ? "Blocked" : "Allowing"}</button></div>;
})}</div><div className="inspector-block"><div className="section-heading"><span>SUBNET CALCULATOR</span><span className="small-muted">CIDR</span></div><label className="field-label" htmlFor="subnet-cidr">IPv4 network / prefix</label><input id="subnet-cidr" className="property-input" value={subnetInput} onChange={(event) => setSubnetInput(event.target.value)} placeholder="192.168.1.0/24" />{subnet ? <div className="detail-list subnet-results"><div><span>Network</span><strong>{subnet.network}/{subnet.prefix}</strong></div><div><span>Netmask</span><strong>{subnet.netmask}</strong></div><div><span>Broadcast</span><strong>{subnet.broadcast}</strong></div><div><span>Usable hosts</span><strong>{subnet.usableHosts.toLocaleString()}</strong></div><div><span>Host range</span><strong>{subnet.firstHost} – {subnet.lastHost}</strong></div></div> : <p className="field-hint">Enter a valid IPv4 CIDR such as 10.0.0.0/24.</p>}</div><div className="inspector-block help-block"><span className="help-icon"><Command size={16} /></span><div><strong>Build, then observe.</strong><p>Add virtual devices, connect them, and run a ping. Every result appears in the traffic monitor.</p></div></div></> : <div className="packet-list"><div className="section-heading"><span>EVENT LOG</span><div className="event-actions"><button className="text-button" onClick={exportPacketEvents} disabled={events.length === 0}>Export JSON</button><button className="text-button" onClick={() => { setEvents([]); setEventQuery(""); setFilter("all"); }}>Clear</button></div></div><div className="filter-row"><button className={filter === "all" ? "selected" : ""} onClick={() => setFilter("all")}>All</button><button className={filter === "delivered" ? "selected" : ""} onClick={() => setFilter("delivered")}>Delivered</button><button className={filter === "dropped" ? "selected" : ""} onClick={() => setFilter("dropped")}>Dropped</button></div><input className="event-search" aria-label="Filter packet events" type="search" value={eventQuery} onChange={(event) => setEventQuery(event.target.value)} placeholder="Search IP, device, or result…" />{visibleEvents.length ? visibleEvents.map((event) => <article className="packet-event" key={event.id}><div className="event-top"><span className={event.status === "delivered" ? "event-status success" : "event-status failure"}>{event.status === "delivered" ? <Check size={12} /> : <X size={12} />}{event.status}</span><span>{event.protocol}</span></div><div className="event-route"><span>{event.source}</span><ArrowRight size={13} /><span>{event.destination}</span></div>{event.trace.length > 0 && <div className="event-trace" aria-label="Simulated packet path"><span className="event-trace-label">PATH</span>{event.trace.map((hop, index) => <span className="event-trace-hop" key={hop.deviceId} title={`${hop.deviceId} · ${hop.ip}`}><span className="event-trace-node"><strong>{hop.name}</strong><small>{hop.ip}</small></span>{index < event.trace.length - 1 && <ArrowRight size={12} aria-hidden="true" />}</span>)}</div>}<p>{event.message}</p><time>{new Date(event.time).toLocaleTimeString()}</time></article>) : <div className="empty-state"><Activity size={23} /><strong>{events.length > 0 ? "No matching events" : "No packets yet"}</strong><span>{events.length > 0 ? "Change the search or status filter." : "Run a simulation to inspect network traffic."}</span></div>}</div>}
          </div>
          <div className="inspector-footer"><span role="status" aria-live="polite" aria-atomic="true"><span className="status-pip" /> {notice}</span></div>
        </aside>
      </div>
      <footer className="app-footer"><span>PACKETLAB <span className="footer-separator">/</span> BUILT FOR LEARNING</span><span><ShieldCheck size={13} /> LOCAL-FIRST BY DESIGN <span className="footer-separator">·</span> NO CLOUD ACCOUNT</span></footer>
    </div>
  );
}
