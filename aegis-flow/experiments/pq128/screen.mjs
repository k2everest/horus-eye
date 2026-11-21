import {screenStandaloneFri} from './fri-qrom-bound.mjs';
const args=process.argv.slice(2);
if(args.length>1||args.some(a=>a!=='--require-aegis')) throw new Error('Only --require-aegis is supported');
const report=screenStandaloneFri();
console.log(JSON.stringify(report,null,2));
if(args.includes('--require-aegis')&&!report.aegis_target_met)process.exitCode=1;
