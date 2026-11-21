import test from 'node:test';
import assert from 'node:assert/strict';
import {createSpendIdentity512,createNote512,noteCommitment512,nullifier512} from './notes.mjs';
import {buildNoteTree512} from './membership.mjs';
import {RELATION_VERSION,checkTransferWitness512,financialStatementDigest512} from './relation.mjs';
const clone=structuredClone;
function fixture(){
  const networkId='experimental-financial',owner=createSpendIdentity512({networkId}),recipient=createSpendIdentity512({networkId});
  const note=value=>createNote512({networkId,ownerTag:owner.owner_tag,value});
  const inputs=[note('70'),note('30')],outputs=['50','40'].map(value=>createNote512({networkId,ownerTag:recipient.owner_tag,value}));
  const input_commitments=inputs.map(noteCommitment512),tree=buildNoteTree512({networkId,commitments:input_commitments});
  const statement={version:RELATION_VERSION,network_id:networkId,asset_id:'QUEER',anchor_root:tree.root,anchor_leaf_count:2,
    input_commitments,output_commitments:outputs.map(noteCommitment512),nullifiers:inputs.map(note=>nullifier512({note,spendSecret:owner.spend_secret})),
    fee:'10',transaction_binding:'ab'.repeat(64)};
  return {statement,witness:{inputs:inputs.map((note,i)=>({note,spend_secret:owner.spend_secret,membership:tree.proof(i)})),outputs},
    expected:{networkId,anchorRoot:tree.root,anchorLeafCount:2,transactionBinding:statement.transaction_binding,statementDigest:financialStatementDigest512(statement)}};
}
test('local relation checks ownership, membership, commitments, nullifiers and real amount constraints',()=>{
  const f=fixture(),r=checkTransferWitness512(f);
  assert.equal(r.valid,true);assert.equal(r.cryptographic_proof,false);assert.equal(r.hash_constraints_arithmetized,false);
  assert.equal(r.aegis_target_met,false);assert.equal(r.production_ready,false);
  const text=JSON.stringify(r);
  for(const input of f.witness.inputs){assert.ok(!text.includes(input.spend_secret));assert.ok(!text.includes(input.note.randomness));}
  assert.equal(r.statement_digest,financialStatementDigest512(f.statement));
  const reversed=Object.fromEntries(Object.entries(f.statement).reverse());
  assert.equal(financialStatementDigest512(reversed),r.statement_digest);
});
test('valid note hashes do not let an unbalanced transfer bypass the amount circuit',()=>{
  const f=fixture();f.witness.outputs[0]={...f.witness.outputs[0],value:'51'};
  f.statement.output_commitments[0]=noteCommitment512(f.witness.outputs[0]);
  f.expected.statementDigest=financialStatementDigest512(f.statement);
  const r=checkTransferWitness512(f);assert.equal(r.valid,false);assert.equal(r.reason,'INVALID_PRIVATE_RELATION');
});
test('reusing a transaction-binding label cannot change recipient or fee under the trusted statement',()=>{
  const f=fixture(),changed=clone(f);
  const recipient=createSpendIdentity512({networkId:f.expected.networkId});
  changed.witness.outputs[0]=createNote512({networkId:f.expected.networkId,ownerTag:recipient.owner_tag,value:'59'});
  changed.statement.output_commitments[0]=noteCommitment512(changed.witness.outputs[0]);changed.statement.fee='1';
  assert.equal(changed.statement.transaction_binding,f.statement.transaction_binding);
  assert.equal(checkTransferWitness512(changed).valid,false);
  // A different statement can pass only if the caller independently authorizes
  // its complete digest, not merely the old opaque transaction label.
  changed.expected.statementDigest=financialStatementDigest512(changed.statement);
  assert.equal(checkTransferWitness512(changed).valid,true);
  assert.equal(checkTransferWitness512(null).valid,false);
  assert.equal(checkTransferWitness512(undefined).valid,false);
});
test('secret substitution, replay context, duplicate spends and hidden-schema downgrades fail closed',()=>{
  const f=fixture();
  const attacks=[
    x=>x.witness.inputs[0].spend_secret='00'.repeat(64),
    x=>x.witness.inputs[0].membership.siblings[0]='00'.repeat(64),
    x=>x.witness.inputs[0].membership.leaf_count=3,
    x=>x.statement.nullifiers[0]='00'.repeat(64),
    x=>x.statement.input_commitments[1]=x.statement.input_commitments[0],
    x=>x.statement.output_commitments[0]=x.statement.input_commitments[0],
    x=>x.statement.nullifiers[1]=x.statement.nullifiers[0],
    x=>x.statement.network_id='other',x=>x.expected.anchorLeafCount=3,
    x=>x.expected.transactionBinding='00'.repeat(64),
    x=>x.witness.outputs[0].value=50,x=>x.witness.outputs[0].value='050',
    x=>x.witness.outputs[0].asset_id='OTHER',x=>x.witness.outputs[0].randomness='00'.repeat(32),
    x=>x.statement.fee='10.0',x=>x.statement.asset_id='AEGIS',
    x=>x.statement.extra=true,x=>x.witness.inputs[0].extra=true,x=>x.witness.extra=true,
    x=>x.witness.inputs.pop(),x=>x.witness.outputs.pop(),
  ];
  for(const attack of attacks){const x=clone(f);attack(x);assert.equal(checkTransferWitness512(x).valid,false);}
});
test('statement digest covers order, fee and transaction binding; it is never a signature or proof',()=>{
  const f=fixture(),digest=financialStatementDigest512(f.statement);
  for(const st of [{...f.statement,fee:'9'}, {...f.statement,transaction_binding:'ac'.repeat(64)},
    {...f.statement,output_commitments:[...f.statement.output_commitments].reverse()}])assert.notEqual(financialStatementDigest512(st),digest);
  assert.throws(()=>financialStatementDigest512({...f.statement,version:'AEGIS-ZK-STARK-V1'}));
});
