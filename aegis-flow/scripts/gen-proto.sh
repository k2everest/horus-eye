#!/usr/bin/env bash
set -euo pipefail

buf lint

# Só roda breaking se existir branch main remota/local
if git show-ref --verify --quiet refs/heads/main || git ls-remote --exit-code --heads origin main >/dev/null 2>&1; then
  buf breaking --against '.git#branch=main'
else
  echo "main não encontrada, pulando buf breaking"
fi

buf generate
echo "Proto generation concluída."
