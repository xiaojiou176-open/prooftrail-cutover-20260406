import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

function extractRegisteredTools(source: string): Set<string> {
  const names = [
    ...Array.from(source.matchAll(/registerTool\(\s*"(uiq_[a-z0-9_]+)"/g), (m) => m[1]),
    ...Array.from(
      source.matchAll(/registerApiTool\(\s*mcpServer,\s*"(uiq_[a-z0-9_]+)"/g),
      (m) => m[1]
    ),
  ]
  return new Set(names)
}

function extractBacktickToolNames(docText: string): Set<string> {
  const names = Array.from(docText.matchAll(/`(uiq_[a-z0-9_]+)`/g), (m) => m[1])
  return new Set(names)
}

function extractRunOverrideKeys(source: string): Set<string> {
  const block = source.match(/export const runOverrideSchema = \{([\s\S]*?)\} as const;?/)
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
      (/run override/i.test(normalized) && /fields|accepted/i.test(normalized))
    ) {
      inRunOverrideSection = true
      continue
    }
    if (!inRunOverrideSection) continue
    if (
      /^##\s+/.test(normalized) ||
      /^###\s+/.test(normalized) ||
      /URL Policy Boundary/i.test(normalized)
    ) {
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

test("docs tool lists are aligned with runtime-registered tool names", () => {
  const repoRoot = resolve(import.meta.dirname, "../../..")
  const runToolsSource = readFileSync(
    resolve(repoRoot, "apps/mcp-server/src/tools/register-tools/register-run-tools.ts"),
    "utf8"
  )
  const apiToolsSource = readFileSync(
    resolve(repoRoot, "apps/mcp-server/src/tools/register-tools/register-api-tools.ts"),
    "utf8"
  )
  const mcpDoc = readFileSync(resolve(repoRoot, "docs/mcp.md"), "utf8")
  const setupDoc = readFileSync(resolve(repoRoot, "docs/how-to/mcp-clients-setup.md"), "utf8")

  const registered = new Set<string>([
    ...extractRegisteredTools(runToolsSource),
    ...extractRegisteredTools(apiToolsSource),
  ])

  const docs = [
    { path: "docs/mcp.md", names: extractBacktickToolNames(mcpDoc) },
    { path: "docs/how-to/mcp-clients-setup.md", names: extractBacktickToolNames(setupDoc) },
  ]

  for (const doc of docs) {
    for (const tool of registered) {
      assert.ok(doc.names.has(tool), `${doc.path} missing registered tool: ${tool}`)
    }
    for (const tool of doc.names) {
      assert.ok(registered.has(tool), `${doc.path} contains unknown/unregistered tool: ${tool}`)
    }
  }
})

test("run override fields in docs match runOverrideSchema and avoid legacy drift", () => {
  const repoRoot = resolve(import.meta.dirname, "../../..")
  const typesSource = readFileSync(resolve(repoRoot, "apps/mcp-server/src/core/types.ts"), "utf8")
  const mcpDoc = readFileSync(resolve(repoRoot, "docs/mcp.md"), "utf8")
  const setupDoc = readFileSync(resolve(repoRoot, "docs/how-to/mcp-clients-setup.md"), "utf8")

  const schemaKeys = extractRunOverrideKeys(typesSource)
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

  assert.ok(
    /allowAllUrls=true/.test(mcpDoc) &&
      (/未暴露\s*`allowAllUrls`/.test(mcpDoc) || /does not expose `allowAllUrls`/.test(mcpDoc)),
    "docs/mcp.md must clarify allowAllUrls explicit opt-in and MCP exposure boundary"
  )
})
