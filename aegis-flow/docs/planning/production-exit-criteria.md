# Critérios de saída para produção — PoW V2/V3

Estado: preparação em andamento; sem liberação ou rede pública implantada.
O empacotamento específico do nó PoW agora tem manifesto, verificação de
imagem/genesis e workflow de artefato. Imagens experimentais V3 foram construídas
e verificadas no CI; deploy público e qualificação operacional seguem pendentes.
Procedimento: [release PoW](../operations/pow-release.md).
A alteração atual fecha integrações de código, não valida todas as premissas de
produção. Nenhum valor comercial de emissão ou destino de infraestrutura foi
presumido a partir do exemplo de laboratório.

## Implementado e ensaiado localmente

- Teto QUEER V3 e dificuldade PoW global vinculados ao genesis;
  [regra monetária](../launch/queer-monetary-request.md). A curva tem piso finito,
  e os parâmetros comerciais de recompensa/alvo final ainda exigem revisão.
- Poda de forks e inserção de blocos atômicas, com rollback sob falhas SQL;
  recibos indexados sem percorrer o histórico em cada leitura. Evidências e
  limitações: [atomicidade e capacidade](../operations/atomic-capacity.md).
- Dependências corrigidas: auditoria npm completa sem vulnerabilidades conhecidas
  na consulta de 19/11/2026; [versões e validação](../security/dependency-review-2026-11-19.md).

- Atualização Merkle incremental com raízes compatíveis e fronteiras locais
  isoladas entre forks; [evidências e limites de histórico](../operations/history-scaling.md).

- Carteira local/gráfica PoW: chaves protegidas no cofre, full verification,
  confirmações/maturidade, reserva antes de provar/transmitir, reversão de saldo
  em reorganização, recuperação de pagamentos órfãos e backup/restauração.
- Watermark de trabalho no cofre, permitindo cadeia mais curta de maior trabalho
  e recusando recuperação abaixo do trabalho já verificado.
- Snapshot consistente do SQLite, backup PoW AES-GCM, restauração que revalida
  branches e exige configuração e piso de trabalho independentes do manifest.
- Compatibilidade com transporte S3 com KMS/versionamento/receipt; ensaio de
  contrato em memória, não operação no bucket real.
- Perfil com lock do kernel, exclusão de escritores e recuperação após SIGKILL.
- Readiness/métricas públicas do nó, composição restrita e backup agendado PoW.
- CI dedicado à carteira com STARK real; compose validado sintaticamente. Não foi
  construído/implantado novo artefato Docker neste ambiente com disco limitado.

A integração nativa local gerou STARK nova e verificou pagamento, recebimento,
reorg de pagamento confirmado, reserva de inputs órfãos, recuperação do cofre e
restauração do banco PoW revalidado em aproximadamente 225 segundos.

## Bloqueadores remanescentes e evidência exigida

| Prioridade | Trabalho necessário | Critério de saída |
| --- | --- | --- |
| P0 | Parâmetros/motor STARK | Análise aceita que demonstre a meta pós-quântica ponta a ponta. O perfil atual continua sem demonstrar 128 bits; aumentar um rótulo não resolve |
| P0 | Política monetária de lançamento | Teto preservado e taxas ao minerador após emissão escolhidos; perfil de taxas implementado. Aprovar ativo/unidade, recompensa, teto e mínimo de taxa comerciais; auditar e validar incentivos. Valores do lab não são aprovados para lançamento |
| P0 | Histórico e escala | Plano/implementação auditada para o limite de 1 milhão de folhas, snapshots persistentes/poda canônica, restauração e recursos ao longo do tempo |
| P0 | Auditoria independente | Revisão de consenso/circuito/carteira/chaves/backup, achados críticos e altos corrigidos e revalidados |
| P0 | Infraestrutura real | Nós/peers independentes, identidade do artefato, configuração e segredos locais definidos; deploy e recuperação por peers ensaiados, com disponibilidade e perda de dados medidas |
| P0 | Operação adversarial | Falha de host/disco/rede, reorgs com muitas intents, capacidade de cofre, rotação de chaves e recuperação sob carga demonstradas no destino |
| P1 | Testnet pública prolongada | Pelo menos a campanha definida, provas reais novas, terceiros e mineradores independentes, partições/reorgs/carga e evidências verificáveis; laboratório não conta como tempo público |

S3 e AWS não são requisitos da blockchain nem condições de liberação.
O transporte S3 existente é opcional e não foi utilizado. A recuperação do nó
pode reconstruir o banco com blocos/provas verificados de peers e piso de trabalho
independente, sem aceitar um banco remoto como estado confiável. Chaves de
carteira não são recuperadas da cadeia: exigem backup privado pelo usuário.
A execução dos nós e as decisões econômicas de lançamento ainda precisam ser
definidas pelo responsável. Auditoria, análise criptográfica e duração pública não podem ser
substituídas por testes locais ou hashes de documentos ainda não produzidos.
O gate/runtime de produção permanece bloqueado até esses critérios serem atendidos.

Execução e limites: [carteira/recuperação](../operations/pow-wallet-recovery.md).
Estado criptográfico: [parâmetros STARK](../security/stark-parameters.md).

Escopo detalhado para substituir e qualificar a construção:
[PQ128: avaliação, decisões e critérios por marco](pq128-scope-2026-11-21.md).
