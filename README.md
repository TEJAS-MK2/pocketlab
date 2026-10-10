# PacketLab

**A local-first, browser-based cybersecurity network simulation lab.**

PacketLab is an educational environment for building virtual network topologies, simulating connectivity, and inspecting packet events. It is deliberately browser-only: it does not open sockets, scan external hosts, or send traffic onto a real network.

## Current features

- Interactive topology view with virtual workstations, routers, servers, and links.
- Deterministic, in-memory link connectivity and simulated ICMP ping.
- An allowlisted virtual terminal with `help`, `devices`, `ip`, `ping`, and `clear`.
- Packet event log with delivered/dropped filters.
- Local workspace persistence using browser storage.
- Validated JSON import/export with a 1 MB import limit.
- Offline app-shell caching after the first successful online visit.
- Responsive interface, unit tests, dependency audit, and CI.
- GitHub Pages deployment workflow.

## Run locally

Requirements: Node.js 22.12 or newer and npm.

```bash
npm install
npm run dev
```

Run checks before committing:

```bash
npm run typecheck
npm test
npm audit --audit-level=high
npm run build
```

## How to try it

1. Open the app and inspect the starter topology.
2. Select a source and destination in the inspector.
3. Run a ping simulation and open the Packets tab to inspect the event.
4. Try `help` in the virtual terminal for the supported command list.
5. Add a virtual device or connect two selected devices.
6. Export the lab as JSON to keep a portable copy.

## Offline behavior

The first visit requires a network connection. After the service worker installs, PacketLab caches the application shell and built JavaScript/CSS assets so the app can reopen offline. Workspace data stays in browser storage; exporting a JSON file is recommended for backups. Browser settings may clear cached assets or local storage.

## Deployment

The deployment workflow is at [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). It typechecks, tests, audits dependencies, builds the static site, and deploys it to GitHub Pages. The workflow status and published URL should be checked after every release.

## Safety and privacy

- All network behavior is simulated by local application code.
- Commands are parsed by an explicit allowlist; they are not passed to a system shell.
- Imported JSON is validated before it replaces the current lab.
- Workspace data stays in the browser's local storage unless the user exports it.
- No cloud account, backend, telemetry, or AI service is required for the core application.

PacketLab is a learning simulator, not a real network scanner or a substitute for a properly isolated security lab.

## Project documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)

## Roadmap

- [x] React + TypeScript + Vite application foundation
- [x] Virtual devices, links, and connectivity simulation
- [x] Virtual terminal and packet event log
- [x] Local save, validated import, and export
- [x] Initial domain tests, dependency audit, and CI workflow
- [x] Offline app-shell caching
- [x] GitHub Pages deployment workflow
- [ ] Browser-level regression tests and accessibility audit
- [ ] Device property editor and interactive drag-and-drop
- [ ] Subnet calculator, routing tables, simulated DNS/HTTP, and firewall rules
- [ ] Guided blue-team missions with scoring
- [ ] Storage migration and backup recovery tests

## License

MIT. See [LICENSE](LICENSE).

---

Built as an open-source learning project by **TEJAS-MK2**.
