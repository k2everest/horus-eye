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

- **Replay básico**: mitigado parcialmente por `request_id` e trilha de logs.
- **Exposição de dados em observabilidade**: mitigado por hash SHA-256 (`tx_id_hash`) e ausência de `tx_blob` no log.
- **Downgrade criptográfico**: mitigado por allowlists exatas ML-DSA/ML-KEM, com verificação nativa do algoritmo das chaves.
- **Payload malformado**: mitigado por validação estrutural e retorno `INVALID_ARGUMENT`/`FAILED_PRECONDITION`.
- **Dependência em ECC/RSA no envelope transacional**: fora do caminho aceito; qualquer implementação futura que introduza fallback legado deve ser tratada como falha de segurança.

## Limitações conhecidas

- ML-DSA/ML-KEM e cifragem autenticada das notes agora usam primitivas nativas reais (Node.js >=24.8), com casos NIST ACVP. A integração não é certificação FIPS nem auditoria independente.
- Provas ZK e commitments continuam como stubs. O gateway verifica assinatura e estrutura; não comprova saldo, ownership dos inputs, roots ou gasto duplo. `production_ready` permanece false.
- Metadados públicos (amount, asset e fingerprints) e a construção KEM/AEAD precisam de revisão. A carteira browser antiga ainda gera envelopes fictícios, rejeitados pelo gateway.
- Não há proteção formal anti-replay em estado persistente.
- mTLS e AuthN/AuthZ entre serviços ainda pendentes.
