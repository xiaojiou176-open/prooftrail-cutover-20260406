# ProofTrail MCP Skill

This is the **generic install and usage skill** for ProofTrail's MCP surface.

Use it when a coding-agent shell such as Codex, Claude Code, OpenCode, or
OpenClaw needs to understand:

- what ProofTrail is
- when to use MCP vs API
- how to install the current repo-native MCP surface
- what the auth boundary is
- which future publish-facing surfaces are planned but **not yet published**

## What ProofTrail is

ProofTrail is **evidence-first browser automation with recovery and MCP**.

It helps AI agents and human operators:

- run browser workflows through a governed path
- inspect retained evidence after each run
- recover from failures without pretending the browser layer is a generic bot

## When to use MCP vs API

Use **MCP** when your outer agent shell already speaks tools and you want a
governed browser-evidence bridge.

Use **API** when your integration needs exact request/response control and
wants to own orchestration directly.

Truth boundary:

- MCP is the governed tool bridge
- API is the contract layer
- ProofTrail is **not** an official plugin
- ProofTrail is **not** a hosted service
- ProofTrail is **not** a hosted MCP endpoint

Plain-language boundary:

- ProofTrail is not a hosted service.

## Protocol and auth

- Protocol: `stdio`
- Transport: `stdio`
- Auth: `local-with-optional-backend-token`

That means:

- local checkout + stdio works today
- no OAuth is required for the current MCP surface
- a backend token is optional when you want the MCP process to call a live
  backend API

## Current / usable today

Current install path:

1. clone the ProofTrail repo
2. run `pnpm install`
3. point your MCP client at the repo-local stdio command
4. start the MCP bridge with `pnpm mcp:start`

Example configuration:

```json
{
  "mcpServers": {
    "prooftrail": {
      "command": "pnpm",
      "args": ["mcp:start"],
      "cwd": "/absolute/path/to/prooftrail"
    }
  }
}
```

Optional backend token forwarding:

```json
{
  "mcpServers": {
    "prooftrail": {
      "command": "pnpm",
      "args": ["mcp:start"],
      "cwd": "/absolute/path/to/prooftrail",
      "env": {
        "UIQ_MCP_API_BASE_URL": "http://127.0.0.1:18080",
        "UIQ_MCP_AUTOMATION_TOKEN": "optional-backend-token"
      }
    }
  }
}
```

## Publish-ready but not yet published

The following install surfaces are planned and **not yet published**:

- npm package: `@prooftrail/mcp-server`
- Docker image: `ghcr.io/xiaojiou176-open/prooftrail-mcp-server:0.1.1`

Future package example (**not usable today**):

```json
{
  "mcpServers": {
    "prooftrail": {
      "command": "npx",
      "args": ["-y", "@prooftrail/mcp-server@0.1.1"]
    }
  }
}
```

Future Docker example (**not usable today**):

```json
{
  "mcpServers": {
    "prooftrail": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "-v",
        "/absolute/path/to/prooftrail:/workspace",
        "-e",
        "UIQ_MCP_API_BASE_URL=http://host.docker.internal:18080",
        "-e",
        "UIQ_MCP_WORKSPACE_ROOT=/workspace",
        "ghcr.io/xiaojiou176-open/prooftrail-mcp-server:0.1.1"
      ]
    }
  }
}
```

Do not describe either surface as live until the package/image is actually
published.
The future Docker surface also assumes a mounted ProofTrail checkout.

## Capabilities

This skill helps an agent shell understand that ProofTrail can currently expose:

- run and report operations through MCP
- retained evidence and manifest reading
- governed proof/recovery workflows
- optional backend-connected operations through local or self-managed runtime

## Limitations

- not an official plugin
- not a hosted MCP endpoint
- not a skill registry package that has already been published
- not a browser plugin
- not a generic AI-agent shell

## Read this next

- [apps/mcp-server/README.md](../../apps/mcp-server/README.md)
- [docs/how-to/mcp-quickstart-1pager.md](../../docs/how-to/mcp-quickstart-1pager.md)
- [docs/reference/mcp-distribution-contract.md](../../docs/reference/mcp-distribution-contract.md)
- [DISTRIBUTION.md](../../DISTRIBUTION.md)
- [INTEGRATIONS.md](../../INTEGRATIONS.md)
