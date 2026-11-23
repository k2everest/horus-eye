# Criptografia Aegis — implementação nativa PQC v1

Requer **Node.js >= 24.8** com OpenSSL/ML-DSA/ML-KEM disponíveis. CI usa Node
24. Não há fallback para hashes, ECC/RSA, assinaturas fictícias ou chaves KMS
simuladas. `node:crypto` executa as primitivas; a integração não é uma
certificação FIPS nem uma auditoria do protocolo.

## Primitivas e formatos

- ML-DSA-44/65/87 (FIPS 204): keygen, assinatura e verificação reais.
- ML-KEM-512/768/1024 (FIPS 203): keygen, encapsulamento e decapsulamento reais.
- Chaves privadas: KeyObjects no builder; wrappers aceitam KeyObject ou PEM
  PKCS8. Públicas: KeyObject ou PEM SPKI. Formatos/chaves de outro algoritmo
  falham. Strings `kms://...` não são resolvidas nem tratadas como segredos.
- Digest de assinatura: exatamente 32 bytes em hex minúsculo, domínio ASCII
  `[A-Z0-9_]{1,64}`. Pure ML-DSA assina
  `ASCII("AEGIS-PQC-V1") || 0x00 || uint8(domainLength) || domain || digestBytes`.
  O byte final do prefixo é NUL, não os caracteres barra e zero.
  Isso não é o modo padronizado HashML-DSA.
- Assinatura/ciphertext KEM: hex minúsculo com tamanho exato por algoritmo.
- Secret KEM: Buffer de 32 bytes. O chamador deve derivar uma chave, não logar
  o secret e limpar o Buffer ao terminar. O wrapper de envelope já o faz.

## Envelope autenticado

`sealEnvelope` encapsula uma chave por mensagem e cifra 1..65536 bytes com
AES-256-GCM. Nonce aleatório de 12 bytes; tag de 16 bytes; HKDF-SHA256 produz
chave AES de 32 bytes. `context` é obrigatório (máximo 1024 bytes UTF-8) e deve
ser conferido pelo destinatário por `expectedContext`.

Definições exatas para interoperabilidade:

- `AAD = UTF8(JSON.stringify([version, kem_algorithm, kem_ciphertext, nonce, context]))`
- `salt = SHA256(bytes(kem_ciphertext))`
- `info = ASCII("AEGIS-SEALED-V1") || 0x00 || SHA256(AAD)`
- `key = HKDF-SHA256(sharedSecret, salt, info, 32)`
- Formato: `{version, kem_algorithm, kem_ciphertext, nonce, context, ciphertext, auth_tag}`.

A tag autentica o header e o ciphertext. O decoder rejeita campos extras,
versões desconhecidas, comprimentos incorretos e contextos diferentes.
Nenhum plaintext sai antes da verificação da tag; falhas usam um erro único.
KEM usa implicit rejection: adulterar o ciphertext pode produzir outro secret,
sem erro de decapsulamento. É a autenticação AEAD que rejeita essa mensagem.
A limpeza de Buffers é best effort; o JavaScript/GC pode manter outras cópias.

## Exemplo de integração

```js
import { generateSigningKeyPair, generateKemKeyPair } from './pqc-wrapper.mjs';
import { buildShieldedTx } from './build-shielded-tx.mjs';
import { validateShieldedTxV1 } from './validate-shielded-tx.mjs';
import { openEnvelope } from './sealed-envelope.mjs';

const signer = generateSigningKeyPair('ML-DSA-65');
const recipient = generateKemKeyPair('ML-KEM-768');
const tx = buildShieldedTx({
  requestId: 'request-1', amount: 7,
  privateKey: signer.privateKey, recipientPublicKey: recipient.publicKey,
});
const result = validateShieldedTxV1({ tx });
const noteBytes = openEnvelope({
  envelope: tx.encrypted_output, recipientPrivateKey: recipient.privateKey,
  expectedContext: 'NOTE_OUTPUT_V1:request-1',
});
// Consumir noteBytes localmente e limpar o Buffer após o uso.
```

O builder retorna somente a transação pública e assinada: sem note em claro,
opening ou chave privada. Tags de remetente e destinatário são fingerprints
SHA-256 das chaves SPKI; tags fornecidas que não correspondem são rejeitadas.
A assinatura vincula a chave pública, os campos da transação e o envelope
cifrado. Amount é inteiro positivo representável com segurança; não usar float
para valores monetários. Todos os formatos anteriores são incompatíveis.

O gateway `POST /validate` verifica esse formato; envelopes fictícios da
carteira QUEER antiga são rejeitados. Não existe fallback de demonstração.

## Testes e limites

`node --test aegis-flow/libs/crypto-core/*.test.mjs` inclui:

- vetores públicos NIST ACVP de sigVer (aceitação/rejeição) nos três ML-DSA;
- vetores NIST de decapsulamento válido e implicit rejection nos três ML-KEM;
- alterações de assinatura, digest, contexto, algoritmo e chave;
- HKDF/AEAD, framing, round-trip e tentativa de personificar remetente;
- integração builder → gateway → decriptação pelo destinatário.

Fonte pinada, identificação dos casos e hashes dos arquivos originais ficam em
`test-vectors/nist-acvp.json`. As chaves privadas desses fixtures são vetores
públicos, nunca credenciais. Os testes nativos de vetores de assinatura usam a
interface FIPS pura/contexto do Node diretamente; o framing Aegis tem testes
próprios. O subconjunto não substitui certificação ou a suíte ACVP completa.

**Ainda não é um protocolo financeiro de produção.** Transfer V2 agora usa
commitments SHA-256 binários com randomness, composite STARK e SQLite WAL.
Este README descreve a API PQC e o builder V1; os formatos V2, guest, limites de
segurança e relação provada estão em `../../services/proof-engine/README.md`. Amount, asset e fingerprints continuam públicos, portanto o
formato ainda não entrega privacidade transacional completa. O transcript usa
SHA-256: aumentar o parâmetro ML-DSA não eleva automaticamente a segurança do
protocolo inteiro. A construção KEM/AEAD, parâmetros e serialização precisam de
revisão independente. Key vault, backup/rotação de chaves e integração com a carteira
browser permanecem pendentes. Backup consistente do ledger já está implementado. O gateway mantém `production_ready: false` e
bloqueio de `NODE_ENV=production`.
