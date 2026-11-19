// Public-polynomial reference benchmark. Never pass a financial witness here.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {proveLowDegree,verifyLowDegree} from './protocol.mjs';
const args=process.argv.slice(2);let domainLog2,queries,reportPath;
for(let i=0;i<args.length;i++){
  if(args[i]==='--domain-log2'&&args[i+1])domainLog2=Number(args[++i]);
  else if(args[i]==='--queries'&&args[i+1])queries=Number(args[++i]);
  else if(args[i]==='--report'&&args[i+1])reportPath=args[++i];
  else throw new Error('Explicit --domain-log2 N --queries N --report NEW_FILE required');
}
if(!Number.isSafeInteger(domainLog2)||domainLog2<3||domainLog2>16||!Number.isSafeInteger(queries)||queries<1||queries>1024||!reportPath)throw new Error('Invalid or missing benchmark budget');
const root=fileURLToPath(new URL('../../../../',import.meta.url));
const git=(...a)=>execFileSync('git',a,{cwd:root,encoding:'utf8'}).trim();
const hashes={};
for(const name of ['field.mjs','merkle.mjs','transcript.mjs','protocol.mjs','../challenge-sampling.mjs','../bindings.mjs'])hashes[name]=createHash('sha256').update(readFileSync(new URL(name,import.meta.url))).digest('hex');
const options={context:Buffer.from('AEGIS_PUBLIC_POLYNOMIAL_REFERENCE_BENCHMARK_V1'),domainLog2,queries};
const coefficients=Array.from({length:2**domainLog2/4},(_,i)=>[BigInt(i+1),BigInt(2*i+3),BigInt(3*i+5),7n,11n]);
const rss=[process.memoryUsage().rss],start=performance.now();
const result=proveLowDegree({...options,coefficients});const proved=performance.now();rss.push(process.memoryUsage().rss);
const serialized=JSON.stringify(result.proof);rss.push(process.memoryUsage().rss);
const verified=verifyLowDegree({...options,root:result.root,proof:JSON.parse(serialized)});
const checked=performance.now();rss.push(process.memoryUsage().rss);
if(!verified)throw new Error('REFERENCE_FRI_VERIFICATION_FAILED');
const report={schema:'AEGIS_REFERENCE_FRI_BENCHMARK_V1',source_commit:git('rev-parse','HEAD'),working_tree_dirty:git('status','--porcelain').length>0,
  source_sha256:hashes,node:process.version,domain_log2:domainLog2,degree_bound:coefficients.length,queries,
  proving_elapsed_ms:Math.round(proved-start),serialization_and_verification_elapsed_ms:Math.round(checked-proved),
  sampled_process_rss_bytes:Math.max(...rss),proof_json_bytes:Buffer.byteLength(serialized),initial_root:result.root,
  transcript_oracle_calls:result.diagnostics.transcript_oracle_calls,verified:true,
  hiding:false,financial_proof:false,cms_transcript_equivalence_demonstrated:false,aegis_target_met:false,production_ready:false};
writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o644});
console.log(JSON.stringify(report));
