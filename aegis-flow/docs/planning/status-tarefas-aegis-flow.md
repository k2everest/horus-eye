# Status de preparação para produção — Aegis Flow

Esta classificação substitui o status histórico do MVP. Testes de aceitação de
stubs não demonstram segurança criptográfica nem prontidão para produção.

| Story | Estado | Evidência e trabalho restante |
|---|---|---|
| US-001 Threat model | Parcial | Documento MVP; faltam revisão externa e parâmetros finais. |
| US-002 PQC | Parcial | ML-DSA/ML-KEM nativos reais, HKDF/AEAD e vetores NIST ACVP implementados; faltam revisão externa, key vault e ciclo de vida de chaves. |
| US-003 Serialização | Parcial | Determinismo local testado; faltam esquema canônico restrito, limites e vetores entre implementações. |
| US-004 Commitments | Parcial | Hash de JSON; não implementa SIS/LWE nem comprova hiding/binding. |
| US-005 Notes | Parcial | Modelo MVP; derivação e formatos dependem da especificação criptográfica. |
| US-006 Builder | Parcial | Builder com assinatura real e note cifrada; commitments/provas e privacidade completa pendentes. |
| US-007 Validação | Parcial | HTTP verifica assinatura real e schema v1; provas e estado ainda não integrados. |
| US-008 Statement | Parcial | Cláusulas documentadas; circuito e soundness não implementados. |
| US-009 Prover | Parcial | JSON/base64 com flags; não constitui prova ZK. |
| US-010 Verifier | Parcial | Verifica flags e digest; não verifica uma prova criptográfica. |
| US-011 Adversarial | Parcial | Casos contra formato MVP; faltam vetores de forgery, fuzzing e revisão criptográfica. |
| US-012 Ledger | Parcial | Estado em memória; faltam persistência, restauração e integração ao settlement. |
| US-013 Nullifiers | Parcial | Atomicidade em um processo; faltam banco transacional e concorrência distribuída. |
| US-014 Validação atômica tx+estado | Não iniciada | Conforme CSV: proof && sig && root && nullifier na mesma operação de estado. Os testes de carga pertencem à US-021. |
| US-015 Relay | Parcial | Padding e batching locais; faltam transporte cifrado, integração e entrega/retries. |
| US-016 Delays/cover traffic | Não iniciada | Política de agendamento e avaliação pendentes. |
| US-017 Linkabilidade | Não iniciada | Métricas e experimentos pendentes. |
| US-018 gRPC | Parcial | Contratos proto documentados; servidor gRPC e testes de interoperabilidade pendentes. |
| US-019 Autenticação | Não iniciada | mTLS, identidade e autorização entre serviços pendentes. |
| US-020 Observabilidade | Parcial | Hash do payload testado; faltam política completa de metadados, alertas e retenção. |
| US-021 Carga/caos | Parcial | Testes HTTP locais; faltam criptografia real, persistência, múltiplas réplicas e falhas de infraestrutura. |

Resumo: **0 concluídas para produção, 17 parciais, 4 não iniciadas**.
O histórico de implementação do MVP permanece no Git.

## Preparação implementada nesta etapa

- Gateway recusa inicialização e chamada direta com `NODE_ENV=production` ou
  `AEGIS_MODE` diferente de `demo`.
- Respostas de sucesso e saúde declaram `production_ready: false`.
- HTTP limitado a JSON, 64 KiB por corpo por padrão e timeouts explícitos.
- Schema v1 e primitivas nativas rejeitam chaves/assinaturas fictícias e algoritmos incompatíveis.
- Testes de hardening entram no runner e CI existentes.

Essas proteções não substituem assinatura, prova ou persistência reais e não
protegem consumidores que importem diretamente os stubs de `libs/crypto-core`.

Plano e critérios de liberação: `production-readiness.md`.
