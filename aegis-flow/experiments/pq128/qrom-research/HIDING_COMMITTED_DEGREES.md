# Graus comprometidos por HidingFriPcs

Revisão de 23/11/2026. Perfil examinado: um único `WiredAir`, Plonky3 0.8.0, commit upstream `a21e3ed42905040ad49c519e402f018381c12d0c`, BabyBear de grau oito, blowup oito, folding binário e polinômio final constante. Não se aplica automaticamente a batches de alturas diferentes, outros seletores/domínios ou extensão de grau 16.

Esta derivação estabelece limites determinísticos da construção e a correspondência de sua geometria com a prova nativa. Usar esses limites para oráculos de um prover malicioso exige condicionar o argumento ao evento de baixo grau/binding do PCS/FRI. Não é uma prova de extração desses oráculos, conhecimento RBR, ZK ou QROM.

## Convenções e fontes

`N` é a altura original do trace; `deg(f)<B` é um limite **estrito**. O limite inclusivo correspondente é `B-1`. `d` é o grau simbólico empregado pelo prover no dimensionamento do quociente. `w` é um grau conservador separado que atribui peso um a todos os seletores, inclusive `IsTransition`.

O [inventário](hiding-degree-sources.json) fixa SHA-256 de 15 arquivos de `p3-air`, `p3-fri`, `p3-batch-stark` e `p3-uni-stark`. [O auditor](hiding-degree-sources.mjs) verifica os arquivos efetivos resolvidos pelo Cargo ou um checkout local, sem aceitar um boolean como substituto. Identidade de fonte não é atestação fonte/binário.

As referências abaixo são caminhos nesse commit upstream:

| Etapa | Fonte | Fato usado |
| --- | --- | --- |
| Domínio estendido | `batch-stark/src/prover.rs`, `common.rs` | `log_ext_degree=log2(N)+is_zk`; domínio de altura `2N` quando `is_zk=1` |
| Trace e random codewords | `fri/src/hiding_pcs.rs::commit` | Intercala linhas aleatórias e acrescenta colunas aleatórias; altura passa de `N` para `2N` |
| Preprocessing público | `fri/src/hiding_pcs.rs::commit_preprocessing` | Padding por zeros até `2N`, sem assumir que seu polinômio preserva grau `<N` |
| Chunk count | `batch-stark/src/symbolic.rs`, `prover.rs` | `L=ceil_log2(max(d+1,2)-1)`; quantidade efetiva `C=2^(L+1)` |
| Máscaras do quociente | `fri/src/hiding_pcs.rs::get_quotient_ldes` | Chunk de altura `N` acrescido de `Z_i r_i`, com correlação entre as máscaras |
| Recomposição | `batch-stark/src/verifier/mod.rs` | Soma dos chunks com pesos de Lagrange entre cosets |
| Grau dos seletores | `air/src/symbolic/expression.rs`, `expression_ext.rs` | Grau bruto pode contar `IsTransition` como zero; o limite em X usa `degree_multiple_with_transition(1)` |
| Redução de abertura e FRI | `fri/src/two_adic_pcs.rs`, `prover.rs`, `verifier.rs`, `config.rs` | Quocientes de abertura, commits antes de cada fold, schedule inferido das alturas e verificação do polinômio final |

## Trace, preprocessing, LogUp e randomização

Interpolar uma coluna com `2N` avaliações produz um polinômio único de grau `<2N`. Isso cobre as colunas main, permutation/LogUp, preprocessing com padding e os random codewords. O protocolo STARK também compromete o polinômio de randomização em um domínio de `2N` pontos diretamente no PCS interno; não há uma segunda duplicação para `4N` nessa etapa.

As restrições de máscara/entropia e uso único continuam necessárias para privacidade; não são demonstradas pela contagem de graus. Sais Merkle não aumentam o grau do polinômio.

Para o `WiredAir` atual não há colunas periódicas. Cada variável de trace/permutation/preprocessing tem grau no máximo `2N-1`. Seletores first/last têm grau no máximo `N-1`, e transition tem grau um. Portanto atribuir peso um a cada seletor e variável fornece:

```text
deg(C_alpha) <= w * (2N-1).
```

O máximo `w` é obtido das expressões simbólicas base **e** extensão com `degree_multiple_with_transition(1)`. Não substituímos `w` pelo `d` usado para sizing: o tratamento especial de `IsTransition` tornaria essa substituição injustificada.

## Chunks e cancelamento das máscaras

O domínio do quociente tem `CN` pontos e é dividido em `C` cosets disjuntos `H_i`, cada um com `N` pontos. Se `s_i` é seu shift:

```text
Z_i(X) = X^N - s_i^N
L_i(X) = c_i * produto_{j != i} Z_j(X)
c_i = 1 / produto_{j != i} Z_j(s_i)
q'_i(X) = q_i(X) + Z_i(X) r_i(X)
```

