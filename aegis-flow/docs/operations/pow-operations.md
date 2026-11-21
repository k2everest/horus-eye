# Operação PoW independente de provedor

S3, AWS e autoridade central não são necessários à blockchain. Cada operador
mantém um full node com banco local e verifica genesis, blocos, trabalho, emissão
e STARK. Peers distribuem os dados públicos; não guardam as chaves privadas dos
usuários. Replicação da cadeia não substitui backup privado da carteira.

## Histórico e capacidade

A validação consulta uma janela de ancestrais de tamanho máximo
`max(11, retarget_interval)` para tempo mediano e dificuldade. O índice canônico
é estendido sem reconstruir a lista inteira a cada bloco; forks ainda exigem
reorganização validada. A reserva de armazenamento calcula poda somente quando
há pressão nos limites. As raízes Merkle incrementais permanecem compatíveis.

Os limites de 1 milhão de folhas no circuito, 50 mil blocos e 512 MiB locais
por padrão **continuam vigentes**. Não basta aumentar constantes para eliminá-los.
O teste de capacidade reduz o limite para 48 blocos e exercita várias janelas de
retarget, cache limitado, restart e recusa sem perder o tip ao esgotar armazenamento.
Isso valida comportamento na fronteira configurada; não demonstra operação além
do limite do circuito nem resolve persistência/poda canônica de longo prazo.

## Artefato e nós independentes

1. Use o [pacote PoW](pow-release.md) do commit revisado e genesis revisado.
   Verifique commit/config ID por canais independentes e carregue a imagem local.
2. Cada operador cria seu diretório de dados e usa a composição
   `deployments/open-pow/compose.yaml`, com imagem imutável e peers reais.
   Não compartilhe um banco SQLite entre hosts nem exponha o serviço da carteira.
3. Exponha somente a API do nó com limites de rede/TLS apropriados. O nó fica
   em loopback por padrão; publicação externa é uma configuração explícita.
4. Operadores distintos devem controlar hardware, administração e mineração
   próprios. URLs distintas não comprovam independência. Não há nomes/domínios
   nem participantes externos inventados nesta preparação.
5. Instale coleta de `/readyz` e `/metrics`; as regras de capacidade em
   `deployments/monitoring/open-pow-capacity.rules.yml` são exemplos que precisam
   ser carregados e ensaiados. Monitore também ausência de scrape e disco livre.

Não foi construída uma imagem nova neste ambiente com cerca de 93 MiB livres.
Há workflow de candidato, mas um arquivo/workflow não comprova deploy real.
O modo continua experimental, sem liberação financeira.

## Recuperação de host por peers

Com genesis aprovado e piso de trabalho obtido por canal independente, recupere
para um diretório novo. Forneça origins que você está autorizado a consultar:

```bash
node aegis-flow/scripts/pow-peer-recovery.mjs \
  --genesis CAMINHO_GENESIS_REVISADO \
  --destination CAMINHO_NOVO_DO_BANCO \
  --peer ORIGIN_PEER_1 --peer ORIGIN_PEER_2 \
  --minimum-work TRABALHO_MINIMO_CONHECIDO \
  --max-blocks 50000 --max-rounds 1024 \
  --report CAMINHO_NOVO_DO_RELATORIO
```

Blocos e provas são verificados localmente desde genesis, em staging. Nenhum
snapshot de estado declarado pelo peer é confiado. Somente após atingir o piso
o banco é publicado; perfil existente não é sobrescrito. Falhas parciais contam
contra o orçamento antes de tentar outro peer. Um piso não prova que você viu a
melhor cadeia global: revise fontes independentes e evite depender de um só peer.

O relatório mede `recovery_elapsed_ms` (download e verificação locais), registra
tip/recursos e não aceita automaticamente evidência de produção. Meça o RTO
operacional desde o incidente até o serviço voltar a atender. Para perda de dados,
compare os últimos pagamentos confirmados e o watermark externo com a cadeia
recuperada; não anuncie RPO zero a partir de um cronômetro. Reorgs continuam possíveis.
O relatório não recupera chaves, notes privadas ou intents apenas no mempool.

## Campanha pública prolongada

Prepare e execute por pelo menos 30 dias uma campanha com participantes e
mineradores independentes, ativos sem valor e revisores externos. Registre:

- commit, imagem e config ID usados por cada operador;
- journals/horários, interrupções de observação, heads e trabalho verificados;
- transações novas com provas reais e confirmações PoW, separando replays;
- carga, latência, uso de memória/disco, reorgs e gasto após teto com taxas;
- partição, perda de processo/host, disco cheio e recuperação por peers;
- operações de carteira e restauração privada pelos próprios usuários;
- relato de cada participante e revisão de independência/administração.

Meta inicial de campanha: 10 participantes externos com ao menos 10 fluxos
completos cada, 1000 transações novas em 21 dias ativos e observação por 30 dias.
Esses números são critérios de teste, não garantias de segurança ou descentralização.
O harness permissionado anterior exige certificados de outra arquitetura e não
pode marcar P1 PoW concluído. Logs locais, chaves criadas pelo autor e vários
containers no mesmo runner não representam terceiros nem dias públicos.

Em incidente, preserve evidências, contenha o serviço afetado e recupere em perfil
novo com verificação completa. Não apague blocos canônicos para corrigir saldo,
não distribua chaves de usuários e não substitua provas por snapshots confiados.
P1 e produção permanecem pendentes até evidências reais revisadas.
