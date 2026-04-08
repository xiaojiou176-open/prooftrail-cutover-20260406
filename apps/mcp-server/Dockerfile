FROM docker.io/library/node:20-bookworm-slim@sha256:eef3816042c0f522a2ca9655c1947ca6f97c908b0c227aa50e19432646342ab7 AS build

WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.json ./
COPY apps/mcp-server/package.json apps/mcp-server/package.json
COPY apps/mcp-server apps/mcp-server
COPY packages packages
COPY scripts/mcp scripts/mcp

RUN corepack enable \
  && pnpm install --frozen-lockfile \
  && pnpm --filter @prooftrail/mcp-server build \
  && pnpm deploy --legacy --filter @prooftrail/mcp-server --prod /opt/prooftrail-mcp

FROM docker.io/library/node:20-bookworm-slim@sha256:eef3816042c0f522a2ca9655c1947ca6f97c908b0c227aa50e19432646342ab7

ENV NODE_ENV=production
ENV UIQ_MCP_WORKSPACE_ROOT=/workspace

WORKDIR /workspace

COPY --from=build /opt/prooftrail-mcp /opt/prooftrail-mcp

ENTRYPOINT ["node", "/opt/prooftrail-mcp/dist/server.cjs"]
