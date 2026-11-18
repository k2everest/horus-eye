# ADR-0006 — Rede aberta com Proof of Work

Estado: implementado como experimento; direção solicitada para a Aegis/QUEER.
Substitui a escolha de autoridade única da ADR-0005 para **novas redes abertas**.
Não converte certificados ou saldos de redes antigas em consenso PoW.

## Decisão

Qualquer participante pode executar um full node, verificar transações e minerar
blocos sem cadastro, país autorizado, lista de validadores ou assinatura de uma
autoridade. Cada nó mantém sua própria base SQLite e verifica independentemente
o genesis, trabalho, dificuldade, transações STARK e estado resultante.
SQLite continua sendo single-host **por nó**, não um banco compartilhado entre nós.

Escolha de cadeia: maior trabalho acumulado, somando `2^256/(target+1)` por
bloco, com desempate determinístico pelo menor hash. SHA-256 duplo sobre um
cabeçalho canônico com domínio específico fornece o desafio de mineração.
Retarget usa o intervalo definido no genesis, limita a variação a 4× e não
ultrapassa o target máximo. Timestamp supera a mediana dos últimos 11 blocos;
blocos mais de duas horas no futuro são rejeitados. Relógios precisam estar
corretos. Isso é um protocolo experimental, não Bitcoin nem segurança herdada dele.

O genesis vazio fixa identidade, programa STARK, ativo, recompensa, teto, tempo
alvo, maturidade, janela de anchors e confirmações. O hash de todos esses parâmetros
é a identidade da rede. Não há chave de alteração, administração monetária,
recompensa discricionária ou alocação inicial. Subsídio no bloco h:
`min(base_reward, max(0, max_supply-(h-1)*base_reward))`.
Mudar essas regras exige software/configuração incompatível e adesão dos nós;
não existe mecanismo que impeça participantes de criar seus próprios forks.

Cada bloco contém no máximo uma transferência e uma recompensa protocolar.
A recompensa publica sua abertura (valor, owner_tag e randomness), mas não o
spend secret: emissão é auditável e sua origem não é privada. Gastos posteriores
usam o circuito STARK existente. Exige-se `public_amount=0`, ativo do genesis,
assinatura ML-DSA válida, inclusão em raiz ancestral canônica recente, inputs
presentemente não gastos e maturidade das recompensas. A raiz pode ser histórica
para permitir provar enquanto novos blocos chegam. Nullifiers e raízes de notes
são recalculados; trabalho declarado por outro nó nunca é confiado.

Confirmações são **probabilísticas**, inclusive após o limiar configurado.
Uma cadeia de maior trabalho pode substituir blocos confirmados. Receipts usam
`INCLUDED_POW`/`CONFIRMED_POW`, `settled:false`; certificados da autoridade antiga
não finalizam esta rede. Persistência guarda forks e revalida tudo ao reiniciar.
Transações órfãs só retornam ao mempool após nova validação de estado.

## Hipóteses e pendências

- Resistência a reorganizações depende de trabalho honesto suficiente e acesso
  a peers independentes. Sem mineradores independentes, o software não produz
  descentralização operacional. Ataques majoritários, concentração de mineração,
  eclipse, censura e negação de serviço continuam possíveis.
- SHA-256 PoW não demonstra segurança pós-quântica de 128 bits. A vantagem
  quântica na busca e os parâmetros STARK exigem análises separadas. Os parâmetros
  STARK atuais continuam sem comprovação de 128 bits PQ.
- Bootstrap é por peers configurados localmente, sem descoberta/seleção robusta
  anti-Sybil. Não há dependência de uma autoridade de cadastro de participantes.
- Reexecução integral de cada branch é deliberadamente simples e cara. Faltam
  snapshots verificáveis, poda de forks, índices incrementais e limites de
  armazenamento resistentes a abuso. Histórico de notes do guest limita-se a
  1.000.000 de folhas. Não há alegação de capacidade de mainnet.
- A emissão finita e taxa obrigatoriamente zero deixam o incentivo após o teto
  em aberto. Parâmetros comerciais, distribuição de trabalho, retarget sob ataques
  e economia de mineração precisam de especificação/revisão antes de lançamento.
- Carteira gráfica, campanha pública, backup S3 e revisão de lançamento existentes
  ainda são do modelo anterior. Não aceitar certificados permissionados como
  evidência PoW nem apresentar saldo dessa carteira como saldo da nova rede.
  Integração de carteira deve reverter saldo e reservas em reorganizações.
- Não há bridge, resgate em rede externa, stake, tesouraria administrável ou chave
  de emergência. Não foi implantada uma rede pública nesta alteração.

Próximos gates: carteira com sincronização PoW e restauração sob reorg; auditoria
independente do consenso/circuito; proteção de recursos e recuperação; testnet
prolongada com operadores/mineradores independentes. Critérios de revisão de uma
organização operadora não são regras de admissão ou autoridade sobre o protocolo.
