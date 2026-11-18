# Critérios de saída para produção — PoW V2

Estado: preparação em andamento; sem liberação ou rede pública implantada.
O empacotamento específico do nó PoW agora tem manifesto, verificação de
imagem/genesis e workflow manual de artefato; construção e deploy reais seguem
pendentes. Procedimento: [release PoW](../operations/pow-release.md).
A alteração atual fecha integrações de código, não valida todas as premissas de
produção. Nenhum valor comercial de emissão ou destino de infraestrutura foi
presumido a partir do exemplo de laboratório.

## Implementado e ensaiado localmente

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
| P0 | Política monetária de lançamento | Escolha explícita de ativo/unidade, recompensa, teto e remuneração da segurança após a emissão; implementar e auditar a escolha. Valores do lab não são aprovados para lançamento |
| P0 | Histórico e escala | Plano/implementação auditada para o limite de 1 milhão de folhas, snapshots persistentes/poda canônica, restauração e recursos ao longo do tempo |
| P0 | Auditoria independente | Revisão de consenso/circuito/carteira/chaves/backup, achados críticos e altos corrigidos e revalidados |
| P0 | Infraestrutura real | Hosts/domínios, identidade do artefato, distribuição de peers, secrets/IAM/KMS e bucket definidos; deploy e restauração S3 real ensaiados com RTO/RPO medidos |
| P0 | Operação adversarial | Falha de host/disco/rede, reorgs com muitas intents, capacidade de cofre, rotação de chaves e recuperação sob carga demonstradas no destino |
| P1 | Testnet pública prolongada | Pelo menos a campanha definida, provas reais novas, terceiros e mineradores independentes, partições/reorgs/carga e evidências verificáveis; laboratório não conta como tempo público |
| P1 | Dependências de build | Advisories dev triados/corrigidos ou mitigação formal aceita; runtime auditado sem avisos não encerra o risco de supply chain |

O bucket informado é queer-altcoin (us-east-2, owner 941554679497). A integração
usa aegis/pow/v2 e tem inspeção somente leitura/planos IAM e ensaio de restore;
autenticação, KMS, estado do bucket e ensaio real ainda precisam ser verificados.
A execução dos nós e as decisões econômicas de lançamento ainda precisam ser
definidas pelo responsável. Auditoria, análise criptográfica e duração pública não podem ser
substituídas por testes locais ou hashes de documentos ainda não produzidos.
O gate/runtime de produção permanece bloqueado até esses critérios serem atendidos.

Execução e limites: [carteira/recuperação](../operations/pow-wallet-recovery.md).
Estado criptográfico: [parâmetros STARK](../security/stark-parameters.md).
