import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateNativeFieldChoices} from './native-field-selection.mjs';
test('the conservative 336-bit target rejects all currently native extension fields',()=>{
 const result=evaluateNativeFieldChoices();
 assert.equal(result.necessaryInteractiveTargetBits,336);
 assert.equal(result.selectedResearchPath,'babybear16');
 for(const v of result.options.filter(v=>v.nativeExtensionInPinnedPlonky3)){
   assert.equal(v.arithmeticCapacityClearsConservativeTarget,false);
   assert.equal(v.pq128_certified,false);
 }
 assert.ok(result.options.find(v=>v.id==='goldilocks5').capacityBits>=319);
});
test('degree16 clears field capacity but remains isolated from real WiredAir/PCS',()=>{
 const x=evaluateNativeFieldChoices();
 const bb=x.options.find(v=>v.id==='babybear16');
 assert.ok(bb.capacityBits>494&&bb.capacityBits<495);
 assert.equal(bb.arithmeticCapacityClearsConservativeTarget,true);
 assert.equal(bb.nativeExtensionInPinnedPlonky3,false);
 assert.equal(bb.matchesCurrentWiredAirBaseType,false);
 assert.equal(bb.missingFullMultiplicativeGeneratorProof,true);
 assert.equal(x.native_babybear16_replaces_current_pcs,false);
 assert.equal(x.pq128_certified,false);
 assert.equal(x.release_gate,'HOLD_NO_GO');
});
test('lowering a research reserve can make Goldilocks5 pass capacity, not quantum knowledge',()=>{
 const x=evaluateNativeFieldChoices({globalConservativeMarginBits:40});
 const g=x.options.find(v=>v.id==='goldilocks5');
 assert.equal(x.necessaryInteractiveTargetBits,296);
 assert.equal(g.arithmeticCapacityClearsConservativeTarget,true);
 assert.equal(g.hasNativeQromCommitmentExtractor,false);
 assert.equal(g.pq128_certified,false);
});
test('field analysis refuses impossible target inputs',()=>{
 for(const opts of [{targetBits:0},{quantumOracleQueryBits:-1},
   {globalConservativeMarginBits:-1},
   {globalConservativeMarginBits:Infinity}]){
    assert.throws(()=>evaluateNativeFieldChoices(opts),/INVALID_FIELD_SELECTION/);
 }
});
