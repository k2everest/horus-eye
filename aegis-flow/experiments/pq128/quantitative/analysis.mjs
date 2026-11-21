// Research accounting, never an admission path or a parameter-approval API.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {reviewStarkSecurity,securityProfile} from '../../../services/proof-engine/security-review.mjs';
import {deriveConditionalCmsBudget,evaluateConditionalCmsBound} from './budget.mjs';
import {idealClawBound} from './claw-bound.mjs';
import {idealCollisionBound} from './ideal-collision-bound.mjs';
import {modelCompositeSoundness} from './receipt-soundness.mjs';
import {idealRisc0SamplerBias} from './sampler-bias.mjs';
import {screenStandaloneFri} from '../fri-qrom-bound.mjs';

const ROOT=fileURLToPath(new URL('../../../../',import.meta.url));
const inventory=JSON.parse(readFileSync(new URL('./source-inventory.json',import.meta.url),'utf8'));
const literature=JSON.parse(readFileSync(new URL('./literature.json',import.meta.url),'utf8'));
function inspectSources(sourceRoot){
  const checks=[];
  const check=(root,files,upstream)=>{
    for(const [file,expected] of Object.entries(files)){
      let actual=null,status='not-checked';
      if(!upstream||sourceRoot){
        try{actual=createHash('sha256').update(readFileSync(join(root,file))).digest('hex');status=actual===expected?'match':'mismatch';}
        catch{status='unavailable';}
      }
      checks.push({file,expected_sha256:expected,actual_sha256:actual,status});
    }
  };
  check(ROOT,inventory.repository_sha256,false);check(sourceRoot,inventory.upstream_source_sha256,true);
  return {all_checked_and_matching:checks.every(c=>c.status==='match'),checks,
    scope:'Internal source inventory only; no source/binary attestation or external review.'};
}

