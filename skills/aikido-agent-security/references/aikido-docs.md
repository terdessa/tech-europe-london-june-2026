# Aikido Documentation Notes

Sources reviewed on 2026-06-27:

- https://help.aikido.dev/code-scanning/connect-your-source-code/connect-github-account-to-aikido
- https://help.aikido.dev/ai-and-dev-tools/aikido-mcp
- https://help.aikido.dev/ai-and-dev-tools/aikido-mcp/openai-codex-cli-mcp
- https://help.aikido.dev/ai-and-dev-tools/aikido-mcp/anthropic-claude-code-mcp
- https://help.aikido.dev/ai-and-dev-tools/aikido-mcp/automatically-handle-mcp-rules-in-ide
- https://help.aikido.dev/ai-and-dev-tools/aikido-mcp/mcp-troubleshooting
- https://help.aikido.dev/ai-and-dev-tools/aikido-secrets-pre-commit-hook
- https://help.aikido.dev/code-scanning/local-code-scanning
- https://help.aikido.dev/code-scanning/aikido-malware-scanning
- https://help.aikido.dev/pr-and-release-gating/github-ci-pr-gating-via-aikido-dashboard
- https://help.aikido.dev/pr-and-release-gating/cli-for-pr-and-release-gating

## GitHub Source Connection

Aikido connects to GitHub through the GitHub App flow. It requests read-only organization access for repository analysis, does not need stored GitHub tokens for this flow, and says scanned code is wiped after analysis.

Use this path for normal GitHub-hosted repositories:

1. Open https://app.aikido.dev/ and sign in with GitHub.
2. Choose a real organization, then authorize Aikido in GitHub.
3. Grant access to all repositories or selected repositories.
4. Return to Aikido, validate repositories, and wait for initial results. Docs say first results should appear after about one minute.

## MCP For Coding Agents

Aikido MCP connects Aikido's security engine to MCP-compatible AI coding tools so generated code can be checked for vulnerabilities and hardcoded secrets.

Create the Aikido token from `Settings -> Integrations -> IDE -> MCP` in Aikido. Store it as a secret, not in repo files.

### Codex CLI

Install:

```bash
codex mcp add aikido \
  --env AIKIDO_API_KEY=YOUR_TOKEN \
  -- npx -y @aikidosec/mcp
```

Then restart Codex CLI if it was already open.

Aikido's Codex docs also tell users to download an Aikido rule into `~/.codex/skills/aikido-rule.txt`. If using this skill instead, only add that separate rule when the user's Codex setup does not already run `aikido_full_scan` on changed first-party code.

### Claude Code

Inside Claude Code:

```text
/plugin install aikido@claude-plugins-official
/reload-plugins
exit
```

Restart Claude Code, then run:

```text
/aikido:setup your-PAT-here
```

The setup skill saves the PAT to Claude Code user settings and registers the MCP server.

### Required MCP Rule Behavior

Aikido-managed rules tell the agent to:

- Run `aikido_full_scan` on generated, added, and modified first-party code unless explicitly told not to.
- Provide full file content to the scanner.
- Fix scan findings using Aikido remediation.
- Rescan after fixes.
- Repeat until no remaining or newly introduced security issues exist.

Aikido IDE plugins can manage this rule automatically. If automatic management creates or updates a rule file, decide whether to add it to `.gitignore` based on whether the repo wants the rule versioned.

## MCP Troubleshooting

- Confirm Node.js is `18.19.0` or newer: `node -v`.
- Run the server outside the coding agent for direct logs:

```bash
AIKIDO_API_KEY=your_api_key_here LOG_LEVEL=debug npx -y @aikidosec/mcp
```

- For Claude Code, start with `claude --debug` to collect startup and MCP logs.
- Look for authentication, network, Node.js, and missing configuration errors before changing repo files.

## Secrets Pre-Commit Hook

Use when the user wants secret detection before commits.

Global macOS/Linux install:

```bash
curl -fsSL https://raw.githubusercontent.com/AikidoSec/pre-commit/6cc79e039ee78b206520f143d618a44665c904b3/installation-samples/install-global/install-aikido-hook.sh | bash
```

Global Windows PowerShell install:

```powershell
iex (iwr "https://raw.githubusercontent.com/AikidoSec/pre-commit/6cc79e039ee78b206520f143d618a44665c904b3/installation-samples/install-global/install-aikido-hook.ps1" -UseBasicParsing)
```

With the `pre-commit` framework, add:

```yaml
repos:
  - repo: https://github.com/AikidoSec/pre-commit
    rev: main
    hooks:
      - id: aikido-local-scanner
```

Then run `pre-commit install`. The `aikido-local-scanner` binary must be installed separately; use the global installer with `--download-only` for that path.

Bypass only with explicit user intent:

- One commit: `git commit --no-verify`
- Aikido hook only: `AIKIDO_SKIP_PRE_COMMIT=1 git commit`
- One known false positive line: add `// gitleaks:allow`

## Local Code Scanning

Use local scanning when code must stay on user-controlled machines, when testing changes during development, or when working in isolated environments. Aikido still recommends standard SCM integrations for most workflows because they provide faster results and broader coverage. Confirm the workspace supports local scanning before relying on it.

## Safe Chain

Use Safe Chain when the user wants package-manager protection around dependency installs. It wraps common JavaScript and Python package managers, scans direct and nested dependencies, blocks known suspicious packages, and applies a 24-hour safety window for newly published versions.

Supported package-manager commands include `npm`, `npx`, `yarn`, `pnpm`, `pnpx`, `bun`, `bunx`, `pip`, `pip3`, `uv`, `poetry`, and `pipx`.

macOS/Linux install for JavaScript package managers:

```bash
curl -fsSL https://raw.githubusercontent.com/AikidoSec/safe-chain/main/install-scripts/install-safe-chain.sh | sh
```

macOS/Linux install with Python support:

```bash
curl -fsSL https://raw.githubusercontent.com/AikidoSec/safe-chain/main/install-scripts/install-safe-chain.sh | sh -s -- --include-python
```

Restart the terminal after installation so shell aliases load.

## GitHub PR Gating

Use dashboard-based GitHub PR gating when the user wants Aikido checks without adding CI workflow code.

1. In Aikido, go to the integrations page and select GitHub in the CI gating section.
2. Install the Aikido PR Checks GitHub App for the same organization used by the workspace.
3. Grant repository access, ideally all repos if bulk management is desired.
4. Configure one repo first, then bulk-select more repos and choose the severity threshold and scans.
5. If failed checks must block merges, configure GitHub branch protection to require the Aikido status check.

When Aikido posts an inline PR comment, a user can ignore a finding from GitHub with:

```text
@AikidoSec ignore: reason for ignoring
```

This should be used only with a concrete reason because it marks the issue ignored in Aikido.

## PR And Release Gating CLI

The Aikido docs expose CLI and CI API pages for PR/release gating. Use dashboard-based GitHub PR checks first unless the user specifically needs CI-code-based gating, release gating, or a non-GitHub pipeline.
