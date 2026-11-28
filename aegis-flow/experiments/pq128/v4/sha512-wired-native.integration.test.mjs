// Genuine SHA-512 Boolean circuit in ONE native Plonky3 LogUp batch proof.
// This is the intermediate integration witness for the six-hash financial
// transfer, not a substitute for that full financial proof or PQ128.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,isAbsolute} from 'node:path';
import {
  BitCircuit,evaluateBitCircuit,checkBitCircuit,
  snapshotBitWitness,bitCircuitPublicProgramBinary,
} from '../constraints/bit-circuit.mjs';
import {sha512Bits} from '../constraints/sha512.mjs';

const enabled=process.env.AEGIS_V4_P3_INTEGRATION==='1';
const binary=process.env.AEGIS_V4_P3_BINARY;
// CI retains 300s. Explicitly provisioned high-memory research machines may
// request up to 30 minutes without changing any STARK/security parameter.
const proverTimeoutMs=Number(process.env.AEGIS_SHA512_PROVER_TIMEOUT_MS??300000);
if(!Number.isSafeInteger(proverTimeoutMs)||
   proverTimeoutMs<300000||proverTimeoutMs>1800000)
  throw new RangeError('SHA512_PROVER_TIMEOUT_OUT_OF_BOUNDS');
const sha=bytes=>createHash('sha512').update(bytes).digest('hex');
const run=(...args)=>execFileSync(binary,args,{
  encoding:'utf8',timeout:300000,maxBuffer:131072,
  stdio:['ignore','pipe','inherit'],
});

test('one full FIPS SHA-512 compression under native Plonky3 LogUp proves its public digest',
  {skip:!enabled,timeout:proverTimeoutMs+120000},()=>{
    assert.ok(binary?.startsWith('/'));
    const dir=mkdtempSync(join(tmpdir(),'aegis-v4-one-sha512-proof-'));
    try{
      const message=Buffer.from('abc');
      const expected=createHash('sha512').update(message).digest();
      const b=new BitCircuit({maxGates:8_000_000});
      const input=b.inputBytes('message',message.length);
      const digestBits=sha512Bits(b,input);
      const publicDigest=b.constantBytes(expected);
      for(let i=0;i<512;i++)b.assertEqual(digestBits[i],publicDigest[i]);
      const circuit=b.seal();
      const assignment=evaluateBitCircuit(circuit,{message});
      assert.equal(checkBitCircuit(circuit,assignment),true);
      const binding=sha(Buffer.concat([
        Buffer.from('AEGIS_ONE_SHA512_R1CS_STAGE_V1\0','ascii'),
        message,expected,
      ]));
      const publicBinary=bitCircuitPublicProgramBinary(circuit,{
        financialStatementDigest512:binding,
      });
      const publicFile=join(dir,'public-program-v2.bin');
      const privateFile=join(dir,'private-bits.bin');
      const proofFile=join(dir,'sha512-plonky3-proof.json');
      writeFileSync(publicFile,publicBinary,{mode:0o600});
      let bits;
      try{
        bits=snapshotBitWitness(circuit,assignment);
        writeFileSync(privateFile,Buffer.from(bits),{mode:0o600});
      }finally{bits?.fill(0);assignment.values.fill(0);}
      const expectedProgramSha=sha(publicBinary);
      const report=JSON.parse(run('security-report-wired',publicFile));
      assert.equal(report.program_sha512,expectedProgramSha);
      assert.equal(report.qrom_fiat_shamir_reduction_proved,false);
      // Measure the NATIVE prover rather than the Node.js wrapper. The
      // resource report contains only public circuit identifiers and
      // process timings; no private witness bytes or proof secrets.
      const timingFile=join(dir,'native-prover-time.txt');
      const native=spawnSync('/usr/bin/time',[
        '-v','-o',timingFile,'timeout','--signal=TERM','--kill-after=15s',
        String(Math.ceil(proverTimeoutMs/1000))+'s',
        binary,'prove-wired',publicFile,privateFile,proofFile
      ],{encoding:'utf8',timeout:proverTimeoutMs+35000,maxBuffer:131072,
        stdio:['ignore','pipe','inherit']});
      const timing=readFileSync(timingFile,'utf8');
      const metric=label=>{
        const line=timing.split('\n').find(row=>row.trimStart().startsWith(label+':'));
        return line?.slice(line.indexOf(label+':')+label.length+1).trim()??null;
      };
      const peakRaw=metric('Maximum resident set size (kbytes)');
      const cpuUser=metric('User time (seconds)');
      const cpuSystem=metric('System time (seconds)');
      const peak=peakRaw===null?null:Number(peakRaw);
      const cpu=cpuUser===null||cpuSystem===null?null:
        Number(cpuUser)+Number(cpuSystem);
      const resourceReport={
        schema:'AEGIS_SHA512_NATIVE_PROVER_RESOURCE_PROFILE_V1',
        program_sha512:expectedProgramSha,
        gate_count:circuit.gateCount,
        wire_count:circuit.wireCount,
        peak_rss_kib:peak!==null&&Number.isFinite(peak)?peak:null,
        cpu_seconds:cpu!==null&&Number.isFinite(cpu)?cpu:null,
        wall_clock:metric('Elapsed (wall clock) time (h:mm:ss or m:ss)'),
        prover_timeout_ms:proverTimeoutMs,
        native_exit_code:native.status,
        native_signal:native.signal,
        full_financial_relation_proved:false,
        quantum_soundness_proved:false,
        pq128_demonstrated:false,
      };
      const artifact=process.env.AEGIS_SHA512_PROFILE_ARTIFACT;
      if(artifact){
        assert.ok(isAbsolute(artifact));
        writeFileSync(artifact,JSON.stringify(resourceReport,null,2)+'\n',{mode:0o600});
      }
      console.log('AEGIS_SHA512_NATIVE_PROFILE='+JSON.stringify(resourceReport));
      assert.equal(native.error,undefined,
        'native prover launch/timeout failure: '+native.error?.message);
      assert.equal(native.status,0,'native prover exit must be successful');
      assert.ok(peak>0,'native prover peak RSS was not measured');
      const proof=JSON.parse(readFileSync(proofFile,'utf8'));
      assert.equal(proof.program_sha512,expectedProgramSha);
      assert.equal(JSON.parse(run('verify-wired',publicFile,proofFile,expectedProgramSha)).valid,true);
      // The proof is transcript-bound to the *whole* program digest,
      // not just the 512 output bits.
      const modified=Buffer.from(publicBinary);
      const bindingOffset=Buffer.from('AEGIS_V4_BOOLEAN_PROGRAM_V2\0').length+8;
      modified[bindingOffset]^=1;
      const second=join(dir,'different-public-program.bin');
      writeFileSync(second,modified);
      const otherSha=sha(modified);
      assert.equal(JSON.parse(run('verify-wired',second,proofFile,otherSha)).valid,false);
      assert.equal(JSON.parse(run('verify-wired',publicFile,proofFile,'aa'.repeat(64))).valid,false);
      assert.equal(proof.scheme,'AEGIS_V4_PLONKY3_WIRED_LOGUP_COMPACT_V2');
    }finally{rmSync(dir,{recursive:true,force:true});}
  });
