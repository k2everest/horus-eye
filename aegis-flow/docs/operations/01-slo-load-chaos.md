# Carga local e limites da homologação histórica

O teste histórico US-021 em `validation-gateway/load-chaos.test.mjs` envia 200
requisições `/validate` com assinaturas e testa um HTTP 503 injetado. O orçamento
de conexões/quotas do teste é ampliado explicitamente. Ele não gera STARKs, não
mede TPS de novas transferências e não demonstra disponibilidade mensal de 99,9%.
Seu alvo de recuperação em 2 s diz respeito somente à falha de handler local.

Não representa morte de host, disco cheio, partição, perda de WAL, restauração
externa, uso por terceiros ou testnet pública prolongada. Disponibilidade nominal,
limites de abuso e carga de stress precisam ser medidos separadamente.

A campanha vigente e seus critérios estão em [public-testnet.md](public-testnet.md).
As ferramentas distinguem replay com STARK real, novas provas/finalizações,
observação prolongada e relatos de terceiros. O teste integrado novo inclui
SIGKILL real de um processo de gateway isolado e restauração de backup cifrado;
continua local e não é aceitação pública.

SQLite permanece single-host: não aplicar a recomendação histórica de múltiplas
réplicas graváveis em hosts independentes/Cloud Run. Infraestrutura e recuperação:
[infrastructure-recovery.md](infrastructure-recovery.md). Monitoramento, quotas e
resposta a incidentes: [security.md](security.md).
