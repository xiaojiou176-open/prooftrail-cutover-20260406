import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
const SCRIPT = resolve(REPO_ROOT, "scripts/ci/hooks-equivalence-gate.sh")

function writeExecutable(pathname, source) {
  writeFileSync(pathname, source, "utf8")
  chmodSync(pathname, 0o755)
}

test("hooks-equivalence gate preserves failing step exit codes in its report", () => {
  const root = mkdtempSync(join(tmpdir(), "hooks-equivalence-gate-"))
  const binDir = join(root, "bin")
  const scriptPath = join(root, "scripts/ci/hooks-equivalence-gate.sh")
  const reportPath = join(root, ".runtime-cache/artifacts/ci/hooks-equivalence-gate.json")

  try {
    mkdirSync(binDir, { recursive: true })
    mkdirSync(dirname(scriptPath), { recursive: true })
    cpSync(SCRIPT, scriptPath)
    writeExecutable(
      join(binDir, "git"),
      `#!/usr/bin/env bash
if [[ "$1" == "rev-parse" ]]; then
  exit 1
fi
if [[ "$1" == "log" ]]; then
  exit 0
fi
exit 0
`
    )
    writeExecutable(
      join(binDir, "python3"),
      `#!/usr/bin/env bash
if [[ "$1" == "-" ]]; then
  /usr/bin/python3 "$@"
  exit $?
fi
printf '0\n'
`
    )

    const stubCommands = {
      "scripts/ci/run-in-container.sh": 42,
      "scripts/ci/lint-all.sh": 0,
      "scripts/ci/check-observability-contract.sh": 0,
      "scripts/ci/run-unit-coverage-gate.sh": 0,
      "scripts/ci/uiq-test-truth-gate.mjs": 0,
      "scripts/ci/uiq-pytest-truth-gate.py": 0,
      "scripts/ci/check-doc-links.mjs": 0,
      "scripts/ci/atomic-commit-gate.sh": 0,
      "scripts/ci/pre-push-required-gates.sh": 0,
      "scripts/ci/pre-commit-required-gates.sh": 0,
    }

    for (const [relativePath, exitCode] of Object.entries(stubCommands)) {
      const target = join(root, relativePath)
      mkdirSync(dirname(target), { recursive: true })
      writeExecutable(
        target,
        `#!/usr/bin/env bash
exit ${exitCode}
`
      )
    }

    const run = spawnSync("bash", [scriptPath], {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH}`,
        UIQ_DOCS_LINK_BASE_REF: "HEAD~1",
        UIQ_DOCS_LINK_HEAD_REF: "HEAD",
      },
      encoding: "utf8",
    })

    assert.equal(run.status, 1)
    const report = JSON.parse(readFileSync(reportPath, "utf8"))
    const failedStep = report.steps.find((step) => step.name === "container_contract_gate")
    assert.ok(failedStep)
    assert.equal(failedStep.status, "failed")
    assert.equal(failedStep.exit_code, 42)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
