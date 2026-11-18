# Requisitos monetários QUEER informados pelo responsável

- 1 QUEER = 105.000.000 AEGIS.
- AEGIS é a unidade atômica indivisível.
- Emissão máxima por toda a existência da rede: 20.000.000 QUEER,
  equivalentes a 2.100.000.000.000.000 AEGIS.
- Aumento de custo pretendido: aumento direto da dificuldade de Proof of Work,
  não apenas redução da recompensa.
- Dificuldade crescente global: aplica-se a todos os blocos, inclusive transferências.
- Remuneração por taxas após emissão foi solicitada anteriormente; sua utilização
  depende de continuar sendo possível minerar blocos sob a dificuldade global.

O módulo `services/open-chain/queer-units.mjs` implementa a conversão exata,
sem ponto flutuante. O total cabe nos limites inteiros atuais do guest e do
consenso. Isso não resolve os limites de quantidade de commitments/histórico.

105.000.000 não é potência de dez. Um AEGIS não possui representação decimal
finita em QUEER. O parser recusa frações inferiores a um AEGIS em vez de
arredondar débitos, e o formatter exato pode exibir `1 QUEER + 1 AEGIS`.
O app deve conservar valores em AEGIS; preço em moeda fiduciária é outra grandeza.

## Consenso implementado: AEGIS_OPEN_POW_V3

O perfil V3 exige `asset_id: QUEER`, teto exato de 2.100.000.000.000.000 AEGIS
e taxas `miner-fees-v1`. Teto diferente, outro ativo ou ausência dessa política
são rejeitados no genesis. O subsídio é limitado ao saldo de emissão restante;
o último pode ser parcial, e depois do teto a emissão é zero. Taxas transferem
valor existente e não entram no contador de novas emissões.

O perfil V2 permanece compatível com suas regras anteriores. O schema V3,
configuração completa e domínios de genesis/bloco próprios mudam a identidade da
rede. Um banco/cofre anterior não é migrado ou reinterpretado silenciosamente.
O programa de transferências STARK continua o mesmo: seu journal já vincula
rede, ativo, valores, commitments e taxas.

### Dificuldade global quadrática

A regra `difficulty.policy: supply-quadratic-v1` é aplicada a todos os blocos,
inclusive os que contêm transferências ou somente taxas. Para altura h:

```text
C = 2.100.000.000.000.000 AEGIS
emitido_antes = min((h - 1) × base_reward, C)
restante = C - emitido_antes
alvo(h) = max(minimum_target, floor(pow_limit × restante² / C²))
```

Quanto menor o alvo, maior o trabalho esperado. O cálculo usa BigInt, sem
aproximação em ponto flutuante. A dificuldade não diminui com o tempo ou com a
saída de mineradores. Os campos de tempo/retarget mantêm compatibilidade de
configuração, mas não relaxam o alvo nesse perfil. O intervalo real dos blocos
pode aumentar; não há promessa de prazo de confirmação.

A curva tende a trabalho ilimitado no modelo contínuo sem piso; hashes e unidades
atômicas são finitos. Por isso o genesis exige `minimum_target` hexadecimal de
64 dígitos, positivo e estritamente menor que `pow_limit`. Esse alvo final mantém
uma dificuldade **finita**, inclusive após o teto, permitindo matematicamente
blocos por taxas. Não garante viabilidade prática: escolher um alvo final muito
baixo pode tornar todas as confirmações impraticáveis.

A curva quadrática com piso é a implementação preparada pelo assistente para
os requisitos, não uma aprovação econômica independente nem uma mainnet já ativa.
`base_reward`, alvo inicial e alvo final precisam ser escolhidos e revisados
explicitamente pelos responsáveis; nenhum ritmo comercial foi ativado.

### Criar uma configuração

```bash
node aegis-flow/scripts/open-chain.mjs queer-genesis \
  --output NOVO_ARQUIVO_GENESIS.json \
  --network-id NOME_DA_REDE \
  --base-reward RECOMPENSA_POR_BLOCO_EM_AEGIS \
  --minimum-target ALVO_FINAL_HEXADECIMAL_DE_64_DIGITOS
```

`--pow-limit` permite escolher o alvo inicial; omitido, usa o alvo experimental
anterior. A taxa mínima desse gerador é 1 AEGIS. O comando exige recompensa e
alvo final e não sobrescreve arquivos. O modo continua experimental. Uma rede
existente não deve receber um genesis novo como se fosse atualização de dados.

O teto e a regra PoW são verificados durante admissão, sincronização, restart,
restauração e recuperação por peers. A implementação não fecha os limites do
histórico, a análise STARK de 128 bits pós-quânticos, auditoria ou testnet pública.
