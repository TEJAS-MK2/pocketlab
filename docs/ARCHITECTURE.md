# PacketLab architecture

## Product boundary

PacketLab is a browser-first cybersecurity learning simulator. The core application must remain useful without an account, remote API, AI service, or server. Simulated actions must never silently become real network actions.

## Current implementation

- **UI:** React + TypeScript, with a responsive three-column workspace.
- **Build:** Vite; static output in `dist/`.
- **Simulation domain:** pure functions in `src/engine/network.ts` model IPv4 validation, graph reachability, shortest-path route discovery, CIDR subnet calculations, ping outcomes, and import validation.
- **Packet decision log:** each simulated ICMP event includes typed endpoint, route, hop-ordered neighbor-resolution, router-forwarding/TTL, firewall, and delivery/drop steps. TTL expiry is enforced at the transit router that reaches zero; the recorded path ends where the packet was dropped. Generated MAC-like addresses are deterministic teaching artifacts, not real interface addresses; the current graph model does not implement configurable subnet masks, real ARP caches, or a full routing table.
- **Firewall:** a local deny-list is stored in the version-one lab snapshot and enforced by simulated ping. Older version-one files without the field load with an empty rule set.
- **Topology editing:** device properties, links, positions, and administrative state for virtual `eth0` interfaces and individual links are edited in the UI or allowlisted virtual terminal and saved to the local workspace. Down interfaces and down links are excluded from the active simulation graph. Older version-one records without these state fields are normalized to up during validation.
- **Learning:** the first guided exercise derives progress from simulated ping/route evidence and explicit subnet verification; progress is stored in a separate versioned localStorage record with validation, corruption backup, export, and reset controls.
- **Interface state:** ping, route discovery, and simulated HTTP all honor administrative interface state; a down endpoint or intermediate interface is reported as the cause instead of silently using disabled links.
- **Persistence:** tested helpers in `src/engine/persistence.ts` load the versioned `packetlab.workspace.v1` workspace and separate guided-progress record. Corrupt raw records are backed up under separate local keys; exported JSON remains the portable backup.
- **Offline shell:** a same-origin service worker precaches the HTML shell, manifest, icon, and built JS/CSS assets, then uses network-first navigation with a cached fallback.
- **Tests:** Vitest covers address validation, graph connectivity, route discovery, CIDR calculations, ping success/failure, firewall behavior, import validation, legacy workspace compatibility, corrupt workspace/progress recovery, and storage-unavailable fallback. Playwright tests cover the production build, guided progress, terminal behavior, firewall rules, local persistence, malformed imports, accessibility basics, keyboard and pointer topology editing, mobile overflow, and offline startup.
- **Automation:** `PacketLab CI` runs the blocking dependency audit, typecheck, unit tests, browser/offline tests, and production build. The Pages workflow deploys the exact tested commit only after CI succeeds on `main`; manual deployment also runs browser tests.
- **No backend:** no cloud authentication, database, telemetry, or API key is required.

## Intended module boundaries

```text
src/
  app/          application shell and navigation (future extraction)
  components/   reusable interface components (future extraction)
  engine/       deterministic simulation domain and tested local persistence helpers
  features/     topology, packet inspector, terminal, scenarios (future extraction)
  storage/      formal schema migrations (future work if the format evolves)
  test/         shared test fixtures (future extraction)
public/
  sw.js         offline app-shell cache
  manifest.webmanifest
  packetlab-icon.svg
```

The initial release keeps some presentation code together in `src/App.tsx` to establish the end-to-end product. Split modules as the feature surface grows, not just to create empty folders.

## Data flow

1. The UI asks the domain engine to validate or simulate a lab action.
2. The engine returns typed results; it does not access the DOM, localStorage, network, or shell.
3. The UI records simulation events in memory.
4. Workspace changes are serialized to localStorage. Workspace and guided-progress reads validate stored data and preserve corrupt raw records under separate backup keys. Import data is size-limited and validated before replacing state.
5. Packet event history includes an explainable snapshot of simulation decisions; each generated neighbor MAC-like address is derived locally from the virtual device ID.
6. Users can export a JSON copy at any time.
6. On the first online visit, the service worker caches the app shell and its built assets for later offline reopening.

## Safety invariants

- The terminal accepts only explicit, documented commands, including `interfaces`, `interface <device> up|down`, `links`, and `link <id> up|down`. It must never call `eval`, a system shell, or arbitrary code execution.
- Packet simulation is local and deterministic; it does not scan real hosts or open sockets.
- Imported data must be treated as untrusted and validated at the boundary.
- Keep storage local by default; never add cloud authentication as a prerequisite.
- AI is deferred. The core product and lessons must work with no AI credentials or network connection.
- The service worker caches only same-origin GET requests inside its own scope.

## Persistence and compatibility

Treat the stored workspace as a versioned file format. Current tests preserve compatibility with version-one workspaces that predate firewall rules and cover corrupt-record backup behavior. A formal schema-migration layer remains future work for the next actual schema change; do not invent a migration without a real prior format to support.

## Quality gates

Before merging a change, run:

```bash
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm audit --audit-level=high
npm run build
```

The GitHub Actions workflows run these checks on pushes to `main`. GitHub Pages deployment is not considered successful until its run is green and the published URL has been checked.
