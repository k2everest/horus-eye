import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EvidenceJournal,readJournal,assertCampaign} from './evidence.mjs';
import {assessCampaign,signTestnetReport,verifyEnrolledReport} from './assessment.mjs';
import {runReplayLoad,runFreshTransfers,PairedWalletAgent} from './runners.mjs';
import {PersistentLedger} from '../ledger-state/store.mjs';
import {submitProvenTransfer} from '../ledger-state/submit-transfer.mjs';
import {notarizeNextTransfer} from '../ledger-state/settlement.mjs';
import {settlementConfigId,genesisFinality} from '../ledger-state/finality.mjs';
import {generateSigningKeyPair,generateKemKeyPair,signerTag,exportPublicKey} from '../../libs/crypto-core/pqc-wrapper.mjs';
import {createSpendIdentity,createPrivateNote,noteCommitmentV2} from '../../libs/crypto-core/shielded-note-v2.mjs';
import {merkleRoot,createInclusionProof} from '../../libs/crypto-core/merkle-proof.mjs';
import {prepareTransferV2} from '../../libs/crypto-core/transfer-v2.mjs';
import {canonicalSerialize} from '../../libs/crypto-core/canonical-transcript.mjs';

function setup(t){
 const dir=mkdtempSync(join(tmpdir(),'aegis-campaign-unit-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const authority=generateSigningKeyPair(),sender=generateSigningKeyPair(),kem=generateKemKeyPair(),owner=createSpendIdentity();
 const note=createPrivateNote({ownerTag:owner.owner_tag,value:7});const commitments=[noteCommitmentV2(note)];const program='42'.repeat(32);
 const config={schema:'AEGIS_PERMISSIONED_SETTLEMENT_V1',network_id:'aegis-lab-v1',genesis_root:merkleRoot(commitments),genesis_count:1,program_id:program,
  authority_public_key:exportPublicKey(authority.publicKey),authority_tag:signerTag(authority.publicKey),signature_algorithm:'ML-DSA-65'};
 const campaign={schema:'AEGIS_TESTNET_CAMPAIGN_V1',campaign_id:'unit-rehearsal',config_id:settlementConfigId(config),environment:'local-rehearsal',image_ref:'unreleased-local',start_anchor:{height:0,checkpoint_id:genesisFinality(config).checkpoint_id},target_origin:'http://127.0.0.1:9999'};
 const prepared=prepareTransferV2({requestId:'testnet-unit',privateKey:sender.privateKey,anchorStateRoot:config.genesis_root,
  inputs:[{note,spend_secret:owner.spend_secret,membership:createInclusionProof(commitments,0)}],outputs:[{note:createPrivateNote({ownerTag:owner.owner_tag,value:7}),recipientPublicKey:kem.publicKey}]});
 const proof={scheme:'RISC0-COMPOSITE-STARK-V1',program_id:program,statement_digest:'11'.repeat(32),receipt:Buffer.from('explicit-test-double').toString('base64')};
 const digest=crypto.createHash('sha256').update(Buffer.from(proof.receipt,'base64')).digest('hex');
 // Explicit unit double, never selectable by the CLI. Real proof coverage lives
 // in campaign.integration.test.mjs and was not inferred from these flags.
 const backend={programId:program,availableForVerification:()=>true,verify:async()=>({valid:true,program_id:program,proof_digest:digest})};
 const filename=join(dir,'evidence.jsonl');const journal=new EvidenceJournal({filename,campaign,observerId:'local-test'});t.after(()=>journal.close());
 return{dir,authority,config,campaign,commitments,transaction:prepared.transaction,proof,digest,backend,filename,journal,owner,note};
}
test('journal rejects secret-shaped fields and detects damaged/reordered records',async t=>{
 const f=setup(t);assert.throws(()=>f.journal.append('heartbeat',{ok:true,latency_ms:1,private_key:'forbidden'}),/FIELDS/);
 f.journal.append('heartbeat',{ok:true,latency_ms:1});f.journal.close();let count=0;for await(const row of readJournal(f.filename)){void row;count++;}assert.equal(count,2);
 const bytes=readFileSync(f.filename,'utf8');writeFileSync(f.filename,bytes.replace('"latency_ms":1','"latency_ms":2'));
 await assert.rejects(async()=>{for await(const row of readJournal(f.filename))void row;},/JOURNAL_INVALID/);
 assert.throws(()=>assertCampaign({...f.campaign,environment:'public-testnet'}),/REQUIRES/);
 assert.throws(()=>new PairedWalletAgent({origin:'https://attacker.invalid',tokenFile:'unused'}),/LOOPBACK/);
});
test('replay acceptance checks semantics; replay never counts as fresh throughput',async t=>{
 const f=setup(t);const token=crypto.randomBytes(32).toString('hex'),tokenFile=join(f.dir,'token');writeFileSync(tokenFile,token,{mode:0o600});let calls=0;
 const result=await runReplayLoad({campaign:f.campaign,config:f.config,corpus:[{transaction:f.transaction,proof:f.proof}],tokenFile,journal:f.journal,attempts:2,intervalMs:100,backend:f.backend,
  fetchImpl:async(url,options)=>{assert.equal(options.headers.authorization,`Bearer ${token}`);assert.ok(!options.body.includes(f.owner.spend_secret));calls++;return Response.json({valid:calls===1,receipt:{transaction_id:f.transaction.tx_id,proof_audit:{program_id:f.config.program_id,proof_digest:f.digest}}});}});
 assert.equal(result.accepted,1);assert.equal(result.rejected,1);assert.equal(result.fresh_transactions_counted,0);
 f.journal.close();const report=await assessCampaign({campaign:f.campaign,config:f.config,journalPaths:[f.filename]});
 assert.equal(report.measurements.nominal_accepted,1);assert.equal(report.measurements.fresh_finalized,0);assert.equal(report.p1_completed,false);
 assert.ok(!readFileSync(f.filename,'utf8').includes(token));
});
test('fresh events bind a new submission to proof, authority certificate and artifact hash',async t=>{
 const f=setup(t);const ledger=new PersistentLedger({filename:join(f.dir,'ledger.sqlite')});t.after(()=>ledger.close());ledger.bootstrap({commitments:f.commitments});ledger.configureSettlement(f.config);
 let sent=false;
 const agent={call:async path=>{
  if(path==='/sync')return{locked:false,busy:false,synchronized:true,config_id:f.campaign.config_id,address:'self',pending:[],finalized:ledger.settlementStatus().finalized};
  if(path==='/send'){assert.equal((await submitProvenTransfer({ledger,transaction:f.transaction,proof:f.proof,backend:f.backend})).valid,true);await notarizeNextTransfer({ledger,privateKey:f.authority.privateKey,backend:f.backend});sent=true;return{pending:[{request_id:f.transaction.request_id,transaction_id:f.transaction.tx_id}]};}
  if(path.startsWith('/transfers/'))return{...ledger.finalizedBlock(1),receipt:ledger.receipt(f.transaction.request_id)};
 }};
 const result=await runFreshTransfers({campaign:f.campaign,config:f.config,agent,journal:f.journal,artifactDirectory:f.dir,backend:f.backend,pollMs:10});assert.equal(sent,true);assert.equal(result.finalized,1);
 f.journal.close();const report=await assessCampaign({campaign:f.campaign,config:f.config,journalPaths:[f.filename],backend:f.backend});assert.equal(report.measurements.fresh_finalized,1);assert.equal(report.p1_completed,false);
 assert.ok(!readFileSync(join(f.dir,`${f.transaction.tx_id}.json`),'utf8').includes(f.note.randomness));
 const artifact=join(f.dir,`${f.transaction.tx_id}.json`);writeFileSync(artifact,readFileSync(artifact,'utf8')+' ');
 await assert.rejects(assessCampaign({campaign:f.campaign,config:f.config,journalPaths:[f.filename],backend:f.backend}),/HASH_MISMATCH/);
});
test('two samples a month apart cannot masquerade as a prolonged availability campaign',async t=>{
 const f=setup(t);f.journal.append('heartbeat',{ok:true,latency_ms:1});f.journal.append('heartbeat',{ok:true,latency_ms:1});f.journal.close();
 const rows=readFileSync(f.filename,'utf8').trim().split('\n').map(JSON.parse);let previous='0'.repeat(64);const start=Date.now()-31*86400000;
 rows.forEach((row,index)=>{row.at=index===2?start+31*86400000:start;row.previous=previous;const{hash,...body}=row;void hash;row.hash=crypto.createHash('sha256').update(canonicalSerialize(body)).digest('hex');previous=row.hash;});
 writeFileSync(f.filename,rows.map(row=>JSON.stringify(row)).join('\n')+'\n');
 const report=await assessCampaign({campaign:f.campaign,config:f.config,journalPaths:[f.filename]});assert.equal(report.checks.duration,true);assert.equal(report.checks.liveness_availability,false);assert.equal(report.checks.heartbeat_coverage,false);assert.equal(report.p1_completed,false);
});
test('external reports require enrollment, native ML-DSA signatures and review references',t=>{
 const f=setup(t),key=generateSigningKeyPair();const entry={observer_id:'external-a',role:'participant',public_key:exportPublicKey(key.publicKey),wallet_signer_tag:signerTag(key.publicKey),independence_reviewed:true,review_reference_sha256:'12'.repeat(32)};
 const payload={kind:'participant',campaign_id:f.campaign.campaign_id,config_id:f.campaign.config_id,observer_id:'external-a',transactions:[f.transaction.tx_id],heads:['34'.repeat(32)],flows:['create','backup','restore','send','receive','sync','lock']};
 const signed=signTestnetReport(payload,key.privateKey);assert.deepEqual(verifyEnrolledReport(signed,f.campaign,[entry]),payload);
 assert.equal(verifyEnrolledReport({...signed,payload:{...payload,observer_id:'other'}},f.campaign,[entry]),undefined);
 assert.equal(verifyEnrolledReport(signed,f.campaign,[{...entry,independence_reviewed:false}]),undefined);
 const drill={kind:'infrastructure_drill',campaign_id:f.campaign.campaign_id,config_id:f.campaign.config_id,observer_id:entry.observer_id,scenario:'host-recovery',artifact_sha256:'78'.repeat(32),measured_recovery_ms:1000,recovered:true,external_environment:true};
 assert.deepEqual(verifyEnrolledReport(signTestnetReport(drill,key.privateKey),f.campaign,[{...entry,role:'operator'}]),drill);

});
test('signed declarations do not turn local drills into external infrastructure acceptance',async t=>{
 const f=setup(t),key=generateSigningKeyPair();f.journal.close();
 const registry=[{observer_id:'operator',role:'operator',public_key:exportPublicKey(key.publicKey),independence_reviewed:true,review_reference_sha256:'56'.repeat(32)}];
 const reports=['gateway-kill','network-partition','disk-full','host-recovery-s3'].map(scenario=>signTestnetReport({kind:'infrastructure_drill',campaign_id:f.campaign.campaign_id,config_id:f.campaign.config_id,observer_id:'operator',scenario,artifact_sha256:'78'.repeat(32),measured_recovery_ms:1,recovered:true,external_environment:true},key.privateKey));
 const report=await assessCampaign({campaign:f.campaign,config:f.config,journalPaths:[f.filename],registry,reports});
 assert.deepEqual(report.measurements.signed_external_drills,[]);assert.equal(report.checks.infrastructure_drills,false);assert.equal(report.p1_completed,false);
});
test('copying the same journal cannot inflate nominal volume',async t=>{
 const f=setup(t);f.journal.append('heartbeat',{ok:true,latency_ms:1});f.journal.close();
 assert.equal(JSON.parse(readFileSync(f.filename+'.head.json','utf8')).events,2);
 const copy=join(f.dir,'copied.jsonl');writeFileSync(copy,readFileSync(f.filename));
 await assert.rejects(assessCampaign({campaign:f.campaign,config:f.config,journalPaths:[f.filename,copy]}),/DUPLICATE_JOURNAL/);
});
test('CLI observation writes public evidence and the P1 gate stays closed',async t=>{
 const f=setup(t);const {default:http}=await import('node:http');const{once}=await import('node:events');const{execFile}=await import('node:child_process');const{promisify}=await import('node:util');
 const server=http.createServer((req,res)=>{assert.equal(req.url,'/healthz');res.writeHead(200);res.end('{}');});server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 const campaign={...f.campaign,target_origin:`http://127.0.0.1:${server.address().port}`};
 const campaignPath=join(f.dir,'campaign.json'),configPath=join(f.dir,'config.json');writeFileSync(campaignPath,JSON.stringify(campaign));writeFileSync(configPath,JSON.stringify(f.config));
 const cli=new URL('../../scripts/testnet-campaign.mjs',import.meta.url).pathname,run=promisify(execFile);
 const observed=await run(process.execPath,[cli,'observe','--campaign',campaignPath,'--config',configPath,'--directory',join(f.dir,'cli'),'--observer','tool-user','--duration-ms','100','--interval-ms','100']);
 const result=JSON.parse(observed.stdout);assert.equal(result.public_campaign_completed,false);assert.ok(result.result.samples>0);
 const list=join(f.dir,'journals.json');writeFileSync(list,JSON.stringify([result.journal]));
 await assert.rejects(run(process.execPath,[cli,'gate','--campaign',campaignPath,'--config',configPath,'--journals',list]),error=>error.code===1&&JSON.parse(error.stdout).p1_completed===false);
});
