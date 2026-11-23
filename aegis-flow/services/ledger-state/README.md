# Estado persistente — SQLite WAL

Node.js >=24.8. Banco local por rede com `WAL`, `synchronous=FULL`, foreign keys,
checks/uniqueness e transações `BEGIN IMMEDIATE`. Schema versionado por
`PRAGMA user_version=1`; versões futuras desconhecidas e network_id diferente
são rejeitados. Startup confere integridade SQLite e root/count do tip.

Persistem: commitments ordenados, roots por altura, inputs consumidos,
nullifiers únicos, recibos idempotentes, transações públicas cifradas e proofs
STARK. Notes em claro, randomness, spend secrets e chaves privadas não entram
no banco. Recibos V1 de verificação de assinatura ficam separados do ledger.

## Aplicação de uma transação

O ponto de entrada da aplicação é `submitProvenTransfer`: snapshot dos inputs,
assinatura ML-DSA, statement reconstruído, STARK para o programa aprovado e
então uma transação SQLite que:

- verifica idempotência por request_id e rejeita reutilização com outro tx_id;
- exige root corrente e inputs existentes/não consumidos;
- rejeita nullifier usado e output commitment repetido;
- grava recibo, proof audit, transação pública, prova, bloco, inputs consumidos,
  nullifiers e novos commitments, ou reverte tudo.

O root usa Merkle SHA-256 com separação de domínio e número de folhas
vinculado. `inclusionProof` permite verificar inclusão sem confiar no caminho
fornecido pelo servidor, **desde que o verificador tenha um root confiável**.
Um root fornecido junto da própria prova não é uma âncora de consenso.

`PersistentLedger.commitTransition` é API **interna de armazenamento confiável**;
ela não gera nem verifica ZK por conta própria. Nunca expô-la como endpoint.
Somente o facade que verifica a prova deve chamá-la para submissões de clientes.
`bootstrap` é uma operação administrativa offline, única, para um genesis de
laboratório confiável; não é faucet nem API de emissão pública.

## Executar e inicializar

O servidor iniciado por `server.mjs` usa `AEGIS_LEDGER_PATH` ou
`work/aegis-ledger.sqlite`. A factory de testes só ativa persistência com
`ledgerPath` explícito. O default de network_id é `aegis-lab-v1`.

```bash
node aegis-flow/scripts/init-ledger.mjs work/ledger.sqlite work/public-commitments.json
AEGIS_LEDGER_PATH=work/ledger.sqlite node aegis-flow/services/validation-gateway/server.mjs
```

`public-commitments.json` contém apenas uma lista de commitments de Notes V2
criadas offline. É responsabilidade do operador registrar a alocação inicial
e dos beneficiários guardar as notes/segredos localmente. Inicializar o genesis
uma segunda vez falha; não há opção de force/reset.

Compose monta um volume nomeado em `/data`; `down` preserva o volume. Não usar
`down -v` para um estado que precise ser preservado.

## Backup e recuperação

```bash
node aegis-flow/scripts/backup-ledger.mjs work/ledger.sqlite work/backup-01.sqlite
```

Usa a API de backup consistente do SQLite, inclusive com WAL ativo, e recusa
sobrescrever um destino existente. Não copiar apenas o arquivo `.sqlite`
enquanto houver escritores: mudanças podem estar no WAL. Para restaurar,
parar o serviço, conservar o estado antigo, apontar o serviço para o backup e
validar root/altura/recibos antes de reabrir acesso.

Testes cobrem reopen, backup/restore, concorrência real entre processos,
rollback de exceção e processo terminado antes do commit. Não simulam um
apagão do hardware/disco; RPO/RTO e backups externos continuam pendentes.

## Limites

SQLite aqui é para um único host com filesystem local e locks confiáveis.
Não usar um mesmo arquivo em NFS entre réplicas. A policy exige o tip atual,
portanto transações independentes com root antigo também devem ser refeitas.
Roots são recalculados em O(n), com limite de 1 milhão de folhas no módulo;
escala exige árvore incremental e possivelmente banco/serviço diferente.

Estado local aplicado não significa settlement em rede distribuída. Um
administrador com acesso de escrita ao banco pode alterar dados; ainda não há
âncoras externas, consenso ou recuperação contra administrador malicioso.
Rate limiting, cotas de disco, autenticação, migrações de release e operação
multi-réplica de produção permanecem pendentes.
