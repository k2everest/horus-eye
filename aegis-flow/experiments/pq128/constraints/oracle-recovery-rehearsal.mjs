// Runs a complete, synthetic financial-relation recovery with full private row
// access. Public metadata deliberately excludes witnesses and oracle digests.
import {inspect,isDeepStrictEqual} from 'node:util';
import {native512Fixture,expectedNative512Statement} from '../native/fixtures.mjs';
import {financialStatementDigest512,checkTransferWitness512} from '../financial/relation.mjs';
import {compileTransferConstraints512,assignTransferConstraints512,recoverTransferWitnessFromOracles} from './transfer.mjs';
import {privateRowOracle} from './private-row-oracle.mjs';

function requireTrue(value){if(!value)throw new Error('PRIVATE_FINANCIAL_REHEARSAL_FAILED');}
function rejected(fn){try{fn();return false;}catch{return true;}}

export function runFinancialOracleRehearsal({maxSegments=8192}={}){
  const start=performance.now(),rss=[process.memoryUsage().rss];
  const {statement,witness:expectedWitness}=native512Fixture({leafCount:1});
  const relation=compileTransferConstraints512({statement,expectedStatementDigest:financialStatementDigest512(statement)});
  const assignment=assignTransferConstraints512(relation,expectedWitness);
  const source=privateRowOracle(relation.circuit,assignment,{segmentRows:1024,maxSegments});
  assignment.values.fill(0); // The source holds an independent private copy.
  const compiled=performance.now();rss.push(process.memoryUsage().rss);
  const options={segmentRows:1024,maskCoefficients:16,maxSegments,maxWires:4_000_000,
    oracleFormat:'domain-values',readSegment:index=>source.readSegment(index)};
  let invalidReads=0;
  const forbidden={...options,readSegment(){invalidReads++;throw new Error('unexpected source read');}};
  let recovered;
  try{
    const forgedRelationRejected=rejected(()=>recoverTransferWitnessFromOracles({...relation},forbidden));
    const circuitOverrideRejected=rejected(()=>recoverTransferWitnessFromOracles(relation,{...forbidden,circuit:relation.circuit}));
    const digestOverrideRejected=rejected(()=>recoverTransferWitnessFromOracles(relation,{...forbidden,statementDigest:relation.statement_digest}));
    requireTrue(forgedRelationRejected&&circuitOverrideRejected&&digestOverrideRejected&&invalidReads===0);
    recovered=recoverTransferWitnessFromOracles(relation,options);
    rss.push(process.memoryUsage().rss);
    const exactWitnessRecovered=isDeepStrictEqual(recovered.witness,expectedWitness);
    const hostRelationValid=checkTransferWitness512({statement,witness:recovered.witness,expected:expectedNative512Statement(statement)}).valid;
    requireTrue(exactWitnessRecovered&&hostRelationValid&&source.segmentsRead===source.segments);
    const alteredCopy=recovered.witness;alteredCopy.inputs[0].spend_secret='00'.repeat(64);
    const copyIsolation=isDeepStrictEqual(recovered.witness,expectedWitness);
    const serializationRejected=rejected(()=>JSON.stringify(recovered));
    const inspectRedacted=inspect(recovered)==='[PRIVATE financial witness recovery; not a receipt proof]';
    requireTrue(copyIsolation&&serializationRejected&&inspectRedacted);
    recovered.dispose();
    const disposedAccessRejected=rejected(()=>recovered.witness);
    requireTrue(disposedAccessRejected);
    return Object.freeze({schema:'AEGIS_PRIVATE_FINANCIAL_ORACLE_REHEARSAL_V1',node:process.version,
      source_scope:'synthetic-complete-private-domain-values',oracle_access:'all-a-b-c-rows-once',
      inputs:statement.input_commitments.length,outputs:statement.output_commitments.length,tree_depth:0,
      constraints_checked:source.constraints,segments_read:source.segmentsRead,segment_rows:source.segmentRows,
      wire_count:relation.circuit.wireCount,gate_count:relation.circuit.gateCount,
      checks:{exact_witness_recovered:exactWitnessRecovered,host_relation_valid:hostRelationValid,
        forged_relation_rejected:forgedRelationRejected,circuit_override_rejected:circuitOverrideRejected,
        statement_override_rejected:digestOverrideRejected,invalid_context_read_no_oracles:invalidReads===0,
        private_result_copy_isolated:copyIsolation,serialization_rejected:serializationRejected,
        inspect_redacted:inspectRedacted,disposed_access_rejected:disposedAccessRejected},
      compile_assign_snapshot_ms:Math.round(compiled-start),recovery_and_checks_ms:Math.round(performance.now()-compiled),
      sampled_process_rss_bytes:Math.max(...rss),receipt_extractor:false,knowledge_soundness_demonstrated:false,
      qap_identity_checked:false,witness_commitment_binding_checked:false,private_proof:false,
      aegis_target_met:false,production_ready:false});
  }finally{source.dispose();recovered?.dispose();}
}
