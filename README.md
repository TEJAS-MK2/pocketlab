# PacketLab

**A local-first, browser-based cybersecurity network simulation lab.**

PacketLab is an educational environment for building small virtual network topologies, simulating connectivity, and inspecting packet events. The initial release is deliberately browser-only: it does not open sockets, scan external hosts, or send traffic onto a real network.

## Current features

- Interactive topology view with virtual workstations, routers, and servers.
- Deterministic, in-memory link connectivity and simulated ICMP ping.
- A sandboxed command parser with `help`, `devices`, `ip`, `ping`, and `clear`.
- Packet event log with delivered/dropped filters.
- Local workspace persistence using browser storage.
- Validated JSON import and export, with a 1 MB import limit.
- Responsive dark interface and automated TypeScript/unit-test CI.

## Run locally

Requirements: Node.js 22 or newer and npm.

```bash
npm install
npm run dev
```

Run checks before committing:

```bash
npm run typecheck
npm test
npm run build
```

## How to try it

1. Open the app and inspect the starter topology.
2. Select a source and destination in the inspector.
3. Run a ping simulation and open the Packets tab to inspect the event.
4. Try `help` in the virtual terminal for the supported command list.
5. Add a virtual device or connect two selected devices.
6. Export the lab as JSON to keep a portable copy.

## Safety and privacy

- All network behavior in this version is simulated by local application code.
- Commands are parsed by an explicit allowlist; they are not passed to a system shell.
- Imported JSON is validated before it replaces the current lab.
- Workspace data stays in the browser's local storage unless the user exports it.
- No cloud account or backend is required.

PacketLab is a learning simulator, not a real network scanner or a substitute for a properly isolated security lab.

## Roadmap

- [x] First browser workspace and responsive layout
- [x] Virtual devices, links, and connectivity simulation
- [x] Virtual terminal and packet event log
- [x] Local save, validated import, and export
- [x] Initial unit tests and GitHub Actions CI
- [ ] Device property editor and interactive drag-and-drop
- [ ] Subnet calculator and routing tables
- [ ] Simulated DNS/HTTP services and firewall rules
- [ ] Guided blue-team missions with scoring
- [ ] Accessibility and performance audit
- [ ] GitHub Pages deployment and production-browser verification

## Contributing

Bug reports and focused improvements are welcome. Keep the simulation deterministic where practical, add tests for behavior changes, and never introduce real external scanning as a side effect of a simulated command.

## License

MIT. See [LICENSE](LICENSE).

---

Built as an open-source learning project by **TEJAS-MK2**.
