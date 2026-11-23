// Fail-closed, research-only audit of the quantitative PQ128 report.
// This module MUST NOT be imported by consensus admission or wallet validation.
// A passing experimental formula is never treated as a protocol qualification.
const REQUIRED_GAMES=['soundness','knowledge','privacy'];
// This inventory is tied to the accepted-engine report schema. A different
// backend needs its own reviewed inventory, not an empty/vacuous applicability
// list. These names match analysis.mjs; no theorem is established by a label.
const REQUIRED_THEOREMS=['lookup/constraints/DEEP/ALI','FRI','Fiat-Shamir','hashes','lifetime union'];
function isBound(x){
  if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).sort().join(',')!=='denominator,numerator')return false;
  const {numerator,denominator}=x;
  const decimal=s=>typeof s==='string'&&s.length<=1500&&/^(0|[1-9][0-9]*)$/.test(s);
  if(!decimal(numerator)||!decimal(denominator))return false;
  const n=BigInt(numerator),d=BigInt(denominator);
  if(d===0n||n>d)return false;
  let a=n,b=d;while(b)[a,b]=[b,a%b];
  return a===1n;
}
function completeTheoremInventory(items){
  return Array.isArray(items)&&items.length===REQUIRED_THEOREMS.length&&
    new Set(items.map(x=>x?.component)).size===REQUIRED_THEOREMS.length&&
    items.every(x=>x&&typeof x==='object'&&!Array.isArray(x)&&
      Object.keys(x).sort().join(',')==='component,reason,status'&&
      REQUIRED_THEOREMS.includes(x.component)&&x.status==='proved-for-accepted-engine'&&
      typeof x.reason==='string'&&x.reason.trim().length>0&&x.reason.length<=12000);
}
export function auditPq128Evidence(report){
  if(!report||report.schema!=='AEGIS_PQ128_QUANTITATIVE_RESEARCH_V1')throw new TypeError('quantitative Aegis report required');
  const games=report.separate_security_games;
  if(!Array.isArray(games)||games.length!==3||new Set(games.map(g=>g.id)).size!==3||
    !REQUIRED_GAMES.every(id=>games.some(g=>g.id===id)))throw new TypeError('three separate security games required');
  const findings=[];
  const missing=(id,reason)=>findings.push({id,status:'unproved',reason});
  if(report.source_profile_verified!==true)missing('source-identity','Pinned SDK and research inputs not all verified');
  if(report.accepted_engine?.fri_queries!==50)missing('protocol-parameters','Expected FRI query profile not verified');
  const legacy=report.conditional_value_binding?.legacy_256;
  if(!legacy||legacy.fits_query_budget!==false)
    missing('legacy-value-binding','A 256-bit legacy cross-value claw construction is not ruled out under the research query budget');
  if(!isBound(report.aggregation?.demonstrated_soundness_bound)||!isBound(games.find(g=>g.id==='soundness')?.applicable_upper_bound))
    missing('soundness','No applicable full-receipt quantum soundness bound');
  if(!isBound(report.aggregation?.demonstrated_knowledge_bound)||!isBound(games.find(g=>g.id==='knowledge')?.applicable_upper_bound))
    missing('knowledge','No quantum extractor for the joint financial witness across segments');
  if(!isBound(report.aggregation?.demonstrated_privacy_bound)||!isBound(games.find(g=>g.id==='privacy')?.applicable_upper_bound))
    missing('privacy','No full composite receipt simulator with declared leakage');
  if(!completeTheoremInventory(report.theorem_applicability))
    missing('qrom-composition','No complete applicable SDK/Fiat-Shamir/QROM and adaptive composition argument');
  if(!Number.isSafeInteger(report.demonstrated_post_quantum_bits)||report.demonstrated_post_quantum_bits<128)
    missing('quantitative-target','No demonstrated end-to-end quantum security strength');
  // This is an evidence inventory, NOT an independent verifier of purported
  // mathematical proofs. It never turns manually edited claims into approval.
  return Object.freeze({
    schema:'AEGIS_PQ128_EVIDENCE_AUDIT_V1',
    audited_report_schema:report.schema,
    scope:'research-evidence-triage-only',
    status:'HOLD_NO_GO',
    production_ready:false,
    aegis_target_met:false,
    findings,
    rules:'Evidence strings or numeric fields cannot authorize production; independent theorem review and a separate consensus policy change remain mandatory.',
  });
}
