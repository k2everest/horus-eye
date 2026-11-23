import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateV5PublicStatement,QUEER_V5_CANDIDATE_VERSION} from './v5-public-transfer.mjs';
const h=c=>c.repeat(128);
const valid=()=>({
  version:QUEER_V5_CANDIDATE_VERSION,network_id:'QUEER_TEST',
  anchor_root:h('a'),nullifiers:[h('b')],output_commitments:[h('c')],
  fee_atomic:'42',asset_id:'QUEER',proof_program_id:h('d'),
  encrypted_outputs:[{algorithm:'ML-KEM-1024',one_time_view_tag:h('e'),
    kem_ciphertext_hex:'ab'.repeat(1568)}],
});
test('private-by-default candidate publicly discloses only anchor, nullifier, output, fee, one-time KEM material',()=>{
  const out=candidateV5PublicStatement(valid());
  assert.equal(out.statement.nullifiers.length,1);
  assert.equal(out.public_linkable_input_commitment_included,false);
  assert.equal(out.public_reusable_sender_key_included,false);
  assert.equal(out.ownership_and_membership_proved,false);
  assert.equal(out.zero_knowledge_proved,false);
  assert.equal(out.pq128_demonstrated,false);
  assert.equal(out.consensus_admitted,false);
  for(const field of ['input_commitments','sender_tag','pq_public_key','spend_secret','recipient_tag']){
    assert.equal(Object.hasOwn(out.statement,field),false);
    assert.throws(()=>candidateV5PublicStatement({...valid(),[field]:'any'}));
  }
});
test('candidate rejects extra identifiers, invalid KEM size, altered fee and missing one-time fields',()=>{
  const f=valid();f.encrypted_outputs[0].kem_ciphertext_hex='ab';
  assert.throws(()=>candidateV5PublicStatement(f));
  for(const changes of [{fee_atomic:'-1'},{fee_atomic:'9007199254740992'},
    {nullifiers:[]},{network_id:'!bad'},{anchor_root:'11'}]){
    assert.throws(()=>candidateV5PublicStatement({...valid(),...changes}));
  }
});
