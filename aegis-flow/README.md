# Aegis Flow

## QUEER

QUEER é a identidade pública experimental do protocolo. A interface de
marketing está disponível em `/queer`; o roteiro de testes e as limitações do
MVP estão documentados em `docs/testing/01-testar-queer.md`.

A carteira pública de laboratório está disponível em `/queer/wallet`. Ela cria
apenas identidades e saldo testnet demonstrativos e pode enviar envelopes ao
Validation Gateway; não custodia valor real. O caminho até uma altcoin está em
`docs/planning/roadmap-altcoin-queer.md`.

## Ambiente local com Docker

O ambiente de desenvolvimento sobe o Validation Gateway com healthcheck,
limites de logs e execução sem privilégios:

```bash
cd aegis-flow
./scripts/dev-env.sh init
./scripts/dev-env.sh up
./scripts/dev-env.sh smoke
./scripts/dev-env.sh logs
```

Para executar os testes ou encerrar o ambiente:

```bash
./scripts/dev-env.sh test
./scripts/dev-env.sh down
```

Por padrão, o serviço fica disponível em `http://127.0.0.1:8080`. Ajuste
`deployments/docker/.env` para usar outra porta. Esse arquivo local não deve
conter segredos nem ser versionado.

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
