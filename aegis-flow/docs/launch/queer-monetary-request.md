# Requisitos monetários QUEER informados pelo responsável

- 1 QUEER = 105.000.000 AEGIS.
- AEGIS é a unidade atômica indivisível.
- Emissão máxima por toda a existência da rede: 20.000.000 QUEER,
  equivalentes a 2.100.000.000.000.000 AEGIS.
- Aumento de custo pretendido: aumento direto da dificuldade de Proof of Work,
  não apenas redução da recompensa.
- Decisão anterior preservada: remuneração por taxas após o fim da emissão.

O módulo `services/open-chain/queer-units.mjs` implementa a conversão exata,
sem ponto flutuante. O total cabe nos limites inteiros atuais do guest e do
consenso. Isso não resolve os limites de quantidade de commitments/histórico.

105.000.000 não é potência de dez. Um AEGIS não possui representação decimal
finita em QUEER. O parser recusa frações inferiores a um AEGIS em vez de
arredondar débitos, e o formatter exato pode exibir `1 QUEER + 1 AEGIS`.
O app deve conservar valores em AEGIS; preço em moeda fiduciária é outra grandeza.

## Decisão de consenso ainda necessária

O protocolo atual retargeta a dificuldade para manter o intervalo dos blocos e
emite subsídio limitado por altura. Não implementa a nova curva de dificuldade
solicitada, nem um genesis comercial com estes valores.

Se o trabalho para qualquer bloco tender ao infinito, a confirmação de pagamentos
e a coleta de taxas também podem se tornar inviáveis. “Infinito” literal não é
um target representável num hash finito. Aumento de dificuldade mede tentativas
de hash esperadas; não garante preço, gasto elétrico ou custo monetário futuro.

Proposta para conciliar os requisitos: dificuldade adicional para emitir novas
moedas, dependente do total efetivamente emitido, separada do trabalho necessário
para confirmar blocos com transferências/taxas. Essa proposta ainda não foi
aprovada como regra de consenso. Exige definir curva, dificuldade inicial,
quantidade emitida por evento e regra exata no limite atômico, além de nova
contabilidade de emissão e testes/auditoria.

Nenhuma curva ou ritmo comercial foi escolhido automaticamente. As redes
existentes não foram alteradas e a produção permanece bloqueada. A implementação
da unidade e o registro do teto não constituem ativação ou enforcement desta
política em uma mainnet.
