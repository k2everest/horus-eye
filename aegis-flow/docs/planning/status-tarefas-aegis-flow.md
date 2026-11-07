# Status das tarefas Aegis Flow (baseado no backlog Jira)

Este documento cruza o backlog de `jira-import-aegis-flow.csv` com o que já foi implementado no repositório.

## Legenda

- ✅ **Concluída**: entregue com artefato executável/documentado.
- 🟡 **Parcial**: iniciado, mas ainda sem escopo completo do item.
- ⬜ **Não iniciada**: sem implementação no código atual.

## Análise do arquivo de importação Jira

Arquivo analisado: `docs/planning/jira-import-aegis-flow.csv`.

- Estrutura válida para importação via CSV (cabeçalho + linhas Epic/Story).
- Dependências estão em formato legível (`US-010;US-013` etc.).
- Labels foram serializadas em uma coluna única com vírgulas (ex: `"aegis,pqc"`), o que costuma funcionar com mapeamento manual de campo no importador Jira.
- `Epic Link` das stories aponta para o título do épico (não para issue key real), adequado para importação inicial em lote quando o mapeamento do importador resolve pelo nome.

## Status por épico e story

## EPIC-01 Base criptográfica PQC
- ✅ **US-001 Threat model e parâmetros de segurança**
  - Threat model MVP formalizado em `docs/architecture/02-threat-model.md`.
- ✅ **US-002 Wrappers ML-KEM/ML-DSA + test vectors**
  - Wrapper MVP implementado em `libs/crypto-core/pqc-wrapper.mjs` com testes automatizados de aceitação.
- ✅ **US-003 Serialização canônica + transcript hash**
  - Implementação MVP em `libs/crypto-core/canonical-transcript.mjs` com testes determinísticos de serialização e hash por `domainTag`.
- ✅ **US-004 Commitments lattice (SIS/LWE)**
  - Implementação MVP de `commit/open/verify` em `libs/crypto-core/lattice-commitment.mjs` com testes de alteração de opening e variação por randomness.

## EPIC-02 Transação blindada
- ✅ **US-005 Modelo Note/Nullifier/Commitment**
  - Implementado em `libs/crypto-core/note-model.mjs` com `createNote`, `deriveNullifier` e `canonicalizeNote`, cobertos por testes unitários.
- ✅ **US-006 BuildShieldedTx v1**
  - Implementado em `libs/crypto-core/build-shielded-tx.mjs` com montagem de output commitment, transcript hash e assinatura PQC.
- ✅ **US-007 ValidateShieldedTx v1**
  - Implementado em `libs/crypto-core/validate-shielded-tx.mjs` com validação estrutural, replay guard por `request_id`, checks canônicos de transcript/tx_id e verificação de assinatura no fluxo MVP.

## EPIC-03 Provas ZK lattice
- ✅ **US-008 Statement ZK formal (ownership/balance/range)**
  - Implementado em `libs/crypto-core/zk-statement.mjs` e formalizado em `docs/architecture/04-zk-statement.md` com digest canônico `PROOF_TX_V1`.
- ✅ **US-009 Prover v1**
  - Implementado em `libs/crypto-core/prover-v1.mjs` com geração de prova `LATTICE-ZK-MVP` e métricas (`prove_time_ms`, `proof_size_bytes`).
- ✅ **US-010 Verifier v1**
  - Implementado em `libs/crypto-core/verifier-v1.mjs` com verificação determinística de proof, digest do statement e cláusulas obrigatórias.
- ✅ **US-011 Testes adversariais de prova**
  - Implementado em `libs/crypto-core/proof-adversarial.test.mjs` com casos de tampering, proof malformada e replay de proof.

## EPIC-04 Estado blindado e anti-double-spend
- ✅ **US-012 Ledger commitments tree**
  - Implementado em `libs/crypto-core/ledger-commitment-tree.mjs` com cálculo determinístico de root, snapshots e roots por altura.
- ✅ **US-013 Nullifier registry atômico**
  - Implementado em `libs/crypto-core/nullifier-registry.mjs` com check/reserve/commit/release, ownership e reservas em lote sem mutação parcial.
- ✅ **US-014 Testes de carga e caos (escopo solicitado)**
  - SLO >= 99,9% definido em `docs/operations/01-slo-load-chaos.md`; carga concorrente e recuperação após falha transitória são validadas em `services/validation-gateway/load-chaos.test.mjs`.
  - Nota de rastreabilidade: no CSV histórico, “Testes de carga e caos” consta como US-021; esta execução segue a numeração US-014 informada na solicitação atual.

## EPIC-05 Rede privada anti-correlação
- ⬜ **US-015 Relay com padding e batching**
- ⬜ **US-016 Delays e cover traffic**
- ⬜ **US-017 Métricas de linkabilidade de tráfego**

## EPIC-06 Integração gRPC e hardening
- ✅ **US-018 API Gateway gRPC v1**
  - Contratos versionados `aegis.v1` consolidados e documentados em `services/grpc-gateway/README.md`.
- ⬜ **US-019 mTLS + AuthN/AuthZ service-to-service**
- ✅ **US-020 Observabilidade segura**
  - Logging seguro implementado com `tx_id_hash` e cobertura de testes para não vazamento de payload sensível.
- ⬜ **US-021 Testes de carga e caos**

## Resumo executivo

- **Concluídas:** 16 (`US-001`, `US-002`, `US-003`, `US-004`, `US-005`, `US-006`, `US-007`, `US-008`, `US-009`, `US-010`, `US-011`, `US-012`, `US-013`, `US-014`, `US-018`, `US-020`)
- **Parciais:** 0
- **Não iniciadas:** 5

## Evidências usadas nesta classificação

- Contratos proto:
  - `proto/aegis/v1/tx.proto`
  - `proto/aegis/v1/crypto.proto`
- MVP do serviço:
  - `services/validation-gateway/index.mjs`
  - `services/validation-gateway/server.mjs`
  - `services/validation-gateway/logger.mjs`
  - `services/validation-gateway/validation-gateway.test.mjs`
- Deploy/docs:
  - `docs/deployment/01-gcp-cloud-run.md`
  - `docs/planning/jira-import-aegis-flow.csv`
