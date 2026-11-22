# Pesquisa de uma construção PQ128

Este diretório entrega bindings criptográficos executáveis e um cálculo exato
de um limite **condicional para FRI isolado**, além de um prover/verificador
FRI de referência executável em [fri/](fri/README.md). Não entrega um novo
STARK financeiro, verificador de transações ou migração. Não é importado pela
admissão de blocos; o perfil de produção continua bloqueado.

A [relação financeira experimental](financial/README.md) acrescenta notes,
inclusão, R1CS de valores e mascaramento privado. O [compilador de constraints](constraints/README.md)
vincula hashes e valores aos mesmos bits. Os checkers ainda recebem o witness;
isso não é um novo verificador de provas privadas ou demonstração PQ128.

O [ensaio nativo isolado](native/README.md) testa a relação SHA-512 inteira em
um guest separado, usando o motor RISC Zero de laboratório já conhecido. O
verificador recebe receipt e statement públicos; os parâmetros do motor são
inalterados e continuam sem qualificação PQ128. Esse programa não é aceito na rede.

A [recuperação de oráculos completos](constraints/ORACLE_RECOVERY.md) reconstrói
um witness financeiro comum dos segmentos privados do circuito experimental.
O [laboratório liboqs](oqs/README.md) testa ML-DSA-87 e ML-KEM-1024 entre C e Node.
São componentes separados; nenhum fornece extração quântica de uma receipt.

A [análise quantitativa de 21/11/2026](../../docs/security/pq128-quantitative-2026-11-21.md)
acrescenta um cenário global explícito, requisitos CMS/QROM com aritmética exata,
uma derivação finita de claw no modelo ideal e o viés iid do sampler. Limites
ausentes de soundness, conhecimento e privacidade ficam `null`. Essa análise
não certifica o motor e não executa um ataque contra SHA-256.

O [escopo de qualificação](../../docs/planning/pq128-scope-2026-11-21.md)
avalia os caminhos aceitos e candidatos e define entregáveis para a nova versão.
A [busca combinatória](quantitative/parameter-search.mjs) compara 180 combinações
abstratas com aritmética exata. Resultados favoráveis continuam condicionais:
não geram proofs, métodos criptográficos inéditos ou aprovação PQ128.

## Componentes executáveis

`bindings.mjs` usa SHA-512 completo para commitments genéricos, folhas/nós Merkle,
transcripts e tags de signatário. O framing binário inclui versão, suite,
domínio, quantidade de partes e seus comprimentos. Assinaturas Pure ML-DSA-87
cobrem suite, domínio, resumo de 64 bytes e identidade do signatário. A chave
esperada é fornecida independentemente ao verificador. Algoritmos menores,
formatos antigos e adulterações são rejeitados. Não há fallback.

`challenge-sampling.mjs` decodifica blocos uniformes de 512 bits em cinco
coordenadas no campo base, com rejeição da cauda antes de aplicar módulo.
Cada tupla aceita tem exatamente a mesma quantidade de pré-imagens. A função
retorna `null` na rejeição; o protocolo futuro precisa definir novas amostras,
limites, abortos e chamadas de oráculo. Ela não implementa o transcript nem
a aritmética de extensão.

Isso remove o digest externo de 32 bytes deste experimento, não da rede atual.
ML-DSA-87 é um parâmetro padronizado; sua categoria NIST não é declarada como
uma demonstração de 128 bits literais para o sistema completo. As funções de
binding não portam um novo KEM, envelope de notes ou tratamento de senhas; os
circuitos e o guest experimental são componentes separados descritos acima.

## Limite finito de FRI no QROM

O teorema 6 de Block et al. fornece erro round-by-round para o teste específico
de proximidade FRI, quando a função inicial é delta-distante do código
Reed–Solomon. Especializando os parâmetros admissíveis `rho=1/4, m=3,
eta=1/16, delta=1/4`:

```text
epsilon_rbr = max(7^7 * |L|^2 / (48 * |F|), (3/4)^queries)
```

A prova de soundness em CMS19, seção 8.5.1, e lema 4.9 dão, para o compilador
BCS/transcript específico e um oráculo quântico ideal com saída de lambda bits:

```text
x = 6 * (t^2 * epsilon_rbr + 4 * t^3 / 2^lambda)
P <= (sqrt(x) + sqrt(a / 2^lambda))^2
  <= 12 * t^2 * epsilon_rbr + 48 * t^3 / 2^lambda + 2 * a / 2^lambda
t = Q_adversary + N_expansion
```

`N_expansion` e `a` são limites separados que precisam ser justificados pela
implementação: chamadas reais e pares presentes na expansão, respectivamente.
O cálculo permite números diferentes sem supor memoização nem medir execução.

