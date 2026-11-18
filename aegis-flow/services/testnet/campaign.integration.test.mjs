import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import net from 'node:net';
import {once} from 'node:events';
import {setTimeout as pause} from 'node:timers/promises';
import {PersistentLedger} from '../ledger-state/store.mjs';
import {notarizeNextTransfer} from '../ledger-state/settlement.mjs';
import {StarkBackend} from '../proof-engine/backend.mjs';
import {LocalWallet} from '../wallet-local/wallet.mjs';
import {createWalletServer} from '../wallet-local/server.mjs';
import {newWalletSecrets,walletPublicIdentity,createEncryptedVault} from '../wallet-local/vault.mjs';
import {generateSigningKeyPair,exportPublicKey,signerTag} from '../../libs/crypto-core/pqc-wrapper.mjs';
import {createPrivateNote,noteCommitmentV2} from '../../libs/crypto-core/shielded-note-v2.mjs';
import {createBackup,restoreBackup} from '../recovery/backup.mjs';
import {EvidenceJournal,loadPublicEvidence} from './evidence.mjs';
import {PairedWalletAgent,runFreshTransfers,runReplayLoad,observeGateway} from './runners.mjs';
import {assessCampaign} from './assessment.mjs';

test('campaign rehearsal: fresh native proof over HTTP, replay, SIGKILL recovery and encrypted restore', {skip:process.env.AEGIS_TESTNET_INTEGRATION!=='1',timeout:660000},async()=>{
 const backend=new StarkBackend();assert.equal(backend.availableForProving(),true);
 const directory=mkdtempSync(join(tmpdir(),'aegis-campaign-'));let ledger,wallet,walletServer,child,signerTimer,signing;const abort=new AbortController();let observeTask,journal;
 try{
  const authority=generateSigningKeyPair();const secrets=newWalletSecrets();
  const note=createPrivateNote({ownerTag:walletPublicIdentity(secrets).owner_tag,value:7});const commitments=[noteCommitmentV2(note)];
  const ledgerPath=join(directory,'ledger.sqlite');ledger=new PersistentLedger({filename:ledgerPath});const genesis=ledger.bootstrap({commitments});
  const config={schema:'AEGIS_PERMISSIONED_SETTLEMENT_V1',network_id:ledger.networkId,genesis_root:genesis.root,genesis_count:1,program_id:backend.programId,
   authority_public_key:exportPublicKey(authority.publicKey),authority_tag:signerTag(authority.publicKey),signature_algorithm:'ML-DSA-65'};
  ledger.configureSettlement(config);const state=ledger.settlementStatus();
  const gatewayToken=crypto.randomBytes(32).toString('hex');const tokenFile=join(directory,'gateway.token');writeFileSync(tokenFile,gatewayToken,{mode:0o600});
  const policyPath=join(directory,'policy.json');writeFileSync(policyPath,JSON.stringify({schema:'AEGIS_ACCESS_POLICY_V1',incident_mode:'normal',principals:[{id:'campaign-client',roles:['reader','submitter','monitor'],token_sha256:crypto.createHash('sha256').update(gatewayToken).digest('hex'),expires_at:Date.now()+86400000}]}),{mode:0o600});
  const configPath=join(directory,'config.json'),anchorPath=join(directory,'anchor.json');writeFileSync(configPath,JSON.stringify(config));writeFileSync(anchorPath,JSON.stringify(state.finalized));
  const ticket=net.createServer();ticket.listen(0,'127.0.0.1');await once(ticket,'listening');const port=ticket.address().port;await new Promise(r=>ticket.close(r));
  const origin=`http://127.0.0.1:${port}`;
  const start=async()=>{
   child=spawn(process.execPath,[new URL('../validation-gateway/server.mjs',import.meta.url).pathname],{stdio:'ignore',env:{...process.env,NODE_ENV:'development',AEGIS_MODE:'demo',PORT:String(port),AEGIS_BIND_HOST:'127.0.0.1',AEGIS_LEDGER_PATH:ledgerPath,AEGIS_ACCESS_POLICY_PATH:policyPath,AEGIS_SETTLEMENT_CONFIG_PATH:configPath,AEGIS_FINALITY_ANCHOR_PATH:anchorPath,AEGIS_REQUIRE_MIGRATED:'1'}});
   for(let i=0;i<100;i++){try{if((await fetch(origin+'/healthz')).ok)return;}catch{}if(child.exitCode!==null||child.signalCode!==null)throw new Error('TEST_GATEWAY_EXITED');await pause(50);}throw new Error('TEST_GATEWAY_NOT_READY');
  };
  await start();
  wallet=new LocalWallet({directory:join(directory,'wallet'),config,genesisCommitments:commitments,gatewayUrl:origin,gatewayTokenFile:tokenFile,backend});
  const encrypted=await createEncryptedVault({schema:'AEGIS_WALLET_PRIVATE_V1',config_id:state.config_id,secrets,notes:[note],pending:[],anchor:state.genesis},'native campaign rehearsal passphrase');
  await wallet.restore({envelope:encrypted.envelope,passphrase:'native campaign rehearsal passphrase'});encrypted.session.key.fill(0);
  const pairing=crypto.randomBytes(32).toString('hex'),pairFile=join(directory,'pair.token');writeFileSync(pairFile,pairing,{mode:0o600});
  walletServer=createWalletServer({wallet,token:pairing,idleMs:900000});walletServer.listen(0,'127.0.0.1');await once(walletServer,'listening');
  const agent=new PairedWalletAgent({origin:`http://127.0.0.1:${walletServer.address().port}`,tokenFile:pairFile});
  signerTimer=setInterval(()=>{if(signing)return;try{ledger.nextFinalityCheckpoint();}catch{return;}
   signing=notarizeNextTransfer({ledger,privateKey:authority.privateKey,backend}).finally(()=>{signing=undefined;});},100);
  const campaign={schema:'AEGIS_TESTNET_CAMPAIGN_V1',campaign_id:'native-local-rehearsal',config_id:state.config_id,environment:'local-rehearsal',image_ref:'unreleased-local',start_anchor:{height:0,checkpoint_id:state.genesis.checkpoint_id},target_origin:origin};
  const evidenceDir=join(directory,'evidence');mkdirSync(evidenceDir);const filename=join(evidenceDir,'observer.jsonl');journal=new EvidenceJournal({filename,campaign,observerId:'local-operator'});
  observeTask=observeGateway({campaign,journal,durationMs:650000,intervalMs:1000,signal:abort.signal});
  const fresh=await runFreshTransfers({campaign,config,agent,journal,artifactDirectory:evidenceDir,count:1,pollMs:50,backend});assert.equal(fresh.finalized,1);
  const own=ledger.finalizedBlock(1);const evidence=await agent.call(`/transfers/${own.transaction.request_id}`);assert.equal(evidence.receipt.settled,true);
  const saved=loadPublicEvidence(join(evidenceDir,`${own.transaction.tx_id}.json`));assert.ok(!JSON.stringify(saved.bundle).includes(secrets.spend_secret));
  const replay=await runReplayLoad({campaign,config,corpus:[own],tokenFile,journal,attempts:3,intervalMs:100,backend});assert.equal(replay.accepted,3);assert.equal(replay.fresh_transactions_counted,0);
  assert.equal(ledger.latest().height,1);
  abort.abort();await observeTask;observeTask=undefined;journal.close();journal=undefined;
  clearInterval(signerTimer);signerTimer=undefined;if(signing)await signing;
  writeFileSync(anchorPath,JSON.stringify(ledger.settlementStatus().finalized));
  const crashed=once(child,'exit');child.kill('SIGKILL');await crashed;child=undefined;
  const recoverStarted=performance.now();await start();
  const ready=await fetch(origin+'/readyz',{headers:{authorization:`Bearer ${gatewayToken}`}});assert.equal(ready.status,200);
  assert.equal((await(await fetch(origin+'/receipts/'+own.transaction.request_id,{headers:{authorization:`Bearer ${gatewayToken}`}})).json()).settled,true);
  const backupKey=join(directory,'backup.key');writeFileSync(backupKey,crypto.randomBytes(32).toString('hex'),{mode:0o600});
  const backup=await createBackup({ledgerPath,networkId:config.network_id,outputDirectory:join(directory,'backups'),keyFile:backupKey});
  const restored=await restoreBackup({backupDirectory:backup.directory,destination:join(directory,'restored.sqlite'),keyFile:backupKey,trustedAnchor:ledger.settlementStatus().finalized,expectedConfigId:state.config_id,backend});assert.equal(restored.finalized.height,1);
  const assessment=await assessCampaign({campaign,config,journalPaths:[filename],backend});assert.equal(assessment.measurements.fresh_finalized,1);assert.equal(assessment.measurements.nominal_accepted,3);assert.equal(assessment.p1_completed,false);
  console.log(JSON.stringify({fresh_native_finalized:1,replay_verified:3,local_sigkill_recovered:true,local_encrypted_restore:true,recovery_observation_ms:Math.round(performance.now()-recoverStarted),public_testnet_exercised:false,external_participants:0,p1_completed:false}));
 }finally{
  abort.abort();if(observeTask)await observeTask.catch(()=>{});journal?.close();if(signerTimer)clearInterval(signerTimer);if(signing)await signing.catch(()=>{});
  if(child&&child.exitCode===null&&child.signalCode===null){const exited=once(child,'exit');child.kill('SIGKILL');await exited;}
  if(walletServer){walletServer.closeAllConnections();await new Promise(resolve=>walletServer.close(resolve));}else wallet?.close();ledger?.close();rmSync(directory,{recursive:true,force:true});
 }
});
