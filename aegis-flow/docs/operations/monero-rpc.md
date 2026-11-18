# Proxy Monero: conexão autenticada somente leitura

A Edge Function não aceita host, porta, senha, raw path ou método administrativo
vindos do navegador. O destino é único e escolhido pelo operador; não deve ser
um resolvedor/proxy aberto nem um domínio controlado por solicitantes.

Configure via secrets do deployment (não versione os valores):

- AEGIS_MONERO_RPC_URL: URL HTTPS fixa terminando em /json_rpc, sem userinfo,
  query ou fragmento. A conexão local ao daemon deve usar um agente local; não
  publique o RPC administrativo irrestrito para atender ao navegador.
- AEGIS_MONERO_RPC_AUTHORIZATION: opcional, header Basic/Bearer para o upstream
  administrado. Segredo permanece no servidor. Digest de credenciais fornecidas
  pelo navegador deixou de ser suportado.
- AEGIS_WEB_ORIGIN: origem HTTPS exata da interface.
- SUPABASE_URL e SUPABASE_ANON_KEY: fornecidos pelo ambiente Supabase.

O endpoint verifica o bearer em /auth/v1/user e exige view_monitor (ou admin por
has_permission). A anon key sozinha não identifica um usuário autorizado.
Somente get_info, get_block_count e get_block por altura são permitidos. Redirects
falham; requisições, respostas, simultaneidade e duração têm limites. A política
se aplica ao monitor Horus; não é autoridade ou cadastro da blockchain Aegis.

Settings não grava credenciais e o carregamento remove a configuração antiga de
localStorage. A função de monitoramento não executa pop_blocks nem alterações
remotas de peers. Ajustes administrativos precisam de canal próprio e autorização
específica, fora deste proxy. Controles de egresso/DNS do servidor e rotação dos
segredos do upstream continuam sob responsabilidade da operação.

Teste offline: node --test supabase/functions/monero-rpc/handler.test.mjs.
