# Aegis Flow

Esta base é demonstrativa. O gateway bloqueia `NODE_ENV=production` e modos
diferentes de `demo`; `/validate` comprova assinatura e estrutura. `/submit` verifica STARK e aplica
estado local; APPLIED_LOCAL não significa mainnet ou settlement em rede.
Há um novo modo experimental de **rede aberta com Proof of Work**, sem cadastro
de validadores, filtro de país ou chave de autoridade monetária. Cada nó verifica
os blocos em banco próprio; emissão limitada por genesis e reorganizações pela
cadeia de maior trabalho. Não foi implantada uma rede pública. Carteira gráfica
e ferramentas permissionadas ainda precisam de adaptação a este modo.
Decisão: [ADR-0006](docs/adr/ADR-0006-open-proof-of-work.md).
Execução: [rede aberta](docs/operations/open-chain.md).
Evidências locais: [validação de consenso e STARK](docs/testing/open-chain-validation.md).

O modelo anterior opt-in de settlement permissionado usa autoridade ML-DSA,
certificados de finalização e recuperação; exige confiança nessa autoridade.
Decisão: `docs/adr/ADR-0005-permissioned-settlement.md`.
Operação: `docs/operations/settlement.md`.
Plano de preparação: `docs/planning/production-readiness.md`.
Segurança operacional (acesso, segredos, limites, métricas e incidentes):
`docs/operations/security.md`. O gateway inicia em loopback; exposição remota
exige política de acesso e TLS.
Infraestrutura single-host, migrações, backup S3 e ensaio de restauração:
`docs/operations/infrastructure-recovery.md`. SQLite não oferece HA multi-host.
Campanha prolongada com provas novas, carga de replay e evidências de terceiros:
`docs/operations/public-testnet.md`. P1 público ainda não foi concluído.
Revisão monetária, responsabilidades e matriz jurídica: `docs/launch/README.md`.
O pacote permanece bloqueado até decisões, nomeações e evidências reais.

## QUEER

QUEER é a identidade pública experimental do protocolo. A interface de
marketing está disponível em `/queer`; o roteiro de testes e as limitações do
MVP estão documentados em `docs/testing/01-testar-queer.md`.

A carteira de laboratório está disponível em `/queer/wallet` e usa um serviço
local com ML-DSA/ML-KEM reais, cofre criptografado, backup/restauração e saldo
derivado do ledger finalizado e revalidado. Não há saldo inicial fictício nem
chaves privadas em sessionStorage. Execução: `docs/operations/wallet.md`.
Continua sem implantação de ativos de valor real. O caminho até uma altcoin está em
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

- Relay com padding e batching (MVP local): `services/relay-mix/README.md`.

- Backlog Jira importável: `docs/planning/jira-import-aegis-flow.csv`.
- Threat model MVP: `docs/architecture/02-threat-model.md`.
- Status de execução: `docs/planning/status-tarefas-aegis-flow.md`.
- SLO e homologação de carga/caos: `docs/operations/01-slo-load-chaos.md`.

## Criptografia nativa

Node.js >=24.8 é obrigatório. API, formatos, vetores NIST e limites em
`libs/crypto-core/README.md`. O gateway verifica ML-DSA real; o formato legado
da carteira demonstrativa não é compatível.

## Provas e estado persistente

- Composite STARK, guest, pins e teste real: `services/proof-engine/README.md`.
- SQLite WAL, snapshots, nullifiers e backup/restore: `services/ledger-state/README.md`.
- API V2 e limites: `services/validation-gateway/README.md`.

O witness de prova permanece local. O gateway recebe somente transação pública
assinada e receipt STARK. O volume Docker preserva estado entre reinícios;
SQLite em filesystem efêmero ou compartilhado entre hosts não é suportado.
