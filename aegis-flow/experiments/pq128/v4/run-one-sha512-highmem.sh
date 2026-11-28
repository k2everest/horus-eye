#!/usr/bin/env bash
# Isolated, synthetic FIPS SHA-512 full-compression STARK experiment.
# Requires a private/trusted >=48-GiB Linux research runner (64 GiB
# recommended). NEVER deploys a node, opens a wallet, or enables mainnet.
set -euo pipefail

if [[ "$(uname -s)" != Linux ]]; then
  echo 'AEGIS_SHA512_REQUIRES_LINUX' >&2
  exit 78
fi
for tool in cargo rustc node timeout git awk; do
  command -v "$tool" >/dev/null || { echo "MISSING_TOOL: $tool" >&2; exit 78; }
done
mem_kib=$(awk '/^MemTotal:/ {print $2;exit}' /proc/meminfo)
if [[ ! "$mem_kib" =~ ^[0-9]+$ ]] || (( mem_kib < 48*1024*1024 )); then
  echo "AEGIS_SHA512_HIGHMEM_REQUIRED: minimum physical 48 GiB; observed ${mem_kib:-unknown} KiB" >&2
  exit 78
fi
# In containerized/self-hosted runners, the cgroup allocation can be much
# smaller than physical RAM. Reject such environments before touching witness.
for limit_file in /sys/fs/cgroup/memory.max /sys/fs/cgroup/memory/memory.limit_in_bytes; do
  if [[ -r "$limit_file" ]]; then
    limit=$(cat "$limit_file")
    if [[ "$limit" =~ ^[0-9]+$ ]] && (( limit < 48*1024*1024*1024 )); then
      echo "AEGIS_SHA512_INSUFFICIENT_CGROUP_MEMORY: $limit bytes" >&2
      exit 78
    fi
  fi
done
root=$(git rev-parse --show-toplevel)
cd "$root"
manifest=aegis-flow/experiments/pq128/v4/plonky3/Cargo.toml
binary="$root/aegis-flow/experiments/pq128/v4/plonky3/target/release/aegis-v4-plonky3-lab"
artifact="$root/work/sha512-one-highmem-profile.json"
mkdir -p "$root/work"
# Preserve the already proven 2026-11-28 four-column baseline before
# benchmarking the compact two-column AIR. Never overwrite the backup.
baseline="$root/work/sha512-one-before-compact-profile.json"
if [[ -f "$artifact" && ! -e "$baseline" ]]; then
  cp -- "$artifact" "$baseline"
  chmod 600 "$baseline"
fi

echo "AEGIS_SHA512_HIGHMEM_RESEARCH_ONLY available_ram_kib=$mem_kib"
# The same Plonky3 version, trusted AIR, LogUp program, FRI queries and
# hiding commitments are used; only host CPU and Rayon scheduling differ.
cargo generate-lockfile --manifest-path "$manifest"
RUSTFLAGS='-C target-cpu=native' cargo build --locked --release \
  --features parallel-sha512-research --manifest-path "$manifest"

AEGIS_V4_P3_INTEGRATION=1 \
AEGIS_V4_P3_PROFILE=1 \
AEGIS_V4_P3_BINARY="$binary" \
AEGIS_SHA512_PROFILE_ARTIFACT="$artifact" \
AEGIS_SHA512_PROVER_TIMEOUT_MS=1200000 \
RAYON_NUM_THREADS="${RAYON_NUM_THREADS:-2}" \
  /usr/bin/time -v timeout --signal=TERM --kill-after=30s 1320s \
    node --test --test-concurrency=1 \
    aegis-flow/experiments/pq128/v4/sha512-wired-native.integration.test.mjs

echo "AEGIS_SHA512_HIGHMEM_VERIFIED: public resource report at $artifact"
echo 'This is not a PQ128, QROM, ZK, or mainnet security certificate.'
