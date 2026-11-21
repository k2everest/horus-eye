# Qualificação do motor RISC Zero — 20/11/2026

**Decisão: RISC Zero 3.1.0 não está qualificado para a meta PQ128 da Aegis.**
A correspondência entre perfil e fontes pode ser verificada mecanicamente; isso
não aprova a segurança criptográfica do motor nem sua entrada em produção.

A [análise quantitativa de 21/11/2026](pq128-quantitative-2026-11-21.md)
registra o cenário explícito de recursos, o jogo de binding de valores,
os requisitos da redução QROM e as lacunas de conhecimento/privacidade. Suas
derivações condicionais não alteram a decisão desta qualificação.

## Escopo efetivamente avaliado

Esta avaliação abrange o verificador composite fixado no repositório: nenhuma
assumption, entre 1 e 64 segmentos, Poseidon2, e `po2` até 24. O prover local
usa 18, mas uma avaliação de segurança precisa cobrir tudo o que o verificador
aceita. Fake, Groth16 e uma etiqueta de hash diferente não são alternativas
permitidas por esse verificador.

O guest financeiro SHA-512 experimental usa o mesmo motor. Ele liga segredo,
proprietário, note, valor, compromisso, nullifier, inclusão e conservação na
relação provada. Seus hashes financeiros SHA-512 não substituem o Poseidon2,
o campo, o transcrito, o image ID ou o journal internos do SDK.

