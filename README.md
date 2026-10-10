# PacketLab

**A local-first, browser-based cybersecurity network simulation lab.**

PacketLab is an educational environment for building virtual network topologies, simulating connectivity, and inspecting packet events. It is deliberately browser-only: it does not open sockets, scan external hosts, or send traffic onto a real network.

## Current features

- Interactive topology view with virtual workstations, routers, servers, and links.
- Deterministic, in-memory link connectivity and simulated ICMP ping.
- An allowlisted virtual terminal with `help`, `devices`, `ip`, `ping`, `route`, `dns`, `http`, and `clear`.
- Packet event log with delivered/dropped filters.
- Drag-and-drop topology positioning, editable device names/IP addresses, device removal, and link management.
- IPv4 CIDR subnet calculator, hop-by-hop route discovery with highlighted path links, directly-connected routing tables via `table <device-id-or-ip>`, deterministic simulated ping TTL/latency based on the shortest topology path, and simulated DNS/HTTP responses.
- Keyboard topology positioning (arrow keys; Shift for larger steps), reduced-motion support, and visible focus states.
- Local firewall deny rules that persist with a lab and affect simulated ping results.
- A guided connectivity exercise with locally tracked progress.
- Local workspace persistence using browser storage, with a raw-data backup when saved workspace JSON is corrupt.
- Validated JSON import/export with a 1 MB import limit, non-empty command-safe IDs, control-character rejection, and model limits of 200 devices / 2,000 links.
- Offline app-shell caching after the first successful online visit.
- Installed-app icons for standard, maskable, and Apple touch launchers.
- Responsive interface, unit tests, dependency audit, and CI.
- GitHub Pages deployment workflow.

## Run locally

Requirements: Node.js 22.12 or newer and npm.

The committed `package-lock.json` pins the dependency tree. CI and deployment use `npm ci` with npm caching for reproducible installs.

```bash
npm ci
npm run dev
```

Run checks before committing:

```bash
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
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

The deployment workflow is at [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). It typechecks, tests, builds the static site, and deploys it to GitHub Pages; dependency auditing runs separately as an informational, non-gating job. Enable Pages manually under **Settings → Pages → Build and deployment → Source: GitHub Actions** before the first deployment. The workflow status and published URL should be checked after every release.

The repository includes `public/packetlab-icon-192.png` (192×192), `public/packetlab-icon-512.png` (512×512), `public/packetlab-icon-maskable-512.png` (512×512 with safe-area padding), and `public/apple-touch-icon.png` (180×180).

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
- [x] Playwright browser regression and offline tests verified green in GitHub Actions
- [x] Device property editor, drag-and-drop, and link management
- [x] Subnet calculator, route discovery, simulated DNS/HTTP
- [x] Guided defensive-networking exercise
- [x] Local firewall deny rules and rule effects in ping simulations
- [x] Routing table inspection and packet-path visualization
- [ ] Accessibility audit and keyboard alternatives for drag-and-drop
- [ ] Storage migration and backup recovery tests

## License

MIT. See [LICENSE](LICENSE).

---

Built as an open-source learning project by **TEJAS-MK2**.
