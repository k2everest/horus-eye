import { generateSigningKeyPair, generateKemKeyPair } from '../../libs/crypto-core/pqc-wrapper.mjs';
import { buildShieldedTx } from '../../libs/crypto-core/build-shielded-tx.mjs';

const signer = generateSigningKeyPair();
const recipient = generateKemKeyPair();
export function signedRequest(requestId = 'test-request') {
  return buildShieldedTx({ requestId, amount: 1, privateKey: signer.privateKey, recipientPublicKey: recipient.publicKey });
}
