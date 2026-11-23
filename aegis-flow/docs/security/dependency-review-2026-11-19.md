# Dependências — revisão automatizada de 19/11/2026

O `npm audit` completo reportou inicialmente 11 entradas: 6 altas, 4 moderadas
e 1 baixa. Após atualização do lockfile e instalação das versões corrigidas,
a mesma consulta reportou **zero vulnerabilidades conhecidas**, incluindo dev.
Isso substitui o estado de advisories registrado na revisão de 18/11; não é uma
auditoria independente nem uma garantia de ausência de falhas.

Foram aplicadas atualizações compatíveis para humanfs, once, browser metadata,
brace-expansion, browserslist, flatted, form-data, js-yaml, selector-parser e ws.
Não foi usado `npm audit fix --force` nem downgrade do plugin de tipografia.

`@tailwindcss/typography` ainda exige um selector-parser antigo. O override fica
limitado a esse pai e fixa `postcss-selector-parser` 6.1.5, versão corrigida para
[GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf), mantendo a
API major 6. Reavaliar o override quando o plugin atualizar sua dependência.

Validação com as dependências instaladas: 6 testes de interface, TypeScript,
build e lint aprovados. Permanecem os 8 avisos de Fast Refresh e o aviso de
tamanho de chunks já existentes. O lockfile preserva versões/integridades para
reprodução com `npm ci`; o CI ainda precisa validar o commit publicado.

O scanner deve ser reexecutado antes de cada release. Este resultado não encerra
os bloqueios de protocolo, segurança STARK pós-quântica, operação e testnet.
