import test from 'node:test';
import assert from 'node:assert/strict';
import {createSpendIdentity512,createNote512,noteCommitment512,nullifier512,NOTE512_VERSION} from '../financial/notes.mjs';
import {bindingDigest512} from '../bindings.mjs';
import {evaluateBitCircuit} from './bit-circuit.mjs';
import {buildNoteTree512} from '../financial/membership.mjs';
import {RELATION_VERSION,financialStatementDigest512} from '../financial/relation.mjs';
import {compileTransferConstraints512,assignTransferConstraints512,checkTransferConstraints512} from './transfer.mjs';

function fixture(count,index){
  const networkId='bit-constraints',owner=createSpendIdentity512({networkId}),recipient=createSpendIdentity512({networkId});
  const input=createNote512({networkId,ownerTag:owner.owner_tag,value:'100'}),output=createNote512({networkId,ownerTag:recipient.owner_tag,value:'99'});
  const commitment=noteCommitment512(input),commitments=Array.from({length:count},(_,i)=>i===index?commitment:(i+1).toString(16).padStart(128,'0'));
  const tree=buildNoteTree512({networkId,commitments});
  const statement={version:RELATION_VERSION,network_id:networkId,asset_id:'QUEER',anchor_root:tree.root,anchor_leaf_count:count,
    input_commitments:[commitment],output_commitments:[noteCommitment512(output)],nullifiers:[nullifier512({note:input,spendSecret:owner.spend_secret})],fee:'1',transaction_binding:'ab'.repeat(64)};
  const witness={inputs:[{note:input,spend_secret:owner.spend_secret,membership:tree.proof(index)}],outputs:[output]};
  const relation=compileTransferConstraints512({statement,expectedStatementDigest:financialStatementDigest512(statement)});
  return {statement,witness,relation};
}

test('all hashes, ownership, inclusion and amount balance use one private constrained assignment',()=>{
  const f=fixture(1,0),assignment=assignTransferConstraints512(f.relation,f.witness);
  assert.equal(checkTransferConstraints512(f.relation,assignment),true);
  assert.equal(f.relation.hashCalls,6);assert.ok(f.relation.circuit.gateCount>1_000_000);
  assert.equal(f.relation.private_proof,false);assert.equal(f.relation.aegis_target_met,false);
  assert.throws(()=>JSON.stringify(assignment),/PRIVATE_BIT_ASSIGNMENT/);
  for(const mutate of [
    x=>x.inputs[0].spend_secret='00'.repeat(64),
    x=>x.inputs[0].note.owner_tag='00'.repeat(64),
    x=>x.inputs[0].note.randomness='00'.repeat(64),
    x=>x.inputs[0].note.value='101',
    x=>x.outputs[0].owner_tag='00'.repeat(64),
    x=>x.outputs[0].randomness='00'.repeat(64),
    x=>x.outputs[0].value='100',
    x=>x.inputs[0].membership.leaf_index=1,
  ]){
    const witness=structuredClone(f.witness);mutate(witness);
    // The evaluator assigns hash/arithmetic gates for the altered private
    // input; no native hash or host-level balance checker rejects it early.
    const altered=assignTransferConstraints512(f.relation,witness);
    assert.equal(checkTransferConstraints512(f.relation,altered),false);
  }
  const flipped=assignment.values.slice();flipped[Math.floor(flipped.length/2)]^=1;
  assert.equal(checkTransferConstraints512(f.relation,flipped),false);
  assert.equal(checkTransferConstraints512({...f.relation},assignment),false);
  const modified={...f.statement,fee:'0'};
  assert.throws(()=>compileTransferConstraints512({statement:modified,expectedStatementDigest:f.relation.statement_digest}),/UNTRUSTED/);
  const toJSONStatement={...f.statement};
  const redirected=structuredClone(f.witness);redirected.outputs[0]={...redirected.outputs[0],value:'100'};
  Object.defineProperty(toJSONStatement,'toJSON',{value:()=>({...f.statement,fee:'0',output_commitments:[noteCommitment512(redirected.outputs[0])]})});
  const snapshotted=compileTransferConstraints512({statement:toJSONStatement,expectedStatementDigest:f.relation.statement_digest});
  assert.equal(checkTransferConstraints512(snapshotted,assignTransferConstraints512(snapshotted,f.witness)),true);
  assert.equal(checkTransferConstraints512(snapshotted,assignTransferConstraints512(snapshotted,redirected)),false);
  assert.throws(()=>compileTransferConstraints512({statement:f.statement,expectedStatementDigest:f.relation.statement_digest,maxGates:100}),/budget/);
});

test('private position, odd-width duplication and every sibling are constrained to the public root',()=>{
  const f=fixture(3,2);
  assert.equal(checkTransferConstraints512(f.relation,assignTransferConstraints512(f.relation,f.witness)),true);
  for(const mutate of [
    x=>x.inputs[0].membership.leaf_index=0,
    x=>x.inputs[0].membership.leaf_index=3,
    x=>x.inputs[0].membership.siblings[0]='00'.repeat(64),
    x=>x.inputs[0].membership.siblings[1]='00'.repeat(64),
  ]){const w=structuredClone(f.witness);mutate(w);assert.equal(checkTransferConstraints512(f.relation,assignTransferConstraints512(f.relation,w)),false);}
  const malformed=structuredClone(f.witness);malformed.inputs[0].membership.siblings.pop();
  assert.throws(()=>assignTransferConstraints512(f.relation,malformed),/membership/);
});

test('range and positivity reject raw private bytes even when every SHA-512 digest and balance match',()=>{
  const networkId='raw-value-range',identity=createSpendIdentity512({networkId});
  const secret=Buffer.from(identity.spend_secret,'hex'),owner=Buffer.from(identity.owner_tag,'hex'),randomness=Buffer.alloc(64,7),outRandomness=Buffer.alloc(64,8);
  const version=Buffer.from(NOTE512_VERSION),net=Buffer.from(networkId),asset=Buffer.from('QUEER');
  const u64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64BE(n);return b;};
  const commit=(value,r)=>bindingDigest512({domain:'NOTE512_COMMITMENT',parts:[version,net,asset,u64(value),owner,r]});
  for(const {input,output,fee} of [{input:1n<<53n,output:(1n<<53n)-1n,fee:'1'},{input:0n,output:0n,fee:'0'}]){
    const commitment=commit(input,randomness),tree=buildNoteTree512({networkId,commitments:[commitment]});
    const statement={version:RELATION_VERSION,network_id:networkId,asset_id:'QUEER',anchor_root:tree.root,anchor_leaf_count:1,
      input_commitments:[commitment],output_commitments:[commit(output,outRandomness)],
      nullifiers:[bindingDigest512({domain:'NOTE512_NULLIFIER',parts:[version,net,asset,Buffer.from(commitment,'hex'),secret]})],fee,transaction_binding:'cd'.repeat(64)};
    const relation=compileTransferConstraints512({statement,expectedStatementDigest:financialStatementDigest512(statement)});
    // Bypass the note parser deliberately: a malicious prover supplies raw
    // bytes. Recomputed hash witnesses and exact balance cannot defeat bits53.
    const assignment=evaluateBitCircuit(relation.circuit,{input_0_value:u64(input),input_0_owner:owner,input_0_randomness:randomness,input_0_secret:secret,input_0_index:Buffer.alloc(4),
      output_0_value:u64(output),output_0_owner:owner,output_0_randomness:outRandomness});
    assert.equal(checkTransferConstraints512(relation,assignment),false);
  }
});
