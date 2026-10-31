#!/usr/bin/env bash
set -euo pipefail

readonly REPOSITORY="${AEGIS_GITHUB_REPOSITORY:-k2everest/horus-eye}"
readonly REMOTE_URL="https://github.com/${REPOSITORY}.git"
readonly BASE_BRANCH="${AEGIS_BASE_BRANCH:-main}"
readonly HEAD_BRANCH="$(git branch --show-current)"

authenticate_github() {
  if gh auth status --hostname github.com >/dev/null 2>&1; then
    return
  fi

  # Codespaces may inject an expired token. It takes precedence over credentials
  # stored by `gh` and also prevents `gh auth login` from starting.
  unset GH_TOKEN GITHUB_TOKEN

  if gh auth status --hostname github.com >/dev/null 2>&1; then
    return
  fi

  if [[ ! -t 0 ]]; then
    cat >&2 <<'EOF'
Erro: GitHub CLI não está autenticado e o terminal não é interativo.
Execute em um terminal do Codespaces:
  unset GH_TOKEN GITHUB_TOKEN
  gh auth login --hostname github.com --git-protocol https --web
EOF
    exit 1
  fi

  echo "Autenticação GitHub necessária; siga as instruções do navegador."
  gh auth login --hostname github.com --git-protocol https --web
}

if [[ -z "${HEAD_BRANCH}" ]]; then
  echo "Erro: o repositório está em detached HEAD." >&2
  exit 1
fi

if [[ "${HEAD_BRANCH}" == "${BASE_BRANCH}" ]]; then
  echo "Erro: crie uma branch de trabalho antes de publicar o PR." >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "Erro: GitHub CLI (gh) não está instalado." >&2
  exit 1
fi

authenticate_github

if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "${REMOTE_URL}"
else
  git remote add origin "${REMOTE_URL}"
fi

gh auth setup-git --hostname github.com
git fetch origin "${BASE_BRANCH}"

if [[ "$(git rev-list --count "origin/${BASE_BRANCH}..HEAD")" -eq 0 ]]; then
  echo "Erro: a branch ${HEAD_BRANCH} não possui commits novos em relação a ${BASE_BRANCH}." >&2
  exit 1
fi

git push --set-upstream origin "${HEAD_BRANCH}"

if gh pr view --repo "${REPOSITORY}" --head "${HEAD_BRANCH}" >/dev/null 2>&1; then
  echo "PR já existe: $(gh pr view --repo "${REPOSITORY}" --head "${HEAD_BRANCH}" --json url --jq .url)"
  exit 0
fi

pr_url="$(gh pr create \
  --repo "${REPOSITORY}" \
  --base "${BASE_BRANCH}" \
  --head "${HEAD_BRANCH}" \
  --fill)"

echo "PR criado: ${pr_url}"

