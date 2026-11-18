import test from 'node:test';
import assert from 'node:assert/strict';
import {BranchState} from './state.mjs';
import {merkleRoot,verifyInclusionProof} from '../../libs/crypto-core/merkle-proof.mjs';
import {createPrivateNote,noteCommitmentV2} from '../../libs/crypto-core/shielded-note-v2.mjs';

test('local branch caches preserve independent rewards, roots, maturity and inclusion paths', async () => {
  const config={schema:'AEGIS_OPEN_POW_V2',network_id:'frontier-test',program_id:'42'.repeat(32),genesis_time_ms:0,
    pow_limit:'00'+'ff'.repeat(31),target_spacing_ms:60000,retarget_interval:64,confirmations:2,coinbase_maturity:2,anchor_window:64,
    monetary:{asset_id:'TEST',base_reward:7,max_supply:'700'}};
  const backend={programId:config.program_id,verify:async()=>{throw Error('NO_TRANSACTION_EXPECTED');}};
  const note=()=>createPrivateNote({ownerTag:'03'.repeat(32),value:7,assetId:'TEST'});
  const state=new BranchState(config,backend), first=note();
  await state.applyBody({transaction:null,reward:first},1);
  const snapshot=state.snapshot(), fork=new BranchState(config,backend,snapshot);
  const second=note(), other=note();
  await state.applyBody({transaction:null,reward:second},2);
  await fork.applyBody({transaction:null,reward:other},2);
  assert.equal(state.noteRoot,merkleRoot([first,second].map(noteCommitmentV2)));
  assert.equal(fork.noteRoot,merkleRoot([first,other].map(noteCommitmentV2)));
  assert.equal(snapshot.commitments.length,1);
  assert.equal(state.isMature(noteCommitmentV2(first),2),false);
  assert.equal(state.isMature(noteCommitmentV2(first),3),true);
  const witness=fork.ledger.inclusionProof({commitment:noteCommitmentV2(other)});
  assert.equal(verifyInclusionProof({proof:witness.proof,trustedRoot:fork.noteRoot}),true);
  assert.equal(verifyInclusionProof({proof:witness.proof,trustedRoot:state.noteRoot}),false);
  const legacy=structuredClone(snapshot); delete legacy.merkle;
  assert.equal(new BranchState(config,backend,legacy).noteRoot,merkleRoot([noteCommitmentV2(first)]));
  snapshot.merkle={count:0,frontier:[]};
  assert.throws(()=>new BranchState(config,backend,snapshot),/FRONTIER_COUNT_MISMATCH/);
});
