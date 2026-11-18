# Aegis Flow Threat Model (US-001)

## Escopo

- `validation-gateway`
- Contratos `TxService` e `CryptoService`
- Logs estruturados e transporte HTTP/gRPC
- Ameaça quântica contra primitivas assimétricas legadas e contra qualquer caminho de validação que tente fazer downgrade criptográfico.

## Adversários

1. **Clássico remoto**: tenta forjar payloads, replay e exfiltração por logs.
2. **Quântico futuro**: adversário com capacidade de executar algoritmos quânticos relevantes contra criptografia assimétrica legada; o escopo do Aegis Flow é rejeitar dependências ECC/RSA no envelope transacional e exigir ML-DSA/ML-KEM no caminho MVP.
3. **Insider operacional**: acesso a logs e configuração de runtime.

## Objetivos de segurança

- Integridade da validação de requisições.
- Não vazamento de payload sensível (`tx_blob`).
- Rejeição de transações sem envelope anti-quântico mínimo.
- Rastreabilidade segura por `request_id`/`tx_id_hash`.
- Resistência a downgrade para primitivas não-PQC no envelope de assinatura/KEM.

## Ameaças e mitigação (MVP)

- **Replay/gasto duplo local V2**: request_id/tx_id idempotentes, input consumido e nullifier únicos em transação SQLite, com prova vinculada à rede e transação. Isso não substitui consenso multi-host.
- **Exposição de dados em observabilidade**: mitigado por hash SHA-256 (`tx_id_hash`) e ausência de `tx_blob` no log.
- **Downgrade criptográfico**: mitigado por allowlists exatas ML-DSA/ML-KEM, com verificação nativa do algoritmo das chaves.
- **Payload malformado**: mitigado por validação estrutural e retorno `INVALID_ARGUMENT`/`FAILED_PRECONDITION`.
- **Dependência em ECC/RSA no envelope transacional**: fora do caminho aceito; qualquer implementação futura que introduza fallback legado deve ser tratada como falha de segurança.

## Limitações conhecidas

- ML-DSA/ML-KEM e cifragem autenticada das notes agora usam primitivas nativas reais (Node.js >=24.8), com casos NIST ACVP. A integração não é certificação FIPS nem auditoria independente.
- Transfer V2 verifica STARK real de abertura/ownership/range/balance/inclusão e aplica nullifiers/inputs atomicamente em SQLite. O SDK usa parâmetros conjecturados (~98 bits), ainda sem auditoria desta integração; `production_ready` permanece false. V1 /validate verifica somente assinatura/estrutura.
- Metadados públicos (amount, asset e fingerprints) e a construção KEM/AEAD precisam de revisão. A carteira browser antiga ainda gera envelopes fictícios, rejeitados pelo gateway.
- V2 tem proteção persistente contra replay/gasto duplo no host local; consenso/âncora externa e auditoria formal continuam pendentes.
- mTLS e AuthN/AuthZ entre serviços ainda pendentes.
