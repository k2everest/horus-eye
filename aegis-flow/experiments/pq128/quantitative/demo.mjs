import {analyzeQuantitatively} from './analysis.mjs';
const args=process.argv.slice(2);let sourceRoot,requireSources=false,requireAegis=false;
for(let i=0;i<args.length;i++){
  if(args[i]==='--source-root'&&args[i+1]&&!args[i+1].startsWith('--'))sourceRoot=args[++i];
  else if(args[i]==='--require-sources')requireSources=true;
  else if(args[i]==='--require-aegis')requireAegis=true;
  else throw new TypeError('unknown or incomplete quantitative-analysis argument');
}
const report=analyzeQuantitatively({sourceRoot});console.log(JSON.stringify(report,null,2));
if((requireSources&&!report.source_profile_verified)||(requireAegis&&!report.aegis_target_met))process.exitCode=1;
