# Validation Gateway — verificação PQC

Node.js >=24.8, sem dependências externas. `POST /validate` recebe a transação
pública retornada por `buildShieldedTx` e verifica schema, transcript, vínculo
da chave ao remetente e assinatura ML-DSA real. Envelopes legados com `sig`,
`pk`, `ct` e `tx_blob` não são aceitos.

`valid: true` significa **assinatura e estrutura válidas**, não gasto aceito ou
saldo verificado. A resposta declara `validation_scope: signature-and-structure-only`
e `production_ready: false`. Provas ZK, roots, unicidade persistente de
nullifiers e settlement ainda não são verificados. Repetir uma transação no
HTTP verifica novamente a assinatura; não há liquidação nem deduplicação
persistente. O core aceita cache explícito para replay em um processo.

`NODE_ENV=production` ou `AEGIS_MODE` diferente de `demo` bloqueiam startup e
chamada direta. O nome demo preserva a restrição de laboratório, apesar de a
assinatura já ser real. Os stubs de provas e commitments continuam fora do
caminho de assinatura, mas impedem liberação financeira.

## Executar e testar

```bash
node aegis-flow/services/validation-gateway/server.mjs
npm test --prefix aegis-flow/services/validation-gateway
bash aegis-flow/scripts/dev-env.sh test
```

Exemplo completo de chaves, assinatura e decriptação em
`../../libs/crypto-core/README.md`. Envie apenas a transação pública como JSON
para `/validate`. O gateway nunca precisa da chave privada do cliente.

HTTP exige `application/json`, máximo 64 KiB por corpo por padrão; timeouts de
headers 10 s, requisição/inatividade 15 s. JSON inválido recebe 400, excesso de
tamanho 413 e tipo de mídia incorreto 415. Logs contêm request_id, status,
latência e hash do input, sem envelope bruto. Rate limiting, autenticação e
política completa de metadados continuam pendentes.

## Docker

O contexto agora é `aegis-flow/`, pois o serviço importa o crypto-core:

```bash
docker build -f aegis-flow/services/validation-gateway/Dockerfile \
  -t aegis-flow/validation-gateway:local aegis-flow
```

Compose já usa esse contexto e Node 24. Guia GCP atualizado em
`../../docs/deployment/01-gcp-cloud-run.md`; build e execução locais não
publicam imagens nem realizam deploy.
