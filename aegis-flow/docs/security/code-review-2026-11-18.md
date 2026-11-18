# Revisão técnica do repositório — 18/11/2026

## Correções posteriores à revisão

O texto de achados abaixo registra a versão examinada originalmente. As correções
de código começaram em `bc05afb`; não interpretar a lista histórica como o estado
atual de todos os itens.

| Item | Tratamento aplicado | Evidência/limite |
| --- | --- | --- |
| 1 — Replay entre genesis | PoW V2 usa o config_id completo como network_id da transferência, assinatura, journal e envelopes | STARK nova aceita na rede de origem e rejeitada em genesis distinto com notes/raízes espelhadas; V1 não é migrado silenciosamente |
| 2 — SSRF/autorização | Destino HTTPS exclusivo configurado no servidor; usuário validado e permissão view_monitor; somente leitura, sem raw paths/redirects | Testes offline de autenticação, destino interno, método administrativo e limites; deployment externo depende dos secrets descritos no runbook |
| 3 — Cópia da cadeia | Índice canônico por altura e leitura apenas do bloco solicitado no SQLite | Teste impede uso de blocks() na consulta e verifica isolamento de mutações |
| 4 — Recursos | Snapshots verificados em memória, corpos no SQLite, limites de retenção/cache/reconstrução e poda de forks não canônicos | Testes de capacidade/poda e STARK real sem reverificar prefixo em filhos vazios; poda de histórico canônico/snapshots persistentes continuam pendentes para operação longa |
| 5 — Notes acumuladas | Janela ativa de envio, remoção de notes gastas e recuperação incremental das excedentes do histórico verificado | Teste com 4097 notes; saldo confirmado agrega excedentes e UI informa a janela disponível |
| 6 — Sync parcial | Refresh ocorre em finally quando o tip muda, inclusive após falha do peer | Peer de teste entrega prefixo válido e falha no restante do lote |
| 7 — Senha RPC | Campos removidos de Settings; configuração antiga apagada de localStorage; credenciais não são enviadas pelo cliente | Teste de migração de credencial e contrato público da chamada |
| 8 — Dependências | React Router 7, Recharts 3, Zod 4, PostCSS atualizado; ferramentas separadas de runtime; plugin antigo de tagging removido; Vite/Vitest/parser atualizados | npm audit --omit=dev: zero; auditoria completa ainda tem 30 entradas (25 altas, 4 moderadas, 1 baixa), todas no conjunto dev |

Parte dos avisos de desenvolvimento propaga o advisory ReDoS de picomatch
`<=4.0.7`; a versão latest consultada nesta rodada era a própria 4.0.7, sem patch
publicado. Não foram forçados downgrades de ferramentas ou apagados advisories.
O servidor Vite agora fica em loopback; CI tem permissões somente leitura e
timeouts. Não expor ferramentas de desenvolvimento a usuários não confiáveis.
Triagem/atualização das ferramentas continua aberta e não é uma liberação de
produção. Auditoria independente, 128 bits PQ, incentivos e operação pública
independente continuam pendentes.

Validação das correções: 145 testes de backend e 4 de interface aprovados,
STARK nova com rejeição cruzada entre genesis e reinício aprovada em 224 s,
checagem TypeScript, build e lint (zero erros, 8 avisos de Fast Refresh).

## Integração posterior de carteira e recuperação PoW

A entrega `1653e4c` acrescentou carteira/gráfica PoW V2, reversão de saldo e
reservas de órfãos, watermark de trabalho, backup cifrado/revalidação de branches,
contrato S3, readiness/métricas e locks do kernel com recuperação após crash.
Uma STARK nova exercitou o fluxo completo em 225 segundos. A revisão original
abaixo descreve o estado anterior dessa integração; os critérios ainda abertos
estão em docs/planning/production-exit-criteria.md. Isso não é auditoria
independente, teste público prolongado ou liberação de produção.

## Registro original

Conclusão: **não liberar para produção**. Os testes atuais passam, mas há
defeitos de isolamento de rede, disponibilidade e segurança da aplicação.
Esta revisão registra achados; não os corrige nem constitui auditoria independente.

## Escopo e método

