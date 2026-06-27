---
name: aikido-agent-security
description: Integrate Aikido Security with AI coding agents and repositories. Use when Codex, Claude Code, or another coding agent needs to connect Aikido MCP, configure Aikido scanning rules, connect a GitHub organization to Aikido, add secrets pre-commit scanning, enable Safe Chain dependency install protection, set up PR/release gating, or remediate Aikido findings in generated or modified code.
---

# Aikido Agent Security

Use Aikido as the external security check for AI-generated, added, and modified first-party code.

## Workflow

1. Identify the target: agent MCP setup, repository connection, pre-commit secrets scanning, Safe Chain, PR gating, local scanning, or finding remediation.
2. Read `references/aikido-docs.md` for exact commands and current workflow notes before changing config or instructing the user.
3. Prefer the Aikido-hosted integration path over custom glue:
   - Codex CLI: `codex mcp add aikido --env AIKIDO_API_KEY=... -- npx -y @aikidosec/mcp`
   - Claude Code: install `aikido@claude-plugins-official`, reload plugins, then run `/aikido:setup`.
   - GitHub source connection and GitHub PR gating: use the Aikido dashboard and GitHub Apps.
4. Never echo, commit, log, or paste an Aikido PAT/API key into files. Ask the user to provide it only through the target tool's secret flow or environment variable.
5. After adding or modifying first-party code, run `aikido_full_scan` through MCP when available. Provide the full file content. Fix reported issues and rescan until no remaining or newly introduced issues are reported.

## Agent Rules

If MCP is connected but no Aikido rule exists, add the smallest durable agent instruction supported by the environment:

```text
Always run aikido_full_scan on generated, added, and modified first-party code unless the user explicitly says not to. Provide full file content. Fix Aikido findings, then rescan until clean.
```

Keep the rule in the agent's normal rule location. Commit it only if the repository intentionally versions agent rules.

## Remediation

- Treat Aikido findings as blocking for security-sensitive changes, generated auth code, dependency changes, and secret-like strings.
- Use Aikido remediation text when present, but inspect the code path before editing.
- Do not suppress or ignore a finding unless the user gives a reason that should be recorded in the platform or PR comment.
- For dependency installs, prefer Safe Chain when the user wants package-manager protection; do not replace lockfile review or normal tests with it.

## Verification

Run the smallest relevant check:

- MCP setup: verify Node.js is at least `18.19.0`, then run the MCP server directly with debug logging if the agent cannot see it.
- Code edits: run `aikido_full_scan` on changed first-party files through MCP.
- GitHub PR gating: confirm the Aikido PR check appears on a test PR and GitHub branch protection requires the status check if merges must block.
- Secrets hook: stage a known dummy secret only in a disposable test file, confirm the hook blocks it, then remove the file.
