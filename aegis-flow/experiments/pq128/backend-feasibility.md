# Candidato de backend: Plonky3 com FRI ocultante e hashes ampliados

Pesquisa interna em 19/11/2026. **Não há perfil PQ128 aprovado, prova financeira
nativa nova ou demonstração end-to-end nesta investigação.** O protótipo de
binding deste diretório é um componente de hash/serialização. Ele não executa
FRI, não verifica um AIR e não substitui o backend RISC Zero aceito pela rede.

## Construção candidata a ensaio

- `p3-uni-stark` com `p3-fri::HidingFriPcs`, sem recursão inicialmente.
- Campo base Goldilocks, `p = 2^64 - 2^32 + 1`, e extensão binomial de grau 5
  fornecida pelo upstream. O espaço de desafios tem aproximadamente 320 bits;
  isso não significa 320 bits de soundness ou 160 bits pós-quânticos.
- Hash de compromissos e transcript baseado em SHA-512 com saída completa de
  64 bytes, codificação canônica e separação de domínios. O módulo Keccak padrão
  consultado fornece saídas de 32 bytes; não se pode ampliar o digest apenas no
  manifesto. São necessárias implementações consistentes de hasher, challenger,
  compressão e MMCS, com parâmetros aceitos vinculados pelo verificador.
- MMCS ocultante tanto nos compromissos de entrada quanto nos compromissos FRI.
  As máscaras precisam de RNG criptográfico com seeding imprevisível, e de
  novas moedas para cada prova. O grau de extensão também afeta o mascaramento.

SHA-512 amplia o orçamento de saída comparado a digests de 256 bits. Sob modelos
genéricos ideais, busca de colisões tem expoente n/3 e pré-imagem n/2, com recursos
distintos. Isso não constitui uma redução de segurança do STARK, nem uma
certificação do SHA-512 concreto ou do transcript.

## Regras de ocultação verificadas no código upstream

`HidingFriPcs` exige os dois MMCS com a capacidade `HidingMmcs`. O orçamento
conservador é `N >= 2 * (queries + extension_degree * opening_points)`, usando
pelo menos um ponto, e o número de codewords aleatórias deve ser pelo menos o
grau da extensão. O código limita reutilização do estado privado, inclusive
entre clones. Esses controles não substituem randomização do STARK, amostragem
fora do domínio ou a demonstração de zero knowledge do protocolo completo.

Consequência: aumentar consultas sem aumentar o orçamento de máscaras/trace
pode invalidar a ocultação. O campo maior, sozinho, também não resolve isso.

## Fontes de código examinadas

Os links de leitura usam `main`, que é mutável. Os IDs abaixo identificam os
blobs Git observados, não são SHAs de commit nem fixam uma compilação completa.

| Fonte | Git blob SHA-1 observado | Evidência |
| --- | --- | --- |
| [goldilocks/src/extension.rs](https://github.com/Plonky3/Plonky3/blob/main/goldilocks/src/extension.rs) | `7289e4a8bc35d416bf1b21caabde48dc7670b1b7` | Implementação e testes de extensão binomial grau 5 |
| [fri/src/hiding_pcs.rs](https://github.com/Plonky3/Plonky3/blob/main/fri/src/hiding_pcs.rs) | `02e026739bddc448168fcf58e81140f8bf2d8e72` | Orçamento de máscaras, MMCS ocultantes e uso único do estado privado |
| [merkle-tree/src/hiding_mmcs.rs](https://github.com/Plonky3/Plonky3/blob/main/merkle-tree/src/hiding_mmcs.rs) | `beb10c24b3258d9b7018606783ae3e5cd60cbad4` | Componente candidato a revisar; código não integrado |
| [uni-stark/src/security.rs](https://github.com/Plonky3/Plonky3/blob/main/uni-stark/src/security.rs) | `d94c9eb3d9540c4bc269cd11c777db012f402b98` | Superfície de análise do protocolo; nenhuma aprovação QROM inferida |
| [keccak/src/lib.rs](https://github.com/Plonky3/Plonky3/blob/main/keccak/src/lib.rs) | `96583e3d783515b4c77f15fa2815abddb97f2dbc` | Hashes padrão consultados de saída 32 bytes; não reutilizar como SHA-512 |

A [arquitetura upstream](https://github.com/Plonky3/Plonky3/blob/main/docs/architecture.md)
distingue ocultação do PCS de zero knowledge da composição. A análise
`p3-security` não aprova automaticamente uma aplicação financeira ou o QROM.

## Trabalho ainda necessário

1. Fixar uma revisão upstream, dependências, recursos de compilação e orçamento
   de adversário. Selecionar um teorema QROM aplicável ao transcript exato e
   derivar todos os termos, incluindo binding/colapsabilidade quando exigidos.
2. Derivar consultas, taxa, tamanho de campo e limites de trace/aberturas a
   partir dessa análise. Goldilocks5 é candidato de engenharia, não um mínimo
   comprovado nem compromisso de que o alvo seja alcançável com esse campo.
3. Portar o AIR financeiro inteiro: ownership, ranges, saldo, commitments,
   membership, nullifiers, taxas, vinculação de rede e transação. Um exemplo
   aritmético simples não prova validade de transferências.
4. Integrar hash/challenger/MMCS ampliados e mascaramento correto no prover e
   no verificador; analisar ZK no QROM e composição de provas/transações.
5. Gerar e verificar provas financeiras nativas; testar adulterações, witness
   inválido, parâmetros menores e troca de programa/rede; medir CPU, memória,
   bytes e replay. Submeter argumento e implementação à revisão independente.

Os perfis de RISC Zero, Miden e Winterfell examinados não fornecem uma troca
imediata que demonstre essa meta completa. Claims genéricos de “STARK
pós-quântico” ou benchmarks de “128 bits” não são usados como certificado.
O candidato acima permanece isolado da admissão de blocos e de produção.