export function analyzeQuantitatively({sourceRoot}={}){
  const engine=reviewStarkSecurity({sourceRoot}),sources=inspectSources(sourceRoot);
  const lifetime=deriveConditionalCmsBudget(),single=deriveConditionalCmsBudget({receipts:1n});
  const scenario=lifetime.scenario,Q=BigInt(scenario.oracle_queries_global),H=BigInt(scenario.receipts);
  const legacy=idealClawBound({outputBits:256,tableBits:86,queryBudget:Q});
  const expanded=idealClawBound({outputBits:512,tableBits:172,queryBudget:Q});
  const exampleError={numerator:'1',denominator:(1n<<301n).toString()};
  const reference=screenStandaloneFri({instances:1,adversaryQueries:Q,
    verificationHashCalls:BigInt(scenario.global_expansion_query_allowance),expandedPairs:BigInt(scenario.global_expanded_pair_allowance)});
  const p=BigInt(securityProfile.parameters.field_prime);
  return {
    schema:'AEGIS_PQ128_QUANTITATIVE_RESEARCH_V1',
    decision:'complete-protocol-pq128-not-demonstrated',
    source_profile_verified:engine.quantum_qualification.source_profile_verified&&sources.all_checked_and_matching,
    additional_source_inventory:sources,
    whole_receipt_literature:structuredClone(literature),
    accepted_engine:{program_id:engine.program_id,sdk:engine.parameters.sdk,hash:engine.parameters.hash,
      fri_queries:engine.parameters.fri_queries,extension_degree:engine.parameters.extension_degree,
      max_segments:engine.parameters.max_segments,poseidon_output_cardinality_upper_bound:(p**BigInt(engine.parameters.poseidon_output_elements)).toString(),
      cardinality_scope:'Eight field elements give at most p^8 outputs; this is not an entropy measurement or a concrete Poseidon2 security bound.'},
    proposed_resource_scenario:{status:'explicit-research-assumptions-not-network-policy',
      oracle_queries_global:Q.toString(),classical_table_entry_allowance:Q.toString(),
      elementary_gate_bound:null,coherent_lookup_cost_bound:null,hardware_runtime_bound:null,
      assumption:'Quantum superposition hash queries and coherent table membership are permitted; oracle-query complexity is kept separate from physical resources.',
      receipts:H.toString(),segments_per_receipt:scenario.segments_per_receipt,
      measured_expansion_queries:null,measured_expanded_pairs:null,
      target:'Success probability at most 1/2 for soundness; knowledge needs its own extraction guarantee. Privacy uses |Pr[D(real)=1]-Pr[D(sim)=1]|, a gap in [0,1], with proposed ceiling 1/2. Not 2^-128 residual probability.'},
    conditional_cms_requirements:{per_receipt:single,lifetime,
      hypothetical_error_not_evidence:exampleError,
      hypothetical_hash512:evaluateConditionalCmsBound({budget:lifetime,roundByRoundError:exampleError,hashBits:512}),
      hypothetical_hash256:evaluateConditionalCmsBound({budget:lifetime,roundByRoundError:exampleError,hashBits:256}),
      standalone_fri_candidate_lifetime_only:evaluateConditionalCmsBound({budget:lifetime,roundByRoundError:reference.round_by_round_error.maximum,hashBits:512}),
      accepted_engine:evaluateConditionalCmsBound({budget:lifetime,roundByRoundError:null,hashBits:256})},
    conditional_composite_soundness:modelCompositeSoundness({maxSegments:engine.parameters.max_segments,receipts:H,oracleQueries:Q}),
    conditional_value_binding:{
      game:'Choose a secret/owner and two distinct values; find two randomness strings that open the same note commitment.',
      legacy_256:legacy,expanded_512:expanded,
      experimental512_ideal_upper_bound:idealCollisionBound({outputBits:512,adversaryQueries:Q,candidatePairs:4n*H}),
      opening_pair_inventory:'At most four input-opening comparisons per proposed receipt; 4*H candidates, separate from the 64*H segment count. This is a bound on candidate output pairs in the ideal hash game, not a receipt-composition theorem.',
      implication:'If a cross-value claw is obtained for the legacy commitment, its smaller-value opening can create a legitimate output and its larger-value opening can later satisfy the input relation. Commitment, membership and nullifier stay the same; the STARK need not be forged. This implication is conditional on obtaining the claw.',
      limitation:'The finite lower bound concerns independent ideal random functions and uncharged coherent lookup. No concrete SHA-256 collision, inflated transaction, or gate/time bound has been demonstrated. Failure of this particular construction to fit the 512-bit budget proves no lower bound against other attacks.',
      actual_sha256_collision_found:false,actual_inflation_executed:false,
      legacy_table_within_proposed_entry_allowance:BigInt(legacy.memory_entries)<=Q,
      expanded_table_within_proposed_entry_allowance:BigInt(expanded.memory_entries)<=Q},
    conditional_sampler_distance:idealRisc0SamplerBias({queryBits:engine.parameters.sdk_max_segment_po2+2,
      queries:BigInt(engine.parameters.fri_queries),segments:BigInt(engine.parameters.max_segments),receipts:H}),
    theorem_applicability:[
      {component:'lookup/constraints/DEEP/ALI',status:'unproved',reason:'Upstream global toy/proven error is not a demonstrated round-by-round error for the compiled IOP.'},
      {component:'FRI',status:'no-sdk-qrom-instantiation',reason:'The BGKTTZ23 route analyzed here uses binary folding and a final constant. The official RISC Zero IOP draft covers fold16/final256, but does not supply a full Poseidon2 receipt QROM/ZK instantiation. Power-of-one-scalar batching needs its applicable bound.'},
      {component:'Fiat-Shamir',status:'unproved-equivalence',reason:'Stateful Poseidon2 sponge mixing is not shown equivalent to CMS19 BCS or the newer DSFS/QRPM constructions. Recent compiler theorems exist, but their IOP, codec, extraction and privacy hypotheses remain uninstantiated for this SDK.'},
      {component:'hashes',status:'unproved-instantiation',reason:'SHA-512 in the experimental financial guest does not replace internal Poseidon2 or the SHA-256 journal/image binding. Fixed-target image integrity differs from chosen-message journal/commitment binding.'},
      {component:'lifetime union',status:'conditional-only',reason:'Each per-instance bound must hold conditional on adaptive prior history. Fixed-statement soundness alone does not establish this.'},
    ],
    separate_security_games:[
      {id:'soundness',claim:'Reject false public relations at the stated global query budget, including accepted segment/composite composition.',
        applicable_upper_bound:null,missing:'Applicable compiled-IOP RBR or soundness theorem, Fiat-Shamir reduction, oracle instantiation and adaptive composition.'},
      {id:'knowledge',claim:'A resource-bounded quantum extractor obtains one valid common witness of secret, notes, hashes, values and membership from an accepting prover.',
        applicable_upper_bound:null,extractor_runtime_bound:null,
        extractor_access:'Quantum black-box access to the adversarial prover and the theorem oracle model; not just a published receipt. Public replay/forwarding does not demonstrate possession of the witness.',
        missing:'A compiled-IOP extractor, its threshold/runtime, correct compiler and vector-commitment assumptions, joint extraction of all segments with consistent states, and trace-to-financial-witness refinement.'},
      {id:'privacy',claim:'A quantum simulator from the public statement and a narrowly declared execution-leakage function produces an indistinguishable proof view.',
        applicable_upper_bound:null,simulator_runtime_bound:null,
        advantage_definition:'|Pr[D(real proof view)=1]-Pr[D(simulated view)=1]|, ranging from zero to one.',
        proposed_leakage:['segment count/order','per-segment po2','seal lengths','authorized exit status'],
        excluded_from_leakage:['witness','private values/secrets','the receipt itself','unrestricted hashes of private memory'],
        state_hiding_obligation:{status:'unproved',source:'risc0-zkvm-3.1.0/src/guest/env/mod.rs',
          initialized_memory_entropy_bytes:16,
          scope:'Static source observation only. Entropy size is not a demonstrated quantum security level or a completed privacy attack.',
          requirement:'The simulator must account for observable state fields and their hiding. Adding private-memory hashes to permitted leakage without analysis would weaken the claim.'},
        missing:'Leakage completeness and a simulator/ZK theorem for this protocol with adaptive auxiliary input and repeated proofs. Timing, I/O and a prover that sees the witness need separate trust models.'},
    ],
    aggregation:{status:'unavailable',reason:'Unknown or inapplicable component bounds remain null; knowledge and privacy are separate games, not zero terms in a soundness sum.',
      demonstrated_soundness_bound:null,demonstrated_knowledge_bound:null,demonstrated_privacy_bound:null},
    demonstrated_post_quantum_bits:null,aegis_target_met:false,production_ready:false,
  };
}
