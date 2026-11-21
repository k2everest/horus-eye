# Recuperação privada de um witness comum

`recoverBitWitnessFromOracles` implementa recuperação determinística quando o chamador já possui **acesso privado completo** aos oráculos A/B/C de todos os segmentos do circuito Booleano/R1CS experimental. `recoverTransferWitnessFromOracles` reconstrói segredo, notes, valores, posições e caminhos desse vetor e confere a relação financeira SHA-512 no host. Nenhuma dessas funções recebe ou verifica uma receipt RISC Zero.

## Hipótese de acesso e argumento

O circuito é compilado independentemente a partir do statement público autenticado e recuperado de um registro interno confiado. O fornecedor dos oráculos não escolhe outro circuito, digest ou layout. O formato, quantidade de segmentos, linhas e wires têm limites explícitos. Cada segmento é lido exatamente uma vez, na ordem canônica, sem reler uma fonte que poderia gerar novas máscaras.

Há dois formatos privados completos:

1. Coeficientes canônicos dos polinômios mascarados A/B/C. No domínio H de tamanho n, `X^n=1`. Para `A=T_A+(X^n-1)R_A`, a redução por `X^n-1` recupera as avaliações de T_A, somando **todos** os coeficientes por classe de expoente módulo n. Isso inclui máscaras com mais de n coeficientes. Uma FFT completa avalia o resultado em H. O mesmo vale para B e C. As coordenadas de extensão devem resultar no campo base.
2. As n avaliações canônicas de cada A/B/C diretamente em H. Este formato já concede a tabela privada inteira; não prova abertura de um commitment polinomial.

As primeiras linhas fixam as constantes e, em seguida, contêm `w_i*(w_i-1)=0` com A igual a `w_i`. Cada wire é recuperado uma vez como 0 ou 1. Todas essas linhas precedem as linhas de gates. Cada linha A/B/C, em **todos** os segmentos, é comparada às formas lineares da matriz pública avaliadas nesse mesmo vetor; também é exigido `A*B=C`. Padding deve ser zero. Assim, se a rotina retorna, o vetor retornado satisfaz todas as linhas do circuito confiado. Segmentos localmente válidos que usam atribuições globais incompatíveis são rejeitados.

O decoder usa offsets reais dos inputs guardados pelo compilador: gates podem aparecer entre blocos de inputs, portanto offsets cumulativos seriam incorretos. Ele recompõe os bytes dos valores u64, owner, randomness, segredo e caminhos. Rede, ativo, commitments e contagem vêm do statement confiado. A checagem financeira independente confirma ownership, commitments, nullifiers, inclusão, ranges e conservação com taxa desse mesmo witness.

Essa é uma propriedade determinística de recuperação e refinamento **condicionada ao acesso a todos os dados privados**. Não é uma redução de um prover que convence um verificador para esses oráculos. Em particular, uma receipt pública não concede esse acesso.

## Limites explícitos

- Não verifica a vinculação dos oráculos à raiz com salt do vetor de wires, às queries de uma prova, a compromissos de receipt ou a um transcript Fiat–Shamir. O digest local dos oráculos identifica os dados consumidos, sem demonstrar essa vinculação nem ocultação.
- Não confere uma identidade de quociente QAP ou constrói todos os polinômios financeiros no ensaio de avaliações. Os testes pequenos separados cobrem o caminho de coeficientes mascarados.
- Não fornece extrator quântico, rewinding, simulador ZK, teorema de conhecimento RISC Zero ou composição adaptativa no QROM. Não demonstra PQ128.
- A função é uma operação privada local; entregar seus oráculos ao verificador revelaria o witness. Não deve virar endpoint, prova pública ou autorização de saldo.
- Resultados recusam JSON e redigem inspeção comum; acesso explícito a `.values`/`.witness` revela segredos. `dispose()` limpa apenas o vetor de bytes que possui ou solta referências. Strings, BigInts, cópias do chamador e o heap não têm garantia de apagamento seguro.

Os indicadores `receipt_extractor`, `knowledge_soundness_demonstrated`, `witness_commitment_binding_checked`, `aegis_target_met` e `production_ready` permanecem falsos. No resultado genérico, `qap_identity_checked` também é falso.

## Reprodução

```sh
node --test aegis-flow/experiments/pq128/constraints/oracle-extractor.test.mjs
AEGIS_ORACLE_FINANCIAL_RECOVERY=1 node --test aegis-flow/experiments/pq128/constraints/oracle-financial.integration.test.mjs
node aegis-flow/experiments/pq128/constraints/oracle-recovery-demo.mjs --max-segments 8192 --report /tmp/oracle-recovery-NEW.json
```

O ensaio financeiro usa somente uma fixture sintética, copia o assignment para uma fonte privada de linhas e recupera o witness sem fornecer o objeto original à rotina. Processa todos os segmentos de uma entrada e uma saída, sem armazenar a tabela inteira. O relatório enumera somente contagens e resultados públicos; não publica witness, oráculos ou seu digest privado. CI repete o ensaio completo com orçamento explícito. Isso testa a implementação da recuperação sob sua hipótese de acesso, sem fechar os limites acima.
