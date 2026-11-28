#!/usr/bin/env bash
# AEGIS PQ128 RESEARCH ONLY: true 1-input/1-output SIX-SHA512 single
# Plonky3 WiredAir+LogUp proof with independently rebuilt public program.
# --preflight (default): read-only public sizing, valid on the existing 64GiB EC2.
# --prove: opt-in expensive private-fixture proof, requires adequate RAM.
# No mainnet activation, proof-of-knowledge, ZK or QROM certification.
set -euo pipefail

mode="${1:---preflight}"
if [[ "$mode" != "--preflight" && "$mode" != "--prove" ]]; then
  echo 'Usage: bash run-six-sha512-highmem.sh [--preflight|--prove]' >&2
  exit 64
fi
if [[ "$(uname -s)" != Linux ]]; then
  echo 'AEGIS_SIX_SHA512_LINUX_REQUIRED' >&2
  exit 78
fi
for command in node git awk; do
  command -v "$command" >/dev/null || { echo "MISSING_TOOL: $command" >&2; exit 78; }
done
if [[ "$(node -p 'process.versions.node.split(".")[0]')" != "24" ]]; then
  echo 'AEGIS_SIX_SHA512_NODE24_REQUIRED' >&2
  exit 78
fi
root=$(git rev-parse --show-toplevel)
cd "$root"
sizing=aegis-flow/experiments/pq128/v4/financial-capacity-preflight.mjs
gate=aegis-flow/experiments/pq128/v4/financial-memory-gate.mjs

echo 'AEGIS_SIX_SHA512_PUBLIC_GEOMETRY:'
node "$sizing"
echo 'AEGIS_SIX_SHA512_MEMORY_SCREEN:'
if [[ "$mode" == "--preflight" ]]; then
  node "$gate"
  echo 'AEGIS_SIX_SHA512_PREFLIGHT_ONLY: no witness or proof was generated'
  exit 0
fi

# The gate uses actual MemAvailable and remaining cgroup allocation. Its
# measured one-hash extrapolation with 50% headroom is an engineering screen,
# NOT a proven upper bound. Do not bypass it with swap or fake environment vars.
node "$gate" --require-capacity

for command in cargo rustc timeout tee; do
  command -v "$command" >/dev/null || { echo "MISSING_TOOL: $command" >&2; exit 78; }
done
if [[ ! -x /usr/bin/time ]]; then
  echo 'AEGIS_SIX_SHA512_GNU_TIME_REQUIRED' >&2
  exit 78
fi
manifest=aegis-flow/experiments/pq128/v4/plonky3/Cargo.toml
binary="$root/aegis-flow/experiments/pq128/v4/plonky3/target/release/aegis-v4-plonky3-lab"
mkdir -p "$root/work"
profile="$root/work/six-sha512-financial-profile.json"
retained="$root/work/six-sha512-synthetic-proof"
if [[ -e "$retained" ]]; then
  echo "AEGIS_SIX_SHA512_EVIDENCE_DIR_EXISTS: $retained" >&2
  exit 78
fi
echo 'AEGIS_SIX_SHA512_EXPERIMENTAL_PROVING_STARTED'
echo 'Research uses SYNTHETIC notes only. Do not substitute real wallet secrets.'
cargo generate-lockfile --manifest-path "$manifest"
RUSTFLAGS='-C target-cpu=native' cargo build --locked --release \
  --features parallel-sha512-research --manifest-path "$manifest"

AEGIS_V4_FULL_WIRED_SHA512=1 \
AEGIS_V4_P3_PROFILE=1 \
AEGIS_V4_P3_BINARY="$binary" \
AEGIS_FULL_SHA512_PROFILE_ARTIFACT="$profile" \
AEGIS_FULL_SHA512_RETAIN_DIR="$retained" \
AEGIS_FULL_SHA512_PROVER_TIMEOUT_MS=1800000 \
RAYON_NUM_THREADS="${RAYON_NUM_THREADS:-2}" \
NODE_OPTIONS='--max-old-space-size=8192' \
  /usr/bin/time -v timeout --signal=TERM --kill-after=30s 2400s \
  node --test --test-concurrency=1 \
  aegis-flow/experiments/pq128/v4/full-single-transfer.integration.test.mjs

node --input-type=module - "$profile" <<'JS'
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const data=JSON.parse(readFileSync(process.argv[2],'utf8'));
assert.equal(data.schema,'AEGIS_SIX_SHA512_FINANCIAL_PROVER_RESOURCE_V1');
assert.equal(data.hash_calls,6);
assert.ok(data.gate_count>1_000_000);
assert.equal(data.native_exit_code,0);
assert.equal(data.native_proof_generated,true);
assert.equal(data.independent_financial_verification,true);
assert.equal(data.statement_rebinding_rejected,true);
assert.equal(data.zero_knowledge_proved,false);
assert.equal(data.qrom_soundness_proved,false);
assert.equal(data.pq128_demonstrated,false);
assert.equal(data.production_ready,false);
JS
echo "AEGIS_SIX_SHA512_FINANCIAL_EXPERIMENT_VERIFIED profile=$profile"
echo "Synthetic proof, public program and statement retained LOCALLY at $retained"
echo 'RESEARCH ONLY: No proof of PQ128, QROM, knowledge soundness or zero knowledge.'
