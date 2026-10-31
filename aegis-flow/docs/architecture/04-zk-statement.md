# ZK Statement Formal (US-008)

Este documento formaliza o statement mínimo do fluxo `PROOF_TX_V1` para o MVP Aegis Flow.

## Statement público

- `anchor_state_root`
- `input_commitments[]`
- `output_commitments[]`
- `nullifiers[]`
- `public_amount`
- `public_asset_id`

## Cláusulas obrigatórias

1. **ownership**: prova de posse das chaves de gasto dos inputs.
2. **balance**: conservação de valor entre entradas e saídas (+ fee quando aplicável).
3. **range**: valores em intervalo permitido.
4. **nullifier_uniqueness**: nulificadores não reutilizados.

## Envelope formal no MVP

A implementação MVP constrói envelope com:

- `constraints_version: ZK-STMT-V1`
- `statement`
- `statement_digest` (hash canônico com `domainTag=PROOF_TX_V1`)
- `clauses` booleanas das 4 regras acima

## Artefatos no código

- `libs/crypto-core/zk-statement.mjs`
- `libs/crypto-core/zk-statement.test.mjs`
