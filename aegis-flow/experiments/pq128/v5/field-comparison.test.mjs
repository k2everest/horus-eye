import test from 'node:test';
import assert from 'node:assert/strict';
import {compareFieldProfiles} from './field-comparison.mjs';
test('v0.8.0 supported options fail 336-bit worst-case LogUp RBR target, 16 candidate has margin',()=>{
 const c=compareFieldProfiles();
 const old=c.profiles.filter(x=>x.native_plonky3_extension_available);
 assert.equal(old.length,5);
 assert.ok(old.every(x=>x.margin_over_target_bits<0));
 const selected=c.profiles.find(x=>x.name==='babybear16-candidate');
 assert.equal(selected.candidate_irreducibility_certified,true);
 assert.ok(selected.margin_over_target_bits>100);
 assert.equal(selected.native_plonky3_extension_available,false);
 assert.equal(c.pcs_compatibility_proved,false);
 assert.equal(c.production_ready,false);
 assert.throws(()=>compareFieldProfiles({algebraicRbrTargetBits:0}));
});
