# PacketLab roadmap

This roadmap describes the intended platform from day one. It is a plan, not a claim that every listed capability exists.

## Foundation — in progress

- [x] React + TypeScript + Vite baseline
- [x] Responsive network studio interface
- [x] Virtual workstations, routers, servers, and links
- [x] Simulated ICMP ping and packet event log
- [x] Allowlisted virtual terminal
- [x] Local persistence and validated JSON import/export
- [x] Offline app-shell caching for reopening after an online visit
- [x] Initial domain tests, dependency audit, and CI workflow
- [x] GitHub Pages deployment workflow and first verified deployment
- [x] Add Playwright browser-level regression and offline startup tests (verified green in GitHub Actions)
- [x] Verify corrupted-storage backup, malformed-import preservation, keyboard topology movement, ping-path highlighting, and mobile overflow behavior
- [x] Add keyboard controls for topology positioning (arrow keys; Shift for larger moves)
- [x] Add Playwright checks for accessible button/form names and polite status announcements
- [x] Add a keyboard-visible skip link to the main content region
- [ ] Complete a full screen-reader and browser accessibility audit
- [x] Require confirmation before replacing a modified local workspace; test cancelling and accepting the reset
- [x] Add unit tests for corrupt workspace/progress backups, unavailable storage, and legacy version-one compatibility
- [ ] Add a formal schema-migration layer when the stored format evolves, plus broader user-facing backup recovery

## Phase 1 — Network fundamentals

- [x] Device inspector and editable labels/IP configuration
- [x] Administratively up/down virtual interfaces that change the active connectivity graph, with legacy workspace compatibility
- [x] Drag-and-drop and keyboard topology editing
- [x] Subnet calculator, CIDR helpers, and duplicate-IP protection in the device editor
- [x] Shortest-path route discovery
- [x] Simulated DNS and HTTP services
- [x] Simulated directly-connected routing table and hop-by-hop path highlighting
- [x] Local firewall deny/allow policy that blocks simulated ping and HTTP requests to protected devices
- [x] Deterministic ping TTL decremented only by intermediate virtual routers; latency remains an explicitly estimated simulation value
- [x] Explainable ICMP event decision log for endpoint validation, path selection, hop-ordered simulated ARP-style neighbor resolution, router forwarding, firewall decisions, and delivery/drop outcomes
- [x] Enforce TTL expiry at the router that decrements the TTL to zero, with the observed path ending at the drop point
- [ ] Configurable per-interface MAC/IP/mask state, real subnet-aware next-hop selection, and explicit static/default routes
- [x] Firewall hit counts derived from retained local packet events
- [x] Interface state is visible in the inspector and controllable through allowlisted terminal commands
- [ ] More advanced policy matching
- [x] Scenario save/load through validated local JSON import/export

## Phase 2 — Guided learning

- [ ] Structured beginner-to-advanced learning paths
- [x] Guided connectivity exercise covering ping, route tracing, subnet capacity, and firewall-denial verification; progress follows device IDs, current addresses, renamed devices, and topology changes
- [x] Award route objective progress only when a valid simulated path exists; regression test covers disconnected topology
- [ ] More blue-team missions, evidence collection, and scoring
- [x] Searchable event log with delivered/dropped filters, historical hop snapshots, and exportable packet-event JSON reports
- [x] Explainable ICMP simulation steps retained with packet-event history
- [ ] Deterministic scenario replay with configurable random seed and step-through playback
- [x] Progress stored locally with independent validation/backup plus explicit reset and JSON export controls
- [x] Keyboard topology movement, terminal log announcements, focus indicators, and reduced-motion support
- [ ] Complete a broader screen-reader and browser accessibility audit

## Phase 3 — Platform hardening

- [x] Import validation for blank/unsafe IDs, control characters, duplicate records, and excessive link counts
- [x] Oversized (over 1 MB) import rejection verified to preserve the active workspace
- [ ] Import fuzz tests and malformed-file corpus
- [x] Boundary stress test for a maximum-sized 200-device / 2,000-link lab
- [ ] Formal performance budgets for large-topology operations
- [ ] Content Security Policy review
- [x] Make high-severity dependency audits blocking in CI and before deployment
- [ ] Browser compatibility matrix and mobile usability pass
- [x] Corrupt workspace and guided-progress JSON are backed up under separate local keys before safe defaults are loaded
- [ ] Versioned workspace schema migrations and broader backup recovery UX

## Phase 4 — Optional extensions

- [ ] Plugin/scenario format with a strict capability model
- [ ] Optional AI-assisted explanations only after core lessons work offline
- [ ] AI opt-in, clearly disclosed data flow, and graceful offline fallback
- [ ] No AI keys, cloud account, or remote service required for core features

## Non-goals for the core simulator

PacketLab is not intended to run arbitrary shell commands, scan public networks, exploit real systems, or transmit simulated packets onto a real network. Any future real-network functionality would need a separate explicit scope and strong safety boundaries.
