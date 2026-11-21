# Conhecimento, privacidade e QROM da receipt inteira

**A demonstração solicitada não foi obtida para a implementação atual.** Este
registro documenta a verificação das hipóteses e dos resultados publicados,
incluindo trabalhos de 2025–2026. Não é uma prova de impossibilidade universal
nem uma certificação da receipt Composite RISC Zero 3.1.0.

## O enunciado que precisaria ser demonstrado

O statement confiado inclui programa, suite e todos os campos financeiros. O
witness inclui segredo, notes, valores e inclusão ligados à mesma relação.
O verificador aceita somente Composite, sem assumptions, até 64 segmentos,
com a política já fixada. Conhecimento, privacidade e soundness são propriedades
diferentes; verificar uma execução correta não demonstra todas elas.

**Conhecimento:** para qualquer prover quântico que faça o verificador aceitar
com probabilidade relevante, construir um extrator eficiente que produza um
witness financeiro válido. O teorema deve fixar threshold, probabilidade de
extração, tempo, consultas e acesso ao prover/oracle.

O extrator não recebe somente um arquivo público de receipt. Ele tem o acesso
ao adversário e ao oracle especificado no teorema. Uma receipt pública pode ser
copiada: seu retransmissor não precisa conhecer o witness original.

**Privacidade:** construir um simulador quântico para a distribuição inteira
da prova, com o statement e o leakage expressamente permitido. A definição
precisa cobrir informação auxiliar, programação do oracle, observação adaptativa
e múltiplas provas. A vantagem usada é a diferença absoluta entre probabilidades
de distinguir as duas distribuições, não `sucesso - 1/2`.

**QROM/QRPM:** demonstrar a equivalência do compiler real ao compiler do teorema,
instanciar codecs, campo, hashes/permutação, rounds, compromissos e composição,
e calcular perdas finitas no orçamento escolhido. A análise condicional de
binding SHA-512 não fornece essas hipóteses para o motor inteiro.

## Conhecimento: existe uma rota, mas não sua instanciação no SDK

[CMS19, Definição 8.5 e Teorema 8.6](https://eprint.iacr.org/2019/834) exige um
extrator polinomial e uma função de estado do **IOP inteiro**, com erro de
conhecimento round-by-round. A conclusão de extração depende desse erro, das
consultas e do hash. O resultado assintótico não fornece sozinho as constantes
necessárias a uma certificação quantitativa deste SDK.

[BGKTTZ23](https://eprint.iacr.org/2023/1071), na subseção de conhecimento RBR do
RISC Zero, página 27, deixa a prova formal como tarefa aberta. As conclusões,
página 35, também deixam para trabalho futuro a análise RBR/Fiat–Shamir de
RISC Zero e ethSTARK. Isso impede apresentar esse artigo como uma prova pronta
do protocolo aceito; não implica que nenhuma prova futura possa existir.

Há uma atualização importante: [Chiesa–Di–Hu–Zheng, EUROCRYPT 2026](https://eprint.iacr.org/2025/2166)
obtém extração quântica straightline adaptativa para BCS estendido, sob segurança
post-quantum state-restoration e extração do compromisso vetorial. O resumo
oficial foi conferido. Não foi recuperado o PDF integral revisado; não se
atribuem constantes ocultas ou condições não revisadas ao SDK.

Na receipt Composite, `composite.rs` verifica segmentos e encadeia os estados
por digests SHA-256. `segment.rs` verifica o circuito rv32im e confere a claim.
Um extrator conjunto teria que recuperar traces consistentes de todos os
segmentos sob o mesmo oracle e, deles, a entrada financeira. Somar erros de
soundness de segmentos não constrói esse extrator.

## Privacidade: o simulador completo permanece ausente

A [documentação da versão exata 3.1.0](https://github.com/risc0/risc0/blob/v3.1.0/website/api/security-model.md)
informa que o argumento matemático completo de ZK ainda não foi escrito e
registra observabilidade do comprimento de execução sem recursão. A Aegis usa
Composite; a mitigação por recursão descrita ali não é adotada por essa política.

Também é preciso analisar os campos de estado do seal. Em
`src/guest/env/mod.rs`, o SDK inicializa `MEMORY_IMAGE_ENTROPY` com quatro
palavras de 32 bits para esconder a imagem de memória. A quantidade de entropia
é um fato do fonte, **não** uma demonstração de segurança quântica nem, sozinha,
um ataque demonstrado. Provar que esse mecanismo oculta os campos observáveis
exige definir a distribuição real e o simulador, incluindo todos os segmentos.

O leakage proposto continua limitado ao envelope e ao sucesso autorizado.
Incluir indiscriminadamente hashes de memória privada no leakage enfraqueceria
a promessa e não constituiria uma solução. Não foi demonstrado um distinguisher
financeiro nem uma recuperação real de segredos nesta investigação.

## Compiladores sponge: a literatura recente precisa ser considerada

[Chiesa–Orrù, TCC 2025, revisão de março de 2026](https://eprint.iacr.org/2025/536)
analisa Fiat–Shamir por duplex sponge/permutação ideal. O trabalho explica que
indifferentiability comum é insuficiente para conhecimento e ZK. Isso oferece
uma rota de análise, mas exige mapear os codecs e o protocolo efetivo.

[Huang et al., revisão de março de 2026](https://eprint.iacr.org/2026/146)
obtém ZK adaptativo de NIZKs DSFS no QRPM, inclusive sob informação auxiliar
e preprocessing. O resumo e slides dos autores foram consultados; o PDF
integral não foi recuperado. Não foi encontrada nessa evidência uma certificação
do Poseidon2Rng ou da receipt RISC Zero inteira.

Portanto, não se afirma que faltam teoremas genéricos para sponges ou para
extração adaptativa. Falta demonstrar suas hipóteses no código exato, com as
constantes e orçamentos necessários. Termos `O(...)` não foram substituídos
por constantes escolhidas.

## O IOP oficial não fecha essa passagem

O [draft oficial de integridade RISC-V](https://dev.risczero.com/proof-system-in-detail.pdf)
analisa o IOP e já inclui extensão quatro, folding 16, 50 consultas e grau final
256. Sua passagem a Fiat–Shamir é descrita com HMAC-SHA-256; isso não é uma
instanciação quantitativa do sponge Poseidon2 atualmente usado.

Os regimes provados e conjecturais de proximidade também são distintos. O
termo de queries não se transforma em 128 bits quânticos por uma conversão
aritmética dos diagnósticos clássicos. Nem esse documento nem os teoremas
genéricos examinados permitem substituir os limites completos por números
certificados no perfil atual.

## Registro executável e resultado

`experiments/pq128/quantitative/literature.json` registra o material efetivamente
consultado e distingue artigos completos, resumos e slides. O inventário de
fontes acrescenta os arquivos de composição, segmento e inicialização de memória.
O relatório executável mantém os limites de conhecimento, privacidade e
soundness completos como `null`; metadados bibliográficos não aprovam um motor.

```sh
node aegis-flow/experiments/pq128/quantitative/demo.mjs --source-root work/cargo/registry/src/index.crates.io-1949cf8c6b5b557f --require-sources
node aegis-flow/experiments/pq128/quantitative/demo.mjs --require-aegis
```

O segundo comando continua terminando com 1. A conclusão desta investigação é
**ausência de uma demonstração válida entregue para o conjunto atual**, e não
que uma flag, um parecer ou mais testes funcionais possam completá-la.
