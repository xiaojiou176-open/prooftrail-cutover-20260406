# MCP Distribution Contract

This page is the **registry-facing contract** for the ProofTrail MCP surface.
It documents a package/container lane that is **planned and publish-ready in
repo**, not a lane that is already published or listed upstream.

Use it when you need the shortest truthful summary of:

- what the MCP package is called
- which protocol it uses
- how it authenticates
- where the auth boundary is
- what it can do
- which install paths work today
- which install paths are only publish-ready and **not yet published**

## MCP Package Metadata

| Field | Value |
| --- | --- |
| Name | `@prooftrail/mcp-server` |
| Registry server name | `io.github.xiaojiou176-open/prooftrail-mcp` |
| Description | `Governed MCP access to ProofTrail runs, proof, and workflows` |
| Version | `0.1.1` |
| Homepage | `https://xiaojiou176-open.github.io/prooftrail/` |
| Repository | `https://github.com/xiaojiou176-open/prooftrail` |
| License | `MIT` |
| Protocol | `stdio` |
| Transport | `stdio` |
| Auth boundary | `local-with-optional-backend-token` |

## Capability Summary

The MCP surface is a **governed browser-evidence bridge** for external AI
clients.

It is designed for clients that need to:

- inspect retained run evidence
- launch supported run profiles
- read manifests and proof bundles
- operate on the same governed backend/API/runtime surfaces as the local repo

It is **not**:

- a hosted MCP endpoint
- an official vendor plugin
- a browser plugin
- a generic AI-agent shell

## Current / usable today

The current supported path is a **local checkout + stdio** install.

Use it when you have the repo locally and want your agent shell to call the MCP
surface directly from the checkout.

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

Optional backend token forwarding example:

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

Truth boundary:

- local stdio is supported now
- backend token forwarding is optional
- OAuth is not part of the current MCP contract

## Publish-ready but not yet published (later-lane contract)

The following names are reserved as the **publish-ready** package and container
surfaces for this repository:

| Surface | Planned identifier | Current state |
| --- | --- | --- |
| npm package | `@prooftrail/mcp-server` | ready / **not published** |
| Docker image | see future example below | ready / **not published** |

The repo-local registry submission artifact now lives at
`apps/mcp-server/server.json`.

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

Future container example (**not usable today**):

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

These examples describe the intended publish-facing contract only.

They must not be described as live install paths until the package/image is
actually published and read back from the upstream registry.

The future container surface also assumes a mounted ProofTrail checkout (or
another compatible workspace root), not a standalone hosted MCP endpoint.

Repo validation command:

```bash
pnpm mcp:container:smoke
```

## Supporting docs

- [ProofTrail MCP Server README](../../apps/mcp-server/README.md)
- [Registry submission artifact](../../apps/mcp-server/server.json)
- [MCP for Browser Automation](../how-to/mcp-quickstart-1pager.md)
- [Distribution Status](../../DISTRIBUTION.md)
- [Integration Boundaries](../../INTEGRATIONS.md)
- [ProofTrail MCP Skill](../../skills/prooftrail-mcp/SKILL.md)
