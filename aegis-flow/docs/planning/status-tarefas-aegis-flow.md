# Status de preparação para produção — Aegis Flow

Esta classificação substitui o status histórico do MVP. Testes de aceitação de
stubs não demonstram segurança criptográfica nem prontidão para produção.

| Story | Estado | Evidência e trabalho restante |
|---|---|---|
| US-001 Threat model | Parcial | Documento MVP; faltam revisão externa e parâmetros finais. |
| US-002 PQC | Parcial | ML-DSA/ML-KEM nativos reais, HKDF/AEAD e vetores NIST ACVP implementados; faltam revisão externa, key vault e ciclo de vida de chaves. |
| US-003 Serialização | Parcial | Determinismo local testado; faltam esquema canônico restrito, limites e vetores entre implementações. |
| US-004 Commitments | Parcial | Notes V2 usam commitment SHA-256 binário com domínio e randomness, verificado no guest STARK; não é SIS/LWE e exige revisão criptográfica. |
| US-005 Notes | Parcial | Note V2 com owner derivado do segredo, commitment e nullifier verificados no guest; lifecycle de chaves e auditoria pendentes. |
| US-006 Builder | Parcial | Transfer V2 com assinatura ML-DSA, notes cifradas e witness local para STARK; carteira browser pendente. |
| US-007 Validação | Parcial | POST /submit verifica assinatura e STARK antes de aplicar SQLite; limites e segurança de produção pendentes. |
| US-008 Statement | Parcial | Guest executável verifica ownership, inclusão, ranges, nullifiers e conservação; revisão externa da relação e parâmetros pendente. |
| US-009 Prover | Parcial | RISC Zero 3.1.0 composite STARK real, sem Groth16; geração local e witness privado testados. Parâmetros de release e performance pendentes. |
| US-010 Verifier | Parcial | Receipt STARK nativo, image ID fixado, journal vinculado ao statement e Fake/Groth16 rejeitados; auditoria pendente. |
| US-011 Adversarial | Parcial | Forgery legada, receipt adulterado, journal/binding, ownership incorreto e inflação testados com motor real; fuzzing/auditoria pendentes. |
| US-012 Ledger | Parcial | SQLite WAL persiste commitments, roots, transações públicas, provas e recibos. Settlement permissionado opt-in com certificados ML-DSA, recuperação ancorada e reorganização do sufixo pendente implementados (ADR-0005). Consenso BFT e operação de produção pendentes. |
| US-013 Nullifiers | Parcial | Constraints SQLite, BEGIN IMMEDIATE e concorrência entre processos no mesmo host testados; multi-host não suportado. |
| US-014 Validação atômica tx+estado | Parcial | Assinatura e STARK validados; root/inputs/nullifiers/outputs/recibo aplicados em uma transação SQLite. Produção e consenso ainda pendentes. |
| US-015 Relay | Parcial | Padding e batching locais; faltam transporte cifrado, integração e entrega/retries. |
| US-016 Delays/cover traffic | Não iniciada | Política de agendamento e avaliação pendentes. |
| US-017 Linkabilidade | Não iniciada | Métricas e experimentos pendentes. |
| US-018 gRPC | Parcial | Contratos proto documentados; servidor gRPC e testes de interoperabilidade pendentes. |
| US-019 Autenticação | Não iniciada | mTLS, identidade e autorização entre serviços pendentes. |
| US-020 Observabilidade | Parcial | Hash do payload testado; faltam política completa de metadados, alertas e retenção. |
| US-021 Carga/caos | Parcial | Testes HTTP com assinatura real, STARK + estado, crash SIGKILL, backup e concorrência de processos; carga STARK prolongada e infraestrutura distribuída pendentes. |

Resumo: **0 concluídas para produção, 18 parciais, 3 não iniciadas**.
O histórico de implementação do MVP permanece no Git.

## Preparação implementada nesta etapa

- Gateway recusa inicialização e chamada direta com `NODE_ENV=production` ou
  `AEGIS_MODE` diferente de `demo`.
- Respostas de sucesso e saúde declaram `production_ready: false`.
- HTTP limitado a JSON, 64 KiB por corpo por padrão e timeouts explícitos.
- Schema v1 e primitivas nativas rejeitam chaves/assinaturas fictícias e algoritmos incompatíveis.
- Testes de hardening entram no runner e CI existentes.

Assinaturas PQC, provas composite STARK e persistência local agora são reais.
Isso não substitui auditoria do circuito/parâmetros, consenso, keystore e operação
de produção. A configuração de prova não deve ser anunciada como 128 bits de
segurança pós-quântica. Artefatos: `services/proof-engine/README.md` e
`services/ledger-state/README.md`.

Plano e critérios de liberação: `production-readiness.md`.
