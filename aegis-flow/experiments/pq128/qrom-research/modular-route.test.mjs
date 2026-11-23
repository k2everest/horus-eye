import test from 'node:test';
import assert from 'node:assert/strict';
import {assessModularQromRoute} from './modular-route.mjs';

test('BabyBear degree 8 fails the G1 LogUp necessary screen', () => {
  const result = assessModularQromRoute();
  assert.equal(result.logup_only.g1_unit_prefactor, false);
  assert.equal(result.pq128_demonstrated, false);
});
test('degree 16 passes the LogUp-only screen but never proves PQ128', () => {
  const result = assessModularQromRoute({extensionDegree:16});
  assert.equal(result.logup_only.g2_unit_prefactor, true);
  assert.equal(result.pq128_demonstrated, false);
  assert.equal(result.production_ready, false);
});
test('512-bit Merkle is sufficient for G1 only under illustrative Q^3 model', () => {
  const result = assessModularQromRoute({extensionDegree:16});
  assert.equal(result.merkle_only.g1_unit_prefactor, true);
  assert.equal(result.merkle_only.g2_unit_prefactor, false);
});
test('576-bit ideal Merkle subterm can meet G2 in this screen, not PQ128', () => {
  const result = assessModularQromRoute({extensionDegree:16,merkleDigestBits:576});
  assert.equal(result.sum_of_these_two_subterms_only.g2_unit_prefactor, true);
  assert.equal(result.theorem_constants_verified, false);
});
test('rounds remain an explicit unknown rather than silently proved zero', () => {
  const x = assessModularQromRoute();
  const y = assessModularQromRoute({rounds:4});
  assert.equal(x.k_assumed_zero_for_optimistic_screen,true);
  assert.equal(y.k_assumed_zero_for_optimistic_screen,false);
});
test('reports with missing required RBR terms fail closed', () => {
  assert.throws(() => assessModularQromRoute({wiredRbrReport:{schema:'forged'}}));
});
test('use worst of both reported regimes instead of optimistic Math.max', () => {
  const terms = strength => ['air-composition','deep-ali','low-degree-test',
    'logup-fingerprint','batch-combination'].map(label=>({label,bits:strength}));
  const x=assessModularQromRoute({wiredRbrReport:{
    schema:'AEGIS_V4_WIRED_LOGUP_FRI_RBR_PROVEN_IOP_ONLY_V1',
    rbr_report_is_for_actual_compiled_wired_air:true,
    qrom_fiat_shamir_reduction_proved:false,
    rbr_breakdown:{udr:{regime:'UDR',terms:terms(340)},
      ldr:{regime:'LDR',terms:terms(230)}},
  }});
  assert.ok(x.actual_wired_rbr_observation.conservative_algebraic_bits < 230);
  assert.equal(x.pq128_demonstrated,false);
});