Revisão da árvore em `f974863`; merge `de633fe` preserva exatamente essa árvore
e integra o commit remoto do relay. Inventário de serviços/libs, frontend e
Supabase: 214 arquivos, incluindo testes e recursos. Inspeção manual dos caminhos
críticos de consenso, estado, guest/verificador Rust, assinatura, cifragem,
carteira/cofre, gateway, controle de acesso, backup/S3 e proxy RPC/autenticação.
Busca estática transversal, testes, build, lint e auditoria npm complementam a
leitura. Não foi feita inspeção linha a linha de cada componente visual,
verificação formal, pentest remoto, auditoria de todas as dependências Rust ou
nova geração de STARK nesta revisão. A integração STARK anterior está registrada
em `docs/testing/open-chain-validation.md`; não deve ser confundida com este ensaio.

## Achados, em ordem de prioridade

### 1. P1 — Transação/STARK não vinculam a identidade completa do genesis

Fontes: `libs/crypto-core/transfer-v2.mjs:15`,
`services/open-chain/state.mjs:23`, `services/open-chain/consensus.mjs:26`.
O consenso identifica a rede pelo hash da configuração inteira, mas a transferência
e seu statement só carregam o `network_id` textual. Duas configurações diferentes
podem compartilhar esse nome, programa, ativo e um prefixo de notes/raízes.
Nessas condições, a assinatura e o statement de uma transferência são os mesmos
nas duas redes: falta proteção contra replay entre genesis distintos.

Reprodução local: duas cadeias com tetos 700 e 701, mesmo nome e primeiro reward
espelhado com PoW válido; config IDs diferentes e mesma raiz. Uma transferência
ML-DSA real preparada sobre essa raiz não contém config ID na assinatura nem no
statement. Não foi executado gasto STARK entre ambas: a evidência é a colisão de
domínio e a análise dos caminhos de validação. Corrigir vinculando a identidade
imutável da rede à assinatura, statement, circuito e contextos de cifragem, com
versionamento e teste de rejeição cruzada usando prova real.

### 2. P1 — Proxy Monero permite SSRF e não aplica autorização no handler

Fonte: `supabase/functions/monero-rpc/index.ts:135`.
`host`, porta, raw path e método vêm do cliente; a regex permite loopback e redes
privadas. Não há checagem de usuário/permissão no handler, allowlist de métodos,
timeout explícito ou limite de resposta; redirects também não são bloqueados.
Isso permite usar o servidor como proxy para serviços internos alcançáveis.

Reprodução offline do handler transpilado, com fetch simulado: sem Authorization,
`host=127.0.0.1`, porta 8080 e raw path `/internal` resultam em tentativa de POST
interno e resposta 200 com o conteúdo devolvido. Nenhuma rede interna real foi
acessada. Não se verificaram controles de egresso/JWT do deployment Supabase;
podem limitar a exploração, mas não corrigem o handler. Exigir usuário/permissão,
destinos e métodos aprovados, validação DNS/IP a cada conexão, bloqueio de
redirects e limites de tempo/tamanho. Conexão ao localhost do usuário exige um
agente local; localhost de uma Edge Function é o próprio servidor remoto.

### 3. P1 — Consultar um bloco copia todas as provas da cadeia

Fonte: `services/open-chain/chain.mjs:27`.
`blockAt(height)` chama `blocks()`, que faz structuredClone do branch inteiro,
antes de selecionar um item. A API pública permite repetir isso sem minerar.
Com crescimento do histórico, uma consulta de bloco antigo aloca o tamanho de
todas as provas históricas; a sincronização repete essa alocação por bloco.
O limite de requisições não limita bytes copiados ou custo por consulta.

Reprodução: em cadeia com três blocos válidos de recompensa, instrumentar
structuredClone mostrou três blocos copiados ao consultar somente o bloco 1.
O backend do ensaio rejeita transferências; não simula aprovação de provas.
Corrigir com índice canônico por altura e cópia/leitura somente do bloco pedido,
mais orçamento de resposta e ensaios com histórico contendo provas reais.

### 4. P1 — Reexecução e retenção de forks não têm orçamento de recursos

Fontes: `services/open-chain/chain.mjs:38`, `services/open-chain/chain.mjs:48`,
`services/open-chain/state.mjs:33`.
Cada admissão/revalidação reconstrói estado e verifica o prefixo inteiro; no
restart isso se repete para todos os blocos e forks. Todos os corpos/provas ficam
na memória e no SQLite sem poda ou limite global. Um bloco aceito persiste custo
futuro de CPU, RAM e disco. É limitação arquitetural já documentada, agora
confirmada pela leitura; não foi executado ensaio de exaustão da máquina.
Implementar estado incremental, cache de validação com integridade, poda segura,
índices, limites de forks/bytes e processamento isolado com orçamento.

