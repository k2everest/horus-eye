// Resource-bounded PRIVATE arithmetization rehearsal. Only public metadata is
// written; no wire opening, salt, assignment or polynomial is published.
import {writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createSpendIdentity512,createNote512,noteCommitment512,nullifier512} from '../financial/notes.mjs';
import {buildNoteTree512} from '../financial/membership.mjs';
import {RELATION_VERSION,financialStatementDigest512} from '../financial/relation.mjs';
import {compileTransferConstraints512,assignTransferConstraints512} from './transfer.mjs';
import {planBitQap,preparePrivateTransferQap} from './segmented-qap.mjs';
const args=process.argv.slice(2);let maxSegments,reportPath;
for(let i=0;i<args.length;i++){
  if(args[i]==='--max-segments'&&args[i+1])maxSegments=Number(args[++i]);
  else if(args[i]==='--report'&&args[i+1])reportPath=args[++i];
  else throw new Error('--max-segments N --report NEW_FILE required');
}
if(!Number.isSafeInteger(maxSegments)||maxSegments<1||maxSegments>65536||!reportPath)throw new Error('Explicit segment budget and new report path required');
const networkId='private-segment-demo',owner=createSpendIdentity512({networkId}),recipient=createSpendIdentity512({networkId});
const input=createNote512({networkId,ownerTag:owner.owner_tag,value:'105000000'}),output=createNote512({networkId,ownerTag:recipient.owner_tag,value:'104999900'});
const commitment=noteCommitment512(input),tree=buildNoteTree512({networkId,commitments:[commitment]});
const statement={version:RELATION_VERSION,network_id:networkId,asset_id:'QUEER',anchor_root:tree.root,anchor_leaf_count:1,input_commitments:[commitment],
  output_commitments:[noteCommitment512(output)],nullifiers:[nullifier512({note:input,spendSecret:owner.spend_secret})],fee:'100',transaction_binding:'ab'.repeat(64)};
const witness={inputs:[{note:input,spend_secret:owner.spend_secret,membership:tree.proof(0)}],outputs:[output]};
const rss=[process.memoryUsage().rss],start=performance.now();
const relation=compileTransferConstraints512({statement,expectedStatementDigest:financialStatementDigest512(statement)});
const assignment=assignTransferConstraints512(relation,witness),compiled=performance.now();rss.push(process.memoryUsage().rss);
const opts={segmentRows:1024,maxSegments,maskCoefficients:16};
const plan=planBitQap(relation.circuit,opts),prepared=preparePrivateTransferQap(relation,assignment,opts),committed=performance.now();rss.push(process.memoryUsage().rss);
const indices=[...new Set([0,Math.floor(plan.segments/2),plan.segments-1])];
for(const index of indices){const artifact=prepared.segment(index);if(artifact.private_proof!==false)throw new Error('Invalid scope marker');rss.push(process.memoryUsage().rss);}
const built=performance.now(),root=fileURLToPath(new URL('../../../../',import.meta.url));
const git=(...a)=>execFileSync('git',a,{cwd:root,encoding:'utf8'}).trim();
const report={schema:'AEGIS_EXPERIMENT_SEGMENTED_TRANSFER_QAP_REHEARSAL_V1',source_commit:git('rev-parse','HEAD'),working_tree_dirty:git('status','--porcelain').length>0,node:process.version,
  plan,public_context:prepared.publicInputs,sampled_segment_indices:indices,sampled_segments_built:indices.length,all_segments_built:false,
  compile_and_assign_ms:Math.round(compiled-start),snapshot_commit_and_check_ms:Math.round(committed-compiled),sampled_polynomial_build_ms:Math.round(built-committed),
  sampled_process_rss_bytes:Math.max(...rss),entire_assignment_checked_locally:true,private_proof:false,funds_authorized:false,aegis_target_met:false,production_ready:false};
assignment.values.fill(0); // Does not claim secure erasure of every private copy.
writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o644});console.log(JSON.stringify(report));
