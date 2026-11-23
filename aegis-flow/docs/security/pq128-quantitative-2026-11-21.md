# Análise quantitativa da prova Aegis — 21/11/2026

**Resultado: a prova completa continua sem demonstração PQ128.** Esta etapa
entrega uma derivação finita para um jogo de binding no modelo ideal, requisitos
exatos de uma redução QROM condicional e um cálculo separado de viés estatístico.
Não produz colisão de SHA-256, transação inflacionária, simulador ZK ou extrator
quântico. A produção permanece bloqueada.

O código de pesquisa está em [quantitative/](../../experiments/pq128/quantitative/).
O relatório mantém limites ausentes como `null`; um termo sem demonstração não
é substituído por zero. As [checagens anteriores do motor](risc0-qualification-2026-11-20.md)
continuam separadas da segurança quantitativa.

A [verificação da receipt inteira](whole-receipt-2026-11-21.md) incorpora os
teoremas mais recentes de extração adaptativa e de compiladores sponge/QRPM,
distinguindo seus resultados genéricos da instanciação ainda ausente no SDK.

## Cenário explícito, sem mudança de política de rede

O cenário de engenharia considera **um orçamento global de $Q=2^{128}$
consultas de hash**, incluindo consultas em superposição, até $H=2^{32}$
receipts e no máximo 64 segmentos por receipt. Assim, $S=64H=2^{38}$.
O orçamento inteiro é conservadoramente usado em cada termo da união; não é
um orçamento novo por receipt.

A memória da tabela tem uma hipótese explícita de até $2^{128}$ entradas.
O custo de acesso coerente à tabela, portas elementares, profundidade,
correção de erros e tempo físico **não** estão limitados pelo cálculo. Este
é um cenário de consultas oraculares, não um certificado de custo de ataque
em portas ou uma categoria NIST. Não altera genesis, limites ou regras dos nós.

Para soundness, o teste condicional é sucesso total no máximo $1/2$ nesse
orçamento. Isso difere de exigir probabilidade residual $2^{-128}$ depois de
$2^{128}$ consultas. Conhecimento exige um argumento de extração próprio.
Privacidade usa a vantagem

$$
|\Pr[D(\mathrm{real})=1]-\Pr[D(\mathrm{simulado})=1]|,
$$

cujo intervalo é de zero a um. A convenção `sucesso - 1/2` não é usada para
o limiar de privacidade, pois seu máximo já seria $1/2$.

## Obstáculo no binding de valores do formato legado

O guest aceito calcula um compromisso SHA-256 a partir de asset, valor de oito
bytes, owner e randomness de 32 bytes. Fixe um spend secret conhecido, seu owner
e dois valores permitidos $v_0<v_1$. As famílias de entradas

$$
F_0(r)=C(v_0,\mathrm{owner},r),\quad
F_1(s)=C(v_1,\mathrm{owner},s)
$$

são disjuntas. **Se** for encontrado um claw $F_0(r)=F_1(s)=c$, há duas
aberturas de valores diferentes para a mesma note. Uma transferência legítima
pode criar $c$ usando a abertura menor; depois a abertura maior satisfaz a
relação de input. A raiz/path permanece vinculada ao mesmo $c$ e o nullifier
usa o mesmo compromisso e segredo. A conservação local pode então ser provada
com o valor maior. Essa implicação condicional não exige uma forgery do STARK;
o binding do compromisso é uma hipótese necessária da segurança monetária.

Isso é um jogo com compromisso escolhido pelo atacante antes da inclusão.
Não equivale a segunda pré-imagem de um compromisso de terceiro já fixado.

### Derivação finita no modelo ideal

Modele as duas famílias como funções aleatórias independentes de domínio e
contradomínio de tamanho $N=2^n$. Construa uma tabela com $k=2^c$ inputs
distintos de $F_0$. A chance de a tabela não ter colisões é pelo menos

$$
1-\frac{k(k-1)}{2N}.
$$

Condicionada a uma tabela com $k$ saídas distintas, o número $M$ de
pré-imagens em $F_1$ tem distribuição binomial de média $k$ e variância no
máximo $k$. Chebyshev dá probabilidade pelo menos $1-4/k$ para
$M\in[k/2,3k/2]$.

Escolha $j=2^{(n-c)/2-1}$ iterações de Grover, com $n-c$ par,
$k/N\le1/256$ e $k>4$. Para

$$
\theta=\arcsin\sqrt{M/N},\quad
1/\sqrt2\le(2j+1)\theta\le\sqrt{867/509}<3/2<\pi/2.
$$

