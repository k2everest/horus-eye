import test from 'node:test';
import assert from 'node:assert/strict';
import {v5ReleaseReadiness} from './release-readiness.mjs';
test('no commercial release while QROM, PoK, ZK and external audit remain unresolved',()=>{
 const r=v5ReleaseReadiness();
 assert.equal(r.conditions.candidate_extension_math_checked,true);
 assert.equal(r.conditions.candidate_extension_native_and_pcs_qualified,false);
 assert.equal(r.conditions.BCS_qrom_theorem_with_concrete_constants_proved,false);
 assert.equal(r.conditions.independent_external_crypto_audit_signed_and_verified,false);
 assert.equal(r.commercial_release_allowed,false);
 assert.equal(r.mainnet_financial_activation_allowed,false);
 assert.ok(r.pending.length>=10);
});
