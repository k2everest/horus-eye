# Hashes e relação financeira como restrições

Implementação experimental de um circuito Booleano/R1CS completo para os
bindings financeiros SHA-512 do formato de notes experimental V2. O circuito
compilado depende somente do statement público, não dos valores ou posições
privadas. **Ainda não é uma prova privada verificável:** o checker local recebe
todos os wires privados e não deve ser usado como endpoint ou autorização de saldo.

## O que foi implementado

- `bit-circuit.mjs`: gates AND/XOR/NOT/igualdade e booleanidade de todos os
  wires; armazenamento compacto, limites e circuito compilado confiado/imutável.
- `sha512.mjs`: SHA-512 inteiro, padding de comprimento de 128 bits e 80 rodadas,
  com rotações por wiring e somas com carry. Não chama hash nativo como gadget.
- `note-hashes.mjs`: framing simbólico idêntico ao framing nativo, incluindo
  suite, domínios, comprimentos e contagens; owner, note, nullifier e árvore.
- `transfer.mjs`: ownership, commitments, nullifiers, inclusão e valores
  vinculados ao **mesmo assignment**, com todas as saídas públicas fixadas.

As equações são `a*b=z`, `a+b-2*a*b=z`, `1-a=z` e `a=b`, além de
`w*(w-1)=0` em cada wire. Como os wires são bits e os resíduos são pequenos,
o checker numérico não usa uma soma modular que pudesse esconder um resíduo.
O gerador calcula um assignment; o checker avalia as equações separadamente,
sem recalcular SHA-512 pela implementação nativa.

## Vinculação ao mesmo witness

O valor de oito bytes é compartilhado pelo hash da note e pelas restrições de
faixa, positividade e conservação. Os 11 bits superiores são zero, há pelo
menos um bit ativo, e somas de 64 bits exigem carry final zero. O segredo de
entrada gera o owner e o nullifier, e o commitment usado no nullifier é o mesmo
usado na inclusão e comparado ao commitment público. Não há um segundo valor
independente autorizado somente por uma checagem no host.

A posição Merkle é privada, limitada pelo count público e usada em muxes que
ordenam os irmãos em cada nível. O circuito também exige duplicação correta
no padding de larguras ímpares. A raiz inclui rede e número de folhas.
O compilador recebe um digest completo do statement já autenticado de maneira
independente; digest fornecido pelo próprio prover não representa autorização.

## Formato experimental V2

Notes continuam aceitando valores como strings decimais canônicas na API,
mas o commitment V2 codifica o valor em **oito bytes big-endian fixos**.
Assim, a forma pública do circuito não depende do comprimento decimal do valor
privado. O identificador da note foi alterado para
`AEGIS_EXPERIMENT_NOTE512_V2`, e o V1 é rejeitado: não há interpretação ambígua
entre os dois formatos experimentais. Isso não muda a rede PoW atual, o ativo,
as unidades, a emissão ou o teto monetário; nenhum nó aceita este formato.

## Validação

```sh
node --test aegis-flow/experiments/pq128/constraints/*.test.mjs
node aegis-flow/experiments/pq128/constraints/demo.mjs --report /tmp/constraints-NEW.json
```

Os testes comparam o gadget ao SHA-512 nativo em mensagens vazias e fronteiras
111/112/128/255/1024 bytes; conferem framing e toda a cadeia de hashes com o
mesmo witness; alteram owner, segredo, valor, randomness, posição e irmãos.
Também recomputam assignments para valores zero ou `2^53` com hashes e saldo
consistentes: a rejeição vem das restrições, não do parser de notes.

O demo publica apenas contagens de gates/wires, tempos e RSS amostrado. Não
publica proof, preimages, secret ou assignment. Os artefatos privados bloqueiam
JSON e redigem inspeção comum; acessar explicitamente `.values` ainda revela
segredos. JavaScript/BigInt não garantem tempo constante ou limpeza do heap.

## O que falta para uma prova privada/PQ128

O circuito agora fixa a relação comum, mas **sua satisfação local não é um
argumento público de conhecimento**. Faltam exportar/aritmetizar esta relação
inteira para o protocolo de prova, comprometer os wires/matrizes/statement,
implementar as aberturas com ocultação e verificar a relação sem receber o
assignment. O QAP anterior cobre somente o circuito de valores; o FRI público
não deve receber estes dados privados.

O custo de SHA-512 em gates também precisa entrar no dimensionamento real:
não se presume que todos os hashes de até quatro inputs e caminhos completos
caibam no domínio/segmentos da pesquisa anterior. O limite de gates falha
fechado e não constitui uma qualificação de capacidade. A correspondência ao
teorema QROM, conhecimento, privacidade e composição completa continua aberta.
`aegis_target_met` e `production_ready` continuam falsos.
