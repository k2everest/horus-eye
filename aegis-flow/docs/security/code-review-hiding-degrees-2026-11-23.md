# Revisão das alterações de chat e dos graus HidingFriPcs

Base: `ac54e73`, após incorporar 78 arquivos alterados desde `b570f47`, aproximadamente 7.280 linhas adicionadas. Escopo: native Plonky3, ponte R1CS/LogUp, modelos ALI/OOD/CMS, campo V5, gates, envelope público e seus workflows; regressões dos caminhos existentes. Revisão interna assistida por testes e fontes upstream, não auditoria independente exaustiva de todo o Horus Eye.

## Achados e correções

| Prioridade | Achado | Correção/evidência |
| --- | --- | --- |
| P1 — análise | Relatório Wired omitia a duplicação ZK dos chunks e do trace | Usa `C=2^(L+1)` e `log2(2N)`; teste nativo compara contra os campos efetivos da prova e preprocessing independente. Isso corrige o relatório, não muda as regras do verificador ou admite a engine na rede. |
| P1 — análise | Cap honesto do quociente não cobre chunks arbitrários com máscaras não correlacionadas | Perfil distingue `<CN` honesto de `<(C+1)N` geral; contraexemplo independente atinge o limite geral. OOD usa o geral sob hipótese explícita de baixo grau. |
| P1 — análise | Grau simbólico usado para dimensionar chunks pode contar transition como zero | Derivação separada com `degree_multiple_with_transition(1)` para caps em X; raw degree preservado para reproduzir o prover real. |
| P2 — modelo | Residual identicamente zero recebia probabilidade de raiz `0/|E|` | Agora lema não nulo é inaplicável (`null`); regressão exaustiva em F17 encontra os 13/13 pontos fora de H. |
| P2 — triagem | Relatório “completo” podia omitir `batch-combination` | Exige exatamente seis famílias de evento, rejeitando omissões, duplicatas e substituições. Liberação continua bloqueada. |
| P2 — referência | Arrays esparsos/herdados passavam como elementos do campo; expoente negativo podia não terminar | Snapshot canônico de 16 coeficientes próprios e exponentes bigint limitados; regressões de entradas adversariais. Não é o campo nativo do PCS. |
| P2 — envelope | Fee sofria coerção de tipos; arrays/getters permitiam aliases ou valores não verificados | Fee primitiva canônica, snapshot validado de entradas próprias, resultado sem alias para dados mutáveis do chamador. Formato continua experimental. |
| P1 — evidência pendente | Workflow verde podia coexistir com falha do job financeiro opcional | No run `45234143155`, laboratório passou, mas o job `plonky3-v4-full-sha512-research` falhou, a prova de um hash foi cancelada e seis hashes ficaram pulados. Não apresentar isso como prova financeira nativa completa aceita. |
| P1 — release pendente | Toolchain `stable` e lock gerado durante CI | Inventário novo confere fontes de graus, mas não resolve sozinho build reproduzível ou atestação fonte/binário; fixar e revisar toolchain/lock no candidato de release. |

Não foi demonstrado um novo bypass de consenso ou autorização financeira. As falhas corrigidas estão na análise, referência e triagem experimental; gates de produção continuam falsos.

## Estado real depois das implementações novas

O diagnóstico antigo “Plonky3 prova somente um balanço estreito” está incompleto: agora existem PCS/MMCS ocultantes, RNG privado por prova, SHA-512 Booleano, engine LogUp de programas públicos completos, binding do statement no programa V2 e reconstrução independente de preprocessing. O adapter smoke e o AIR de quantias continuam provas parciais e não devem ser confundidos com a engine Wired.

A nova implementação demonstra integridade de circuitos pequenos em provas nativas quando o CI passa. O ensaio financeiro completo de seis SHA-512 ainda precisa de aceitação independente e capacidade medida. Campo BabyBear de grau 16 existe como referência/certificado algébrico; não está implementado no PCS nativo. Predicados CMS fornecidos externamente e testes de transcript não demonstram conhecimento RBR.

## Entrega principal

A [derivação de graus](../../experiments/pq128/qrom-research/HIDING_COMMITTED_DEGREES.md) cobre trace, preprocessing, LogUp, random codewords, randomização STARK, máscaras/cosets do quociente, recomposição, OOD e todas as rodadas FRI do perfil atual. O auditor verifica 16 fontes exatos de cinco crates. O teste nativo compara formas da prova real à análise.

Essa evidência é de identidade de fontes, geometria e limites condicionais. Não extrai polinômios de compromissos maliciosos e não certifica PQ128. A próxima obrigação matemática continua ser ligar o evento de baixo grau/binding ao estado de conhecimento e demonstrar terminal covering, extração e composição aplicáveis ao protocolo.
