import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {BitCircuit,evaluateBitCircuit,checkBitCircuit,readBitBytes} from './bit-circuit.mjs';
import {sha512Bits} from './sha512.mjs';
const digest=message=>crypto.createHash('sha512').update(message).digest('hex');
function compile(length,{pin}={}){
  const builder=new BitCircuit(),input=builder.inputBytes('message',length),output=sha512Bits(builder,input);
  if(pin){const expected=builder.constantBytes(Buffer.from(pin,'hex'));for(let i=0;i<512;i++)builder.assertEqual(output[i],expected[i]);}
  return {circuit:builder.seal(),input,output};
}

test('constrained SHA-512 matches native vectors across padding and block boundaries',()=>{
  const vectors=[Buffer.alloc(0),Buffer.from('abc'),... [111,112,128,255,1024].map(n=>Buffer.from(Array.from({length:n},(_,i)=>(i*37+11)&255)))];
  for(const message of vectors){
    const {circuit,output}=compile(message.length),witness=evaluateBitCircuit(circuit,{message});
    assert.equal(output.length,512);
    assert.equal(readBitBytes(circuit,witness,output).toString('hex'),digest(message));
    assert.equal(checkBitCircuit(circuit,witness),true);
  }
});

test('one circuit binds varying private messages and rejects altered internal hash wires',()=>{
  const {circuit,input,output}=compile(64);
  assert.ok(circuit.gateCount>100_000);
  for(const message of [Buffer.alloc(64),Buffer.alloc(64,255),crypto.randomBytes(64)]){
    const witness=evaluateBitCircuit(circuit,{message});
    assert.equal(checkBitCircuit(circuit,witness),true);
    assert.equal(readBitBytes(circuit,witness,output).toString('hex'),digest(message));
    const tampered=Uint8Array.from(witness.values);tampered[input.at(-1)+1]^=1;
    assert.equal(checkBitCircuit(circuit,tampered),false);
    const changedOutput=Uint8Array.from(witness.values);changedOutput[output[17]]^=1;
    assert.equal(checkBitCircuit(circuit,changedOutput),false);
  }
});

test('pinning a digest rejects a fully recomputed witness for a different message',()=>{
  const message=Buffer.from('abc'),other=Buffer.from('abd'),{circuit,output}=compile(3,{pin:digest(message)});
  assert.equal(checkBitCircuit(circuit,evaluateBitCircuit(circuit,{message})),true);
  const wrong=evaluateBitCircuit(circuit,{message:other});
  assert.equal(readBitBytes(circuit,wrong,output).toString('hex'),digest(other));
  assert.equal(checkBitCircuit(circuit,wrong),false);
});

test('malformed message wires, oversized byte inputs and exhausted gate budgets fail closed',()=>{
  assert.throws(()=>sha512Bits({},[]),TypeError);
  const builder=new BitCircuit(),bits=builder.inputBytes('message',1);
  for(const messageBits of [bits.slice(1),Array(8),[...bits.slice(1),9999],Array(8200).fill(0),null])assert.throws(()=>sha512Bits(builder,messageBits));
  const tiny=new BitCircuit({maxGates:10});
  assert.throws(()=>sha512Bits(tiny,tiny.inputBytes('message',1)),/budget/);
  const sealed=new BitCircuit();sealed.seal();assert.throws(()=>sha512Bits(sealed,[]),/sealed/);
});
