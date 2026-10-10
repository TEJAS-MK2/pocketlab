# Security policy

## Scope

PacketLab is a local-first educational simulator. Its virtual terminal and network packets are simulations; they must not execute operating-system commands or transmit traffic to real hosts.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting feature if it is enabled for this repository. Otherwise, contact the repository maintainer privately through a verified channel. Avoid publishing exploit details or personal data in public issues.

Include the affected version/commit, impact, reproduction steps, and any safe proof of concept. Please allow time for investigation and a fix before public disclosure.

## Security requirements

- Never use `eval`, `Function`, or a shell to interpret terminal input.
- Treat imported JSON as untrusted input; enforce size limits and validate its complete structure before applying it.
- Keep saved workspaces on-device unless a user explicitly exports them.
- Do not store secrets, API keys, or credentials in source control or local workspace files.
- Minimize dependencies and review security updates before merging.
- Test corrupted localStorage, malformed imports, duplicate identifiers, invalid addresses, and broken topology references.

## Supported versions

Security fixes target the latest version on the default branch.
