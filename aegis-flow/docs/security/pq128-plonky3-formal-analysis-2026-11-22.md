# Aegis V4 Plonky3 — demonstração pós-quântica: lemas demonstrados e obrigações

**Data:** 2026-11-22 · **Suite:** `AEGIS_V4_P3_HIDING_EXT8_LAB_V1`
· **Status:** demonstração da composição PQ128 **ABERTA**, liberação bloqueada.
Este documento é um argumento matemático **condicional**, não um certificado de
128 bits nem a avaliação de uma auditoria independente.

## M0. Jogos que não podem ser confundidos

**G1, trabalho de ataque PQ128:** `Q=2^128` consultas quânticas **globais**,
meta `Pr[forgery] <= 1/2` no horizonte nominal `H=2^32` receipts, cada
uma com no máximo `S=64` segmentos. Esse é o jogo anteriormente
formalizado em `docs/planning/pq128-scope-2026-11-21.md`. Um contador de
consenso NÃO limita todas as tentativas offline do atacante: o horizonte
deve ser explicitamente assumido ou coberto pela redução.

**G2, erro residual forte:** mesmo `Q,H,S`, mas
`Pr[forgery] <= 2^-128`. G2 é MUITO mais exigente que G1.
Uma probabilidade `2^-128` por tentativa sem `Q` não responde a
nenhum dos jogos.

A linguagem financeira `L_FIN` é definida por um statement público
autenticado `x` (rede, versão, asset, taxa, root, commitments,
nullifier, binding) e um **mesmo** witness `w` para nota de entrada,
segredo do proprietário, nota de saída, hashes e saldo. Para uma
transação 1x1:

```
L_FIN(x,w) = [
  value_in > 0,
  value_out > 0,
  value_in = value_out + public_fee,
  commitment(in_note) = public_input_commitment,
  owner_derived(spend_secret) = in_note.owner,
  nullifier(in_note,spend_secret) = public_nullifier,
  MerkleRoot(commitment(in_note),path) = public_anchor,
  commitment(out_note) = public_output_commitment,
  all SHA-512 operations are correctly constrained,
  all public bytes and network/suite domain separations match x
]
```

O circuito de referência Booleano possui seis instâncias SHA-512.
A prova LogUp completa de seis hashes ainda não passou pelo teste
nativo de ponta a ponta, e `L_FIN` **não** está em consenso.

## Lema L1 — ligação algébrica de fios, protocolo interativo

**Hipóteses exatas.** O programa `C_x` é fixado pelo verificador
antes das mensagens do provador; todos os opcodes, fios, multiplicidades,
pinos 0/1 e instâncias são os do programa canônico; a tabela de fios e
os valores de gates são comprometidos **antes** de sortear dois
desafios uniformes e independentes `alpha,beta` em
`E = GF(2013265921^8)`. Supomos uma relação realmente inválida,
com multiconjunto de leituras diferente do multiconjunto da tabela,
e multiplicidades integrais `< 2013265921` que não cancelam módulo
o campo. Também supomos verificação do terminal LogUp e de todas
as identidades racionais. Uma suposição NÃO demonstrada sobre
o Fiat–Shamir SHA-512 não é usada aqui.

Se `G` é o número de gates, `W` os fios e `T = 3G+W`,
então dois pares distintos de fios `(wire_id,bit)` podem colidir
no mapa `wire_id * beta + bit` somente para no máximo um
`beta` por par com identificadores distintos. Há no máximo
`T(T-1)/2` colisões candidatas.

Sem colisão no `beta`, a diferença entre os dois multiconjuntos
definirá uma função racional NÃO NULA:

```
R(alpha) = sum_{u} d_u / (alpha - encode_beta(u)).
```

Multiplicando pelos denominadores distintos, o numerador vira um
polinômio não nulo de grau `<= T-1`. No máximo `T-1`
valores de `alpha` o anulam, e menos de `T` são polos.
Pela união dos eventos e por Schwartz–Zippel:

```
Pr[falha ligação | programa/trace fixos, alpha,beta uniformes]
    <= (T*(T-1)/2 + 2*T) / (2013265921^8).
```

