# Roadmap público — QUEER testnet até altcoin

Este documento separa o **MVP público demonstrável** de uma altcoin apta a custodiar valor. Uma interface ou um gateway não cria, por si só, uma blockchain.

## Estado entregue neste MVP público

- [x] Landing page pública em `/queer`.
- [x] Carteira testnet demonstrativa em `/queer/wallet`.
- [x] Identidade e endereço efêmeros, armazenados somente na sessão do navegador.
- [x] Saldo faucet local sem valor e histórico da sessão.
- [x] Construção de envelope demonstrativo e envio ao Validation Gateway.
- [x] CORS configurável no gateway para permitir a interface pública.
- [x] Alertas explícitos de que assinatura, KEM, saldo e settlement ainda são simulações.

## Fase 1 — Testnet de settlement (bloqueadora)

- [ ] **QER-022 — Especificação monetária:** supply, unidades, emissão, taxas, burn e governança.
- [ ] **QER-023 — Contrato `QueerShieldedPool`:** root, commitments, nullifiers e atualização atômica.
- [ ] **QER-024 — Verifier on-chain:** substituir flags/JSON por prova criptográfica verificável.
- [ ] **QER-025 — Testes de contrato:** double-spend, root antigo, proof inválida, reentrância e eventos sem PII.
- [ ] **QER-026 — Deploy Sepolia:** scripts reproduzíveis, endereços versionados e verificação do bytecode.
- [ ] **QER-027 — Settlement relayer:** nonce, gas, retries, receipt, finality e reorgs.
- [ ] **QER-028 — API de status:** `CREATED → VALIDATED → SUBMITTED → INCLUDED → FINALIZED`.
- [ ] **QER-029 — Integrar carteira:** substituir saldo local por estado indexado e submissão real à Sepolia.

**Marco:** transações sem valor real são incluídas, consultadas e rejeitam nullifiers duplicados em testnet.

## Fase 2 — Criptografia de produção (bloqueadora para dinheiro real)

- [ ] **QER-030 — ML-DSA real:** biblioteca auditável, FIPS 204, vetores oficiais e formatos canônicos.
- [ ] **QER-031 — ML-KEM real:** FIPS 203, KDF/AEAD, vetores oficiais e rotação de chaves.
- [ ] **QER-032 — Commitments aprovados:** substituir o hash MVP por construção formal e parâmetros revisados.
- [ ] **QER-033 — Prova ZK real:** ownership, conservação, range e nullifier sem witness público.
- [ ] **QER-034 — Auditoria criptográfica externa:** escopo, findings, correções e nova verificação.
- [ ] **QER-035 — Carteira segura:** keystore cifrado, backup/restore, recovery, lock e proteção contra XSS.
- [ ] **QER-036 — Cerimônia de parâmetros:** somente se o sistema de prova exigir trusted setup.

**Marco:** nenhuma função de aceitação depende de stubs, booleanos autodeclarados ou chaves demonstrativas.

## Fase 3 — Operação de testnet pública

- [ ] **QER-037 — Persistência:** ledger, nullifiers e receipts em banco transacional com migrações.
- [ ] **QER-038 — Indexador/explorer:** consultar roots, commitments, nullifiers e finalização sem revelar dados privados.
- [ ] **QER-039 — Faucet e limites:** anti-abuso, quotas, rate limit e proteção Sybil.
- [ ] **QER-040 — Observabilidade:** SLOs, alertas, tracing opaco e resposta a incidentes.
- [ ] **QER-041 — Infraestrutura:** IaC, ambientes dev/stage/testnet, backups e disaster recovery.
- [ ] **QER-042 — Segurança ofensiva:** fuzzing, pentest, dependency/SBOM e programa de disclosure.
- [ ] **QER-043 — Wallet UX:** sincronização, contatos locais, taxas, confirmações e erros recuperáveis.
- [ ] **QER-044 — SDK e documentação pública:** TypeScript/Rust, exemplos e compatibilidade versionada.

**Marco:** testnet pública observável, recuperável e utilizável por terceiros.

## Fase 4 — Altcoin / rede própria pós-quântica

- [ ] **QER-045 — Decisão de arquitetura:** token sobre settlement clássico versus app-chain própria.
- [ ] **QER-046 — Runtime e modelo de estado:** execução determinística, mempool e regras de validade.
- [ ] **QER-047 — Consenso PQC:** chaves de validadores, assinaturas de blocos e rotação resistentes a quantum.
- [ ] **QER-048 — P2P privado:** anti-eclipse/Sybil, padding, batching e proteção de metadados.
- [ ] **QER-049 — Genesis e distribuição:** alocação transparente, vesting e verificabilidade.
- [ ] **QER-050 — Governança e upgrades:** quorum, timelock, emergency pause e migração criptográfica.
- [ ] **QER-051 — Node, CLI e explorer:** operação permissionless e reprodução de builds.
- [ ] **QER-052 — Incentivos:** fees, validadores, staking/slashing ou modelo alternativo formalizado.
- [ ] **QER-053 — Auditorias de protocolo/consenso:** revisão independente e testnet adversarial longa.

**Marco:** a rede, e não apenas o payload da aplicação, usa autenticação pós-quântica.

## Fase 5 — Prontidão de lançamento

- [ ] **QER-054 — Parecer jurídico:** classificação do ativo, AML/sanções, privacidade e jurisdições de operação.
- [ ] **QER-055 — Tokenomics revisada:** simulações econômicas, concentração, incentivos e riscos.
- [ ] **QER-056 — Política de chaves:** multisig/PQC, segregação de função e plano de comprometimento.
- [ ] **QER-057 — Bug bounty:** escopo público e processo de correção antes de mainnet.
- [ ] **QER-058 — Launch readiness review:** gates técnicos, jurídicos, operacionais e comunicação honesta.

## Regra de comunicação

Até concluir as fases 1 e 2, usar **“QUEER testnet demo”**. Não anunciar o produto como moeda pós-quântica, não vender tokens e não aceitar depósitos. Uma Sepolia MVP comprova integração de settlement, mas continua herdando as propriedades clássicas da rede hospedeira.
