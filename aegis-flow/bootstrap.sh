#!/usr/bin/env bash
set -euo pipefail

mkdir -p \
  docs/architecture docs/adr \
  proto/aegis/v1 \
  libs/crypto-core libs/proof-sdk libs/common \
  services/keyvault services/proof-engine services/tx-builder services/validation-gateway \
  services/ledger-state services/nullifier-registry services/relay-mix services/consensus-gateway services/policy-audit \
  deployments/docker deployments/k8s/base deployments/k8s/overlays/{dev,stage,prod} \
  scripts tests/{integration,e2e,adversarial} .github/workflows

touch README.md AGENTS.md \
  docs/architecture/{01-overview.md,02-threat-model.md,03-crypto-primitives.md,04-zk-statement.md,05-data-model.md,06-network-privacy.md} \
  docs/adr/{ADR-0001-pqc-primitives.md,ADR-0002-canonical-serialization.md,ADR-0003-nullifier-atomicity.md} \
  proto/aegis/v1/{crypto.proto,proof.proto,tx.proto,state.proto,relay.proto} \
  scripts/{gen-proto.sh,lint.sh,test.sh,e2e.sh} \
  .github/workflows/{ci.yml,security.yml,release.yml}
