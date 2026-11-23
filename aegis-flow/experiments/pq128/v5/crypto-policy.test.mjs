import test from 'node:test';
import assert from 'node:assert/strict';
import {QUEER_V5_SUITE,assessV5AlgorithmPolicy} from './crypto-policy.mjs';
const good=()=>({suite:QUEER_V5_SUITE.id,signature:'ML-DSA-87',
  kem:'ML-KEM-1024',networkId:'QUEER_MAIN',programId:'ab'.repeat(64),
  domainTag:QUEER_V5_SUITE.signature_domain});
test('category5 PQ primitives selected without implying STARK qualification',()=>{
 const a=assessV5AlgorithmPolicy(good());
 assert.equal(a.algorithm_policy_admissible_in_laboratory,true);
 assert.equal(a.complete_PQ128_soundness,false);
 assert.equal(a.consensus_admission_allowed,false);
 assert.equal(a.production_ready,false);
});
test('reject mixed suites, replay domains, smaller algorithms and V2 downgrades',()=>{
 for(const bad of [
  {signature:'ML-DSA-65'},{kem:'ML-KEM-768'},{suite:'AEGIS-PQC-V1'},
  {domainTag:'SIG_TX_V1'},{networkId:'invalid network'},{programId:'11'},
 ]){
  const r=assessV5AlgorithmPolicy({...good(),...bad});
  assert.equal(r.algorithm_policy_admissible_in_laboratory,false);
  assert.equal(r.consensus_admission_allowed,false);
 }
});
