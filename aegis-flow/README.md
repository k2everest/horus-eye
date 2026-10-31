# Aegis Flow

## Publicar a branch e criar o PR no Codespaces

O script abaixo configura o `origin`, valida a autenticação do GitHub CLI,
publica a branch atual e abre o pull request contra `main`:

```bash
bash aegis-flow/scripts/publish-pr.sh
```

O próprio script remove tokens expirados injetados pelo Codespaces e inicia o
login pelo navegador quando necessário. Ao terminar, ele imprime a URL do PR.
Não execute `gh auth login` antes do script: um `GITHUB_TOKEN` expirado pode
bloquear o comando.

O script recusa execução diretamente na `main`. Para outro fork ou branch base,
defina `AEGIS_GITHUB_REPOSITORY` e `AEGIS_BASE_BRANCH` antes de executá-lo.


## Planejamento

- Backlog Jira importável: `docs/planning/jira-import-aegis-flow.csv`.
- Threat model MVP: `docs/architecture/02-threat-model.md`.
- Status de execução: `docs/planning/status-tarefas-aegis-flow.md`.
- SLO e homologação de carga/caos: `docs/operations/01-slo-load-chaos.md`.
