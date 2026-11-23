import test from 'node:test';
import assert from 'node:assert/strict';
import {inspect} from 'node:util';
import {commitPrivateWitness,verifyPrivateWitnessOpening,WITNESS_BLOCK_BITS,MAX_COMMITTED_WIRES} from './witness-commitment.mjs';
const schemaDigest='ab'.repeat(64),statementDigest='cd'.repeat(64);
const bits=n=>Uint8Array.from({length:n},(_,i)=>i%3===0?1:0);
const expected=(c,i,opening=c.opening(i))=>({expectedRoot:c.root,schemaDigest:c.schemaDigest,statementDigest:c.statementDigest,wireCount:c.wireCount,expectedBlockIndex:i,opening});
const plain=o=>({version:o.version,schemaDigest:o.schemaDigest,statementDigest:o.statementDigest,wireCount:o.wireCount,
  blockSize:o.blockSize,leafCount:o.leafCount,blockIndex:o.blockIndex,packed:Buffer.from(o.packed),salt:Buffer.from(o.salt),path:[...o.path]});

test('fresh salted roots bind the snapshot, block positions, schema and complete statement',()=>{
  const values=bits(2051),snapshot=values.slice(),c=commitPrivateWitness({values,schemaDigest,statementDigest});
  const other=commitPrivateWitness({values,schemaDigest,statementDigest});
  assert.notEqual(c.root,other.root);assert.equal(c.blockSize,1024);assert.equal(c.leafCount,3);
  values.fill(1);
  for(let i=0;i<c.leafCount;i++){
    const opening=c.opening(i);assert.equal(verifyPrivateWitnessOpening(expected(c,i,opening)),true);
    for(let j=0;j<Math.min(1024,snapshot.length-i*1024);j++)assert.equal((opening.packed[j>>3]>>(7-(j&7)))&1,snapshot[i*1024+j]);
    assert.equal(verifyPrivateWitnessOpening({...expected(c,i,opening),schemaDigest:'ef'.repeat(64)}),false);
    assert.equal(verifyPrivateWitnessOpening({...expected(c,i,opening),statementDigest:'ef'.repeat(64)}),false);
    assert.equal(verifyPrivateWitnessOpening({...expected(c,i,opening),wireCount:c.wireCount-1}),false);
  }
  assert.equal(c.private_proof,false);assert.equal(c.aegis_target_met,false);assert.equal(c.production_ready,false);
});

test('openings are copied and guarded; raw data, padding, salt, paths and requested-index substitution are rejected',()=>{
  const c=commitPrivateWitness({values:bits(2051),schemaDigest,statementDigest}),o=c.opening(2),original=plain(o);
  assert.throws(()=>JSON.stringify(c),/PRIVATE_WITNESS/);assert.throws(()=>JSON.stringify(o),/PRIVATE_WITNESS_OPENING/);
  assert.match(inspect(o),/PRIVATE witness opening/);assert.ok(!inspect(o).includes(o.salt.toString('hex')));
  assert.ok(!Object.keys(o).includes('salt'));assert.ok(!Object.keys(o).includes('packed'));assert.ok(!Object.keys(o).includes('path'));
  o.salt.fill(0);o.packed.fill(255);
  assert.equal(verifyPrivateWitnessOpening(expected(c,2,c.opening(2))),true);
  for(const change of [
    p=>p.packed[0]^=128,p=>p.packed[0]|=1,p=>p.packed[127]=1,p=>p.salt[0]^=1,
    p=>p.path.pop(),p=>p.path[0]='00'.repeat(64),p=>p.path.push(c.root),
    p=>p.blockIndex=1,p=>p.blockSize=512,p=>p.leafCount=4,p=>p.extra=true,
    p=>p.path[0]=p.path[0].toUpperCase(),p=>p.salt=p.salt.subarray(1),
  ]){const p=plain(original);change(p);assert.equal(verifyPrivateWitnessOpening(expected(c,2,p)),false);}
  assert.equal(verifyPrivateWitnessOpening({...expected(c,2,original),expectedBlockIndex:1}),false);
  assert.equal(verifyPrivateWitnessOpening({...expected(c,2,original),expectedBlockIndex:undefined}),false);
});

test('one block, exact block boundaries, maximum vector bound and malformed inputs fail closed',()=>{
  for(const n of [1,1024,1025,MAX_COMMITTED_WIRES]){
    const c=commitPrivateWitness({values:bits(n),schemaDigest,statementDigest});
    for(const i of new Set([0,c.leafCount-1]))assert.equal(verifyPrivateWitnessOpening(expected(c,i)),true);
  }
  for(const input of [null,{}, {values:bits(1),schemaDigest,statementDigest,blockSize:512},
    {values:Buffer.alloc(0),schemaDigest,statementDigest}, {values:new Uint8Array([2]),schemaDigest,statementDigest},
    {values:bits(1),schemaDigest:'ab'.repeat(32),statementDigest},
    {values:bits(1),schemaDigest:schemaDigest.toUpperCase(),statementDigest},
    {values:new Uint8Array(MAX_COMMITTED_WIRES+1),schemaDigest,statementDigest}])assert.throws(()=>commitPrivateWitness(input));
  assert.equal(WITNESS_BLOCK_BITS,1024);assert.equal(verifyPrivateWitnessOpening(null),false);
});
