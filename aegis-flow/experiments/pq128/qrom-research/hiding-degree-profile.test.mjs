import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveHidingDegreeProfile,matchNativeHidingDegreeReport} from './hiding-degree-profile.mjs';
const options={traceRows:4096,symbolicConstraintDegree:3,constraintFullSelectorDegree:4,airConstraintComponents:20};
test('hiding doubles committed degrees, quotient chunks and includes every FRI round',()=>{
  const p=deriveHidingDegreeProfile(options),g=p.committed_degree_geometry;
  assert.equal(g.quotient_chunks,8);assert.equal(g.quotient_domain_rows,32768);
  assert.equal(g.quotient_recomposed_general_degree_exclusive,36864);
  assert.equal(g.quotient_recomposed_honest_degree_exclusive,32768);
  assert.equal(p.ood.quotient_recomposed_degree_inclusive,36863);
  assert.equal(p.ood.residual_polynomial_degree_inclusive,40959);
  assert.equal(p.fri.rounds.length,13);
  for(let j=0;j<13;j++){
    const r=p.fri.rounds[j];assert.equal(r.index,j);
    assert.equal(r.input_evaluation_rows,65536/2**j);
    assert.equal(r.merkle_leaf_rows,32768/2**j);
    assert.equal(r.fri_advertised_degree_exclusive,8192/2**j);
    assert.equal(r.after_fold_degree_exclusive,4096/2**j);
  }
  assert.equal(p.fri.final_evaluation_rows,8);assert.equal(p.fri.final_polynomial_degree_exclusive,1);
  assert.equal(p.pq128_demonstrated,false);assert.equal(p.low_degree_oracle_extraction_proved,false);
});
function nativeFixture(){
  const p=deriveHidingDegreeProfile(options);
  return {schema:'AEGIS_V4_WIRED_LOGUP_FRI_RBR_PROVEN_IOP_ONLY_V1',trace_rows:4096,
    constraint_degree:3,constraint_full_selector_degree:4,constraints:20,hiding_fri:true,fri_blowup:8,fri_queries:320,
    logup_field_bits_floor:247,plonky3_field16_implemented:false,
    pq128_demonstrated:false,production_ready:false,num_quotient_chunks:8,
    committed_degree_geometry:{...p.committed_degree_geometry,committed_log_degree:13,
      initial_fri_lde_height:p.fri.initial_lde_rows,terminal_evaluation_vector_height:8,
      terminal_polynomial_degree_strict_bound:1,fri_rounds:p.fri.rounds.map(r=>({
        round:r.index,commit_before_fold:true,evaluation_vector_height:r.input_evaluation_rows,
        committed_matrix_height:r.merkle_leaf_rows,matrix_width_extension_values:2,
        verifier_degree_strict_bound:r.fri_advertised_degree_exclusive,
        honest_opening_quotient_degree_strict_bound:r.honest_reduced_degree_exclusive,fold_arity:2}))}};
}
test('old half-size reports, honest-only caps and omitted or changed FRI rounds are rejected',()=>{
  assert.equal(matchNativeHidingDegreeReport(nativeFixture()).native_report_matched,true);
  for(const mutate of [r=>r.num_quotient_chunks/=2,r=>r.committed_degree_geometry.committed_log_degree--,
    r=>r.committed_degree_geometry.quotient_recomposed_general_degree_exclusive=32768,
    r=>r.committed_degree_geometry.fri_rounds.pop(),
    r=>r.committed_degree_geometry.fri_rounds[4].verifier_degree_strict_bound++,
    r=>r.committed_degree_geometry.fri_rounds.reverse(),r=>r.fri_blowup=4,r=>r.plonky3_field16_implemented=true]){
    const report=nativeFixture();mutate(report);assert.throws(()=>matchNativeHidingDegreeReport(report));
  }
});
test('unsupported domains and degrees fail before issuing a profile',()=>{
  for(const changes of [{traceRows:4095},{traceRows:2**24},{symbolicConstraintDegree:0},
    {traceRows:2**23,symbolicConstraintDegree:64,constraintFullSelectorDegree:64},
    {constraintFullSelectorDegree:undefined},{constraintFullSelectorDegree:2},
    {airConstraintComponents:0},{approved:true}])
    assert.throws(()=>deriveHidingDegreeProfile({...options,...changes}));
});
test('actual selector degree is accounted separately from the quotient-sizing heuristic',()=>{
  const p=deriveHidingDegreeProfile(options);
  assert.equal(p.ood.constraint_polynomial_degree_inclusive,4*8191);
  const larger=deriveHidingDegreeProfile({...options,constraintFullSelectorDegree:6});
  assert.equal(larger.committed_degree_geometry.quotient_chunks,8);
  assert.equal(larger.ood.constraint_polynomial_degree_inclusive,6*8191);
  assert.equal(larger.ood.residual_polynomial_degree_inclusive,6*8191);
});