### 5. P1 — A carteira acumula notes até impedir novos syncs/envios

Fontes: `services/wallet-local/wallet.mjs:163`,
`services/wallet-local/vault.mjs:35`.
O scan percorre todo o histórico e conserva notes gastas. O cofre rejeita mais
de 4096 notes; não existe checkpoint/compactação que permita continuar crescendo.
Ao chegar à note 4097, salvar durante sync falha; enviar também exige sync antes.

Reprodução do validador de payload com chaves reais e notes distintas do mesmo
owner: 4096 aceitas, 4097 rejeitadas com `INVALID_WALLET_PAYLOAD`. Não foram
geradas 4097 notes em rede. Corrigir a retenção histórica e o scan incremental,
preservando recuperação de saldo/reservas; testar travessia do limite e restore.

### 6. P2 — Sync parcial pode atualizar a cadeia sem atualizar o mempool

Fonte: `services/open-chain/node.mjs:72`.
syncPeer aplica cada bloco imediatamente. Se um lote falha após importar um
prefixo válido, o catch em sync pula refresh, mesmo quando o tip já mudou.
O mempool pode conservar gastos/anchors inválidos e o minerador escolher uma
transação que agora falha. Achado por inspeção, sem reprodução end-to-end nesta
rodada. Executar refresh após qualquer mudança de tip, inclusive no caminho de
erro, e testar peer que falha na metade de um lote.

### 7. P2 — Credencial RPC persistida em texto no navegador

Fontes: `src/pages/SettingsPage.tsx:52`, `src/lib/monero-rpc.ts:3`.
A configuração salva inteira em localStorage inclui username/password. Scripts
da mesma origem ou extensões com acesso podem ler a credencial persistente.
Não foi demonstrado XSS; não se trata das chaves do cofre Aegis. Retirar senha
da persistência do frontend e usar agente/cofre local para conexões autenticadas.

### 8. Dependências — Advisories exigem triagem antes de release

`npm audit --json`: 58 entradas (31 altas, 25 moderadas, 2 baixas).
`npm audit --omit=dev --json`: 25 entradas (16 altas, 9 moderadas).
São entradas de pacotes, incluindo dependências transitivas, não 58 explorações
demonstradas nem necessariamente 58 CVEs distintos. Há dependências de build
classificadas em dependencies; omit=dev não mede o que está alcançável no bundle.
Separar ferramentas, atualizar versões e comprovar alcance/mitigação por advisory.
Não foi aplicado audit fix automático, pois pode alterar APIs e quebrar o projeto.

## Bloqueadores já conhecidos e ainda presentes

- Não há demonstração de 128 bits pós-quânticos no perfil STARK; SHA-256 PoW
  precisa de análise distinta, não herda essa garantia das assinaturas ML-DSA.
- Carteira gráfica, backup S3 e parte da campanha/revisão atendem ao settlement
  permissionado anterior; não constituem operação completa da rede PoW.
- Histórico append-only limitado a 1.000.000 de folhas no guest/Merkle. Ao
  esgotá-lo, novos outputs/rewards deixam de caber sem mudança de protocolo.
- Falta definir remuneração da segurança depois do teto de emissão com taxa zero.
- Peers fixados manualmente e ausência de testnet prolongada com mineração
  independente não demonstram resistência a eclipse, censura ou concentração.

## Verificações executadas nesta rodada

- `bash aegis-flow/scripts/dev-env.sh test`: 137 aprovados, 6 integrações opt-in
  puladas; zero falhas. STARK nova não foi gerada nesta revisão.
- `npm test`: 3 aprovados.
- `npm run build`: aprovado, com aviso de tamanho de chunks.
- `npm run lint`: zero erros, 8 avisos de Fast Refresh.
- Reproduções locais descritas acima; nenhum teste intrusivo em serviços externos.

Ordem de correção: isolamento de genesis e SSRF; custo dos endpoints/estado;
carteira e sync parcial; credenciais/dependências. Depois, integração PoW
completa e testes adversariais antes da auditoria independente de lançamento.