Este é um limite **sobre um único evento algébrico interativo**,
não sobre a prova inteira de LogUp/FRI, e não é uma redução de
knowledge-soundness nem privacidade. Ver
`experiments/pq128/v4/logup-algebraic-bound.mjs` para
aritmética exata `BigInt`.

Com `G=8_000_000`, `W=8_388_608`, `T=32_388_608` e
`log2 |E| = 247.2551247706...`:

```
Pr[evento interativo individual] < 2^-198.35.
Pr[uniao de H*S eventos interativos, se uniformemente aplicável]
    < 2^-160.35.
```

A segunda linha é estritamente hipotética: é a união de eventos
discretos sob as mesmas hipóteses, **não** a probabilidade do
adversário com Q consultas quânticas. Ela não contempla tentativa
adaptativa, múltiplos transcripts Fiat–Shamir, compromisso malicioso,
ou a extração de oráculos.

## Lema L2 — colisão ideal do vínculo externo, QROM

Sob a hipótese de oráculo binário ideal de `n` bits, orçamento global
`Q=2^128`, e uma **redução independente ainda não demonstrada**
de uma falsificação de receipt composta para no máximo
`K = H*(2*S+4)` candidatos de colisão externos, o modelo
existente da Aegis fornece

```
Pr[outer_collision] <= min(1, K*[12*(Q+2)^3 + 4] / 2^n).
```

Para `n=512`, `H=2^32`, `S=64`, isso é aproximadamente
`2^-85.4`, suficiente para **G1 apenas neste subevento ideal**.
Para G2 nessa MESMA modelagem seria preciso `n>=555`.
Isso **não** prova que SHA-512 concreto seja um oráculo aleatório;
nem que todos os eventos de falsificação correspondam a colisões
externas. Ver `experiments/pq128/v4/outer-screen.mjs`.

## Lema L3 — dimensionamento da entropia do sal, busca quântica ideal

O laboratório anterior usava `SALT_ELEMS=8` BabyBear:
`log2(2013265921^8) = 247.2551...` bits de entropia
sob a hipótese de 8 elementos independentes e uniformes.
No modelo de busca não estruturada, uma única incógnita
de 247 bits requer ~`2^123.6` consultas com Grover para
probabilidade constante. Isso **não demonstra um ataque à
prova**, mas é insuficiente como dimensionamento conservador
para um segredo salgado arbitrário com meta de 128 bits quânticos.

Por isso o laboratório V4 foi atualizado para
**`SALT_ELEMS=16`**, fornecendo
`log2(2013265921^16) = 494.5102...` bits
de espaço uniforme hipotético. Para um alvo aleatório e
`K=4*H*S=2^40` eventos, a cota suficiente para busca
não estruturada é, conservadoramente,

```
Pr[encontrar sal em K eventos] <=
  min(1, K*(2Q+1)^2 / 2013265921^16).
```

Com `Q=2^128`, esse **submodelo** resulta em aproximadamente
`2^-196.51`, abaixo das metas G1 e G2. O cálculo exato
`BigInt` e os testes negativos de downgrade estão em
`experiments/pq128/v4/salt-quantum-screen.mjs`.

**Não é uma demonstração de privacidade do HidingFriPcs.**
Uma saída de prova não deve ser classificada como
estatisticamente zero conhecimento com base apenas em
sal suficiente. Faltam a ligação entre esse jogo e o
MMCS real, a segurança de hash concreto e a composição
adaptativa do transcript. A extensão de desafio
BabyBear⁸ continua com ~247.26 bits; aumentar o sal
não aumenta esse campo nem certifica Fiat–Shamir/QROM.

## Composição que falta (não substituir por um mínimo de estimativas)

Uma demonstração de soundness para uma receipt financeira exigiria
uma redução explícita do primeiro evento ruim, por exemplo:

```
Adv_false_receipt_QROM(Q,H,S) <=
    eps_bad_relation
  + eps_program_and_state_binding
  + eps_logup_adaptive_QROM
  + eps_AIR_DEEP_FRI_adaptive_QROM
  + eps_inner_Merkle_and_commitment_QROM
  + eps_BCS_FiatShamir_QROM
  + eps_adaptive_composition.
```

