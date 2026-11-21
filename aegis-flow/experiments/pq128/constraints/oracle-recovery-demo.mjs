// Explicit-budget complete financial row-oracle rehearsal. Report public counts
// and checks only; no witness, private oracle or deterministic transcript digest.
import {writeFileSync} from 'node:fs';
import {runFinancialOracleRehearsal} from './oracle-recovery-rehearsal.mjs';
const args=process.argv.slice(2);let maxSegments,reportPath;
for(let i=0;i<args.length;i++){
  if(args[i]==='--max-segments'&&args[i+1])maxSegments=Number(args[++i]);
  else if(args[i]==='--report'&&args[i+1])reportPath=args[++i];
  else throw new Error('--max-segments N --report NEW_FILE required');
}
if(!Number.isSafeInteger(maxSegments)||maxSegments<1||maxSegments>65536||!reportPath)throw new Error('Explicit segment budget and new report path required');
const report=runFinancialOracleRehearsal({maxSegments});
writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o644});
console.log(JSON.stringify(report));
