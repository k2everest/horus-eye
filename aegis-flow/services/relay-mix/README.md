# Relay mix — US-015 (MVP local)

Fila em memória com frames binários de tamanho fixo, padding aleatório e saída
em lotes completos embaralhados por Fisher–Yates com `node:crypto.randomInt`.
Não requer dependências externas.

```js
import { RelayMix, unpadEnvelope } from './index.mjs';

const relay = new RelayMix({ frameBytes: 4096, batchSize: 2, maxQueueSize: 128 });
relay.enqueue(Buffer.from('envelope-a'));
relay.enqueue(Buffer.from('envelope-b'));
const frames = relay.takeBatch();
const payloads = frames.map(unpadEnvelope);
```

Cada frame contém comprimento uint32 big-endian, payload e padding aleatório.
O payload máximo é `frameBytes - 4`. Enqueue copia os bytes; chamadas inválidas
e fila cheia falham antes de alterar o estado. O orçamento máximo configurável
da fila é 64 MiB (bytes dos frames, sem overhead dos objetos).

`takeBatch()` retorna `[]` sem consumir mensagens se o lote estiver incompleto.
Não há timeout que libere lotes menores. O chamador deve definir agendamento,
transporte, confirmação de entrega e retries; retirar um lote transfere sua
responsabilidade ao chamador. Reiniciar o processo perde a fila.

## Limites

Este módulo não está conectado ao gateway nem à carteira. Os frames não são
cifrados: o comprimento e o conteúdo permanecem visíveis. O framing deve ficar
dentro de um transporte cifrado autenticado antes de qualquer uso de rede.
Padding e embaralhamento isolados não garantem anonimato ou resistência a
correlação. Delays, cover traffic (US-016), métricas de linkabilidade (US-017),
autenticação e persistência permanecem pendentes. Este módulo não implementa
verificação criptográfica de transações.

## Testar

```bash
node --test aegis-flow/services/relay-mix/*.test.mjs
```

O runner `bash aegis-flow/scripts/dev-env.sh test` também inclui estes testes.