Cada `eps` precisa ser derivado para a versão concreta e para um
**mesmo** jogo, sem duplicar orçamento global. Alguns eventos poderão
ser contabilizados conjuntamente por uma redução melhor; a equação
acima é um mapa conservador de obrigações, NÃO uma desigualdade
demonstrada para o código atual. Nenhum `eps` desconhecido pode ser
substituído por zero ou pela segurança de SHA-512.

**IOP não é QROM.** O `p3-security 0.8.0` fornece análise
`round-by-round` do AIR/FRI interativo. O relatório V4 atualmente
calculado é para `BalanceAir`, NÃO para o
`WiredAir` que inclui seis SHA-512 e LogUp. O relatório de
`p3-security` ainda assume um budget `170` para colisões
do hash ideal como parâmetro EXTERNO. A passagem para um
adversário quântico adaptativo requer um teorema BCS/QROM cujas
condições (round-by-round/state restoration, commit-and-open,
ordem do transcript, custo finito em Q) sejam instanciadas para o
`HidingFriPcs` e `p3-batch-stark` realmente executados.

Há fundamentos acadêmicos: Chiesa–Ma–Spooner 2019,
*Succinct Arguments in the Quantum Random Oracle Model*
(https://eprint.iacr.org/2019/834), e Chiesa et al., EUROCRYPT
2026, *How to Prove Post-quantum Security for Succinct
Non-interactive Reductions*
(https://infoscience.epfl.ch/entities/publication/029a1aad-a83a-4e7a-bbf7-03819bb7dd4b).
Nenhum deles é uma garantia automática de 128 bits para os parâmetros
da Aegis: faltam aplicabilidade e constantes explícitas.
O próprio Ethereum `soundcalc`
(https://github.com/ethereum/soundcalc) avisa que seu valor de
soundness interativo não inclui a compilação QROM.

**Separar os três jogos.** Mesmo um bound positivo de soundness
não fornece um extrator quântico de conhecimento do segredo e do
witness comum; tampouco um simulador/teorema de zero conhecimento da
prova completa, incluindo as mensagens de LogUp, FRI e publicações
explícitas de commitments. Todos requerem argumentos próprios.

## Teste real e status

- [CI LogUp smoke aprovado](https://github.com/k2everest/horus-eye/actions/runs/45084406393):
  11/11 testes Rust, 6/6 integrações Node, com prova real de
  consistência dos fios e rejeições adversariais.
- [CI integral 6 SHA-512](https://github.com/k2everest/horus-eye/actions/runs/45084603237):
  compilação aprovada, mas o job
  `plonky3-v4-full-sha512-research` terminou **cancelado** pelo
  runner durante o teste integral. Não foi gerado um resultado
  verificável de transação financeira completa.
- O `p3-security` exibido no laboratório **não calcula
  a segurança finita do LogUp/FRI financeiro completo**.
- Estado `PQ128_REVIEW=NOT_DEMONSTRATED`; nenhum ajuste de números
  deve transformar esse estado em `true`.

## Próximo marco eliminatório, em ordem

1. Prova e verificação nativas **de seis SHA-512** sob limites de
   RAM/CPU, testes de adulteração por fio com witness comum; pin de
   hashes de programa e de binário.
2. Extrair os parâmetros reais de `WiredAir`/LogUp/hiding-FRI,
   não reutilizar o relatório de `BalanceAir`.
3. Provar o lema completo de interação LogUp + AIR + DEEP/FRI,
   com limites não assintóticos e composição de rounds, contra
   compromissos/aberturas arbitrários.
4. Instanciar teorema BCS/Fiat–Shamir no QROM para
   `SerializingChallenger32`, `HashChallenger<SHA512>`,
   `HidingFriPcs` e o MMCS salteado; provar a transcrição exata.
5. Demostrar soundness, conhecimento, privacidade e composição
   adaptativa em jogos distintos, com todos os limites calculados
   menores que as metas de G1 e, se requerido, G2.
6. Auditoria independente, releases reproduzíveis, e só então
   considerar ativação em consenso.

**Conclusão:** o circuito tem um lema algébrico condicional,
um limite ideal externo QROM condicional e um LogUp smoke comprovado.
Isso NÃO é a demonstração pós-quântica PQ128 do protocolo completo.
