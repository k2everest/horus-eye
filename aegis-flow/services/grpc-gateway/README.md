# gRPC Gateway v1 (US-018)

Escopo concluído para US-018 no MVP:

- Contratos `TxService` e `CryptoService` publicados em `proto/aegis/v1`.
- Versionamento `aegis.v1` definido.
- Pipeline CI para lint/generate de proto já preparado (`scripts/gen-proto.sh`).

Próximo passo (fora do US-018): servidor gRPC fully-managed com mTLS e policy.
