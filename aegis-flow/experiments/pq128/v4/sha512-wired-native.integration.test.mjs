// Genuine SHA-512 Boolean circuit in ONE native Plonky3 LogUp batch proof.
// This is the intermediate integration witness for the six-hash financial
// transfer, not a substitute for that full financial proof or PQ128.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  BitCircuit,evaluateBitCircuit,checkBitCircuit,
  snapshotBitWitness,bitCircuitPublicProgramBinary,
} from '../constraints/bit-circuit.mjs';
import {sha512Bits} from '../constraints/sha512.mjs';

const enabled=process.env.AEGIS_V4_P3_INTEGRATION==='1';
const binary=process.env.AEGIS_V4_P3_BINARY;
const sha=bytes=>createHash('sha512').update(bytes).digest('hex');
const run=(...args)=>execFileSync(binary,args,{
  encoding:'utf8',timeout:300000,maxBuffer:131072,
  stdio:['ignore','pipe','inherit'],
});

test('one full FIPS SHA-512 compression under native Plonky3 LogUp proves its public digest',
  {skip:!enabled,timeout:360000},()=>{
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
      run('prove-wired',publicFile,privateFile,proofFile);
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
      assert.equal(proof.scheme,'AEGIS_V4_PLONKY3_WIRED_LOGUP_RESEARCH_V1');
    }finally{rmSync(dir,{recursive:true,force:true});}
  });
