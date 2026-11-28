import test from 'node:test';
import assert from 'node:assert/strict';
import {
  leafSha512,nodeSha512,verifyBinaryMerkleCapOpening,
  extractCappedMerklePositionCollision
} from './merkle-position-binding.mjs';
const weakLeaf=msg=>Buffer.from([(msg[0]+msg[1])&255]);
const weakNode=msg=>Buffer.from([(msg[0]+msg[1])&255]);
const fill=(value,size)=>Buffer.alloc(size,value);
const toyParams=({leaf=Buffer.from([1,2]),sibling=Buffer.from([5]),
  leafHash=weakLeaf,nodeHash=weakNode}={})=>{
  const root=nodeHash(Buffer.concat([leafHash(leaf),sibling]));
  const cap=Array.from({length:8},(_,i)=>i===0?root:fill(0,1));
  return {cap,index:0,leaf,siblings:[sibling],logLeaves:4,
    capHeight:3,leafLength:2,digestLength:1,leafHash,nodeHash};
};
test('honest SHA512 salted leaf and Merkle cap validates; changing salt fails',()=>{
  const salted=Buffer.from([7,1,42,19]); // fixed size leaf with salt suffix
  const sibling=Buffer.alloc(64,0x23);
  const root=nodeSha512(Buffer.concat([leafSha512(salted),sibling]));
  const cap=Array.from({length:8},(_,i)=>
    i===0?root:Buffer.alloc(64,i));
  const params={cap,index:0,leaf:salted,siblings:[sibling],
    logLeaves:4,capHeight:3,leafLength:4,digestLength:64};
  assert.equal(verifyBinaryMerkleCapOpening(params).accepted,true);
  assert.equal(verifyBinaryMerkleCapOpening({...params,
    leaf:Buffer.from([7,1,42,20])}).accepted,false);
  assert.equal(verifyBinaryMerkleCapOpening({...params,
    leaf:Buffer.from([8,1,42,19])}).accepted,false);
});
test('two conflicting accepted leaves yield a concrete leaf-hash collision',()=>{
  const a=toyParams(),b=toyParams({leaf:Buffer.from([2,1])});
  assert.equal(verifyBinaryMerkleCapOpening(a).accepted,true);
  assert.equal(verifyBinaryMerkleCapOpening(b).accepted,true);
  const collision=extractCappedMerklePositionCollision(a,b);
  assert.equal(collision.collision_found,true);
  assert.equal(collision.type,'leaf');
  assert.notDeepEqual(collision.input_a,collision.input_b);
  assert.deepEqual(weakLeaf(collision.input_a),collision.output);
  assert.deepEqual(weakLeaf(collision.input_b),collision.output);
  assert.equal(collision.quantum_collapse_binding_proved,false);
});
test('different authenticated leaves and siblings force an internal-node collision',()=>{
  const a=toyParams();
  const b=toyParams({leaf:Buffer.from([4,2]),sibling:Buffer.from([2])});
  assert.equal(verifyBinaryMerkleCapOpening(b).accepted,true);
  const collision=extractCappedMerklePositionCollision(a,b);
  assert.equal(collision.type,'node');
  assert.notDeepEqual(collision.input_a,collision.input_b);
  assert.deepEqual(weakNode(collision.input_a),collision.output);
  assert.deepEqual(weakNode(collision.input_b),collision.output);
});
test('different caps, changed leaf height or rejected openings cannot be extracted',()=>{
  const a=toyParams();
  const differentRoot=toyParams({leaf:Buffer.from([4,2])});
  assert.throws(()=>extractCappedMerklePositionCollision(a,differentRoot),
    /NOT_SAME_FIXED_COMMITMENT/);
  const invalid={...a,leaf:Buffer.from([4,2])}; // forged row under A's fixed cap
  assert.throws(()=>extractCappedMerklePositionCollision(a,invalid),
    /OPENING_NOT_ACCEPTED/);
  assert.throws(()=>extractCappedMerklePositionCollision(a,{
    ...a,leafLength:3,leaf:Buffer.from([1,2,3])}),
    /NOT_SAME_FIXED_COMMITMENT/);
});
test('binding reduction fails closed on malformed salt widths and indices',()=>{
  const a=toyParams();
  assert.throws(()=>verifyBinaryMerkleCapOpening({...a,leafLength:1}),
    /INVALID_SHAPE/);
  assert.throws(()=>verifyBinaryMerkleCapOpening({...a,index:16}),
    /INVALID_SHAPE/);
  assert.throws(()=>verifyBinaryMerkleCapOpening({...a,siblings:[]}),
    /INVALID_SHAPE/);
});
test('exhaustive weak-hash leaf equivocation illustrates reduction, not SHA512 breaks',()=>{
  const a=toyParams();
  let equivalent=0;
  for(let x=0;x<64;x++)for(let y=0;y<64;y++){
    const b=toyParams({leaf:Buffer.from([x,y])});
    if(b.cap[0].equals(a.cap[0])&&!b.leaf.equals(a.leaf)){
      const out=extractCappedMerklePositionCollision(a,b);
      assert.equal(out.collision_found,true);
      equivalent++;
    }
  }
  assert.ok(equivalent>1);
});
