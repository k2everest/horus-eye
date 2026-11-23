#!/usr/bin/env bash
set -euo pipefail

if [[ $# -gt 1 || ( $# -eq 1 && "$1" != --check ) ]]; then
  echo 'Usage: gen-proto.sh [--check]' >&2
  exit 2
fi

cd "$(dirname "$0")/.."

buf lint

# Compare a local archive of the exact base commit. aegis-flow is a subdirectory,
# not a Git repository; cloning aegis-flow/.git fails in Actions and worktrees.
repo_root="$(git rev-parse --show-toplevel)"
base_ref="${AEGIS_PROTO_BASE_REF:-refs/remotes/origin/main}"
base_commit="$(git rev-parse --verify "${base_ref}^{commit}")"
baseline="$(mktemp -d)"
trap 'rm -rf "$baseline"' EXIT
git -C "$repo_root" archive "$base_commit" aegis-flow | tar -x -C "$baseline"
git -C "$repo_root" ls-tree -r --name-only "$base_commit" -- aegis-flow/proto > "$baseline/paths"
has_schema=false
while IFS= read -r path; do
  if [[ "$path" == *.proto ]]; then has_schema=true; break; fi
done < "$baseline/paths"
if "$has_schema"; then
  buf breaking --against "$baseline/aegis-flow"
else
  echo "Base $base_commit has no protobuf schemas; this change introduces the initial contract."
fi

if [[ "${1:-}" == --check ]]; then exit 0; fi
buf generate
echo "Proto generation concluída."
