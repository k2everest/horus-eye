import {parseArgs} from 'node:util';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {recoverFromPeers} from '../services/open-chain/peer-recovery.mjs';
const {values:v}=parseArgs({options:{genesis:{type:'string'},destination:{type:'string'},peer:{type:'string',multiple:true},'minimum-work':{type:'string'},'max-blocks':{type:'string'},'max-rounds':{type:'string'},'timeout-ms':{type:'string'},report:{type:'string'}}});
for(const name of ['genesis','destination','peer','minimum-work','report'])if(!v[name])throw Error('REQUIRED_OPTION:'+name);
if(existsSync(v.report))throw Error('REPORT_DESTINATION_EXISTS');
const result=await recoverFromPeers({config:JSON.parse(readFileSync(v.genesis,'utf8')),destinationDirectory:v.destination,peers:v.peer,minimumWork:v['minimum-work'],
 ...(v['timeout-ms']?{timeoutMs:Number(v['timeout-ms'])}:{}),...(v['max-blocks']?{maxBlocks:Number(v['max-blocks'])}:{}),...(v['max-rounds']?{maxRounds:Number(v['max-rounds'])}:{})});
writeFileSync(v.report,JSON.stringify(result.report,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify(result));if(result.report.outcome!=='VERIFIED')process.exitCode=1;