O código usa a segunda desigualdade, mais conservadora, com frações BigInt
exatas. Não converte bits clássicos em quânticos por uma divisão arbitrária e
não substitui termos assintóticos `O(...)` por constantes escolhidas. Aplica
depois uma união conservadora das instâncias e limita a probabilidade a 1.

### Exemplo condicional reproduzido

| Parâmetro | Hipótese do cálculo |
| --- | --- |
| Campo | Cardinalidade `(2^64 - 2^32 + 1)^5` |
| Domínio de avaliação FRI | `|L|=2^16`; grau do código `d0=2^14` pela taxa 1/4 |
| Consultas FRI | 720 |
| Oráculo ideal | Saída de 512 bits |
| Consultas do adversário | `2^128` |
| Chamadas adicionais de expansão | No máximo 1.000.000, assumidas e não medidas |
| Pares de expansão | No máximo 1.000.000, assumidos e não medidos |
| União | 64 instâncias, usando conservadoramente o orçamento inteiro em cada uma |
| Limiar de sucesso testado | 1/2 |

O limite calculado é aproximadamente **0,00306793675**, abaixo de 1/2. Assim,
essa desigualdade condicional para FRI ultrapassa o critério de sucesso
constante no orçamento de `2^128` consultas. Isso **não** significa probabilidade
menor que `2^-128` depois dessas consultas; essa é uma exigência diferente.
Domínio FRI não é tamanho de trace financeiro: não se atribui essa capacidade
ao circuito atual, e mascaramento também ocupa o orçamento de graus.

SHA-256, apenas 50 consultas, domínio `2^24` ou exigir erro `2^-128` no mesmo
orçamento fazem o exemplo falhar. Os testes cobrem essas regressões.

## Obrigações que impedem aplicar o resultado à Aegis

O cálculo não implementa nem demonstra equivalência entre o FRI do artigo e
RISC Zero ou Plonky3. O candidato de engenharia está em
[backend-feasibility.md](backend-feasibility.md). Para obter a construção final:

1. Implementar/qualificar campo, protocolo FRI e compilador/transcript cobertos
   pela análise; o hash chain CMS19 é específico. Outro chain pode exigir
   strong round-by-round soundness e outra derivação. Demonstrar irreducibilidade,
   domínio e amostragem uniforme; uma redução modular simples do hash pode
   introduzir viés que invalida o orçamento quântico pretendido.
2. Demonstrar como todo statement financeiro inválido induz o evento de
   proximidade analisado, incluindo erros de AIR/lookup/ranges e bindings.
3. Cobrir conhecimento/ownership, statements adaptativos e privacidade no QROM.
   Ocultação de um PCS não comprova ZK do protocolo completo.
4. Integrar SHA-512 e qualificar sua instanciação do oráculo ideal; os bindings
   locais não são a implementação do transcript BCS. Fixar/enforçar parâmetros,
   contabilizar chamadas de verificação e rever as composições.
5. Portar notes, nullifiers e circuito, gerar provas financeiras nativas,
   testar entradas adversariais e obter revisão independente do argumento.

## Reprodução

Node.js >=24.8 com ML-DSA nativo:

```sh
node --test aegis-flow/experiments/pq128/*.test.mjs
node --test aegis-flow/experiments/pq128/fri/*.test.mjs
node --test aegis-flow/experiments/pq128/financial/*.test.mjs
node --test aegis-flow/experiments/pq128/constraints/*.test.mjs
node aegis-flow/experiments/pq128/screen.mjs
node aegis-flow/experiments/pq128/screen.mjs --require-aegis
```

O último comando termina com 1. `conditional_inequality_holds` pode ser verdadeiro
enquanto `aegis_target_met` e `production_ready` permanecem falsos. O relatório
não constitui evidência de validação da prova financeira ou release autorizado.

## Fontes primárias examinadas

- Block et al., ASIACRYPT 2023, [Fiat-Shamir Security of FRI and Related SNARKs](https://par.nsf.gov/servlets/purl/10510337), teorema 6.
  SHA-256 do PDF consultado: `301d3bc0325838c3361d7bf133cb8e6fe09d0196263f4697f0cc04c3a4839ad2`.
- Chiesa, Manohar e Spooner, [Succinct Arguments in the Quantum Random Oracle Model](https://eprint.iacr.org/2019/834), versão de 14/01/2020, seção 8.5.1, lema 4.9 e proposição 8.11.
  SHA-256 do PDF consultado: `c3258e2faa339bdc441403d73aba9fee7d03687121c3369ef007ccce71cd2b41`.
