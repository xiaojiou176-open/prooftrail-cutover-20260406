// @ts-nocheck

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import nodeTest from "node:test"
import { startMcpHarnessAdvanced } from "./helpers/mcp-client.js"

const NAV_CONTRACT_TOOLS = ["uiq_read", "uiq_run", "uiq_run_and_report"] as const

const NON_EMPTY_DESCRIPTION_TOOLS = [
  "uiq_catalog",
  "uiq_quality_read",
  "uiq_api_workflow",
  "uiq_api_automation",
  "uiq_proof",
] as const

const REQUIRED_NEW_DOC_TOOLS = [
  "uiq_read",
  "uiq_run",
  "uiq_run_and_report",
  "uiq_quality_read",
  "uiq_api_workflow",
  "uiq_api_automation",
  "uiq_proof",
] as const

const NAVIGATION_FIELDS = [
  "Goal / 目标:",
  "Use When / 何时使用:",
  "Required Inputs / 必填输入:",
  "Call Order / 调用顺序:",
  "Success Output / 成功输出:",
  "If Failed / 失败处理:",
  "Do Not / 禁止事项:",
] as const

function extractBacktickToolNames(docText: string): Set<string> {
  const names = Array.from(docText.matchAll(/`(uiq_[a-z0-9_]+)`/g), (m) => m[1])
  return new Set(names)
}

function extractRunOverrideKeys(coreSource: string): Set<string> {
  const block = coreSource.match(/runOverrideSchema = \{([\s\S]*?)\} as const;?/)
  assert.ok(block, "runOverrideSchema definition must exist")
  const keys = Array.from(block[1].matchAll(/^\s*([a-zA-Z][a-zA-Z0-9]*)\s*:/gm), (m) => m[1])
  return new Set(keys)
}

function extractRunOverrideKeysFromDoc(docText: string): Set<string> {
  const lines = docText.split(/\r?\n/)
  const keys = new Set<string>()
  let inRunOverrideSection = false

  for (const line of lines) {
    const normalized = line.trim()

    if (
      /runoverrideschema/i.test(normalized) ||
      (/run override/i.test(normalized) && /fields|accepted|字段/i.test(normalized))
    ) {
      inRunOverrideSection = true
      continue
    }

    if (!inRunOverrideSection) continue

    if (/^##\s+/.test(normalized) || /^###\s+/.test(normalized) || /URL\s*策略/.test(normalized)) {
      break
    }

    if (!normalized.startsWith("-")) continue

    const found = Array.from(normalized.matchAll(/`([a-zA-Z][a-zA-Z0-9]*)`/g), (m) => m[1])
    for (const key of found) {
      if (!key.startsWith("uiq")) keys.add(key)
    }
  }

  return keys
}

function toSortedArray(values: Iterable<string>): string[] {
  return Array.from(values).sort()
}

function resolveRepoRootFromTests(): string {
  return resolve(import.meta.dirname, "../../..")
}

nodeTest(
  "mcp core description contract: navigation fields are present",
  { timeout: 30_000 },
  async () => {
    const harness = await startMcpHarnessAdvanced({
      env: { UIQ_MCP_TOOL_GROUPS: "all" },
    })

    try {
      const listed = await harness.client.listTools()
      const byName = new Map(listed.tools.map((tool) => [tool.name, tool]))

      for (const toolName of NAV_CONTRACT_TOOLS) {
        const tool = byName.get(toolName)
        assert.ok(tool, `missing tool in listTools: ${toolName}`)
        assert.equal(typeof tool.description, "string", `description must be string: ${toolName}`)
        const description = tool.description ?? ""
        for (const field of NAVIGATION_FIELDS) {
          assert.ok(description.includes(field), `${toolName} description missing field: ${field}`)
        }
      }

      for (const toolName of NON_EMPTY_DESCRIPTION_TOOLS) {
        const tool = byName.get(toolName)
        assert.ok(tool, `missing tool in listTools: ${toolName}`)
        assert.equal(typeof tool.description, "string", `description must be string: ${toolName}`)
        assert.ok(
          (tool.description ?? "").trim().length > 0,
          `description must not be empty: ${toolName}`
        )
      }
    } finally {
      await harness.close()
    }
  }
)

nodeTest(
  "docs tool lists are aligned with runtime-registered tool names",
  { timeout: 30_000 },
  async () => {
    const repoRoot = resolveRepoRootFromTests()
    const mcpDocPath = resolve(repoRoot, "docs/mcp.md")
    const setupDocPath = resolve(repoRoot, "docs/how-to/mcp-clients-setup.md")

    const mcpDoc = readFileSync(mcpDocPath, "utf8")
    const setupDoc = readFileSync(setupDocPath, "utf8")
    const harness = await startMcpHarnessAdvanced({
      env: { UIQ_MCP_TOOL_GROUPS: "all" },
    })
    const registeredSet = new Set((await harness.client.listTools()).tools.map((tool) => tool.name))
    await harness.close()

    const docs = [
      { path: "docs/mcp.md", names: extractBacktickToolNames(mcpDoc) },
      { path: "docs/how-to/mcp-clients-setup.md", names: extractBacktickToolNames(setupDoc) },
    ]

    for (const doc of docs) {
      for (const requiredTool of REQUIRED_NEW_DOC_TOOLS) {
        assert.ok(
          doc.names.has(requiredTool),
          `${doc.path} missing required new tool: ${requiredTool}`
        )
      }
      for (const tool of doc.names) {
        assert.ok(
          registeredSet.has(tool),
          `${doc.path} contains unknown/unregistered tool: ${tool}`
        )
      }
    }
  }
)

nodeTest("run override fields in docs match runOverrideSchema and avoid legacy drift", () => {
  const repoRoot = resolveRepoRootFromTests()
  const coreSource = readFileSync(resolve(repoRoot, "apps/mcp-server/src/core/types.ts"), "utf8")
  const mcpDoc = readFileSync(resolve(repoRoot, "docs/mcp.md"), "utf8")
  const setupDoc = readFileSync(resolve(repoRoot, "docs/how-to/mcp-clients-setup.md"), "utf8")

  const schemaKeys = extractRunOverrideKeys(coreSource)
  const mcpKeys = extractRunOverrideKeysFromDoc(mcpDoc)
  const setupKeys = extractRunOverrideKeysFromDoc(setupDoc)

  assert.deepEqual(
    toSortedArray(mcpKeys),
    toSortedArray(schemaKeys),
    "docs/mcp.md run override fields drift from runOverrideSchema"
  )
  assert.deepEqual(
    toSortedArray(setupKeys),
    toSortedArray(schemaKeys),
    "docs/how-to/mcp-clients-setup.md run override fields drift from runOverrideSchema"
  )

  const forbiddenLegacyFields = ["browser", "platform", "device", "headless", "timeout", "env"]
  for (const legacy of forbiddenLegacyFields) {
    assert.ok(
      !mcpKeys.has(legacy),
      `docs/mcp.md run override section contains legacy unsupported field: ${legacy}`
    )
    assert.ok(
      !setupKeys.has(legacy),
      `docs/how-to/mcp-clients-setup.md run override section contains legacy unsupported field: ${legacy}`
    )
  }
})
