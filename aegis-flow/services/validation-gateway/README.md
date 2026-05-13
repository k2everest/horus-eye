# Validation Gateway MVP (Log-first)

Este diretório contém um MVP funcional de validação com geração de logs estruturados.

## Arquivos

- `index.mjs`: handler `validateShieldedTx` com logging de entrada/saída.
- `logger.mjs`: utilitários de log, incluindo hash (`sha256`) do payload.
- `server.mjs`: servidor HTTP mínimo (`/healthz` e `/validate`) para execução local/GCP Cloud Run.
- `validation-gateway.test.mjs`: teste para garantir que o `tx_blob` não é vazado em logs.
- `Dockerfile`: imagem mínima para deploy no Cloud Run.
- `package.json`: scripts locais para executar e testar.

## Como rodar local

```bash
cd aegis-flow/services/validation-gateway
npm run start
```

### Teste rápido local

```bash
curl -s http://localhost:8080/healthz
curl -s -X POST http://localhost:8080/validate \
  -H 'content-type: application/json' \
  -d '{"tx_blob":"0123456789abcdef0123456789abcdef","request_id":"req-local-1"}'
```

## Como testar

```bash
cd aegis-flow/services/validation-gateway
npm run test
```

## Manual GCP

- Guia completo: `aegis-flow/docs/deployment/01-gcp-cloud-run.md`

## Campos obrigatórios de log

- `timestamp`
- `level`
- `service` (`validation-gateway`)
- `request_id`
- `method` (`ValidateShieldedTx`)
- `status_code`
- `latency_ms`
- `tx_id_hash` (hash da transação, nunca payload bruto)
- `error_code` (quando houver)

## Regras de segurança

- Nunca registrar chaves privadas, witness, memos em claro ou payload binário completo.
- Sempre propagar `request_id` no request e response.
- Usar códigos gRPC consistentes para erro:
  - `INVALID_ARGUMENT`
  - `FAILED_PRECONDITION`
  - `PERMISSION_DENIED`
