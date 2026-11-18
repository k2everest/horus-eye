# Teto de emissão preservado e taxas aos mineradores

Decisão do responsável: preservar o teto e usar taxas de transação para
remunerar a mineração, inclusive após o fim do subsídio. Não há emissão contínua.

O perfil novo de genesis adiciona ao objeto `monetary`:

```json
{"fee_policy":"miner-fees-v1","minimum_fee":1}
```

O mínimo deve ser um inteiro positivo em unidades atômicas do ativo. O comando
`lab-genesis` usa 1 apenas como exemplo experimental; ativo, teto, subsídio e
taxa comerciais ainda exigem revisão. Os demais campos de `monetary` continuam
obrigatórios. Esse perfil muda o config ID completo e não migra uma cadeia já
existente: nós antigos rejeitam os campos novos, e um banco/cofre de outra
configuração é recusado. Redes antigas sem esses campos conservam taxa zero.

## Conservação e pagamento

- A taxa é `public_amount`, já vinculada à assinatura e ao journal STARK.
- A prova exige `sum(inputs) = sum(outputs) + taxa`.
- O bloco paga exatamente `subsídio limitado + taxa` em sua reward note.
- Depois do teto, subsídio = 0; a reward note contém somente a taxa. Blocos
  sem transação continuam possíveis, sem recompensa quando não há subsídio.
- O total emitido conta somente o subsídio. Transferir uma taxa ao minerador
  não aumenta a oferta. Não há crédito externo adicional, burn ou tesouraria.
- A reward note, incluindo taxas, respeita a maturidade existente. Reorgs
  removem o pagamento órfão e a transação volta a depender da cadeia canônica.

O consenso rejeita taxa abaixo do mínimo, não inteira, negativa ou acima do
intervalo permitido; soma de subsídio/taxa acima do limite de uma note também
é rejeitada. O minerador não pode criar valor reivindicando uma taxa maior:
assinatura, STARK, conservação e valor exato da reward note são verificados.

## Carteira

A seleção de inputs cobre quantidade mais taxa, e o troco desconta ambas.
A carteira usa o mínimo do genesis por padrão; a interface mostra a taxa e o
total debitado antes da confirmação, permitindo escolher uma taxa maior.
Saldo insuficiente não gera uma prova nem transmissão parcial. O serviço local
aceita `fee` como string inteira em `/send`; omitir usa o mínimo da rede PoW.

## Liberação

A escolha resolve a direção dos incentivos e implementa o repasse; não demonstra
segurança econômica após o teto. Faltam análise adversarial, auditoria independente,
meta STARK de 128 bits pós-quânticos, ensaios públicos e critérios operacionais.
O gate de produção continua bloqueado. A assinatura/prova torna a taxa pública;
não anunciar sigilo do valor da taxa nem garantia de confirmação por pagá-la.