// Independent small-field polynomial identities. They validate the algebraic
// steps; they do not simulate cryptographic hiding or prove PCS extraction.
const P=257n,mod=x=>(x%P+P)%P;
const pow=(x,n)=>{let r=1n;for(;n;n>>=1n,x=mod(x*x))if(n&1n)r=mod(r*x);return r;};
const inv=x=>pow(x,P-2n);
const trim=a=>{while(a.length>1&&a.at(-1)===0n)a.pop();return a;};
const add=(a,b)=>trim(Array.from({length:Math.max(a.length,b.length)},(_,i)=>mod((a[i]??0n)+(b[i]??0n))));
const scale=(a,s)=>trim(a.map(x=>mod(x*s)));
const mul=(a,b)=>{const r=Array(a.length+b.length-1).fill(0n);a.forEach((x,i)=>b.forEach((y,j)=>r[i+j]=mod(r[i+j]+x*y)));return trim(r);};
const ev=(a,x)=>a.reduceRight((r,c)=>mod(r*x+c),0n);
const zero=(n,s)=>[mod(-pow(s,BigInt(n))),...Array(n-1).fill(0n),1n];

test('correlated quotient masks cancel; independent low-degree chunks attain the larger general cap',()=>{
  const n=4;
  for(const c of [2,4,8]){
    const omega=pow(3n,(P-1n)/BigInt(c*n));
    const shifts=Array.from({length:c},(_,i)=>pow(omega,BigInt(i)));
    const zs=shifts.map(s=>zero(n,s));
    const rawQ=Array.from({length:c*n},(_,i)=>BigInt(i+1));
    const selectors=shifts.map((s,i)=>{
      const numerator=zs.filter((_,j)=>j!==i).reduce(mul,[1n]);
      return scale(numerator,inv(ev(numerator,s)));
    });
    const constants=selectors.map(s=>s.at(-1));
    const masks=Array.from({length:c},(_,i)=>i===c-1?[0n]:[BigInt(i+1),2n,3n,1n]);
    for(let i=0;i<c-1;i++)masks[c-1]=add(masks[c-1],scale(masks[i],mod(-constants[i]*inv(constants[c-1]))));
    const chunks=shifts.map((s,i)=>{
      const base=Array(n).fill(0n);
      rawQ.forEach((coefficient,k)=>base[k%n]=mod(base[k%n]+coefficient*pow(s,BigInt(n*Math.floor(k/n)))));
      return add(base,mul(zs[i],masks[i]));
    });
    assert.ok(chunks.every(q=>q.length<=2*n));
    const recomposed=chunks.map((q,i)=>mul(selectors[i],q)).reduce(add,[0n]);
    assert.deepEqual(recomposed,rawQ);
    // Break only the inter-chunk correlation, retaining every chunk's bound.
    const adversarial=chunks.map(q=>[...q]);
    adversarial[c-1]=add(adversarial[c-1],mul(zs[c-1],[0n,0n,0n,1n]));
    assert.ok(adversarial.every(q=>q.length<=2*n));
    const general=adversarial.map((q,i)=>mul(selectors[i],q)).reduce(add,[0n]);
    assert.equal(general.length,(c+1)*n);assert.notDeepEqual(general,rawQ);
  }
});
test('every binary FRI fold agrees with the evaluation identity and ends at a constant',()=>{
  let polynomial=Array.from({length:8},(_,i)=>BigInt(i+1));
  let domainRows=64,advertisedCap=8;
  for(const beta of [5n,9n,11n]){
    const omega=pow(3n,(P-1n)/BigInt(domainRows));
    const folded=trim(Array.from({length:Math.ceil(polynomial.length/2)},(_,i)=>
      mod((polynomial[2*i]??0n)+beta*(polynomial[2*i+1]??0n))));
    for(let i=0;i<domainRows/2;i++){
      const x=pow(omega,BigInt(i)),left=ev(polynomial,x),right=ev(polynomial,mod(-x));
      const byPair=mod((left+right)*inv(2n)+beta*(left-right)*inv(2n*x));
      assert.equal(ev(folded,mod(x*x)),byPair);
    }
    advertisedCap=Math.ceil(advertisedCap/2);assert.ok(folded.length<=advertisedCap);
    polynomial=folded;domainRows/=2;
  }
  assert.equal(polynomial.length,1);assert.equal(domainRows,8);
});
