# Eternal Pose

Eternal Pose is Laugh Tale's shared Claude Code and Codex skill for creating, updating, restyling, and auditing independent map-first travel websites.

Use natural language first. Codex can explicitly invoke `$eternal-pose`; Claude Code can invoke `/eternal-pose:eternal-pose`. Version 1 intentionally has no required commands, agents, hooks, MCP server, backend, or runtime app.

## Workflows

- **Create** from prose, CSV, Markdown, documents, links, or conversation.
- **Update** or **Enrich** an existing trip while preserving custom information architecture and UI.
- **Restyle** with Quiet Wood, Sticker Brutalist, Native Minimal, or a custom compile-time design.
- **Audit** without writes, or **Prepare/Deploy** locally before requesting explicit publication approval.

The generated React repository is independent of this plugin. Its base experience keeps a real map and mobile itinerary synchronized, supports the existing smooth draggable sheet, treats routes as independent edges, and compares candidate places on the main map. The starter's home page, renderers, information architecture, and visual language are deliberately editable.

Work is private by default. The skill does not push, publish, deploy, create a remote, or make anything public without explicit approval for that exact action. Provider configuration and credentials stay outside committed source.

Install Eternal Pose from the repository root using the local-checkout commands in the [Laugh Tale README](../../README.md). Run the root and starter checks there before contributing.

See the repository [specification](../../docs/specs/laugh-tale-eternal-pose-plugin-design.md) for the product contract and [NOTICE](../../NOTICE.md) for its non-affiliation boundary.
