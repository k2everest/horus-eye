// Public source/shape corroboration only. No private oracles are read or emitted.
import {readFileSync,statSync} from 'node:fs';
import {auditHidingDegreeSources} from './hiding-degree-sources.mjs';
import {matchNativeHidingDegreeReport} from './hiding-degree-profile.mjs';
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){
  const key={'--native-report':'report','--source-root':'sourceRoot','--cargo-metadata':'metadata'}[args[i]];
  if(!key||!args[i+1]||Object.hasOwn(options,key))throw new Error('INVALID_DEGREE_AUDIT_ARGUMENTS');
  options[key]=args[i+1];
}
if(!options.report||Boolean(options.sourceRoot)===Boolean(options.metadata))
  throw new Error('native report and exactly one trusted source location required');
function json(path){
  const s=statSync(path);if(!s.isFile()||s.size>8*1024*1024)throw new Error('BOUNDED_LOCAL_REPORT_REQUIRED');
  return JSON.parse(readFileSync(path,'utf8'));
}
const sources=auditHidingDegreeSources(options.metadata?{cargoMetadata:json(options.metadata)}:{sourceRoot:options.sourceRoot});
if(!sources.source_profile_verified){
  console.log(JSON.stringify({sources,pq128_demonstrated:false,production_ready:false},null,2));
  process.exitCode=1;
}else{
  const profile=matchNativeHidingDegreeReport(json(options.report));
  console.log(JSON.stringify({schema:'AEGIS_HIDING_DEGREE_SOURCE_SHAPE_AUDIT_V1',
    sources,degree_profile:{...profile,source_profile_verified:true},
    interpretation:'Source identity and native shape match the deterministic degree derivation. Adversarial low-degree extraction, FRI soundness and QROM are not proved.',
    malicious_committed_polynomial_degrees_verified:false,
    quantum_knowledge_soundness_proved:false,pq128_demonstrated:false,production_ready:false},null,2));
}
