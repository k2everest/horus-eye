import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {OpenChain} from './chain.mjs';import {OpenNode} from './node.mjs';import {recoverFromPeers} from './peer-recovery.mjs';import {defaultStarkBackend} from '../proof-engine/backend.mjs';
test('peer host recovery reverifies the genuine public STARK with the native backend',{skip:!process.env.AEGIS_POW_RECOVERY_ARTIFACT},async t=>{
 const artifact=JSON.parse(readFileSync(process.env.AEGIS_POW_RECOVERY_ARTIFACT)),backend=defaultStarkBackend(),root=mkdtempSync(join(tmpdir(),'peer-native-'));
 const chain=await OpenChain.open({directory:join(root,'source'),config:artifact.config,backend});
 const node=new OpenNode({chain});await node.listen();t.after(async()=>{await node.close();rmSync(root,{recursive:true,force:true});});
 for(const block of artifact.blocks)await chain.addBlock(block);
 const result=await recoverFromPeers({destinationDirectory:join(root,'recovered'),config:artifact.config,backend,peers:[node.origin],minimumWork:chain.tip.work});
 assert.equal(result.report.outcome,'VERIFIED');assert.equal(result.report.native_stark_backend,true);assert.deepEqual(result.report.tip,chain.tip);assert.equal(result.report.production_ready,false);
});