A [integração nativa no commit 69e43ec](https://github.com/k2everest/horus-eye/actions/runs/44833389099/job/136623689193)
produziu e verificou uma receipt real de 283.256 bytes. O ensaio levou 854.631 ms
para provar a fixture e rejeitou alterações públicas e witnesses inválidos.
Esse resultado é evidência funcional da relação, não uma medida de segurança
quântica. A guest experimental permanece separada do programa aceito pela rede.

## O que a checagem passou a demonstrar

`risc0-parameters.mjs` confronta constantes extraídas dos fontes com o perfil
declarado. Confere versões no Cargo.lock, configurações do verificador local,
FRI, campo/extensão, Poseidon2, limites e dimensões do TapSet. O inventário de
hashes continua sendo uma conferência separada: números extraídos de fontes
alterados não passam a ser os parâmetros aprovados.

Havia uma falha no diagnóstico anterior: alterar `fri_queries` do perfil
exportado em memória podia mudar os números apresentados sem uma divergência
no inventário dos fontes. O perfil agora é imutável, e a comparação dos
parâmetros detecta uma declaração que não corresponde ao SDK. Fontes ausentes,
expressões não reconhecidas e constantes ambíguas não são aprovados.

O modo `--require-source-profile` exige tanto o inventário quanto a comparação
dos parâmetros. **Sucesso desse modo significa correspondência dos fontes;
não significa PQ128.** O JSON contém uma decisão separada
`quantum_qualification.decision = not-qualified-for-pq128` e os requisitos
criptográficos sem demonstração. `--require-production` continua falhando.

## Reprodução dos cálculos upstream

Os parâmetros observados são 50 consultas FRI, expansão 4, folding 16, grau
final 256, Baby Bear de extensão 4 e Poseidon2 com largura 24. O TapSet tem
103/1/211 colunas nos três grupos, totalizando 315 polinômios. Seu maior combo
tem 6 entradas; o maior atraso de uma entrada, 68, não é o tamanho do combo.

Além do toy model, `risc0-soundness.mjs` reproduz a rotina denominada `proven`
de `risc0-zkp 3.0.6/src/prove/soundness.rs`, com list-decoding, `M=16`, grau 5
hardcoded e os termos lookup, proximidade, folding, queries, DEEP e ALI.

| `po2` | Toy: −log₂ da soma de erros por segmento | Rotina `proven`: −log₂ da soma por segmento | `proven`: união ilustrativa de 64 |
| --- | ---: | ---: | ---: |
| 18 | 98,6424 | 45,3014 | 39,3014 |
| 24 | 93,3417 | 33,5865 | 27,5865 |

**São diagnósticos clássicos, não bits pós-quânticos, custos de ataque ou
limites superiores da segurança real.** O nome upstream `proven` não transforma
essa reprodução em demonstração completa para a receipt compilada. A checagem
usa binary64, enquanto o upstream usa float32; não usa intervalos com
arredondamento dirigido. A união ilustrativa depende da aplicabilidade dos
limites por segmento. Hashes, Fiat–Shamir/QROM, conhecimento, leakage e
composição ao longo da vida da rede continuam fora desses cálculos.

Os dois modelos têm hipóteses diferentes. Uma cota clássica demonstrada mais
fraca não constitui um ataque que refute a estimativa conjectural. Aumentar
somente o número de consultas deixa os termos algébricos e de proximidade
presentes; não resolve a qualificação completa.

## Requisitos ainda sem demonstração

| Requisito da meta PQ128 | Evidência que falta |
| --- | --- |
| Orçamento do adversário | Cenário aprovado de trabalho, memória, consultas quânticas, vantagem e horizonte de uso |
| Soundness e conhecimento | Argumento concreto aplicável ao campo, lookups, circuito e parâmetros efetivos |
| Fiat–Shamir | Redução QROM instanciada para o transcrito, amostradores e primitivas exatos |
| Binding | Análise quântica das propriedades necessárias de Poseidon2, SHA-256 de programa/journal e compromissos financeiros |
| Privacidade | Argumento ZK e modelo de leakage, incluindo metadados de execução dos composites |
| Composição e implementação | Até 64 segmentos, tentativas/transações, artefatos reconstruídos e revisão independente do conjunto |

A [documentação oficial da linha 3.0](https://dev.risczero.com/api/3.0/security-model)
classifica seus STARKs como resistentes a ataques quânticos conhecidos e cita
uma meta conjectural de 96 bits. Ela também registra limitações do argumento
de ZK e dos metadados de execução. Essa documentação não é uma certificação
PQ128 da versão/build usados aqui. A propriedade genérica de usar STARKs não
resolve uma meta quantitativa de segurança.

Para continuar com RISC Zero, é necessário obter um argumento aplicável aos
parâmetros efetivos ou desenvolver um fork do motor com parâmetros e circuito
gerado compatíveis com esse argumento. Campo, hash e FRI são decisões conjuntas
do prover e do verificador. Novos parâmetros precisam de nova construção,
medição, identidade de perfil e revisão; não há opção de cliente que forneça
essa qualificação. Não foi implementado um fork criptográfico sem tal argumento.

## Reprodução

Com os crates já instalados pelo setup:

```sh
node --test aegis-flow/services/proof-engine/security-review.test.mjs aegis-flow/services/proof-engine/risc0-parameters.test.mjs aegis-flow/services/proof-engine/risc0-soundness.test.mjs
node aegis-flow/scripts/review-stark-security.mjs --source-root work/cargo/registry/src/index.crates.io-1949cf8c6b5b557f --require-source-profile
node aegis-flow/scripts/review-stark-security.mjs --source-root work/cargo/registry/src/index.crates.io-1949cf8c6b5b557f --require-production
```

O último comando deve terminar com código 1 enquanto o requisito PQ128 estiver
aberto. Os jobs nativos de CI registram o relatório dos fontes junto da evidência
de execução. Nenhum deles permite substituir um argumento criptográfico por uma
flag ou por testes aprovados. Inventário também não é atestação independente de
correspondência fonte/binário.

Fontes primárias da reprodução: [rotinas de soundness](https://docs.rs/crate/risc0-zkp/3.0.6/source/src/prove/soundness.rs),
[constantes FRI](https://docs.rs/crate/risc0-zkp/3.0.6/source/src/lib.rs),
[TapSet rv32im](https://docs.rs/crate/risc0-circuit-rv32im/4.1.0/source/src/zirgen/taps.rs).
Os hashes dos fontes estão no perfil versionado.
