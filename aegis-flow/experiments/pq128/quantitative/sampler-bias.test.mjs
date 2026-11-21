import test from 'node:test';
import assert from 'node:assert/strict';
import {firstNonzeroResidueBias,idealRisc0SamplerBias} from './sampler-bias.mjs';

test('the counting identity matches exhaustive distributions of small independent ranges',()=>{
  for(const [p,draws,bits] of [[17,2,2],[5,3,2],[3,4,1]]){
    const m=2**bits,counts=Array(m).fill(0),total=p**draws;
    for(let tuple=0;tuple<total;tuple++){
      let encoded=tuple,value=0;
      for(let i=0;i<draws;i++){const cell=encoded%p;encoded=Math.floor(encoded/p);if(value===0)value=cell;}
      counts[value&(m-1)]++;
    }
    const deviation=counts.reduce((sum,n)=>sum+Math.abs(n*m-total),0);
    const expected=firstNonzeroResidueBias({prime:BigInt(p),draws,bits});
    assert.equal(BigInt(expected.numerator)*BigInt(2*m*total),BigInt(expected.denominator)*BigInt(deviation));
  }
});

test('the pinned ideal sampler uses four draws and a separate classical union bound',()=>{
  const r=idealRisc0SamplerBias({receipts:1n<<32n});
  const p=2013265921n,m=1n<<26n,n=BigInt(r.per_query_total_variation.numerator),d=BigInt(r.per_query_total_variation.denominator);
  assert.equal(n*m*p**4n,d*(m-1n));
  const samples=50n*64n*(1n<<32n);
  assert.equal(r.parameters.samples,samples.toString());
  const union=r.classical_iid_union_total_variation_upper_bound;
  assert.equal(BigInt(union.numerator)*d,BigInt(union.denominator)*n*samples);
  assert.equal(r.demonstrated_post_quantum_bits,null);assert.equal(r.aegis_target_met,false);
});

test('zero samples and saturated unions do not manufacture a quantum claim',()=>{
  assert.deepEqual(idealRisc0SamplerBias({queries:0n}).classical_iid_union_total_variation_upper_bound,{numerator:'0',denominator:'1'});
  const r=idealRisc0SamplerBias({queries:1n<<256n});
  assert.deepEqual(r.classical_iid_union_total_variation_upper_bound,{numerator:'1',denominator:'1'});
  assert.equal(r.aegis_target_met,false);assert.equal(r.production_ready,false);
});

test('malformed counts and invalid residue ranges fail before calculation',()=>{
  for(const options of [{queryBits:0},{queryBits:28},{queryBits:NaN},{queryBits:1.5},{queries:1},{queries:-1n},{receipts:1n<<4096n}]){
    assert.throws(()=>idealRisc0SamplerBias(options));
  }
  for(const options of [{prime:18n,draws:2,bits:2},{prime:1n,draws:2,bits:1},{prime:17n,draws:0,bits:2}]){
    assert.throws(()=>firstNonzeroResidueBias(options));
  }
});
