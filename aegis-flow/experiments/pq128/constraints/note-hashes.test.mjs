import test from 'node:test';
import assert from 'node:assert/strict';
import {BitCircuit,evaluateBitCircuit,checkBitCircuit,readBitBytes} from './bit-circuit.mjs';
import {frameHashBits,ownerHashBits,noteHashBits,nullifierHashBits,treeLeafHashBits,treeNodeHashBits,treeRootHashBits} from './note-hashes.mjs';
import {bindingDigest512} from '../bindings.mjs';
import {ownerTag512,createNote512,noteCommitment512,nullifier512,NOTE512_VERSION} from '../financial/notes.mjs';
import {buildNoteTree512} from '../financial/membership.mjs';

test('symbolic frame matches native length framing for private bytes, empty parts and purpose domains',()=>{
  const b=new BitCircuit(),payload=b.inputBytes('payload',3);
  const output=frameHashBits(b,{domain:'FRAMING_TEST',parts:[payload,[]]});
  const circuit=b.seal(),witness=evaluateBitCircuit(circuit,{payload:Buffer.from('abc')});
  assert.equal(checkBitCircuit(circuit,witness),true);
  assert.equal(readBitBytes(circuit,witness,output).toString('hex'),bindingDigest512({domain:'FRAMING_TEST',parts:[Buffer.from('abc'),Buffer.alloc(0)]}));
});

test('one shared symbolic witness drives owner, fixed-width note, nullifier and membership hashes',()=>{
  assert.equal(NOTE512_VERSION,'AEGIS_EXPERIMENT_NOTE512_V2');
  const networkId='constraint-test',secret=Buffer.alloc(64,0x12),randomness=Buffer.alloc(64,0x34);
  const value=Buffer.alloc(8);value.writeBigUInt64BE(123456789n);
  const owner=ownerTag512({networkId,spendSecret:secret.toString('hex')});
  const note=createNote512({networkId,ownerTag:owner,value:'123456789',randomness:randomness.toString('hex')});
  const commitment=noteCommitment512(note),nullifier=nullifier512({note,spendSecret:secret.toString('hex')});
  const otherCommitment='56'.repeat(64),tree=buildNoteTree512({networkId,commitments:[commitment,otherCommitment]});
  const b=new BitCircuit(),secretBits=b.inputBytes('secret',64),valueBits=b.inputBytes('value',8),randomnessBits=b.inputBytes('randomness',64);
  const ownerBits=ownerHashBits(b,{networkId,spendSecretBits:secretBits});
  const commitmentBits=noteHashBits(b,{networkId,valueBits,ownerBits,randomnessBits});
  const nullifierBits=nullifierHashBits(b,{networkId,commitmentBits,spendSecretBits:secretBits});
  const leaf=treeLeafHashBits(b,{networkId,commitmentBits});
  const sibling=treeLeafHashBits(b,{networkId,commitmentBits:b.constantBytes(Buffer.from(otherCommitment,'hex'))});
  const parent=treeNodeHashBits(b,{networkId,leftBits:leaf,rightBits:sibling});
  const root=treeRootHashBits(b,{networkId,leafCount:2,rootBits:parent});
  const circuit=b.seal(),witness=evaluateBitCircuit(circuit,{secret,value,randomness});
  assert.equal(checkBitCircuit(circuit,witness),true);
  for(const [bits,expected] of [[ownerBits,owner],[commitmentBits,commitment],[nullifierBits,nullifier],[root,tree.root]])assert.equal(readBitBytes(circuit,witness,bits).toString('hex'),expected);
  const changed=evaluateBitCircuit(circuit,{secret,value:Buffer.from('00000000075bcd16','hex'),randomness});
  assert.equal(checkBitCircuit(circuit,changed),true);
  assert.notEqual(readBitBytes(circuit,changed,commitmentBits).toString('hex'),commitment);
  const tampered=witness.values.slice();tampered[commitmentBits[0]]^=1;
  assert.equal(checkBitCircuit(circuit,tampered),false);
});

test('symbolic hashes reject invalid networks, widths, fields and resource shapes before hashing',()=>{
  const b=new BitCircuit(),s=b.inputBytes('secret',64),v=b.inputBytes('value',8);
  for(const domain of ['', 'lowercase','A'.repeat(65),'BAD\0'])assert.throws(()=>frameHashBits(b,{domain,parts:[]}));
  assert.throws(()=>frameHashBits(b,{domain:'OK',parts:Array.from({length:65},()=>[])}));
  assert.throws(()=>frameHashBits(b,{domain:'OK',parts:[[0]]}));
  assert.throws(()=>frameHashBits(b,{domain:'OK',parts:[b.constantBytes(Buffer.alloc(1024))]}));
  assert.throws(()=>ownerHashBits(b,{networkId:'bad|network',spendSecretBits:s}));
  assert.throws(()=>ownerHashBits(b,{networkId:'n',spendSecretBits:v}));
  assert.throws(()=>noteHashBits(b,{networkId:'n',valueBits:s,ownerBits:s,randomnessBits:s}));
  assert.throws(()=>nullifierHashBits(b,{networkId:'n',commitmentBits:v,spendSecretBits:s}));
  assert.throws(()=>treeRootHashBits(b,{networkId:'n',leafCount:0,rootBits:s}));
  assert.throws(()=>treeRootHashBits(b,{networkId:'n',leafCount:65537,rootBits:s}));
  assert.throws(()=>treeNodeHashBits(b,{networkId:'n',leftBits:s,rightBits:v}));
});
