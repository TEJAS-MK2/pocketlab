# Contributing to PacketLab

Thanks for helping improve PacketLab.

## Development setup

- Node.js 22 or newer
- npm

```bash
npm install
npm run dev
```

Before submitting a change:

```bash
npm run typecheck
npm test
npm run build
```

## Contribution principles

1. Keep the core experience local-first and useful offline.
2. Do not add cloud authentication, telemetry, external API calls, or AI requirements without explicit product approval.
3. Keep simulation logic deterministic and isolated from UI/browser side effects.
4. Add tests for behavior changes, malformed imports, and edge cases.
5. Keep virtual terminal commands allowlisted; never evaluate user input or pass it to a system shell.
6. Validate external/imported data at its boundary.
7. Prefer accessible controls, keyboard support, responsive layouts, and reduced-motion support.
8. Update the README, architecture, and roadmap when product behavior or setup changes.

## Pull requests

Use focused changes with a clear rationale, tests, and screenshots for meaningful UI changes. Do not claim CI passed unless the actual workflow run is green.
