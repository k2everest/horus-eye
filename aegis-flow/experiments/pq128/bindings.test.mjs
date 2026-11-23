import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { generateSigningKeyPair, exportPublicKey } from '../../libs/crypto-core/pqc-wrapper.mjs';
import { BINDING_SUITE, bindingFrame512, bindingDigest512, commitment512, merkleLeaf512, merkleNode512,
  transcriptDigest512, signerTag512, signTranscript512, verifyTranscript512 } from './bindings.mjs';

const b = value => Buffer.from(value);
test('binary framing matches independent SHA-512 computation and keeps every part unambiguous', () => {
  // Construct the byte frame independently rather than calling the encoder.
  const length = value => { const out = new Uint8Array(4); new DataView(out.buffer).setUint32(0,value,false); return Buffer.from(out); };
  const suite = b(BINDING_SUITE), domain = b('TEST');
  const frame = Buffer.concat([b('AEGIS_BINDING_FRAME_V1\0'),length(suite.length),suite,length(4),domain,
    length(2),length(2),b('ab'),length(1),b('c')]);
  const input = {domain:'TEST',parts:[b('ab'),b('c')]};
  assert.deepEqual(bindingFrame512(input),frame);
  assert.equal(bindingDigest512(input),crypto.createHash('sha512').update(frame).digest('hex'));
  // Fixed vector independently reproduced using Python hashlib/struct.
  assert.equal(bindingDigest512(input),'f69ff1cad6f329c0c1287d183b90c4ba718f937eb874b872652f987369db2f4fd9baaaf3d46d7a3deddaf5768470026cfea4a7be44e7482ddb79549221ed534d');
  assert.equal(bindingDigest512(input).length,128);
  assert.notEqual(bindingDigest512(input),bindingDigest512({domain:'TEST',parts:[b('a'),b('bc')]}));
  assert.notEqual(bindingDigest512(input),bindingDigest512({domain:'OTHER',parts:input.parts}));
  assert.notEqual(bindingDigest512({domain:'TEST',parts:[]}),bindingDigest512({domain:'TEST',parts:[b('')]}));
  for (const invalid of ['','test','TEST\0','TEST|OTHER','A'.repeat(65)]) assert.throws(() => bindingDigest512({domain:invalid,parts:[]}));
  assert.throws(() => bindingDigest512({domain:'TEST',parts:['not bytes']}));
  assert.throws(() => bindingDigest512({domain:'TEST',parts:Array.from({length:65},()=>b(''))}));
  assert.throws(() => bindingDigest512({domain:'TEST',parts:[Buffer.alloc(1024*1024+1)]}));
  assert.throws(() => bindingDigest512({domain:'TEST',parts:Array.from({length:5},()=>Buffer.alloc(1024*1024))}));
});

test('commitments, Merkle leaves/nodes and transcripts separate their purposes and validate widths', () => {
  const randomness = '01'.repeat(64), value = b('payload');
  const commitment = commitment512({domain:'APPLICATION',value,randomness});
  const leaf = merkleLeaf512(value), other = merkleLeaf512(b('different'));
  const transcript = transcriptDigest512({domain:'APPLICATION',payload:value});
  assert.equal(new Set([commitment,leaf,transcript]).size,3);
  assert.notEqual(commitment,commitment512({domain:'APPLICATION',value,randomness:'02'.repeat(64)}));
  assert.notEqual(commitment,commitment512({domain:'OTHER',value,randomness}));
  assert.notEqual(merkleNode512(leaf,other),merkleNode512(other,leaf));
  assert.notEqual(merkleNode512(leaf,other),merkleLeaf512(Buffer.concat([Buffer.from(leaf,'hex'),Buffer.from(other,'hex')])));
  assert.throws(() => commitment512({domain:'APPLICATION',value,randomness:'01'.repeat(32)}));
  assert.throws(() => merkleNode512('00'.repeat(32),leaf));
  assert.throws(() => merkleNode512(leaf.toUpperCase(),other));
});

test('real ML-DSA-87 signs a suite/domain-bound transcript and rejects tampering, substituted keys and downgrade', () => {
  const keys = generateSigningKeyPair('ML-DSA-87'), other = generateSigningKeyPair('ML-DSA-87');
  const weaker = generateSigningKeyPair('ML-DSA-65');
  const payload = b('a signed experimental transcript'), domain = 'APPLICATION';
  const signed = signTranscript512({domain,payload,privateKey:keys.privateKey});
  const input = {domain,payload,publicKey:keys.publicKey,signed};
  assert.equal(verifyTranscript512(input),true);
  assert.equal(signed.signature.length/2,4627);
  assert.equal(signed.signer_tag,signerTag512(keys.publicKey));
  assert.equal(verifyTranscript512({...input,publicKey:exportPublicKey(keys.publicKey)}),true);
  assert.equal(verifyTranscript512({...input,payload:b('changed')}),false);
  assert.equal(verifyTranscript512({...input,domain:'OTHER'}),false);
  assert.equal(verifyTranscript512({...input,publicKey:other.publicKey}),false);
  assert.equal(verifyTranscript512({...input,publicKey:weaker.publicKey}),false);
  assert.equal(verifyTranscript512({...input,publicKey:keys.privateKey}),false);
  const changedSignature = (signed.signature[0]==='0'?'1':'0')+signed.signature.slice(1);
  for (const patch of [
    {signature:changedSignature},{signature:signed.signature.slice(2)},{signature:signed.signature.toUpperCase()},
    {suite:'AEGIS-PQC-V1'},{signature_algorithm:'ML-DSA-65'},{domain:'OTHER'},
    {transcript_digest:'00'.repeat(64)},{signer_tag:signerTag512(other.publicKey)},{extra:true},
  ]) assert.equal(verifyTranscript512({...input,signed:{...signed,...patch}}),false);
  for (const patch of [{algorithm:'ML-DSA-65'},{suite:'AEGIS-PQC-V1'},{privateKey:weaker.privateKey},{privateKey:keys.publicKey}]) {
    assert.throws(() => signTranscript512({domain,payload,privateKey:keys.privateKey,...patch}));
  }
  const pem = keys.privateKey.export({type:'pkcs8',format:'pem'});
  assert.equal(verifyTranscript512({...input,signed:signTranscript512({domain,payload,privateKey:pem})}),true);
});
