# PacketLab architecture

## Product boundary

PacketLab is a browser-first cybersecurity learning simulator. The core application must remain useful without an account, remote API, AI service, or server. Simulated actions must never silently become real network actions.

## Current implementation

- **UI:** React + TypeScript, with a responsive three-column workspace.
- **Build:** Vite; static output in `dist/`.
- **Simulation domain:** pure functions in `src/engine/network.ts` model IPv4 validation, graph reachability, ping outcomes, and import validation.
- **Persistence:** versioned localStorage key `packetlab.workspace.v1`. Exported JSON is the portable backup.
- **Tests:** Vitest unit tests cover address validation, graph connectivity, ping success/failure, and imported lab validation.
- **Automation:** GitHub Actions typechecks, tests, builds, and separately deploys GitHub Pages.
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
```

The initial release keeps some presentation code together in `src/App.tsx` to establish the end-to-end product. Split modules as the feature surface grows, not just to create empty folders.

## Data flow

1. The UI asks the domain engine to validate or simulate a lab action.
2. The engine returns typed results; it does not access the DOM, localStorage, network, or shell.
3. The UI records simulation events in memory.
4. Workspace changes are serialized to localStorage. Import data is size-limited and validated before replacing state.
5. Users can export a JSON copy at any time.

## Safety invariants

- The terminal accepts only explicit, documented commands. It must never call `eval`, a system shell, or arbitrary code execution.
- Packet simulation is local and deterministic; it does not scan real hosts or open sockets.
- Imported data must be treated as untrusted and validated at the boundary.
- Keep storage local by default; never add cloud authentication as a prerequisite.
- AI is deferred. The core product and lessons must work with no AI credentials or network connection.

## Persistence and compatibility

Treat the stored workspace as a versioned file format. Add migrations when the schema changes, preserve unknown user data only when safe, and test corrupt/old storage recovery. Import/export format changes need fixtures and backward-compatibility tests.

## Quality gates

Before merging a change, run:

```bash
npm run typecheck
npm test
npm run build
```

The GitHub Actions workflows run these checks on pushes to `main`. GitHub Pages deployment is a separate workflow and is not considered successful until its run and live site are verified.
