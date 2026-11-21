import test from 'node:test';
import assert from 'node:assert/strict';
import {ExperimentalValueLedger512} from './value-ledger.mjs';
import {createSpendIdentity512,createNote512,noteCommitment512,nullifier512} from './notes.mjs';
import {buildNoteTree512} from './membership.mjs';
import {RELATION_VERSION,financialStatementDigest512,checkTransferWitness512} from './relation.mjs';
import {NATIVE512_SCHEME} from '../native/backend.mjs';

// This stub tests ledger transition policy ONLY. It is not cryptographic proof
// validation; integration.test.mjs exercises real native Composite receipts.
const PROGRAM='ab'.repeat(32);
const backend={programId:PROGRAM,async verify({proof}) {
  await Promise.resolve();
  return {valid:proof.receipt==='TEST_ONLY_VERIFIED',program_id:PROGRAM,
    engine_profile:'RISC0-3.1.0-LABORATORY',aegis_target_met:false,production_ready:false};
}};
function fixture(){
  const networkId='ledger512-lab',sender=createSpendIdentity512({networkId});
  const recipient=createSpendIdentity512({networkId});
  const input=createNote512({networkId,ownerTag:sender.owner_tag,value:'100'});
  const output=createNote512({networkId,ownerTag:recipient.owner_tag,value:'90'});
  const initial=noteCommitment512(input),tree=buildNoteTree512({networkId,commitments:[initial]});
  const statement={version:RELATION_VERSION,network_id:networkId,asset_id:'QUEER',
    anchor_root:tree.root,anchor_leaf_count:1,input_commitments:[initial],
    output_commitments:[noteCommitment512(output)],
    nullifiers:[nullifier512({note:input,spendSecret:sender.spend_secret})],
    fee:'10',transaction_binding:'fe'.repeat(64)};
  return {networkId,genesisCommitments:[initial],statement,
    witness:{inputs:[{note:input,spend_secret:sender.spend_secret,membership:tree.proof(0)}],outputs:[output]},
    recipient};
}
const proof=(statement,receipt='TEST_ONLY_VERIFIED')=>({
  scheme:NATIVE512_SCHEME,program_id:PROGRAM,statement_digest:financialStatementDigest512(statement),receipt
});
const ledger=f=>new ExperimentalValueLedger512({networkId:f.networkId,genesisCommitments:f.genesisCommitments,backend});

test('experimental SHA-512 receipt transition conserves verified value and records spends, fees and next root',async()=>{
  const f=fixture(),state=ledger(f);
  assert.equal(checkTransferWitness512({statement:f.statement,witness:f.witness,expected:{
    networkId:f.networkId,anchorRoot:f.statement.anchor_root,anchorLeafCount:1,
    transactionBinding:f.statement.transaction_binding,statementDigest:financialStatementDigest512(f.statement)}}).valid,true);
  const next=await state.applyTransfer({statement:f.statement,proof:proof(f.statement)});
  assert.equal(next.leaf_count,2);assert.equal(next.fees_total,'10');assert.equal(next.spent_inputs,1);
  assert.equal(next.nullifiers_recorded,1);assert.equal(next.accepted_transfers,1);
  assert.equal(next.production_ready,false);assert.notEqual(next.root,f.statement.anchor_root);
  assert.equal(state.inclusionProof(f.statement.output_commitments[0]).leaf_count,2);
  await assert.rejects(state.applyTransfer({statement:f.statement,proof:proof(f.statement)}),/VALUE512_UNKNOWN_OR_SPENT_INPUT/);
});

test('parallel duplicate spends serialize; failed verification does not mutate public state',async()=>{
  const f=fixture(),state=ledger(f),payload={statement:f.statement,proof:proof(f.statement)};
  const results=await Promise.allSettled([state.applyTransfer(payload),state.applyTransfer(payload)]);
  assert.deepEqual(results.map(r=>r.status).sort(),['fulfilled','rejected']);
  assert.equal(state.snapshot.accepted_transfers,1);
  const other=ledger(f);
  await assert.rejects(other.applyTransfer({statement:f.statement,proof:proof(f.statement,'INVALID')}),/VALUE512_PROOF_NOT_VERIFIED/);
  assert.equal(other.snapshot.leaf_count,1);assert.equal(other.snapshot.spent_inputs,0);
  assert.equal(other.snapshot.fees_total,'0');
});

test('reject SHA-256 note commitments, foreign network, unknown anchor and other proof suites',async()=>{
  const f=fixture(),make=()=>ledger(f);
  const variants=[
    x=>x.statement.input_commitments[0]='22'.repeat(32),
    x=>x.statement.output_commitments[0]='33'.repeat(32),
    x=>x.statement.network_id='foreign-network',
    x=>x.statement.anchor_root='00'.repeat(64),
    x=>x.statement.anchor_leaf_count=2,
    x=>x.statement.version='AEGIS-ZK-STARK-V1',
    x=>x.proof.scheme='RISC0-COMPOSITE-STARK-V1',
    x=>x.proof.program_id='cc'.repeat(32),
    x=>x.proof.statement_digest='00'.repeat(64),
    x=>x.proof.extra=true,
  ];
  for(const mutate of variants){
    const payload={statement:structuredClone(f.statement),proof:proof(f.statement)};
    mutate(payload);
    await assert.rejects(make().applyTransfer(payload));
  }
  assert.equal(f.statement.input_commitments[0].length,128);
  assert.throws(()=>new ExperimentalValueLedger512({networkId:f.networkId,genesisCommitments:['ff'.repeat(32)],backend}));
});

test('input snapshot is captured before an async verification starts',async()=>{
  const f=fixture(),state=ledger(f),payload={statement:structuredClone(f.statement),proof:proof(f.statement)};
  const pending=state.applyTransfer(payload);
  payload.statement.network_id='attacker';payload.proof.receipt='INVALID';
  const result=await pending;
  assert.equal(result.accepted_transfers,1);
});

test('a re-bound commitment cannot independently authorize inflated output values',()=>{
  const f=fixture();
  f.witness.outputs[0]={...f.witness.outputs[0],value:'91'};
  f.statement.output_commitments[0]=noteCommitment512(f.witness.outputs[0]);
  const check=checkTransferWitness512({statement:f.statement,witness:f.witness,expected:{
    networkId:f.networkId,anchorRoot:f.statement.anchor_root,anchorLeafCount:1,
    transactionBinding:f.statement.transaction_binding,statementDigest:financialStatementDigest512(f.statement)}});
  assert.equal(check.valid,false); // Relation test, NOT a cryptographic proof test.
});
