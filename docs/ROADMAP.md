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
- [x] Add Playwright browser-level regression and offline startup tests (awaiting first green CI run)
- [ ] Complete accessibility audit
- [ ] Add storage migrations and autosave recovery tests

## Phase 1 — Network fundamentals

- [x] Device inspector and editable labels/IP configuration
- [x] Drag-and-drop topology editing (keyboard alternative still needed)
- [x] Subnet calculator, CIDR helpers, and duplicate-IP protection in the device editor
- [x] Shortest-path route discovery
- [x] Simulated DNS and HTTP services
- [ ] Routing tables and hop-by-hop packet-path visualization
- [ ] Firewall rules, allow/deny policy, and rule-hit counters
- [x] Scenario save/load through validated local JSON import/export

## Phase 2 — Guided learning

- [ ] Structured beginner-to-advanced learning paths
- [x] First guided connectivity exercise with locally derived objective progress
- [ ] More blue-team missions, evidence collection, and scoring
- [ ] Event timeline, filters, and exportable reports
- [ ] Explainable simulations and deterministic scenario replay
- [ ] Progress stored locally with reset/export controls
- [ ] Accessibility, keyboard navigation, reduced-motion, and screen-reader checks

## Phase 3 — Platform hardening

- [ ] Import fuzz tests and malformed-file corpus
- [ ] Performance budgets and large-topology stress tests
- [ ] Content Security Policy review and dependency audit automation improvements
- [ ] Browser compatibility matrix and mobile usability pass
- [ ] Versioned data migrations and backup recovery UX

## Phase 4 — Optional extensions

- [ ] Plugin/scenario format with a strict capability model
- [ ] Optional AI-assisted explanations only after core lessons work offline
- [ ] AI opt-in, clearly disclosed data flow, and graceful offline fallback
- [ ] No AI keys, cloud account, or remote service required for core features

## Non-goals for the core simulator

PacketLab is not intended to run arbitrary shell commands, scan public networks, exploit real systems, or transmit simulated packets onto a real network. Any future real-network functionality would need a separate explicit scope and strong safety boundaries.
