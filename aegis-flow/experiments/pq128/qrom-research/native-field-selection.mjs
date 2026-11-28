// Research-only, conservative field-selection evidence for pinned
// Plonky3 v0.8.0. Field size is a necessary challenge-space
// condition, NEVER a proof of IOP soundness or quantum knowledge.
const B=2013265921;
const K=2130706433;
const G=18446744069414584321n;
const int=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
const nbits=x=>Math.log2(Number(x));
const candidates=Object.freeze([
  {id:'babybear8',label:'BabyBear^8',base:B,degree:8,nativeExtension:true,
    traceFieldCompatible:true,migrationRequired:false,
    extensionGeneratorFullyCertified:true,source:'p3-baby-bear v0.8.0'},
  {id:'koalabear8',label:'KoalaBear^8',base:K,degree:8,nativeExtension:true,
    traceFieldCompatible:false,migrationRequired:true,
    extensionGeneratorFullyCertified:true,source:'p3-koala-bear v0.8.0'},
  {id:'goldilocks5',label:'Goldilocks^5',base:G,degree:5,nativeExtension:true,
    traceFieldCompatible:false,migrationRequired:true,
    extensionGeneratorFullyCertified:true,source:'p3-goldilocks v0.8.0'},
  {id:'babybear16',label:'BabyBear^16 candidate',base:B,degree:16,
    nativeExtension:false,
    // The test-only Monty-31 spike has its OWN base field Rust type.
    // It does not implement the project WiredAir's BabyBear type.
    p3_generic_extension_test_spike:true,
    traceFieldCompatible:false,migrationRequired:true,
    extensionGeneratorFullyCertified:false,
    source:'research-only p3-monty-31 field16 spike, PR #6'},
]);
export function evaluateNativeFieldChoices({
  targetBits=128,quantumOracleQueryBits=64,
  globalConservativeMarginBits=80
}={}){
  if(!int(targetBits,1,512)||!int(quantumOracleQueryBits,0,256)||
     !int(globalConservativeMarginBits,0,256))
     throw new TypeError('INVALID_FIELD_SELECTION_PARAMETERS');
  const target=targetBits+2*quantumOracleQueryBits+globalConservativeMarginBits;
  const rows=candidates.map(v=>{
    const bits=nbits(v.base)*v.degree;
    return Object.freeze({
      id:v.id,label:v.label,capacityBits:bits,
      nativeExtensionInPinnedPlonky3:v.nativeExtension,
      matchesCurrentWiredAirBaseType:v.traceFieldCompatible,
      missingFullMultiplicativeGeneratorProof:
        !v.extensionGeneratorFullyCertified,
      arithmeticCapacityClearsConservativeTarget:bits>=target,
      hasNativePq128RbrKnowledgeProof:false,
      hasNativeQromCommitmentExtractor:false,
      hasFullFinancialWitnessExtractor:false,
      pq128_certified:false,
      source:v.source,
    });
  });
  const suggested=rows.find(v=>v.id==='babybear16');
  return Object.freeze({
    schema:'AEGIS_PQ128_FIELD_SELECTION_STRICT_V1',
    targetPostQuantumBits:targetBits,
    quantumQueryBudgetExponent:quantumOracleQueryBits,
    conservativeAssumedLossReserveBits:globalConservativeMarginBits,
    necessaryInteractiveTargetBits:target,
    testedCandidate:suggested,
    options:Object.freeze(rows),
    why_not_goldilocks5:
      'Goldilocks^5 native has only ~320 bits, below the 336-bit research reserve; also requires replacing the 31-bit base AIR.',
    selectedResearchPath:'babybear16',
    // A successful native base field spike is not a PCS or a
    // collapsing commitment/QROM knowledge theorem.
    native_babybear16_replaces_current_pcs:false,
    post_quantum_knowledge_soundness_demonstrated:false,
    pq128_certified:false,
    production_ready:false,
    release_gate:'HOLD_NO_GO'
  });
}
