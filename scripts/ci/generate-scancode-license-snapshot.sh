#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

SNAPSHOT_PATH="${UIQ_SCANCODE_SNAPSHOT_PATH:-reports/licenses-scan.json}"
META_PATH="${UIQ_SCANCODE_SNAPSHOT_META_PATH:-reports/licenses-scan.meta.json}"
mkdir -p "$(dirname "$SNAPSHOT_PATH")"

targets=(
  "LICENSE"
  "package.json"
  "pyproject.toml"
  "apps/web/package.json"
  "apps/automation-runner/package.json"
  "apps/mcp-server/package.json"
)

existing_targets=()
for target in "${targets[@]}"; do
  if [[ -f "$target" ]]; then
    existing_targets+=("$target")
  fi
done

if (( ${#existing_targets[@]} == 0 )); then
  echo "error: no manifest/license targets found for ScanCode snapshot" >&2
  exit 1
fi

resolve_scancode_cmd() {
  if [[ -n "${UIQ_SCANCODE_BIN:-}" && -x "${UIQ_SCANCODE_BIN}" ]]; then
    printf '%s\n' "${UIQ_SCANCODE_BIN}"
    return 0
  fi
  if command -v scancode >/dev/null 2>&1; then
    command -v scancode
    return 0
  fi
  local cached_bin="${HOME}/.cache/codex_scans/scancode-venv/bin/scancode"
  if [[ -x "$cached_bin" ]]; then
    printf '%s\n' "$cached_bin"
    return 0
  fi
  return 1
}

tmp_root="${TMPDIR:-/tmp}"
mkdir -p "${tmp_root%/}"
snapshot_tmp="$(mktemp "${tmp_root%/}/prooftrail-scancode-snapshot.XXXXXX")"
rm -f "$snapshot_tmp"
snapshot_tmp="${snapshot_tmp}.json"
trap 'rm -f "$snapshot_tmp"' EXIT

if scancode_bin="$(resolve_scancode_cmd)"; then
  "$scancode_bin" \
    --license \
    --copyright \
    --processes 1 \
    --timeout 5 \
    --json "$snapshot_tmp" \
    "${existing_targets[@]}"
  scanner_desc="scancode"
else
  uvx --from scancode-toolkit scancode \
    --license \
    --copyright \
    --processes 1 \
    --timeout 5 \
    --json "$snapshot_tmp" \
    "${existing_targets[@]}"
  scanner_desc="uvx --from scancode-toolkit scancode"
fi

mv "$snapshot_tmp" "$SNAPSHOT_PATH"

python3 - <<'PY' "$META_PATH" "$scanner_desc" "${existing_targets[@]}"
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

meta_path = Path(sys.argv[1])
scanner = sys.argv[2]
targets = sys.argv[3:]

payload = {
    "version": 1,
    "generatedAt": datetime.now(timezone.utc).isoformat(),
    "scanner": scanner,
    "targets": targets,
}
meta_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY

echo "[scancode-license-snapshot] ok"