Pela corda do seno nesse intervalo, a chance de sucesso é maior que $1/5$.
Quatro reinícios independentes, condicionados à mesma função e ao evento bom,
dão pelo menos $1-(4/5)^4=369/625$. O limite inferior finito é

$$
P_{\mathrm{claw}}\ge
\frac{369\,[2N-k(k-1)]\,(k-4)}{625\cdot2Nk},
$$

quando o fator de tabela é positivo; caso contrário o limite usado é zero.
O custo conservador contado é (k+4(2j+2)) consultas, incluindo compute,
uncompute e verificação dos candidatos. A tabela contém $k$ entradas.

| Construção ideal analisada | Tabela | Consultas da construção finita | Limite inferior de sucesso |
| --- | --- | --- | --- |
| Saída 256 bits, $c=86$ | $2^{86}$ entradas | $3\cdot2^{86}+8<2^{128}$ | Maior que $1/2$, próximo de 0,5904 |
| Saída 512 bits, $c=172$ | $2^{172}$ entradas | $2^{173}+8>2^{128}$ | Maior que $1/2$, próximo de 0,5904 |

**Não é um ataque executado contra SHA-256 ou uma medição de hardware.** A
derivação é interna, no ensemble ideal e com trabalho de lookup não cobrado.
Não foi demonstrado um custo de portas para o algoritmo. O caso 512 apenas
mostra que essa construção específica não cabe no orçamento; não demonstra
resistência contra outros ataques. O guest SHA-512 experimental já trata essa
largura financeira separadamente, mas não foi adotado pela rede e não troca
os hashes internos do RISC Zero.

### Limite superior condicional para o binding SHA-512 experimental

Há também um resultado positivo separado da falha desse algoritmo de ataque:
o jogo de colisões do oracle binário ideal tem instabilidade menor que $t/N$.
Os lemas 5.13 e 4.9 de CMS19, aplicados a esse jogo e com a relaxação
quadrática, dão o limite conservador

$$
P_{\mathrm{col}}\le\min(1,[12(Q+2)^3+4]/2^\lambda).
$$

As duas consultas adicionais verificam as mensagens das duas aberturas. Duas
notes canônicas de valores diferentes têm encodings diferentes; compromissos
iguais implicam uma colisão. A codificação com comprimentos explícitos e valor
de oito bytes do formato experimental atende a essa condição.

Para até $K=4H=2^{34}$ pares de aberturas candidatos, a união conserva um
limite menor que $2^{-90}$ com saída ideal de 512 bits e $Q=2^{128}$.
A contagem de pares de abertura é separada da contagem de segmentos. Cada
seletor de um índice de saída é um adversário do orçamento global; essa união
não supõe independência e não transfere um teorema FRI de statement fixo.

Isso demonstra apenas a desigualdade de binding nesse jogo e modelo ideal.
Não demonstra que SHA-512 concreto é um oracle ideal nem fornece o extrator
necessário para obter aberturas de um prover financeiro arbitrário. O limite
continua separado de conhecimento, privacidade e segurança da receipt.

## Orçamento da redução QROM condicional

O limite finito usado na seção 8.5.1 de CMS19, com o lema 4.9 e a relaxação
quadrática conservadora, é

$$
P\le12t^2\varepsilon+48t^3/2^\lambda+2a/2^\lambda.
$$

Assumimos, sem medição, até $10^6$ consultas de expansão e $10^6$ pares
expandidos por instância. Para o horizonte todo, usamos
$t=Q+S\cdot10^6$ e $a=S\cdot10^6$. Reservando $1/6$ para cada um dos
três termos globais da união, obtemos exatamente

$$
\varepsilon\le\frac1{72St^2},\quad
2^\lambda\ge288St^3,\quad2^\lambda\ge12Sa.
$$

Neste cenário, **301 bits são suficientes para o expoente do erro RBR** dessa
alocação, e a saída binária uniforme exige **ao menos 431 bits para a mesma
alocação**. Não são números universais mínimos de um protocolo PQ128 nem
quantidades de segurança do SDK. O código calcula com frações/inteiros exatos.
Um exemplo hipotético com erro $2^{-301}$ e hash ideal de 512 bits satisfaz a
fórmula; o exemplo não fornece a evidência RBR ausente.

Aplicar a união exige limites condicionais à história anterior e aos statements
adaptativos. Um teorema de statement fixo não justifica essa composição sozinho.
O exemplo FRI isolado que passava para 64 instâncias não passa nesse horizonte
ampliado, sob a mesma união condicional. Isso não é uma análise do AIR financeiro.