Não usar `X^N-1` para todo chunk: os shifts importam. Os chunks de base e as máscaras têm grau `<N`; assim cada chunk comprometido tem grau `<2N` e sua LDE tem `16N` linhas.

O verificador recompõe `Qhat = soma_i L_i q'_i`. Como `deg(L_i)=(C-1)N`, para chunks gerais de grau `<2N`:

```text
deg(Qhat) < (C+1)N.
```

Na construção honesta, `HidingFriPcs` escolhe a última máscara para satisfazer `soma_i c_i r_i=0`. Consequentemente:

```text
soma_i L_i Z_i r_i = (produto_j Z_j) * soma_i c_i r_i = 0.
```

Isso recupera o quociente honesto original, de grau `<CN`. Entretanto, um conjunto arbitrário de chunks de baixo grau não precisa satisfazer a correlação. Os testes constroem um contraexemplo: alteram somente a máscara de um chunk, preservam grau `<2N` em todos, e obtêm grau exatamente `(C+1)N-1` na recomposição. A análise OOD usa o limite geral, nunca o honesto sem uma prova adicional.

## Identidade OOD

Se os oráculos já estão fixos e sujeitos aos limites acima, com domínio original H de tamanho N e vanishing polynomial `Z_H`, o residual é:

```text
P(X) = C_alpha(X) - Z_H(X) Qhat(X)
deg(P) <= max(w*(2N-1), (C+2)N-1).
```

Isso fornece o parâmetro do lema de raízes **quando P não é zero**. Se `P≡0`, o lema de raízes de polinômio não nulo é inaplicável; todos os desafios são raízes. O módulo corrigido retorna `null` para esse limite, em vez de `0/|E|`. O evento `zeta em H` é contabilizado separadamente no modelo condicional.

O [perfil executável](hiding-degree-profile.mjs) deriva os caps inclusivos para `conditionalAliOodBudget`. Este último conserva `degree_caps_independently_proved:false`: uma derivação sob hipótese de baixo grau não demonstra que o extrator consegue obtê-la de compromissos adversariais.

## Todas as rodadas FRI

Todas as famílias deste único AIR têm o mesmo limite `B=2N` e LDE de tamanho `8B=16N`. Para aberturas honestas, cada termo `(f(X)-f(z))/(X-z)` tem grau `<B-1`; a combinação linear não aumenta esse limite. O verificador FRI usa o limite anunciado `<B`, que é mais conservador.

Na rodada j, começando em zero:

```text
vetor pré-fold:       16N / 2^j avaliações
folhas comprometidas: (8N / 2^j) linhas de largura dois
bound anunciado:      grau < 2N / 2^j
depois do fold:       grau < ceil(bound / 2)
```

O commit ocorre **antes** do desafio de fold. Reinterpretar o vetor como folhas de largura dois não divide previamente o grau do polinômio. Depois de `log2(2N)` folds, restam oito avaliações e um coeficiente constante. Não há um compromisso FRI extra no terminal.

Para N=4096 são **13 rodadas**, começando com 65.536 avaliações e bound estrito 8.192. O perfil enumera cada rodada; omissão, reordenação ou alteração é rejeitada. Batches de tamanhos distintos exigem também analisar injeções de vetores menores após folds e não são aprovados por este perfil.

## Evidência executável e limite da conclusão

O teste Rust positivo de `WiredAir` compara o relatório com a prova **real**: degree bits, preprocessing reconstruído, quantidade/largura dos chunks, compromissos/aberturas em cada rodada FRI e comprimento do polinômio final. Isso evita conferir apenas duas cópias da mesma fórmula. Os testes JS independentes verificam identidades de máscaras/cosets e folding em campo pequeno, inclusive o contraexemplo ao cap honesto.

CI também compara o relatório nativo ao [perfil derivado](hiding-degree-profile.mjs) e confere os 15 fontes efetivamente compilados a partir de `cargo metadata --locked --offline`. Os artefatos contêm somente formas públicas, hashes de fontes e contas; não contêm coeficientes privados, masks, salts ou witness.

```sh
node --test aegis-flow/experiments/pq128/qrom-research/hiding-degree-*.test.mjs
cargo test --locked --release --manifest-path aegis-flow/experiments/pq128/v4/plonky3/Cargo.toml
cargo metadata --locked --offline --format-version 1 --manifest-path aegis-flow/experiments/pq128/v4/plonky3/Cargo.toml > /tmp/p3-metadata.json
node aegis-flow/experiments/pq128/qrom-research/hiding-degree-demo.mjs --native-report aegis-v4-wired-rbr.json --cargo-metadata /tmp/p3-metadata.json
```

Isso fecha erros concretos de correspondência de geometria e fornece caps condicionais explícitos. Não fecha baixo grau/extrabilidade de um prover arbitrário, terminal covering completo, conhecimento RBR, redução Fiat–Shamir/QROM ou ZK da aplicação. `pq128_demonstrated` e `production_ready` permanecem falsos.
