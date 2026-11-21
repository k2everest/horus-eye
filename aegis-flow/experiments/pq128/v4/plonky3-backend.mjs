// Isolated real Plonky3 proof-verification adapter. The native verifier
// proves ONLY a small 16-bit balance AIR + public SHA-512 claim binding.
// NEVER use for monetary state transitions. Not ZK or PQ128 qualified.
import {createHash} from 'node:crypto';
import {accessSync,constants,mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {bytes512,programImageIdV4} from './hash512.mjs';

const run=promisify(execFile);
const fields=['network_id','program_id','index','segment_count','pre_state','post_state','journal_digest'];
const exact=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&
  Object.keys(o).sort().join(',')===[...keys].sort().join(',');
const reject=()=>({valid:false});
export const P3_V4_SMOKE_SCHEME='AEGIS_V4_P3_BALANCE_SMOKE_V1';

export class NativePlonky3V4Verifier {
  #binary;#expectedProgramId;#expectedSha512;#timeout;
  kind='external-verified-512-bit-segment-claims';
  constructor({binaryPath,expectedProgramId,expectedBinarySha512,timeoutMs=60000}={}){
    if(typeof binaryPath!=='string'||!binaryPath.startsWith('/')||
      !Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>60000)
      throw new TypeError('absolute pinned binary path and bounded timeout required');
    bytes512(expectedProgramId);bytes512(expectedBinarySha512);
    this.#binary=resolve(binaryPath);this.#expectedProgramId=expectedProgramId;
    this.#expectedSha512=expectedBinarySha512;this.#timeout=timeoutMs;
  }
  get programId(){return this.#expectedProgramId;}
  #check(){
    accessSync(this.#binary,constants.X_OK);
    const bin=readFileSync(this.#binary);
    if(bin.length<1000||bin.length>100*1024*1024||
      createHash('sha512').update(bin).digest('hex')!==this.#expectedSha512||
      programImageIdV4(bin)!==this.#expectedProgramId)
      throw new Error('PLONKY3_BINARY_IDENTITY_MISMATCH');
    // This is a local integrity check, not source-to-binary attestation.
  }
  available(){try{this.#check();return true;}catch{return false;}}
  async verifySegment(options={}){
    let dir;
    try{
      if(!exact(options,['proofBytes','programId','networkId','statementDigest','segmentIndex','segmentCount']))return reject();
      const {proofBytes,programId,networkId,statementDigest,segmentIndex,segmentCount}=options;
      this.#check();
      if(!(proofBytes instanceof Uint8Array)||proofBytes.byteLength<16||
        proofBytes.byteLength>1_500_000||programId!==this.#expectedProgramId||
        typeof networkId!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(networkId)||
        !Number.isSafeInteger(segmentIndex)||!Number.isSafeInteger(segmentCount)||
        segmentCount<1||segmentCount>64||segmentIndex<0||segmentIndex>=segmentCount)
        return reject();
      bytes512(statementDigest);
      const raw=Buffer.from(proofBytes);
      const bundle=JSON.parse(raw.toString('utf8'));
      if(!exact(bundle,['scheme','claim','proof'])||bundle.scheme!==P3_V4_SMOKE_SCHEME||
        !exact(bundle.claim,fields)||bundle.claim.network_id!==networkId||
        bundle.claim.program_id!==programId||bundle.claim.index!==segmentIndex||
        bundle.claim.segment_count!==segmentCount||
        typeof bundle.proof!=='string'||bundle.proof.length>1_398_104)
        return reject();
      for(const k of ['pre_state','post_state'])bytes512(bundle.claim[k]);
      if(segmentIndex===segmentCount-1)bytes512(bundle.claim.journal_digest);
      else if(bundle.claim.journal_digest!==null)return reject();
      dir=mkdtempSync(join(tmpdir(),'aegis-v4-p3-check-'));
      const bundlePath=join(dir,'bundle.json'),claimPath=join(dir,'claim.json');
      writeFileSync(bundlePath,raw,{mode:0o600});
      writeFileSync(claimPath,JSON.stringify(bundle.claim),{mode:0o600});
      // NO fallback to checking JSON locally. Only the pinned native verifier
      // may return a positive cryptographic result.
      const {stdout}=await run(this.#binary,['verify',bundlePath,claimPath],{
        timeout:this.#timeout,maxBuffer:32768,
        env:{...process.env,RAYON_NUM_THREADS:'2'}
      });
      const result=JSON.parse(stdout);
      if(!exact(result,['valid','authenticated','engine','aegis_target_met','production_ready'])||
        result.valid!==true||result.engine!=='PLONKY3-0.8.0-RESEARCH-ONLY'||
        result.aegis_target_met!==false||result.production_ready!==false||
        !exact(result.authenticated,fields)||
        JSON.stringify(result.authenticated)!==JSON.stringify(bundle.claim))
        return reject();
      return {valid:true,authenticated:structuredClone(bundle.claim),
        scope:'plonky3-native-balance-smoke-only',financial_relation_proved:false,
        aegis_target_met:false,production_ready:false};
    }catch{return reject();}
    finally{if(dir)rmSync(dir,{recursive:true,force:true});}
  }
}
