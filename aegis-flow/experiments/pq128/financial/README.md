# Relação financeira experimental

Este diretório implementa a relação privada a ser aritmetizada para um futuro
prover. **Não é um verificador de provas, endpoint de rede ou autorização para
movimentar fundos.** Consome witnesses locais e inclui operações SHA-512 no
host que ainda não foram traduzidas para restrições. A rede atual não importa
este código nem aceita este formato.

## Componentes

| Componente | Implementado | Ainda necessário |
| --- | --- | --- |
| Notes | SHA-512 com framing, versão/rede/ativo, owner e randomness de 64 bytes | Gadgets dos hashes e serialização no circuito |
| Ownership e nullifier | Checagem local do segredo e nullifier estável por note | Argumento de conhecimento dentro da prova |
| Inclusão | Árvore SHA-512 com raiz vinculada à rede e número de folhas | Caminhos e hashes aritmetizados |
| Valores | R1CS com bits, reconstrução, positividade e conservação | Vincular seus wires aos valores das notes e à prova |
| Polinômios aritméticos | QAP privado, três máscaras independentes, FFT sem alias e quociente exato | Compromissos públicos vinculados a um witness comum e ao statement |
| Mascaramento | `M=T+(X^N-1)R`, randomness nova, preservação do trace | ZK de compromissos, quocientes, aberturas e protocolo completo |
| Relação local | Integra hash/inclusão e circuito de valores | Prover/verificador remoto que não receba o witness |

O formato novo tem identificadores `AEGIS_EXPERIMENT_*`, hashes de 64 bytes e
valores decimais canônicos em **strings inteiras de AEGIS atômicos**, sem float.
O ativo é QUEER. Isso não muda a divisão de 105.000.000 AEGIS por QUEER, o teto
de emissão ou as regras PoW: nenhuma regra monetária da rede foi alterada.
O limite aritmético por note é `2^53-1`, não uma autorização de emissão; o teto
global é responsabilidade do consenso e do estado de origem, não deste checker.

## Circuito de valores real

`compileAmountCircuit({inputs,outputs,fee})` compila a forma pública esperada,
independentemente dos valores privados. `assignAmountWitness` atribui os wires;
`checkAmountWitness` avalia efetivamente cada restrição `A(w)*B(w)=C(w)`.
Não se reduz a comparar duas somas no momento de gerar o witness.

Cada valor contém 53 bits booleanos, reconstrução linear e uma restrição
`sum(bits)*inverse=1` para excluir zero. A conservação impõe
`sum(inputs)-sum(outputs)-fee=0`. Há no máximo quatro valores por lado e uma
taxa de até `2^53-1`; `5*(2^53-1)<p` impede que wrap modular esconda diferença
inteira após as restrições de faixa. A taxa é compilada a partir do valor
público confiado pelo chamador.

Circuitos são imutáveis e só são aceitos pelo checker se compilados localmente.
Um objeto de constraints enviado pelo prover não é uma política autorizada.
O checker aceita o witness inteiro e **não comprova conhecimento remotamente**.

`buildPrivateAmountQap` converte as restrições em avaliações A/B/C no domínio
de tamanho N, interpola e mascara os três polinômios independentemente. Calcula
o produto por FFT dimensionada para convolução linear e exige a identidade:

```text
M_A(X) * M_B(X) - M_C(X) = (X^N - 1) * Q(X)
```

A divisão é exata, com resto zero obrigatório, inclusive quando o grau de
mascaramento ultrapassa N. Os testes avaliam a identidade fora do domínio e
em todas as linhas das constraints. O resultado é um artefato privado que
recusa JSON e redige inspeção, não uma prova transmissível.

**Baixo grau e divisibilidade sozinhos não bastam:** sem compromissos e
restrições que vinculem A/B/C ao mesmo witness, às matrizes públicas e às notes,
um futuro verificador poderia aceitar identidades sem significado financeiro.
Este código ainda não implementa essa vinculação nem um argumento de conhecimento.
Não entregar seus polinômios ao FRI público como se fossem uma prova ZK.

## Vinculação ao statement esperado

`checkTransferWitness512` exige que o chamador forneça o contexto e o digest
completo do statement esperado, obtido de maneira independente. Um identificador
`transaction_binding` opaco sozinho não prende destinatário ou taxa. Os testes
reproduzem uma alteração desses campos com o mesmo identificador e exigem
rejeição enquanto o digest esperado não for substituído por uma nova autorização.

O resultado contém somente o digest público e flags de escopo, nunca o witness.
`cryptographic_proof`, `aegis_target_met` e `production_ready` permanecem falsos.
Isso não substitui a assinatura da transação ou uma prova; o digest é somente
um binding. A verificação de nullifiers já gastos no ledger também permanece
fora desta relação local. Unicidade dentro da transação é conferida aqui.

Os nullifiers incluem rede, commitment completo e spend secret, sem posição,
transação ou anchor. Assim, restaurar/reorganizar a cadeia não gera outro
nullifier para a mesma note. A árvore experimental é limitada a 65.536 folhas;
isso não resolve o crescimento do histórico nem altera o circuito legado.

## Privacidade e mascaramento

`maskTrace` usa coeficientes uniformes de campo por CSPRNG e rejection sampling,
sem seed ou máscara escolhida pelo chamador. O artefato recusa JSON e redige
inspeção comum, mas acesso explícito aos coeficientes continua expondo dados
privados. BigInt/JavaScript não fornecem tempo constante nem apagamento seguro.

A afirmação algébrica limitada é: até r avaliações distintas e fixas fora do
subgrupo são uniformizadas por r coeficientes aleatórios, sob as hipóteses de
randomness indicadas. Isso não cobre todos os dados que um protocolo revela.
Não enviar coeficientes, witnesses ou estes artefatos ao prover FRI público.
Merkle sem sal, quocientes, aberturas adaptativas e composição precisam da
construção ZK completa, de sua análise e de testes adversariais.

## Reprodução

```sh
node --test aegis-flow/experiments/pq128/financial/*.test.mjs
```

Os testes incluem adulteração de ownership/membership/outputs, dupla entrada,
mudança de rede e taxa, números não canônicos, ataques de bits não booleanos,
wrap do campo, witness desequilibrado com hashes consistentes e falhas de RNG.
Nenhuma prova financeira privada nativa ou demonstração PQ128 é alegada.
