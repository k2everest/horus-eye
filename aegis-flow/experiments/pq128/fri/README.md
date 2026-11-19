# Prover e verificador FRI de referência

Implementação executável em JavaScript/BigInt de prova de baixo grau de
**polinômios públicos**, usando campo Goldilocks de extensão grau cinco e
Merkle SHA-512. Não é um STARK financeiro nem zero knowledge. Não inserir
spend secrets, notes privadas ou witnesses financeiros nesta API.

## Código entregue

| Arquivo | Componente |
| --- | --- |
| `field.mjs` | Campo `F_p[X]/(X^5-3)`, operações, inversão, codec canônico de 40 bytes, raízes e FFT/interpolação |
| `merkle.mjs` | Árvores SHA-512 vinculadas à posição/tamanho, caminhos individuais e multiprovas compactas |
| `transcript.mjs` | Compromissos, desafios uniformes por rejeição e consultas com reposição vinculados ao contexto |
| `protocol.mjs` | Geração e verificação de dobramentos binários, autenticação entre camadas e condição final constante |
| `demo.mjs` | Ensaio reproduzível de polinômio público, com hashes de fontes, tempos e bytes |

O critério de irreducibilidade do binômio é verificado: 5 divide `p-1` e 3 não
é quinta potência. Os testes conferem a primalidade de p no intervalo de 64 bits,
operações contra multiplicação de referência e FFT contra avaliação direta.
Isso implementa a álgebra que o dimensionamento anterior apenas supunha.

O domínio tem tamanho `N=2^domainLog2`, até 65.536 pontos; o grau alegado é
estritamente menor que `N/4`. A cada camada, o prover compromete avaliações,
recebe alpha e dobra os pares de pontos x e -x:

```text
even = (f(x) + f(-x)) / 2
odd  = (f(x) - f(-x)) / (2*x)
next(x^2) = even + alpha*odd
```

São `domainLog2-2` dobramentos, terminando em uma constante sobre quatro
pontos. Todas as raízes, inclusive a última, precedem a seleção de consultas.
O verificador autentica as multiprovas e confere cada valor dobrado contra a
abertura correspondente na camada seguinte. As consultas usam reposição;
compartilhar caminhos repetidos não altera os índices derivados.

A raiz inicial, contexto da aplicação e política de domínio/consultas são
fornecidos independentemente pelo chamador. Um proof não escolhe seus próprios
parâmetros de aceitação. O objeto de proof rejeita campos adicionais; não há
flag de aprovação de produção que o remetente possa ativar.

## Ensaios

```sh
node --test aegis-flow/experiments/pq128/fri/*.test.mjs
node aegis-flow/experiments/pq128/fri/demo.mjs \
  --domain-log2 16 --queries 720 --report /tmp/fri-reference-NEW.json
```

O arquivo de relatório deve ser novo; não são gravados witness ou proof. O
relatório contém apenas dados públicos e metadados de execução. Uma execução
local em Node 24.22.1 levou aproximadamente 3,6 s para gerar e 0,6 s para serializar
e verificar; proof JSON de 4.503.514 bytes e RSS amostrado de 359.555.072 bytes.
São medições de referência de uma máquina, não TPS financeiro, memória de pico
garantida ou dimensionamento de produção. O script permite reproduzir com
commit/dirty flag e hashes dos fontes efetivamente usados.

Os testes incluem alterações de raízes, folhas, nós, parâmetros, contexto,
schemas, domínio e valor final. Um teste cria compromissos/aberturas Merkle
autênticos de `f(X)=X^(N/4)`, fora do grau permitido, e tenta alegar uma
constante final falsa. O verificador rejeita pela relação algébrica; não se
limita a testar hashes adulterados.

## O que continua faltando

O [cálculo condicional QROM](../README.md) e esta implementação são artefatos
distintos. O framing/hash chain, folhas, representação de campo, rejeição de
desafios e multiprovas precisam de uma análise que estabeleça a correspondência
com os teoremas usados. **O resultado numérico anterior não certifica este
prover/verificador automaticamente.** Não há claim CMS equivalente ou PQ128
completo no resultado do benchmark.

Para transformar baixo grau em prova financeira privada ainda faltam:

1. AIR financeiro: relacionar ownership, membership, commitments/nullifiers,
   ranges, conservação, taxas e bindings à aceitação, com todos os termos de erro.
2. Ocultação/masking do trace e dos compromissos; revisão de conhecimento,
   extração, statements adaptativos e ZK do protocolo completo no QROM.
3. Compatibilidade da construção analisada com o transcript e encodings reais,
   custos de oráculo medidos/enforçados e composição das instâncias.
4. Novo formato de notes/provas, identidade de programa/rede, integração ao
   consenso, carteira e restauração, com política de migração explícita.
5. Provas financeiras nativas e revisão independente do argumento e código.

O código de admissão da rede atual permanece separado. Nenhuma prova deste
diretório autoriza movimentação de saldo. Mais testes desta camada não
substituem os componentes acima nem demonstram a meta da Aegis inteira.
