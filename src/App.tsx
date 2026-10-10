import { useMemo, useRef, useState } from "react";
import {
  Activity, ArrowRight, Check, ChevronDown, CircleHelp,
  Command, Cpu, Download, FileUp, Filter, Globe, Laptop, Link2, Network,
  Play, Plus, RadioTower, RotateCcw, Server, ShieldCheck, TerminalSquare,
  Trash2, Waypoints, X
} from "lucide-react";
import {
  type DeviceKind, type LabDevice, type LabPacketEvent, type LabSnapshot,
  simulatePing, starterLab, validateLab
} from "./engine/network";

const STORAGE_KEY = "packetlab.workspace.v1";
const deviceIcon = (kind: DeviceKind) => kind === "router" ? RadioTower : kind === "server" ? Server : Laptop;

function readSavedLab(): LabSnapshot {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? validateLab(JSON.parse(raw)) : starterLab;
  } catch {
    return starterLab;
  }
}

export default function App() {
  const [lab, setLab] = useState<LabSnapshot>(readSavedLab);
  const [events, setEvents] = useState<LabPacketEvent[]>([]);
  const [terminal, setTerminal] = useState<string[]>(["PacketLab terminal v0.1.0", "Simulation environment ready.", "Type help to view available commands."]);
  const [command, setCommand] = useState("");
  const [selectedSource, setSelectedSource] = useState(() => lab.devices[0]?.id ?? "");
  const [selectedDestination, setSelectedDestination] = useState(() => lab.devices.find((device) => device.id !== lab.devices[0]?.id)?.id ?? lab.devices[0]?.id ?? "");
  const [notice, setNotice] = useState("Starter topology loaded");
  const [activeTab, setActiveTab] = useState<"topology" | "packets">("topology");
  const [filter, setFilter] = useState("all");
  const fileInput = useRef<HTMLInputElement>(null);

  const selected = lab.devices.find((device) => device.id === selectedSource);
  const reachableCount = useMemo(() => {
    if (!selected) return 0;
    const reachable = new Set<string>([selected.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const link of lab.links) {
        if (reachable.has(link.from) && !reachable.has(link.to)) { reachable.add(link.to); changed = true; }
        if (reachable.has(link.to) && !reachable.has(link.from)) { reachable.add(link.from); changed = true; }
      }
    }
    return reachable.size;
  }, [lab, selected]);
  const visibleEvents = events.filter((event) => filter === "all" || event.status === filter);

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
    const count = lab.devices.filter((device) => device.kind === kind).length + 1;
    const prefix = kind === "router" ? "rt" : kind === "server" ? "srv" : "ws";
    const device: LabDevice = {
      id: `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name: `${kind === "router" ? "ROUTER" : kind === "server" ? "SERVER" : "WORKSTATION"}-${String(count).padStart(2, "0")}`,
      kind,
      ip: kind === "router" ? `192.168.10.${count + 1}` : kind === "server" ? `192.168.10.${20 + count}` : `192.168.10.${10 + count}`,
      x: 20 + (lab.devices.length * 13) % 62,
      y: 22 + (lab.devices.length * 19) % 55
    };
    persist({ ...lab, devices: [...lab.devices, device] });
    setSelectedSource(device.id);
    setNotice(`${device.name} added to the lab`);
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
    persist({ ...lab, links: [...lab.links, { id: `ln-${Date.now().toString(36)}`, from: selectedSource, to: selectedDestination }] });
    setNotice("Network link created");
  }

  function runPing(sourceId = selectedSource, destinationId = selectedDestination) {
    try {
      const result = simulatePing(lab.devices, lab.links, sourceId, destinationId, events.length + 1);
      setEvents((previous) => [result.event, ...previous].slice(0, 100));
      setTerminal((previous) => [...previous, `$ ping ${lab.devices.find((d) => d.id === destinationId)?.ip ?? destinationId}`, ...result.output].slice(-120));
      setActiveTab("packets");
      setNotice(result.success ? "Simulation completed · packet delivered" : "Simulation completed · packet dropped");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Simulation failed");
    }
  }

  function runCommand(raw = command) {
    const input = raw.trim();
    if (!input) return;
    const [verb, ...args] = input.split(/\s+/);
    const output: string[] = [`$ ${input}`];
    if (verb === "help") {
      output.push("help                 Show this command list", "devices              List virtual devices", "ip <device-id>       Show a device address", "ping <source> <dest> Simulate an ICMP echo request", "clear                Clear terminal output");
    } else if (verb === "devices") {
      output.push(...lab.devices.map((device) => `${device.id.padEnd(12)} ${device.ip.padEnd(16)} ${device.name}`));
    } else if (verb === "ip" && args.length === 1) {
      const device = lab.devices.find((item) => item.id === args[0]);
      output.push(device ? `${device.name}: ${device.ip}/24` : "Device not found.");
    } else if (verb === "ping" && args.length === 2) {
      runPing(args[0], args[1]);
      setCommand("");
      return;
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
    persist(starterLab);
    setEvents([]);
    setSelectedSource("ws-01");
    setSelectedDestination("srv-01");
    setNotice("Starter topology restored");
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="PacketLab home"><span className="brand-mark"><Waypoints size={19} /></span><span>packet<span className="brand-light">lab</span></span><span className="version">PREVIEW 0.1</span></a>
        <div className="topbar-center"><span className="live-dot" /> LOCAL SIMULATION <span className="topbar-divider">/</span> WORKSPACE <ChevronDown size={13} /></div>
        <div className="topbar-actions"><span className="local-status"><ShieldCheck size={14} /> Local-only</span><button className="icon-button" title="Reset lab" onClick={resetLab}><RotateCcw size={16} /></button><button className="primary-button" onClick={exportLab}><Download size={15} /> Export lab</button></div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <div className="section-label">WORKSPACE</div>
          <button className="nav-item active"><Network size={16} /> Network studio <span className="nav-count">{lab.devices.length}</span></button>
          <button className="nav-item" onClick={() => setActiveTab("packets")}><Activity size={16} /> Packet observatory <span className="nav-count">{events.length}</span></button>
          <div className="side-divider" />
          <div className="section-heading"><span>LAB DEVICES</span><button className="tiny-icon" title="Add workstation" onClick={() => addDevice("workstation")}><Plus size={15} /></button></div>
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
            <div className="panel-header"><div><span className="panel-kicker">01 / TOPOLOGY</span><h2>Virtual network</h2></div><div className="panel-tools"><span className="canvas-legend"><i className="legend-line" /> Link <i className="legend-dot" /> Device</span><button className="tiny-icon" title="Reset starter topology" onClick={resetLab}><RotateCcw size={15} /></button></div></div>
            <div className="topology-canvas">
              <div className="canvas-grid" />
              <svg className="link-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Network connections">{lab.links.map((link) => {
                const from = lab.devices.find((device) => device.id === link.from);
                const to = lab.devices.find((device) => device.id === link.to);
                if (!from || !to) return null;
                return <g key={link.id}><line x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="network-link" /><circle cx={(from.x + to.x) / 2} cy={(from.y + to.y) / 2} r=".7" className="link-node" /></g>;
              })}</svg>
              {lab.devices.map((device) => {
                const Icon = deviceIcon(device.kind);
                return <button key={device.id} className={selectedSource === device.id ? "canvas-device is-selected" : "canvas-device"} style={{ left: `${device.x}%`, top: `${device.y}%` }} onClick={() => setSelectedSource(device.id)} aria-label={`Select ${device.name}`}><span className={`canvas-device-icon ${device.kind}`}><Icon size={20} /></span><strong>{device.name}</strong><small>{device.ip}</small><span className="canvas-device-port" /></button>;
              })}
              <div className="canvas-label canvas-label-top"><span className="status-pip" /> SIMULATION READY</div><div className="canvas-label canvas-label-bottom">LAN / 192.168.10.0/24</div>
            </div>
            <div className="topology-footer"><span><span className="status-pip" /> All systems simulated</span><span>Drag-and-drop positioning · coming soon</span></div>
          </section>

          <section className="panel console-panel">
            <div className="panel-header"><div><span className="panel-kicker">02 / COMMAND LINE</span><h2><TerminalSquare size={17} /> Virtual terminal</h2></div><div className="panel-tools"><span className="terminal-badge">SANDBOXED</span><button className="tiny-icon" title="Clear terminal" onClick={() => setTerminal([])}><Trash2 size={15} /></button></div></div>
            <div className="terminal-output" role="log" aria-live="polite">{terminal.map((line, index) => <div key={`${index}-${line}`} className={line.startsWith("$") ? "terminal-line command-line" : "terminal-line"}>{line}</div>)}</div>
            <form className="terminal-input" onSubmit={(event) => { event.preventDefault(); runCommand(); }}><span className="prompt-symbol">›</span><input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="Type a command… (try help)" aria-label="Virtual terminal command" autoComplete="off" /><button type="submit" title="Run command"><ArrowRight size={17} /></button></form>
            <div className="quick-commands"><span>QUICK RUN</span><button onClick={() => runCommand("devices")}>devices</button><button onClick={() => runCommand("ping ws-01 srv-01")}>ping ws-01 srv-01</button><button onClick={() => runCommand("help")}>help</button></div>
          </section>
        </main>

        <aside className="inspector">
          <div className="inspector-header"><div><span className="panel-kicker">INSPECTOR</span><h2>Traffic monitor</h2></div><button className="tiny-icon" title="Filter events" onClick={() => setFilter(filter === "all" ? "dropped" : filter === "dropped" ? "delivered" : "all")}><Filter size={15} /></button></div>
          <div className="inspector-tabs"><button className={activeTab === "topology" ? "active" : ""} onClick={() => setActiveTab("topology")}><Waypoints size={14} /> Overview</button><button className={activeTab === "packets" ? "active" : ""} onClick={() => setActiveTab("packets")}><Activity size={14} /> Packets <span>{events.length}</span></button></div>
          <div className="inspector-content">
            {activeTab === "topology" ? <><div className="inspector-block"><div className="section-heading"><span>SIMULATION CONTROL</span><span className="small-muted">ICMP</span></div><label className="field-label" htmlFor="source-select">Source device</label><select id="source-select" value={selectedSource} onChange={(event) => setSelectedSource(event.target.value)}>{lab.devices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}</select><label className="field-label" htmlFor="destination-select">Destination device</label><select id="destination-select" value={selectedDestination} onChange={(event) => setSelectedDestination(event.target.value)}>{lab.devices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}</select><button className="run-button" onClick={() => runPing()}><Play size={15} fill="currentColor" /> Run ping simulation</button><p className="field-hint">Simulated traffic only. No packets leave this browser.</p></div><div className="inspector-block"><div className="section-heading"><span>SELECTED DEVICE</span><span className="small-muted">DETAILS</span></div>{selected ? <div className="selected-device"><span className={`device-icon large ${selected.kind}`}>{(() => { const Icon = deviceIcon(selected.kind); return <Icon size={20} />; })()}</span><div><strong>{selected.name}</strong><span>{selected.kind.toUpperCase()}</span></div></div> : <p className="empty-state">Select a device in the topology.</p>}{selected && <div className="detail-list"><div><span>IPv4 address</span><strong>{selected.ip}</strong></div><div><span>Subnet</span><strong>255.255.255.0</strong></div><div><span>Interface</span><strong>eth0</strong></div><div><span>Connectivity</span><strong className="detail-ok"><span className="status-pip" /> Virtual</strong></div></div>}</div><div className="inspector-block help-block"><span className="help-icon"><Command size={16} /></span><div><strong>Build, then observe.</strong><p>Add virtual devices, connect them, and run a ping. Every result appears in the traffic monitor.</p></div></div></> : <div className="packet-list"><div className="section-heading"><span>EVENT LOG</span><button className="text-button" onClick={() => setEvents([])}>Clear</button></div><div className="filter-row"><button className={filter === "all" ? "selected" : ""} onClick={() => setFilter("all")}>All</button><button className={filter === "delivered" ? "selected" : ""} onClick={() => setFilter("delivered")}>Delivered</button><button className={filter === "dropped" ? "selected" : ""} onClick={() => setFilter("dropped")}>Dropped</button></div>{visibleEvents.length ? visibleEvents.map((event) => <article className="packet-event" key={event.id}><div className="event-top"><span className={event.status === "delivered" ? "event-status success" : "event-status failure"}>{event.status === "delivered" ? <Check size={12} /> : <X size={12} />}{event.status}</span><span>{event.protocol}</span></div><div className="event-route"><span>{event.source}</span><ArrowRight size={13} /><span>{event.destination}</span></div><p>{event.message}</p><time>{new Date(event.time).toLocaleTimeString()}</time></article>) : <div className="empty-state"><Activity size={23} /><strong>No packets yet</strong><span>Run a simulation to inspect network traffic.</span></div>}</div>}
          </div>
          <div className="inspector-footer"><span><span className="status-pip" /> {notice}</span></div>
        </aside>
      </div>
      <footer className="app-footer"><span>PACKETLAB <span className="footer-separator">/</span> BUILT FOR LEARNING</span><span><ShieldCheck size={13} /> LOCAL-FIRST BY DESIGN <span className="footer-separator">·</span> NO CLOUD ACCOUNT</span></footer>
    </div>
  );
}
