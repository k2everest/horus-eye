// Local assignment benchmark only. No proof, private witness or funds are
// published; report contains public shape and execution metadata exclusively.
import {writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createSpendIdentity512,createNote512,noteCommitment512,nullifier512} from '../financial/notes.mjs';
import {buildNoteTree512} from '../financial/membership.mjs';
import {RELATION_VERSION,financialStatementDigest512} from '../financial/relation.mjs';
import {compileTransferConstraints512,assignTransferConstraints512,checkTransferConstraints512} from './transfer.mjs';
const args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--report'||!args[1])throw new Error('--report NEW_FILE required');
const networkId='constraint-demo-only',identity=createSpendIdentity512({networkId}),recipient=createSpendIdentity512({networkId});
const input=createNote512({networkId,ownerTag:identity.owner_tag,value:'105000000'}),output=createNote512({networkId,ownerTag:recipient.owner_tag,value:'104999900'});
const commitment=noteCommitment512(input),tree=buildNoteTree512({networkId,commitments:[commitment]});
const statement={version:RELATION_VERSION,network_id:networkId,asset_id:'QUEER',anchor_root:tree.root,anchor_leaf_count:1,
  input_commitments:[commitment],output_commitments:[noteCommitment512(output)],nullifiers:[nullifier512({note:input,spendSecret:identity.spend_secret})],fee:'100',transaction_binding:'ab'.repeat(64)};
const witness={inputs:[{note:input,spend_secret:identity.spend_secret,membership:tree.proof(0)}],outputs:[output]};
const rss=[process.memoryUsage().rss],start=performance.now();
const relation=compileTransferConstraints512({statement,expectedStatementDigest:financialStatementDigest512(statement)}),built=performance.now();rss.push(process.memoryUsage().rss);
const assignment=assignTransferConstraints512(relation,witness),assigned=performance.now();rss.push(process.memoryUsage().rss);
const valid=checkTransferConstraints512(relation,assignment),checked=performance.now();rss.push(process.memoryUsage().rss);
if(!valid)throw new Error('TRANSFER_CONSTRAINTS_FAILED');
assignment.values.fill(0); // Best effort for this one array, not secure erasure of the JS heap.
const root=fileURLToPath(new URL('../../../../',import.meta.url)),git=(...a)=>execFileSync('git',a,{cwd:root,encoding:'utf8'}).trim();
const report={schema:'AEGIS_EXPERIMENT_TRANSFER_CONSTRAINT_BENCHMARK_V1',source_commit:git('rev-parse','HEAD'),working_tree_dirty:git('status','--porcelain').length>0,node:process.version,
  inputs:1,outputs:1,anchor_leaf_count:1,hash_calls:relation.hashCalls,gate_constraints:relation.circuit.gateCount,boolean_constraints:relation.circuit.booleanConstraintCount,
  wires:relation.circuit.wireCount,compile_ms:Math.round(built-start),assign_ms:Math.round(assigned-built),check_ms:Math.round(checked-assigned),sampled_process_rss_bytes:Math.max(...rss),
  constraint_equations_satisfied:true,private_proof:false,funds_authorized:false,aegis_target_met:false,production_ready:false};
writeFileSync(args[1],JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o644});console.log(JSON.stringify(report));
