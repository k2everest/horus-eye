#!/usr/bin/env bash
set -euo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly COMPOSE_FILE="${ROOT_DIR}/deployments/docker/compose.yaml"
readonly ENV_FILE="${ROOT_DIR}/deployments/docker/.env"
readonly ENV_EXAMPLE="${ROOT_DIR}/deployments/docker/.env.example"

compose() {
  local args=(--file "${COMPOSE_FILE}")
  if [[ -f "${ENV_FILE}" ]]; then
    args+=(--env-file "${ENV_FILE}")
  fi
  docker compose "${args[@]}" "$@"
}

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "Erro: Docker não está instalado." >&2
    exit 1
  fi
  docker compose version >/dev/null
}

port() {
  local configured_port="${AEGIS_GATEWAY_PORT:-}"
  if [[ -z "${configured_port}" && -f "${ENV_FILE}" ]]; then
    configured_port="$(sed -n 's/^AEGIS_GATEWAY_PORT=//p' "${ENV_FILE}" | tail -n 1)"
  fi
  printf '%s' "${configured_port:-8080}"
}

smoke() {
  local base_url="http://127.0.0.1:$(port)"
  curl --fail --silent --show-error "${base_url}/healthz"
  echo
  curl --fail-with-body --silent --show-error \
    --request POST \
    --header 'content-type: application/json' \
    --data '{"request_id":"smoke-test"}' \
    "${base_url}/validate" >/dev/null || {
      local status=$?
      # A structurally invalid transaction is expected to return HTTP 400.
      [[ ${status} -eq 22 ]] || return "${status}"
    }
  echo "Smoke test concluído: serviço saudável e rejeição inválida confirmada."
}

usage() {
  cat <<'EOF'
Uso: scripts/dev-env.sh <comando>

Comandos:
  init    Cria deployments/docker/.env a partir do exemplo.
  up      Constrói e inicia o ambiente em segundo plano.
  down    Encerra e remove os containers do ambiente.
  logs    Acompanha os logs estruturados do gateway.
  ps      Mostra o estado dos serviços.
  test    Executa todos os testes Node.js do Aegis Flow.
  smoke   Verifica saúde e rejeição de uma transação inválida.
EOF
}

command="${1:-}"
case "${command}" in
  init)
    if [[ -f "${ENV_FILE}" ]]; then
      echo "${ENV_FILE} já existe; nenhuma alteração realizada."
    else
      cp "${ENV_EXAMPLE}" "${ENV_FILE}"
      echo "Criado: ${ENV_FILE}"
    fi
    ;;
  up)
    require_docker
    compose up --build --detach --wait
    echo "Validation Gateway disponível em http://127.0.0.1:$(port)"
    ;;
  down)
    require_docker
    compose down --remove-orphans
    ;;
  logs)
    require_docker
    compose logs --follow validation-gateway
    ;;
  ps)
    require_docker
    compose ps
    ;;
  test)
    node --test "${ROOT_DIR}"/libs/crypto-core/*.test.mjs
    npm test --prefix "${ROOT_DIR}/services/validation-gateway"
    ;;
  smoke)
    smoke
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac

