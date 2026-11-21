import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {analyzeQuantitatively} from './analysis.mjs';
const REGISTRY=fileURLToPath(new URL('../../../../work/cargo/registry/src/index.crates.io-1949cf8c6b5b557f',import.meta.url));
const script=new URL('./demo.mjs',import.meta.url).pathname;

test('conditional arithmetic never supplies absent full-protocol soundness, knowledge or privacy',()=>{
  const r=analyzeQuantitatively();
  assert.equal(r.source_profile_verified,false);
  assert.equal(r.conditional_cms_requirements.hypothetical_hash512.conditional_inequality_holds,true);
  assert.equal(r.conditional_cms_requirements.hypothetical_hash256.conditional_inequality_holds,false);
  assert.equal(r.conditional_cms_requirements.standalone_fri_candidate_lifetime_only.conditional_inequality_holds,false);
  assert.equal(r.conditional_cms_requirements.accepted_engine.conditional_failure_upper_bound,null);
  assert.equal(r.aggregation.status,'unavailable');
  for(const game of r.separate_security_games)assert.equal(game.applicable_upper_bound,null);
  const binding=r.conditional_value_binding;
  assert.equal(binding.legacy_256.fits_query_budget,true);assert.equal(binding.expanded_512.fits_query_budget,false);
  assert.equal(binding.actual_sha256_collision_found,false);assert.equal(binding.actual_inflation_executed,false);
  assert.equal(binding.experimental512_ideal_upper_bound.conditional_bound_at_most_half,true);
  assert.equal(binding.experimental512_ideal_upper_bound.aegis_target_met,false);
  assert.equal(r.demonstrated_post_quantum_bits,null);assert.equal(r.aegis_target_met,false);assert.equal(r.production_ready,false);
});

test('missing new analysis sources cannot be promoted by the diagnostic or by a passing formula',()=>{
  const dir=mkdtempSync(join(tmpdir(),'aegis-quantitative-'));
  try{
    const r=analyzeQuantitatively({sourceRoot:dir});assert.equal(r.source_profile_verified,false);
    assert.ok(r.additional_source_inventory.checks.some(c=>c.status==='unavailable'));
    const noSources=spawnSync(process.execPath,[script,'--require-sources'],{encoding:'utf8'});
    assert.equal(noSources.status,1);
    const gated=spawnSync(process.execPath,[script,'--require-aegis'],{encoding:'utf8'});
    assert.equal(gated.status,1);assert.equal(JSON.parse(gated.stdout).aegis_target_met,false);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('installed analysis sources match while the PQ128 decision remains negative',{
  skip:!existsSync(join(REGISTRY,'risc0-zkvm-3.1.0/src/receipt.rs')),
},()=>{
  const r=analyzeQuantitatively({sourceRoot:REGISTRY});
  assert.equal(r.source_profile_verified,true,JSON.stringify(r.additional_source_inventory.checks));
  assert.equal(r.decision,'complete-protocol-pq128-not-demonstrated');
  assert.equal(r.aegis_target_met,false);
  const run=spawnSync(process.execPath,[script,'--source-root',REGISTRY,'--require-sources','--require-aegis'],{encoding:'utf8'});
  assert.equal(run.status,1);assert.equal(JSON.parse(run.stdout).source_profile_verified,true);
});
