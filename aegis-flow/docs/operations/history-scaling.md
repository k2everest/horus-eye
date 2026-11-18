# Histórico e custo do estado PoW

A atualização do estado de commitments usa uma fronteira Merkle incremental.
Ela preserva o hash de folha, a duplicação da última folha nos níveis ímpares,
o hash dos pares e a vinculação da quantidade na raiz de `AEGIS-MERKLE-V1`.
Não altera o programa STARK, o genesis, a transação nem as provas de inclusão.

Cada append recalcula somente os caminhos afetados e a raiz: O(log n) hashes,
com O(log n) hashes de fronteira. Snapshots **locais em memória**, produzidos
após validação, carregam essa fronteira para evitar rehash de todas as folhas
ao abrir uma cópia do estado. Cada fork recebe seu próprio array de fronteira.
Ela não é aceita de peers, não é checkpoint confiável e não substitui replay.
O restart e a restauração cifrada continuam revalidando os blocos e as provas.

## Evidência local

Os testes comparam raízes com a implementação completa anterior até 4097 folhas,
incluindo larguras ímpares e transições em potências de dois. Verificam inclusão,
forks independentes, restauração da fronteira, maturidade e recusa de overflow.
Um ensaio separado revalidou a prova STARK pública já existente pelo backend
nativo e restaurou seu estado, usando transporte S3 simulado.

No microbenchmark desta máquina, partindo de 2048 folhas e incluindo 128 novas,
os appends incrementais levaram 2,03 ms; reconstruções completas levaram 597,16 ms.
As raízes finais coincidiram. Isso mede apenas atualização Merkle local, não
TPS, tempo de prova, throughput de nó ou capacidade de uma rede em produção.

## Limites ainda abertos

- O circuito e as regras de consenso continuam limitados a 1 milhão de folhas.
  Aumentar somente uma constante JavaScript criaria divergência com o circuito.
- Clonagem de commitments/sets nos estados, criação dos caminhos de inclusão,
  raiz de nullifiers e acesso aos ancestrais ainda crescem com o histórico.
- O banco ainda retém corpos canônicos; os limites locais padrão continuam em
  50 mil blocos e 512 MiB. A poda de forks não aumenta a capacidade canônica.
- Não há snapshot persistente autenticado que permita descartar o histórico
  necessário à verificação. Não se aceita estado remoto sem prova/replay.
- Faltam medição prolongada de memória/disco/reorg e uma decisão de protocolo
  auditada para histórico e witnesses além desses limites.

Portanto, o bloqueador de histórico/capacidade permanece aberto. Esta mudança
remove reconstruções Merkle completas do caminho de append; não comprova
escala de produção nem modifica a meta criptográfica pós-quântica.

Validação da alteração: 176 testes de backend aprovados, zero falhas e 8
integrações opcionais não executadas; ensaio nativo separado de restauração
com STARK existente aprovado. Esses resultados não são auditoria independente.
