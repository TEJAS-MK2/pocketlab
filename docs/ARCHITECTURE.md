# PacketLab architecture

## Product boundary

PacketLab is a browser-first cybersecurity learning simulator. The core application must remain useful without an account, remote API, AI service, or server. Simulated actions must never silently become real network actions.

## Current implementation

- **UI:** React + TypeScript, with a responsive three-column workspace.
- **Build:** Vite; static output in `dist/`.
- **Simulation domain:** pure functions in `src/engine/network.ts` model IPv4 validation, graph reachability, shortest-path route discovery, CIDR subnet calculations, ping outcomes, and import validation.
- **Firewall:** a local deny-list is stored in the version-one lab snapshot and enforced by simulated ping. Older version-one files without the field load with an empty rule set.
- **Topology editing:** device properties, links, and positions are edited in the UI and saved to the local workspace. Drag interactions are pointer-based for touch and mouse input.
- **Learning:** the first guided exercise derives progress from simulated ping/route evidence and explicit subnet verification; progress is kept in memory for the current session.
- **Persistence:** versioned localStorage key `packetlab.workspace.v1`. Exported JSON is the portable backup.
- **Offline shell:** a same-origin service worker precaches the HTML shell, manifest, icon, and built JS/CSS assets, then uses network-first navigation with a cached fallback.
- **Tests:** Vitest unit tests cover address validation, graph connectivity, route discovery, CIDR calculations, ping success/failure, firewall behavior, and imported lab validation. Seven Playwright browser tests pass against the production build, covering ping, terminal commands, local persistence, subnet calculation, invalid imports, drag-and-drop, firewall toggles, and offline startup.
- **Automation:** GitHub Actions typechecks, tests, audits dependencies, builds, and deploys GitHub Pages.
- **No backend:** no cloud authentication, database, telemetry, or API key is required.

## Intended module boundaries

```text
src/
  app/          application shell and navigation (future extraction)
  components/   reusable interface components (future extraction)
  engine/       deterministic, side-effect-free simulation domain
  features/     topology, packet inspector, terminal, scenarios (future extraction)
  storage/      versioned local persistence and migrations (future extraction)
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
4. Workspace changes are serialized to localStorage. Import data is size-limited and validated before replacing state.
5. Users can export a JSON copy at any time.
6. On the first online visit, the service worker caches the app shell and its built assets for later offline reopening.

## Safety invariants

- The terminal accepts only explicit, documented commands. It must never call `eval`, a system shell, or arbitrary code execution.
- Packet simulation is local and deterministic; it does not scan real hosts or open sockets.
- Imported data must be treated as untrusted and validated at the boundary.
- Keep storage local by default; never add cloud authentication as a prerequisite.
- AI is deferred. The core product and lessons must work with no AI credentials or network connection.
- The service worker caches only same-origin GET requests inside its own scope.

## Persistence and compatibility

Treat the stored workspace as a versioned file format. Add migrations when the schema changes, preserve unknown user data only when safe, and test corrupt/old storage recovery. Import/export format changes need fixtures and backward-compatibility tests.

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
