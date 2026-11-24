#!/usr/bin/env bash
# Research-only Plonky3 0.8.0 degree-16 arithmetic compatibility probe.
# Requires a real Cargo build from crates.io; no production or consensus
# dependency is changed, and NO post-quantum proof is inferred.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="$ROOT/Cargo.toml"
echo "AEGIS_PQ128_FIELD16_PATCHED_SPIKE_ONLY: start"
# Populate and compile the exact upstream 0.8.0 dependency. This also
# tests all non-ignored baseline code without changing the dependency.
cargo generate-lockfile --manifest-path "$MANIFEST"
cargo test --release --manifest-path "$MANIFEST" --no-run
REGISTRY="${CARGO_HOME:-$HOME/.cargo}/registry/src"
UPSTREAM="$(find "$REGISTRY" -maxdepth 2 -type d -name 'p3-monty-31-0.8.0' -print -quit)"
if [[ -z "$UPSTREAM" || ! -f "$UPSTREAM/src/extension.rs" ]];then
  echo "E16_PATCH_SOURCE_NOT_FOUND" >&2; exit 1
fi
TEMP="$(mktemp -d)"
trap 'rm -rf "$TEMP"' EXIT
cp -a "$UPSTREAM" "$TEMP/p3-monty-31"
python3 - "$TEMP/p3-monty-31/src/extension.rs" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]); s=p.read_text()
old='_ => panic!("Unsupported binomial extension degree: {}", WIDTH),'
new='_ => binomial_mul(a, b, res, <Self as BinomiallyExtendable<WIDTH>>::W),'
assert s.count(old)==1, "PINNED_MONTY31_MUL_FALLBACK_NOT_FOUND"
s=s.replace(old,new)
old_import='QuinticTrinomialExtendable, binomial_square,'
new_import='QuinticTrinomialExtendable, binomial_mul, binomial_square,'
assert s.count(old_import)==1, "PINNED_MONTY31_BINOMIAL_IMPORT_NOT_FOUND"
s=s.replace(old_import,new_import)
assert 'panic!("Unsupported binomial extension degree' not in s
p.write_text(s)
print('AEGIS_RESEARCH_PATCH_APPLIED: generic p3-field::binomial_mul for D=16')
PY
# Cargo config is process-local. The patched crate exists ONLY in TEMP.
# It is an experimental capability spike and not a reviewed crypto fork.
PATCH="patch.crates-io.p3-monty-31.path=\"$TEMP/p3-monty-31\""
cargo test --manifest-path "$MANIFEST" --release \
  --config "$PATCH" \
  p3_babybear16_spike::tests:: -- --ignored
echo "AEGIS_PQ128_FIELD16_PATCHED_SPIKE_ONLY: tests finished"