## Por que esse bound não certifica o RISC Zero

- O erro global das rotinas `toy`/`proven` não é automaticamente um erro
  round-by-round. Lookup, constraints, DEEP e ALI precisam do argumento correto.
- O FRI do teorema consultado usa folding binário e final constante. O SDK usa
  folding 16, um escalar para as potências e final de grau até 256.
- O sponge stateful do SDK não foi demonstrado equivalente à cadeia/compilador
  de CMS19. A variante de cadeia também determina as hipóteses RBR necessárias.
- O suporte de oito elementos de Poseidon2 tem no máximo $p^8$ saídas,
  cerca de 247,255 bits de cardinalidade; não é um oracle binário uniforme de
  256 bits. Ampliar um buffer de saída não aprova capacidade/rounds do sponge.
- O journal, claims e image ID continuam usando contextos SHA-256. A colisão
  entre mensagens escolhidas e a integridade de um image ID confiado são
  propriedades distintas, que não recebem automaticamente o mesmo limite.

O apêndice B de CMS19 possui uma conversão de soundness global de um IOP de
$k$ rounds para strong RBR com uma raiz $\mu^{1/(k+1)}$. Usá-la exigiria
primeiro estabelecer o protocolo, número de rounds e bound global aplicáveis;
ela não autoriza colocar diretamente o erro clássico no lugar de $\varepsilon$.

## Viés do sampler e jogos ainda sem limite completo

Sob quatro células **iid uniformes** de $F_p$, `random_bits(b)` retorna os
bits baixos da primeira célula não zero, ou zero após quatro zeros. Como
$p-1=15\cdot2^{27}$, para $b\le27$ a distância de variação total exata é

$$
\operatorname{TV}=(1-2^{-b})/p^4.
$$

A união iid para 50 consultas é no máximo $50/p^4$. Isso não demonstra
independência do sponge concreto, soundness, ou resistência a grinding no QROM.
Os testes verificam a fórmula enumerando distribuições pequenas, sem inferir
uma garantia quântica a partir dela.

Conhecimento exige extrator quântico com threshold, runtime, acesso ao oracle e
probabilidade de extração definidos. `valid:true` não constrói esse extrator.
Privacidade exige simulador, informação auxiliar adaptativa e composição. O
[modelo upstream da versão 3.1.0](https://github.com/risc0/risc0/blob/v3.1.0/website/api/security-model.md)
registra limites do argumento ZK e observabilidade de execução sem recursão.
Os composites públicos locais permitem observar quantidade de segmentos,
`po2` e tamanho dos seals. Duas amostras públicas tinham um segmento, `po2=18`
e 63.927 palavras no primeiro seal, em `work/stark-smoke-public.json` e
`work/open-pow-v2-public.json`; isso não demonstra um distinguisher entre
dois witnesses do mesmo statement.

A proposta de leakage inclui apenas envelope de execução e sucesso autorizado,
nunca witness, valores privados ou o próprio receipt. Sua completude e a
existência do simulador continuam sem prova. Timing, I/O, abortos e o prover que
conhece o witness também precisam de escopo explícito. Por isso os três limites
completos — soundness, conhecimento e privacidade — permanecem `null`.

## Reprodução e fontes

```sh
node --test aegis-flow/experiments/pq128/quantitative/*.test.mjs
node aegis-flow/experiments/pq128/quantitative/demo.mjs
node aegis-flow/experiments/pq128/quantitative/demo.mjs --source-root work/cargo/registry/src/index.crates.io-1949cf8c6b5b557f --require-sources
node aegis-flow/experiments/pq128/quantitative/demo.mjs --require-aegis
```

O último comando termina com 1. O inventário adicional fixa 14 arquivos locais
e upstream usados nesta análise; não é atestação de binário ou auditoria externa.
Nenhum desses experimentos é importado pela admissão de blocos.

Fontes primárias: [CMS19](https://eprint.iacr.org/2019/834),
[BGKTTZ23](https://eprint.iacr.org/2023/1071),
[BHT, colisões e claws](https://arxiv.org/abs/quant-ph/9705002),
[Zhandry, funções aleatórias](https://arxiv.org/abs/1312.1027),
[Zalka, Grover](https://arxiv.org/abs/quant-ph/9711070).
Os PDFs CMS/BGKTTZ conferem com os hashes já registrados na pesquisa anterior.
