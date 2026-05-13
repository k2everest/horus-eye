#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

buf lint

if git show-ref --verify --quiet refs/heads/main || git ls-remote --exit-code --heads origin main >/dev/null 2>&1; then
  buf breaking --against '.git#branch=main'
else
  echo "main não encontrada, pulando buf breaking"
fi

buf generate
echo "Proto generation concluída."
